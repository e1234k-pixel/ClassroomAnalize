"""Sync router - sync data from Google Classroom API to local database."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from ..database import get_db
from ..database.models import Course, Student, Assignment, Submission
from ..services.google_auth import get_classroom_service

router = APIRouter()


@router.post("/courses")
async def sync_courses(db: AsyncSession = Depends(get_db)):
    """Sync courses from Google Classroom."""
    service = get_classroom_service()
    if service is None or isinstance(service, dict):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Fetch courses from Google Classroom
    results = service.courses().list(pageSize=100).execute()
    courses = results.get("courses", [])
    
    synced = []
    for c in courses:
        google_id = c["id"]
        # Check if course exists
        result = await db.execute(select(Course).where(Course.google_id == google_id))
        course = result.scalar_one_or_none()
        
        if course:
            course.name = c.get("name", course.name)
            course.section = c.get("section", course.section)
            course.description = c.get("descriptionHeading", course.description)
            course.owner = c.get("ownerId", course.owner)
        else:
            course = Course(
                google_id=google_id,
                name=c.get("name", ""),
                section=c.get("section", ""),
                description=c.get("descriptionHeading", ""),
                owner=c.get("ownerId", ""),
            )
            db.add(course)
        
        synced.append({"id": google_id, "name": c.get("name", "")})
    
    await db.commit()
    return {"synced": len(synced), "courses": synced}


@router.post("/students/{course_id}")
async def sync_students(course_id: int, db: AsyncSession = Depends(get_db)):
    """Sync students for a course."""
    service = get_classroom_service()
    if service is None or isinstance(service, dict):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get course from DB
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Fetch students from Google Classroom
    results = service.courses().students().list(courseId=course.google_id).execute()
    students = results.get("students", [])
    
    synced = []
    for s in students:
        google_id = s["profile"]["id"]
        result = await db.execute(
            select(Student).where(
                Student.google_id == google_id,
                Student.course_id == course_id,
            )
        )
        student = result.scalar_one_or_none()
        
        if student:
            student.name = s["profile"].get("name", {}).get("fullName", student.name)
            student.email = s["profile"].get("emailAddress", student.email)
        else:
            student = Student(
                course_id=course_id,
                google_id=google_id,
                name=s["profile"].get("name", {}).get("fullName", ""),
                email=s["profile"].get("emailAddress", ""),
            )
            db.add(student)
        
        synced.append({"id": google_id, "name": s["profile"].get("name", {}).get("fullName", "")})
    
    await db.commit()
    return {"synced": len(synced), "students": synced}


@router.post("/assignments/{course_id}")
async def sync_assignments(course_id: int, db: AsyncSession = Depends(get_db)):
    """Sync assignments for a course."""
    service = get_classroom_service()
    if service is None or isinstance(service, dict):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Fetch coursework from Google Classroom
    results = service.courses().courseWork().list(courseId=course.google_id).execute()
    coursework = results.get("courseWork", [])
    
    synced = []
    for cw in coursework:
        google_id = cw["id"]
        result = await db.execute(select(Assignment).where(Assignment.google_id == google_id))
        assignment = result.scalar_one_or_none()
        
        if assignment:
            assignment.title = cw.get("title", assignment.title)
            assignment.description = cw.get("description", assignment.description)
            assignment.max_points = cw.get("maxPoints", assignment.max_points)
            assignment.state = cw.get("state", assignment.state)
            assignment.work_type = cw.get("workType", assignment.work_type)
        else:
            assignment = Assignment(
                course_id=course_id,
                google_id=google_id,
                title=cw.get("title", ""),
                description=cw.get("description", ""),
                max_points=cw.get("maxPoints", 100),
                state=cw.get("state", "PUBLISHED"),
                work_type=cw.get("workType", "ASSIGNMENT"),
            )
            db.add(assignment)
        
        synced.append({"id": google_id, "title": cw.get("title", "")})
    
    await db.commit()
    return {"synced": len(synced), "assignments": synced}


@router.post("/submissions/{course_id}/{assignment_id}")
async def sync_submissions(course_id: int, assignment_id: int, db: AsyncSession = Depends(get_db)):
    """Sync submissions for an assignment."""
    service = get_classroom_service()
    if service is None or isinstance(service, dict):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get course and assignment from DB
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    # Fetch submissions from Google Classroom
    results = service.courses().courseWork().studentSubmissions().list(
        courseId=course.google_id,
        courseWorkId=assignment.google_id,
    ).execute()
    submissions = results.get("studentSubmissions", [])
    
    synced = []
    for sub in submissions:
        google_id = sub["id"]
        student_google_id = sub.get("userId", "")
        
        # Find student in DB
        student_result = await db.execute(
            select(Student).where(
                Student.google_id == student_google_id,
                Student.course_id == course_id,
            )
        )
        student = student_result.scalar_one_or_none()
        if not student:
            continue
        
        result = await db.execute(
            select(Submission).where(Submission.google_id == google_id)
        )
        submission = result.scalar_one_or_none()
        
        # Extract grade info
        draft_grade = sub.get("draftGrade")
        assigned_grade = sub.get("assignedGrade")
        state = sub.get("state", "CREATED")
        late = sub.get("late", False)
        
        if submission:
            submission.state = state
            submission.late = late
            submission.draft_grade = draft_grade
            submission.assigned_grade = assigned_grade
        else:
            submission = Submission(
                assignment_id=assignment_id,
                student_id=student.id,
                google_id=google_id,
                state=state,
                late=late,
                draft_grade=draft_grade,
                assigned_grade=assigned_grade,
            )
            db.add(submission)
        
        synced.append({
            "student": student.name,
            "state": state,
            "late": late,
            "grade": assigned_grade,
        })
    
    await db.commit()
    return {"synced": len(synced), "submissions": synced}


@router.get("/status/{course_id}")
async def sync_status(course_id: int, db: AsyncSession = Depends(get_db)):
    """Get sync status for a course."""
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    students_count = await db.execute(
        select(Student).where(Student.course_id == course_id)
    )
    assignments_count = await db.execute(
        select(Assignment).where(Assignment.course_id == course_id)
    )
    
    return {
        "course": course.name,
        "students": len(students_count.scalars().all()),
        "assignments": len(assignments_count.scalars().all()),
    }

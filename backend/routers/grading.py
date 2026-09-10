"""Grading and feedback router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..database import get_db
from ..database.models import Submission, Assignment, Student, QuickSnippet

router = APIRouter()


@router.get("/snippets")
async def list_snippets(db: AsyncSession = Depends(get_db)):
    """Get all quick feedback snippets."""
    result = await db.execute(select(QuickSnippet).order_by(QuickSnippet.category))
    snippets = result.scalars().all()
    return [
        {
            "id": s.id,
            "category": s.category,
            "text": s.text,
            "usage_count": s.usage_count,
        }
        for s in snippets
    ]


@router.post("/snippets/{snippet_id}/use")
async def use_snippet(snippet_id: int, db: AsyncSession = Depends(get_db)):
    """Mark snippet as used."""
    result = await db.execute(select(QuickSnippet).where(QuickSnippet.id == snippet_id))
    snippet = result.scalar_one_or_none()
    if not snippet:
        raise HTTPException(status_code=404, detail="Snippet not found")
    snippet.usage_count += 1
    await db.commit()
    return {"text": snippet.text}


@router.get("/pending")
async def get_pending_summary(course_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """Get pending submissions summary for heatmap."""
    query = (
        select(Student, Assignment, Submission)
        .join(Submission, Student.id == Submission.student_id)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Submission.state == "CREATED")
    )
    if course_id:
        query = query.where(Student.course_id == course_id)
    
    result = await db.execute(query)
    rows = result.all()
    
    pending_by_student = {}
    for student, assignment, submission in rows:
        if student.id not in pending_by_student:
            pending_by_student[student.id] = {
                "name": student.name,
                "email": student.email,
                "pending": [],
                "total_pending": 0,
            }
        pending_by_student[student.id]["pending"].append({
            "assignment": assignment.title,
            "due_date": assignment.due_date,
            "max_points": assignment.max_points,
            "late": submission.late,
        })
        pending_by_student[student.id]["total_pending"] += 1
    
    return list(pending_by_student.values())


@router.get("/classroom-heatmap")
async def get_classroom_heatmap(course_id: int, db: AsyncSession = Depends(get_db)):
    """Get classroom risk heatmap data."""
    result = await db.execute(
        select(Student).where(Student.course_id == course_id)
    )
    students = result.scalars().all()
    
    heatmap = []
    for student in students:
        risk = "green"
        if student.pending_count >= 3:
            risk = "red"
        elif student.pending_count >= 1:
            risk = "yellow"
        
        # Calculate grade percentage
        grade_pct = 0.0
        if student.total_points_possible > 0:
            grade_pct = (student.total_points_earned / student.total_points_possible) * 100
        
        heatmap.append({
            "id": student.id,
            "name": student.name,
            "pending_count": student.pending_count,
            "risk": risk,
            "grade_pct": round(grade_pct, 1),
            "current_grade": student.current_grade,
        })
    
    return heatmap


@router.get("/gradebook")
async def get_gradebook(course_id: int, db: AsyncSession = Depends(get_db)):
    """Get gradebook data for a course."""
    # Get all students in course
    students_result = await db.execute(
        select(Student).where(Student.course_id == course_id)
    )
    students = students_result.scalars().all()
    
    # Get all assignments for course
    assignments_result = await db.execute(
        select(Assignment).where(Assignment.course_id == course_id)
    )
    assignments = assignments_result.scalars().all()
    
    gradebook = []
    for student in students:
        student_row = {
            "student_id": student.id,
            "name": student.name,
            "assignments": {},
            "total_earned": student.total_points_earned,
            "total_possible": student.total_points_possible,
            "current_grade": student.current_grade,
        }
        
        for assignment in assignments:
            sub_result = await db.execute(
                select(Submission).where(
                    Submission.student_id == student.id,
                    Submission.assignment_id == assignment.id,
                )
            )
            submission = sub_result.scalar_one_or_none()
            student_row["assignments"][assignment.id] = {
                "grade": submission.assigned_grade if submission else None,
                "draft_grade": submission.draft_grade if submission else None,
                "state": submission.state if submission else "MISSING",
                "late": submission.late if submission else False,
            }
        
        gradebook.append(student_row)
    
    return {
        "assignments": [
            {"id": a.id, "title": a.title, "max_points": a.max_points}
            for a in assignments
        ],
        "students": gradebook,
    }

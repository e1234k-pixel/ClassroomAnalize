"""Students router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..database import get_db
from ..database.models import Student, Submission, Assignment

router = APIRouter()


@router.get("/")
async def list_students(course_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    query = select(Student)
    if course_id:
        query = query.where(Student.course_id == course_id)
    result = await db.execute(query)
    students = result.scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "total_points_earned": s.total_points_earned,
            "total_points_possible": s.total_points_possible,
            "current_grade": s.current_grade,
            "pending_count": s.pending_count,
        }
        for s in students
    ]


@router.get("/{student_id}")
async def get_student(student_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get submissions with assignment info
    sub_result = await db.execute(
        select(Submission, Assignment)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Submission.student_id == student_id)
    )
    submissions = sub_result.all()
    
    return {
        "id": student.id,
        "name": student.name,
        "email": student.email,
        "total_points_earned": student.total_points_earned,
        "total_points_possible": student.total_points_possible,
        "current_grade": student.current_grade,
        "pending_count": student.pending_count,
        "submissions": [
            {
                "assignment_title": a.title,
                "state": s.state,
                "late": s.late,
                "draft_grade": s.draft_grade,
                "assigned_grade": s.assigned_grade,
                "max_points": a.max_points,
                "feedback": s.feedback,
            }
            for s, a in submissions
        ],
    }


@router.get("/{student_id}/slip")
async def get_student_slip(student_id: int, db: AsyncSession = Depends(get_db)):
    """Generate a student slip with pending work summary."""
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get pending submissions
    pending_result = await db.execute(
        select(Submission, Assignment)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Submission.student_id == student_id)
        .where(Submission.state.in_(["CREATED", "TURNED_IN"]))
    )
    pending = pending_result.all()
    
    # Get graded submissions for grade calculation
    graded_result = await db.execute(
        select(Submission, Assignment)
        .join(Assignment, Submission.assignment_id == Assignment.id)
        .where(Submission.student_id == student_id)
        .where(Submission.assigned_grade.isnot(None))
    )
    graded = graded_result.all()
    
    total_earned = sum(s.assigned_grade for s, a in graded if s.assigned_grade)
    total_possible = sum(a.max_points for s, a in graded)
    
    slip_text = (
        f"น้อง{student.name} | "
        f"งานค้าง {len(pending)} ชิ้น | "
        f"คะแนนเก็บปัจจุบัน {total_earned:.0f}/{total_possible:.0f}"
    )
    
    pending_details = [
        {
            "title": a.title,
            "due_date": a.due_date,
            "max_points": a.max_points,
            "state": s.state,
            "late": s.late,
        }
        for s, a in pending
    ]
    
    return {
        "student": {"id": student.id, "name": student.name},
        "slip_text": slip_text,
        "total_earned": total_earned,
        "total_possible": total_possible,
        "pending": pending_details,
        "graded_count": len(graded),
    }

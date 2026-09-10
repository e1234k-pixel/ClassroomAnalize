"""Assignments router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from ..database import get_db
from ..database.models import Assignment, Submission

router = APIRouter()


@router.get("/")
async def list_assignments(course_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    query = select(Assignment)
    if course_id:
        query = query.where(Assignment.course_id == course_id)
    result = await db.execute(query)
    assignments = result.scalars().all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "max_points": a.max_points,
            "due_date": a.due_date,
            "state": a.state,
            "course_id": a.course_id,
        }
        for a in assignments
    ]


@router.get("/{assignment_id}/submissions")
async def get_submissions(assignment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Submission).where(Submission.assignment_id == assignment_id)
    )
    submissions = result.scalars().all()
    return [
        {
            "id": s.id,
            "student_id": s.student_id,
            "state": s.state,
            "late": s.late,
            "draft_grade": s.draft_grade,
            "assigned_grade": s.assigned_grade,
            "attachment_link": s.attachment_link,
            "feedback": s.feedback,
        }
        for s in submissions
    ]

"""Courses router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from ..database import get_db
from ..database.models import Course

router = APIRouter()


@router.get("/")
async def list_courses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course))
    courses = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "section": c.section,
            "owner": c.owner,
        }
        for c in courses
    ]


@router.get("/{course_id}")
async def get_course(course_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Course).where(Course.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        "id": course.id,
        "name": course.name,
        "section": course.section,
        "students": len(course.students),
        "assignments": len(course.assignments),
    }

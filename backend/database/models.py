"""Database models for Classroom Hub."""
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, unique=True, index=True)
    name = Column(String)
    section = Column(String, default="")
    description = Column(Text, default="")
    owner = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignments = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="course", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    google_id = Column(String, index=True)
    name = Column(String)
    email = Column(String, default="")
    profile_photo = Column(String, default="")
    total_points_earned = Column(Float, default=0.0)
    total_points_possible = Column(Float, default=0.0)
    current_grade = Column(String, default="-")
    pending_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course = relationship("Course", back_populates="students")
    submissions = relationship("Submission", back_populates="student", cascade="all, delete-orphan")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    google_id = Column(String, unique=True, index=True)
    title = Column(String)
    description = Column(Text, default="")
    max_points = Column(Float, default=100.0)
    due_date = Column(String, default="")
    assigned_date = Column(String, default="")
    state = Column(String, default="PUBLISHED")
    work_type = Column(String, default="ASSIGNMENT")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    course = relationship("Course", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    student_id = Column(Integer, ForeignKey("students.id"))
    google_id = Column(String, unique=True, index=True)
    state = Column(String, default="CREATED")
    late = Column(Boolean, default=False)
    draft_grade = Column(Float, nullable=True)
    assigned_grade = Column(Float, nullable=True)
    assignment_state = Column(String, default="")
    attachment_type = Column(String, default="")
    attachment_link = Column(String, default="")
    feedback = Column(Text, default="")
    submitted_date = Column(String, default="")
    returned_date = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("Student", back_populates="submissions")


class GradingRubric(Base):
    __tablename__ = "grading_rubrics"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    name = Column(String)
    max_points = Column(Float)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class QuickSnippet(Base):
    __tablename__ = "quick_snippets"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, default="general")
    text = Column(Text)
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

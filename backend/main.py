"""Main FastAPI application."""
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from pathlib import Path
import os

from .database import init_db, close_db

app = FastAPI(title="Classroom Insights & Grader Hub", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files and templates
BASE_DIR = Path(__file__).resolve().parent.parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "frontend")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "frontend"))


@app.on_event("startup")
async def startup():
    database_url = os.getenv("DATABASE_URL", "sqlite:///./classroom-hub.db")
    await init_db(database_url)


@app.on_event("shutdown")
async def shutdown():
    await close_db()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Include routers
from .routers import courses, assignments, students, grading, auth, sync
app.include_router(auth.router, prefix="", tags=["auth"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(courses.router, prefix="/api/courses", tags=["courses"])
app.include_router(assignments.router, prefix="/api/assignments", tags=["assignments"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(grading.router, prefix="/api/grading", tags=["grading"])

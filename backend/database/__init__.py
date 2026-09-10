"""Database connection and session management."""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from .models import Base

engine = None
async_session = None


async def init_db(database_url: str):
    """Initialize database engine and create tables."""
    global engine, async_session
    # Convert sqlite:/// to sqlite+aiosqlite:///
    if database_url.startswith("sqlite:///"):
        database_url = database_url.replace("sqlite:///", "sqlite+aiosqlite:///")
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Get database session."""
    async with async_session() as session:
        yield session


async def close_db():
    """Close database engine."""
    if engine:
        await engine.dispose()

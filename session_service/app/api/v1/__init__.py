from fastapi import APIRouter

from app.api.v1.sessions import router as sessions_router
from app.api.v1.ratings import router as ratings_router

api_router = APIRouter()
api_router.include_router(sessions_router, prefix="/sessions", tags=["sessions"])
api_router.include_router(ratings_router, prefix="/sessions", tags=["ratings"])

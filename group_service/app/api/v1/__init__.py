from fastapi import APIRouter

from app.api.v1.group import router as groups_router
from app.api.v1.member import router as members_router
from app.api.v1.member import user_router
from app.api.v1.internal import router as internal_router

api_router = APIRouter()
api_router.include_router(groups_router, prefix="/groups", tags=["groups"])
api_router.include_router(members_router, prefix="/groups", tags=["members"])
api_router.include_router(user_router, prefix="/users", tags=["users"])
api_router.include_router(internal_router, prefix="/internal", tags=["internal"])

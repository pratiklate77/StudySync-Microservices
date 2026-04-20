from uuid import UUID

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user_id, get_kafka_producer
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.schemas.group import GroupRead
from app.schemas.member import KickRequest, MemberRead, PromoteDemoteRequest
from app.services.member_service import MemberService

router = APIRouter()
user_router = APIRouter()


def get_member_service(db: AsyncSession = Depends(get_db)) -> MemberService:
    return MemberService(db)


@router.post("/{group_id}/join", response_model=MemberRead)
async def join_group(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
    producer: AIOKafkaProducer = Depends(get_kafka_producer),
    settings: Settings = Depends(get_settings),
) -> MemberRead:
    return await service.join_group(group_id, user_id, producer=producer, settings=settings)


@router.post("/{group_id}/leave", status_code=204)
async def leave_group(
    group_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
    producer: AIOKafkaProducer = Depends(get_kafka_producer),
    settings: Settings = Depends(get_settings),
) -> None:
    await service.leave_group(group_id, user_id, producer=producer, settings=settings)


@router.get("/{group_id}/members", response_model=list[MemberRead])
async def list_members(
    group_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
) -> list[MemberRead]:
    return await service.list_members(group_id, limit=limit, offset=offset)


@router.post("/{group_id}/kick", status_code=204)
async def kick_member(
    group_id: UUID,
    payload: KickRequest,
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
) -> None:
    await service.kick_member(group_id, requester_id=user_id, target_user_id=payload.user_id)


@router.post("/{group_id}/promote", response_model=MemberRead)
async def promote_member(
    group_id: UUID,
    payload: PromoteDemoteRequest,
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
) -> MemberRead:
    return await service.promote_member(group_id, requester_id=user_id, target_user_id=payload.user_id)


@router.post("/{group_id}/demote", response_model=MemberRead)
async def demote_member(
    group_id: UUID,
    payload: PromoteDemoteRequest,
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
) -> MemberRead:
    return await service.demote_member(group_id, requester_id=user_id, target_user_id=payload.user_id)


# ── User-scoped endpoint ──────────────────────────────────────────────────────

@user_router.get("/me/groups", response_model=list[GroupRead])
async def my_groups(
    user_id: UUID = Depends(get_current_user_id),
    service: MemberService = Depends(get_member_service),
    db: AsyncSession = Depends(get_db),
) -> list[GroupRead]:
    from app.services.group_service import GroupService
    return await GroupService(db).list_my_groups(user_id)

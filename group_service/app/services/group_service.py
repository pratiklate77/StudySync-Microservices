from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.events.events import group_created_payload, group_deleted_payload
from app.events.kafka_producer import publish_event
from app.kafka.producer import ResilientKafkaProducer
from app.models.group import Group
from app.models.group_member import GroupMember, MemberRole
from app.repositories.group_repository import GroupRepository
from app.repositories.member_repository import MemberRepository
from app.schemas.group import GroupCreate, GroupRead, GroupUpdate
from app.utils.permissions import require_active_group, require_owner


def _to_read(group: Group, member_count: int) -> GroupRead:
    return GroupRead(
        id=group.id,
        name=group.name,
        description=group.description,
        owner_id=group.owner_id,
        is_private=group.is_private,
        max_members=group.max_members,
        is_active=group.is_active,
        chat_enabled=group.chat_enabled,
        member_count=member_count,
        created_at=group.created_at,
    )


class GroupService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._groups = GroupRepository(session)
        self._members = MemberRepository(session)

    async def create_group(
        self, owner_id: UUID, data: GroupCreate, producer: ResilientKafkaProducer, settings: Settings
    ) -> GroupRead:
        group = Group(
            name=data.name,
            description=data.description,
            owner_id=owner_id,
            is_private=data.is_private,
            max_members=data.max_members,
            chat_enabled=data.chat_enabled,
        )
        group = await self._groups.create(group)

        # Owner is automatically the first admin member
        owner_member = GroupMember(group_id=group.id, user_id=owner_id, role=MemberRole.admin)
        await self._members.add(owner_member)
        await self._session.commit()
        await self._session.refresh(group)

        await publish_event(
            producer, settings,
            payload=group_created_payload(group.id, owner_id, group.name),
            key=str(group.id),
        )
        return _to_read(group, member_count=1)

    async def get_group(self, group_id: UUID) -> GroupRead:
        group = require_active_group(await self._groups.get_by_id(group_id))
        count = await self._groups.member_count(group_id)
        return _to_read(group, count)

    async def list_groups(self, limit: int, offset: int, search: str | None) -> list[GroupRead]:
        groups = await self._groups.list_active(limit=limit, offset=offset, search=search)
        result = []
        for g in groups:
            count = await self._groups.member_count(g.id)
            result.append(_to_read(g, count))
        return result

    async def update_group(self, group_id: UUID, requester_id: UUID, data: GroupUpdate) -> GroupRead:
        group = require_active_group(await self._groups.get_by_id(group_id))
        require_owner(group, requester_id)
        fields = data.model_dump(exclude_none=True)
        if fields:
            group = await self._groups.update(group, fields)
        await self._session.commit()
        count = await self._groups.member_count(group_id)
        return _to_read(group, count)

    async def delete_group(
        self, group_id: UUID, requester_id: UUID, producer: ResilientKafkaProducer, settings: Settings
    ) -> None:
        group = require_active_group(await self._groups.get_by_id(group_id))
        require_owner(group, requester_id)
        await self._groups.soft_delete(group)
        await self._session.commit()
        await publish_event(
            producer, settings,
            payload=group_deleted_payload(group_id, requester_id),
            key=str(group_id),
        )

    async def list_my_groups(self, user_id: UUID) -> list[GroupRead]:
        memberships = await self._members.list_by_user(user_id)
        result = []
        for m in memberships:
            group = await self._groups.get_by_id(m.group_id)
            if group:
                count = await self._groups.member_count(group.id)
                result.append(_to_read(group, count))
        return result

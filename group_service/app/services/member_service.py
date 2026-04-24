from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.events.events import user_joined_payload, user_left_payload
from app.events.kafka_producer import publish_event
from app.kafka.producer import ResilientKafkaProducer
from app.models.group_member import GroupMember, MemberRole
from app.repositories.group_repository import GroupRepository
from app.repositories.member_repository import MemberRepository
from app.schemas.member import MemberRead, MembershipCheck, PermissionsCheck
from app.utils.permissions import (
    require_active_group,
    require_admin_or_owner,
    require_member,
    require_not_owner,
)


class MemberService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._groups = GroupRepository(session)
        self._members = MemberRepository(session)

    async def join_group(
        self, group_id: UUID, user_id: UUID, producer: ResilientKafkaProducer, settings: Settings
    ) -> MemberRead:
        group = require_active_group(await self._groups.get_by_id(group_id))

        if group.is_private:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="This group requires an invitation to join")

        existing = await self._members.get(group_id, user_id)
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Already a member of this group")

        count = await self._groups.member_count(group_id)
        if count >= group.max_members:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Group has reached maximum capacity")

        member = GroupMember(group_id=group_id, user_id=user_id, role=MemberRole.member)
        created = await self._members.add(member)
        if created is None:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Already a member of this group")

        await self._session.commit()
        await self._session.refresh(created)

        await publish_event(
            producer, settings,
            payload=user_joined_payload(group_id, user_id, MemberRole.member.value),
            key=str(group_id),
        )
        return MemberRead.model_validate(created)

    async def leave_group(
        self, group_id: UUID, user_id: UUID, producer: ResilientKafkaProducer, settings: Settings
    ) -> None:
        group = require_active_group(await self._groups.get_by_id(group_id))
        require_not_owner(group, user_id)

        member = require_member(await self._members.get(group_id, user_id))
        await self._members.remove(member)
        await self._session.commit()

        await publish_event(
            producer, settings,
            payload=user_left_payload(group_id, user_id),
            key=str(group_id),
        )

    async def list_members(self, group_id: UUID, limit: int, offset: int) -> list[MemberRead]:
        require_active_group(await self._groups.get_by_id(group_id))
        members = await self._members.list_by_group(group_id, limit=limit, offset=offset)
        return [MemberRead.model_validate(m) for m in members]

    async def kick_member(
        self, group_id: UUID, requester_id: UUID, target_user_id: UUID
    ) -> None:
        group = require_active_group(await self._groups.get_by_id(group_id))
        requester_member = await self._members.get(group_id, requester_id)
        require_admin_or_owner(group, requester_member, requester_id)

        if target_user_id == group.owner_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot kick the group owner")

        target = require_member(await self._members.get(group_id, target_user_id))
        await self._members.remove(target)
        await self._session.commit()

    async def promote_member(self, group_id: UUID, requester_id: UUID, target_user_id: UUID) -> MemberRead:
        group = require_active_group(await self._groups.get_by_id(group_id))
        requester_member = await self._members.get(group_id, requester_id)
        require_admin_or_owner(group, requester_member, requester_id)

        target = require_member(await self._members.get(group_id, target_user_id))
        if target.role == MemberRole.admin:
            return MemberRead.model_validate(target)  # idempotent

        updated = await self._members.set_role(target, MemberRole.admin)
        await self._session.commit()
        return MemberRead.model_validate(updated)

    async def demote_member(self, group_id: UUID, requester_id: UUID, target_user_id: UUID) -> MemberRead:
        group = require_active_group(await self._groups.get_by_id(group_id))

        # Only owner can demote admins
        if group.owner_id != requester_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the owner can demote admins")

        if target_user_id == group.owner_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot demote the group owner")

        target = require_member(await self._members.get(group_id, target_user_id))
        if target.role == MemberRole.member:
            return MemberRead.model_validate(target)  # idempotent

        updated = await self._members.set_role(target, MemberRole.member)
        await self._session.commit()
        return MemberRead.model_validate(updated)

    async def check_membership(self, group_id: UUID, user_id: UUID) -> MembershipCheck:
        member = await self._members.get(group_id, user_id)
        if member is None:
            return MembershipCheck(is_member=False)
        return MembershipCheck(is_member=True, role=member.role)

    async def check_permissions(self, group_id: UUID, user_id: UUID) -> PermissionsCheck:
        group = await self._groups.get_by_id(group_id)
        if group is None or not group.is_active:
            return PermissionsCheck(can_send_message=False)

        member = await self._members.get(group_id, user_id)
        if member is None:
            return PermissionsCheck(can_send_message=False)

        can_send = group.chat_enabled
        return PermissionsCheck(can_send_message=can_send, role=member.role)

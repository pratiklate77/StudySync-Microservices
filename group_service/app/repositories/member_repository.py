from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group_member import GroupMember, MemberRole


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, member: GroupMember) -> GroupMember | None:
        """Returns None on duplicate (unique constraint violation)."""
        try:
            self._session.add(member)
            await self._session.flush()
            await self._session.refresh(member)
            return member
        except IntegrityError:
            await self._session.rollback()
            return None

    async def get(self, group_id: UUID, user_id: UUID) -> GroupMember | None:
        result = await self._session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_group(self, group_id: UUID, limit: int = 100, offset: int = 0) -> list[GroupMember]:
        result = await self._session.execute(
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .order_by(GroupMember.joined_at.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_user(self, user_id: UUID) -> list[GroupMember]:
        result = await self._session.execute(
            select(GroupMember).where(GroupMember.user_id == user_id)
        )
        return list(result.scalars().all())

    async def remove(self, member: GroupMember) -> None:
        await self._session.delete(member)
        await self._session.flush()

    async def set_role(self, member: GroupMember, role: MemberRole) -> GroupMember:
        member.role = role
        await self._session.flush()
        await self._session.refresh(member)
        return member

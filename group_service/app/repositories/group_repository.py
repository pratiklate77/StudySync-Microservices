from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.group import Group
from app.models.group_member import GroupMember


class GroupRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, group: Group) -> Group:
        self._session.add(group)
        await self._session.flush()
        await self._session.refresh(group)
        return group

    async def get_by_id(self, group_id: UUID) -> Group | None:
        result = await self._session.execute(
            select(Group).where(Group.id == group_id, Group.is_active.is_(True))
        )
        return result.scalar_one_or_none()

    async def list_active(
        self,
        limit: int = 20,
        offset: int = 0,
        search: str | None = None,
    ) -> list[Group]:
        stmt = select(Group).where(Group.is_active.is_(True))
        if search:
            stmt = stmt.where(Group.name.ilike(f"%{search}%"))
        stmt = stmt.order_by(Group.created_at.desc()).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update(self, group: Group, fields: dict) -> Group:
        for key, value in fields.items():
            setattr(group, key, value)
        await self._session.flush()
        await self._session.refresh(group)
        return group

    async def soft_delete(self, group: Group) -> Group:
        group.is_active = False
        await self._session.flush()
        return group

    async def member_count(self, group_id: UUID) -> int:
        result = await self._session.execute(
            select(func.count()).where(GroupMember.group_id == group_id)
        )
        return result.scalar_one()

    async def list_by_owner(self, owner_id: UUID) -> list[Group]:
        result = await self._session.execute(
            select(Group)
            .where(Group.owner_id == owner_id, Group.is_active.is_(True))
            .order_by(Group.created_at.desc())
        )
        return list(result.scalars().all())

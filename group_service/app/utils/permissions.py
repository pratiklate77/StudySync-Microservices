from uuid import UUID

from fastapi import HTTPException, status

from app.models.group import Group
from app.models.group_member import GroupMember, MemberRole


def require_owner(group: Group, user_id: UUID) -> None:
    if group.owner_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only the group owner can perform this action")


def require_admin_or_owner(group: Group, member: GroupMember | None, user_id: UUID) -> None:
    if group.owner_id == user_id:
        return
    if member is None or member.role != MemberRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin or owner access required")


def require_member(member: GroupMember | None) -> GroupMember:
    if member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You are not a member of this group")
    return member


def require_not_owner(group: Group, user_id: UUID) -> None:
    if group.owner_id == user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="The group owner cannot perform this action")


def require_active_group(group: Group | None) -> Group:
    if group is None or not group.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Group not found")
    return group

from uuid import UUID


def group_created_payload(group_id: UUID, owner_id: UUID, name: str) -> dict:
    return {
        "event_type": "GROUP_CREATED",
        "group_id": str(group_id),
        "owner_id": str(owner_id),
        "name": name,
    }


def user_joined_payload(group_id: UUID, user_id: UUID, role: str) -> dict:
    return {
        "event_type": "USER_JOINED_GROUP",
        "group_id": str(group_id),
        "user_id": str(user_id),
        "role": role,
    }


def user_left_payload(group_id: UUID, user_id: UUID) -> dict:
    return {
        "event_type": "USER_LEFT_GROUP",
        "group_id": str(group_id),
        "user_id": str(user_id),
    }


def group_deleted_payload(group_id: UUID, owner_id: UUID) -> dict:
    return {
        "event_type": "GROUP_DELETED",
        "group_id": str(group_id),
        "owner_id": str(owner_id),
    }

import asyncio
import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models import Notification, User
from app.utils.helpers import to_json
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)


def _push_ws(user_id: int, event: str, data: dict) -> None:
    """Schedule the async WS push on the running event loop if one exists."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(ws_manager.send_to_user(user_id, event, data))
    except RuntimeError:
        pass


def notify(
    db: Session,
    user_id: int,
    title: str,
    message: str | None = None,
    ntype: str = "INFO",
    entity_type: str | None = None,
    entity_id: int | None = None,
    broadcast: bool = True,
) -> Notification | None:
    """Persist a notification and push it in real time to the target user."""
    try:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=ntype,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
    except Exception as exc:  # pragma: no cover - notifications must never break flows
        logger.error("Failed to persist notification: %s", exc)
        db.rollback()
        return None

    if broadcast:
        try:
            _push_ws(
                user_id,
                "notification_created",
                {
                    "id": notification.id,
                    "title": title,
                    "message": message,
                    "type": ntype,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "created_at": notification.created_at.isoformat(),
                },
            )
        except Exception as exc:  # pragma: no cover
            logger.error("Failed to broadcast notification: %s", exc)
    return notification


def notify_roles(
    db: Session,
    roles: list[str],
    title: str,
    message: str | None = None,
    ntype: str = "INFO",
    entity_type: str | None = None,
    entity_id: int | None = None,
    user_ids: list[int] | None = None,
) -> None:
    """Notify all users with one of the given roles (optionally restricted to specific user ids)."""
    query = db.query(User.id).filter(User.is_active.is_(True), User.role.in_(roles))
    if user_ids:
        query = query.filter(User.id.in_(user_ids))
    for (uid,) in query.all():
        notify(db, uid, title, message, ntype, entity_type, entity_id)


def notify_hospital_staff(
    db: Session,
    hospital_id: int,
    title: str,
    message: str | None = None,
    ntype: str = "INFO",
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> None:
    """Notify every staff member of a hospital."""
    from app.models import HospitalStaff

    staff = db.query(HospitalStaff).filter(HospitalStaff.hospital_id == hospital_id).all()
    for member in staff:
        notify(db, member.user_id, title, message, ntype, entity_type, entity_id)


def unread_count(db: Session, user_id: int) -> int:
    return db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read.is_(False)).count()
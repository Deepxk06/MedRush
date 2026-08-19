from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database import get_db
from app.models import Notification, User

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[dict], summary="My notifications (paginated)")
def my_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    items = (
        query.order_by(Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type,
            "entity_type": n.entity_type,
            "entity_id": n.entity_id,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in items
    ]


@router.get("/unread-count", response_model=dict, summary="Unread notification count")
def unread(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).count()
    return {"count": count}


@router.put("/{notification_id}/read", response_model=dict, summary="Mark a notification as read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Marked as read"}


@router.put("/read-all", response_model=dict, summary="Mark all notifications as read")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
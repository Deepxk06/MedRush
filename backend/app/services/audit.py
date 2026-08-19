from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog
from app.utils.helpers import to_json


def log_action(
    db: Session,
    action: str,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=to_json(metadata or {}),
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()
    return entry
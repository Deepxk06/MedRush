"""WebSocket connection manager with role/entity-aware broadcast."""

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        old = self.active.get(user_id)
        if old is not None:
            try:
                await old.close()
            except Exception:  # pragma: no cover
                pass
        self.active[user_id] = websocket

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        if self.active.get(user_id) is websocket:
            self.active.pop(user_id, None)

    async def send_to_user(self, user_id: int, event: str, data: Any) -> None:
        ws = self.active.get(user_id)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps({"event": event, "data": data}, default=str))
        except Exception as exc:  # pragma: no cover
            logger.debug("WS send failed for user %s: %s", user_id, exc)
            self.active.pop(user_id, None)

    async def send_to_users(self, user_ids: list[int], event: str, data: Any) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, event, data)

    async def broadcast(self, event: str, data: Any) -> None:
        for uid in list(self.active.keys()):
            await self.send_to_user(uid, event, data)


ws_manager = ConnectionManager()
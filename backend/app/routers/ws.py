from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth.deps import get_current_user_ws
from app.database import SessionLocal
from app.websocket.manager import ws_manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    db = SessionLocal()
    try:
        user = get_current_user_ws(token, db)
        if user is None:
            await websocket.close(code=4401)
            return
        await ws_manager.connect(user.id, websocket)
        try:
            while True:
                await websocket.receive_text()  # keepalive / client messages ignored for now
        except WebSocketDisconnect:
            ws_manager.disconnect(user.id, websocket)
    finally:
        db.close()
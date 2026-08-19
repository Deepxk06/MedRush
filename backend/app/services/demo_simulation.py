"""Demo simulation engine.

Server-side ambulance movement along the stored route. Coordinates are written
to the database and broadcast through the same real-time pipeline used by real
GPS updates — the frontend cannot tell the difference.
"""

import asyncio
import logging
import math
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Ambulance, EmergencyRequest, Route
from app.services.tracking import update_location
from app.utils.helpers import from_json

logger = logging.getLogger(__name__)

SIMULATION_STEP_SECONDS = 3
SIMULATION_STEP_KMH = 36.0


class SimulationEngine:
    def __init__(self) -> None:
        self.tasks: dict[int, asyncio.Task] = {}
        self.running: set[int] = set()

    def is_running(self, ambulance_id: int) -> bool:
        return ambulance_id in self.running

    def start(self, ambulance_id: int, emergency_id: int) -> bool:
        if ambulance_id in self.running:
            return False
        task = asyncio.create_task(self._run(ambulance_id, emergency_id))
        self.tasks[ambulance_id] = task
        self.running.add(ambulance_id)
        return True

    def stop(self, ambulance_id: int) -> bool:
        if ambulance_id not in self.running:
            return False
        task = self.tasks.pop(ambulance_id, None)
        if task:
            task.cancel()
        self.running.discard(ambulance_id)
        return True

    async def _run(self, ambulance_id: int, emergency_id: int) -> None:
        try:
            while ambulance_id in self.running:
                db: Session = SessionLocal()
                try:
                    route = db.query(Route).filter(Route.emergency_id == emergency_id).first()
                    emergency = db.get(EmergencyRequest, emergency_id)
                    ambulance = db.get(Ambulance, ambulance_id)
                    if not route or not emergency or not ambulance:
                        break
                    if emergency.status in ("COMPLETED", "CANCELLED"):
                        self.stop(ambulance_id)
                        break
                    path = from_json(route.path_json, [])
                    if len(path) < 2:
                        break
                    target = path[-1]
                    if emergency.status in ("AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE"):
                        target = (route.pickup_lat, route.pickup_lng)
                    elif emergency.status in ("PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL", "ARRIVED_AT_HOSPITAL"):
                        target = (route.dest_lat, route.dest_lng)
                    else:
                        target = path[1] if len(path) > 1 else (route.pickup_lat, route.pickup_lng)

                    lat, lng = ambulance.current_lat, ambulance.current_lng
                    if lat is None or lng is None:
                        lat, lng = route.origin_lat, route.origin_lng
                    step_km = SIMULATION_STEP_KMH * SIMULATION_STEP_SECONDS / 3600.0
                    new_lat, new_lng, arrived = _move_towards(lat, lng, target[0], target[1], step_km)
                    update_location(db, ambulance_id, new_lat, new_lng, speed_kmh=SIMULATION_STEP_KMH)
                    if arrived:
                        logger.info("Sim ambulance %s reached target for emergency %s", ambulance_id, emergency_id)
                except Exception as exc:  # pragma: no cover
                    logger.warning("Simulation step failed: %s", exc)
                finally:
                    db.close()
                await asyncio.sleep(SIMULATION_STEP_SECONDS)
        except asyncio.CancelledError:
            pass
        finally:
            self.running.discard(ambulance_id)


def _move_towards(lat1: float, lng1: float, lat2: float, lng2: float, step_km: float):
    """Move one step toward the target; returns new coords and whether target reached."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    distance = 2 * r * math.asin(math.sqrt(a))
    if distance <= step_km:
        return lat2, lng2, True
    bearing = math.atan2(
        math.sin(dlng) * math.cos(math.radians(lat2)),
        math.cos(math.radians(lat1)) * math.sin(math.radians(lat2))
        - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlng),
    )
    angular = step_km / r
    new_lat = math.asin(
        math.sin(math.radians(lat1)) * math.cos(angular)
        + math.cos(math.radians(lat1)) * math.sin(angular) * math.cos(bearing)
    )
    new_lng = math.radians(lng1) + math.atan2(
        math.sin(bearing) * math.sin(angular) * math.cos(math.radians(lat1)),
        math.cos(angular) - math.sin(math.radians(lat1)) * math.sin(new_lat),
    )
    return math.degrees(new_lat), math.degrees(new_lng), False


simulation_engine = SimulationEngine()
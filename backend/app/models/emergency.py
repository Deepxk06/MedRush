from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.user import utcnow

EMERGENCY_STATUSES = [
    "REQUESTED",
    "SEARCHING_AMBULANCE",
    "AMBULANCE_ASSIGNED",
    "DRIVER_ACCEPTED",
    "DRIVER_EN_ROUTE",
    "ARRIVED_AT_PICKUP",
    "PATIENT_PICKED_UP",
    "EN_ROUTE_TO_HOSPITAL",
    "ARRIVED_AT_HOSPITAL",
    "PATIENT_ADMITTED",
    "COMPLETED",
    "CANCELLED",
]

SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class EmergencyRequest(Base):
    __tablename__ = "emergency_requests"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), index=True, nullable=False)
    patient_name = Column(String(255), nullable=True)
    patient_age = Column(Integer, nullable=True)
    patient_gender = Column(String(20), nullable=True)
    contact_phone = Column(String(50), nullable=True)

    emergency_type = Column(String(100), nullable=False)
    severity = Column(String(20), index=True, nullable=False)
    symptoms = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)
    blood_group = Column(String(10), nullable=True)
    allergies = Column(Text, nullable=True)

    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    pickup_address = Column(String(500), nullable=True)
    preferred_hospital_hint = Column(String(255), nullable=True)

    priority = Column(String(20), index=True, nullable=False)  # LOW | MEDIUM | HIGH | CRITICAL
    priority_score = Column(Float, nullable=True)
    priority_reason = Column(Text, nullable=True)

    status = Column(String(30), index=True, nullable=False, default="REQUESTED")
    status_history = Column(Text, nullable=True)  # JSON list of {status, at}

    assigned_ambulance_id = Column(Integer, ForeignKey("ambulances.id"), nullable=True)
    assigned_driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    recommended_hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    hospital_score = Column(Float, nullable=True)
    hospital_reason = Column(Text, nullable=True)
    hospital_rankings = Column(Text, nullable=True)  # JSON list

    route_json = Column(Text, nullable=True)  # JSON route data

    requested_at = Column(DateTime, default=utcnow, nullable=False)
    assigned_at = Column(DateTime, nullable=True)
    driver_accepted_at = Column(DateTime, nullable=True)
    driver_en_route_at = Column(DateTime, nullable=True)
    arrived_at_pickup_at = Column(DateTime, nullable=True)
    picked_up_at = Column(DateTime, nullable=True)
    en_route_hospital_at = Column(DateTime, nullable=True)
    arrived_hospital_at = Column(DateTime, nullable=True)
    admitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancel_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="emergency_requests")
    ambulance = relationship("Ambulance", foreign_keys=[assigned_ambulance_id])
    driver = relationship("Driver", foreign_keys=[assigned_driver_id])
    destination_hospital = relationship("Hospital", back_populates="emergencies", foreign_keys=[recommended_hospital_id])
    assignments = relationship("AmbulanceAssignment", back_populates="emergency", cascade="all, delete-orphan")
    route = relationship("Route", back_populates="emergency", uselist=False, cascade="all, delete-orphan")
    history = relationship("EmergencyHistory", back_populates="emergency", cascade="all, delete-orphan")


class AmbulanceAssignment(Base):
    __tablename__ = "ambulance_assignments"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(Integer, ForeignKey("emergency_requests.id", ondelete="CASCADE"), index=True, nullable=False)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id"), index=True, nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), index=True, nullable=False)
    status = Column(String(20), default="PENDING", index=True, nullable=False)  # PENDING | ACCEPTED | REJECTED | COMPLETED | CANCELLED
    distance_km = Column(Float, nullable=True)
    travel_time_min = Column(Float, nullable=True)
    assigned_at = Column(DateTime, default=utcnow, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    pickup_arrived_at = Column(DateTime, nullable=True)
    picked_up_at = Column(DateTime, nullable=True)
    hospital_arrived_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    emergency = relationship("EmergencyRequest", back_populates="assignments")
    ambulance = relationship("Ambulance", back_populates="assignments")
    driver = relationship("Driver")


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(Integer, ForeignKey("emergency_requests.id", ondelete="CASCADE"), unique=True, nullable=False)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id"), nullable=True)
    origin_lat = Column(Float, nullable=False)
    origin_lng = Column(Float, nullable=False)
    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    dest_lat = Column(Float, nullable=False)
    dest_lng = Column(Float, nullable=False)
    distance_km = Column(Float, nullable=False)
    duration_min = Column(Float, nullable=False)
    traffic_factor = Column(Float, default=1.0, nullable=False)
    method = Column(String(20), default="FALLBACK", nullable=False)  # OSRM | FALLBACK
    path_json = Column(Text, nullable=False)  # JSON coordinates
    alternatives_json = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    emergency = relationship("EmergencyRequest", back_populates="route")


class EmergencyHistory(Base):
    __tablename__ = "emergency_history"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(Integer, ForeignKey("emergency_requests.id", ondelete="CASCADE"), index=True, nullable=False)
    event = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    actor_user_id = Column(Integer, nullable=True)
    actor_role = Column(String(20), nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    emergency = relationship("EmergencyRequest", back_populates="history")
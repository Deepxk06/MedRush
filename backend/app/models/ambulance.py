from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.user import utcnow


class Ambulance(Base):
    __tablename__ = "ambulances"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(50), unique=True, nullable=False)
    type = Column(String(20), default="BASIC", nullable=False)  # BASIC | ADVANCED | ICU
    capacity = Column(Integer, default=1, nullable=False)
    status = Column(String(20), default="AVAILABLE", index=True, nullable=False)  # AVAILABLE | BUSY | MAINTENANCE | OFFLINE
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    driver = relationship("Driver", foreign_keys=[driver_id])
    hospital = relationship("Hospital", back_populates="ambulances")
    locations = relationship("AmbulanceLocation", back_populates="ambulance", cascade="all, delete-orphan")
    assignments = relationship("AmbulanceAssignment", back_populates="ambulance")


class AmbulanceLocation(Base):
    __tablename__ = "ambulance_locations"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id", ondelete="CASCADE"), index=True, nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    heading = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    ambulance = relationship("Ambulance", back_populates="locations")
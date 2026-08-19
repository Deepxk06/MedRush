from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.user import utcnow


class Driver(Base):
    __tablename__ = "drivers"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    license_number = Column(String(50), unique=True, nullable=False)
    ambulance_id = Column(Integer, ForeignKey("ambulances.id"), nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", back_populates="driver")
    ambulance = relationship("Ambulance", foreign_keys=[ambulance_id])


class Hospital(Base):
    __tablename__ = "hospitals"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    level = Column(String(50), default="GENERAL", nullable=False)  # GENERAL | TRAUMA | SPECIALTY
    specialties = Column(String(500), nullable=True)  # comma separated
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    staff = relationship("HospitalStaff", back_populates="hospital", cascade="all, delete-orphan")
    resources = relationship("HospitalResource", back_populates="hospital", uselist=False, cascade="all, delete-orphan")
    predictions = relationship("HospitalPrediction", back_populates="hospital", cascade="all, delete-orphan")
    resource_history = relationship("ResourceHistory", back_populates="hospital", cascade="all, delete-orphan")
    ambulances = relationship("Ambulance", back_populates="hospital")
    emergencies = relationship("EmergencyRequest", back_populates="destination_hospital")


class HospitalStaff(Base):
    __tablename__ = "hospital_staff"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), default="STAFF", nullable=False)  # ADMIN | DOCTOR | NURSE | STAFF

    user = relationship("User", back_populates="hospital_staff")
    hospital = relationship("Hospital", back_populates="staff")


class HospitalResource(Base):
    __tablename__ = "hospital_resources"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), unique=True, nullable=False)
    total_beds = Column(Integer, default=100, nullable=False)
    available_beds = Column(Integer, default=80, nullable=False)
    total_icu = Column(Integer, default=10, nullable=False)
    available_icu = Column(Integer, default=8, nullable=False)
    total_emergency_beds = Column(Integer, default=15, nullable=False)
    available_emergency_beds = Column(Integer, default=10, nullable=False)
    total_ventilators = Column(Integer, default=12, nullable=False)
    available_ventilators = Column(Integer, default=9, nullable=False)
    oxygen_capacity = Column(Integer, default=100, nullable=False)
    oxygen_available = Column(Integer, default=85, nullable=False)
    total_doctors = Column(Integer, default=40, nullable=False)
    available_doctors = Column(Integer, default=25, nullable=False)
    total_nurses = Column(Integer, default=80, nullable=False)
    available_nurses = Column(Integer, default=50, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    hospital = relationship("Hospital", back_populates="resources")


class ResourceHistory(Base):
    __tablename__ = "resource_history"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    resource_type = Column(String(50), index=True, nullable=False)
    total = Column(Integer, nullable=False)
    available = Column(Integer, nullable=False)
    usage_pct = Column(Float, nullable=False)
    recorded_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    hospital = relationship("Hospital", back_populates="resource_history")


class HospitalPrediction(Base):
    __tablename__ = "hospital_predictions"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), index=True, nullable=False)
    resource_type = Column(String(50), index=True, nullable=False)
    predicted_at = Column(DateTime, default=utcnow, nullable=False)
    horizon_hours = Column(Integer, default=6, nullable=False)
    predicted_demand = Column(Float, nullable=False)
    current_available = Column(Float, nullable=False)
    expected_shortage = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False)  # LOW | MEDIUM | HIGH | CRITICAL
    confidence = Column(Float, nullable=True)
    model_version = Column(String(50), nullable=True)
    explanation = Column(String(1000), nullable=True)
    series = Column(String(4000), nullable=True)  # JSON hourly forecast

    hospital = relationship("Hospital", back_populates="predictions")
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    role = Column(String(20), index=True, nullable=False)  # PATIENT | DRIVER | HOSPITAL | ADMIN
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    patient = relationship("Patient", back_populates="user", uselist=False, cascade="all, delete-orphan")
    driver = relationship("Driver", back_populates="user", uselist=False, cascade="all, delete-orphan")
    hospital_staff = relationship("HospitalStaff", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    blood_group = Column(String(10), nullable=True)
    allergies = Column(String(500), nullable=True)
    medical_history = Column(String(1000), nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="patient")
    emergency_requests = relationship("EmergencyRequest", back_populates="patient")
    medical_profile = relationship("MedicalProfile", back_populates="patient", uselist=False, cascade="all, delete-orphan")


class MedicalProfile(Base):
    __tablename__ = "medical_profiles"
    __table_args__ = {"sqlite_autoincrement": True}

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id", ondelete="CASCADE"), unique=True, nullable=False)
    height_cm = Column(Integer, nullable=True)
    weight_kg = Column(Integer, nullable=True)
    conditions = Column(String(1000), nullable=True)
    medications = Column(String(1000), nullable=True)
    notes = Column(String(1000), nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="medical_profile")
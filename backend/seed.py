"""Seed script — creates demo users, hospitals, ambulances, resources and history.

Usage: python seed.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.auth.security import hash_password  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.models import (  # noqa: E402
    Ambulance,
    Driver,
    Hospital,
    HospitalResource,
    HospitalStaff,
    Patient,
    ResourceHistory,
    User,
)

HOSPITAL_DATA = [
    {
        "name": "City Care Hospital",
        "address": "12, Anna Salai, Chennai",
        "lat": 13.0418, "lng": 80.2339,
        "level": "GENERAL",
        "specialties": "cardiology, internal medicine, emergency, orthopedics",
        "resources": {"total_beds": 120, "available_beds": 86, "total_icu": 12, "available_icu": 8,
                      "total_emergency_beds": 15, "available_emergency_beds": 9, "total_ventilators": 14,
                      "available_ventilators": 10, "oxygen_capacity": 100, "oxygen_available": 78,
                      "total_doctors": 45, "available_doctors": 28, "total_nurses": 90, "available_nurses": 55},
    },
    {
        "name": "MediLife Multi-Specialty",
        "address": "45, Mount Road, Chennai",
        "lat": 13.0590, "lng": 80.2557,
        "level": "TRAUMA",
        "specialties": "cardiology, neurology, trauma, surgery, orthopedics, gynecology",
        "resources": {"total_beds": 200, "available_beds": 124, "total_icu": 18, "available_icu": 11,
                      "total_emergency_beds": 25, "available_emergency_beds": 12, "total_ventilators": 20,
                      "available_ventilators": 13, "oxygen_capacity": 150, "oxygen_available": 110,
                      "total_doctors": 70, "available_doctors": 41, "total_nurses": 140, "available_nurses": 82},
    },
    {
        "name": "Sunrise General Hospital",
        "address": "88, Velachery Main Road, Chennai",
        "lat": 12.9791, "lng": 80.2207,
        "level": "GENERAL",
        "specialties": "internal medicine, pediatrics, emergency",
        "resources": {"total_beds": 80, "available_beds": 52, "total_icu": 8, "available_icu": 5,
                      "total_emergency_beds": 10, "available_emergency_beds": 6, "total_ventilators": 10,
                      "available_ventilators": 7, "oxygen_capacity": 80, "oxygen_available": 60,
                      "total_doctors": 30, "available_doctors": 19, "total_nurses": 60, "available_nurses": 40},
    },
    {
        "name": "GreenValley Heart & Neuro",
        "address": "3, OMR, Chennai",
        "lat": 12.9857, "lng": 80.2207 + 0.03,
        "level": "SPECIALTY",
        "specialties": "cardiology, neurology, neurosurgery, pulmonology",
        "resources": {"total_beds": 150, "available_beds": 93, "total_icu": 14, "available_icu": 7,
                      "total_emergency_beds": 18, "available_emergency_beds": 8, "total_ventilators": 16,
                      "available_ventilators": 9, "oxygen_capacity": 120, "oxygen_available": 85,
                      "total_doctors": 55, "available_doctors": 33, "total_nurses": 110, "available_nurses": 70},
    },
]

AMBULANCE_DATA = [
    {"vehicle_number": "TN-01-MR-1001", "type": "ADVANCED", "capacity": 2},
    {"vehicle_number": "TN-01-MR-1002", "type": "BASIC", "capacity": 1},
    {"vehicle_number": "TN-01-MR-1003", "type": "ICU", "capacity": 1},
    {"vehicle_number": "TN-01-MR-1004", "type": "ADVANCED", "capacity": 2},
    {"vehicle_number": "TN-01-MR-1005", "type": "BASIC", "capacity": 1},
    {"vehicle_number": "TN-01-MR-1006", "type": "ICU", "capacity": 1},
]

DEMO_USERS = [
    {"email": "admin@medrush.ai", "password": "admin123", "full_name": "System Administrator", "phone": "9876500001", "role": "ADMIN"},
    {"email": "patient@demo.com", "password": "patient123", "full_name": "Arun Kumar", "phone": "9876500002", "role": "PATIENT",
     "patient": {"age": 34, "gender": "Male", "blood_group": "O+", "allergies": "None", "medical_history": "None",
                 "emergency_contact_name": "Priya", "emergency_contact_phone": "9876500102"}},
    {"email": "patient2@demo.com", "password": "patient123", "full_name": "Meena R", "phone": "9876500003", "role": "PATIENT",
     "patient": {"age": 62, "gender": "Female", "blood_group": "B+", "allergies": "Penicillin", "medical_history": "Hypertension",
                 "emergency_contact_name": "Ravi", "emergency_contact_phone": "9876500103"}},
    {"email": "patient3@demo.com", "password": "patient123", "full_name": "Suresh V", "phone": "9876500004", "role": "PATIENT",
     "patient": {"age": 8, "gender": "Male", "blood_group": "A+", "allergies": "None", "medical_history": "Asthma",
                 "emergency_contact_name": "Lakshmi", "emergency_contact_phone": "9876500104"}},
    {"email": "driver@demo.com", "password": "driver123", "full_name": "Karthik Raj", "phone": "9876500005", "role": "DRIVER",
     "driver": {"license_number": "TN-DL-2023-4567", "ambulance_index": 0}},
    {"email": "driver2@demo.com", "password": "driver123", "full_name": "Deepak S", "phone": "9876500006", "role": "DRIVER",
     "driver": {"license_number": "TN-DL-2023-4568", "ambulance_index": 1}},
    {"email": "driver3@demo.com", "password": "driver123", "full_name": "Mohammed Ali", "phone": "9876500007", "role": "DRIVER",
     "driver": {"license_number": "TN-DL-2023-4569", "ambulance_index": 2}},
]

STAFF_PASSWORD = "hospital123"
DRIVER_START_POSITIONS = [
    (13.0520, 80.2440),
    (13.0320, 80.2220),
    (13.0720, 80.2670),
    (13.0200, 80.2000),
    (13.0600, 80.2900),
    (13.0900, 80.2500),
]


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded. Skipping.")
            return

        # Hospitals + resources + staff accounts
        hospitals = []
        for idx, data in enumerate(HOSPITAL_DATA):
            hospital = Hospital(
                name=data["name"], address=data["address"], lat=data["lat"], lng=data["lng"],
                level=data["level"], specialties=data["specialties"],
                phone=f"044-{28000000 + idx * 1000}", email=f"contact@{data['name'].lower().replace(' ', '').replace('&', '').replace('-', '')}.com",
            )
            db.add(hospital)
            db.flush()
            db.add(HospitalResource(hospital_id=hospital.id, **data["resources"]))
            staff = User(
                email=f"staff{hospital.id}@medrush.ai",
                password_hash=hash_password(STAFF_PASSWORD),
                full_name=f"{hospital.name} Administrator",
                phone=f"044-{29000000 + hospital.id * 1000}",
                role="HOSPITAL",
            )
            db.add(staff)
            db.flush()
            db.add(HospitalStaff(user_id=staff.id, hospital_id=hospital.id, role="ADMIN"))
            hospitals.append(hospital)

        # Admin
        db.add(User(
            email=DEMO_USERS[0]["email"],
            password_hash=hash_password(DEMO_USERS[0]["password"]),
            full_name=DEMO_USERS[0]["full_name"],
            phone=DEMO_USERS[0]["phone"],
            role="ADMIN",
        ))

        # Patients
        for data in DEMO_USERS:
            if data["role"] != "PATIENT":
                continue
            user = User(
                email=data["email"],
                password_hash=hash_password(data["password"]),
                full_name=data["full_name"],
                phone=data["phone"],
                role="PATIENT",
            )
            db.add(user)
            db.flush()
            db.add(Patient(user_id=user.id, **data["patient"]))

        # Ambulances + drivers
        ambulance_rows = []
        for idx, data in enumerate(AMBULANCE_DATA):
            ambulance = Ambulance(
                vehicle_number=data["vehicle_number"],
                type=data["type"],
                capacity=data["capacity"],
                status="AVAILABLE",
                hospital_id=hospitals[idx % len(hospitals)].id,
                current_lat=DRIVER_START_POSITIONS[idx][0],
                current_lng=DRIVER_START_POSITIONS[idx][1],
            )
            db.add(ambulance)
            db.flush()
            ambulance_rows.append(ambulance)

        driver_ambulance_used = set()
        for data in DEMO_USERS:
            if data["role"] != "DRIVER":
                continue
            idx = data["driver"]["ambulance_index"]
            ambulance = ambulance_rows[idx]
            driver = Driver(
                user_id=None,
                license_number=data["driver"]["license_number"],
                ambulance_id=ambulance.id,
                is_available=True,
                current_lat=ambulance.current_lat,
                current_lng=ambulance.current_lng,
            )
            user = User(
                email=data["email"],
                password_hash=hash_password(data["password"]),
                full_name=data["full_name"],
                phone=data["phone"],
                role="DRIVER",
            )
            db.add(user)
            db.flush()
            driver.user_id = user.id
            db.add(driver)
            db.flush()
            ambulance.driver_id = driver.id
            driver_ambulance_used.add(idx)

        # Assign remaining ambulances to extra drivers
        extra_driver_license = ["TN-DL-2023-4570", "TN-DL-2023-4571", "TN-DL-2023-4572"]
        extra_license_idx = 0
        for idx, ambulance in enumerate(ambulance_rows):
            if idx in driver_ambulance_used:
                continue
            user = User(
                email=f"driver{idx + 1}@medrush.ai",
                password_hash=hash_password("driver123"),
                full_name=f"Driver {idx + 1}",
                phone=f"9876500{110 + idx}",
                role="DRIVER",
            )
            db.add(user)
            db.flush()
            driver = Driver(
                user_id=user.id,
                license_number=extra_driver_license[extra_license_idx],
                ambulance_id=ambulance.id,
                is_available=True,
                current_lat=ambulance.current_lat,
                current_lng=ambulance.current_lng,
            )
            db.add(driver)
            db.flush()
            ambulance.driver_id = driver.id
            extra_license_idx += 1

        # Historical resource snapshots for trend charts
        now = datetime.now(timezone.utc)
        for hospital in hospitals:
            resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).first()
            for day_offset in range(14, 0, -1):
                usage_factor = 0.75 + (day_offset % 3) * 0.08
                for rtype, total, available in [
                    ("beds", resources.total_beds, resources.available_beds),
                    ("icu", resources.total_icu, resources.available_icu),
                    ("ventilators", resources.total_ventilators, resources.available_ventilators),
                ]:
                    occupied = min(total - 1, int(total * usage_factor))
                    db.add(ResourceHistory(
                        hospital_id=hospital.id,
                        resource_type=rtype,
                        total=total,
                        available=total - occupied,
                        usage_pct=round(occupied / max(1, total) * 100, 1),
                        recorded_at=now - timedelta(days=day_offset),
                    ))

        db.commit()
        print("Seed complete.")
        print("Demo credentials:")
        print("  Admin:    admin@medrush.ai / admin123")
        print("  Patient:  patient@demo.com / patient123")
        print("  Driver:   driver@demo.com / driver123")
        print("  Hospital: staff1@medrush.ai / hospital123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
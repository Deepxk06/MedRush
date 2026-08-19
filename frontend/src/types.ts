export type Role = "PATIENT" | "DRIVER" | "HOSPITAL" | "ADMIN";

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  patient_id?: number | null;
  driver_id?: number | null;
  hospital_id?: number | null;
  hospital_name?: string | null;
  ambulance_id?: number | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface AmbulanceInfo {
  id: number;
  vehicle_number: string;
  type: string;
  status: string;
  current_lat?: number | null;
  current_lng?: number | null;
}

export interface DriverInfo {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
  license_number: string;
  ambulance_id?: number | null;
  is_available: boolean;
  is_active: boolean;
  current_lat?: number | null;
  current_lng?: number | null;
  ambulance?: AmbulanceInfo | null;
}

export interface HospitalInfo {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface EmergencyDriver {
  id: number;
  name: string;
  phone?: string;
}

export interface RouteLeg {
  distance_km: number;
  duration_min: number;
  path: [number, number][];
  method: string;
}

export interface RouteData {
  path: [number, number][];
  distance_km: number;
  duration_min: number;
  method: string;
  traffic_factor: number;
  explanation: string;
  legs?: {
    to_pickup?: RouteLeg;
    to_hospital?: RouteLeg;
  };
}

export interface Emergency {
  id: number;
  patient_id: number;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  contact_phone?: string;
  emergency_type: string;
  severity: string;
  symptoms?: string;
  medical_history?: string;
  blood_group?: string;
  allergies?: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string;
  preferred_hospital_hint?: string;
  priority: string;
  priority_score?: number;
  priority_reason?: string;
  status: string;
  status_history?: string;
  created_at: string;
  assigned_ambulance_id?: number | null;
  assigned_driver_id?: number | null;
  recommended_hospital_id?: number | null;
  hospital_score?: number;
  hospital_reason?: string;
  hospital_rankings?: string;
  route_json?: string;
  requested_at: string;
  assigned_at?: string;
  driver_accepted_at?: string;
  driver_en_route_at?: string;
  arrived_at_pickup_at?: string;
  picked_up_at?: string;
  en_route_hospital_at?: string;
  arrived_hospital_at?: string;
  admitted_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  ambulance?: AmbulanceInfo | null;
  driver?: EmergencyDriver | null;
  hospital?: HospitalInfo | null;
  route?: RouteData | null;
}

export interface Notification {
  id: number;
  title: string;
  message?: string;
  type: string;
  entity_type?: string;
  entity_id?: number;
  is_read: boolean;
  created_at: string;
}

export interface HospitalResource {
  hospital_id: number;
  hospital_name: string;
  total_beds: number;
  available_beds: number;
  total_icu: number;
  available_icu: number;
  total_emergency_beds: number;
  available_emergency_beds: number;
  total_ventilators: number;
  available_ventilators: number;
  oxygen_capacity: number;
  oxygen_available: number;
  total_doctors: number;
  available_doctors: number;
  total_nurses: number;
  available_nurses: number;
  bed_usage_pct: number;
  icu_usage_pct: number;
  ventilator_usage_pct: number;
}

export interface Prediction {
  hospital_id: number;
  hospital_name: string;
  resource: string;
  horizon_hours: number;
  current_available: number;
  current_total: number;
  predicted_demand: number;
  predicted_usage: number;
  expected_shortage: number;
  risk_level: string;
  confidence: number;
  explanation: string;
  series: { hour_offset: number; predicted_usage: number }[];
  model_version?: string;
  metrics?: Record<string, number>;
}

export interface AdminOverview {
  total_users: number;
  active_patients: number;
  total_drivers: number;
  available_drivers: number;
  total_ambulances: number;
  available_ambulances: number;
  busy_ambulances: number;
  total_hospitals: number;
  active_hospitals: number;
  active_emergencies: number;
  completed_emergencies: number;
  cancelled_requests: number;
  total_emergencies: number;
  avg_response_sec: number;
  avg_pickup_sec: number;
  avg_travel_sec: number;
  ambulance_utilization_pct: number;
  hospital_bed_utilization_pct: number;
  total_beds: number;
  available_beds: number;
  total_icu: number;
  available_icu: number;
}

export interface Hospital {
  id: number;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  email?: string;
  is_active: boolean;
  level: string;
  specialties?: string;
  resources?: Record<string, unknown>;
}

export interface PatientProfile {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
  age?: number;
  gender?: string;
  blood_group?: string;
  allergies?: string;
  medical_history?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  is_active: boolean;
}

export interface EmergencyCreatePayload {
  emergency_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  symptoms?: string | null;
  medical_history?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  contact_phone?: string | null;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address?: string | null;
  preferred_hospital_hint?: string | null;
  vitals?: Record<string, number> | null;
  patient_id?: number | null;
}

export interface ResourceUpdatePayload {
  total_beds?: number;
  available_beds?: number;
  total_icu?: number;
  available_icu?: number;
  total_emergency_beds?: number;
  available_emergency_beds?: number;
  total_ventilators?: number;
  available_ventilators?: number;
  oxygen_capacity?: number;
  oxygen_available?: number;
  total_doctors?: number;
  available_doctors?: number;
  total_nurses?: number;
  available_nurses?: number;
}

export type ResourcePrediction = Prediction;

export interface AdminAnalytics {
  daily_emergencies: { date: string; count: number }[];
  by_type: { type: string; count: number }[];
  by_severity: { severity: string; count: number }[];
  by_priority: { priority: string; count: number }[];
  by_status: { status: string; count: number }[];
  completed_vs_cancelled: { completed: number; cancelled: number };
  ambulance_usage: { vehicle: string; assignments: number; busy_hours: number }[];
  hospital_usage: { hospital: string; bed_usage_pct: number; icu_usage_pct: number; vent_usage_pct: number }[];
}

export interface AuditLogEntry {
  id: number;
  user_id?: number;
  user_email?: string;
  action: string;
  entity_type?: string;
  entity_id?: number;
  metadata_json?: string;
  ip_address?: string;
  created_at: string;
}

export interface ModelMetrics {
  mae?: number;
  rmse?: number;
  r2?: number;
  test_samples?: number;
  accuracy?: number;
  f1?: number;
  precision?: number;
  recall?: number;
}

export interface ModelInfo {
  name: string;
  algorithm: string;
  trained: boolean;
  version?: string;
  metrics?: Record<string, number | string | ModelMetrics>;
  dataset_rows?: number;
}

export interface DriverAdmin {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone?: string;
  license_number: string;
  ambulance_id?: number | null;
  is_available: boolean;
  is_active: boolean;
  ambulance_number?: string | null;
}

export interface AmbulanceAdmin {
  id: number;
  vehicle_number: string;
  type: string;
  capacity: number;
  status: string;
  driver_id?: number | null;
  hospital_id?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  driver_name?: string | null;
  driver?: { id: number; name: string } | null;
}

export interface DemoSimulations {
  running: number[];
  ambulances: { id: number; vehicle_number: string; status: string; simulation_running: boolean; lat?: number | null; lng?: number | null }[];
  active_emergency_id?: number | null;
  active_emergency_status?: string | null;
}

export const EMERGENCY_STATUSES = [
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
] as const;

export const EMERGENCY_TYPES = [
  "cardiac_arrest",
  "heart_attack",
  "stroke",
  "severe_bleeding",
  "unconscious",
  "breathing_difficulty",
  "severe_burn",
  "road_accident",
  "trauma",
  "seizure",
  "severe_pain",
  "poisoning",
  "pregnancy_complication",
  "diabetic_emergency",
  "high_fever",
  "fracture",
  "allergic_reaction",
  "mild_injury",
  "other",
] as const;

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
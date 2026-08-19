import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context/AuthContext";
import type { Role } from "./types";
import { Spinner } from "./components/ui/State";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AppLayout from "./layouts/AppLayout";
import PatientDashboard from "./pages/patient/PatientDashboard";
import RequestAmbulance from "./pages/patient/RequestAmbulance";
import PatientHistory from "./pages/patient/PatientHistory";
import DriverDashboard from "./pages/driver/DriverDashboard";
import HospitalDashboard from "./pages/hospital/HospitalDashboard";
import HospitalResources from "./pages/hospital/HospitalResources";
import HospitalIncoming from "./pages/hospital/HospitalIncoming";
import HospitalPredictions from "./pages/hospital/HospitalPredictions";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminEmergencies from "./pages/admin/AdminEmergencies";
import AdminPatients from "./pages/admin/AdminPatients";
import AdminDrivers from "./pages/admin/AdminDrivers";
import AdminAmbulances from "./pages/admin/AdminAmbulances";
import AdminHospitals from "./pages/admin/AdminHospitals";
import AdminAi from "./pages/admin/AdminAi";
import AdminAudit from "./pages/admin/AdminAudit";
import AdminDemo from "./pages/admin/AdminDemo";
import Profile from "./pages/Profile";

function Protected({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case "PATIENT":
      return <PatientDashboard />;
    case "DRIVER":
      return <DriverDashboard />;
    case "HOSPITAL":
      return <HospitalDashboard />;
    case "ADMIN":
      return <AdminOverview />;
    default:
      return <Navigate to="/login" replace />;
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        path="/app"
        element={
          <Protected roles={["PATIENT", "DRIVER", "HOSPITAL", "ADMIN"]}>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="request" element={<Protected roles={["PATIENT"]}><RequestAmbulance /></Protected>} />
        <Route path="history" element={<Protected roles={["PATIENT"]}><PatientHistory /></Protected>} />
        <Route path="resources" element={<Protected roles={["HOSPITAL", "ADMIN"]}><HospitalResources /></Protected>} />
        <Route path="incoming" element={<Protected roles={["HOSPITAL", "ADMIN"]}><HospitalIncoming /></Protected>} />
        <Route path="predictions" element={<Protected roles={["HOSPITAL", "ADMIN"]}><HospitalPredictions /></Protected>} />
        <Route path="emergencies" element={<Protected roles={["ADMIN"]}><AdminEmergencies /></Protected>} />
        <Route path="patients" element={<Protected roles={["ADMIN"]}><AdminPatients /></Protected>} />
        <Route path="drivers" element={<Protected roles={["ADMIN"]}><AdminDrivers /></Protected>} />
        <Route path="ambulances" element={<Protected roles={["ADMIN"]}><AdminAmbulances /></Protected>} />
        <Route path="hospitals" element={<Protected roles={["ADMIN"]}><AdminHospitals /></Protected>} />
        <Route path="ai" element={<Protected roles={["ADMIN"]}><AdminAi /></Protected>} />
        <Route path="audit" element={<Protected roles={["ADMIN"]}><AdminAudit /></Protected>} />
        <Route path="demo" element={<Protected roles={["ADMIN"]}><AdminDemo /></Protected>} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
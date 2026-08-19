import { useEffect, useState } from "react";
import { useSocket } from "../context/SocketContext";

export const LIVE_EVENT_TYPES = [
  "emergency_created",
  "status_updated",
  "ambulance_assigned",
  "driver_accepted",
  "driver_rejected",
  "route_optimized",
  "ambulance_location_updated",
  "hospital_resource_updated",
];

export function useSocketRefresh(): number {
  const { on, connected } = useSocket();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!connected) return;
    const unsubs = LIVE_EVENT_TYPES.map((event) =>
      on(event, () => setVersion((v) => v + 1)),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [on, connected]);

  return version;
}
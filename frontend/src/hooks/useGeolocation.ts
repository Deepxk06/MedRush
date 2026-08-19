import { useCallback, useState } from "react";

export function useGeolocation() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      (err) => {
        setError(`Geolocation denied (${err.message}). Please pick a location manually.`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return { position, error, loading, locate };
}
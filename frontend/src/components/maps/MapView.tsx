import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind: "ambulance" | "pickup" | "hospital" | "destination" | "user";
}

export interface MapPath {
  latlngs: [number, number][];
  color?: string;
  dashArray?: string;
}

const iconCache = new Map<string, L.DivIcon>();

function makeIcon(kind: MapMarker["kind"], label?: string): L.DivIcon {
  const key = `${kind}-${label ?? ""}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const colors: Record<MapMarker["kind"], string> = {
    ambulance: "#e11d48",
    pickup: "#f59e0b",
    hospital: "#0ea5e9",
    destination: "#0ea5e9",
    user: "#10b981",
  };
  const icon = L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="background:${colors[kind]};color:white;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white">${
        kind === "ambulance" ? "🚑" : kind === "hospital" ? "🏥" : kind === "pickup" ? "📍" : "🧭"
      }</div>
      ${
        label
          ? `<div style="background:white;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,.2);white-space:nowrap">${label}</div>`
          : ""
      }
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  iconCache.set(key, icon);
  return icon;
}

export default function MapView({
  markers = [],
  paths = [],
  center,
  zoom = 13,
  className = "h-80",
}: {
  markers?: MapMarker[];
  paths?: MapPath[];
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<{ markers: Map<string, L.Marker>; paths: L.Polyline[] }>({
    markers: new Map(),
    paths: [],
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = center ?? (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: 13.0827, lng: 80.2707 });
    const map = L.map(containerRef.current, { center: [initial.lat, initial.lng], zoom });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = { markers: new Map(), paths: [] };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { markers: markerLayer, paths: oldPaths } = layerRef.current;

    oldPaths.forEach((p) => p.remove());
    layerRef.current.paths = [];

    for (const path of paths) {
      const polyline = L.polyline(path.latlngs, {
        color: path.color ?? "#e11d48",
        weight: 4,
        opacity: 0.85,
        dashArray: path.dashArray,
      }).addTo(map);
      layerRef.current.paths.push(polyline);
    }

    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      let marker = markerLayer.get(m.id);
      if (marker) {
        marker.setLatLng([m.lat, m.lng]);
      } else {
        marker = L.marker([m.lat, m.lng], { icon: makeIcon(m.kind, m.label) }).addTo(map);
        markerLayer.set(m.id, marker);
      }
    }
    for (const [id, marker] of markerLayer) {
      if (!seen.has(id)) {
        marker.remove();
        markerLayer.delete(id);
      }
    }

    if (markers.length > 0) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [markers, paths]);

  return <div ref={containerRef} className={className} aria-label="Map" />;
}
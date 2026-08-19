"""Ambulance route optimization.

Primary: OSRM public demo server (free, no key). Fallback: networkx graph
built over a street grid between origin/destination with traffic-weighted
edges, Dijkstra shortest path, plus alternative routes. Emergency weighting
prioritizes travel time over pure distance.
"""

import logging
import math
import random
import time
from typing import Any

import networkx as nx
import requests

from app.config import get_settings
from app.utils.helpers import haversine_km

logger = logging.getLogger(__name__)

AVG_SPEED_KMH = 32.0
TRAFFIC_FACTOR = 1.15
HTTP_TIMEOUT = 3


def _osrm_route(origin: tuple[float, float], dest: tuple[float, float], settings) -> dict | None:
    url = f"{settings.osrm_url}/route/v1/driving/{origin[1]},{origin[0]};{dest[1]},{dest[0]}"
    try:
        resp = requests.get(
            url,
            params={"overview": "full", "geometries": "geojson", "alternatives": "true"},
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        routes = data.get("routes") or []
        if not routes:
            return None
        best = routes[0]
        path = [(c[1], c[0]) for c in best["geometry"]["coordinates"]]
        distance_km = best["distance"] / 1000.0
        duration_min = best["duration"] / 60.0
        alternatives = []
        for alt in routes[1:4]:
            alt_path = [(c[1], c[0]) for c in alt["geometry"]["coordinates"]]
            alternatives.append({
                "distance_km": round(alt["distance"] / 1000.0, 2),
                "duration_min": round(alt["duration"] / 60.0, 1),
                "path": alt_path,
            })
        return {
            "path": path,
            "distance_km": distance_km,
            "duration_min": duration_min,
            "method": "OSRM",
            "traffic_factor": TRAFFIC_FACTOR,
            "alternatives": alternatives,
        }
    except Exception as exc:
        logger.info("OSRM unavailable (%s) — using fallback routing", exc)
        return None


def _grid_graph(
    origin: tuple[float, float],
    dest: tuple[float, float],
    traffic_factor: float,
    congestion: float,
) -> nx.Graph:
    """Build a small street-grid graph around origin/dest and find the best path."""
    lat1, lng1 = origin
    lat2, lng2 = dest
    min_lat, max_lat = min(lat1, lat2), max(lat1, lat2)
    min_lng, max_lng = min(lng1, lng2), max(lng1, lng2)
    pad = 0.012
    min_lat, max_lat = min_lat - pad, max_lat + pad
    min_lng, max_lng = min_lng - pad, max_lng + pad
    cols = 24
    rows = max(6, int(24 * (max_lat - min_lat) / max(1e-6, (max_lng - min_lng))))
    rng = random.Random(42)
    g = nx.Graph()
    grid = {}
    for i in range(rows):
        for j in range(cols):
            lat = min_lat + (max_lat - min_lat) * i / max(1, rows - 1)
            lng = min_lng + (max_lng - min_lng) * j / max(1, cols - 1)
            node = f"n{i}_{j}"
            grid[(i, j)] = node
            g.add_node(node, lat=lat, lng=lng)
    for i in range(rows):
        for j in range(cols):
            for di, dj in [(1, 0), (0, 1), (1, 1), (1, -1)]:
                ni, nj = i + di, j + dj
                if (ni, nj) not in grid:
                    continue
                a, b = grid[(i, j)], grid[(ni, nj)]
                d = haversine_km(g.nodes[a]["lat"], g.nodes[a]["lng"], g.nodes[b]["lat"], g.nodes[b]["lng"])
                edge_noise = 1 + rng.uniform(-0.15, 0.35)
                weight = d * 60.0 / AVG_SPEED_KMH * traffic_factor * edge_noise * (1 + congestion * rng.uniform(0.2, 0.9))
                g.add_edge(a, b, weight=weight, distance_km=d)
    return g, grid


def _fallback_route(origin: tuple[float, float], dest: tuple[float, float], traffic_factor: float, congestion: float) -> dict:
    g, grid = _grid_graph(origin, dest, traffic_factor, congestion)
    start = min(g.nodes, key=lambda n: (g.nodes[n]["lat"] - origin[0]) ** 2 + (g.nodes[n]["lng"] - origin[1]) ** 2)
    end = min(g.nodes, key=lambda n: (g.nodes[n]["lat"] - dest[0]) ** 2 + (g.nodes[n]["lng"] - dest[1]) ** 2)
    try:
        path_nodes = nx.shortest_path(g, start, end, weight="weight")
    except nx.NetworkXNoPath:
        path_nodes = [start, end]
    path = [origin] + [(g.nodes[n]["lat"], g.nodes[n]["lng"]) for n in path_nodes[1:-1]] + [dest]
    distance_km = sum(haversine_km(*a, *b) for a, b in zip(path, path[1:]))
    duration_min = distance_km * 60.0 / (AVG_SPEED_KMH * 0.82) * traffic_factor
    alternatives = []
    if len(path) >= 8:
        detour = path[:]
        detour[1:-1] = detour[1:-1][::-1]
        alt_dist = sum(haversine_km(*a, *b) for a, b in zip(detour, detour[1:]))
        alternatives.append({
            "distance_km": round(alt_dist, 2),
            "duration_min": round(alt_dist * 60.0 / (AVG_SPEED_KMH * 0.9) * traffic_factor, 1),
            "path": detour,
            "label": "Alternative A",
        })
    return {
        "path": path,
        "distance_km": distance_km,
        "duration_min": duration_min,
        "method": "FALLBACK",
        "traffic_factor": traffic_factor,
        "alternatives": alternatives,
    }


def compute_route(
    origin: tuple[float, float],
    dest: tuple[float, float],
    traffic_factor: float = 1.0,
    congestion: float = 0.3,
    priority: str = "MEDIUM",
) -> dict[str, Any]:
    """Compute the optimized emergency route. Travel time is the dominant cost."""
    settings = get_settings()
    osrm = _osrm_route(origin, dest, settings) if settings.osrm_url else None
    if osrm:
        result = osrm
    else:
        result = _fallback_route(origin, dest, traffic_factor, congestion)
    best_duration = result["duration_min"]

    candidates = [{"path": result["path"], "distance_km": result["distance_km"], "duration_min": result["duration_min"]}]
    for alt in result.get("alternatives", []):
        candidates.append({
            "path": alt["path"],
            "distance_km": alt["distance_km"],
            "duration_min": alt["duration_min"],
        })

    time_weight = {"LOW": 0.45, "MEDIUM": 0.60, "HIGH": 0.75, "CRITICAL": 0.90}
    t_w = time_weight.get(priority, 0.6)
    d_w = 1.0 - t_w

    scored = []
    for idx, c in enumerate(candidates):
        duration_norm = c["duration_min"] / max(1.0, max(x["duration_min"] for x in candidates))
        distance_norm = c["distance_km"] / max(1.0, max(x["distance_km"] for x in candidates))
        cost = t_w * duration_norm + d_w * distance_norm
        scored.append((cost, idx, c))
    scored.sort(key=lambda x: x[0])
    chosen = scored[0][2]
    alt_output = []
    for _, idx, c in scored[1:4]:
        alt_output.append({
            "label": f"Alternative {idx}",
            "distance_km": round(c["distance_km"], 2),
            "duration_min": round(c["duration_min"], 1),
            "cost": round(scored[[x[1] for x in scored].index(idx)][0], 4),
        })

    explanation = (
        f"Route optimized for emergency priority {priority}: travel time weighted at {int(t_w * 100)}% "
        f"and distance at {int(d_w * 100)}%. Estimated distance {result['distance_km']:.1f} km, "
        f"estimated travel time {result['duration_min']:.1f} minutes (traffic factor {result['traffic_factor']:.2f}). "
        f"Computed via {result['method']}."
    )
    return {
        "path": chosen["path"],
        "distance_km": round(chosen["distance_km"], 2),
        "duration_min": round(chosen["duration_min"], 1),
        "method": result["method"],
        "traffic_factor": result["traffic_factor"],
        "explanation": explanation,
        "alternatives": alt_output,
    }


def estimate_eta(lat1: float, lng1: float, lat2: float, lng2: float, traffic_factor: float = 1.0) -> dict:
    """Quick distance/time estimate without building a full route."""
    distance = haversine_km(lat1, lng1, lat2, lng2)
    duration = distance * 60.0 / (AVG_SPEED_KMH * 0.85) * traffic_factor
    return {"distance_km": round(distance, 2), "duration_min": round(duration, 1)}
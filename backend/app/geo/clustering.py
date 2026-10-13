import math
from typing import List, Tuple, Dict, Any

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two GPS points in meters using Haversine formula.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def calculate_centroid_and_radius(points: List[Tuple[float, float]]) -> Tuple[float, float, float]:
    """
    Calculates center latitude, center longitude, and radius (in meters) covering points.
    """
    if not points:
        return 0.0, 0.0, 0.0
    if len(points) == 1:
        return points[0][0], points[0][1], 150.0

    avg_lat = sum(p[0] for p in points) / len(points)
    avg_lon = sum(p[1] for p in points) / len(points)

    max_dist = max(haversine_distance(avg_lat, avg_lon, p[0], p[1]) for p in points)
    # Give a minimum boundary of 200m or max distance + 50m buffer
    radius = max(200.0, max_dist + 50.0)

    return round(avg_lat, 6), round(avg_lon, 6), round(radius, 1)

def cluster_points_by_distance(
    reports: List[Dict[str, Any]], 
    max_distance_meters: float = 600.0
) -> List[List[Dict[str, Any]]]:
    """
    Greedy / DBSCAN-equivalent spatial grouping for report locations.
    """
    if not reports:
        return []

    visited = set()
    clusters = []

    for i, rep_a in enumerate(reports):
        if i in visited:
            continue
        current_cluster = [rep_a]
        visited.add(i)

        for j, rep_b in enumerate(reports):
            if j in visited:
                continue
            dist = haversine_distance(
                rep_a["latitude"], rep_a["longitude"],
                rep_b["latitude"], rep_b["longitude"]
            )
            if dist <= max_distance_meters:
                visited.add(j)
                current_cluster.append(rep_b)

        clusters.append(current_cluster)

    return clusters

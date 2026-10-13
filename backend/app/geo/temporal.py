from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

def filter_reports_by_time_window(
    reports: List[Dict[str, Any]],
    window_minutes: int = 180,
    reference_time: datetime = None
) -> List[Dict[str, Any]]:
    """
    Filters reports that occurred within the specified rolling window up to reference_time.
    """
    if not reports:
        return []
    if reference_time is None:
        reference_time = datetime.now(timezone.utc)
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    cutoff = reference_time - timedelta(minutes=window_minutes)

    valid_reports = []
    for r in reports:
        r_time = r.get("created_at") or r.get("observation_time")
        if r_time:
            if r_time.tzinfo is None:
                r_time = r_time.replace(tzinfo=timezone.utc)
            if r_time >= cutoff:
                valid_reports.append(r)
    return valid_reports

def calculate_arrival_rate(reports: List[Dict[str, Any]]) -> float:
    """
    Calculates report arrival rate (reports per hour).
    """
    if len(reports) < 2:
        return 1.0

    times = []
    for r in reports:
        t = r.get("created_at") or r.get("observation_time")
        if t:
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            times.append(t)

    if len(times) < 2:
        return 1.0

    times.sort()
    diff_hours = (times[-1] - times[0]).total_seconds() / 3600.0
    if diff_hours <= 0.1:
        return float(len(reports)) * 10.0 # High burst rate
    return round(float(len(reports)) / diff_hours, 2)

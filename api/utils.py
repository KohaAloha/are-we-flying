from math import sin, asin, cos, acos, tan, atan, atan2, degrees, radians, sqrt


def test(x: any) -> str: return 'bad' if x is None else 'good'


def lerp(r: float, a: float, b: float) -> float:
    return (1 - r) * a + r * b


def map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    d: float = (de-ds)
    if d == 0:
        return ts
    return ts + (v-ds) * (te-ts)/d


def constrain(v: float, m: float, M: float) -> float:
    if m > M:
        return constrain(v, M, m)
    return M if v > M else m if v < m else v


def constrain_map(v: float, ds: float, de: float, ts: float, te: float, lm=None, LM=None) -> float:
    val = constrain(map(v, ds, de, ts, te), ts, te)
    if lm is None or LM is None:
        return val
    if val < lm:
        return val
    if val > LM:
        return val
    mid = (lm + LM) / 2
    if val > lm and val <= mid:
        return lm
    if val < LM and val >= mid:
        return LM
    return val


def get_compass_diff(current: float, target: float, direction: float = 1) -> float:
    diff: float = (current - 360) if current > 180 else current
    target: float = target - diff
    result: float = target if target < 180 else target - 360
    if direction > 0:
        return result
    return 360 - target if target < 180 else target - 360


def get_point_at_distance(lat1, lon1, d, heading, R=6371):
    """
    lat: initial latitude, in degrees
    lon: initial longitude, in degrees
    d: target distance from initial
    heading: (true) heading in degrees
    R: optional radius of sphere, defaults to mean radius of earth

    Returns new lat/lon coordinate {d}km from initial, in degrees
    """
    lat1 = radians(lat1)
    lon1 = radians(lon1)
    a = radians(heading)
    lat2 = asin(sin(lat1) * cos(d/R) + cos(lat1) * sin(d/R) * cos(a))
    lon2 = lon1 + atan2(
        sin(a) * sin(d/R) * cos(lat1),
        cos(d/R) - sin(lat1) * sin(lat2)
    )
    return (degrees(lat2), degrees(lon2),)


def get_distance_between_points(lat1, lon1, lat2, lon2, R=6371):
    """
    https://stackoverflow.com/a/365853/740553
    """
    lat1 = float(lat1)
    lon1 = float(lon1)
    lat2 = float(lat2)
    lon2 = float(lon2)

    dLat = radians(lat2 - lat1)
    dLon = radians(lon2 - lon1)
    lat1 = radians(lat1)
    lat2 = radians(lat2)
    a = sin(dLat/2) * sin(dLat/2) + sin(dLon/2) * \
        sin(dLon/2) * cos(lat1) * cos(lat2)
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


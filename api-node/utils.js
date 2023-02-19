const { sin, asin, cos, acos, tan, atan, atan2, sqrt } = Math;
const TAU = Math.PI * 2;

export function degrees(v) {
  return (360 * v) / TAU;
}
export function radians(v) {
  return (TAU * v) / 360;
}

export function lerp(r, a, b) {
  return (1 - r) * a + r * b;
}

export function map(v, ds, de, ts, te) {
  const d = de - ds;
  if (d === 0) return ts;
  return ts + ((v - ds) * (te - ts)) / d;
}

export function constrain(v, m, M) {
  if (m > M) return constrain(v, M, m);
  return v > M ? M : v < m ? m : v;
}

export function constrain_map(v, ds, de, ts, te, lm = false, LM = false) {
  const val = constrain(map(v, ds, de, ts, te), ts, te);
  if (lm === false || LM === false) return val;
  if (val < lm) return val;
  if (val > LM) return val;
  const mid = (lm + LM) / 2;
  if (val > lm && val <= mid) return lm;
  if (val < LM && val >= mid) return LM;
  return val;
}

export function get_compass_diff(current, target, direction = 1) {
  const diff = current > 180 ? current - 360 : current;
  target = target - diff;
  const result = target < 180 ? target : target - 360;
  if (direction > 0) return result;
  return target < 180 ? 360 - target : target - 360;
}

export function get_point_at_distance(lat1, long1, d, heading, R = 6371) {
  ```
    lat: initial latitude, in degrees
    lon: initial longitude, in degrees
    d: target distance from initial
    heading: (true) heading in degrees
    R: optional radius of sphere, defaults to mean radius of earth

    Returns new lat/lon coordinate {d}km from initial, in degrees
    ```;

  lat1 = radians(lat1);
  long1 = radians(long1);
  const a = radians(heading);
  const lat2 = asin(sin(lat1) * cos(d / R) + cos(lat1) * sin(d / R) * cos(a));
  const dx = cos(d / R) - sin(lat1) * sin(lat2);
  const dy = sin(a) * sin(d / R) * cos(lat1);
  const long2 = long1 + atan2(dy, dx);
  return { lat: degrees(lat2), long: degrees(long2) };
}

export function get_distance_between_points(
  lat1,
  long1,
  lat2,
  long2,
  R = 6371
) {
  ```
    https://stackoverflow.com/a/365853/740553
    ```;
  lat1 = parseFloat(lat1);
  long1 = parseFloat(long1);
  lat2 = parseFloat(lat2); // do we still need parseFloat here?
  long2 = parseFloat(long2);

  const dLat = radians(lat2 - lat1);
  const dLong = radians(long2 - long1);
  lat1 = radians(lat1);
  lat2 = radians(lat2);

  const a =
    sin(dLat / 2) * sin(dLat / 2) +
    sin(dLong / 2) * sin(dLong / 2) * cos(lat1) * cos(lat2);
  const c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return R * c;
}

export function get_heading_from_to(lat1, long1, lat2, long2) {
  lat1 = radians(parseFloat(lat1));
  long1 = radians(parseFloat(long1));
  lat2 = radians(parseFloat(lat2));
  long2 = radians(parseFloat(long2));
  const dLon = long2 - long1;
  const x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon);
  const y = cos(lat2) * sin(dLon);
  return degrees(atan2(y, x));
}

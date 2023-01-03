const { sqrt, log, PI } = Math;
const TAU = PI * 2;

export function deg(v) {
  return (360 * v) / TAU;
}

export function rad(v) {
  return (TAU * v) / 360;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return sqrt(dx * dx + dy * dy);
}

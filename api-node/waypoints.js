import { getDistanceBetweenPoints } from "./utils.js";

export class WayPoints {
  constructor() {
    this.waypoints = [];
  }

  next() {
    return this.waypoints[0];
  }

  add(lat, long, alt) {
    console.log(`adding ${lat},${long}`);
    this.waypoints.push({ lat, long, alt });
  }

  remove(lat, long) {
    console.log(`removing ${lat},${long}`);
    const pos = this.waypoints.findIndex(
      (e) => e.lat === lat && e.long === long
    );
    if (pos > -1) {
      this.waypoints.splice(pos, 1);
    }
  }

  invalidate(lat, long) {
    if (this.waypoints.length === 0) return;

    const w = this.waypoints[0];
    if (getDistanceBetweenPoints(lat, long, w.lat, w.long) < 0.2) {
      this.waypoints.shift();
    }
  }
}

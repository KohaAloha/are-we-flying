globalThis.trails = [];

export class Trail {
  constructor(map, pair) {
    this.map = map;
    this.line = undefined;
    this.coords = [];
    if (pair) this.addLatLng(pair);
  }
  addLatLng(pair) {
    const [lat, long] = pair;
    if (!lat && !long) return;

    this.coords.push(pair);
    if (this.coords.length === 2) {
      this.line = L.polyline([...this.coords]);
      this.line.addTo(this.map);
      globalThis.trails.push(this);
    }
    this.line?.addLatLng(pair);
  }
}

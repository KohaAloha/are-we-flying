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

    const { coords } = this;

    coords.push(pair);
    const l = coords.length;

    if (l < 2) return;

    if (l === 2) {
      this.line = L.polyline([...coords], { className: `flight-trail` });
      this.line.addTo(this.map);
    }

    this.line.addLatLng(pair);
  }
}

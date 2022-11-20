import { deg, dist } from "./utils.js";
import { getAPI } from "./api.js";
import { waitFor } from "./wait-for.js";
import { Monitor } from "./monitor.js";
import { Duncan } from "./locations.js";
import { Gyro } from "./gyroscope.js";
import { Questions } from "./questions.js";

let L; // leaflet
const { sqrt } = Math;

const MODEL_PROPS = ["TITLE", "STATIC_CG_TO_GROUND"];

const ENGINE_PROPS = [
  "ENGINE TYPE",
  "ENG_COMBUSTION:1",
  "ENG_COMBUSTION:2",
  "ENG_COMBUSTION:3",
  "ENG_COMBUSTION:4",
];

const FLIGHT_PROPS = [
  "SIM_ON_GROUND",
  "PLANE_LATITUDE",
  "PLANE_LONGITUDE",
  "GROUND_VELOCITY",
  "PLANE_ALTITUDE",
  "PLANE_ALT_ABOVE_GROUND",
  "GROUND_ALTITUDE",
  "PLANE_BANK_DEGREES",
  "PLANE_PITCH_DEGREES",
  "GPS_GROUND_TRUE_TRACK",
  "PLANE_HEADING_DEGREES_MAGNETIC",
  "PLANE_HEADING_DEGREES_TRUE",
  "CRASH_FLAG",
  "CRASH_SEQUENCE",
];

globalThis.trails = [];

class Trail {
  constructor(map, pair) {
    this.map = map;
    this.line = undefined;
    this.coords = [];
    this.addLatLng(pair);
  }
  addLatLng(pair) {
    this.coords.push(pair);
    if (this.coords.length === 2) {
      this.line = L.polyline([...this.coords]);
      this.line.addTo(this.map);
      globalThis.trails.push(this);
    }
    this.line?.addLatLng(pair);
  }
}

export class Plane {
  constructor(map, location, heading) {
    this.monitor = new Monitor((data) => this.update(data));
    this.init(map, location, heading);
    waitFor(() => getAPI(`http://localhost:8080/loaded-in`)).then(() => {
      Questions.inGame(true);
      this.waitForModel();
    });
    const [lat, long] = Duncan;
    this.lat = lat;
    this.long = long;
  }

  init(map, location, heading) {
    this.vector = {};
    this.orientation = {};
    this.addPlaneIconToMap(map, location, heading);
  }

  async addPlaneIconToMap(map, location = Duncan, heading = 0) {
    L = await waitFor(async () => window.L);
    const props = {
      icon: L.divIcon({
        iconSize: [73 / 2, 50 / 2],
        iconAnchor: [73 / 4, 50 / 4],
        popupAnchor: [10, 10],
        className: `map-pin`,
        html: Gyro.html(heading),
      }),
    };
    this.map = map;
    this.marker = L.marker(location, props).addTo(map);
    this.startNewTrail(location);
  }

  startNewTrail(location) {
    this.trail = new Trail(this.map, location);
  }

  update(data) {
    this.setState(data);
    this.setEngine(data);
    this.updateViz(data);
  }

  async waitForModel() {
    this.monitor.registerAll(MODEL_PROPS, 5000);
  }

  async setState(data) {
    if (data.TITLE === undefined) return;

    this.state = {
      title: data.TITLE,
      cg: data.STATIC_CG_TO_GROUND,
    };

    Questions.modelLoaded(this.state.title);
    this.monitor.muteAll(...MODEL_PROPS);
    this.waitForEngines();
  }

  async waitForEngines() {
    this.monitor.registerAll(ENGINE_PROPS, 2000);
  }

  async setEngine(data) {
    if (data.ENGINE_TYPE === undefined) return;

    const [j1, j2, j3, j4] = [
      data["ENG_COMBUSTION:1"],
      data["ENG_COMBUSTION:2"],
      data["ENG_COMBUSTION:3"],
      data["ENG_COMBUSTION:4"],
    ];

    this.engine = { type: data.ENGINE_TYPE };

    if (j1 + j2 + j3 + j4 > 0) {
      this.monitor.muteAll(...ENGINE_PROPS);
      Questions.enginesRunning(true);
      this.startPolling();
    }
  }

  async startPolling() {
    this.monitor.registerAll(FLIGHT_PROPS, 1000);
  }

  setVector(data) {
    if (data.PLANE_LATITUDE === undefined) return;

    this.vector = {
      lat: data.PLANE_LATITUDE,
      long: data.PLANE_LONGITUDE,
      speed: data.GROUND_VELOCITY,
      alt: data.PLANE_ALTITUDE - this.state.cg,
      palt: data.PLANE_ALT_ABOVE_GROUND - this.state.cg,
      galt: data.GROUND_ALTITUDE,
    };
  }

  setOrientation(data) {
    if (data.PLANE_PITCH_DEGREES === undefined) return;

    this.orientation = {
      airBorn: data.SIM_ON_GROUND === 0,
      heading: deg(data.PLANE_HEADING_DEGREES_TRUE),
      pitch: deg(data.PLANE_PITCH_DEGREES),
      bank: deg(data.PLANE_BANK_DEGREES),
      yaw: deg(
        data.PLANE_HEADING_DEGREES_MAGNETIC - data.GPS_GROUND_TRUE_TRACK
      ),
    };
  }

  setCrashData(data) {
    if (data.CRASH_FLAG === undefined) return;

    this.state.dead = data.CRASH_FLAG > 0 || data.CRASH_SEQUENCE > 0;
    this.state.crashed = {
      value: data.CRASH_FLAG,
      state: data.CRASH_SEQUENCE,
    };
  }

  async updateViz(data) {
    this.setVector(data);
    this.setOrientation(data);
    this.setCrashData(data);

    if (this.orientation.airBorn && this.vector.speed > 0) {
      Questions.inTheAir(true);
    }

    const { alt, galt, palt, speed, lat, long } = this.vector;
    if (lat === undefined || long === undefined) return;

    if (dist(this.lat, this.long, lat, long) > 0.001) {
      this.startNewTrail([lat, long]);
    }

    this.lat = lat;
    this.long = long;

    this.map.setView([lat, long]);
    this.marker.setLatLng(new L.LatLng(lat, long));
    this.trail.addLatLng([lat, long]);

    // TODO: this only needs to run on sim-load
    let pic = `plane.png`;
    let plane = this.state.title.toLowerCase();
    if (plane.includes(`rudder`)) pic = `top rudder.png`;
    if (plane.includes(`vertigo`)) pic = `vertigo.png`;
    if (plane.includes(`d18`)) pic = `beechcraft.png`;
    if (plane.includes(`beaver`)) pic = `beaver.png`;
    if (plane.includes(`carbon`)) pic = `carbon.png`;
    if (plane.includes(` 310`)) pic = `310.png`;
    if (plane.includes(`kodiak`)) pic = `kodiak.png`;
    if (plane.includes(`amphibian`) || plane.includes(`float`)) {
      pic = pic.replace(`.png`, `-float.png`);
    }

    const { airBorn, bank, pitch, heading } = this.orientation;
    const st = document.querySelector(`#plane-icon`);
    st.style.setProperty(`--altitude`, `${sqrt(palt) / 20}`); // 40000 -> 10em, 10000 -> 5em, 1600 -> 2em, 400 -> 1em, 100 -> 1em, 4 -> 0.1em
    st.style.setProperty(`--deg`, heading | 0);
    st.querySelector(`.alt`).textContent = `${alt | 0}'`;
    st.querySelector(`.alt.ground`).textContent = `${galt | 0}'`;
    st.style.setProperty(`--speed`, speed | 0);
    st.querySelector(`.speed`).textContent = `${speed | 0}kts`;
    [...st.querySelectorAll(`img`)].forEach(
      (img) => (img.src = `planes/${pic}`)
    );

    Gyro.setPitchBank(pitch, bank);
  }
}

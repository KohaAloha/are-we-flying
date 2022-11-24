import { deg, dist } from "./utils.js";
import { getAPI } from "./api.js";
import { waitFor } from "./wait-for.js";
import { Monitor } from "./monitor.js";
import { Duncan } from "./locations.js";
import { Gyro } from "./gyroscope.js";
import { Trail } from "./trail.js";
import { Questions } from "./questions.js";
import { getAirplaneSrc } from "./airplane-src.js";

let L; // leaflet
const { abs, sqrt, max } = Math;
let paused = false;

const SIM_PROPS = ["SIM_RUNNING", "SIM_PAUSED", "FLIGHT_RESET"];

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
  "VERTICAL_SPEED",
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

export class Plane {
  constructor(map, location, heading) {
    this.init(map, location, heading);
    this.monitor = new Monitor((data) => this.update(data));
    this.monitor.registerAll(SIM_PROPS, 1000);
    this.waitForInGame();
    const [lat, long] = (this.lastPos = Duncan);
    this.lat = lat;
    this.long = long;
    this.running = false;
  }

  init(map, location, heading) {
    this.vector = {};
    this.orientation = {};
    this.addPlaneIconToMap(map, location, heading);
  }

  async addPlaneIconToMap(map, location = Duncan, heading = 0) {
    L = await waitFor(async () => window.L);
    const props = {
      autoPan: false,
      autoPanOnFocus: false,
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
    this.planeIcon = document.querySelector(`#plane-icon`);
    this.startNewTrail(location);
  }

  startNewTrail(location) {
    this.trail = new Trail(this.map, location);
  }

  update(data) {
    this.checkForReset(data);
    this.checkForSimRunning(data);
    if (!this.running) return;
    this.setState(data);
    this.setEngine(data);
    this.updateViz(data);
  }

  async waitForInGame() {
    waitFor(() => getAPI(`http://localhost:8080/loaded-in`)).then(() => {
      Questions.inGame(true);
      this.waitForModel();
    });
  }

  async waitForModel() {
    this.monitor.registerAll(MODEL_PROPS, 5000);
  }


  checkForReset(data) {
    const { FLIGHT_RESET: reset } = data;
    if (
      reset !== undefined &&
      reset !== false &&
      reset !== this.lastReset &&
      Date.now() - reset < 5000
    ) {
      this.lastReset = reset;
      this.startNewTrail();
    }
  }

  checkForSimRunning(data) {
    const { SIM_RUNNING: running } = data;
    if (running === undefined) return;
    this.running = running;
    if (running === false) {
      this.waitForInGame();
      Questions.resetPlayer();
    }
    if (running === true) {
      paused = false;
      if (data.SIM_PAUSED) {
        paused = true;
        this.planeIcon?.classList[paused ? `add` : `remove`](`paused`);
      }
    }
  }

  async setState(data) {
    if (data.TITLE === undefined) return;

    this.state = {
      title: data.TITLE,
      cg: data.STATIC_CG_TO_GROUND,
    };

    const pic = getAirplaneSrc(this.state.title);
    [...this.planeIcon.querySelectorAll(`img`)].forEach(
      (img) => (img.src = `planes/${pic}`)
    );

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
      vspeed: data.VERTICAL_SPEED,
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
    if (paused) return;

    this.setVector(data);
    this.setOrientation(data);
    this.setCrashData(data);

    if (this.orientation.airBorn && this.vector.speed > 0) {
      Questions.inTheAir(true);
    }

    const { alt, galt, palt, speed, vspeed, lat, long } = this.vector;

    if (lat === undefined || long === undefined) return;

    if (dist(this.lat, this.long, lat, long) > 0.02) {
      this.startNewTrail([lat, long]);
    }

    try {
      this.map.setView([lat, long]);
      this.marker.setLatLng([lat, long]);
      this.trail.addLatLng([lat, long]);
      this.lat = lat;
      this.long = long;
    } catch (e) {
      console.log(`what is triggering this error?`, e);
    }

    const { bank, pitch, heading } = this.orientation;
    const { planeIcon } = this;
    const st = planeIcon.style;
    st.setProperty(`--altitude`, `${sqrt(max(palt, 0)) / 20}`); // 40000 -> 10em, 10000 -> 5em, 1600 -> 2em, 400 -> 1em, 100 -> 1em, 4 -> 0.1em
    st.setProperty(`--deg`, heading | 0);
    st.setProperty(`--speed`, speed | 0);
    let sign = vspeed < 0 ? `-` : `+`;
    planeIcon.querySelector(`.alt`).textContent = `${alt | 0}' (${sign}${abs(
      vspeed | 0
    )}fpm)`;
    planeIcon.querySelector(`.alt.ground`).textContent = `${galt | 0}'`;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;

    Gyro.setPitchBank(pitch, bank);
  }
}

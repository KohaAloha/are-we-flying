import { deg, dist } from "./utils.js";
import { getAPI, setAPI } from "./api.js";
import { waitFor } from "./wait-for.js";
import { Monitor } from "./event-monitor/monitor.js";
import { Duncan } from "./locations.js";
import { Gyro } from "./gyroscope.js";
import { Trail } from "./trail.js";
import { Questions } from "./questions.js";
import { getAirplaneSrc } from "./airplane-src.js";
import { feedAutopilot } from "./autopilot/autopilot.js";

let L; // leaflet
const { abs, sqrt, max } = Math;
let paused = false;

const SIM_PROPS = [
  "CAMERA_STATE",
  "CRASH_FLAG",
  "CRASH_SEQUENCE",
  "FLIGHT_RESET",
  "SIM_PAUSED",
  "SIM_RUNNING",
];

const MODEL_PROPS = ["TITLE", "STATIC_CG_TO_GROUND"];

const ENGINE_PROPS = [
  "ENGINE_TYPE",
  "ENG_COMBUSTION:1",
  "ENG_COMBUSTION:2",
  "ENG_COMBUSTION:3",
  "ENG_COMBUSTION:4",
];

const FLIGHT_PROPS = [
  "AIRSPEED_TRUE",
  "AUTOPILOT_MASTER",
  "GPS_GROUND_TRUE_TRACK",
  "GROUND_ALTITUDE",
  "INDICATED_ALTITUDE",
  "PLANE_ALT_ABOVE_GROUND",
  "PLANE_BANK_DEGREES",
  "PLANE_HEADING_DEGREES_MAGNETIC",
  "PLANE_HEADING_DEGREES_TRUE",
  "PLANE_LATITUDE",
  "PLANE_LONGITUDE",
  "PLANE_PITCH_DEGREES",
  "SIM_ON_GROUND",
  "VERTICAL_SPEED",
];

export class Plane {
  constructor(map, location, heading) {
    this.init(map, location, heading);
    this.monitor = new Monitor((data) => this.update(data));
    this.monitor.registerAll(SIM_PROPS, 1000);
    const [lat, long] = (this.lastPos = Duncan);
    this.lat = lat;
    this.long = long;
    this.state = {};
    this.running = 0;
    this.lastUpdate = 0;
    this.waitForInGame();
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

  update(data = {}) {
    if (data === null) return;
    this.checkForReset(data);
    this.checkForSimRunning(data);
    if (this.running < 3) return;
    this.setState(data);
    this.setEngine(data);
    this.updateViz(data);
  }

  async waitForInGame() {
    waitFor(async () => {
      try {
        const { SIM_RUNNING: value } = await getAPI(`SIM_RUNNING`);
        return (value | 0) === 3;
      } catch (e) {
        return 0;
      }
    }).then(() => {
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
    const {
      SIM_RUNNING: running,
      CRASH_FLAG: crashed,
      CRASH_SEQUENCE: reason,
    } = data;

    if (running === undefined) return;

    this.running = running;
    if (running < 3) {
      if (data.SIM_PAUSED) {
        // console.log(`player is paused in-sim`)
        paused = true;
        this.planeIcon?.classList.add(`paused`);
      } else {
        // console.log(`player not interacting in-sim`)
        paused = false;
        this.waitForInGame();
        Questions.resetPlayer();
      }
    }
    if (running >= 3) {
      paused = false;
      this.planeIcon?.classList.remove(`paused`);
      this.planeIcon?.classList.remove(`dead`);
    }

    if (crashed || reason) {
      Questions.planeCrashed(true);
      this.planeIcon?.classList.add(`dead`);
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
    this.startPolling();
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
      speed: data.AIRSPEED_TRUE,
      vspeed: data.VERTICAL_SPEED,
      alt: data.INDICATED_ALTITUDE,
      palt: data.PLANE_ALT_ABOVE_GROUND - this.state.cg,
      galt: data.GROUND_ALTITUDE,
    };
  }

  setOrientation(data) {
    if (data.PLANE_PITCH_DEGREES === undefined) return;

    this.orientation = {
      airBorn: data.SIM_ON_GROUND === 0 || this.vector.alt > this.vector.galt + 30,
      heading: deg(data.PLANE_HEADING_DEGREES_MAGNETIC),
      pitch: deg(data.PLANE_PITCH_DEGREES),
      bank: deg(data.PLANE_BANK_DEGREES),
      yaw: deg(
        data.PLANE_HEADING_DEGREES_MAGNETIC - data.GPS_GROUND_TRUE_TRACK
      ),
    };
  }

  async updateViz(data) {
    if (paused) return;
    const now = Date.now();

    this.setVector(data);
    this.setOrientation(data);

    if (this.orientation.airBorn && this.vector.speed > 0) {
      Questions.inTheAir(true);
      Questions.usingAutoPilot(data.AUTOPILOT_MASTER);
    }

    const { alt, galt, palt, speed, vspeed, lat, long } = this.vector;

    if (lat === undefined || long === undefined) return;

    if (dist(this.lat, this.long, lat, long) > 0.02) {
      this.startNewTrail([lat, long]);
    }

    const pair = [lat, long];
    this.map.setView(pair);
    this.marker.setLatLng(pair);

    try {
      this.trail.addLatLng(pair);
    } catch (e) {
      // console.log(`what is triggering this error?`, e);
      // console.log(pair, typeof lat, typeof long);
    }

    this.lat = lat;
    this.long = long;

    const { airBorn, bank, pitch, heading } = this.orientation;
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
    feedAutopilot(airBorn, alt, pitch,  vspeed, speed, bank, heading);

    this.lastUpdate = now;
  }
}

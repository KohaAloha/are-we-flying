import { deg, dist } from "./utils.js";
import { getAPI, setAPI } from "./api.js";
import { waitFor } from "./wait-for.js";
import { Monitor } from "./event-monitor/monitor.js";
import { Duncan } from "./locations.js";
import { Autopilot } from "./autopilot.js";
import { Gyro } from "./gyroscope.js";
import { Trail } from "./trail.js";
import { Questions } from "./questions.js";
import { getAirplaneSrc } from "./airplane-src.js";
import { MapMarker } from "./map-marker.js";
import { setupGraph } from "./svg-graph.js";

let L; // leaflet
const { abs, cos, sin, sqrt, max, PI: π } = Math;
let paused = false;
let graph;

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
  "AILERON_TRIM_PCT",
  "AIRSPEED_TRUE",
  "AUTOPILOT_MASTER",
  "ELEVATOR_TRIM_POSITION",
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
  "TURN_INDICATOR_RATE",
  "VERTICAL_SPEED",
];

let centerBtn;

export class Plane {
  constructor(map, location, heading) {
    this.init(map, location, heading);
    this.monitor = new Monitor((data) => this.update(data));
    this.autopilot = new Autopilot();
    const [lat, long] = (this.lastPos = Duncan);
    this.lat = lat;
    this.long = long;
    this.state = {};
    this.running = 0;
    this.lastUpdate = 0;
    this.waitForInGame();
    centerBtn = document.getElementById(`center-map`);
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
        html: MapMarker.getHTML(heading),
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
    this.monitor.registerAll(SIM_PROPS, 1000);
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
    if (!graph) {
      graph = setupGraph(document.body, 600, 400);
      graph.setProperties(
        {
          label: `ground`,
          min: 0,
          max: 5000,
          fill: {
            baseline: 0,
            color: `saddlebrown`,
          },
        },
        {
          labels: `altitude, atarget`,
          min: 0,
          max: 5000,
        },
        {
          labels: `trim, atrim`,
          limit: 50,
        },
        {
          label: `bank`,
          limit: 40,
        },
        {
          label: `turn rate`,
          limit: 6,
        },
        {
          label: `vspeed`,
          limit: 1500,
        },
        {
          labels: `heading, htarget`,
          limit: 180,
        },
      );
      graph.start();
    }
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
      airBorn:
        data.SIM_ON_GROUND === 0 || this.vector.alt > this.vector.galt + 30,
      heading: deg(data.PLANE_HEADING_DEGREES_MAGNETIC),
      trueHeading: deg(data.PLANE_HEADING_DEGREES_TRUE),
      turnRate: deg(data.TURN_INDICATOR_RATE),
      pitch: deg(data.PLANE_PITCH_DEGREES),
      trim: data.ELEVATOR_TRIM_POSITION,
      aTrim: data.AILERON_TRIM_PCT,
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
    if (centerBtn.checked) this.map.setView(pair);
    this.marker.setLatLng(pair);

    try {
      this.trail.addLatLng(pair);
    } catch (e) {
      // console.log(`what is triggering this error?`, e);
      // console.log(pair, typeof lat, typeof long);
    }

    this.lat = lat;
    this.long = long;

    const {
      airBorn,
      bank,
      pitch,
      trim,
      aTrim,
      heading,
      trueHeading,
      turnRate,
    } = this.orientation;
    const { planeIcon } = this;
    const st = planeIcon.style;
    st.setProperty(`--altitude`, `${sqrt(max(palt, 0)) / 20}`); // 40000 -> 10em, 10000 -> 5em, 1600 -> 2em, 400 -> 1em, 100 -> 1em, 4 -> 0.1em
    st.setProperty(`--deg`, trueHeading | 0);
    st.setProperty(`--speed`, speed | 0);
    st.setProperty(`--true-diff`, (trueHeading - heading) | 0);

    let altitude =
      (galt | 0) === 0 ? `${alt | 0}'` : `${palt | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitude;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;

    Gyro.setPitchBank(pitch, bank);

    graph.addValue(`altitude`, alt);
    // graph.addValue(`pitch`, pitch);
    const trimToDegree = (v) => (v / (Math.PI / 10)) * 90;
    graph.addValue(`trim`, trimToDegree(trim));
    graph.addValue(`atrim`, aTrim * 100);
    graph.addValue(`bank`, bank);
    graph.addValue(`turn rate`, turnRate);
    graph.addValue(`vspeed`, vspeed);
    graph.addValue(`ground`, galt);
    graph.addValue(`heading`, heading - 180);

    if (this.autopilot.heading.value) {
      let target = parseInt(this.autopilot.heading.value);
      graph.addValue(`htarget`, target - 180);
      target = parseInt(this.autopilot.altitude.value);
      graph.addValue(`atarget`, target);
    }

    this.autopilot.followTerrain(lat, long, trueHeading);
    this.lastUpdate = now;
  }
}

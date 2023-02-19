import { State } from "./state.js";
import {
  AUTO_TAKEOFF,
  LEVEL_FLIGHT,
  HEADING_MODE,
  VERTICAL_SPEED_HOLD,
  ALTITUDE_HOLD,
  ACROBATIC,
  INVERTED_FLIGHT,
} from "./constants.js";
import { WayPoints } from "./waypoints.js";
import { flyLevel } from "./fly-level.js";
import { verticalHold } from "./vertical-hold.js";
import { autoTakeoff } from "./auto-takeoff.js";

export class AutoPilot {
  constructor(api) {
    this.api = api;
    this.auto_pilot_enabled = false;
    this.AP_INTERVAL = 500;
    this.modes = {
      [AUTO_TAKEOFF]: false,
      [LEVEL_FLIGHT]: false,
      [HEADING_MODE]: false,
      [VERTICAL_SPEED_HOLD]: false,
      [ALTITUDE_HOLD]: false,
      [ACROBATIC]: false, // use the special acrobatic code instead?
      [INVERTED_FLIGHT]: false, // fly upside down?
    };
    this.bootstrap();
  }

  bootstrap() {
    // Set up values we need during the autopilot main loop
    this.paused = false;
    this.prev_state = new State();
    this.anchor = { x: 0, y: 0, z: 0 };
    this.acrobatic = false;
    this.inverted = false;
    this.waypoints = new WayPoints();
  }

  setPaused(value) {
    this.paused = value;
  }

  toggle_auto_pilot() {
    console.log(`toggling autopilot`);
    this.auto_pilot_enabled = !this.auto_pilot_enabled;
    if (this.auto_pilot_enabled) {
      this.prev_call_time = Date.now();
      this.run();
    }
  }

  add_waypoint(lat, long, alt = undefined) {
    this.waypoints.add(lat, long, alt);
  }

  remove_waypoint(lat, long) {
    this.waypoints.remove(lat, long);
  }

  run() {
    setTimeout(() => this.run_autopilot(), this.AP_INTERVAL);
  }

  async get(...names) {
    return this.api.get(...names);
  }

  async set(name, value) {
    this.api.set(name, value);
  }

  get_auto_pilot_parameters() {
    const state = {
      AP_STATE: this.auto_pilot_enabled,
      waypoints: this.waypoints,
    };
    Object.entries(this.modes).forEach(([key, value]) => {
      state[key] = value;
    });
    return state;
  }

  toggle(type) {
    const { modes } = this;
    if (modes[type] === undefined) return;
    this.set_target(type, !modes[type]);
  }

  set_target(type, value) {
    const { modes } = this;
    if (modes[type] === undefined) return;
    modes[type] = value;
    this.processChange(type, modes[type]);
  }

  async processChange(type, value) {
    if (type === ALTITUDE_HOLD) {
      console.log(`Engaging altitude hold at ${value} feet`);
      this.prev_alt = await this.get("INDICATED_ALTITUDE");
    }

    if (type === HEADING_MODE) {
      console.log(`Engaging heading hold at ${value} degrees`);
      this.set("AUTOPILOT_HEADING_LOCK_DIR", value);
    }

    if (type === AUTO_TAKEOFF) {
      this.AP_INTERVAL = value ? 200 : 500;
    }

    // special actions for when turning a service on:
    if (value === true) {
      if (type === VERTICAL_SPEED_HOLD) {
        console.log(`Engaging vertical speed hold`);
        const { ELEVATOR_TRIM_POSITION: y } = await this.get(
          "ELEVATOR_TRIM_POSITION"
        );
        this.anchor.y = y;
      }

      if (type === LEVEL_FLIGHT) {
        console.log(`Engaging level mode`);
        const { AILERON_TRIM_PCT: x } = await this.get("AILERON_TRIM_PCT");
        this.anchor.x = x;
      }
    }
  }

  async run_autopilot() {
    // This is our master autopilot entry point,
    // grabbing the current state from MSFS, and
    // forwarding it to the relevant AP handlers.

    if (this.crashed) return;

    if (!this.auto_pilot_enabled) return;

    // If the autopilot is enabled, even if there
    // are errors due to MSFS glitching, or the DLL
    // handling glitching, or values somehow having
    // gone missing etc. etc: schedule the next call

    this.run();

    //  Are we flying, or paused/in menu/etc?
    if (this.paused) return;

    const data = await this.get(
      `SIM_ON_GROUND`,
      `AIRSPEED_TRUE`,
      `PLANE_BANK_DEGREES`,
      `TURN_INDICATOR_RATE`,
      `PLANE_LATITUDE`,
      `PLANE_LONGITUDE`,
      `PLANE_HEADING_DEGREES_MAGNETIC`,
      `PLANE_HEADING_DEGREES_TRUE`,
      `INDICATED_ALTITUDE`,
      `VERTICAL_SPEED`,
      `ELEVATOR_TRIM_POSITION`,
      `AILERON_TRIM_PCT`,
      `ELEVATOR_TRIM_UP_LIMIT`,
      `ELEVATOR_TRIM_DOWN_LIMIT`
    );

    const state = new State(data, this.prev_state);

    // If we're close a waypoint, remove it.
    this.waypoints.invalidate(state.latitude, state.longitude);

    // Are we in auto-takeoff?
    if (this.modes[AUTO_TAKEOFF]) {
      autoTakeoff(this, state);
    }

    // Do we need to level the wings / fly a specific heading?
    if (this.modes[LEVEL_FLIGHT]) {
      flyLevel(this, state);
    }

    // Do we need to hold our altitude / fly a specific altitude?
    if (this.modes[VERTICAL_SPEED_HOLD]) {
      verticalHold(this, state);
    }

    this.prev_state = state;
  }
}

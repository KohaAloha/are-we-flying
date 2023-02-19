import {
  AUTO_TAKEOFF,
  ALTITUDE_HOLD,
  HEADING_MODE,
  LEVEL_FLIGHT,
  VERTICAL_SPEED_HOLD,
} from "./constants.js";
const { abs } = Math;
import { degrees, constrain_map, get_compass_diff } from "./utils.js";

let takeoffHeading = false;
let liftoff = false;
let levelOut = false;
let easeElevator = false;

// TODO stop using globals~


export async function autoTakeoff(autopilot, state) {
  const { api } = autopilot;

  const { TOTAL_WEIGHT: total_weight, DESIGN_SPEED_VS1: vs1 } = await api.get(`TOTAL_WEIGHT`, `DESIGN_SPEED_VS1`);
  const vs12 = vs1 * vs1;

  if (!liftoff) {
    // We don't have a database of which plane needs how much flaps for
    // takeoff, so we just... don't set flaps. Use the whole runway,
    // that's what it's for.
    let flaps = await api.get(`FLAPS_HANDLE_INDEX:1`);
    flaps = flaps[`FLAPS_HANDLE_INDEX:1`];
    if (flaps !== undefined && flaps !== 0) {
      api.set("FLAPS_HANDLE_INDEX:1", 0);
    }

    // Is the parking brake engaged?
    const { BRAKE_PARKING_POSITION: brake } = await api.get(
      "BRAKE_PARKING_POSITION"
    );
    if (brake === 1) {
      // Take off the brakes and return early. We'll start throttling
      // up on the next call.
      return api.trigger("PARKING_BRAKES");
    }

    // Throttle up until we're at max throttle.
    let { NUMBER_OF_ENGINES: engine_count } = await api.get(
      "NUMBER_OF_ENGINES"
    );
    for (let count = 1; count <= engine_count; count++) {
      let simvar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
      let throttle = await api.get(simvar);
      throttle = throttle[simvar];
      if (throttle < 100) {
        // Note that we're explicitly checking for < 100% because many
        // engines let you "overdrive" them for short periods of time
        // and then they burn out and you fall out of the sky...
        api.set(simvar, throttle + 1);
      }
    }
  }

  const on_ground = state.on_ground;
  const current_speed = state.speed;
  const vs = state.vertical_speed;
  const heading = degrees(state.heading);

  // Record our initial heading so we can try to stick to that
  if (!takeoffHeading) {
    takeoffHeading = heading;
    autopilot.set_target(HEADING_MODE, takeoffHeading);
  }

  // Do a poor job of auto-rudder:
  if (on_ground) {
    // const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);

    const diff = get_compass_diff(heading, takeoffHeading);

    // const factor = constrain_map(total_weight, 3000, 6500, 0.05, 0.3);
    const factor = constrain_map(vs12, 2500, 6000, 0.05, 0.3)
    let rudder = factor * diff;

    // The slower we're going, the more rudder we need.
    if (current_speed > 60) {
      rudder = constrain_map(
        current_speed,
        60,
        100,
        0.5 * rudder,
        0.2 * rudder
      );
    } else if (current_speed > 40) {
      rudder = constrain_map(current_speed, 40, 60, 0.8 * rudder, 0.5 * rudder);
    } else if (current_speed > 20) {
      rudder = constrain_map(current_speed, 20, 40, 1.2 * rudder, 0.8 * rudder);
    }

    api.set("RUDDER_POSITION", rudder);

  } else {
    const { RUDDER_POSITION: rudder } = await api.get("RUDDER_POSITION");
    api.set("RUDDER_POSITION", rudder / 2);
  }

  // if speed is greater than rotation speed, rotate.
  // (Or if the wheels are off the ground before then!)
  const { DESIGN_SPEED_MIN_ROTATION: min_rotate } = await api.get(
    "DESIGN_SPEED_MIN_ROTATION"
  );

  if (min_rotate) {
    const rotate_speed = 1.1 * min_rotate;
    console.log(`speed: ${current_speed}, rotate at ${rotate_speed}`);

    if (!on_ground || current_speed > rotate_speed) {
      console.log(
        `rotate. on ground: ${on_ground}, lift off: ${liftoff}, level out: ${levelOut}, vs: ${vs}`
      );

      const { ELEVATOR_POSITION: elevator } = await api.get(
        "ELEVATOR_POSITION"
      );

      // Ease stick back to neutral
      if (levelOut && abs(vs) < 100) {
        if (elevator < 0.015) {
          autopilot.set_target(AUTO_TAKEOFF, false);
        } else {
          console.log(`(1) ease back, elevator = ${elevator}`);
          const ease_back = easeElevator / 20;
          api.set("ELEVATOR_POSITION", elevator - ease_back);
        }
      } else if (liftoff && vs > 1000 && elevator > 0) {
        console.log(`(2) ease back, elevator = ${elevator}`);
        api.set("ELEVATOR_POSITION", elevator / 5);
      }

      // Pull back on the stick
      else if (liftoff === false) {
        liftoff = true;
        const pull_back = constrain_map(total_weight, 3000, 6500, 0.005, 0.5);
        console.log(`\nKICK: ${pull_back}\n`);
        api.set("ELEVATOR_POSITION", pull_back);
        autopilot.anchor.y = constrain_map(total_weight, 3000, 6500, 0, 0.1);
      }
    }
  }

  // Hand off control to the "regular" autopilot once we have a safe enough positive rate.
  const limit = constrain_map(total_weight, 3000, 6500, 300, 1000);
  if (!levelOut && vs > limit) {
    levelOut = true;
    easeElevator = await api.get(`ELEVATOR_POSITION`);
    easeElevator = easeElevator[`ELEVATOR_POSITION`];
    // api.set('ELEVATOR_POSITION', 0)  // we want to restore this to zero later...
    api.set("RUDDER_POSITION", 0);
    api.set("FLAPS_HANDLE_INDEX:1", 0);
    api.trigger("GEAR_UP");
    autopilot.set_target(VERTICAL_SPEED_HOLD, true);
    autopilot.set_target(ALTITUDE_HOLD, 1500);
    autopilot.set_target(LEVEL_FLIGHT, true);
  }
}

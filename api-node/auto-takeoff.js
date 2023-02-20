import {
  AUTO_TAKEOFF,
  ALTITUDE_HOLD,
  HEADING_MODE,
  LEVEL_FLIGHT,
  VERTICAL_SPEED_HOLD,
} from "./constants.js";
const { abs } = Math;
import { degrees, constrainMap, getCompassDiff } from "./utils.js";

let takeoffHeading = false;
let liftoff = false;
let levelOut = false;
let easeElevator = false;

// TODO stop using globals~


export async function autoTakeoff(autopilot, state) {
  const { api } = autopilot;

  const { TOTAL_WEIGHT: totalWeight, DESIGN_SPEED_VS1: vs1 } = await api.get(`TOTAL_WEIGHT`, `DESIGN_SPEED_VS1`);
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
    let { NUMBER_OF_ENGINES: engineCount } = await api.get(
      "NUMBER_OF_ENGINES"
    );
    for (let count = 1; count <= engineCount; count++) {
      let simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
      let throttle = await api.get(simVar);
      throttle = throttle[simVar];
      if (throttle < 100) {
        // Note that we're explicitly checking for < 100% because many
        // engines let you "overdrive" them for short periods of time
        // and then they burn out and you fall out of the sky...
        api.set(simVar, throttle + 1);
      }
    }
  }

  const onGround = state.onGround;
  const currentSpeed = state.speed;
  const vs = state.verticalSpeed;
  const heading = degrees(state.heading);

  // Record our initial heading so we can try to stick to that
  if (!takeoffHeading) {
    takeoffHeading = heading;
    autopilot.setTarget(HEADING_MODE, takeoffHeading);
  }

  // Do a poor job of auto-rudder:
  if (onGround) {
    // const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);

    const diff = getCompassDiff(heading, takeoffHeading);

    // const factor = constrainMap(totalWeight, 3000, 6500, 0.05, 0.3);
    const factor = constrainMap(vs12, 2500, 6000, 0.05, 0.3)
    let rudder = factor * diff;

    // The slower we're going, the more rudder we need.
    if (currentSpeed > 60) {
      rudder = constrainMap(
        currentSpeed,
        60,
        100,
        0.5 * rudder,
        0.2 * rudder
      );
    } else if (currentSpeed > 40) {
      rudder = constrainMap(currentSpeed, 40, 60, 0.8 * rudder, 0.5 * rudder);
    } else if (currentSpeed > 20) {
      rudder = constrainMap(currentSpeed, 20, 40, 1.2 * rudder, 0.8 * rudder);
    }

    api.set("RUDDER_POSITION", rudder);

  } else {
    const { RUDDER_POSITION: rudder } = await api.get("RUDDER_POSITION");
    api.set("RUDDER_POSITION", rudder / 2);
  }

  // if speed is greater than rotation speed, rotate.
  // (Or if the wheels are off the ground before then!)
  const { DESIGN_SPEED_MIN_ROTATION: minRotate } = await api.get(
    "DESIGN_SPEED_MIN_ROTATION"
  );

  if (minRotate) {
    const rotateSpeed = 0.9 * minRotate;
    console.log(`speed: ${currentSpeed}, rotate at ${rotateSpeed}`);

    if (!onGround || currentSpeed > rotateSpeed) {
      console.log(
        `rotate. on ground: ${onGround}, lift off: ${liftoff}, level out: ${levelOut}, vs: ${vs}`
      );

      const { ELEVATOR_POSITION: elevator } = await api.get(
        "ELEVATOR_POSITION"
      );

      // Ease stick back to neutral
      if (levelOut && abs(vs) < 100) {
        if (elevator < 0.015) {
          autopilot.setTarget(AUTO_TAKEOFF, false);
        } else {
          console.log(`(1) ease back, elevator = ${elevator}`);
          const easeBack = easeElevator / 20;
          api.set("ELEVATOR_POSITION", elevator - easeBack);
        }
      } else if (liftoff && vs > 1000 && elevator > 0) {
        console.log(`(2) ease back, elevator = ${elevator}`);
        api.set("ELEVATOR_POSITION", elevator / 5);
      }

      // Pull back on the stick
      else if (liftoff === false) {
        liftoff = true;
        const pullBack = constrainMap(totalWeight, 3000, 6500, 0.005, 0.5);
        console.log(`\nKICK: ${pullBack}\n`);
        api.set("ELEVATOR_POSITION", pullBack);
        autopilot.anchor.y = constrainMap(totalWeight, 3000, 6500, 0, 0.1);
      }
    }
  }

  // Hand off control to the "regular" autopilot once we have a safe enough positive rate.
  const limit = constrainMap(totalWeight, 3000, 6500, 300, 1000);
  if (!levelOut && vs > limit) {
    levelOut = true;
    easeElevator = await api.get(`ELEVATOR_POSITION`);
    easeElevator = easeElevator[`ELEVATOR_POSITION`];
    // api.set('ELEVATOR_POSITION', 0)  // we want to restore this to zero later...
    api.set("RUDDER_POSITION", 0);
    api.set("FLAPS_HANDLE_INDEX:1", 0);
    api.trigger("GEAR_UP");
    autopilot.setTarget(VERTICAL_SPEED_HOLD, true);
    autopilot.setTarget(ALTITUDE_HOLD, 1500);
    autopilot.setTarget(LEVEL_FLIGHT, true);
  }
}

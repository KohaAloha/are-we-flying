const { abs } = Math;
import {
  degrees,
  radians,
  constrainMap,
  getCompassDiff,
  getHeadingFromTo,
} from "./utils.js";
import { HEADING_MODE } from "./constants.js";

export async function flyLevel(autopilot, state) {
  const { anchor } = autopilot;

  let bank = degrees(state.bankAngle);
  let maxBank = constrainMap(state.speed, 50, 200, 10, 30);

  let dBank = state.dBank;
  let maxdBank = radians(1);

  let step = constrainMap(state.speed, 50, 150, radians(1), radians(2));
  let targetBank = 0;

  let turnRate = degrees(state.turnRate);
  let maxturnRate = 3;

  let heading = degrees(state.heading);

  // Are we supposed to fly a specific compass heading?
  let waypoint = autopilot.waypoints.next();
  if (waypoint) {
    lat = state.latitude;
    long = state.longitude;
    console.log(`flying waypoint: ${lat},${long}`);
    lat2 = waypoint.lat;
    long2 = waypoint.long;
    heading = getHeadingFromTo(lat, long, lat2, long2);
    heading =
      (heading - degrees(state.trueHeading - state.heading) + 360) % 360;
    autopilot.setTarget(HEADING_MODE, heading);
  }

  let flightHeading = autopilot.modes[HEADING_MODE];
  if (flightHeading) {
    const h_diff = getCompassDiff(heading, flightHeading);
    targetBank = constrainMap(h_diff, -30, 30, maxBank, -maxBank);
    maxturnRate = constrainMap(abs(h_diff), 0, 10, 0.02, maxturnRate);
  }

  // Now then: we want a diff==0 and dBank==0, so let's minimize both!

  // First off, what is our banking difference?
  let diff = targetBank - bank;

  // correct for non-zero diff first:
  anchor.x += -constrainMap(diff, -maxBank, maxBank, -step, step);

  // then correct for non-zero dBank
  anchor.x += constrainMap(
    dBank,
    -maxdBank,
    maxdBank,
    -0.5 * step,
    0.5 * step
  );

  // and then if we're turning, make sure we're not actually turning too fast
  if (turnRate < -maxturnRate || turnRate > maxturnRate) {
    const overshoot =
      turnRate > 0 ? turnRate - maxturnRate : turnRate + maxturnRate;
    const nudge = constrainMap(
      overshoot,
      -maxturnRate,
      maxturnRate,
      -step / 5,
      step / 5
    );
    anchor.x -= nudge;
  }

  autopilot.set("AILERON_TRIM_PCT", anchor.x);
}

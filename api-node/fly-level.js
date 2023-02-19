const { abs } = Math;
import {
  degrees,
  radians,
  constrain_map,
  get_compass_diff,
  get_heading_from_to,
} from "./utils.js";
import { HEADING_MODE } from "./constants.js";

export async function flyLevel(autopilot, state) {
  const { anchor } = autopilot;

  let bank = degrees(state.bank_angle);
  let max_bank = constrain_map(state.speed, 50, 200, 10, 30);

  let dBank = state.dBank;
  let max_dBank = radians(1);

  let step = constrain_map(state.speed, 50, 150, radians(1), radians(2));
  let target_bank = 0;

  let turn_rate = degrees(state.turn_rate);
  let max_turn_rate = 3;

  let heading = degrees(state.heading);

  // Are we supposed to fly a specific compass heading?
  let waypoint = autopilot.waypoints.next();
  if (waypoint) {
    lat = state.latitude;
    long = state.longitude;
    console.log(`flying waypoint: ${lat},${long}`);
    lat2 = waypoint.lat;
    long2 = waypoint.long;
    heading = get_heading_from_to(lat, long, lat2, long2);
    heading =
      (heading - degrees(state.true_heading - state.heading) + 360) % 360;
    autopilot.set_target(HEADING_MODE, heading);
  }

  let flight_heading = autopilot.modes[HEADING_MODE];
  if (flight_heading) {
    const h_diff = get_compass_diff(heading, flight_heading);
    target_bank = constrain_map(h_diff, -30, 30, max_bank, -max_bank);
    max_turn_rate = constrain_map(abs(h_diff), 0, 10, 0.02, max_turn_rate);
  }

  // Now then: we want a diff==0 and dBank==0, so let's minimize both!

  // First off, what is our banking difference?
  let diff = target_bank - bank;

  // correct for non-zero diff first:
  anchor.x += -constrain_map(diff, -max_bank, max_bank, -step, step);

  // then correct for non-zero dBank
  anchor.x += constrain_map(
    dBank,
    -max_dBank,
    max_dBank,
    -0.5 * step,
    0.5 * step
  );

  // and then if we're turning, make sure we're not actually turning too fast
  if (turn_rate < -max_turn_rate || turn_rate > max_turn_rate) {
    const overshoot =
      turn_rate > 0 ? turn_rate - max_turn_rate : turn_rate + max_turn_rate;
    const nudge = constrain_map(
      overshoot,
      -max_turn_rate,
      max_turn_rate,
      -step / 5,
      step / 5
    );
    anchor.x -= nudge;
  }

  autopilot.set("AILERON_TRIM_PCT", anchor.x);
}

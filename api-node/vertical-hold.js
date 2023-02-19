const { abs } = Math;
import { radians, constrain_map } from "./utils.js";

import { ALTITUDE_HOLD } from "./constants.js";

export async function verticalHold(autopilot, state) {
  // anchor adjustments: positive numbers raise the nose, negative numbers drop it down.
  const { anchor, modes } = autopilot;

  // How much should we trim by?
  let trim_limit = state.pitch_trim_limit[0];
  trim_limit = trim_limit === 0 ? 10 : trim_limit;
  let trim_step = constrain_map(
    trim_limit,
    5,
    20,
    radians(0.001),
    radians(0.01)
  );
  let kick = 10 * trim_step;

  let VS = state.vertical_speed;
  let max_VS = 1000; // TODO: the max VS is dictated by the optimal climb speed rather than an actual VS measure...

  let dVS = state.dVS;
  let max_dVS = 20;

  let target_VS = 0;

  // Are we supposed to fly a specific altitude?
  let target_altitude = modes[ALTITUDE_HOLD];
  if (target_altitude) {
    const alt_diff = target_altitude - state.altitude;
    target_VS = constrain_map(alt_diff, -200, 200, -max_VS, max_VS);
  }

  // If we're too low, diff will be positive.
  // If we're too high, diff will be negative.
  let diff = target_VS - VS;

  // Once we know our diff, update our maximum allowable acceleration
  max_dVS = 1 + constrain_map(abs(diff), 0, 100, 0, max_dVS - 1);

  // print(f'> VS: {VS}, target: {target_VS}, diff: {diff}, dVS: {dVS}, max_dVS: {max_dVS}')

  // Are we accelerating too much? we need to pitch in the opposite direction:
  if (dVS < -max_dVS || dVS > max_dVS) {
    anchor.y += constrain_map(dVS, -10 * max_dVS, 10 * max_dVS, kick, -kick);
  }

  // Also, if we're past safe vertical speeds, bring us back to safe speeds
  if ((VS < -max_VS && dVS <= 0) || (VS > max_VS && dVS >= 0)) {
    anchor.y += constrain_map(VS, -max_VS, max_VS, trim_step, -trim_step);
  }

  // And then regardless of those two protection measures: nudge us towards the correct vertical speed
  anchor.y += constrain_map(diff, -1000, 1000, -kick, kick);

  console.log(state.altitude, target_altitude, VS, target_VS);
  autopilot.set("ELEVATOR_TRIM_POSITION", anchor.y);
}

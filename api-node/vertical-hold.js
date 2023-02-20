const { abs } = Math;
import { radians, constrainMap } from "./utils.js";

import { ALTITUDE_HOLD } from "./constants.js";

export async function verticalHold(autopilot, state) {
  // anchor adjustments: positive numbers raise the nose, negative numbers drop it down.
  const { anchor, modes } = autopilot;

  // How much should we trim by?
  let trimLimit = state.pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  let trimStep = constrainMap(
    trimLimit,
    5,
    20,
    radians(0.001),
    radians(0.01)
  );
  let kick = 10 * trimStep;

  let VS = state.verticalSpeed;
  let maxVS = 1000; // TODO: the max VS is dictated by the optimal climb speed rather than an actual VS measure...

  let dVS = state.dVS;
  let maxdVS = 20;

  let targetVS = 0;

  // Are we supposed to fly a specific altitude?
  let targetAltitude = modes[ALTITUDE_HOLD];
  if (targetAltitude) {
    const alt_diff = targetAltitude - state.altitude;
    targetVS = constrainMap(alt_diff, -200, 200, -maxVS, maxVS);
  }

  // If we're too low, diff will be positive.
  // If we're too high, diff will be negative.
  let diff = targetVS - VS;

  // Once we know our diff, update our maximum allowable acceleration
  maxdVS = 1 + constrainMap(abs(diff), 0, 100, 0, maxdVS - 1);

  // print(f'> VS: {VS}, target: {target_VS}, diff: {diff}, dVS: {dVS}, max_dVS: {max_dVS}')

  // Are we accelerating too much? we need to pitch in the opposite direction:
  if (dVS < -maxdVS || dVS > maxdVS) {
    anchor.y += constrainMap(dVS, -10 * maxdVS, 10 * maxdVS, kick, -kick);
  }

  // Also, if we're past safe vertical speeds, bring us back to safe speeds
  if ((VS < -maxVS && dVS <= 0) || (VS > maxVS && dVS >= 0)) {
    anchor.y += constrainMap(VS, -maxVS, maxVS, trimStep, -trimStep);
  }

  // And then regardless of those two protection measures: nudge us towards the correct vertical speed
  anchor.y += constrainMap(diff, -1000, 1000, -kick, kick);

  console.log(state.altitude, targetAltitude, VS, targetVS);
  autopilot.set("ELEVATOR_TRIM_POSITION", anchor.y);
}

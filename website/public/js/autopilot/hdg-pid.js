/**
 * Heading mode, usually abbreviated as HGD, rolls the plane left or right
 * in order to get the nose to point in a specific compass direction
 * (typically controlled by moving a marker, called the "heading bug",
 * around a circle with degree markings).
 *
 */
import { describe } from "../describe.js";
import { getAPI, setAPI } from "../api.js";
import { Controller } from "./pid-controller.js";
import { map, constrain } from "./math.js";
import { graph } from "./load-autopilot-html.js";
const { abs, min, max } = Math;

const AILERON_TRIM_PCT = `AILERON_TRIM_PCT`;
const MAX_HEADING = 50;

let maxTrimValue = 100,
  headingBtn,
  heading = false,
  inputs = {},
  headingErrorPID,
  rollPID,
  trimPID,
  prevDiff,
  maxHeading = MAX_HEADING,
  maxBank = 30;

function newHeadingPID(params = { p: 0.6, i: 0, d: 0 }) {
  console.log(`HEADING PID:`, params);
  headingErrorPID = new Controller(params);
  headingErrorPID.setTarget(0);
}

function newRollPID(params = { p: 0.4, i: 0, d: 0 }) {
  console.log(`ROLL PID:`, params);
  rollPID = new Controller(params);
}

export function setupHDG(inputsObject) {
  heading = false;
  inputs = inputsObject;
  headingBtn = autopilot.querySelector(`button.hdg`);
  headingBtn.addEventListener(`click`, (evt) => {
    heading = !heading;
    headingBtn.classList[heading ? `add` : `remove`](`active`);
    if (heading) {
      console.log(`HDG mode: on`);
      resetValues();
      graph.start();
      graph.setMinMax(`roll target`, -30, 30);
      graph.setMinMax(`heading update`, 0, 0);
      graph.setMinMax(`trim`, -10, 10);
      graph.setMinMax(`bank`, -30, 30);
      graph.setMinMax(`diff`, -180, 180);
    }
  });
  return headingBtn;
}

function resetValues() {
  newHeadingPID();
  newRollPID();
  maxHeading = MAX_HEADING;
}

export function checkHeading(airBorn, speed) {
  if (heading) {
    if (!airBorn)
      describe(
        headingBtn.click(),
        `Not air-born: heading mode is not available.`
      );
  }
  return heading;
}

function getDiff(currentHeading, desiredHeading = inputs.heading) {
  const r = 360 - currentHeading;
  currentHeading += r;
  const diff = (desiredHeading + r) % 360;
  return diff > 180 ? diff - 360 : diff;
}

/**
 * ...docs go here...
 */
export async function flyHeading(speed, bank, currentHeading) {
  if (!heading) return;

  const currentTrim = (await getAPI(AILERON_TRIM_PCT))[AILERON_TRIM_PCT];
  const diff = getDiff(currentHeading);
  if (prevDiff === 0) prevDiff = diff;

  // The closer we get, the more we want to constrain our turns
  maxHeading = max(0.5, min(maxHeading, abs(diff)));
  if (maxHeading === 1 && rollPID.k_p !== 0.2) {
    newRollPID({ p: 0.2, i: 0.01, d: 0 });
  }

  // outer controller: determine how much roll we need, based on our heading difference
  const headingUpdate = diff > 0 ? maxHeading : diff < 0 ? -maxHeading : 0;
  const _rollTarget = headingErrorPID.update(headingUpdate);
  const rollTarget = constrain(_rollTarget, -maxBank, maxBank);

  // inner controller: determine how much trim we need, based on our roll difference
  rollPID.setTarget(rollTarget);
  const rollUpdate = rollPID.update(bank);
  const trimTarget = -constrain(rollUpdate, -maxTrimValue, maxTrimValue);
  setAPI(AILERON_TRIM_PCT, trimTarget);

  prevDiff = diff;

  // ----- draw/log data -----

  graph.addValue(`trim`, currentTrim);
  graph.addValue(`bank`, bank);
  graph.addValue(`roll target`, rollTarget);
  graph.addValue(`diff`, diff);
  graph.addValue(`heading update`, headingUpdate);

  // if (false)
    console.table({
      heading: currentHeading,
      headingTarget: inputs.heading,
      headingError: diff,
      headingUpdate,
      rollTarget,
      currentRoll: bank,
      rollUpdate,
      currentTrim,
      trimTarget,
    });
}

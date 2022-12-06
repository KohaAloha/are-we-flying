/**
 * Heading mode, usually abbreviated as HGD, rolls the plane left or right
 * in order to get the nose to point in a specific compass direction
 * (typically controlled by moving a marker, called the "heading bug",
 * around a circle with degree markings).
 *
 * Except for fighter jets, most planes roll based on turning the yoke
 * or stick left or right, to *build up* a roll angle, and then centering
 * the stick or yoke again. Unlike a car, where you hold the wheel turned
 * for as long as you need to turn, the stick or yoke affects how much the
 * plane *continues to roll* so you generally only bank until you reach
 * somewhere between 20 and 30 degrees of "bank", and then you center the
 * controls again. Once you get close to the heading you actually want to
 * use, you then turn the stick or yoke in the opposite direction, to
 * slowly reduce the roll angle again.
 *
 * So we're going to do that in four stages in this heading autopilot:
 *
 * Stage 1, "pitching": in this stage we've been told which heading we
 * want to fly, and we're building up a roll angle.
 *
 * Stage 2, "coasting": in this stage we've reached our maximum (comfortable)
 * roll angle, we've centered the controls, and we're now just turning
 * until we're getting close to our target heading
 *
 * Stage 3, "correcting": in this stage we're nearing our target, and
 * are slowly applying opposite roll angle to slowly stop us from turning.
 *
 * stage 3: "leveling out": in this stage we're at our desired new
 * heading, and we need to make sure the plane keeps flying level.
 *
 * (When flying in heading mode, most of the time is spent in that last
 * stage, simply making sure the plane keeps flying straight-ish in the
 * compass heading that our heading bug is set to)
 *
 */
import { describe } from "../describe.js";
import { getAPI, setAPI } from "../api.js";
import { map, deg } from "./math.js";
const { abs, min, max } = Math;

// HDG mode works by messing with the aileron trim
const trimLabel = `AILERON_TRIM_PCT`;
const trimValue = 0.03;
const maxBankAngle = 20;

// Our different stages of heading
const PITCHING = Symbol(`Pitching`);
const COASTING = Symbol(`Coasting`);
const CORRECTING = Symbol(`Correcting`);
const LEVEL_FLIGHT = Symbol(`Level flight`);
let stage, rampTime, heading, headingBtn, inputs;

export function setupHDG(inputsObject) {
  stage = false;
  heading = false;
  inputs = inputsObject;
  headingBtn = autopilot.querySelector(`button.hdg`);
  headingBtn.addEventListener(`click`, (evt) => {
    heading = !heading;
    headingBtn.classList[heading ? `add` : `remove`](`active`);
    if (heading) {
      console.log(`HDG mode: on`);
      resetValues();
      // TODO: We want to know our start heading, so we can actually make meaningful
      //       decisions based on "where and when" we are in the process
    }
  });
  return headingBtn;
}

function resetValues() {
  stage = PITCHING;
  maxTrimReached = 0;
  prevDiff = 0;
  rampTime = Date.now();
}

export function checkHeading(airBorn, speed) {
  if (heading) {
    if (!airBorn)
      describe(
        headingBtn.click(),
        `Not air-born: heading mode is not available.`
      );
    // else if (speed < inputs.stall)
    //   describe(
    //     headingBtn.click(),
    //     `Insufficient speed: heading mode should not be used.`
    //   );
  }
  return heading;
}

let prevDiff = 0;
let maxTrimReached = 0;

function getDiff(currentHeading, desiredHeading = inputs.heading) {
  const r = 360 - currentHeading;
  currentHeading += r;
  const diff = (desiredHeading + r) % 360;
  return diff > 180 ? diff - 360 : diff;
}

/**
 * ...docs go here...
 */
export async function flyHeading(
  speed,
  bank,
  currentHeading,
  desiredHeading = 240
) {
  if (!heading) return;

  const trim = (await getAPI(trimLabel))[trimLabel];
  const diff = getDiff(currentHeading, desiredHeading);
  const sign = diff < 0 ? -1 : 1;
  if (prevDiff === 0) prevDiff = diff;

  console.log(
    `heading: ${currentHeading}, target: ${desiredHeading}, diff: ${diff}`
  );

  const aDiff = abs(diff);
  const aBank = abs(bank);
  const aTrim = abs(trim);

  const bankAngle = deg(bank);

  if (stage === PITCHING) {
    /**
     * In stage 1, we're simply going to pitch for as long as
     * we haven't reached our target safe/comfortable angle.
     * Once we reach that angle, center the controls and switch
     * to stage 2. If, while we're pitching, we get to a point
     * where we're already close to our target heading, then
     * we skip stage 2 and go straight to stage 3.
     */
    console.log(`stage 1: pitching`, [bank, bankAngle, trim, diff].join(` | `));
    if (aDiff > 0.01) {
      if (aDiff < aBank) {
        setAPI(trimLabel, -maxTrimReached);
        stage = LEVEL_FLIGHT;
      } else if (aBank < bankAngle) {
        if (aTrim < map(bankAngle, 0, maxBankAngle, 0, trimValue)) {
          setAPI(trimLabel, sign * trimValue);
        }
      } else if (abs(aTrim - trimValue) < 0.01) {
        console.log(`switching:`, [aTrim, trimValue].join(` | `));
        maxTrimReached = trim;
        setAPI(trimLabel, 0);
        stage = COASTING;
        rampTime = Date.now() - rampTime;
        rampValue = heading - console.log(`took ${rampTime} to reach max bank`);
      }
    }
  } else if (stage === COASTING) {
    /**
     * In stage 2 we simply "do nothing" until we get close
     * enough to our target heading, at which point we set our
     * controls to the opposite angle, and switch to stage 3.
     * Although "do nothing" does mean switching back to stage 1
     * if for some reason (e.g. wind) we get straightened out
     * outside our own control.
     */
    console.log(`stage 2: coasting`, bank, trim, diff);
    if (aBank < maxBankAngle) {
      stage = PITCHING;
    } else if (aDiff < max(20, aBank)) {
      // mystery constant
      setAPI(trimLabel, -sign * trimValue);
      stage = CORRECTING;
    }
  } else if (stage === CORRECTING) {
    /**
     * In stage 3 we keep applying the opposite angle for as long
     * as necessary to either reach level flight, or we overshoot
     * our target. If we level out too early, we go back to stage 1,
     * and if we reach our target while leveling out, we switch to
     * stage 4.
     */
    console.log(`stage 3: counter trimming`, bank, trim, diff);
    const cross1 = prevDiff >= 1 && 1 > diff;
    const cross2 = prevDiff <= -1 && -1 <= diff;
    if (cross1 || cross2) {
      if (aDiff < 0.5) stage = LEVEL_FLIGHT;
      else stage = PITCHING;
    }
  } else if (stage === LEVEL_FLIGHT) {
    /**
     * In stage 4, we just keep the plane flying level. However,
     * we can always get blown off course, so we keep monitoring our
     * heading angle, and if it deviates from the heading bug by
     * more than a degree, we go back to stage 1.
     */
    console.log(`stage 4: level flight`, bank, trim, diff);
    if (aDiff > 1) resetValues();
    else if (abs(bank) > 0.01) setAPI(`AILERON_TRIM_PCT`, bank / 90);
  }

  prevDiff = diff;
}

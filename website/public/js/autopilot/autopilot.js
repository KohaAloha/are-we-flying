import { describe } from "../describe.js";
import { graph } from "./load-autopilot-html.js";
import { getAPI, setAPI } from "../api.js";
import { setupHDG, checkHeading, flyHeading } from "./hdg.js";

const { abs, atan, min, max, PI: pi } = Math;
const MSFS_PI = pi / 10; // because "luls"? I have no idea why it's 0.31415[...]

// used for tracking whether this is an ascent or descent,
// and whether we're in the initial or level-off phase.
let prevAlt = false;
let overshoot = false;
let direction = 0;

let lastVS = 0;
let hold = false;
let level = false;

let lastCall = 0;
let apUpdateInterval = 1000;

const inputs = {};

[`stall`, `cruise`, `crit`, `alt`, "heading"].forEach((label) => {
  const input = autopilot.querySelector(`input.${label}`);
  Object.defineProperty(inputs, label, {
    get: () => parseInt(input.value),
    set: (v) => {
      input.value = v;
    },
  });
  if (label === `alt`) {
    input.addEventListener(`change`, () => {
      prevAlt = false;
      overshoot = false;
      direction = 0;
    });
  }
});

const holdBtn = autopilot.querySelector(`button.hold`);
const lvlBtn = autopilot.querySelector(`button.level`);

holdBtn.addEventListener(`click`, async (evt) => {
  hold = !hold;
  holdBtn.classList[hold ? `add` : `remove`](`active`);
  if (hold) {
    const {
      DESIGN_SPEED_VC: cruise,
      DESIGN_SPEED_VS1: stall,
      MACH_MAX_OPERATE: crit,
    } = await queryMSFS(
      `DESIGN_SPEED_VC`,
      `DESIGN_SPEED_VS1`,
      `MACH_MAX_OPERATE`
    );
    inputs.stall = stall;
    inputs.cruise = cruise;
    inputs.crit = crit * 666.739; // mach to knots
    lastVS = 0;
    graph.start();
  }
});

lvlBtn.addEventListener(`click`, (evt) => {
  level = !level;
  lvlBtn.classList[level ? `add` : `remove`](`active`);
  if (level && headingBtn.classList.contains(`active`)) {
    headingBtn.click();
  }
});

const headingBtn = setupHDG(inputs, graph);

setTimeout(() => {
  if (window.location.toString().includes(`alt=`))
    inputs.alt = window.location.toString().match(/alt=(\d+)/)[1];
  if (!hold && window.location.toString().includes(`hold=true`))
    holdBtn.click();
  if (!level && window.location.toString().includes(`level=true`))
    lvlBtn.click();
}, 2000);

// ==========================================================

/**
 * ...docs go here...
 */
function checkHold(airBorn, speed) {
  if (hold) {
    if (!airBorn) describe(holdBtn.click(), `not airborn: turning off AP`);
    else if (speed < inputs.stall)
      describe(holdBtn.click(), `insufficient speed: turning off AP`);
  }
  if (!hold) graph.stop();
  return hold;
}

/**
 * ...docs go here...
 */
function checkLevel(airBorn, speed) {
  if (level) {
    if (!airBorn) describe(lvlBtn.click(), `not airborn: turning off LVL`);
  }
  return level;
}

/**
 * ...docs go here...
 */
async function levelPlane(bank) {
  if (!level) return;
  // logarithmic correction
  const angle = bank / 90;
  const correction = angle / 2;
  if (abs(bank) > 0.01) setAPI(`AILERON_TRIM_PCT`, correction);
}

/**
 * ...docs go here...
 */
async function experimentalAltitudeHold(
  currentAltitude,
  pitch,
  vspeed,
  speed,
  heading,
  bank
) {
  const aVS = abs(vspeed);
  const target = inputs.alt;
  const diff = target - currentAltitude;
  const adiff = abs(diff);
  let { ELEVATOR_TRIM_POSITION: trim } = await getAPI(`ELEVATOR_TRIM_POSITION`);
  const deltaVS = vspeed - lastVS;
  lastVS = vspeed;

  // console.log(
  //   [diff, pitch, trim, vspeed, deltaVS, direction, heading, bank].join(` | `)
  // );

  let maxVS = 1000;
  let minPitch = -15;
  let maxPitch = 15;
  let trimFactor = 0.01;
  let counterTrimFactorSmall = trimFactor / 2;
  let counterTrimFactorLarge = 2 * trimFactor;

  const crossUp = prevAlt < target && target < currentAltitude;
  const crossDown = prevAlt > target && target > currentAltitude;
  if (!overshoot && (crossUp || crossDown)) {
    overshoot = true;
    console.log(`[overshoot]`);
  }

  // no need to AP if we're close enough to our target
  if (adiff > 15) {
    // ...
    if (diff > 0) {
      console.log(`We're too low`);

      if (speed < inputs.stall + 20) {
        // TODO: make this based on optimal climb speed, not stall speed?
        trim -= describe(
          MSFS_PI * counterTrimFactorSmall,
          `Close to stall, pitching down`
        );
      } else if (vspeed > maxVS) {
        // Try to prevent a stall caused by the airspeed dropping to the point
        // where we no longer generate lift across the flight surfaces...
        trim -= describe(
          MSFS_PI * (trimFactor / 2),
          `Shooting up too fast, pitching down`
        );
      } else if (vspeed < 0) {
        trim += describe(
          (MSFS_PI * counterTrimFactorLarge * adiff) / 1000,
          `Descending: counter trimming up`
        );
      }

      // Finally, if there are no reasons to trim back down, trim up.
      // But: note that in order to climb, we need to have sufficient
      // speed, so if we don't: don't trim and build up some speed first!
      else if (pitch > minPitch && deltaVS < 100) {
        trim += describe((MSFS_PI * trimFactor * adiff) / 1000, `Pitching up`);
      }

      // TODO: how do we gracefully correct for overshoot? Ideally, we level out
      //       as we approach the target altitude, so that by the time we hit it,
      //       we're already on a much more stable trajectory...
    }

    // ...
    else {
      console.log(`We're too high`);

      if (speed > inputs.crit) {
        // Let's not make our airplane rip itself apart
        trim -= describe(
          -MSFS_PI * counterTrimFactorSmall,
          `Overspeeding, pitching up`
        );
      } else if (vspeed > 0) {
        trim += describe(
          (-MSFS_PI * counterTrimFactorLarge * adiff) / 1000,
          `Ascending: counter trimming`
        );
      }

      // Finally, if there are no reasons to trim back up, trim down.
      // Just make sure we don't trim if we're already dropping at a
      // (too high) accellerating rate. Also note that we allow for
      // a faster descent rate, because we're taking advantage of
      // gravity: pitching up is all us, but pitching down is nature.
      else if (pitch < maxPitch && deltaVS > -200) {
        trim += describe(
          (-MSFS_PI * trimFactor * adiff) / 1000,
          `Pitching down`
        );
      }
    }

    setAPI(`ELEVATOR_TRIM_POSITION`, trim);
  }

  graph.addValue(`speed`, speed);
  graph.addValue(`VS`, vspeed);
  graph.addValue(`dVS`, deltaVS);
  graph.addValue(`trim`, trim);
  graph.addValue(`pitch`, pitch);
  graph.addValue(`altitude`, currentAltitude);
  graph.draw(target);
}

/**
 * ...docs go here...
 */
export function feedAutopilot(
  airBorn,
  currentAltitude,
  pitch,
  vspeed,
  speed,
  bank,
  heading
) {
  const args = [currentAltitude, pitch, vspeed, speed, heading, bank];

  if (prevAlt === false) {
    prevAlt = currentAltitude;
    direction = inputs.alt - currentAltitude < 0 ? -1 : 1;
  }

  apUpdateInterval = 2000;

  if (checkHold(airBorn, speed)) {
    // only run at most once a second.
    const now = Date.now();
    if (now - lastCall > apUpdateInterval) {
      // experimentalAltitudeHold(...args);
      experimentalAltitudeHold(...args);
      lastCall = now;
    }
  }

  if (checkLevel(airBorn, speed)) {
    levelPlane(bank);
  }

  if (checkHeading(airBorn, speed)) {
    if (level) lvlBtn.click();
    flyHeading(speed, bank, heading, inputs.heading);
  }
}

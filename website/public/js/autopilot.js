import { getAPI, setAPI } from "./api.js";
const { abs, atan, min, max } = Math;

const altInput = document.querySelector(`#autopilot input`);
const holdBtn = document.querySelector(`#autopilot button.hold`);
const lvlBtn = document.querySelector(`#autopilot button.level`);

let lastVS = 0;
let target = 1500;
let hold = false;
let level = false;

holdBtn.addEventListener(`click`, (evt) => {
  hold = !hold;
  holdBtn.classList[hold ? `add` : `remove`](`active`);
  if (hold) {
    target = parseInt(altInput.value);
    lastVS = 0;
  }
});

lvlBtn.addEventListener(`click`, (evt) => {
  level = !level;
  lvlBtn.classList[level ? `add` : `remove`](`active`);
});

function describe(val, description) {
  console.log(description);
  return val;
}

function checkHold(airBorn, speed) {
  if (hold) {
    if (!airBorn) holdBtn.click();
    else if (speed < 50) holdBtn.click();
  }
  return hold;
}

function checkLevel(airBorn, speed) {
  if (level) {
    if (!airBorn) lvlBtn.click();
    else if (speed < 50) lvlBtn.click();
  }
  return level;
}

async function levelPlane(bank) {
  if (!level) return;
  if (abs(bank) > 0.01) setAPI(`AILERON_TRIM_PCT`, bank / 90);
}

let lastCall = 0;

async function experimentalAltitudeHold(
  airBorn,
  deltaT,
  currentAltitude,
  vspeed,
  speed
) {
  // only run at most once a second.
  const now = Date.now();
  if (now - lastCall < 1000) return;
  lastCall = now;

  checkHold(airBorn, speed);
  if (!hold) return;

  const deltaVS = vspeed - lastVS;
  lastVS = vspeed;

  const { ELEVATOR_TRIM_POSITION: currentTrim } = await getAPI(
    `ELEVATOR_TRIM_POSITION`
  );

  const diff = abs(target - currentAltitude);

  // The faster you go, the smaller the corrections are, as "more of it will kick in" per time unit.
  //let step = speed / 40000;
  let step = 1 / (2 * speed);
  let maxVS = speed * 10;
  let bracket = speed;
  let trim = 0;

  // TODO: the bigger the difference between target and current, the bigger the step should be.
  step *= 1 + diff / 2000;

  // Do we need to move down in flight level?
  if (target < currentAltitude) {
    console.log(`go down (${-diff})`);
    if (vspeed > -maxVS / 2) {
      if (deltaVS > -speed / 2) trim = describe(-step, `increase descent`);
      if (deltaVS < 2 * -speed) trim = describe(step, `slow rate of descent`);
    }
    if (diff < bracket) {
      if (vspeed > 0)
        trim = describe(
          -step,
          `hard trim if we're shooting through our target`
        );
      if (vspeed < 0)
        trim = describe(step, `hard trim if we're shooting through our target`);
    }
    if (deltaVS > 0 || vspeed > 0)
      trim = describe(-step * 2, `still ascending instead of descending...`);
    // compensation for over-trimming
    if (deltaVS < 3 * -speed)
      trim = describe(step / 5, `accelerating descent too much`);
    if (vspeed < -maxVS / 2) trim = describe(step / 5, `descending too fast`);
    if (vspeed < -maxVS)
      trim = describe(step / 5, `(descending *way* too fast)`);
    if (vspeed < -maxVS * 2)
      trim = describe(step / 5, `(descending *super* way too fast)`);
  }

  // Do we need to move up in flight level?
  if (target > currentAltitude) {
    console.log(`go up (${diff})`);
    if (vspeed < maxVS / 2) {
      if (deltaVS < speed / 2) trim = describe(step, `increase ascent`);
      if (deltaVS > 2 * speed)
        trim = describe(-step / 10, `slow rate of ascent`);
    }
    if (diff < bracket) {
      if (vspeed > 0)
        trim = describe(
          -step,
          `hard trim if we're shooting through our target`
        );
      if (vspeed < 0)
        trim = describe(step, `hard trim if we're shooting through our target`);
    }
    if (deltaVS < 0 || vspeed < 0)
      trim = describe(step * 2, `still descending instead of ascending...`);
    // compensation for over-trimming
    if (deltaVS > 3 * speed)
      trim = describe(-step / 5, `accelerating ascent too much`);
    if (vspeed > maxVS / 2) trim = describe(-step / 5, `ascending too fast`);
    if (vspeed > maxVS) trim = describe(-step / 5, `(ascending *way* too fast`);
    if (vspeed > maxVS * 2)
      trim = describe(-step / 5, `(ascending *super* way too fast)`);
  }

  // dampen when we're close-to-target...
  if (abs(diff) < 50) trim = describe(trim / 4, `4x dampened`);
  else if (abs(diff) < 100) trim = describe(trim / 2, `2x dampened`);

  // ...set the autopilot trim...
  const update = currentTrim + trim;
  console.log(`setting trim: ${update}, max VS: ${maxVS} fpm`);
  setAPI(`ELEVATOR_TRIM_POSITION`, update);
}

export function autopilot(
  airBorn,
  deltaT,
  currentAltitude,
  vspeed,
  speed,
  bank
) {
  if (checkHold(airBorn, speed)) {
    experimentalAltitudeHold(airBorn, deltaT, currentAltitude, vspeed, speed);
  }

  if (checkLevel(airBorn, speed)) {
    levelPlane(bank);
  }
}

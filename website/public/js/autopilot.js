import { getAPI, setAPI } from "./api.js";
const { abs, min, max } = Math;

const altInput = document.querySelector(`#autopilot input`);
const holdBtn = document.querySelector(`#autopilot button`);

let lastVS = 0;
let target = 1500;
let hold = false;
let banklock = false;

holdBtn.addEventListener(`click`, (evt) => {
  hold = !hold;
  holdBtn.classList[hold ? `add` : `remove`](`hold`);
  if (hold) {
    target = parseInt(altInput.value);
    lastVS = 0;
  }
});

export async function experimentalAltitudeHold(
  plane,
  deltaT,
  currentAltitude,
  vspeed,
  bank
) {
  if (!hold) return;

  const deltaVS = vspeed - lastVS;
  lastVS = vspeed;

  const { ELEVATOR_TRIM_POSITION: currentTrim, AUTOPILOT_MASTER: ap } =
    await getAPI(`ELEVATOR_TRIM_POSITION`, `AUTOPILOT_MASTER`);

  const diff = abs(target - currentAltitude);

  //   console.log(
  //     [
  //       `let's trim! current altitude=${currentAltitude}, target altitude=${target}, diff=${diff}`,
  //       `current trim: ${currentTrim}, VS: ${vspeed | 0} fps, dVS/s: ${
  //         (deltaVS / (deltaT / 1000)) | 0
  //       } fps²`,
  //       `bank: ${bank}`,
  //     ].join(`\n`)
  //   );

  let bracket = 15;
  let newTrim = currentTrim;
  let step = 0.003;

  // Do we need to move down in flight level?
  if (target < currentAltitude - bracket) {
    console.log(`go down (${-diff})`);
    if (vspeed > max(-1500, -diff)) {
      console.log(`bump down`);
      if (deltaVS > -30) newTrim -= step;
      if (deltaVS < -100) newTrim += step / 10;
    }
    if (vspeed < -500) newTrim += step / 3;
    if (vspeed < -1000) newTrim += step / 5;
  }

  // Do we need to move up in flight level?
  if (target > currentAltitude + bracket) {
    console.log(`go up (${diff})`);
    if (vspeed < min(1500, diff)) {
      console.log(`bump up`);
      if (deltaVS < 30) newTrim += step;
      if (deltaVS > 100) newTrim -= step / 10;
    }
    if (vspeed > 500) newTrim -= step / 3;
    if (vspeed > 1000) newTrim -= step / 5;
  }

  // dampen when we're close-to-target
  if (abs(diff) < 100) {
    console.log(`2x dampened`);
    newTrim = currentTrim + (newTrim - currentTrim) / 2;
  }

  // dampen when we're close-to-target
  if (abs(diff) < 50) {
    console.log(`4x dampened`);
    newTrim = currentTrim + (newTrim - currentTrim) / 2;
  }

  // fix the trim
  setAPI(`ELEVATOR_TRIM_POSITION`, newTrim);

  // level our plane
  if (abs(bank) > 0.2) setAPI(`AILERON_TRIM_PCT`, bank / 90);
}

import { defaultPlane } from "./airplane-src.js";

const content = await fetch("gyroscope.html").then((res) => res.text());
const gyro = document.getElementById(`gyroscope`);
gyro.innerHTML = content;

export const Gyro = {
  setPitchBank(pitch, bank) {
    gyro.style.setProperty(`--pitch`, pitch);
    gyro.style.setProperty(`--bank`, bank);
  },
  html: (initialHeading) => `
    <div id="plane-icon" style="--deg: ${initialHeading}">
      <img class="shadow" src="planes/${defaultPlane}">
      <hr class="pin-line">
      <hr class="speedo">
      <div class="speed label">0kts</div>
      <div class="alt label">0'</div>
      <div class="alt ground label">0'</div>
      <img class="pin" src="planes/${defaultPlane}">
    </div>
  `,
};

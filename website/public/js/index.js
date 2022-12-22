import { getAPI, setAPI } from "./api.js";
import { Duncan } from "./locations.js";
import { Plane } from "./plane.js";
import { Questions } from "./questions.js";
import { map, mapLayers, updateLayer } from "./maps.js";
import { DEBUG } from "./debug-flag.js";

if (DEBUG) globalThis.queryMSFS = getAPI;
if (DEBUG) globalThis.setMSFS = setAPI;

import("./maps.js").then(async ({ mapLayers }) => {
  [1, 2].forEach((layer) => {
    const select = document.querySelector(`.map-layer-${layer}`);

    Object.entries(mapLayers).forEach(([name, map]) => {
      const opt = document.createElement(`option`);
      opt.textContent = name;
      opt.value = name;
      if (layer === 1 && name === `openStreetMap`) opt.selected = `selected`;
      if (layer === 2 && name === `googleTerrain`) opt.selected = `selected`;
      select.append(opt);
    });

    select.addEventListener(`change`, (evt) => {
      updateLayer(layer, evt.target.value);
    });
  });

  await getAPI(`http://localhost:8080`);
  Questions.serverUp(true);

  await getAPI(`http://localhost:8080/connected`);
  Questions.msfsRunning(true);
  new Plane(map, Duncan, 150);
});

const autopilotURL = `http://localhost:8080/autopilot`;

globalThis.checkAP = async function checkAP() {
  return fetch(`${autopilotURL}`, { method: `GET` })
    .then((r) => r.json())
    .then((d) => (typeof d === `string` ? JSON.parse(d) : d));
};

globalThis.autopilot = async function autopilot(
  altitude = 7000,
  heading = 360
) {
  let state = await checkAP();
  await setALT(state, altitude);
  await setHDG(state, heading);
  if (!state.AP_STATE) await fetch(`${autopilotURL}`, { method: `POST` });
  console.log(await checkAP());
};

async function setALT(state, altitude = 7000) {
  if (!state.LVL) await fetch(`${autopilotURL}?type=LVL`, { method: `POST` });
  return fetch(`${autopilotURL}?type=ALT&target=${altitude}`, {
    method: `POST`,
  });
}

async function setHDG(state, heading = 360) {
  if (!state.VSH) await fetch(`${autopilotURL}?type=VSH`, { method: `POST` });
  return fetch(`${autopilotURL}?type=HDG&target=${heading}`, {
    method: `POST`,
  });
}

import { getAPI, setAPI } from "./api.js";
import { Duncan } from "./locations.js";
import { Plane } from "./plane.js";
import { Questions } from "./questions.js";
import { map, mapLayers, updateLayer } from "./maps.js";
import { DEBUG } from "./debug-flag.js";

if (DEBUG) globalThis.queryMSFS = getAPI;
if (DEBUG) globalThis.setMSFS = setAPI;

import("./maps.js").then(async ({ mapLayers }) => {
  [1,2].forEach(layer => {
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

  })

  await getAPI(`http://localhost:8080`);
  Questions.serverUp(true);

  await getAPI(`http://localhost:8080/connected`);
  Questions.msfsRunning(true);
  new Plane(map, Duncan, 150);
});

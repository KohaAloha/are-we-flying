import { getAPI } from "./api.js";
import { Duncan } from "./locations.js";
import { Plane } from "./plane.js";
import { Questions } from "./questions.js";
import { map } from "./maps.js";
import { DEBUG } from "./debug-flag.js";

if (DEBUG) globalThis.queryMSFS = getAPI;

import("./maps.js").then(async ({ mapLayers }) => {
  const select = document.querySelector(`.map-options`);

  Object.entries(mapLayers).forEach(([name, map]) => {
    const opt = document.createElement(`option`);
    opt.textContent = name;
    opt.value = name;
    if (name === `googleTerrain`) opt.selected = `selected`;
    select.append(opt);
  });

  select.addEventListener(`change`, (evt) => {
    Object.values(mapLayers).forEach((layer) => layer.removeFrom(map));
    mapLayers[evt.target.value].addTo(map);
  });

  await getAPI(`http://localhost:8080`);
  Questions.serverUp(true);

  await getAPI(`http://localhost:8080/connected`);
  Questions.msfsRunning(true);
  new Plane(map, Duncan, 150);
});

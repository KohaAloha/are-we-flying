import { waitFor } from "./wait-for.js";
import { Duncan } from "./locations.js";

const L = await waitFor(async () => window.L);
const map = L.map("map").setView(Duncan, 15);

const openStreetMap = L.tileLayer(
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  {
    maxZoom: 19,
    attribution: `© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
  }
);

const googleStreets = L.tileLayer(
  "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleHybrid = L.tileLayer(
  "http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleSat = L.tileLayer(
  "http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleTerrain = L.tileLayer(
  "http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const mapLayers = {
  openStreetMap,
  googleStreets,
  googleHybrid,
  googleSat,
  googleTerrain,
};

const layers = [];

function updateLayer(layer, name) {
  layers[layer - 1] = mapLayers[name];
  update();
}

function update() {
  Object.values(mapLayers).forEach((layer) => layer.removeFrom(map));
  layers[0].setOpacity(1);
  layers[0].addTo(map);
  layers[1].setOpacity(0.5);
  layers[1].addTo(map);
}

layers[0] = openStreetMap;
layers[1] = googleTerrain;
update();

export { map, mapLayers, updateLayer };

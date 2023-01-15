import { rad } from "./utils.js";
const { cos, sin } = Math;

const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

const autopilotURL = `http://localhost:8080/autopilot`;

export class Autopilot {
  constructor() {
    const ap = document.querySelector(`#autopilot`);
    this.reload = ap.querySelector(`button.reload`);
    this.master = ap.querySelector(`button.ap`);
    this.altitude = ap.querySelector(`input.altitude`);
    this.heading = ap.querySelector(`input.heading`);
    this.vsh = ap.querySelector(`button.vsh`);
    this.alt = ap.querySelector(`button.alt`);
    this.terrain = ap.querySelector(`button.terrain`);
    this.lvl = ap.querySelector(`button.level`);
    this.inv = ap.querySelector(`button.inverted`);
    this.hdg = ap.querySelector(`button.hdg`);
    this.bootstrap();
  }

  async bootstrap() {
    const state = await checkAP();
    this.master.classList[state.AP_STATE ? `add` : `remove`](`active`);
    this.altitude.value = state.ALT ?? this.alt.value;
    this.heading.value = state.HDG ?? this.heading.value;
    this.alt.classList[state.VSH ? `add` : `remove`](`active`);
    this.alt.classList[state.ALT ? `add` : `remove`](`active`);
    this.lvl.classList[state.LVL ? `add` : `remove`](`active`);
    this.hdg.classList[state.HDG ? `add` : `remove`](`active`);

    this.altitude.addEventListener(`change`, (evt) => {
      if (this.alt.classList.contains(`active`)) this.setALT(evt.target.value);
    });

    this.heading.addEventListener(`change`, (evt) => {
      if (this.hdg.classList.contains(`active`)) this.setHDG(evt.target.value);
    });

    this.master.addEventListener(`click`, () => this.toggleAutoPilot());
    this.vsh.addEventListener(`click`, () => this.toggleVSH());
    this.alt.addEventListener(`click`, () => this.toggleALT());
    this.terrain.addEventListener(`click`, () => this.toggleTER());
    this.lvl.addEventListener(`click`, () => this.toggleLVL());
    this.inv.addEventListener(`click`, () => this.toggleINV());
    this.hdg.addEventListener(`click`, () => this.toggleHDG());

    this.reload.addEventListener(`click`, () => {
      fetch(`${autopilotURL}/reload`, { method: `POST` });
    });

    // check if we need to override the autopilot from URL
    setTimeout(() => this.toggleFromURL(), 2000);
  }

  /**
   * This should run a checkState first
   */
  async toggleFromURL() {
    const state = await this.checkAP();

    const { search } = window.location;
    const params = new URLSearchParams(search);

    const ap = params.get(`ap`);
    if (ap && !state.AP_STATE) {
      this.toggleAutoPilot();
    }

    const vsh = params.get(`vsh`);
    if (vsh) {
      this.toggleVSH();
    }

    const alt = params.get(`alt`);
    if (alt) {
      this.altitude.value = alt;
      if (state.ALT !== false) this.setALT(alt);
      else this.toggleALT();
    }

    const lvl = params.get(`lvl`);
    if (lvl && !state.LVL) {
      this.toggleLVL();
    }
  }

  async checkAP() {
    return fetch(`${autopilotURL}`)
      .then((r) => r.json())
      .then((d) => (typeof d === `string` ? JSON.parse(d) : d));
  }

  async toggleAutoPilot() {
    await fetch(`${autopilotURL}`, { method: `POST` });
    this.master.classList.toggle(`active`);
  }

  async toggleVSH() {
    await fetch(`${autopilotURL}?type=VSH`, { method: `POST` });
    this.vsh.classList.toggle(`active`);
  }

  async toggleALT() {
    if (!this.vsh.classList.contains(`active`)) {
      await this.toggleVSH();
    }
    this.alt.classList.toggle(`active`);
    if (this.alt.classList.contains(`active`)) {
      this.setALT(this.altitude.value);
    }
  }

  async toggleTER() {
    this.terrain.classList.toggle(`active`);
    this.follow_terrain = this.terrain.classList.contains(`active`);
    console.log(`AP: Follow terrain: ${this.follow_terrain}`);
  }

  async followTerrain(lat, long, heading) {
    if (!this.follow_terrain) return;
    updateElevationMap(lat, long, heading);
  }

  async setALT(altitude) {
    const state = await this.checkAP();
    if (!state.VSH) await fetch(`${autopilotURL}?type=VSH`, { method: `POST` });
    fetch(`${autopilotURL}?type=ALT&target=${altitude}`, {
      method: `POST`,
    });
  }

  async toggleLVL() {
    await fetch(`${autopilotURL}?type=LVL`, { method: `POST` });
    this.lvl.classList.toggle(`active`);
  }

  async toggleINV() {
    await fetch(`${autopilotURL}?type=INV`, { method: `POST` });
    this.inv.classList.toggle(`active`);
  }

  async toggleHDG() {
    const state = await this.checkAP();
    this.hdg.classList.toggle(`active`);
    if (this.hdg.classList.contains(`active`)) {
      if (!state.LVL) this.toggleLVL();
      this.setHDG(this.heading.value);
    }
  }

  async setHDG(heading) {
    const state = await this.checkAP();
    if (!state.LVL) await fetch(`${autopilotURL}?type=LVL`, { method: `POST` });
    fetch(`${autopilotURL}?type=HDG&target=${heading}`, {
      method: `POST`,
    });
  }
}

/**
 *
 * Code for terrain-follow
 *
 */

async function updateElevationMap(lat, long, heading) {
  // get lat/long information for the next 12NM,
  // e.g. 1/5th of a degree, on the current heading.
  let a = rad(heading);
  const [lat2, long2] = [
    lat + (0.2 * cos(a) - 0.2 * sin(a)),
    long + (0.2 * sin(a) + 0.2 * cos(a)),
  ];
  const points = [{ latitude: lat, longitude: long }];
  for (let s = 0.01, i = s; i < 1.0; i += s) {
    points.push({
      latitude: (1 - i) * lat + i * lat2,
      longitude: (1 - i) * long + i * long2,
    });
  }
  points.push({ latitude: lat2, longitude: long2 });

  const response = await fetch(`https://api.open-elevation.com/api/v1/lookup`, {
    method: `POST`,
    body: JSON.stringify({
      locations: points,
    }),
    headers: { "Content-Type": "application/json" },
  }).then((r) => r.json());

  makePath(response);
}

function makePath(response) {
  let minElevation = 50000;
  let maxElevation = -50000;
  response.results.forEach(({ elevation: e }) => {
    e /= 0.3048;
    if (e < minElevation) minElevation = e | 0;
    if (e > maxElevation) maxElevation = e | 0;
  });

  fetch(
    `http://localhost:8080/autopilot?type=ALT&target=${maxElevation + 1000}`,
    {
      method: `POST`,
    }
  );

  const elevations = response.results.map(
    (v, x) => `L ${x} ${v.elevation / 0.3048}`
  );

  const len = elevations.length - 1;
  let svg = document.querySelector(`#yeppers`);
  let minmax = document.querySelector(`#yeppers + p`);
  if (!svg) {
    svg = element(`svg`);
    svg.setAttribute(`preserveAspectRatio`, `none`);
    svg.setAttribute(`width`, `600px`);
    svg.setAttribute(`height`, `200px`);
    svg.id = `yeppers`;
    document.body.appendChild(svg);
    const path = element(`path`);
    svg.appendChild(path);
    minmax = document.createElement(`p`);
    minmax.style.width = `600px`;
    document.body.appendChild(minmax);
  }
  svg.setAttribute(`viewBox`, `0 0 100 ${maxElevation}`);
  const path = svg.querySelector(`path`);
  path.setAttribute(`transform`, `scale(1, -1) translate(0, -${maxElevation})`);
  path.setAttribute(`d`, `M 0 0 ${elevations.join(` `)} L ${len} 0 Z`);
  minmax.innerHTML = `<span style="float:left">${minElevation}'</span><span style="float:right">${maxElevation}'</span>`;
}

const XMLNS = "http://www.w3.org/2000/svg";
const element = (tag, attributes = []) => {
  const e = document.createElementNS(XMLNS, tag);
  Object.entries(attributes).forEach(([key, value]) => set(e, key, value));
  return e;
};

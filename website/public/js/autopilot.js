const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

const autopilotURL = `http://localhost:8080/autopilot`;

export class Autopilot {
  constructor() {
    const ap = document.querySelector(`#autopilot`);
    this.altitude = ap.querySelector(`input.altitude`);
    this.heading = ap.querySelector(`input.heading`);
    this.alt = ap.querySelector(`button.alt`);
    this.lvl = ap.querySelector(`button.level`);
    this.hdg = ap.querySelector(`button.hdg`);
    this.bootstrap();
  }

  async bootstrap() {
    const state = await checkAP();
    this.altitude.value = state.ALT ?? this.alt.value;
    this.heading.value = state.HDG ?? this.heading.value;
    this.alt.classList[state.VSH ? `add` : `remove`](`active`);
    this.lvl.classList[state.LVL ? `add` : `remove`](`active`);
    this.hdg.classList[state.LVL ? `add` : `remove`](`active`);

    this.altitude.addEventListener(`change`, (evt) => {
      if (this.alt.classList.contains(`active`)) this.setALT(evt.target.value);
    });

    this.heading.addEventListener(`change`, (evt) => {
      if (this.hdg.classList.contains(`active`)) this.setHDG(evt.target.value);
    });

    this.alt.addEventListener(`click`, () => {
      this.toggleALT();
    });

    this.lvl.addEventListener(`click`, () => {
      this.toggleLVL();
    });

    this.hdg.addEventListener(`click`, () => {
      this.toggleHDG();
    });
  }

  async checkAP() {
    return fetch(`${autopilotURL}`)
      .then((r) => r.json())
      .then((d) => (typeof d === `string` ? JSON.parse(d) : d));
  }

  async toggleALT() {
    await fetch(`${autopilotURL}?type=VSH`, { method: `POST` });
    this.alt.classList.toggle(`active`);
    if (this.alt.classList.contains(`active`)) {
      this.setALT(this.altitude.value);
    }
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

  async toggleHDG() {
    this.toggleLVL();
    this.hdg.classList.toggle(`active`);
    if (this.hdg.classList.contains(`active`)) {
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

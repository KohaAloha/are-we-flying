const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

function setCheckbox(qs, val) {
  const checkbox = questions.querySelector(qs);
  if (val) checkbox.setAttribute(`checked`, `checked`);
  else checkbox.removeAttribute(`checked`);
}

export const Questions = {
  serverUp(val) {
    setCheckbox(`.server-up`, val);
  },
  msfsRunning(val) {
    setCheckbox(`.msfs-running`, val);
  },
  inGame(val) {
    setCheckbox(`.in-game`, val);
  },
  modelLoaded(modelName) {
    let model = `...nothing yet?`;
    if (modelName) model = `...Looks like a ${modelName}. Nice!`;
    questions.querySelector(`.specific-plane`).textContent = model;
  },
  enginesRunning(val) {
    setCheckbox(`.engines-running`, val);
  },
  inTheAir(val) {
    setCheckbox(`.in-the-air`, val);
  },
  planeCrashed(val) {
    setCheckbox(`.plane-crashed`, val);
  },
  resetPlayer() {
    this.inGame(false);
    // don't reset the model, we'll get a new one if the player picks one
    this.enginesRunning(false);
    this.inTheAir(false);
    this.planeCrashed(false);
  },
};

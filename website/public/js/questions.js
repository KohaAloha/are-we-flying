const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

export const Questions = {
  serverUp(val) {
    questions
      .querySelector(`.server-up`)
      .setAttribute(`checked`, val ? `checked` : ``);
  },
  msfsRunning(val) {
    questions
      .querySelector(`.msfs-running`)
      .setAttribute(`checked`, val ? `checked` : ``);
  },
  inGame(val) {
    questions
      .querySelector(`.in-game`)
      .setAttribute(`checked`, val ? `checked` : ``);
  },
  modelLoaded(modelName) {
    questions.querySelector(`.specific-plane`).textContent = `...Looks like a ${modelName}. Nice!`;
  },
  enginesRunning(val) {
    questions
      .querySelector(`.engines-running`)
      .setAttribute(`checked`, val ? `checked` : ``);
  },
  inTheAir(val) {
    questions
      .querySelector(`.in-the-air`)
      .setAttribute(`checked`, val ? `checked` : ``);
  },
};

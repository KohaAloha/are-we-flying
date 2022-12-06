// import { setupGraph } from "./canvas.js";
import { setupGraph } from "./svg-graph.js";

const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

const graph = setupGraph(autopilot);
autopilot.appendChild(graph);

export { graph };

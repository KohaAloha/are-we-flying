const XMLNS = "http://www.w3.org/2000/svg";
const element = (tag) => document.createElementNS(XMLNS, tag);

const colors = [`#D00`, `#0D0`, `#00D`, `#0DD`, `#000`, `#DD0`, `#D0D`];

/**
 * ...
 */
class Series {
  constructor(name) {
    this.name = name;
    this.g = element(`g`);
    this.g.setAttribute(`title`, name);
    this.g.setAttribute(`transform`, `scale(1,1)`);
    this.path = element(`path`);
    this.g.append(this.path);
    this.color = colors.shift();
    colors.push(this.color);
    this.path.setAttribute(`stroke`, this.color);
    this.path.setAttribute(`fill`, `none`);
    this.min = 0;
    this.max = 0;
  }

  addValue(x, y) {
    if (y < this.min) this.min = y;
    if (y > this.max) this.max = y;
    let d = this.path.getAttribute(`d`);
    if (!d) d = `M ${x} ${y}`;
    else d = `${d} L ${x} ${y}`;
    this.path.setAttribute(`d`, d);
  }

  setMinMax(min, max, svgHeight) {
    console.log(this.name, min, max)
    if (min < this.min) this.min = min;
    if (max > this.max) this.max = max;
    const i = Math.max(this.max, -this.min);
    this.g.setAttribute(`transform`, `scale(1,${svgHeight/(i*2)})`);
  }
}

/**
 * ...
 */
export function setupGraph() {
  const { width, height } = document
    .querySelector(`#map`)
    .getBoundingClientRect();
  const SVGChart = element(`svg`);
  globalThis.svg = SVGChart;
  SVGChart.setAttributeNS(null, `width`, `${width}px`);
  SVGChart.setAttributeNS(null, `height`, `${height}px`);

  let g = element(`g`);
  SVGChart.appendChild(g);
  let p = element(`path`);
  g.appendChild(p);
  p.setAttribute(`stroke`, `lightgrey`);
  p.setAttribute(`fill`, `none`);
  p.setAttribute(`d`, `M-999,0L999,0`);

  let min = -height / 2,
    max = -min;
  SVGChart.setAttributeNS(null, `viewBox`, `0 ${min} ${width} ${height}`);

  const labels = {};
  let started = false;
  let startTime = 0;

  SVGChart.start = function () {
    started = true;
    startTime = Date.now();
  };

  SVGChart.stop = function () {
    started = false;
  };

  function getSeries(label) {
    if (!labels[label]) {
      const series = (labels[label] = new Series(label));
      SVGChart.appendChild(series.g);
    }
    return labels[label];
  }

  SVGChart.setMinMax = function (label, _min, _max) {
    const series = getSeries(label);
    series.setMinMax(_min, _max, height);
  };

  SVGChart.draw = function () {
    // noop
  };

  SVGChart.addValue = function (label, value) {
    const series = getSeries(label);
    const x = (Date.now() - startTime) / 1000;
    series.addValue(x, value.toFixed(2));
  };

  return SVGChart;
}

const { abs, log } = Math;
const log10 = (v) => log(v) / log(10);

const XMLNS = "http://www.w3.org/2000/svg";
const element = (tag, attributes = []) => {
  const e = document.createElementNS(XMLNS, tag);
  Object.entries(attributes).forEach(([key, value]) => set(e, key, value));
  return e;
};
const set = (e, key, value) => e.setAttribute(key, value);

const colors = [`#D00`, `#0D0`, `#00D`, `#0DD`, `#000`, `#DD0`, `#D0D`];
const { min, max } = Math;

/**
 * ...
 */
class Series {
  constructor(name, height) {
    this.name = name;
    this.height = height;
    this.g = element(`g`, {
      title: name,
      transform: `scale(1,1)`,
    });
    this.color = colors.shift();
    colors.push(this.color);
    this.path = element(`path`, { stroke: this.color, fill: `none` });
    this.g.append(this.path);
    this.min = 0;
    this.max = 0;
  }

  setProperties({ fill = false, min = false, max = false }) {
    if (fill !== false) {
      const { baseline, color } = fill;
      this.baseline = baseline;
      this.filled = color === `none` || color === `transparent` ? false : true;
      set(this.path, `fill`, color);
      if (this.filled) set(this.path, `stroke`, color);
      this.color = color;
    }
    this.min = min ?? this.min;
    this.max = max ?? this.max;
  }

  addValue(x, y) {
    this.updateMinMax(y);
    let d = this.path.getAttribute(`d`);
    if (!d) {
      if (this.filled) d = `M ${x} 0 L ${x} ${y} L ${x} 0 Z`;
      else d = `M ${x} ${y}`;
    } else {
      if (this.filled) {
        if (!d.match(/M \S+ \S+ Z/)) {
          d = d.replace(/[ML] \S+ \S+ Z/, ``);
        }
      }
      d = `${d} L ${x} ${y}${this.filled ? ` L ${x} ${this.baseline} Z` : ``}`;
    }
    this.path.setAttribute(`d`, d);
  }

  updateMinMax(value) {
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
    const { min, max, height } = this;
    const h2 = height / 2;
    const span = Math.max(abs(max), abs(min)) / h2;
    const scale = 1 / span;
    this.path.setAttribute(`stroke-width`, Math.min(1, 2 * span));
    this.g.setAttribute(`transform`, `scale(1, ${scale})`);
    this.g.setAttribute(`data-minmax`, `${min},${max}`);
  }
}

/**
 *
 */
class SVGChart {
  constructor(parentElement, width, height) {
    this.width = width;
    this.height = height;
    this.min = -height / 2;

    const SVGChart = (this.svg = element(`svg`, {
      width: `${width}px`,
      height: `${height}px`,
      viewBox: `0 ${this.min} ${width} ${height}`,
    }));
    parentElement.appendChild(SVGChart);

    // time series
    let g = (this.g = element(`g`, {
      transform: `scale(1, -1)`,
    }));
    SVGChart.appendChild(g);
    let p = element(`path`, {
      stroke: `lightgrey`,
      fill: `none`,
      d: `M-999,0L999,0`,
    });
    g.appendChild(p);

    // legend
    let legend = (this.legend = element(`g`, { opacity: 0.3 }));
    SVGChart.appendChild(legend);

    this.labels = {};
    this.started = false;
    this.startTime = 0;
  }

  start() {
    this.started = true;
    this.startTime = Date.now();
  }

  stop() {
    this.started = false;
  }

  setProperties(...entries) {
    entries.forEach(({ label, ...props }) => {
      this.getSeries(label).setProperties(props);
      const { fill } = props;
      if (fill) {
        const patch = document.querySelector(`g.${label} rect`);
        patch.setAttribute(`fill`, fill.color);
      }
    });
  }

  getSeries(label) {
    const { labels } = this;
    if (!labels[label]) {
      const series = (labels[label] = new Series(label, this.height));
      this.addLegendEntry(label, series.color);
      this.g.appendChild(series.g);
    }
    return labels[label];
  }

  addLegendEntry(label, color) {
    const row = element(`g`, { class: label });
    const rows = this.legend.children.length;
    row.setAttribute(
      `transform`,
      `translate(${this.width - 120},${this.height / 2 - 16 * (rows + 1)})`
    );
    const patch = element(`rect`, {
      fill: color,
      x: 0,
      y: 0,
      width: 40,
      height: 10,
    });
    row.appendChild(patch);
    const text = element(`text`, {
      x: 45,
      y: 10,
    });
    text.textContent = label;
    row.appendChild(text);
    this.legend.appendChild(row);
  }

  setMinMax(label, min, max) {
    const series = this.getSeries(label);
    series.setMinMax(min, max, height);
  }

  addValue(label, value) {
    if (value === null || value === undefined || isNaN(value)) value = 0;
    const series = this.getSeries(label);
    const x = (Date.now() - this.startTime) / 1000;
    let y = value;
    // if (abs(value) > 1) {
    //   let s = value < 0 ? -1 : 1;
    //   // fit 0 to 100,000 feet in the same graph
    //   y = (s * ((log10(abs(value)) / 5) * this.height)) / 2;
    // }
    series.addValue(x, y.toFixed(5));
    this.updateViewBox(x);
  }

  updateViewBox(x) {
    if (x > this.width) {
      this.svg.setAttribute(
        `viewBox`,
        `${x - this.width} ${this.min} ${this.width} ${this.height}`
      );
      const rows = this.legend.children.length;
      this.legend.setAttribute(`transform`, `translate(${x - this.width}, 0)`);
    }
  }
}

/**
 * ...
 */
export function setupGraph(parentElement, width, height) {
  return new SVGChart(parentElement, width, height);
}

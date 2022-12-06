const { PI, max } = Math;
const FULL_CIRCLE = 2 * PI;

const colors = [`#D00`, `#0D0`, `#00D`, `#0DD`, `#000`, `#DD0`,`#D0D`];

class Series {
  constructor(name) {
    this.color = colors.shift();
    this.weight = 1;
    this.values = [];
    this.min = 0;
    this.max = 0;
  }
  addValue(x, y) {
    if (y < this.min) this.min = y;
    if (y > this.max) this.max = y;
    this.values.push({ x, y });
  }
  map(value, tS, tE) {
    const iS = this.min,
      iE = this.max;
    return tS + ((tE - tS) * (value - iS)) / (iE - iS);
  }
}

export function setupGraph(autopilot) {
  const canvas = autopilot.querySelector(`canvas`);
  const { width, height } = document
    .querySelector(`#map`)
    .getBoundingClientRect();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `transparent`;
  ctx.strokeStyle = `black`;

  let started = false;
  let startTime = 0;

  const series = {};

  function initGraph() {
    ctx.resetTransform();
    ctx.clearRect(-9999, -9999, 99999, 99999);
    ctx.translate(0, height / 2);

    ctx.strokeStyle = `none`;
    ctx.fillStyle = `white`;
    ctx.fillRect(-1, -1, width + 2, height + 2);

    ctx.strokeStyle = `light-grey`;
    ctx.beginPath();
    ctx.moveTo(width / 2, -height / 2);
    ctx.lineTo(width / 2, height / 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.stroke();
  }

  function drawLegend() {
    function drawBox(color, pos, x, y, label) {
      ctx.fillStyle = color;
      ctx.strokeStyle = `black`;
      y += pos * 20;
      ctx.fillRect(x, y, 20, 16);
      ctx.fillStyle = `black`;
      ctx.fillText(label, x + 30, y + 12);
    }

    const [x, y] = [width - 80, -height / 2 + 10];

    drawBox(`#838`, 0, x, y, `target`);

    Object.entries(series).forEach(([label, series], pos) => {
      drawBox(series.color, pos + 1, x, y + +(pos + 1) * 20, label);
    });
  }

  return {
    start() {
      started = true;
      startTime = Date.now();
    },
    stop() {
      started = false;
    },
    setMinMax(label, min, max) {
      const data = (series[label] ??= new Series(label));
      data.min = min;
      data.max = max;
    },
    addValue(label, value) {
      const data = (series[label] ??= new Series(label));
      const x = (Date.now() - startTime) / 1000;
      data.addValue(x, value);
    },
    draw(target = 3000) {
      const h = height / 2;
      initGraph();

      // draw target altitude relative to current altitude
      const alt = series.altitude;
      if (alt) {
        alt.min = 0;
        alt.max = max(alt.max, target + 1000);
        const targetValue = alt.map(target, h, -h);
        ctx.strokeStyle = `#838`;
        ctx.moveTo(0, targetValue);
        ctx.lineTo(width, targetValue);
        ctx.stroke();
        series.altitude.weight = 2;
      }

      // draw our data
      Object.entries(series).forEach(([label, series]) => {
        ctx.strokeStyle = series.color;
        ctx.lineWidth = series.weight;
        ctx.beginPath();
        const [first, ...rest] = series.values;
        ctx.moveTo(first.x, series.map(first.y, h, -h));
        rest.forEach(({ x, y }) => ctx.lineTo(x, series.map(y, h, -h)));
        ctx.stroke();
      });

      // then finally, the legend
      drawLegend();
    },
  };
}

import express from "express";
import cors from "cors";
import helmet from "helmet";

import { SystemEvents, MSFS_API } from "msfs-simconnect-api-wrapper";
import { AutoPilot } from "./autopilot.js";

const PORT = 8080;
const app = express();
app.disable("view cache");
app.set("etag", false);
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(cors());
app.use(helmet({ crossOriginEmbedderPolicy: false }));

const api = new MSFS_API();
const autopilot = new AutoPilot(api);

// middleware for functions that rely on the api
function failWithoutAPI(_req, res, next) {
  if (!api.connected) {
    return res
      .status(500)
      .json({ status: `failed`, reason: `No connection to MSFS (yet)` });
  }
  next();
}

// middlerware (well, final-ware) for sending the AP state as JSON
function sendAPstate(req, res) {
  res.status(200).json(autopilot.getAutoPilotParameters());
}

// =========== ROUTES =============

app.get(`/connected`, failWithoutAPI, async (req, res) => {
  res.status(200).json({ connected: true });
});

// api routes

app.get(`/api`, failWithoutAPI, async (req, res) => {
  const propNames = req.query?.get
    ?.split(`,`)
    .map((v) => v.replaceAll(`_`, ` `));

  if (!propNames) {
    return res.status(200).json({ connected: true });
  }

  const result = await api.get(...propNames);
  res.status(200).json(result);
});

app.post(`/api`, failWithoutAPI, async (req, res) => {
  const { name, value } = req.query;

  console.log(`post...`);

  if (name === undefined || value === undefined) {
    return res
      .status(422)
      .json({ reason: `API needs name and value query args` });
  }

  console.log(`setting ${name} to ${value}`);
  try {
    api.set(name, value);
    res.status(200).json({ result: `processed` });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
});

// Autopilot routes

app.get(`/autopilot`, sendAPstate);

app.post(
  `/autopilot`,
  cors(),
  helmet({ crossOriginEmbedderPolicy: false }),
  (req, res, next) => {
    let { type, target } = req.query;
    type = type?.toUpperCase();

    if (type) {
      if (target) {
        let value =
          target === `false`
            ? false
            : target === `true`
            ? true
            : parseFloat(target);
        autopilot.setTarget(type, value);
      } else {
        autopilot.toggle(type);
      }
    } else {
      autopilot.toggleAutoPilot();
    }
    next();
  },
  sendAPstate
);

// waypoint routes

app.put(
  `/waypoint`,
  (req, res, next) => {
    const { location } = req.query;
    if (location) {
      const args = location.split(`,`);
      autopilot.addWaypoint(...args);
    }
    next();
  },
  sendAPstate
);

app.delete(
  `/waypoint`,
  (req, res, next) => {
    const { location } = req.query;
    if (location) {
      const args = location.split(`,`);
      autopilot.removeWaypoint(...args);
    }
    next();
  },
  sendAPstate
);

// ======= END OF ROUTES ==========

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  api.connect({
    retries: Infinity,
    retryInterval: 5,
    onConnect: () => {
      console.log(`Connected to MSFS`);
      api.on(SystemEvents.PAUSED, () => autopilot.setPaused(true));
      api.on(SystemEvents.UNPAUSED, () => autopilot.setPaused(false));
    },
    onRetry: (_, s) =>
      console.log(`Connection failed, retrying in ${s} seconds`),
  });
});

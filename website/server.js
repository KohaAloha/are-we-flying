import proxy from "express-http-proxy";
import express from "express";
import open from "open";

const app = express();
const WEB_SERVER_PORT = 3000;
const API_SERVER_URL = `http://localhost:8080`;

app.disable("view cache");
app.set("etag", false);
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  express.static("public", {
    setHeaders: (res, path, stat) => {
      let contentType = `application/octet-stream`;
      if (path.endsWith(`.js`)) contentType = "application/javascript";
      else if (path.endsWith(`.css`)) contentType = "text/css";
      else if (path.endsWith(`.html`)) contentType = "text/html";
      res.setHeader("Content-Type", contentType);
    },
  })
);

app.post(`/api`, proxy(API_SERVER_URL));
app.get(`/api`, proxy(API_SERVER_URL));
app.get(`/`, (_req, res) => res.redirect(`/index.html`));

app.listen(WEB_SERVER_PORT, () => {
  console.log(`Server listening on http://localhost:${WEB_SERVER_PORT}`);
  if (!process.argv.includes(`--no-open`)) {
    open(`http://localhost:${WEB_SERVER_PORT}`);
  }
});

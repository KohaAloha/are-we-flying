import proxy from "express-http-proxy";
import express from "express";
import open from "open";
const app = express();
const apiServer = `http://localhost:8080`;

app.disable("view cache");
app.set("etag", false);

app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  express.static("public", {
    setHeaders: (res, path, stat) => {
      console.log(path, path.endsWith('.css'));
      let contentTyp = `application/octet-stream`;
      if (path.endsWith(`.js`)) {
        contentTyp = "application/javascript";
      }
      else if (path.endsWith(`.css`)) {
        contentTyp = "text/css";
      }
      else if (path.endsWith(`.html`)) {
        contentTyp = "text/html";
      }
      else {
        contentTyp = "application/octet-stream";
      }
      res.setHeader("Content-Type", contentTyp);
    },
  })
);

app.post(`/api`, proxy(`${apiServer}`));
app.get(`/api`, proxy(`${apiServer}`));

app.get(`/`, (_req, res) => res.redirect(`/index.html`));

app.listen(3000, () => {
  console.log(`Server listening on http://localhost:3000`);
  open(`http://localhost:3000`);
});

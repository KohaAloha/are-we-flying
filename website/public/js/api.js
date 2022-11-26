function getAPI(...props) {
  return fetch(`http://localhost:8080/?get=${props.join(`,`)}`).then((res) =>
    res.json()
  );
}

function setAPI(propName, value) {
  return fetch(`http://localhost:8080/?${propName}=${value}`, {
    method: `POST`,
    mode: "cors",
  }).then((res) => res.json());
}

export { getAPI, setAPI };

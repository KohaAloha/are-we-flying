function getAPI(...props) {
  return fetch(`http://localhost:8080/?get=${props.join(`,`)}`).then((res) =>
    res.json()
  );
}

export { getAPI };

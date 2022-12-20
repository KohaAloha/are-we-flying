function getAPI(...props) {
  return fetch(`/api/?get=${props.join(`,`)}`).then((res) =>
    res.json()
  );
}

// Truly idiotic that we can't just use ESM in workers

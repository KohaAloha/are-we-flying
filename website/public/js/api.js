function getAPI(...props) {
  return fetch(`/api/?get=${props.join(`,`)}`).then((res) =>
    res.json()
  );
}

function setAPI(propName, value) {
  return fetch(`/api/?${propName}=${value}`, {
    method: `POST`,
    mode: "cors",
  }).then((res) => res.json());
}

const API = {
  values: {
    get AILERON_TRIM() {
      return getAPI(`AILERON_TRIM_PCT`);
    },
    set AILERON_TRIM(percent) {
      setAPI(`AILERON_TRIM_PCT`, percent / 100);
    },
    get ELEVATOR_TRIM() {
      return getAPI(`ELEVATOR_TRIM_POSITION`);
    },
    set ELEVATOR_TRIM(radians) {
      setAPI(`ELEVATOR_TRIM_POSITION`, radians);
    },
    get RUDDER_TRIM() {
      return getAPI(`RUDDER_TRIM_PCT`);
    },
    set RUDDER_TRIM(percent) {
      setAPI(`RUDDER_TRIM_PCT`, percent / 100);
    },
  },
};

globalThis.API = API;

export { getAPI, setAPI, API };

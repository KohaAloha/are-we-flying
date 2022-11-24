const worker = new Worker("js/event-monitor/monitor-worker.js");

export class Monitor {
  constructor(handleDataFunction) {
    // this is complete bullshit, this should be an event handler.
    worker.onmessage = ({ data }) => handleDataFunction(data);
  }

  register(propertyName, howOftenInMillis) {
    worker.postMessage({ propertyName, howOftenInMillis });
  }
  registerAll(propertyNames, howOftenInMillis) {
    propertyNames.forEach((propertyName) =>
      this.register(propertyName, howOftenInMillis)
    );
  }
  mute(propertyName) {
    worker.postMessage({ propertyName, mute: true });
  }
  muteAll(...propertyNames) {
    propertyNames.forEach(this.mute);
  }
  unmute(propertyName) {
    worker.postMessage({ propertyName, mute: false });
  }
  unmuteAll(...propertyNames) {
    propertyNames.forEach(this.unmute);
  }
}

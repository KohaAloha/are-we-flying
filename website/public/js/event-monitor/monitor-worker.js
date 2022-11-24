// this is the worst API. What is `onmessage` a property of? Who knows!
// Obviously, "the worker" but what is that object? How do we access it?
// Again: who knows!

importScripts("api-worker.js");

const DEBUG = false;
function log(...args) {
  if (DEBUG) if (DEBUG) log(...args);
}

class QuerySet {
  constructor(howOftenInMillis) {
    this.props = [];
    this.interval = howOftenInMillis;
  }
  add(prop) {
    if (!this.props.includes(prop)) this.unmute(prop);
  }
  mute(prop) {
    const pos = this.props.indexOf(prop);
    if (pos > -1) {
      log(`removing ${prop} from QS:${this.interval}...`);
      this.props.splice(pos, 1);
      if (this.props.length === 0) {
        log(`no properties left, clearing interval for QS:${this.interval}`);
        clearInterval(this.timer);
      }
    }
  }
  unmute(prop) {
    log(`add ${prop} to QS:${this.interval}...`);
    this.props.push(prop);
    if (this.props.length === 1) {
      log(
        `first property, scheduling the call interval for QS:${this.interval}`
      );
      this.timer = setInterval(() => this.run(), this.interval);
      // also make sure we start "immediately" rather than {this.interval}ms in the future.
      setTimeout(() => this.run(), 100);
    }
  }
  async run() {
    postMessage(await getAPI(this.props));
  }
}

const querySets = {};

function getQuerySet(interval) {
  querySets[interval] ??= new QuerySet(interval);
  return querySets[interval];
}

function mute(propertyName) {
  if (DEBUG) log(`worker mute:`, propertyName);
  Object.entries(querySets).forEach(([interval, queryset]) =>
    queryset.mute(propertyName)
  );
}

function unmute(propertyName) {
  if (DEBUG) log(`worker unmute:`, propertyName);
  Object.entries(querySets).forEach(([interval, queryset]) =>
    queryset.unmute(propertyName)
  );
}

onmessage = (evt) => {
  const { propertyName, howOftenInMillis, mute: m } = evt.data;
  if (m === true) return mute(propertyName);
  if (m === false) return unmute(propertyName);
  getQuerySet(howOftenInMillis).add(propertyName);
};

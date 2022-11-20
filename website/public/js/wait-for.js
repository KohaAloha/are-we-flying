export function waitFor(fn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    (async function run() {
      const data = await fn();
      if (!data) return setTimeout(run, timeout);
      resolve(data);
    })();
  });
}

export function waitFor(fn, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    (async function run() {
      if (retries > Number.MAX_SAFE_INTEGER) { // mostly code in place in case we need to restrict call numbers
        reject(new Error(`failed after 10 attempts`));
      }
      try {
        const data = await fn();
        if (!data) {
          retries++;
          return setTimeout(run, timeout);
        }
        resolve(data);
      } catch (e) {
        console.error(e);
      }
    })();
  });
}

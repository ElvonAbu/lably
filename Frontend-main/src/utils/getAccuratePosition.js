// Returns the BEST location fix instead of the first one.
//
// Why: getCurrentPosition({ enableHighAccuracy:false }) hands back the first
// answer the browser has, which is often a coarse Wi-Fi / IP / cell-tower guess
// (that is how you can end up in the wrong city). A real GPS fix takes a few
// seconds to "settle", so we listen with watchPosition, keep the most accurate
// reading, and stop as soon as it is good enough (or the time budget runs out).

const GOOD_ENOUGH_M = 40;     // stop immediately at this accuracy (metres)
const OK_AFTER_SOFT_M = 120;  // accept this once SOFT_MS has passed
const SOFT_MS = 4000;
const MAX_USABLE_M = 1500;   // anything rougher is an IP guess, never use it
const HARD_MS = 15000;        // never wait longer than this for a fix

const timeoutError = () => ({
  code: 3,
  message: "Could not get an accurate location",
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
});

export function getAccuratePosition({ onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject({ code: 2, message: "Geolocation not supported" });
      return;
    }

    let best = null;
    let finished = false;
    let watchId = null;
    let softTimer = null;
    let hardTimer = null;
    const startedAt = Date.now();

    const cleanup = () => {
      finished = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
    };

    const done = () => {
      if (finished) return;
      cleanup();
      if (best && (best.coords.accuracy ?? Infinity) <= MAX_USABLE_M) {
        resolve(best);
      } else {
        reject({ code: 2, message: "Only a rough location was available" });
      }
    };

    const fail = (error) => {
      if (finished) return;
      cleanup();
      reject(error);
    };

    const consider = (position) => {
      if (finished) return;
      const acc = position.coords.accuracy ?? Infinity;
      if (acc > MAX_USABLE_M) return; // too rough: keep waiting for a real fix
      if (!best || acc < (best.coords.accuracy ?? Infinity)) best = position;
      if (onProgress) onProgress(best);

      if (acc <= GOOD_ENOUGH_M) {
        done();
      } else if (
        Date.now() - startedAt >= SOFT_MS &&
        (best.coords.accuracy ?? Infinity) <= OK_AFTER_SOFT_M
      ) {
        done();
      }
    };

    watchId = navigator.geolocation.watchPosition(
      consider,
      (error) => {
        // Permission denied is final. Anything else: keep waiting until the
        // hard timer, then fall back to whatever we have.
        if (error.code === error.PERMISSION_DENIED) fail(error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: HARD_MS }
    );

    // After SOFT_MS take the best fix if it is reasonably good.
    softTimer = setTimeout(() => {
      if (best && (best.coords.accuracy ?? Infinity) <= OK_AFTER_SOFT_M) done();
    }, SOFT_MS);

    // Hard stop: use the best usable fix we saw. If there never was one,
    // fail (the caller shows its "couldn't find you" help) rather than
    // falling back to a rough IP-based position.
    hardTimer = setTimeout(() => {
      if (finished) return;
      if (best) {
        done();
        return;
      }
      fail(timeoutError());
    }, HARD_MS);
  });
}

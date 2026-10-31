// Loads the real game code in Node with just enough of a browser to run battles.
"use strict";
const noop = () => {};
const mockCtx = () => new Proxy({
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
}, { get: (o, k) => o[k] ?? noop, set: () => true });
const mockCanvas = () => ({
  width: 480, height: 270,
  getContext: mockCtx,
  addEventListener: noop,
  removeEventListener: noop,
  toDataURL: () => "data:image/png;base64,",
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
});

global.window = global;
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
global.document = {
  createElement: () => mockCanvas(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: noop,
  documentElement: { style: { setProperty: noop } },
  body: { dataset: {} },
};
global.addEventListener = noop;
global.removeEventListener = noop;
global.dispatchEvent = noop;
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = noop;
global.setTimeout = (fn) => { fn(); return 1; };
global.clearTimeout = noop;

require("../assets/manifest.js");
require("../src/data.js");
require("../src/core.js");
require("../src/audio.js");
require("../src/battle.js");

module.exports = { BC: global.BC, mockCanvas, noop };

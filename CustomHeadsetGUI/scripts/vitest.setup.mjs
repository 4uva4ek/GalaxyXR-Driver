// Vitest setup: the app runs in a Tauri WebView where the browser globals
// (`self`, `window`, `navigator.locks`, event listeners) exist; the Node
// test environment lacks a few of them. Provide minimal shims so the
// browser-targeted code under test can be constructed and exercised.
if (globalThis.self === undefined) {
  globalThis.self = globalThis;
}

if (globalThis.window === undefined) {
  globalThis.window = globalThis;
}

// Minimal addEventListener/removeEventListener (Node's globalThis does not
// implement them); used by app-context.ts' pagehide teardown hook.
if (typeof globalThis.addEventListener !== 'function') {
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    let set = listeners.get(type);
    if (!set) { set = new Set(); listeners.set(type, set); }
    set.add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    listeners.get(type)?.delete(fn);
  };
}

// Deterministic network: no test may make a real HTTP request (app-update's
// GitHub check is the only fetcher in the unit graph; its catch path is
// exercised instead). Node has a global fetch — replace it for the tests.
globalThis.fetch = () => {
  throw new TypeError('fetch is disabled in the Node test environment');
};

// Web Locks API (navigator.locks) — settings-base.ts uses it to serialize
// settings file loads. Single-threaded test env: run the callback now.
try {
  if (!globalThis.navigator?.locks) {
    Object.defineProperty(globalThis, 'navigator', {
      value: Object.assign(
        Object.create(Object.getPrototypeOf(globalThis.navigator)),
        globalThis.navigator,
        { locks: { request: (_name, fn) => Promise.resolve().then(() => fn()) } },
      ),
      configurable: true,
    });
  }
} catch {
  // If the runtime's navigator cannot be redefined, tests touching
  // navigator.locks fail loudly instead of silently passing.
}

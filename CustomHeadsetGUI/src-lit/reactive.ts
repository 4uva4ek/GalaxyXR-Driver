// Minimal reactive core (Lit frontend, 2026-09-20 migration).
// Replaces the @angular/core {signal, computed, effect, untracked} subset that
// the ported service/domain layer uses. Same observable semantics the old code
// relies on: reads are tracked inside an effect, updates re-run effects on a
// microtask, effects detach from stale dependencies each run.
// No Angular, no zone.js, no framework runtime.

export interface ReadonlySignal<T> {
  (): T;
  asReadonly(): ReadonlySignal<T>;
  subscribe(fn: () => void): () => void;
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

interface TrackedEffect {
  deps?: Set<Signal<any>>;
  scheduled?: boolean;
  disposed?: boolean;
  schedule(): void;
  dispose(): void;
}

let activeEffect: TrackedEffect | null = null;
const trackedSubs = new WeakMap<Signal<any>, Set<TrackedEffect>>();

function subsOf(sig: Signal<any>): Set<TrackedEffect> {
  let set = trackedSubs.get(sig);
  if (!set) {
    set = new Set();
    trackedSubs.set(sig, set);
  }
  return set;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const read = (() => {
    if (activeEffect) { subsOf(read as Signal<T>).add(activeEffect); activeEffect.deps?.add(read as Signal<T>); }
    return value;
  }) as Signal<T>;
  read.set = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    const subs = trackedSubs.get(read);
    if (subs) for (const effect of [...subs]) effect.schedule();
  };
  read.update = (fn: (value: T) => T) => read.set(fn(value));
  read.asReadonly = () => read;
  read.subscribe = (fn: () => void) => {
    const effect: TrackedEffect = {
      scheduled: false,
      disposed: false,
      schedule() {
        if (this.disposed || this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          if (!this.disposed) fn();
        });
      },
      dispose() { this.disposed = true; },
    };
    const set = subsOf(read);
    set.add(effect);
    return () => { effect.dispose(); set.delete(effect); };
  };
  return read;
}

export function computed<T>(fn: () => T): Signal<T> {
  // Lazy: the computation runs on the first read, and re-runs on a
  // microtask after a tracked dependency changes — the same observable
  // semantics as @angular/core's computed (and the rest of this module,
  // which propagates updates on microtasks).
  // Laziness is REQUIRED, not just a perf detail: class field initializers
  // run BEFORE the constructor body under ES2022 class-field semantics, so
  // an eager first evaluation would dereference constructor-injected
  // dependencies that are still undefined — e.g. SystemDiagnosticService's
  // settingFileInited / driverVersionMismatch fields read this.dss / this.dis,
  // which are parameter properties assigned in the constructor body.
  let value: T;
  let dirty = true;
  let scheduled = false;
  let disposed = false;
  const deps = new Set<Signal<any>>();

  const notify = () => {
    const subs = trackedSubs.get(read);
    if (subs) for (const sub of [...subs]) sub.schedule();
  };

  const evaluate = () => {
    if (disposed) return;
    // detach from last run's dependencies before re-tracking
    for (const dep of deps) subsOf(dep).delete(tracked);
    deps.clear();
    const previous = activeEffect;
    activeEffect = tracked;
    let next: T;
    try {
      next = fn();
    } finally {
      activeEffect = previous;
    }
    if (!Object.is(next, value)) {
      value = next;
      notify();
    }
  };

  const tracked: TrackedEffect = {
    deps,
    scheduled: false,
    schedule() {
      if (disposed) return;
      dirty = true;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (disposed) return;
        if (dirty) { dirty = false; evaluate(); }
      });
    },
    dispose() {
      disposed = true;
      for (const dep of deps) subsOf(dep).delete(tracked);
      deps.clear();
    },
  };

  const read = (() => {
    if (dirty) {
      dirty = false;
      evaluate();
    }
    if (activeEffect) { subsOf(read as Signal<T>).add(activeEffect); activeEffect.deps?.add(read as Signal<T>); }
    return value;
  }) as Signal<T>;

  read.set = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    dirty = false;
    const subs = trackedSubs.get(read);
    if (subs) for (const effect of [...subs]) effect.schedule();
  };
  read.update = (fn: (value: T) => T) => read.set(fn(value));
  read.asReadonly = () => read;
  read.subscribe = (fn: () => void) => {
    const effect: TrackedEffect = {
      scheduled: false,
      disposed: false,
      schedule() {
        if (this.disposed || this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          if (!this.disposed) fn();
        });
      },
      dispose() { this.disposed = true; },
    };
    const set = subsOf(read);
    set.add(effect);
    return () => { effect.dispose(); set.delete(effect); };
  };
  return read;
}

export function effect(fn: () => void): () => void {
  const effect: TrackedEffect & { deps: Set<Signal<any>>; run: () => void } = {
    deps: new Set(),
    scheduled: false,
    disposed: false,
    schedule() {
      if (this.disposed || this.scheduled) return;
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this.run();
      });
    },
    dispose() {
      this.disposed = true;
      for (const dep of this.deps) subsOf(dep).delete(effect);
      this.deps.clear();
    },
    run() {
      if (this.disposed) return;
      // detach from last run's dependencies before re-tracking
      for (const dep of this.deps) subsOf(dep).delete(effect);
      this.deps.clear();
      const previous = activeEffect;
      activeEffect = effect;
      try {
        fn();
      } finally {
        activeEffect = previous;
      }
    },
  };
  effect.run();
  return () => effect.dispose();
}

export function untracked<T>(fn: () => T): T {
  const previous = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = previous;
  }
}

// Unit tests for the reactive core (reactive.ts), in particular the LAZY
// semantics of `computed` — the fix for the app-startup crash
// "TypeError: Cannot read properties of undefined (reading 'values')":
// class field initializers run before the constructor body (ES2022 class
// fields), so a computed whose function reads a constructor-injected
// dependency (SystemDiagnosticService's settingFileInited /
// driverVersionMismatch read this.dss / this.dis) must NOT evaluate until
// first read.
import { describe, it, expect } from 'vitest';
import { signal, computed, effect, untracked } from './reactive';

const flushMacrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('computed lazy first evaluation', () => {
  it('does not evaluate until the first read', () => {
    let evals = 0;
    const c = computed(() => {
      evals++;
      return 42;
    });
    expect(evals).toBe(0);
    expect(c()).toBe(42);
    expect(evals).toBe(1);
    c();
    c();
    expect(evals).toBe(1);
  });

  it('allows field initializers to read constructor-injected dependencies (the startup crash pattern)', () => {
    interface FakeDss {
      values(): { ready: boolean } | undefined;
      readFileError(): unknown;
    }
    const dss: FakeDss = { values: () => ({ ready: true }), readFileError: () => undefined };
    // Mirrors SystemDiagnosticService: parameter property assigned in the
    // constructor body, computed field initializer that reads it.
    class ServiceUnderTest {
      constructor(private dss: FakeDss) {}
      public readonly settingFileInited = computed(() => !!this.dss.values() && !this.dss.readFileError());
      public readonly driverVersionMismatch = computed(() => !!this.dss.values());
    }
    // Must not throw: during field initialization `this.dss` is undefined.
    const svc = new ServiceUnderTest(dss);
    expect(svc.settingFileInited()).toBe(true);
    expect(svc.driverVersionMismatch()).toBe(true);
  });

  it('still works when the dependency is genuinely undefined at read time', () => {
    const c = computed(() => (undefined as { values?: () => string } | undefined)?.values?.() ?? 'fallback');
    expect(c()).toBe('fallback');
  });
});

describe('computed tracking and propagation', () => {
  it('re-evaluates on a dependency change and keeps the value fresh', async () => {
    const s = signal(1);
    const c = computed(() => s() * 2);
    expect(c()).toBe(2);
    s.set(5);
    await flushMacrotask();
    expect(c()).toBe(10);
  });

  it('notifies downstream effects after a dependency change', async () => {
    const s = signal(1);
    const c = computed(() => s() * 10);
    let seen = -1;
    effect(() => {
      seen = c();
    });
    expect(seen).toBe(10);
    s.set(3);
    await flushMacrotask();
    expect(seen).toBe(30);
  });

  it('coalesces multiple dependency changes into one re-evaluation', async () => {
    const s = signal(0);
    let evals = 0;
    const c = computed(() => {
      evals++;
      return s();
    });
    c();
    expect(evals).toBe(1);
    s.set(1);
    s.set(2);
    s.set(3);
    await flushMacrotask();
    expect(evals).toBe(2);
    expect(c()).toBe(3);
  });

  it('tracks only the dependencies actually read (branch switching)', async () => {
    const a = signal(true);
    const b = signal(1);
    let evals = 0;
    const c = computed(() => {
      evals++;
      return a() ? 1 : b();
    });
    expect(c()).toBe(1);
    expect(evals).toBe(1);
    // b is not read in the current branch: changing it must not re-evaluate
    b.set(2);
    await flushMacrotask();
    expect(evals).toBe(1);
    // switching the branch re-evaluates and picks up b's new value
    a.set(false);
    await flushMacrotask();
    expect(evals).toBe(2);
    expect(c()).toBe(2);
  });

  it('does not notify downstream when the value is unchanged', async () => {
    const s = signal(1);
    const c = computed(() => (s() > 0 ? 'pos' : 'neg'));
    let runs = 0;
    effect(() => {
      void c();
      runs++;
    });
    expect(runs).toBe(1);
    s.set(2); // still > 0 -> same value -> no downstream re-run
    await flushMacrotask();
    expect(runs).toBe(1);
    s.set(-1); // value flips -> downstream re-runs
    await flushMacrotask();
    expect(runs).toBe(2);
    expect(c()).toBe('neg');
  });

  it('untracked reads do not subscribe the reading effect', async () => {
    const s = signal(1);
    const c = computed(() => s());
    let runs = 0;
    effect(() => {
      untracked(() => {
        void c();
      });
      runs++;
    });
    expect(runs).toBe(1);
    s.set(2);
    await flushMacrotask();
    expect(runs).toBe(1);
  });

  it('supports manual set/update', async () => {
    const c = computed(() => 7);
    expect(c()).toBe(7);
    c.set(9);
    expect(c()).toBe(9);
    c.update(v => v + 1);
    expect(c()).toBe(10);
    let seen = -1;
    const sub = c.subscribe(() => {
      seen = c();
    });
    c.set(11);
    await flushMacrotask();
    expect(seen).toBe(11);
    sub();
  });
});

describe('signal basics (unchanged contract)', () => {
  it('set with the same value does not notify', async () => {
    const s = signal(1);
    let runs = 0;
    effect(() => {
      void s();
      runs++;
    });
    s.set(1);
    await flushMacrotask();
    expect(runs).toBe(1);
    s.set(2);
    await flushMacrotask();
    expect(runs).toBe(2);
  });

  it('dispose detaches the effect from its dependencies', async () => {
    const s = signal(1);
    let runs = 0;
    const dispose = effect(() => {
      void s();
      runs++;
    });
    dispose();
    s.set(2);
    await flushMacrotask();
    expect(runs).toBe(1);
  });
});

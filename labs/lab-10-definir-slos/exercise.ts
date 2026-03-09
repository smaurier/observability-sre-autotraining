import {
  createTestRunner,
  simulateRequests,
  calculateErrorRate,
  calculatePercentile,
  assertSLOCompliance,
} from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 10 — Definir et mesurer des SLOs');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SLIType = 'availability' | 'latency' | 'quality';

interface SLIDefinition {
  name: string;
  type: SLIType;
  description: string;
  goodEventFilter: (req: RequestData) => boolean;
}

interface RequestData {
  status: number;
  durationMs: number;
  timestamp: number;
}

interface SLODefinition {
  sliName: string;
  target: number; // e.g. 0.999
  window: 'rolling-28d' | 'rolling-7d' | 'calendar-month';
}

interface ErrorBudget {
  total: number;         // 1 - target (e.g. 0.001 for 99.9%)
  used: number;          // actual error rate
  remaining: number;     // total - used (clamped to >= 0)
  remainingPercent: number; // remaining / total * 100
}

// ---------------------------------------------------------------------------
// Exercise 1: Define SLI types
// Create SLI definitions for a demo e-commerce API.
// ---------------------------------------------------------------------------
function defineSLIs(): SLIDefinition[] {
  // TODO: Return an array with at least 3 SLIs:
  //   1. "availability" — good if status < 500
  //   2. "latency" — good if durationMs < 300
  //   3. "quality" — good if status < 400 (no client errors)
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: Calculate SLO compliance
// Given requests and an SLI filter, compute the ratio of good events.
// ---------------------------------------------------------------------------
function calculateSLOCompliance(
  requests: RequestData[],
  sli: SLIDefinition
): { compliance: number; goodCount: number; totalCount: number } {
  // TODO: Count requests that pass sli.goodEventFilter
  // TODO: Return { compliance: goodCount / totalCount, goodCount, totalCount }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 3: Calculate error budget
// ---------------------------------------------------------------------------
function calculateErrorBudget(
  requests: RequestData[],
  sli: SLIDefinition,
  sloTarget: number
): ErrorBudget {
  // TODO: total = 1 - sloTarget
  // TODO: used = 1 - compliance (from calculateSLOCompliance)
  // TODO: remaining = max(0, total - used)
  // TODO: remainingPercent = remaining / total * 100
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 4: Rolling window SLO
// Calculate SLO compliance over a sliding window (last N milliseconds).
// ---------------------------------------------------------------------------
function rollingWindowSLO(
  requests: RequestData[],
  sli: SLIDefinition,
  windowMs: number
): { compliance: number; windowRequests: number } {
  // TODO: Filter requests to only those within the last windowMs
  //       (timestamp >= maxTimestamp - windowMs)
  // TODO: Calculate compliance on the filtered set
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 5: Error budget policy — should deploys be frozen?
// ---------------------------------------------------------------------------
interface ErrorBudgetPolicy {
  freezeThresholdPercent: number; // e.g. 20 — freeze if remaining < 20%
}

function shouldFreezeDeployments(
  errorBudget: ErrorBudget,
  policy: ErrorBudgetPolicy
): { freeze: boolean; reason: string } {
  // TODO: If errorBudget.remainingPercent < policy.freezeThresholdPercent, freeze
  // TODO: Return { freeze: true/false, reason: "..." }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 6: Composite SLO
// The composite SLO is the product of individual SLO compliances.
// ---------------------------------------------------------------------------
function calculateCompositeSLO(
  compliances: Array<{ sliName: string; compliance: number; weight: number }>
): { composite: number; details: Array<{ sliName: string; weighted: number }> } {
  // TODO: Composite = sum of (compliance * weight) / sum of weights
  // TODO: Return { composite, details: [...] }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 10 — Definir et mesurer des SLOs ---\n');

  // Ex 1
  await test('Ex1 — SLI definitions exist', () => {
    const slis = defineSLIs();
    assert(slis.length >= 3, 'should have at least 3 SLIs');
    const types = slis.map(s => s.type);
    assert(types.includes('availability'), 'should include availability SLI');
    assert(types.includes('latency'), 'should include latency SLI');
    assert(types.includes('quality'), 'should include quality SLI');
  });

  await test('Ex1 — Availability SLI filter works', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    assert(avail.goodEventFilter({ status: 200, durationMs: 100, timestamp: 0 }), '200 is good');
    assert(!avail.goodEventFilter({ status: 500, durationMs: 100, timestamp: 0 }), '500 is bad');
  });

  await test('Ex1 — Latency SLI filter works', () => {
    const slis = defineSLIs();
    const latency = slis.find(s => s.type === 'latency')!;
    assert(latency.goodEventFilter({ status: 200, durationMs: 50, timestamp: 0 }), '50ms is good');
    assert(!latency.goodEventFilter({ status: 200, durationMs: 500, timestamp: 0 }), '500ms is bad');
  });

  // Ex 2
  await test('Ex2 — SLO compliance calculation', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests: RequestData[] = [
      { status: 200, durationMs: 50, timestamp: 1 },
      { status: 200, durationMs: 60, timestamp: 2 },
      { status: 500, durationMs: 70, timestamp: 3 },
      { status: 200, durationMs: 80, timestamp: 4 },
    ];
    const result = calculateSLOCompliance(requests, avail);
    assertEqual(result.goodCount, 3);
    assertEqual(result.totalCount, 4);
    assertEqual(result.compliance, 0.75);
  });

  await test('Ex2 — 100% compliance', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests = simulateRequests(100, { errorRate: 0 });
    const result = calculateSLOCompliance(requests, avail);
    assertEqual(result.compliance, 1);
  });

  // Ex 3
  await test('Ex3 — Error budget calculation', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests: RequestData[] = Array.from({ length: 1000 }, (_, i) => ({
      status: i < 995 ? 200 : 500,
      durationMs: 50,
      timestamp: i,
    }));
    const budget = calculateErrorBudget(requests, avail, 0.999);
    assertEqual(budget.total, 0.001);
    assert(budget.used > 0, 'should have used some budget');
    assert(budget.remaining >= 0, 'remaining should be >= 0');
    assert(budget.remainingPercent >= 0 && budget.remainingPercent <= 100, 'percent in range');
  });

  await test('Ex3 — Error budget exhausted', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests: RequestData[] = Array.from({ length: 100 }, (_, i) => ({
      status: i < 90 ? 200 : 500,
      durationMs: 50,
      timestamp: i,
    }));
    // 10% error rate with 99.9% target => budget exhausted
    const budget = calculateErrorBudget(requests, avail, 0.999);
    assertEqual(budget.remaining, 0);
    assertEqual(budget.remainingPercent, 0);
  });

  // Ex 4
  await test('Ex4 — Rolling window SLO', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const now = Date.now();
    const requests: RequestData[] = [
      // Old requests (outside window)
      { status: 500, durationMs: 50, timestamp: now - 200_000 },
      { status: 500, durationMs: 50, timestamp: now - 150_000 },
      // Recent requests (inside window)
      { status: 200, durationMs: 50, timestamp: now - 50_000 },
      { status: 200, durationMs: 50, timestamp: now - 30_000 },
      { status: 200, durationMs: 50, timestamp: now },
    ];
    const result = rollingWindowSLO(requests, avail, 100_000);
    assertEqual(result.windowRequests, 3);
    assertEqual(result.compliance, 1);
  });

  // Ex 5
  await test('Ex5 — Freeze deployments when budget low', () => {
    const budget: ErrorBudget = { total: 0.001, used: 0.0009, remaining: 0.0001, remainingPercent: 10 };
    const result = shouldFreezeDeployments(budget, { freezeThresholdPercent: 20 });
    assertEqual(result.freeze, true);
  });

  await test('Ex5 — Allow deployments when budget healthy', () => {
    const budget: ErrorBudget = { total: 0.001, used: 0.0002, remaining: 0.0008, remainingPercent: 80 };
    const result = shouldFreezeDeployments(budget, { freezeThresholdPercent: 20 });
    assertEqual(result.freeze, false);
  });

  // Ex 6
  await test('Ex6 — Composite SLO', () => {
    const result = calculateCompositeSLO([
      { sliName: 'availability', compliance: 0.999, weight: 3 },
      { sliName: 'latency', compliance: 0.99, weight: 2 },
      { sliName: 'quality', compliance: 0.995, weight: 1 },
    ]);
    // weighted avg: (0.999*3 + 0.99*2 + 0.995*1) / 6 = (2.997 + 1.98 + 0.995) / 6 = 5.972 / 6 = 0.99533...
    assert(result.composite > 0.99 && result.composite < 1.0, `composite should be ~0.995, got ${result.composite}`);
    assertEqual(result.details.length, 3);
  });

  await test('Ex6 — Composite SLO equal weights', () => {
    const result = calculateCompositeSLO([
      { sliName: 'a', compliance: 0.9, weight: 1 },
      { sliName: 'b', compliance: 1.0, weight: 1 },
    ]);
    assert(Math.abs(result.composite - 0.95) < 0.001, `composite should be 0.95, got ${result.composite}`);
  });

  summary();
}

main();

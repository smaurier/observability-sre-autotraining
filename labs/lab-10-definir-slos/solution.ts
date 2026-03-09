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
  target: number;
  window: 'rolling-28d' | 'rolling-7d' | 'calendar-month';
}

interface ErrorBudget {
  total: number;
  used: number;
  remaining: number;
  remainingPercent: number;
}

// ---------------------------------------------------------------------------
// Exercise 1: Define SLI types
// ---------------------------------------------------------------------------
function defineSLIs(): SLIDefinition[] {
  return [
    {
      name: 'api-availability',
      type: 'availability',
      description: 'Proportion of requests that do not result in a server error (5xx)',
      goodEventFilter: (req) => req.status < 500,
    },
    {
      name: 'api-latency',
      type: 'latency',
      description: 'Proportion of requests served faster than 300ms',
      goodEventFilter: (req) => req.durationMs < 300,
    },
    {
      name: 'api-quality',
      type: 'quality',
      description: 'Proportion of requests that do not result in any error (4xx or 5xx)',
      goodEventFilter: (req) => req.status < 400,
    },
  ];
}

// ---------------------------------------------------------------------------
// Exercise 2: Calculate SLO compliance
// ---------------------------------------------------------------------------
function calculateSLOCompliance(
  requests: RequestData[],
  sli: SLIDefinition
): { compliance: number; goodCount: number; totalCount: number } {
  const totalCount = requests.length;
  if (totalCount === 0) return { compliance: 1, goodCount: 0, totalCount: 0 };

  const goodCount = requests.filter(r => sli.goodEventFilter(r)).length;
  const compliance = goodCount / totalCount;

  return { compliance, goodCount, totalCount };
}

// ---------------------------------------------------------------------------
// Exercise 3: Calculate error budget
// ---------------------------------------------------------------------------
function calculateErrorBudget(
  requests: RequestData[],
  sli: SLIDefinition,
  sloTarget: number
): ErrorBudget {
  const { compliance } = calculateSLOCompliance(requests, sli);
  const total = 1 - sloTarget;
  const used = 1 - compliance;
  const remaining = Math.max(0, total - used);
  const remainingPercent = total > 0 ? (remaining / total) * 100 : 0;

  return { total, used, remaining, remainingPercent };
}

// ---------------------------------------------------------------------------
// Exercise 4: Rolling window SLO
// ---------------------------------------------------------------------------
function rollingWindowSLO(
  requests: RequestData[],
  sli: SLIDefinition,
  windowMs: number
): { compliance: number; windowRequests: number } {
  if (requests.length === 0) return { compliance: 1, windowRequests: 0 };

  const maxTimestamp = Math.max(...requests.map(r => r.timestamp));
  const windowStart = maxTimestamp - windowMs;
  const windowReqs = requests.filter(r => r.timestamp >= windowStart);
  const { compliance } = calculateSLOCompliance(windowReqs, sli);

  return { compliance, windowRequests: windowReqs.length };
}

// ---------------------------------------------------------------------------
// Exercise 5: Error budget policy
// ---------------------------------------------------------------------------
interface ErrorBudgetPolicy {
  freezeThresholdPercent: number;
}

function shouldFreezeDeployments(
  errorBudget: ErrorBudget,
  policy: ErrorBudgetPolicy
): { freeze: boolean; reason: string } {
  if (errorBudget.remainingPercent < policy.freezeThresholdPercent) {
    return {
      freeze: true,
      reason: `Error budget remaining (${errorBudget.remainingPercent.toFixed(1)}%) is below threshold (${policy.freezeThresholdPercent}%). Deployments are frozen.`,
    };
  }
  return {
    freeze: false,
    reason: `Error budget remaining (${errorBudget.remainingPercent.toFixed(1)}%) is above threshold (${policy.freezeThresholdPercent}%). Deployments are allowed.`,
  };
}

// ---------------------------------------------------------------------------
// Exercise 6: Composite SLO
// ---------------------------------------------------------------------------
function calculateCompositeSLO(
  compliances: Array<{ sliName: string; compliance: number; weight: number }>
): { composite: number; details: Array<{ sliName: string; weighted: number }> } {
  const totalWeight = compliances.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return { composite: 0, details: [] };

  const details = compliances.map(c => ({
    sliName: c.sliName,
    weighted: c.compliance * c.weight,
  }));

  const composite = details.reduce((sum, d) => sum + d.weighted, 0) / totalWeight;

  return { composite, details };
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
    assert(avail.goodEventFilter({ status: 404, durationMs: 100, timestamp: 0 }), '404 is good (not server error)');
    assert(!avail.goodEventFilter({ status: 500, durationMs: 100, timestamp: 0 }), '500 is bad');
    assert(!avail.goodEventFilter({ status: 503, durationMs: 100, timestamp: 0 }), '503 is bad');
  });

  await test('Ex1 — Latency SLI filter works', () => {
    const slis = defineSLIs();
    const latency = slis.find(s => s.type === 'latency')!;
    assert(latency.goodEventFilter({ status: 200, durationMs: 50, timestamp: 0 }), '50ms is good');
    assert(latency.goodEventFilter({ status: 200, durationMs: 299, timestamp: 0 }), '299ms is good');
    assert(!latency.goodEventFilter({ status: 200, durationMs: 300, timestamp: 0 }), '300ms is bad');
    assert(!latency.goodEventFilter({ status: 200, durationMs: 500, timestamp: 0 }), '500ms is bad');
  });

  await test('Ex1 — Quality SLI filter works', () => {
    const slis = defineSLIs();
    const quality = slis.find(s => s.type === 'quality')!;
    assert(quality.goodEventFilter({ status: 200, durationMs: 50, timestamp: 0 }), '200 is good');
    assert(!quality.goodEventFilter({ status: 400, durationMs: 50, timestamp: 0 }), '400 is bad');
    assert(!quality.goodEventFilter({ status: 500, durationMs: 50, timestamp: 0 }), '500 is bad');
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

  await test('Ex2 — Empty requests', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const result = calculateSLOCompliance([], avail);
    assertEqual(result.compliance, 1);
    assertEqual(result.totalCount, 0);
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
    const budget = calculateErrorBudget(requests, avail, 0.999);
    assertEqual(budget.remaining, 0);
    assertEqual(budget.remainingPercent, 0);
  });

  await test('Ex3 — Full budget available at 100% compliance', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests: RequestData[] = Array.from({ length: 100 }, (_, i) => ({
      status: 200,
      durationMs: 50,
      timestamp: i,
    }));
    const budget = calculateErrorBudget(requests, avail, 0.999);
    assertEqual(budget.used, 0);
    assertEqual(budget.remainingPercent, 100);
  });

  // Ex 4
  await test('Ex4 — Rolling window SLO', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const now = Date.now();
    const requests: RequestData[] = [
      { status: 500, durationMs: 50, timestamp: now - 200_000 },
      { status: 500, durationMs: 50, timestamp: now - 150_000 },
      { status: 200, durationMs: 50, timestamp: now - 50_000 },
      { status: 200, durationMs: 50, timestamp: now - 30_000 },
      { status: 200, durationMs: 50, timestamp: now },
    ];
    const result = rollingWindowSLO(requests, avail, 100_000);
    assertEqual(result.windowRequests, 3);
    assertEqual(result.compliance, 1);
  });

  await test('Ex4 — Rolling window includes errors', () => {
    const slis = defineSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const now = Date.now();
    const requests: RequestData[] = [
      { status: 200, durationMs: 50, timestamp: now - 5000 },
      { status: 500, durationMs: 50, timestamp: now - 3000 },
      { status: 200, durationMs: 50, timestamp: now },
    ];
    const result = rollingWindowSLO(requests, avail, 10_000);
    assertEqual(result.windowRequests, 3);
    assert(Math.abs(result.compliance - 2 / 3) < 0.01, 'compliance should be ~0.667');
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

  await test('Ex5 — Freeze at exact threshold', () => {
    const budget: ErrorBudget = { total: 0.001, used: 0.0008, remaining: 0.0002, remainingPercent: 19.9 };
    const result = shouldFreezeDeployments(budget, { freezeThresholdPercent: 20 });
    assertEqual(result.freeze, true);
  });

  // Ex 6
  await test('Ex6 — Composite SLO', () => {
    const result = calculateCompositeSLO([
      { sliName: 'availability', compliance: 0.999, weight: 3 },
      { sliName: 'latency', compliance: 0.99, weight: 2 },
      { sliName: 'quality', compliance: 0.995, weight: 1 },
    ]);
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

  await test('Ex6 — Composite SLO with test-utils helpers', () => {
    const requests = simulateRequests(1000, { errorRate: 0.01 });
    const errorRate = calculateErrorRate(requests);
    const availability = 1 - errorRate;
    const durations = requests.map(r => r.durationMs);
    const p99 = calculatePercentile(durations, 99);
    // Use assertSLOCompliance from test-utils
    const sloResult = assertSLOCompliance(requests, { target: 0.95, type: 'availability' });
    assert(sloResult.actual > 0.9, 'availability should be > 90%');
  });

  summary();
}

main();

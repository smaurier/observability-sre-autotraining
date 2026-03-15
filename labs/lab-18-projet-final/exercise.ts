import {
  createTestRunner,
  simulateRequests,
  calculateErrorRate,
  calculatePercentile,
  assertSLOCompliance,
  calculateBurnRate,
  generateMetricsSeries,
} from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 19 — Projet Final');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SLIDefinition {
  name: string;
  type: 'availability' | 'latency' | 'quality';
  description: string;
  goodEventFilter: (req: RequestData) => boolean;
}

interface SLOTarget {
  sliName: string;
  target: number;
  window: string;
}

interface RequestData {
  status: number;
  durationMs: number;
  timestamp: number;
}

interface BurnRateAlert {
  name: string;
  shortWindowMs: number;
  longWindowMs: number;
  burnRateThreshold: number;
  severity: 'critical' | 'warning';
}

interface BurnRateAlertResult {
  alertName: string;
  firing: boolean;
  shortWindowBurnRate: number;
  longWindowBurnRate: number;
}

interface LoadTestResult {
  totalRequests: number;
  successRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerSecond: number;
}

interface ChaosExperiment {
  name: string;
  type: 'latency-injection' | 'error-injection' | 'dependency-failure';
  config: Record<string, unknown>;
}

interface ChaosResult {
  experiment: ChaosExperiment;
  beforeSLO: number;
  afterSLO: number;
  impactPercent: number;
  recovered: boolean;
}

interface Postmortem {
  title: string;
  date: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  summary: string;
  impact: string;
  timeline: Array<{ time: string; event: string }>;
  rootCause: string;
  actionItems: Array<{ action: string; owner: string; priority: 'high' | 'medium' | 'low' }>;
  lessonsLearned: string[];
}

// ---------------------------------------------------------------------------
// Exercise 1: Define SLIs and SLOs for the final project service
// ---------------------------------------------------------------------------
function defineServiceSLIs(): SLIDefinition[] {
  // TODO: Define at least 3 SLIs:
  //   1. availability: status < 500
  //   2. latency: durationMs < 200
  //   3. quality: status < 400
  throw new Error('Not implemented');
}

function defineServiceSLOs(slis: SLIDefinition[]): SLOTarget[] {
  // TODO: Define SLO targets for each SLI:
  //   availability: 99.9%
  //   latency: 99%
  //   quality: 99.5%
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: Generate metrics and check SLO compliance
// ---------------------------------------------------------------------------
function checkSLOCompliance(
  requests: RequestData[],
  sli: SLIDefinition,
  target: number
): {
  compliance: number;
  target: number;
  met: boolean;
  errorBudgetRemainingPercent: number;
} {
  // TODO: Calculate compliance = good / total
  // TODO: met = compliance >= target
  // TODO: errorBudgetRemainingPercent = max(0, ((1-target) - (1-compliance)) / (1-target) * 100)
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 3: Burn rate alerting
// ---------------------------------------------------------------------------
function defineBurnRateAlerts(sloTarget: number): BurnRateAlert[] {
  // TODO: Define multi-window burn rate alerts:
  //   1. Critical: 14.4x burn rate, short=5min, long=1h
  //   2. Warning: 6x burn rate, short=30min, long=6h
  //   3. Low: 3x burn rate, short=2h, long=24h
  throw new Error('Not implemented');
}

function evaluateBurnRateAlert(
  alert: BurnRateAlert,
  requests: RequestData[],
  sloTarget: number
): BurnRateAlertResult {
  // TODO: Calculate burn rate for short and long windows using calculateBurnRate from test-utils
  // TODO: Alert fires if BOTH short and long window burn rates exceed threshold
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 4: Simulated load test
// ---------------------------------------------------------------------------
function runLoadTest(
  durationMs: number,
  requestsPerSecond: number,
  errorRate: number,
  minLatencyMs: number,
  maxLatencyMs: number
): LoadTestResult {
  // TODO: Use simulateRequests to generate traffic
  // TODO: Calculate all metrics: success rate, error rate, p50/p95/p99 latency, actual RPS
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 5: Chaos injection and impact measurement
// ---------------------------------------------------------------------------
function runChaosExperiment(
  experiment: ChaosExperiment,
  baseRequests: RequestData[],
  sli: SLIDefinition,
  sloTarget: number
): ChaosResult {
  // TODO: Calculate beforeSLO from baseRequests
  // TODO: Apply chaos effect to generate impacted requests:
  //   - 'error-injection': flip some 200s to 500s based on config.errorRate
  //   - 'latency-injection': add config.additionalLatencyMs to durationMs
  //   - 'dependency-failure': flip config.failureRate of requests to 503
  // TODO: Calculate afterSLO from impacted requests
  // TODO: impactPercent = (beforeSLO - afterSLO) / beforeSLO * 100
  // TODO: recovered = afterSLO >= sloTarget
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 6: Generate postmortem from chaos experiment results
// ---------------------------------------------------------------------------
function generatePostmortem(
  chaosResults: ChaosResult[],
  serviceName: string
): Postmortem {
  // TODO: Generate a structured postmortem including:
  //   - title, date, severity based on worst impact
  //   - summary of what happened
  //   - impact description
  //   - timeline from experiments
  //   - root cause analysis
  //   - action items
  //   - lessons learned
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 19 — Projet Final ---\n');

  // Ex 1
  await test('Ex1 — SLI definitions', () => {
    const slis = defineServiceSLIs();
    assert(slis.length >= 3, 'should have at least 3 SLIs');
    const types = slis.map(s => s.type);
    assert(types.includes('availability'), 'needs availability SLI');
    assert(types.includes('latency'), 'needs latency SLI');
  });

  await test('Ex1 — SLO targets', () => {
    const slis = defineServiceSLIs();
    const slos = defineServiceSLOs(slis);
    assert(slos.length >= 3, 'should have at least 3 SLO targets');
    for (const slo of slos) {
      assert(slo.target > 0.9 && slo.target < 1, `target ${slo.target} should be between 0.9 and 1`);
    }
  });

  // Ex 2
  await test('Ex2 — SLO compliance check — healthy', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests = simulateRequests(10000, { errorRate: 0.0005 });
    const result = checkSLOCompliance(requests, avail, 0.999);
    assert(result.compliance > 0.99, 'compliance should be > 99%');
    assertEqual(result.target, 0.999);
  });

  await test('Ex2 — SLO compliance check — breached', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests = simulateRequests(1000, { errorRate: 0.05 });
    const result = checkSLOCompliance(requests, avail, 0.999);
    assertEqual(result.met, false);
  });

  // Ex 3
  await test('Ex3 — Burn rate alerts defined', () => {
    const alerts = defineBurnRateAlerts(0.999);
    assert(alerts.length >= 3, 'should have at least 3 burn rate alerts');
    const critical = alerts.find(a => a.severity === 'critical');
    assert(critical !== undefined, 'should have a critical alert');
    assertGreaterThan(critical!.burnRateThreshold, 10);
  });

  await test('Ex3 — Burn rate alert not firing in normal conditions', () => {
    const alerts = defineBurnRateAlerts(0.999);
    const requests = simulateRequests(5000, { errorRate: 0.0005 });
    for (const alert of alerts) {
      const result = evaluateBurnRateAlert(alert, requests, 0.999);
      assertEqual(result.firing, false);
    }
  });

  // Ex 4
  await test('Ex4 — Load test results', () => {
    const result = runLoadTest(10_000, 100, 0.01, 10, 200);
    assert(result.totalRequests > 0, 'should have requests');
    assert(result.successRate > 0.95, 'success rate should be > 95%');
    assert(result.p50LatencyMs < result.p99LatencyMs, 'p50 should be < p99');
  });

  await test('Ex4 — Load test with high error rate', () => {
    const result = runLoadTest(5_000, 50, 0.1, 10, 100);
    assert(result.errorRate > 0.05, 'error rate should be > 5%');
  });

  // Ex 5
  await test('Ex5 — Chaos error injection', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const baseRequests = simulateRequests(1000, { errorRate: 0.001 });
    const result = runChaosExperiment(
      { name: 'Error Storm', type: 'error-injection', config: { errorRate: 0.1 } },
      baseRequests, avail, 0.999
    );
    assertGreaterThan(result.impactPercent, 0);
    assert(result.afterSLO < result.beforeSLO, 'SLO should degrade');
  });

  await test('Ex5 — Chaos latency injection', () => {
    const slis = defineServiceSLIs();
    const latency = slis.find(s => s.type === 'latency')!;
    const baseRequests = simulateRequests(1000, { errorRate: 0, minLatencyMs: 10, maxLatencyMs: 100 });
    const result = runChaosExperiment(
      { name: 'Slow DB', type: 'latency-injection', config: { additionalLatencyMs: 300 } },
      baseRequests, latency, 0.99
    );
    assertGreaterThan(result.impactPercent, 0);
  });

  // Ex 6
  await test('Ex6 — Generate postmortem', () => {
    const chaosResults: ChaosResult[] = [
      {
        experiment: { name: 'Error Storm', type: 'error-injection', config: { errorRate: 0.1 } },
        beforeSLO: 0.999, afterSLO: 0.9, impactPercent: 9.9, recovered: false,
      },
    ];
    const pm = generatePostmortem(chaosResults, 'order-service');
    assert(pm.title.length > 0, 'should have title');
    assert(pm.summary.length > 0, 'should have summary');
    assert(pm.timeline.length > 0, 'should have timeline');
    assert(pm.actionItems.length > 0, 'should have action items');
    assert(pm.lessonsLearned.length > 0, 'should have lessons learned');
  });

  await test('Ex6 — Postmortem severity based on impact', () => {
    const chaosResults: ChaosResult[] = [
      {
        experiment: { name: 'Major Failure', type: 'dependency-failure', config: { failureRate: 0.5 } },
        beforeSLO: 0.999, afterSLO: 0.5, impactPercent: 49.9, recovered: false,
      },
    ];
    const pm = generatePostmortem(chaosResults, 'critical-service');
    assertEqual(pm.severity, 'P1');
  });

  summary();
}

main();

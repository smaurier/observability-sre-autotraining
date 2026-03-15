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
// Exercise 1: Define SLIs and SLOs
// ---------------------------------------------------------------------------
function defineServiceSLIs(): SLIDefinition[] {
  return [
    {
      name: 'availability',
      type: 'availability',
      description: 'Proportion of requests that do not result in a server error (5xx)',
      goodEventFilter: (req) => req.status < 500,
    },
    {
      name: 'latency',
      type: 'latency',
      description: 'Proportion of requests served faster than 200ms',
      goodEventFilter: (req) => req.durationMs < 200,
    },
    {
      name: 'quality',
      type: 'quality',
      description: 'Proportion of requests returning valid responses (no 4xx or 5xx)',
      goodEventFilter: (req) => req.status < 400,
    },
  ];
}

function defineServiceSLOs(slis: SLIDefinition[]): SLOTarget[] {
  return slis.map(sli => {
    let target: number;
    switch (sli.type) {
      case 'availability': target = 0.999; break;
      case 'latency': target = 0.99; break;
      case 'quality': target = 0.995; break;
      default: target = 0.99;
    }
    return {
      sliName: sli.name,
      target,
      window: 'rolling-28d',
    };
  });
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
  if (requests.length === 0) {
    return { compliance: 1, target, met: true, errorBudgetRemainingPercent: 100 };
  }

  const goodCount = requests.filter(r => sli.goodEventFilter(r)).length;
  const compliance = goodCount / requests.length;
  const met = compliance >= target;
  const errorBudgetTotal = 1 - target;
  const errorBudgetUsed = 1 - compliance;
  const errorBudgetRemainingPercent = errorBudgetTotal > 0
    ? Math.max(0, ((errorBudgetTotal - errorBudgetUsed) / errorBudgetTotal) * 100)
    : 0;

  return { compliance, target, met, errorBudgetRemainingPercent };
}

// ---------------------------------------------------------------------------
// Exercise 3: Burn rate alerting
// ---------------------------------------------------------------------------
function defineBurnRateAlerts(sloTarget: number): BurnRateAlert[] {
  return [
    {
      name: 'critical-burn',
      shortWindowMs: 5 * 60 * 1000,        // 5 minutes
      longWindowMs: 60 * 60 * 1000,         // 1 hour
      burnRateThreshold: 14.4,
      severity: 'critical',
    },
    {
      name: 'warning-burn',
      shortWindowMs: 30 * 60 * 1000,        // 30 minutes
      longWindowMs: 6 * 60 * 60 * 1000,     // 6 hours
      burnRateThreshold: 6,
      severity: 'warning',
    },
    {
      name: 'low-burn',
      shortWindowMs: 2 * 60 * 60 * 1000,    // 2 hours
      longWindowMs: 24 * 60 * 60 * 1000,    // 24 hours
      burnRateThreshold: 3,
      severity: 'warning',
    },
  ];
}

function evaluateBurnRateAlert(
  alert: BurnRateAlert,
  requests: RequestData[],
  sloTarget: number
): BurnRateAlertResult {
  const shortWindowBurnRate = calculateBurnRate(requests, sloTarget, alert.shortWindowMs);
  const longWindowBurnRate = calculateBurnRate(requests, sloTarget, alert.longWindowMs);

  // Alert fires if BOTH windows exceed the threshold
  const firing = shortWindowBurnRate > alert.burnRateThreshold && longWindowBurnRate > alert.burnRateThreshold;

  return {
    alertName: alert.name,
    firing,
    shortWindowBurnRate,
    longWindowBurnRate,
  };
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
  const totalRequests = Math.floor((durationMs / 1000) * requestsPerSecond);
  const requests = simulateRequests(totalRequests, { errorRate, minLatencyMs, maxLatencyMs });

  const durations = requests.map(r => r.durationMs);
  const errRate = calculateErrorRate(requests);

  return {
    totalRequests,
    successRate: 1 - errRate,
    errorRate: errRate,
    p50LatencyMs: calculatePercentile(durations, 50),
    p95LatencyMs: calculatePercentile(durations, 95),
    p99LatencyMs: calculatePercentile(durations, 99),
    requestsPerSecond: totalRequests / (durationMs / 1000),
  };
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
  // Calculate before SLO
  const goodBefore = baseRequests.filter(r => sli.goodEventFilter(r)).length;
  const beforeSLO = baseRequests.length > 0 ? goodBefore / baseRequests.length : 1;

  // Apply chaos
  let impactedRequests: RequestData[];

  switch (experiment.type) {
    case 'error-injection': {
      const chaosErrorRate = (experiment.config.errorRate as number) || 0.1;
      impactedRequests = baseRequests.map(r => {
        if (r.status < 500 && Math.random() < chaosErrorRate) {
          return { ...r, status: 500 };
        }
        return { ...r };
      });
      break;
    }
    case 'latency-injection': {
      const additionalLatency = (experiment.config.additionalLatencyMs as number) || 100;
      impactedRequests = baseRequests.map(r => ({
        ...r,
        durationMs: r.durationMs + additionalLatency,
      }));
      break;
    }
    case 'dependency-failure': {
      const failureRate = (experiment.config.failureRate as number) || 0.2;
      impactedRequests = baseRequests.map(r => {
        if (Math.random() < failureRate) {
          return { ...r, status: 503 };
        }
        return { ...r };
      });
      break;
    }
    default:
      impactedRequests = [...baseRequests];
  }

  // Calculate after SLO
  const goodAfter = impactedRequests.filter(r => sli.goodEventFilter(r)).length;
  const afterSLO = impactedRequests.length > 0 ? goodAfter / impactedRequests.length : 1;

  const impactPercent = beforeSLO > 0 ? ((beforeSLO - afterSLO) / beforeSLO) * 100 : 0;
  const recovered = afterSLO >= sloTarget;

  return {
    experiment,
    beforeSLO,
    afterSLO,
    impactPercent: Math.max(0, impactPercent),
    recovered,
  };
}

// ---------------------------------------------------------------------------
// Exercise 6: Generate postmortem from chaos experiment results
// ---------------------------------------------------------------------------
function generatePostmortem(
  chaosResults: ChaosResult[],
  serviceName: string
): Postmortem {
  const worstImpact = Math.max(...chaosResults.map(r => r.impactPercent));
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // Determine severity based on worst impact
  let severity: Postmortem['severity'];
  if (worstImpact >= 30) severity = 'P1';
  else if (worstImpact >= 15) severity = 'P2';
  else if (worstImpact >= 5) severity = 'P3';
  else severity = 'P4';

  // Build timeline from experiments
  const timeline = chaosResults.map((r, i) => ({
    time: `T+${(i + 1) * 5}m`,
    event: `Chaos experiment "${r.experiment.name}" (${r.experiment.type}): SLO went from ${(r.beforeSLO * 100).toFixed(2)}% to ${(r.afterSLO * 100).toFixed(2)}%`,
  }));
  timeline.unshift({ time: 'T+0m', event: `Chaos testing initiated on ${serviceName}` });
  timeline.push({
    time: `T+${(chaosResults.length + 1) * 5}m`,
    event: 'Chaos experiments concluded, systems under observation',
  });

  // Build action items
  const actionItems: Postmortem['actionItems'] = [];
  for (const result of chaosResults) {
    if (!result.recovered) {
      actionItems.push({
        action: `Improve resilience against ${result.experiment.type} — SLO did not recover after "${result.experiment.name}"`,
        owner: 'SRE Team',
        priority: result.impactPercent >= 20 ? 'high' : 'medium',
      });
    }
  }
  actionItems.push({
    action: 'Add automated chaos testing to CI/CD pipeline',
    owner: 'Platform Team',
    priority: 'medium',
  });
  actionItems.push({
    action: 'Update runbooks with findings from chaos experiments',
    owner: 'On-Call Team',
    priority: 'low',
  });

  // Lessons learned
  const lessonsLearned = [
    `${serviceName} showed ${worstImpact >= 10 ? 'significant' : 'minor'} degradation under fault injection`,
    ...chaosResults
      .filter(r => !r.recovered)
      .map(r => `Service does not gracefully handle ${r.experiment.type} scenarios`),
    'Regular chaos testing helps identify weaknesses before they impact customers',
    'Multi-window burn rate alerts are essential for early detection of SLO breaches',
  ];

  const notRecoveredExperiments = chaosResults.filter(r => !r.recovered);
  const rootCause = notRecoveredExperiments.length > 0
    ? `Service lacks resilience mechanisms for: ${notRecoveredExperiments.map(r => r.experiment.type).join(', ')}. Under ${notRecoveredExperiments[0].experiment.type} conditions, the SLO dropped from ${(notRecoveredExperiments[0].beforeSLO * 100).toFixed(2)}% to ${(notRecoveredExperiments[0].afterSLO * 100).toFixed(2)}%.`
    : 'Service handled all chaos experiments gracefully and maintained SLO targets.';

  return {
    title: `[${severity}] Chaos Test Report — ${serviceName} — ${dateStr}`,
    date: dateStr,
    severity,
    summary: `Chaos testing was performed on ${serviceName} with ${chaosResults.length} experiment(s). Worst impact: ${worstImpact.toFixed(1)}% SLO degradation. ${notRecoveredExperiments.length} experiment(s) resulted in unrecovered SLO breach.`,
    impact: `SLO degradation up to ${worstImpact.toFixed(1)}% observed. ${notRecoveredExperiments.length > 0 ? 'Service did not recover to SLO target in some experiments.' : 'Service recovered in all experiments.'}`,
    timeline,
    rootCause,
    actionItems,
    lessonsLearned,
  };
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
    assert(types.includes('quality'), 'needs quality SLI');
  });

  await test('Ex1 — SLI filters work correctly', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    assert(avail.goodEventFilter({ status: 200, durationMs: 50, timestamp: 0 }), '200 is good');
    assert(!avail.goodEventFilter({ status: 500, durationMs: 50, timestamp: 0 }), '500 is bad');
    const latency = slis.find(s => s.type === 'latency')!;
    assert(latency.goodEventFilter({ status: 200, durationMs: 100, timestamp: 0 }), '100ms is good');
    assert(!latency.goodEventFilter({ status: 200, durationMs: 300, timestamp: 0 }), '300ms is bad');
  });

  await test('Ex1 — SLO targets', () => {
    const slis = defineServiceSLIs();
    const slos = defineServiceSLOs(slis);
    assert(slos.length >= 3, 'should have at least 3 SLO targets');
    for (const slo of slos) {
      assert(slo.target > 0.9 && slo.target < 1, `target ${slo.target} should be between 0.9 and 1`);
      assert(slo.window.length > 0, 'window should be defined');
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
    assertEqual(result.errorBudgetRemainingPercent, 0);
  });

  await test('Ex2 — Error budget remaining is valid percentage', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const requests = simulateRequests(5000, { errorRate: 0.0005 });
    const result = checkSLOCompliance(requests, avail, 0.999);
    assert(result.errorBudgetRemainingPercent >= 0, 'should be >= 0');
    assert(result.errorBudgetRemainingPercent <= 100, 'should be <= 100');
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

  await test('Ex3 — Burn rate alert structure', () => {
    const alerts = defineBurnRateAlerts(0.999);
    for (const alert of alerts) {
      assert(alert.name.length > 0, 'name should exist');
      assertGreaterThan(alert.shortWindowMs, 0);
      assertGreaterThan(alert.longWindowMs, alert.shortWindowMs);
      assertGreaterThan(alert.burnRateThreshold, 0);
    }
  });

  // Ex 4
  await test('Ex4 — Load test results', () => {
    const result = runLoadTest(10_000, 100, 0.01, 10, 200);
    assert(result.totalRequests > 0, 'should have requests');
    assert(result.successRate > 0.95, 'success rate should be > 95%');
    assert(result.p50LatencyMs < result.p99LatencyMs, 'p50 should be < p99');
    assertGreaterThan(result.requestsPerSecond, 0);
  });

  await test('Ex4 — Load test with high error rate', () => {
    const result = runLoadTest(5_000, 50, 0.1, 10, 100);
    assert(result.errorRate > 0.05, 'error rate should be > 5%');
    assert(result.successRate < 0.95, 'success rate should be < 95%');
  });

  await test('Ex4 — Load test latency percentiles are ordered', () => {
    const result = runLoadTest(5_000, 100, 0.01, 10, 500);
    assert(result.p50LatencyMs <= result.p95LatencyMs, 'p50 <= p95');
    assert(result.p95LatencyMs <= result.p99LatencyMs, 'p95 <= p99');
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

  await test('Ex5 — Chaos dependency failure', () => {
    const slis = defineServiceSLIs();
    const avail = slis.find(s => s.type === 'availability')!;
    const baseRequests = simulateRequests(1000, { errorRate: 0.001 });
    const result = runChaosExperiment(
      { name: 'Cache Down', type: 'dependency-failure', config: { failureRate: 0.3 } },
      baseRequests, avail, 0.999
    );
    assertGreaterThan(result.impactPercent, 0);
    assertEqual(result.recovered, false);
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
    assert(pm.rootCause.length > 0, 'should have root cause');
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

  await test('Ex6 — Postmortem with multiple experiments', () => {
    const chaosResults: ChaosResult[] = [
      {
        experiment: { name: 'Error Storm', type: 'error-injection', config: { errorRate: 0.05 } },
        beforeSLO: 0.999, afterSLO: 0.95, impactPercent: 4.9, recovered: false,
      },
      {
        experiment: { name: 'Slow Queries', type: 'latency-injection', config: { additionalLatencyMs: 500 } },
        beforeSLO: 0.99, afterSLO: 0.1, impactPercent: 89.9, recovered: false,
      },
    ];
    const pm = generatePostmortem(chaosResults, 'api-service');
    assertEqual(pm.severity, 'P1'); // worst impact > 30%
    assert(pm.timeline.length >= 4, 'should have timeline entries for each experiment');
    assert(pm.actionItems.length >= 2, 'should have action items for unrecovered experiments');
  });

  await test('Ex6 — Full integration test using test-utils', () => {
    // Use test-utils helpers in an end-to-end scenario
    const requests = simulateRequests(2000, { errorRate: 0.01 });
    const errorRate = calculateErrorRate(requests);
    assert(errorRate < 0.05, 'error rate should be reasonable');

    const durations = requests.map(r => r.durationMs);
    const p99 = calculatePercentile(durations, 99);
    assert(p99 > 0, 'p99 should be > 0');

    const sloResult = assertSLOCompliance(requests, { target: 0.95, type: 'availability' });
    assert(sloResult.actual > 0.9, 'actual availability should be > 90%');

    const series = generateMetricsSeries(5, 1000, (_, i) => i * 10);
    assert(series.length > 0, 'should generate metrics series');
  });

  summary();
}

main();

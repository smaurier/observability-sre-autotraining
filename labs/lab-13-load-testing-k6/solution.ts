// =============================================================================
// Lab 14 — Load Testing k6 (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner, calculatePercentile } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, assertIncludes, summary } = createTestRunner('Lab 14 — Load Testing k6');

// =============================================================================
// Types
// =============================================================================

type ScenarioType = 'ramp-up' | 'steady-state' | 'spike' | 'soak';

interface LoadStage {
  duration: string;
  target: number;
}

interface K6Scenario {
  name: string;
  type: ScenarioType;
  stages: LoadStage[];
  thresholds: ThresholdDefinition[];
}

interface ThresholdDefinition {
  metric: string;
  condition: string;
  abortOnFail: boolean;
}

interface RequestResult {
  timestamp: number;
  durationMs: number;
  status: number;
  vu: number;
  iteration: number;
}

interface ThresholdResult {
  metric: string;
  condition: string;
  value: number;
  passed: boolean;
}

interface LoadTestReport {
  scenario: string;
  totalRequests: number;
  totalDurationMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  errorRate: number;
  requestsPerSecond: number;
  thresholdResults: ThresholdResult[];
  passed: boolean;
}

// =============================================================================
// Exercice 1 — Modéliser des scénarios k6
// =============================================================================

function createScenario(name: string, type: ScenarioType): K6Scenario {
  const defaultThresholds: ThresholdDefinition[] = [
    { metric: 'http_req_duration', condition: 'p(95)<500', abortOnFail: false },
    { metric: 'http_req_failed', condition: 'rate<0.01', abortOnFail: true },
  ];

  let stages: LoadStage[];
  switch (type) {
    case 'ramp-up':
      stages = [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 0 },
      ];
      break;
    case 'steady-state':
      stages = [
        { duration: '1m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '1m', target: 0 },
      ];
      break;
    case 'spike':
      stages = [
        { duration: '1m', target: 10 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 10 },
        { duration: '1m', target: 0 },
      ];
      break;
    case 'soak':
      stages = [
        { duration: '2m', target: 30 },
        { duration: '30m', target: 30 },
        { duration: '2m', target: 0 },
      ];
      break;
  }

  return {
    name,
    type,
    stages,
    thresholds: defaultThresholds,
  };
}

// =============================================================================
// Exercice 2 — Simuler l'exécution d'un test
// =============================================================================

function simulateLoadTest(
  scenario: K6Scenario,
  options: {
    baseLatencyMs?: number;
    latencyVariance?: number;
    errorRate?: number;
    requestsPerVU?: number;
  } = {}
): RequestResult[] {
  const {
    baseLatencyMs = 100,
    latencyVariance = 200,
    errorRate = 0.005,
    requestsPerVU = 10,
  } = options;

  const maxVUs = Math.max(...scenario.stages.map(s => s.target));
  const results: RequestResult[] = [];
  const now = Date.now();

  for (let vu = 0; vu < maxVUs; vu++) {
    for (let iteration = 0; iteration < requestsPerVU; iteration++) {
      results.push({
        timestamp: now + (vu * requestsPerVU + iteration) * 100,
        durationMs: baseLatencyMs + Math.random() * latencyVariance,
        status: Math.random() < errorRate ? 500 : 200,
        vu,
        iteration,
      });
    }
  }

  return results;
}

// =============================================================================
// Exercice 3 — Calculer les thresholds k6
// =============================================================================

function calculateThresholds(
  results: RequestResult[],
  thresholds: ThresholdDefinition[]
): ThresholdResult[] {
  return thresholds.map(threshold => {
    if (threshold.metric === 'http_req_duration' && threshold.condition.startsWith('p(')) {
      const match = threshold.condition.match(/p\((\d+)\)<(\d+)/);
      if (match) {
        const percentile = parseInt(match[1], 10);
        const limit = parseInt(match[2], 10);
        const durations = results.map(r => r.durationMs);
        const value = calculatePercentile(durations, percentile);
        return {
          metric: threshold.metric,
          condition: threshold.condition,
          value,
          passed: value < limit,
        };
      }
    }

    if (threshold.metric === 'http_req_failed' && threshold.condition.startsWith('rate')) {
      const match = threshold.condition.match(/rate<([\d.]+)/);
      if (match) {
        const limit = parseFloat(match[1]);
        const errors = results.filter(r => r.status >= 500).length;
        const value = results.length > 0 ? errors / results.length : 0;
        return {
          metric: threshold.metric,
          condition: threshold.condition,
          value,
          passed: value < limit,
        };
      }
    }

    return {
      metric: threshold.metric,
      condition: threshold.condition,
      value: 0,
      passed: true,
    };
  });
}

// =============================================================================
// Exercice 4 — Pass/fail des thresholds
// =============================================================================

function evaluateThresholds(thresholdResults: ThresholdResult[]): {
  allPassed: boolean;
  failed: ThresholdResult[];
  passed: ThresholdResult[];
} {
  const passed = thresholdResults.filter(t => t.passed);
  const failed = thresholdResults.filter(t => !t.passed);
  return {
    allPassed: failed.length === 0,
    failed,
    passed,
  };
}

// =============================================================================
// Exercice 5 — Rapport de test de charge
// =============================================================================

function generateLoadTestReport(
  scenario: K6Scenario,
  results: RequestResult[]
): LoadTestReport {
  const durations = results.map(r => r.durationMs);
  const timestamps = results.map(r => r.timestamp);
  const totalDurationMs = results.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
  const totalRequests = results.length;

  const avgLatencyMs = durations.reduce((a, b) => a + b, 0) / totalRequests;
  const p50LatencyMs = calculatePercentile(durations, 50);
  const p95LatencyMs = calculatePercentile(durations, 95);
  const p99LatencyMs = calculatePercentile(durations, 99);
  const maxLatencyMs = Math.max(...durations);
  const minLatencyMs = Math.min(...durations);

  const errors = results.filter(r => r.status >= 500).length;
  const errorRate = totalRequests > 0 ? errors / totalRequests : 0;
  const requestsPerSecond = totalDurationMs > 0 ? totalRequests / (totalDurationMs / 1000) : 0;

  const thresholdResults = calculateThresholds(results, scenario.thresholds);
  const allPassed = thresholdResults.every(t => t.passed);

  return {
    scenario: scenario.name,
    totalRequests,
    totalDurationMs,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    maxLatencyMs,
    minLatencyMs,
    errorRate,
    requestsPerSecond,
    thresholdResults,
    passed: allPassed,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n📊 Lab 14 — Load Testing k6\n');

  // --- Exercice 1 ---
  await test('Ex1: créer un scénario ramp-up', () => {
    const scenario = createScenario('api-ramp-up', 'ramp-up');
    assertEqual(scenario.name, 'api-ramp-up');
    assertEqual(scenario.type, 'ramp-up');
    assertEqual(scenario.stages.length, 3);
    assertEqual(scenario.stages[0].target, 10);
    assertEqual(scenario.stages[1].target, 50);
    assertEqual(scenario.stages[2].target, 0);
    assertEqual(scenario.thresholds.length, 2);
  });

  await test('Ex1: créer un scénario spike', () => {
    const scenario = createScenario('api-spike', 'spike');
    assertEqual(scenario.type, 'spike');
    assertEqual(scenario.stages.length, 4);
    const maxTarget = Math.max(...scenario.stages.map(s => s.target));
    assertEqual(maxTarget, 200);
  });

  // --- Exercice 2 ---
  await test('Ex2: simuler un test de charge', () => {
    const scenario = createScenario('test', 'steady-state');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 50,
      latencyVariance: 100,
      errorRate: 0.02,
      requestsPerVU: 5,
    });
    assertGreaterThan(results.length, 0);
    assert(results[0].timestamp > 0, 'timestamp should be positive');
    assert(results[0].durationMs > 0, 'durationMs should be positive');
    assert(results[0].status === 200 || results[0].status === 500, 'status should be 200 or 500');
  });

  // --- Exercice 3 ---
  await test('Ex3: calculer le p95 latency', () => {
    const scenario = createScenario('test', 'steady-state');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 100,
      latencyVariance: 200,
      errorRate: 0.005,
      requestsPerVU: 20,
    });
    const thresholdResults = calculateThresholds(results, scenario.thresholds);
    assertEqual(thresholdResults.length, 2);

    const latencyThreshold = thresholdResults.find(t => t.metric === 'http_req_duration');
    assert(latencyThreshold !== undefined, 'Should have latency threshold');
    assertGreaterThan(latencyThreshold!.value, 0);
  });

  await test('Ex3: calculer le error rate', () => {
    const results: RequestResult[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() + i * 100,
      durationMs: 100 + Math.random() * 100,
      status: i < 5 ? 500 : 200,
      vu: 0,
      iteration: i,
    }));
    const thresholdResults = calculateThresholds(results, [
      { metric: 'http_req_failed', condition: 'rate<0.01', abortOnFail: false },
    ]);
    assertEqual(thresholdResults.length, 1);
    assert(Math.abs(thresholdResults[0].value - 0.05) < 0.01, `Expected ~0.05, got ${thresholdResults[0].value}`);
    assert(!thresholdResults[0].passed, 'Should fail with 5% error rate vs 1% threshold');
  });

  // --- Exercice 4 ---
  await test('Ex4: évaluer les thresholds — tous passent', () => {
    const thresholdResults: ThresholdResult[] = [
      { metric: 'http_req_duration', condition: 'p(95)<500', value: 350, passed: true },
      { metric: 'http_req_failed', condition: 'rate<0.01', value: 0.005, passed: true },
    ];
    const evaluation = evaluateThresholds(thresholdResults);
    assert(evaluation.allPassed, 'All should pass');
    assertEqual(evaluation.passed.length, 2);
    assertEqual(evaluation.failed.length, 0);
  });

  await test('Ex4: évaluer les thresholds — un échoue', () => {
    const thresholdResults: ThresholdResult[] = [
      { metric: 'http_req_duration', condition: 'p(95)<500', value: 650, passed: false },
      { metric: 'http_req_failed', condition: 'rate<0.01', value: 0.005, passed: true },
    ];
    const evaluation = evaluateThresholds(thresholdResults);
    assert(!evaluation.allPassed, 'Should not all pass');
    assertEqual(evaluation.failed.length, 1);
    assertEqual(evaluation.failed[0].metric, 'http_req_duration');
  });

  // --- Exercice 5 ---
  await test('Ex5: générer un rapport de test', () => {
    const scenario = createScenario('api-test', 'ramp-up');
    const results = simulateLoadTest(scenario, {
      baseLatencyMs: 50,
      latencyVariance: 150,
      errorRate: 0.005,
      requestsPerVU: 10,
    });
    const report = generateLoadTestReport(scenario, results);
    assertEqual(report.scenario, 'api-test');
    assertGreaterThan(report.totalRequests, 0);
    assertGreaterThan(report.avgLatencyMs, 0);
    assertGreaterThan(report.p95LatencyMs, report.p50LatencyMs);
    assert(report.errorRate >= 0 && report.errorRate <= 1, 'Error rate should be between 0 and 1');
    assertGreaterThan(report.requestsPerSecond, 0);
    assertEqual(report.thresholdResults.length, 2);
  });

  summary();
}

main();

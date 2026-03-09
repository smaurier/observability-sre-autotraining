// =============================================================================
// Lab 06 — Calculer RED & USE (SOLUTION)
// =============================================================================
// Ce fichier contient les solutions completes de tous les exercices.
// =============================================================================

import {
  createTestRunner,
  simulateRequests,
  calculateErrorRate,
  calculatePercentile,
} from '../test-utils.ts';
const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 06 — Calculer RED & USE');

// =============================================================================
// Exercice 1 : Request Rate
// =============================================================================

function calculateRequestRate(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const sorted = [...timestamps].sort((a, b) => a - b);
  const durationSec = (sorted[sorted.length - 1] - sorted[0]) / 1000;
  if (durationSec === 0) return 0;
  return timestamps.length / durationSec;
}

// =============================================================================
// Exercice 2 : Error Rate
// =============================================================================

function computeErrorRate(requests: Array<{ status: number }>): number {
  if (requests.length === 0) return 0;
  const errors = requests.filter((r) => r.status >= 500).length;
  return errors / requests.length;
}

// =============================================================================
// Exercice 3 : Duration Percentiles
// =============================================================================

interface DurationPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

function computeDurationPercentiles(durations: number[]): DurationPercentiles {
  if (durations.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  }
  const sum = durations.reduce((s, d) => s + d, 0);
  return {
    p50: calculatePercentile(durations, 50),
    p95: calculatePercentile(durations, 95),
    p99: calculatePercentile(durations, 99),
    avg: sum / durations.length,
    max: Math.max(...durations),
  };
}

// =============================================================================
// Exercice 4 : Utilization
// =============================================================================

function calculateUtilization(
  samples: Array<{ timestamp: number; usagePercent: number }>
): number {
  if (samples.length === 0) return 0;
  const sum = samples.reduce((s, sample) => s + sample.usagePercent, 0);
  return sum / samples.length;
}

// =============================================================================
// Exercice 5 : Saturation
// =============================================================================

interface SaturationMetrics {
  avgQueueDepth: number;
  maxQueueDepth: number;
  percentTimeOverCapacity: number;
}

function calculateSaturation(
  samples: Array<{ timestamp: number; queueDepth: number }>,
  capacity: number
): SaturationMetrics {
  if (samples.length === 0) {
    return { avgQueueDepth: 0, maxQueueDepth: 0, percentTimeOverCapacity: 0 };
  }

  const sum = samples.reduce((s, sample) => s + sample.queueDepth, 0);
  const overCapacity = samples.filter((s) => s.queueDepth > capacity).length;

  return {
    avgQueueDepth: sum / samples.length,
    maxQueueDepth: Math.max(...samples.map((s) => s.queueDepth)),
    percentTimeOverCapacity: (overCapacity / samples.length) * 100,
  };
}

// =============================================================================
// Exercice 6 : Dashboard RED + USE
// =============================================================================

interface REDMetrics {
  requestRate: number;
  errorRate: number;
  duration: DurationPercentiles;
}

interface USEMetrics {
  utilization: number;
  saturation: SaturationMetrics;
  errors: number;
}

interface Dashboard {
  red: REDMetrics;
  use: USEMetrics;
  timestamp: string;
}

function buildDashboard(
  requests: Array<{ status: number; durationMs: number; timestamp: number }>,
  resourceSamples: Array<{ timestamp: number; usagePercent: number }>,
  queueSamples: Array<{ timestamp: number; queueDepth: number }>,
  queueCapacity: number
): Dashboard {
  const timestamps = requests.map((r) => r.timestamp);
  const durations = requests.map((r) => r.durationMs);
  const errorCount = requests.filter((r) => r.status >= 500).length;

  return {
    red: {
      requestRate: calculateRequestRate(timestamps),
      errorRate: computeErrorRate(requests),
      duration: computeDurationPercentiles(durations),
    },
    use: {
      utilization: calculateUtilization(resourceSamples),
      saturation: calculateSaturation(queueSamples, queueCapacity),
      errors: errorCount,
    },
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 06 — Calculer RED & USE\n');

  // --- Exercice 1 ---
  await test('Ex1 — calculateRequestRate basique', () => {
    const timestamps = Array.from({ length: 10 }, (_, i) => 1000 + i * 100);
    const rate = calculateRequestRate(timestamps);
    assertGreaterThan(rate, 10);
    assertLessThan(rate, 12);
  });

  await test('Ex1 — calculateRequestRate avec peu de donnees', () => {
    assertEqual(calculateRequestRate([]), 0);
    assertEqual(calculateRequestRate([1000]), 0);
  });

  // --- Exercice 2 ---
  await test('Ex2 — computeErrorRate basique', () => {
    const requests = [
      { status: 200 },
      { status: 200 },
      { status: 500 },
      { status: 200 },
      { status: 503 },
    ];
    const rate = computeErrorRate(requests);
    assertEqual(rate, 0.4);
  });

  await test('Ex2 — computeErrorRate sans erreurs', () => {
    const requests = [{ status: 200 }, { status: 201 }, { status: 304 }];
    assertEqual(computeErrorRate(requests), 0);
  });

  // --- Exercice 3 ---
  await test('Ex3 — computeDurationPercentiles', () => {
    const durations = [
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
      110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
    ];
    const result = computeDurationPercentiles(durations);
    assertGreaterThan(result.p50, 90);
    assertLessThan(result.p50, 120);
    assertGreaterThan(result.p95, result.p50);
    assertGreaterThan(result.p99, result.p95);
    assertEqual(result.max, 200);
    assertEqual(result.avg, 105);
  });

  // --- Exercice 4 ---
  await test('Ex4 — calculateUtilization', () => {
    const samples = [
      { timestamp: 1000, usagePercent: 40 },
      { timestamp: 2000, usagePercent: 60 },
      { timestamp: 3000, usagePercent: 80 },
      { timestamp: 4000, usagePercent: 20 },
    ];
    assertEqual(calculateUtilization(samples), 50);
  });

  // --- Exercice 5 ---
  await test('Ex5 — calculateSaturation', () => {
    const samples = [
      { timestamp: 1000, queueDepth: 5 },
      { timestamp: 2000, queueDepth: 10 },
      { timestamp: 3000, queueDepth: 15 },
      { timestamp: 4000, queueDepth: 8 },
    ];
    const result = calculateSaturation(samples, 10);
    assertEqual(result.maxQueueDepth, 15);
    assertEqual(result.avgQueueDepth, 9.5);
    assertEqual(result.percentTimeOverCapacity, 25);
  });

  // --- Exercice 6 ---
  await test('Ex6 — buildDashboard combine RED + USE', () => {
    const requests = simulateRequests(100, { errorRate: 0.05, minLatencyMs: 10, maxLatencyMs: 200 });
    const resourceSamples = [
      { timestamp: 1000, usagePercent: 50 },
      { timestamp: 2000, usagePercent: 60 },
      { timestamp: 3000, usagePercent: 70 },
    ];
    const queueSamples = [
      { timestamp: 1000, queueDepth: 3 },
      { timestamp: 2000, queueDepth: 7 },
      { timestamp: 3000, queueDepth: 12 },
    ];

    const dashboard = buildDashboard(requests, resourceSamples, queueSamples, 10);

    assert(dashboard.red !== undefined, 'red doit etre present');
    assert(dashboard.use !== undefined, 'use doit etre present');
    assertGreaterThan(dashboard.red.requestRate, 0);
    assert(dashboard.red.errorRate >= 0, 'errorRate doit etre >= 0');
    assertGreaterThan(dashboard.red.duration.p50, 0);
    assertGreaterThan(dashboard.use.utilization, 0);
    assert(typeof dashboard.timestamp === 'string', 'timestamp doit etre une string');
  });

  summary();
}

main();

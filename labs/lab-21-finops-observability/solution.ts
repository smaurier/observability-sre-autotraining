// =============================================================================
// Lab 22 — FinOps : Cout de l'Observabilite (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 22 — FinOps Observabilite');

// =============================================================================
// Types
// =============================================================================

interface LabelDefinition {
  name: string;
  distinctValues: number;
}

interface CardinalityReport {
  totalSeries: number;
  labelContributions: Array<{
    labelName: string;
    distinctValues: number;
    contributionFactor: number;
  }>;
  topContributor: string;
}

interface MetricDefinition {
  name: string;
  labels: Record<string, string[]>;
  lastScrapedMinutesAgo: number;
  queryCountLast30d: number;
}

interface MetricAuditResult {
  totalMetrics: number;
  totalSeries: number;
  unusedMetrics: MetricDefinition[];
  highCardinalityMetrics: MetricDefinition[];
  staleMetrics: MetricDefinition[];
  estimatedMonthlyCostUSD: number;
}

interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  pattern: string;
  message: string;
  sizeBytes: number;
}

interface SamplingConfig {
  defaultRate: number;
  errorRate: number;
  debugRate: number;
  warnRate: number;
  patternRateLimits: Map<string, number>;
}

interface SamplingResult {
  inputCount: number;
  outputCount: number;
  reductionPercent: number;
  keptByLevel: Record<string, number>;
  droppedByLevel: Record<string, number>;
}

interface CostSavingsReport {
  currentMonthlyCostUSD: number;
  projectedMonthlyCostUSD: number;
  savingsUSD: number;
  savingsPercent: number;
  details: {
    logsSavingsUSD: number;
    tracesSavingsUSD: number;
    metricsSavingsUSD: number;
  };
}

interface ObservabilityStackConfig {
  metrics: {
    activeSeries: number;
    scrapeIntervalSeconds: number;
    retentionDays: number;
  };
  logs: {
    dailyVolumeGB: number;
    retentionDays: number;
  };
  traces: {
    dailySpans: number;
    retentionDays: number;
    samplingRate: number;
  };
}

interface ObservabilityStackCost {
  totalMonthlyCostUSD: number;
  breakdown: {
    metricsIngestionUSD: number;
    metricsStorageUSD: number;
    logsIngestionUSD: number;
    logsStorageUSD: number;
    tracesIngestionUSD: number;
    tracesStorageUSD: number;
  };
}

// =============================================================================
// Exercice 1 — Calcul de l'explosion de cardinalite
// =============================================================================

function calculateCardinality(
  metricName: string,
  labels: LabelDefinition[]
): CardinalityReport {
  if (labels.length === 0) {
    return {
      totalSeries: 1,
      labelContributions: [],
      topContributor: '',
    };
  }

  const totalSeries = labels.reduce((product, label) => product * label.distinctValues, 1);

  const labelContributions = labels.map(label => ({
    labelName: label.name,
    distinctValues: label.distinctValues,
    contributionFactor: totalSeries / label.distinctValues,
  }));

  const topContributor = labels.reduce(
    (top, label) => label.distinctValues > top.distinctValues ? label : top,
    labels[0]
  ).name;

  return {
    totalSeries,
    labelContributions,
    topContributor,
  };
}

// =============================================================================
// Exercice 2 — Audit de metriques
// =============================================================================

function auditMetrics(
  metrics: MetricDefinition[],
  options?: {
    highCardinalityThreshold?: number;
    stalenessMinutes?: number;
    costPerThousandSeries?: number;
  }
): MetricAuditResult {
  const highCardinalityThreshold = options?.highCardinalityThreshold ?? 1000;
  const stalenessMinutes = options?.stalenessMinutes ?? 60;
  const costPerThousandSeries = options?.costPerThousandSeries ?? 0.10;

  function getSeriesCount(metric: MetricDefinition): number {
    const labelArrays = Object.values(metric.labels);
    if (labelArrays.length === 0) return 1;
    return labelArrays.reduce((product, values) => product * values.length, 1);
  }

  let totalSeries = 0;
  const unusedMetrics: MetricDefinition[] = [];
  const highCardinalityMetrics: MetricDefinition[] = [];
  const staleMetrics: MetricDefinition[] = [];

  for (const metric of metrics) {
    const seriesCount = getSeriesCount(metric);
    totalSeries += seriesCount;

    if (metric.queryCountLast30d === 0) {
      unusedMetrics.push(metric);
    }

    if (seriesCount > highCardinalityThreshold) {
      highCardinalityMetrics.push(metric);
    }

    if (metric.lastScrapedMinutesAgo > stalenessMinutes) {
      staleMetrics.push(metric);
    }
  }

  const estimatedMonthlyCostUSD = (totalSeries / 1000) * costPerThousandSeries;

  return {
    totalMetrics: metrics.length,
    totalSeries,
    unusedMetrics,
    highCardinalityMetrics,
    staleMetrics,
    estimatedMonthlyCostUSD,
  };
}

// =============================================================================
// Exercice 3 — Strategie de sampling des logs
// =============================================================================

function applyLogSampling(
  logs: LogEntry[],
  config: SamplingConfig
): { sampled: LogEntry[]; result: SamplingResult } {
  const sampled: LogEntry[] = [];
  const keptByLevel: Record<string, number> = {};
  const droppedByLevel: Record<string, number> = {};

  // Compteur de logs gardes par pattern (pour le rate limiting)
  const patternCounters: Map<string, Array<{ timestamp: number }>> = new Map();

  for (const log of logs) {
    // Determiner le taux de sampling
    let rate: number;
    switch (log.level) {
      case 'error': rate = config.errorRate; break;
      case 'warn': rate = config.warnRate; break;
      case 'debug': rate = config.debugRate; break;
      default: rate = config.defaultRate;
    }

    // Verifier le rate limit par pattern
    let rateLimited = false;
    const patternLimit = config.patternRateLimits.get(log.pattern);
    if (patternLimit !== undefined && log.level !== 'error') {
      if (!patternCounters.has(log.pattern)) {
        patternCounters.set(log.pattern, []);
      }
      const counter = patternCounters.get(log.pattern)!;
      // Compter les logs gardes dans la derniere minute
      const recentCount = counter.filter(
        entry => entry.timestamp >= log.timestamp - 60000
      ).length;
      if (recentCount >= patternLimit) {
        rateLimited = true;
      }
    }

    // Appliquer le sampling
    const kept = !rateLimited && Math.random() < rate;

    if (kept) {
      sampled.push(log);
      keptByLevel[log.level] = (keptByLevel[log.level] || 0) + 1;

      // Enregistrer pour le rate limiting
      if (patternLimit !== undefined) {
        if (!patternCounters.has(log.pattern)) {
          patternCounters.set(log.pattern, []);
        }
        patternCounters.get(log.pattern)!.push({ timestamp: log.timestamp });
      }
    } else {
      droppedByLevel[log.level] = (droppedByLevel[log.level] || 0) + 1;
    }
  }

  const inputCount = logs.length;
  const outputCount = sampled.length;
  const reductionPercent = inputCount > 0 ? ((inputCount - outputCount) / inputCount) * 100 : 0;

  return {
    sampled,
    result: {
      inputCount,
      outputCount,
      reductionPercent,
      keptByLevel,
      droppedByLevel,
    },
  };
}

// =============================================================================
// Exercice 4 — Calcul d'economies de sampling
// =============================================================================

function calculateCostSavings(
  currentConfig: ObservabilityStackConfig,
  newSamplingRates: {
    logSamplingRate: number;
    traceSamplingRate: number;
    metricsReduction: number;
  }
): CostSavingsReport {
  const currentCost = calculateStackCost(currentConfig);

  const newConfig: ObservabilityStackConfig = {
    metrics: {
      ...currentConfig.metrics,
      activeSeries: currentConfig.metrics.activeSeries * (1 - newSamplingRates.metricsReduction),
    },
    logs: {
      ...currentConfig.logs,
      dailyVolumeGB: currentConfig.logs.dailyVolumeGB * newSamplingRates.logSamplingRate,
    },
    traces: {
      ...currentConfig.traces,
      samplingRate: newSamplingRates.traceSamplingRate,
    },
  };

  const newCost = calculateStackCost(newConfig);

  const savingsUSD = currentCost.totalMonthlyCostUSD - newCost.totalMonthlyCostUSD;
  const savingsPercent = currentCost.totalMonthlyCostUSD > 0
    ? (savingsUSD / currentCost.totalMonthlyCostUSD) * 100
    : 0;

  return {
    currentMonthlyCostUSD: currentCost.totalMonthlyCostUSD,
    projectedMonthlyCostUSD: newCost.totalMonthlyCostUSD,
    savingsUSD,
    savingsPercent,
    details: {
      logsSavingsUSD:
        (currentCost.breakdown.logsIngestionUSD + currentCost.breakdown.logsStorageUSD)
        - (newCost.breakdown.logsIngestionUSD + newCost.breakdown.logsStorageUSD),
      tracesSavingsUSD:
        (currentCost.breakdown.tracesIngestionUSD + currentCost.breakdown.tracesStorageUSD)
        - (newCost.breakdown.tracesIngestionUSD + newCost.breakdown.tracesStorageUSD),
      metricsSavingsUSD:
        (currentCost.breakdown.metricsIngestionUSD + currentCost.breakdown.metricsStorageUSD)
        - (newCost.breakdown.metricsIngestionUSD + newCost.breakdown.metricsStorageUSD),
    },
  };
}

// =============================================================================
// Exercice 5 — Calculateur de cout de la stack d'observabilite
// =============================================================================

function calculateStackCost(config: ObservabilityStackConfig): ObservabilityStackCost {
  // Metriques
  const metricsIngestionUSD = (config.metrics.activeSeries / 1000) * 0.10;
  const metricsStorageUSD = (config.metrics.activeSeries / 1000) * config.metrics.retentionDays * 0.01;

  // Logs
  const logsIngestionUSD = config.logs.dailyVolumeGB * 30 * 0.50;
  const logsStorageUSD = config.logs.dailyVolumeGB * config.logs.retentionDays * 0.03;

  // Traces
  const spansIngested = config.traces.dailySpans * config.traces.samplingRate;
  const tracesIngestionUSD = (spansIngested * 30 / 1_000_000) * 0.30;
  const tracesStorageUSD = (spansIngested * config.traces.retentionDays / 1_000_000) * 0.02;

  const totalMonthlyCostUSD =
    metricsIngestionUSD + metricsStorageUSD
    + logsIngestionUSD + logsStorageUSD
    + tracesIngestionUSD + tracesStorageUSD;

  return {
    totalMonthlyCostUSD,
    breakdown: {
      metricsIngestionUSD,
      metricsStorageUSD,
      logsIngestionUSD,
      logsStorageUSD,
      tracesIngestionUSD,
      tracesStorageUSD,
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n💰 Lab 22 — FinOps Observabilite\n');

  // --- Exercice 1 ---
  await test('Ex1: calcul de cardinalite simple', () => {
    const report = calculateCardinality('http_requests_total', [
      { name: 'endpoint', distinctValues: 10 },
      { name: 'pod', distinctValues: 50 },
      { name: 'status', distinctValues: 5 },
      { name: 'method', distinctValues: 4 },
    ]);
    assertEqual(report.totalSeries, 10000);
    assertEqual(report.topContributor, 'pod');
  });

  await test('Ex1: cardinalite sans labels', () => {
    const report = calculateCardinality('up', []);
    assertEqual(report.totalSeries, 1);
  });

  await test('Ex1: contribution factors corrects', () => {
    const report = calculateCardinality('test_metric', [
      { name: 'a', distinctValues: 2 },
      { name: 'b', distinctValues: 3 },
    ]);
    assertEqual(report.totalSeries, 6);
    const labelA = report.labelContributions.find(l => l.labelName === 'a');
    assertEqual(labelA!.contributionFactor, 3);
    const labelB = report.labelContributions.find(l => l.labelName === 'b');
    assertEqual(labelB!.contributionFactor, 2);
  });

  // --- Exercice 2 ---
  await test('Ex2: audit identifie les metriques inutilisees', () => {
    const metrics: MetricDefinition[] = [
      { name: 'used_metric', labels: { status: ['200', '500'] }, lastScrapedMinutesAgo: 1, queryCountLast30d: 100 },
      { name: 'unused_metric', labels: { status: ['200'] }, lastScrapedMinutesAgo: 5, queryCountLast30d: 0 },
    ];
    const result = auditMetrics(metrics);
    assertEqual(result.unusedMetrics.length, 1);
    assertEqual(result.unusedMetrics[0].name, 'unused_metric');
  });

  await test('Ex2: audit identifie les metriques haute cardinalite', () => {
    const metrics: MetricDefinition[] = [
      {
        name: 'high_card_metric',
        labels: {
          endpoint: Array.from({ length: 100 }, (_, i) => `/api/v${i}`),
          pod: Array.from({ length: 50 }, (_, i) => `pod-${i}`),
        },
        lastScrapedMinutesAgo: 1,
        queryCountLast30d: 10,
      },
      {
        name: 'low_card_metric',
        labels: { status: ['200', '500'] },
        lastScrapedMinutesAgo: 1,
        queryCountLast30d: 50,
      },
    ];
    const result = auditMetrics(metrics);
    assertEqual(result.highCardinalityMetrics.length, 1);
    assertEqual(result.highCardinalityMetrics[0].name, 'high_card_metric');
  });

  await test('Ex2: audit identifie les metriques stale', () => {
    const metrics: MetricDefinition[] = [
      { name: 'fresh_metric', labels: {}, lastScrapedMinutesAgo: 5, queryCountLast30d: 10 },
      { name: 'stale_metric', labels: {}, lastScrapedMinutesAgo: 120, queryCountLast30d: 10 },
    ];
    const result = auditMetrics(metrics);
    assertEqual(result.staleMetrics.length, 1);
    assertEqual(result.staleMetrics[0].name, 'stale_metric');
  });

  await test('Ex2: audit calcule le cout estime', () => {
    const metrics: MetricDefinition[] = [
      {
        name: 'metric_a',
        labels: { status: ['200', '500'], method: ['GET', 'POST'] },
        lastScrapedMinutesAgo: 1,
        queryCountLast30d: 10,
      },
    ];
    const result = auditMetrics(metrics);
    assertEqual(result.totalSeries, 4);
    assertGreaterThan(result.estimatedMonthlyCostUSD, 0);
  });

  // --- Exercice 3 ---
  await test('Ex3: sampling preserve toutes les erreurs', () => {
    const logs: LogEntry[] = [];
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      logs.push({
        timestamp: now + i * 100,
        level: i < 10 ? 'error' : 'info',
        pattern: 'test-pattern',
        message: `Message ${i}`,
        sizeBytes: 200,
      });
    }
    const config: SamplingConfig = {
      defaultRate: 0.1,
      errorRate: 1.0,
      debugRate: 0.01,
      warnRate: 0.5,
      patternRateLimits: new Map(),
    };
    const { result } = applyLogSampling(logs, config);
    assertEqual(result.keptByLevel['error'], 10);
    assertLessThan(result.keptByLevel['info'] || 0, 90);
    assertGreaterThan(result.reductionPercent, 0);
  });

  await test('Ex3: sampling applique le rate limit par pattern', () => {
    const logs: LogEntry[] = [];
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      logs.push({
        timestamp: now + i * 100,
        level: 'info',
        pattern: 'GET /api/health 200',
        message: `Health check ${i}`,
        sizeBytes: 100,
      });
    }
    const config: SamplingConfig = {
      defaultRate: 1.0,
      errorRate: 1.0,
      debugRate: 0.01,
      warnRate: 0.5,
      patternRateLimits: new Map([['GET /api/health 200', 10]]),
    };
    const { result } = applyLogSampling(logs, config);
    assertLessThan(result.outputCount, 50);
  });

  // --- Exercice 4 ---
  await test('Ex4: calcul des economies de sampling', () => {
    const currentConfig: ObservabilityStackConfig = {
      metrics: { activeSeries: 100000, scrapeIntervalSeconds: 15, retentionDays: 30 },
      logs: { dailyVolumeGB: 50, retentionDays: 30 },
      traces: { dailySpans: 10000000, retentionDays: 14, samplingRate: 1.0 },
    };
    const report = calculateCostSavings(currentConfig, {
      logSamplingRate: 0.3,
      traceSamplingRate: 0.1,
      metricsReduction: 0.4,
    });
    assertGreaterThan(report.savingsUSD, 0);
    assertGreaterThan(report.savingsPercent, 0);
    assertGreaterThan(report.details.logsSavingsUSD, 0);
    assertGreaterThan(report.details.tracesSavingsUSD, 0);
    assertGreaterThan(report.details.metricsSavingsUSD, 0);
    assertEqual(report.currentMonthlyCostUSD > report.projectedMonthlyCostUSD, true);
  });

  await test('Ex4: pas d\'economie si memes taux', () => {
    const currentConfig: ObservabilityStackConfig = {
      metrics: { activeSeries: 10000, scrapeIntervalSeconds: 15, retentionDays: 15 },
      logs: { dailyVolumeGB: 10, retentionDays: 7 },
      traces: { dailySpans: 1000000, retentionDays: 7, samplingRate: 0.5 },
    };
    const report = calculateCostSavings(currentConfig, {
      logSamplingRate: 1.0,
      traceSamplingRate: 0.5,
      metricsReduction: 0.0,
    });
    assertEqual(report.savingsUSD, 0);
    assertEqual(report.savingsPercent, 0);
  });

  // --- Exercice 5 ---
  await test('Ex5: calcul du cout de la stack', () => {
    const config: ObservabilityStackConfig = {
      metrics: { activeSeries: 100000, scrapeIntervalSeconds: 15, retentionDays: 30 },
      logs: { dailyVolumeGB: 50, retentionDays: 30 },
      traces: { dailySpans: 10000000, retentionDays: 14, samplingRate: 1.0 },
    };
    const cost = calculateStackCost(config);
    assertGreaterThan(cost.totalMonthlyCostUSD, 0);
    assertGreaterThan(cost.breakdown.metricsIngestionUSD, 0);
    assertGreaterThan(cost.breakdown.metricsStorageUSD, 0);
    assertGreaterThan(cost.breakdown.logsIngestionUSD, 0);
    assertGreaterThan(cost.breakdown.logsStorageUSD, 0);
    assertGreaterThan(cost.breakdown.tracesIngestionUSD, 0);
    assertGreaterThan(cost.breakdown.tracesStorageUSD, 0);

    const sumBreakdown = cost.breakdown.metricsIngestionUSD
      + cost.breakdown.metricsStorageUSD
      + cost.breakdown.logsIngestionUSD
      + cost.breakdown.logsStorageUSD
      + cost.breakdown.tracesIngestionUSD
      + cost.breakdown.tracesStorageUSD;
    assert(
      Math.abs(cost.totalMonthlyCostUSD - sumBreakdown) < 0.01,
      `Total ${cost.totalMonthlyCostUSD} devrait egal a la somme ${sumBreakdown}`
    );
  });

  await test('Ex5: cout augmente avec le volume', () => {
    const small = calculateStackCost({
      metrics: { activeSeries: 1000, scrapeIntervalSeconds: 15, retentionDays: 7 },
      logs: { dailyVolumeGB: 1, retentionDays: 7 },
      traces: { dailySpans: 100000, retentionDays: 7, samplingRate: 0.1 },
    });
    const large = calculateStackCost({
      metrics: { activeSeries: 1000000, scrapeIntervalSeconds: 15, retentionDays: 90 },
      logs: { dailyVolumeGB: 500, retentionDays: 90 },
      traces: { dailySpans: 100000000, retentionDays: 30, samplingRate: 1.0 },
    });
    assertGreaterThan(large.totalMonthlyCostUSD, small.totalMonthlyCostUSD);
  });

  summary();
}

main();

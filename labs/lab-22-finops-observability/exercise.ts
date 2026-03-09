// =============================================================================
// Lab 22 — FinOps : Cout de l'Observabilite (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 22 — FinOps Observabilite');

// =============================================================================
// Types
// =============================================================================

interface LabelDefinition {
  name: string;
  distinctValues: number; // Nombre de valeurs distinctes pour ce label
}

interface CardinalityReport {
  totalSeries: number;
  labelContributions: Array<{
    labelName: string;
    distinctValues: number;
    contributionFactor: number; // Facteur multiplicatif de ce label
  }>;
  topContributor: string; // Label qui contribue le plus
}

interface MetricDefinition {
  name: string;
  labels: Record<string, string[]>; // label -> valeurs possibles
  lastScrapedMinutesAgo: number;    // Derniere fois que la metrique a ete scrapee
  queryCountLast30d: number;        // Nombre de requetes sur cette metrique les 30 derniers jours
}

interface MetricAuditResult {
  totalMetrics: number;
  totalSeries: number;
  unusedMetrics: MetricDefinition[];      // Jamais interrogees (queryCount === 0)
  highCardinalityMetrics: MetricDefinition[]; // Plus de `threshold` series
  staleMetrics: MetricDefinition[];       // Pas scrapees depuis > 60 min
  estimatedMonthlyCostUSD: number;        // Cout estime a $0.10 par 1000 series actives
}

interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  pattern: string;   // Pattern/template du message (ex: 'GET /api/users 200')
  message: string;
  sizeBytes: number;
}

interface SamplingConfig {
  defaultRate: number;        // Taux par defaut (0.0-1.0) pour les logs info
  errorRate: number;          // Taux pour les erreurs (typiquement 1.0 = tout garder)
  debugRate: number;          // Taux pour le debug (typiquement bas)
  warnRate: number;           // Taux pour les warnings
  patternRateLimits: Map<string, number>; // Pattern -> max logs/minute
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
    samplingRate: number; // 0.0-1.0
  };
}

interface ObservabilityStackCost {
  totalMonthlyCostUSD: number;
  breakdown: {
    metricsIngestionUSD: number;     // $0.10 par 1000 series actives
    metricsStorageUSD: number;       // $0.01 par 1000 series par jour de retention
    logsIngestionUSD: number;        // $0.50 par GB ingere
    logsStorageUSD: number;          // $0.03 par GB par jour de retention
    tracesIngestionUSD: number;      // $0.30 par million de spans
    tracesStorageUSD: number;        // $0.02 par million de spans par jour de retention
  };
}

// =============================================================================
// Exercice 1 — Calcul de l'explosion de cardinalite
// =============================================================================

function calculateCardinality(
  metricName: string,
  labels: LabelDefinition[]
): CardinalityReport {
  // TODO: Calculer la cardinalite totale d'une metrique
  //
  // La cardinalite totale = produit du nombre de valeurs distinctes de chaque label
  // Exemple : 10 endpoints x 50 pods x 5 status x 4 methods = 10000 series
  //
  // Pour chaque label, calculer le contributionFactor :
  //   contributionFactor = totalSeries / distinctValues
  //   (combien de series sont generees par chaque valeur de ce label)
  //
  // topContributor = le label avec le plus grand nombre de distinctValues
  //
  // Si labels est vide, totalSeries = 1 (la metrique seule, sans labels)

  throw new Error('TODO: Implement calculateCardinality');
}

// =============================================================================
// Exercice 2 — Audit de metriques
// =============================================================================

function auditMetrics(
  metrics: MetricDefinition[],
  options?: {
    highCardinalityThreshold?: number;  // Defaut: 1000
    stalenessMinutes?: number;          // Defaut: 60
    costPerThousandSeries?: number;     // Defaut: 0.10 USD
  }
): MetricAuditResult {
  // TODO: Auditer les metriques pour identifier les problemes
  //
  // Pour chaque metrique :
  // 1. Calculer le nombre de series = produit des longueurs de chaque tableau de valeurs dans labels
  //    (si pas de labels, 1 serie)
  //
  // 2. unusedMetrics: metriques avec queryCountLast30d === 0
  //
  // 3. highCardinalityMetrics: metriques avec nombre de series > highCardinalityThreshold
  //
  // 4. staleMetrics: metriques avec lastScrapedMinutesAgo > stalenessMinutes
  //
  // 5. totalSeries: somme des series de toutes les metriques
  //
  // 6. estimatedMonthlyCostUSD: (totalSeries / 1000) * costPerThousandSeries

  throw new Error('TODO: Implement auditMetrics');
}

// =============================================================================
// Exercice 3 — Strategie de sampling des logs
// =============================================================================

function applyLogSampling(
  logs: LogEntry[],
  config: SamplingConfig
): { sampled: LogEntry[]; result: SamplingResult } {
  // TODO: Appliquer une strategie de sampling aux logs
  //
  // Pour chaque log :
  // 1. Determiner le taux de sampling base sur le level :
  //    - 'error' → config.errorRate
  //    - 'warn'  → config.warnRate
  //    - 'debug' → config.debugRate
  //    - 'info'  → config.defaultRate
  //
  // 2. Verifier le rate limit par pattern :
  //    - Si le pattern a un rate limit dans config.patternRateLimits,
  //      compter les logs deja gardes pour ce pattern dans la derniere minute
  //      (timestamp >= log.timestamp - 60000)
  //    - Si le compteur depasse la limite, ne pas garder le log
  //      (sauf si c'est une erreur — les erreurs passent toujours)
  //
  // 3. Appliquer le sampling : Math.random() < rate → garder le log
  //    (les erreurs avec errorRate=1.0 sont toujours gardees)
  //
  // 4. Calculer SamplingResult :
  //    - reductionPercent = ((inputCount - outputCount) / inputCount) * 100
  //    - keptByLevel: nombre de logs gardes par level
  //    - droppedByLevel: nombre de logs supprimes par level

  throw new Error('TODO: Implement applyLogSampling');
}

// =============================================================================
// Exercice 4 — Calcul d'economies de sampling
// =============================================================================

function calculateCostSavings(
  currentConfig: ObservabilityStackConfig,
  newSamplingRates: {
    logSamplingRate: number;     // Taux de logs gardes (0.0-1.0)
    traceSamplingRate: number;   // Taux de traces gardees (0.0-1.0)
    metricsReduction: number;    // Pourcentage de series a supprimer (0.0-1.0)
  }
): CostSavingsReport {
  // TODO: Calculer les economies realisees par le sampling
  //
  // 1. Calculer le cout actuel avec calculateStackCost(currentConfig)
  //
  // 2. Creer la nouvelle config avec les taux de sampling appliques :
  //    - logs.dailyVolumeGB * logSamplingRate
  //    - traces.dailySpans reste identique, mais traces.samplingRate = traceSamplingRate
  //    - metrics.activeSeries * (1 - metricsReduction)
  //
  // 3. Calculer le nouveau cout avec calculateStackCost(newConfig)
  //
  // 4. Retourner le rapport avec les economies
  //    - savingsUSD = current - projected
  //    - savingsPercent = (savingsUSD / currentMonthlyCostUSD) * 100
  //    - details: economie par composant (logs, traces, metrics)

  throw new Error('TODO: Implement calculateCostSavings');
}

// =============================================================================
// Exercice 5 — Calculateur de cout de la stack d'observabilite
// =============================================================================

function calculateStackCost(config: ObservabilityStackConfig): ObservabilityStackCost {
  // TODO: Calculer le cout mensuel de la stack d'observabilite
  //
  // Formules (prix mensuels) :
  //
  // Metriques :
  //   ingestion = (activeSeries / 1000) * 0.10
  //   storage   = (activeSeries / 1000) * retentionDays * 0.01
  //
  // Logs :
  //   ingestion = dailyVolumeGB * 30 * 0.50
  //   storage   = dailyVolumeGB * retentionDays * 0.03
  //
  // Traces :
  //   spansIngested  = dailySpans * samplingRate
  //   ingestion = (spansIngested * 30 / 1_000_000) * 0.30
  //   storage   = (spansIngested * retentionDays / 1_000_000) * 0.02
  //
  // totalMonthlyCostUSD = somme de tous les couts

  throw new Error('TODO: Implement calculateStackCost');
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
    // Pour label 'a': contributionFactor = 6 / 2 = 3
    const labelA = report.labelContributions.find(l => l.labelName === 'a');
    assertEqual(labelA!.contributionFactor, 3);
    // Pour label 'b': contributionFactor = 6 / 3 = 2
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
    assertEqual(result.totalSeries, 4); // 2 * 2 = 4
    // Cout = (4 / 1000) * 0.10 = 0.0004
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
    assertEqual(result.keptByLevel['error'], 10); // Toutes les erreurs gardees
    assertLessThan(result.keptByLevel['info'] || 0, 90); // Pas tous les info gardes
    assertGreaterThan(result.reductionPercent, 0);
  });

  await test('Ex3: sampling applique le rate limit par pattern', () => {
    const logs: LogEntry[] = [];
    const now = Date.now();
    // 200 logs du meme pattern dans la meme minute
    for (let i = 0; i < 200; i++) {
      logs.push({
        timestamp: now + i * 100, // Tous dans la meme minute
        level: 'info',
        pattern: 'GET /api/health 200',
        message: `Health check ${i}`,
        sizeBytes: 100,
      });
    }
    const config: SamplingConfig = {
      defaultRate: 1.0, // Garder tout par defaut
      errorRate: 1.0,
      debugRate: 0.01,
      warnRate: 0.5,
      patternRateLimits: new Map([['GET /api/health 200', 10]]), // Max 10/min
    };
    const { result } = applyLogSampling(logs, config);
    // Devrait etre limite a environ 10
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

    // Verifier que total = somme des composants
    const sumBreakdown = cost.breakdown.metricsIngestionUSD
      + cost.breakdown.metricsStorageUSD
      + cost.breakdown.logsIngestionUSD
      + cost.breakdown.logsStorageUSD
      + cost.breakdown.tracesIngestionUSD
      + cost.breakdown.tracesStorageUSD;
    // Tolerance pour les arrondis flottants
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

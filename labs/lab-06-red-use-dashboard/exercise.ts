// =============================================================================
// Lab 06 — Calculer RED & USE
// =============================================================================
// Objectifs :
//   - Calculer Rate, Errors, Duration (RED)
//   - Calculer Utilization, Saturation, Errors (USE)
//   - Construire un dashboard combinant toutes les metriques
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
// Calculez le taux de requetes par seconde a partir de timestamps.
// =============================================================================

// TODO: Implementez cette fonction
// Donnee : un tableau de timestamps (en ms) representant l'arrivee de chaque requete
// Retour : le nombre de requetes par seconde (rate)
// Formule : count / ((maxTimestamp - minTimestamp) / 1000)
// Si moins de 2 requetes, retournez 0
function calculateRequestRate(timestamps: number[]): number {
  // TODO: Implementez
  return 0;
}

// =============================================================================
// Exercice 2 : Error Rate
// Calculez le taux d'erreur a partir de resultats de requetes.
// =============================================================================

// TODO: Implementez cette fonction
// Donnee : un tableau de requetes avec status code
// Retour : le taux d'erreur (nombre d'erreurs >= 500 / nombre total)
// Note : utilisez la fonction calculateErrorRate de test-utils comme reference
function computeErrorRate(requests: Array<{ status: number }>): number {
  // TODO: Implementez (comparez avec calculateErrorRate de test-utils)
  return 0;
}

// =============================================================================
// Exercice 3 : Duration Percentiles
// Calculez p50, p95, p99 a partir de durees de requetes.
// =============================================================================

interface DurationPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

// TODO: Implementez cette fonction
// Donnee : un tableau de durees en ms
// Retour : un objet avec p50, p95, p99, avg, max
// Utilisez calculatePercentile de test-utils pour les percentiles
function computeDurationPercentiles(durations: number[]): DurationPercentiles {
  // TODO: Implementez
  return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
}

// =============================================================================
// Exercice 4 : Utilization
// Calculez le taux d'utilisation d'une ressource.
// =============================================================================

// TODO: Implementez cette fonction
// Donnee : un tableau d'echantillons { timestamp, usagePercent }
// Retour : l'utilisation moyenne (moyenne des usagePercent)
function calculateUtilization(
  samples: Array<{ timestamp: number; usagePercent: number }>
): number {
  // TODO: Calculez la moyenne des usagePercent
  return 0;
}

// =============================================================================
// Exercice 5 : Saturation
// Calculez la saturation (profondeur de queue) a partir d'une serie temporelle.
// =============================================================================

interface SaturationMetrics {
  avgQueueDepth: number;
  maxQueueDepth: number;
  percentTimeOverCapacity: number;
}

// TODO: Implementez cette fonction
// Donnee : un tableau de { timestamp, queueDepth } et une capacite maximale
// Retour : la profondeur moyenne et max de la queue + % du temps ou queueDepth > capacity
function calculateSaturation(
  samples: Array<{ timestamp: number; queueDepth: number }>,
  capacity: number
): SaturationMetrics {
  // TODO: Implementez
  return { avgQueueDepth: 0, maxQueueDepth: 0, percentTimeOverCapacity: 0 };
}

// =============================================================================
// Exercice 6 : Dashboard RED + USE
// Combinez toutes les metriques dans un objet dashboard.
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

// TODO: Implementez cette fonction
// Combinez les fonctions precedentes pour construire un dashboard complet
function buildDashboard(
  requests: Array<{ status: number; durationMs: number; timestamp: number }>,
  resourceSamples: Array<{ timestamp: number; usagePercent: number }>,
  queueSamples: Array<{ timestamp: number; queueDepth: number }>,
  queueCapacity: number
): Dashboard {
  // TODO: Utilisez les fonctions des exercices precedents
  return {} as Dashboard;
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 06 — Calculer RED & USE\n');

  // --- Exercice 1 ---
  await test('Ex1 — calculateRequestRate basique', () => {
    // 10 requetes sur 1 seconde -> 10 rps
    const timestamps = Array.from({ length: 10 }, (_, i) => 1000 + i * 100);
    const rate = calculateRequestRate(timestamps);
    // 10 requetes sur 900ms = ~11.1 rps
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
    assertEqual(result.percentTimeOverCapacity, 25); // 1 sur 4 echantillons > 10
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

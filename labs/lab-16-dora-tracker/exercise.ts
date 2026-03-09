// =============================================================================
// Lab 16 — Tracker DORA Metrics (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 16 — DORA Tracker');

// =============================================================================
// Types
// =============================================================================

interface DeploymentEvent {
  id: string;
  timestamp: number;          // ms epoch
  commitTimestamp: number;     // when the commit was made
  service: string;
  success: boolean;
  causedIncident: boolean;
}

interface IncidentRecord {
  id: string;
  startTime: number;          // ms epoch
  endTime: number;            // ms epoch (resolved)
  deploymentId?: string;       // related deployment
}

type DORALevel = 'elite' | 'high' | 'medium' | 'low';

interface DORAMetrics {
  deploymentFrequency: number;    // deploys per day
  leadTimeForChanges: number;     // hours (median)
  changeFailureRate: number;      // 0-1
  mttr: number;                   // hours (mean)
}

interface DORAClassification {
  deploymentFrequency: DORALevel;
  leadTimeForChanges: DORALevel;
  changeFailureRate: DORALevel;
  mttr: DORALevel;
  overall: DORALevel;
}

// =============================================================================
// Exercice 1 — Deployment Frequency
// =============================================================================

function calculateDeploymentFrequency(
  deployments: DeploymentEvent[],
  periodDays: number
): number {
  // TODO: Calculer la fréquence de déploiement (déploiements par jour)
  // - Compter le nombre de déploiements
  // - Diviser par la période en jours
  // - Si periodDays <= 0, retourner 0
  throw new Error('TODO: Implement calculateDeploymentFrequency');
}

// =============================================================================
// Exercice 2 — Lead Time for Changes
// =============================================================================

function calculateLeadTimeForChanges(
  deployments: DeploymentEvent[]
): number {
  // TODO: Calculer le lead time median (en heures)
  // - Pour chaque déploiement, calculer : (timestamp - commitTimestamp) en heures
  // - Retourner la médiane des lead times
  // - Si pas de déploiements, retourner 0
  // - Médiane : trier les valeurs, prendre la valeur du milieu
  //   (si pair, moyenne des deux valeurs du milieu)
  throw new Error('TODO: Implement calculateLeadTimeForChanges');
}

// =============================================================================
// Exercice 3 — Change Failure Rate
// =============================================================================

function calculateChangeFailureRate(
  deployments: DeploymentEvent[]
): number {
  // TODO: Calculer le taux d'échec des changements
  // - Nombre de déploiements ayant causé un incident / nombre total de déploiements
  // - Si pas de déploiements, retourner 0
  throw new Error('TODO: Implement calculateChangeFailureRate');
}

// =============================================================================
// Exercice 4 — Mean Time to Recovery (MTTR)
// =============================================================================

function calculateMTTR(
  incidents: IncidentRecord[]
): number {
  // TODO: Calculer le temps moyen de récupération (en heures)
  // - Pour chaque incident, calculer : (endTime - startTime) en heures
  // - Retourner la moyenne
  // - Si pas d'incidents, retourner 0
  throw new Error('TODO: Implement calculateMTTR');
}

// =============================================================================
// Exercice 5 — Classification DORA
// =============================================================================
// Benchmarks DORA :
//
// Deployment Frequency:
//   elite: multiple per day (>= 1/day)
//   high: between once per day and once per week (>= 1/7)
//   medium: between once per week and once per month (>= 1/30)
//   low: less than once per month
//
// Lead Time for Changes (hours):
//   elite: < 24h (< 1 day)
//   high: < 168h (< 1 week)
//   medium: < 720h (< 1 month)
//   low: >= 720h
//
// Change Failure Rate:
//   elite: < 5% (< 0.05)
//   high: < 10% (< 0.10)
//   medium: < 15% (< 0.15)
//   low: >= 15%
//
// MTTR (hours):
//   elite: < 1h
//   high: < 24h
//   medium: < 168h (1 week)
//   low: >= 168h
// =============================================================================

function classifyDORA(metrics: DORAMetrics): DORAClassification {
  // TODO: Classifier chaque métrique selon les benchmarks DORA
  //
  // Pour l'overall:
  // - Convertir chaque level en score : elite=4, high=3, medium=2, low=1
  // - Calculer la moyenne
  // - >= 3.5 → 'elite', >= 2.5 → 'high', >= 1.5 → 'medium', sinon → 'low'
  throw new Error('TODO: Implement classifyDORA');
}

function calculateAllDORAMetrics(
  deployments: DeploymentEvent[],
  incidents: IncidentRecord[],
  periodDays: number
): DORAMetrics {
  // TODO: Calculer toutes les métriques DORA
  // - deploymentFrequency: calculateDeploymentFrequency(deployments, periodDays)
  // - leadTimeForChanges: calculateLeadTimeForChanges(deployments)
  // - changeFailureRate: calculateChangeFailureRate(deployments)
  // - mttr: calculateMTTR(incidents)
  throw new Error('TODO: Implement calculateAllDORAMetrics');
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n📊 Lab 16 — DORA Tracker\n');

  const now = Date.now();
  const HOUR = 3600000;
  const DAY = 86400000;

  // --- Exercice 1 ---
  await test('Ex1: calculer la fréquence de déploiement', () => {
    const deployments: DeploymentEvent[] = Array.from({ length: 30 }, (_, i) => ({
      id: `deploy-${i}`,
      timestamp: now - (30 - i) * DAY,
      commitTimestamp: now - (30 - i) * DAY - 2 * HOUR,
      service: 'api',
      success: true,
      causedIncident: false,
    }));
    const freq = calculateDeploymentFrequency(deployments, 30);
    assertEqual(freq, 1); // 30 deploys / 30 days = 1/day
  });

  await test('Ex1: fréquence avec plusieurs déploiements par jour', () => {
    const deployments: DeploymentEvent[] = Array.from({ length: 14 }, (_, i) => ({
      id: `deploy-${i}`,
      timestamp: now - (7 - Math.floor(i / 2)) * DAY,
      commitTimestamp: now - (7 - Math.floor(i / 2)) * DAY - HOUR,
      service: 'api',
      success: true,
      causedIncident: false,
    }));
    const freq = calculateDeploymentFrequency(deployments, 7);
    assertEqual(freq, 2); // 14 deploys / 7 days = 2/day
  });

  // --- Exercice 2 ---
  await test('Ex2: calculer le lead time median', () => {
    const deployments: DeploymentEvent[] = [
      { id: 'd1', timestamp: now, commitTimestamp: now - 2 * HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd2', timestamp: now, commitTimestamp: now - 4 * HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd3', timestamp: now, commitTimestamp: now - 6 * HOUR, service: 'api', success: true, causedIncident: false },
    ];
    const leadTime = calculateLeadTimeForChanges(deployments);
    assertEqual(leadTime, 4); // median of [2, 4, 6] = 4 hours
  });

  // --- Exercice 3 ---
  await test('Ex3: calculer le change failure rate', () => {
    const deployments: DeploymentEvent[] = [
      { id: 'd1', timestamp: now, commitTimestamp: now - HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd2', timestamp: now, commitTimestamp: now - HOUR, service: 'api', success: true, causedIncident: true },
      { id: 'd3', timestamp: now, commitTimestamp: now - HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd4', timestamp: now, commitTimestamp: now - HOUR, service: 'api', success: true, causedIncident: false },
    ];
    const cfr = calculateChangeFailureRate(deployments);
    assertEqual(cfr, 0.25); // 1/4
  });

  // --- Exercice 4 ---
  await test('Ex4: calculer le MTTR', () => {
    const incidents: IncidentRecord[] = [
      { id: 'inc1', startTime: now - 4 * HOUR, endTime: now - 3 * HOUR },      // 1h
      { id: 'inc2', startTime: now - 6 * HOUR, endTime: now - 4 * HOUR },      // 2h
      { id: 'inc3', startTime: now - 10 * HOUR, endTime: now - 7 * HOUR },     // 3h
    ];
    const mttr = calculateMTTR(incidents);
    assertEqual(mttr, 2); // mean of [1, 2, 3] = 2 hours
  });

  await test('Ex4: MTTR avec pas d\'incidents retourne 0', () => {
    const mttr = calculateMTTR([]);
    assertEqual(mttr, 0);
  });

  // --- Exercice 5 ---
  await test('Ex5: classifier une équipe elite', () => {
    const metrics: DORAMetrics = {
      deploymentFrequency: 5,    // multiple per day → elite
      leadTimeForChanges: 2,     // 2h → elite
      changeFailureRate: 0.03,   // 3% → elite
      mttr: 0.5,                 // 30min → elite
    };
    const classification = classifyDORA(metrics);
    assertEqual(classification.deploymentFrequency, 'elite');
    assertEqual(classification.leadTimeForChanges, 'elite');
    assertEqual(classification.changeFailureRate, 'elite');
    assertEqual(classification.mttr, 'elite');
    assertEqual(classification.overall, 'elite');
  });

  await test('Ex5: classifier une équipe medium', () => {
    const metrics: DORAMetrics = {
      deploymentFrequency: 0.1,   // ~3x/month → medium
      leadTimeForChanges: 200,    // ~8 days → medium
      changeFailureRate: 0.12,    // 12% → medium
      mttr: 48,                   // 2 days → medium
    };
    const classification = classifyDORA(metrics);
    assertEqual(classification.deploymentFrequency, 'medium');
    assertEqual(classification.leadTimeForChanges, 'medium');
    assertEqual(classification.changeFailureRate, 'medium');
    assertEqual(classification.mttr, 'medium');
    assertEqual(classification.overall, 'medium');
  });

  await test('Ex5: calculer toutes les métriques DORA ensemble', () => {
    const deployments: DeploymentEvent[] = Array.from({ length: 60 }, (_, i) => ({
      id: `d-${i}`,
      timestamp: now - (30 - Math.floor(i / 2)) * DAY,
      commitTimestamp: now - (30 - Math.floor(i / 2)) * DAY - 3 * HOUR,
      service: 'api',
      success: true,
      causedIncident: i % 20 === 0, // 5% failure
    }));
    const incidents: IncidentRecord[] = [
      { id: 'inc1', startTime: now - 4 * HOUR, endTime: now - 3.5 * HOUR, deploymentId: 'd-0' },
      { id: 'inc2', startTime: now - 8 * HOUR, endTime: now - 7 * HOUR, deploymentId: 'd-20' },
      { id: 'inc3', startTime: now - 12 * HOUR, endTime: now - 11 * HOUR, deploymentId: 'd-40' },
    ];
    const metrics = calculateAllDORAMetrics(deployments, incidents, 30);
    assertGreaterThan(metrics.deploymentFrequency, 0);
    assertGreaterThan(metrics.leadTimeForChanges, 0);
    assert(metrics.changeFailureRate >= 0 && metrics.changeFailureRate <= 1, 'CFR should be between 0 and 1');
    assertGreaterThan(metrics.mttr, 0);
  });

  summary();
}

main();

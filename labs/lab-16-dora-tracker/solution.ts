// =============================================================================
// Lab 16 — Tracker DORA Metrics (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 16 — DORA Tracker');

// =============================================================================
// Types
// =============================================================================

interface DeploymentEvent {
  id: string;
  timestamp: number;
  commitTimestamp: number;
  service: string;
  success: boolean;
  causedIncident: boolean;
}

interface IncidentRecord {
  id: string;
  startTime: number;
  endTime: number;
  deploymentId?: string;
}

type DORALevel = 'elite' | 'high' | 'medium' | 'low';

interface DORAMetrics {
  deploymentFrequency: number;
  leadTimeForChanges: number;
  changeFailureRate: number;
  mttr: number;
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
  if (periodDays <= 0) return 0;
  return deployments.length / periodDays;
}

// =============================================================================
// Exercice 2 — Lead Time for Changes
// =============================================================================

function calculateLeadTimeForChanges(
  deployments: DeploymentEvent[]
): number {
  if (deployments.length === 0) return 0;

  const leadTimes = deployments
    .map(d => (d.timestamp - d.commitTimestamp) / 3600000) // ms to hours
    .sort((a, b) => a - b);

  const mid = Math.floor(leadTimes.length / 2);
  if (leadTimes.length % 2 === 0) {
    return (leadTimes[mid - 1] + leadTimes[mid]) / 2;
  }
  return leadTimes[mid];
}

// =============================================================================
// Exercice 3 — Change Failure Rate
// =============================================================================

function calculateChangeFailureRate(
  deployments: DeploymentEvent[]
): number {
  if (deployments.length === 0) return 0;
  const failures = deployments.filter(d => d.causedIncident).length;
  return failures / deployments.length;
}

// =============================================================================
// Exercice 4 — Mean Time to Recovery (MTTR)
// =============================================================================

function calculateMTTR(
  incidents: IncidentRecord[]
): number {
  if (incidents.length === 0) return 0;
  const recoveryTimes = incidents.map(inc => (inc.endTime - inc.startTime) / 3600000);
  return recoveryTimes.reduce((sum, t) => sum + t, 0) / recoveryTimes.length;
}

// =============================================================================
// Exercice 5 — Classification DORA
// =============================================================================

function classifyDORA(metrics: DORAMetrics): DORAClassification {
  // Deployment Frequency
  let dfLevel: DORALevel;
  if (metrics.deploymentFrequency >= 1) dfLevel = 'elite';
  else if (metrics.deploymentFrequency >= 1 / 7) dfLevel = 'high';
  else if (metrics.deploymentFrequency >= 1 / 30) dfLevel = 'medium';
  else dfLevel = 'low';

  // Lead Time for Changes (hours)
  let ltLevel: DORALevel;
  if (metrics.leadTimeForChanges < 24) ltLevel = 'elite';
  else if (metrics.leadTimeForChanges < 168) ltLevel = 'high';
  else if (metrics.leadTimeForChanges < 720) ltLevel = 'medium';
  else ltLevel = 'low';

  // Change Failure Rate
  let cfrLevel: DORALevel;
  if (metrics.changeFailureRate < 0.05) cfrLevel = 'elite';
  else if (metrics.changeFailureRate < 0.10) cfrLevel = 'high';
  else if (metrics.changeFailureRate < 0.15) cfrLevel = 'medium';
  else cfrLevel = 'low';

  // MTTR (hours)
  let mttrLevel: DORALevel;
  if (metrics.mttr < 1) mttrLevel = 'elite';
  else if (metrics.mttr < 24) mttrLevel = 'high';
  else if (metrics.mttr < 168) mttrLevel = 'medium';
  else mttrLevel = 'low';

  // Overall
  const levelToScore: Record<DORALevel, number> = { elite: 4, high: 3, medium: 2, low: 1 };
  const avgScore = (levelToScore[dfLevel] + levelToScore[ltLevel] + levelToScore[cfrLevel] + levelToScore[mttrLevel]) / 4;

  let overall: DORALevel;
  if (avgScore >= 3.5) overall = 'elite';
  else if (avgScore >= 2.5) overall = 'high';
  else if (avgScore >= 1.5) overall = 'medium';
  else overall = 'low';

  return {
    deploymentFrequency: dfLevel,
    leadTimeForChanges: ltLevel,
    changeFailureRate: cfrLevel,
    mttr: mttrLevel,
    overall,
  };
}

function calculateAllDORAMetrics(
  deployments: DeploymentEvent[],
  incidents: IncidentRecord[],
  periodDays: number
): DORAMetrics {
  return {
    deploymentFrequency: calculateDeploymentFrequency(deployments, periodDays),
    leadTimeForChanges: calculateLeadTimeForChanges(deployments),
    changeFailureRate: calculateChangeFailureRate(deployments),
    mttr: calculateMTTR(incidents),
  };
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
    assertEqual(freq, 1);
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
    assertEqual(freq, 2);
  });

  // --- Exercice 2 ---
  await test('Ex2: calculer le lead time median', () => {
    const deployments: DeploymentEvent[] = [
      { id: 'd1', timestamp: now, commitTimestamp: now - 2 * HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd2', timestamp: now, commitTimestamp: now - 4 * HOUR, service: 'api', success: true, causedIncident: false },
      { id: 'd3', timestamp: now, commitTimestamp: now - 6 * HOUR, service: 'api', success: true, causedIncident: false },
    ];
    const leadTime = calculateLeadTimeForChanges(deployments);
    assertEqual(leadTime, 4);
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
    assertEqual(cfr, 0.25);
  });

  // --- Exercice 4 ---
  await test('Ex4: calculer le MTTR', () => {
    const incidents: IncidentRecord[] = [
      { id: 'inc1', startTime: now - 4 * HOUR, endTime: now - 3 * HOUR },
      { id: 'inc2', startTime: now - 6 * HOUR, endTime: now - 4 * HOUR },
      { id: 'inc3', startTime: now - 10 * HOUR, endTime: now - 7 * HOUR },
    ];
    const mttr = calculateMTTR(incidents);
    assertEqual(mttr, 2);
  });

  await test('Ex4: MTTR avec pas d\'incidents retourne 0', () => {
    const mttr = calculateMTTR([]);
    assertEqual(mttr, 0);
  });

  // --- Exercice 5 ---
  await test('Ex5: classifier une équipe elite', () => {
    const metrics: DORAMetrics = {
      deploymentFrequency: 5,
      leadTimeForChanges: 2,
      changeFailureRate: 0.03,
      mttr: 0.5,
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
      deploymentFrequency: 0.1,
      leadTimeForChanges: 200,
      changeFailureRate: 0.12,
      mttr: 48,
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
      causedIncident: i % 20 === 0,
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

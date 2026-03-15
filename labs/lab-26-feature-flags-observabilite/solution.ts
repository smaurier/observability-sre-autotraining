// =============================================================================
// Lab 26 — Feature Flags et Observabilite
// =============================================================================
// SOLUTION
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { createHash } from 'node:crypto';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 26 — Feature Flags et Observabilite');

// =============================================================================
// Exercice 1 : Service de Feature Flags
// =============================================================================

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  description: string;
  createdAt: number;
  updatedAt: number;
}

interface EvaluationContext {
  userId: string;
  attributes?: Record<string, string>;
}

function hashForRollout(key: string, userId: string): number {
  // POURQUOI : On utilise MD5 (rapide, pas besoin de securite ici) pour
  // obtenir un nombre deterministe a partir du couple (flag, userId).
  // Le meme utilisateur aura toujours le meme hash pour un flag donne,
  // garantissant une experience coherente (sticky assignment).
  const hash = createHash('md5').update(`${key}:${userId}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 100;
}

class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();
  private auditLog: Array<{ action: string; key: string; timestamp: number; details?: string }> = [];

  private log(action: string, key: string, details?: string): void {
    this.auditLog.push({ action, key, timestamp: Date.now(), details });
  }

  createFlag(key: string, description: string): FeatureFlag {
    // POURQUOI : Un nouveau flag est toujours desactive par defaut (safety first).
    // On ne veut jamais qu'un flag soit actif par accident en production.
    const flag: FeatureFlag = {
      key,
      enabled: false,
      rolloutPercentage: 0,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.flags.set(key, flag);
    this.log('create', key, description);
    return flag;
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  enableFlag(key: string): void {
    const flag = this.flags.get(key);
    if (!flag) return;
    flag.enabled = true;
    flag.rolloutPercentage = 100;
    flag.updatedAt = Date.now();
    this.log('enable', key, 'rollout=100%');
  }

  disableFlag(key: string): void {
    const flag = this.flags.get(key);
    if (!flag) return;
    // POURQUOI : Desactiver un flag le met a 0% de rollout.
    // C'est le mecanisme de kill switch : une seule action desactive
    // la fonctionnalite pour TOUS les utilisateurs instantanement.
    flag.enabled = false;
    flag.rolloutPercentage = 0;
    flag.updatedAt = Date.now();
    this.log('disable', key, 'rollout=0%');
  }

  setRollout(key: string, percentage: number): void {
    const flag = this.flags.get(key);
    if (!flag) return;
    flag.rolloutPercentage = Math.max(0, Math.min(100, percentage));
    // POURQUOI : Si on met un rollout > 0, le flag doit etre enabled.
    // Sinon, isEnabled retournerait toujours false malgre le rollout.
    if (percentage > 0) flag.enabled = true;
    flag.updatedAt = Date.now();
    this.log('setRollout', key, `rollout=${percentage}%`);
  }

  isEnabled(key: string, context: EvaluationContext): boolean {
    const flag = this.flags.get(key);
    if (!flag || !flag.enabled) return false;
    if (flag.rolloutPercentage >= 100) return true;
    if (flag.rolloutPercentage <= 0) return false;

    // POURQUOI : Le hash deterministe garantit que le meme utilisateur
    // a toujours le meme resultat pour un flag donne. Si on augmente
    // le rollout de 10% a 20%, les 10% initiaux restent inclus
    // (propriete de monotonie du hash mod N).
    const hashValue = hashForRollout(key, context.userId);
    return hashValue < flag.rolloutPercentage;
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  getAuditLog(): Array<{ action: string; key: string; timestamp: number; details?: string }> {
    return [...this.auditLog];
  }
}

// =============================================================================
// Exercice 2 : Evaluateur Canary
// =============================================================================

interface MetricsSnapshot {
  errorRate: number;
  p50Latency: number;
  p99Latency: number;
  requestCount: number;
}

interface CanaryThresholds {
  maxErrorRateIncrease: number;
  maxP99LatencyIncrease: number;
  minRequestCount: number;
}

type CanaryVerdict = 'advance' | 'hold' | 'rollback';

interface CanaryResult {
  verdict: CanaryVerdict;
  checks: Array<{
    metric: string;
    baseline: number;
    canary: number;
    threshold: number;
    passed: boolean;
  }>;
  reason: string;
}

function evaluateCanary(
  baseline: MetricsSnapshot,
  canary: MetricsSnapshot,
  thresholds: CanaryThresholds
): CanaryResult {
  // POURQUOI : On exige un minimum de requetes pour eviter de prendre
  // des decisions sur des donnees statistiquement insignifiantes.
  // Avec 5 requetes, 1 erreur = 20% d'erreur, ce qui est trompeur.
  if (canary.requestCount < thresholds.minRequestCount) {
    return {
      verdict: 'hold',
      checks: [],
      reason: 'Pas assez de requetes pour evaluer',
    };
  }

  const checks: CanaryResult['checks'] = [];

  // POURQUOI : On divise par max(baseline, 0.001) pour eviter la division
  // par zero quand le baseline a 0% d'erreur. Un taux de 0.001 (0.1%)
  // est un plancher raisonnable.
  const errorRateIncrease =
    ((canary.errorRate - baseline.errorRate) / Math.max(baseline.errorRate, 0.001)) * 100;
  const errorRatePassed = errorRateIncrease <= thresholds.maxErrorRateIncrease;
  checks.push({
    metric: 'errorRate',
    baseline: baseline.errorRate,
    canary: canary.errorRate,
    threshold: thresholds.maxErrorRateIncrease,
    passed: errorRatePassed,
  });

  const p99Increase =
    ((canary.p99Latency - baseline.p99Latency) / baseline.p99Latency) * 100;
  const p99Passed = p99Increase <= thresholds.maxP99LatencyIncrease;
  checks.push({
    metric: 'p99Latency',
    baseline: baseline.p99Latency,
    canary: canary.p99Latency,
    threshold: thresholds.maxP99LatencyIncrease,
    passed: p99Passed,
  });

  // POURQUOI : On utilise un verdict a 3 niveaux :
  // - advance : tout va bien, on peut augmenter le rollout
  // - hold : pas assez de donnees ou latence elevee (attendre)
  // - rollback : erreurs critiques, il faut revenir en arriere immediatement
  let verdict: CanaryVerdict;
  let reason: string;

  if (errorRatePassed && p99Passed) {
    verdict = 'advance';
    reason = 'Toutes les metriques dans les seuils';
  } else if (!errorRatePassed) {
    verdict = 'rollback';
    reason = `Error rate trop eleve: +${errorRateIncrease.toFixed(1)}% (seuil: ${thresholds.maxErrorRateIncrease}%)`;
  } else {
    verdict = 'hold';
    reason = `P99 latency trop elevee: +${p99Increase.toFixed(1)}% (seuil: ${thresholds.maxP99LatencyIncrease}%)`;
  }

  return { verdict, checks, reason };
}

// =============================================================================
// Exercice 3 : Kill Switch automatique
// =============================================================================

interface KillSwitchConfig {
  maxErrorRate: number;
  maxP99Latency: number;
  evaluationWindowSize: number;
  triggerCount: number;
}

class KillSwitch {
  private flagService: FeatureFlagService;
  private config: KillSwitchConfig;
  private windows: Map<string, MetricsSnapshot[]> = new Map();

  constructor(flagService: FeatureFlagService, config: KillSwitchConfig) {
    this.flagService = flagService;
    this.config = config;
  }

  monitor(flagKey: string, snapshot: MetricsSnapshot): boolean {
    // POURQUOI : La fenetre glissante permet de ne considerer que les
    // N derniers snapshots. Un pic isole ne declenchera pas le kill,
    // mais des violations repetees le feront.
    if (!this.windows.has(flagKey)) {
      this.windows.set(flagKey, []);
    }

    const window = this.windows.get(flagKey)!;
    window.push(snapshot);

    // Garder uniquement la fenetre configuree
    while (window.length > this.config.evaluationWindowSize) {
      window.shift();
    }

    // Compter les violations dans la fenetre
    const violations = window.filter(
      s => s.errorRate > this.config.maxErrorRate || s.p99Latency > this.config.maxP99Latency
    ).length;

    // POURQUOI : On exige triggerCount violations avant de declencher le kill.
    // C'est un mecanisme de debouncing qui evite les faux positifs
    // (un spike isole ne desactive pas la feature).
    if (violations >= this.config.triggerCount) {
      this.flagService.disableFlag(flagKey);
      return true;
    }

    return false;
  }

  getViolationCount(flagKey: string): number {
    const window = this.windows.get(flagKey) || [];
    return window.filter(
      s => s.errorRate > this.config.maxErrorRate || s.p99Latency > this.config.maxP99Latency
    ).length;
  }

  reset(flagKey: string): void {
    this.windows.set(flagKey, []);
  }
}

// =============================================================================
// Exercice 4 : Simulateur A/B Test
// =============================================================================

interface ABTestConfig {
  flagKey: string;
  controlName: string;
  treatmentName: string;
}

interface UserEvent {
  userId: string;
  variant: 'control' | 'treatment';
  converted: boolean;
  revenue: number;
  pageLoadMs: number;
}

interface ABTestResults {
  control: {
    userCount: number;
    conversionRate: number;
    averageRevenue: number;
    averagePageLoad: number;
  };
  treatment: {
    userCount: number;
    conversionRate: number;
    averageRevenue: number;
    averagePageLoad: number;
  };
  uplift: {
    conversionRate: number;
    revenue: number;
    pageLoad: number;
  };
  winner: 'control' | 'treatment' | 'inconclusive';
}

function analyzeABTest(events: UserEvent[]): ABTestResults {
  // POURQUOI : On separe les events par variant pour calculer les metriques
  // independamment. C'est la base de tout A/B test : comparer deux groupes.
  const control = events.filter(e => e.variant === 'control');
  const treatment = events.filter(e => e.variant === 'treatment');

  const calcStats = (group: UserEvent[]) => {
    const userCount = group.length;
    if (userCount === 0) return { userCount: 0, conversionRate: 0, averageRevenue: 0, averagePageLoad: 0 };

    const conversions = group.filter(e => e.converted).length;
    const conversionRate = conversions / userCount;
    const averageRevenue = group.reduce((sum, e) => sum + e.revenue, 0) / userCount;
    const averagePageLoad = group.reduce((sum, e) => sum + e.pageLoadMs, 0) / userCount;

    return { userCount, conversionRate, averageRevenue, averagePageLoad };
  };

  const controlStats = calcStats(control);
  const treatmentStats = calcStats(treatment);

  // POURQUOI : L'uplift mesure le % d'amelioration du treatment par rapport
  // au control. C'est la metrique qui permet de decider si le changement
  // est benefique. Un uplift de 10% en conversion signifie que le treatment
  // convertit 10% de plus que le control.
  const safeDiv = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100;

  const uplift = {
    conversionRate: safeDiv(treatmentStats.conversionRate, controlStats.conversionRate),
    revenue: safeDiv(treatmentStats.averageRevenue, controlStats.averageRevenue),
    pageLoad: safeDiv(treatmentStats.averagePageLoad, controlStats.averagePageLoad),
  };

  // POURQUOI : Le seuil de 5% est un minimum pratique pour declarer un gagnant.
  // En realite, il faudrait un test de significativite statistique (p-value < 0.05).
  // On verifie aussi que le pageLoad ne se degrade pas trop (max +10%)
  // car une amelioration de conversion au prix de performances degradees
  // n'est pas durable.
  let winner: 'control' | 'treatment' | 'inconclusive';
  if (uplift.conversionRate > 5 && uplift.pageLoad <= 10) {
    winner = 'treatment';
  } else if (uplift.conversionRate < -5) {
    winner = 'control';
  } else {
    winner = 'inconclusive';
  }

  return {
    control: controlStats,
    treatment: treatmentStats,
    uplift,
    winner,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n--- Lab 26 — Feature Flags et Observabilite ---\n');

  // --- Exercice 1 ---
  await test('Ex1 — createFlag', () => {
    const service = new FeatureFlagService();
    const flag = service.createFlag('new-checkout', 'Nouvelle page checkout');
    assertEqual(flag.key, 'new-checkout');
    assertEqual(flag.enabled, false);
    assertEqual(flag.rolloutPercentage, 0);
  });

  await test('Ex1 — enableFlag et disableFlag', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-a', 'Test');
    service.enableFlag('feature-a');
    assertEqual(service.getFlag('feature-a')?.enabled, true);
    assertEqual(service.getFlag('feature-a')?.rolloutPercentage, 100);

    service.disableFlag('feature-a');
    assertEqual(service.getFlag('feature-a')?.enabled, false);
    assertEqual(service.getFlag('feature-a')?.rolloutPercentage, 0);
  });

  await test('Ex1 — setRollout', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-b', 'Test');
    service.setRollout('feature-b', 50);
    assertEqual(service.getFlag('feature-b')?.rolloutPercentage, 50);
    assertEqual(service.getFlag('feature-b')?.enabled, true);
  });

  await test('Ex1 — isEnabled avec rollout 100%', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-c', 'Test');
    service.enableFlag('feature-c');
    assertEqual(service.isEnabled('feature-c', { userId: 'user-1' }), true);
    assertEqual(service.isEnabled('feature-c', { userId: 'user-999' }), true);
  });

  await test('Ex1 — isEnabled avec rollout 0%', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-d', 'Test');
    assertEqual(service.isEnabled('feature-d', { userId: 'user-1' }), false);
  });

  await test('Ex1 — isEnabled avec rollout partiel est deterministe', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-e', 'Test');
    service.setRollout('feature-e', 50);

    const result1 = service.isEnabled('feature-e', { userId: 'user-42' });
    const result2 = service.isEnabled('feature-e', { userId: 'user-42' });
    assertEqual(result1, result2);
  });

  await test('Ex1 — isEnabled rollout partiel distribue correctement', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-f', 'Test');
    service.setRollout('feature-f', 50);

    let enabledCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (service.isEnabled('feature-f', { userId: `user-${i}` })) {
        enabledCount++;
      }
    }
    assertGreaterThan(enabledCount, 350);
    assertLessThan(enabledCount, 650);
  });

  await test('Ex1 — audit log', () => {
    const service = new FeatureFlagService();
    service.createFlag('audit-test', 'Test');
    service.enableFlag('audit-test');
    service.setRollout('audit-test', 25);
    service.disableFlag('audit-test');

    const log = service.getAuditLog();
    assertGreaterThan(log.length, 2);
    assertEqual(log[0].action, 'create');
    assertEqual(log[0].key, 'audit-test');
  });

  // --- Exercice 2 ---
  await test('Ex2 — canary advance (metriques bonnes)', () => {
    const result = evaluateCanary(
      { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 10000 },
      { errorRate: 0.012, p50Latency: 105, p99Latency: 520, requestCount: 500 },
      { maxErrorRateIncrease: 50, maxP99LatencyIncrease: 25, minRequestCount: 100 }
    );
    assertEqual(result.verdict, 'advance');
  });

  await test('Ex2 — canary hold (pas assez de requetes)', () => {
    const result = evaluateCanary(
      { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 10000 },
      { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 5 },
      { maxErrorRateIncrease: 10, maxP99LatencyIncrease: 25, minRequestCount: 100 }
    );
    assertEqual(result.verdict, 'hold');
  });

  await test('Ex2 — canary rollback (error rate spike)', () => {
    const result = evaluateCanary(
      { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 10000 },
      { errorRate: 0.05, p50Latency: 100, p99Latency: 500, requestCount: 500 },
      { maxErrorRateIncrease: 50, maxP99LatencyIncrease: 25, minRequestCount: 100 }
    );
    assertEqual(result.verdict, 'rollback');
    assert(result.checks.some(c => c.metric === 'errorRate' && !c.passed), 'errorRate doit echouer');
  });

  await test('Ex2 — canary hold (latency spike)', () => {
    const result = evaluateCanary(
      { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 10000 },
      { errorRate: 0.01, p50Latency: 200, p99Latency: 800, requestCount: 500 },
      { maxErrorRateIncrease: 50, maxP99LatencyIncrease: 25, minRequestCount: 100 }
    );
    assertEqual(result.verdict, 'hold');
  });

  // --- Exercice 3 ---
  await test('Ex3 — kill switch ne declenche pas sous le seuil', () => {
    const service = new FeatureFlagService();
    service.createFlag('risky-feature', 'Test');
    service.enableFlag('risky-feature');

    const ks = new KillSwitch(service, {
      maxErrorRate: 0.05, maxP99Latency: 1000,
      evaluationWindowSize: 5, triggerCount: 3,
    });

    const killed = ks.monitor('risky-feature', {
      errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 1000,
    });
    assertEqual(killed, false);
    assertEqual(service.getFlag('risky-feature')?.enabled, true);
  });

  await test('Ex3 — kill switch declenche apres violations repetees', () => {
    const service = new FeatureFlagService();
    service.createFlag('bad-feature', 'Test');
    service.enableFlag('bad-feature');

    const ks = new KillSwitch(service, {
      maxErrorRate: 0.05, maxP99Latency: 1000,
      evaluationWindowSize: 5, triggerCount: 3,
    });

    ks.monitor('bad-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('bad-feature', { errorRate: 0.08, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    const killed = ks.monitor('bad-feature', { errorRate: 0.12, p50Latency: 100, p99Latency: 500, requestCount: 1000 });

    assertEqual(killed, true);
    assertEqual(service.getFlag('bad-feature')?.enabled, false);
  });

  await test('Ex3 — kill switch reset', () => {
    const service = new FeatureFlagService();
    service.createFlag('reset-feature', 'Test');
    service.enableFlag('reset-feature');

    const ks = new KillSwitch(service, {
      maxErrorRate: 0.05, maxP99Latency: 1000,
      evaluationWindowSize: 5, triggerCount: 3,
    });

    ks.monitor('reset-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('reset-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    assertEqual(ks.getViolationCount('reset-feature'), 2);

    ks.reset('reset-feature');
    assertEqual(ks.getViolationCount('reset-feature'), 0);
  });

  await test('Ex3 — kill switch respecte la fenetre', () => {
    const service = new FeatureFlagService();
    service.createFlag('window-feature', 'Test');
    service.enableFlag('window-feature');

    const ks = new KillSwitch(service, {
      maxErrorRate: 0.05, maxP99Latency: 1000,
      evaluationWindowSize: 3, triggerCount: 3,
    });

    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('window-feature', { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });

    assertEqual(service.getFlag('window-feature')?.enabled, true);
  });

  // --- Exercice 4 ---
  await test('Ex4 — analyzeABTest treatment gagnant', () => {
    const events: UserEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `control-${i}`, variant: 'control',
        converted: i < 10, revenue: i < 10 ? 50 : 0, pageLoadMs: 1000,
      });
    }
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `treatment-${i}`, variant: 'treatment',
        converted: i < 20, revenue: i < 20 ? 55 : 0, pageLoadMs: 950,
      });
    }

    const results = analyzeABTest(events);
    assertEqual(results.control.userCount, 100);
    assertEqual(results.treatment.userCount, 100);
    assertEqual(results.control.conversionRate, 0.1);
    assertEqual(results.treatment.conversionRate, 0.2);
    assertGreaterThan(results.uplift.conversionRate, 5);
    assertEqual(results.winner, 'treatment');
  });

  await test('Ex4 — analyzeABTest control gagnant', () => {
    const events: UserEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `c-${i}`, variant: 'control',
        converted: i < 20, revenue: i < 20 ? 50 : 0, pageLoadMs: 800,
      });
    }
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `t-${i}`, variant: 'treatment',
        converted: i < 10, revenue: i < 10 ? 50 : 0, pageLoadMs: 1200,
      });
    }

    const results = analyzeABTest(events);
    assertEqual(results.winner, 'control');
  });

  await test('Ex4 — analyzeABTest inconclusive', () => {
    const events: UserEvent[] = [];
    // Control et treatment quasi-identiques (uplift < 5%)
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `c-${i}`, variant: 'control',
        converted: i < 20, revenue: i < 20 ? 50 : 0, pageLoadMs: 1000,
      });
    }
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `t-${i}`, variant: 'treatment',
        converted: i < 21, revenue: i < 21 ? 51 : 0, pageLoadMs: 990,
      });
    }

    const results = analyzeABTest(events);
    assertEqual(results.winner, 'inconclusive');
  });

  summary();
}

main();

// =============================================================================
// Lab 26 — Feature Flags et Observabilite
// =============================================================================
// Objectifs :
//   - Implementer un service de feature flags avec rollout progressif
//   - Construire un evaluateur canary base sur les metriques
//   - Implementer un kill switch automatique
//   - Simuler un A/B test avec collecte de metriques
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { createHash } from 'node:crypto';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 26 — Feature Flags et Observabilite');

// =============================================================================
// Exercice 1 : Service de Feature Flags
// Implementez un service qui gere des flags avec rollout progressif.
// =============================================================================

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;  // 0-100
  description: string;
  createdAt: number;
  updatedAt: number;
}

interface EvaluationContext {
  userId: string;
  attributes?: Record<string, string>;
}

// TODO: Implementez la classe FeatureFlagService
// - createFlag(key, description) : cree un flag desactive (rollout 0%)
// - getFlag(key) : retourne le flag ou undefined
// - enableFlag(key) : active le flag (enabled=true, rollout=100%)
// - disableFlag(key) : desactive le flag (enabled=false, rollout=0%)
// - setRollout(key, percentage) : definit le pourcentage de rollout (0-100)
//   Le flag doit etre enabled automatiquement si percentage > 0
// - isEnabled(key, context) : evalue si le flag est actif pour un utilisateur
//   -> Si !enabled : false
//   -> Si rollout == 100 : true
//   -> Si rollout == 0 : false
//   -> Sinon : hash(key + userId) % 100 < rolloutPercentage
//     (utiliser hashForRollout ci-dessous)
// - getAllFlags() : retourne tous les flags
// - getAuditLog() : retourne le journal d'audit (chaque action est loggee)
class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();
  private auditLog: Array<{ action: string; key: string; timestamp: number; details?: string }> = [];

  createFlag(key: string, description: string): FeatureFlag {
    // TODO: Implementez
    return {} as FeatureFlag;
  }

  getFlag(key: string): FeatureFlag | undefined {
    // TODO: Implementez
    return undefined;
  }

  enableFlag(key: string): void {
    // TODO: Implementez
  }

  disableFlag(key: string): void {
    // TODO: Implementez
  }

  setRollout(key: string, percentage: number): void {
    // TODO: Implementez
  }

  isEnabled(key: string, context: EvaluationContext): boolean {
    // TODO: Implementez
    return false;
  }

  getAllFlags(): FeatureFlag[] {
    // TODO: Implementez
    return [];
  }

  getAuditLog(): Array<{ action: string; key: string; timestamp: number; details?: string }> {
    return [...this.auditLog];
  }
}

// Fonction utilitaire pour le rollout deterministe
function hashForRollout(key: string, userId: string): number {
  const hash = createHash('md5').update(`${key}:${userId}`).digest('hex');
  return parseInt(hash.substring(0, 8), 16) % 100;
}

// =============================================================================
// Exercice 2 : Evaluateur Canary
// Compare les metriques canary vs baseline pour decider du rollout.
// =============================================================================

interface MetricsSnapshot {
  errorRate: number;     // 0-1
  p50Latency: number;    // ms
  p99Latency: number;    // ms
  requestCount: number;
}

interface CanaryThresholds {
  maxErrorRateIncrease: number;   // % d'augmentation max (ex: 10 = 10%)
  maxP99LatencyIncrease: number;  // % d'augmentation max
  minRequestCount: number;         // Nombre minimum de requetes pour evaluer
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

// TODO: Implementez cette fonction
// Compare les metriques canary vs baseline :
//
// 1. Si canary.requestCount < thresholds.minRequestCount :
//    verdict = 'hold', reason = "Pas assez de requetes"
//
// 2. Verifier errorRate :
//    - increase = ((canary.errorRate - baseline.errorRate) / max(baseline.errorRate, 0.001)) * 100
//    - passed si increase <= thresholds.maxErrorRateIncrease
//
// 3. Verifier p99Latency :
//    - increase = ((canary.p99Latency - baseline.p99Latency) / baseline.p99Latency) * 100
//    - passed si increase <= thresholds.maxP99LatencyIncrease
//
// 4. verdict :
//    - Si tous les checks passent : 'advance'
//    - Si errorRate echoue : 'rollback'
//    - Sinon : 'hold'
function evaluateCanary(
  baseline: MetricsSnapshot,
  canary: MetricsSnapshot,
  thresholds: CanaryThresholds
): CanaryResult {
  // TODO: Implementez
  return { verdict: 'hold', checks: [], reason: '' };
}

// =============================================================================
// Exercice 3 : Kill Switch automatique
// Implementez un kill switch qui desactive automatiquement un flag
// quand les metriques depassent les seuils.
// =============================================================================

interface KillSwitchConfig {
  maxErrorRate: number;          // Seuil d'erreur (ex: 0.05 = 5%)
  maxP99Latency: number;         // Seuil de latence P99 en ms
  evaluationWindowSize: number;  // Nombre de snapshots a evaluer
  triggerCount: number;          // Nombre de violations avant kill
}

// TODO: Implementez la classe KillSwitch
// - Le constructeur prend un FeatureFlagService et un KillSwitchConfig
// - monitor(flagKey, snapshot) : recoit un snapshot de metriques
//   -> Ajoute le snapshot a la fenetre d'evaluation
//   -> Si la fenetre depasse evaluationWindowSize, supprime les plus anciens
//   -> Compte le nombre de violations (errorRate > max OU p99 > max)
//   -> Si violations >= triggerCount : desactive le flag et retourne true
//   -> Sinon retourne false
// - getViolationCount(flagKey) : retourne le nombre de violations actuelles
// - reset(flagKey) : reinitialise la fenetre pour ce flag
class KillSwitch {
  private flagService: FeatureFlagService;
  private config: KillSwitchConfig;
  private windows: Map<string, MetricsSnapshot[]> = new Map();

  constructor(flagService: FeatureFlagService, config: KillSwitchConfig) {
    this.flagService = flagService;
    this.config = config;
  }

  monitor(flagKey: string, snapshot: MetricsSnapshot): boolean {
    // TODO: Implementez
    return false;
  }

  getViolationCount(flagKey: string): number {
    // TODO: Implementez
    return 0;
  }

  reset(flagKey: string): void {
    // TODO: Implementez
  }
}

// =============================================================================
// Exercice 4 : Simulateur A/B Test
// Simulez un A/B test et collectez les metriques par variant.
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
    conversionRate: number;  // % de difference (treatment - control) / control * 100
    revenue: number;         // % de difference
    pageLoad: number;        // % de difference (negatif = plus rapide)
  };
  winner: 'control' | 'treatment' | 'inconclusive';
}

// TODO: Implementez cette fonction
// Analyse les resultats d'un A/B test :
// 1. Separe les events par variant (control/treatment)
// 2. Calcule pour chaque variant :
//    - userCount : nombre d'events
//    - conversionRate : converted.count / total
//    - averageRevenue : moyenne des revenue
//    - averagePageLoad : moyenne des pageLoadMs
// 3. Calcule l'uplift (% de difference treatment vs control)
//    - conversionRate uplift = (treatment - control) / control * 100
//    - revenue uplift = (treatment - control) / control * 100
//    - pageLoad uplift = (treatment - control) / control * 100
// 4. winner :
//    - 'treatment' si uplift conversionRate > 5% ET pageLoad uplift <= 10%
//    - 'control' si uplift conversionRate < -5%
//    - 'inconclusive' sinon
function analyzeABTest(events: UserEvent[]): ABTestResults {
  // TODO: Implementez
  return {
    control: { userCount: 0, conversionRate: 0, averageRevenue: 0, averagePageLoad: 0 },
    treatment: { userCount: 0, conversionRate: 0, averageRevenue: 0, averagePageLoad: 0 },
    uplift: { conversionRate: 0, revenue: 0, pageLoad: 0 },
    winner: 'inconclusive',
  };
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n--- Lab 26 — Feature Flags et Observabilite ---\n');

  // --- Exercice 1 : Feature Flag Service ---
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

    // Le meme userId doit toujours donner le meme resultat
    const result1 = service.isEnabled('feature-e', { userId: 'user-42' });
    const result2 = service.isEnabled('feature-e', { userId: 'user-42' });
    assertEqual(result1, result2);
  });

  await test('Ex1 — isEnabled rollout partiel distribue correctement', () => {
    const service = new FeatureFlagService();
    service.createFlag('feature-f', 'Test');
    service.setRollout('feature-f', 50);

    // Avec 1000 users, ~50% devraient etre actifs (marge: 35-65%)
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

  // --- Exercice 2 : Evaluateur Canary ---
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

  // --- Exercice 3 : Kill Switch ---
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

    // 3 violations consecutives
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

    // 2 violations puis 1 OK puis 2 violations
    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });
    ks.monitor('window-feature', { errorRate: 0.01, p50Latency: 100, p99Latency: 500, requestCount: 1000 }); // OK
    // Fenetre = [violation, OK] (premiere violation sortie de la fenetre de 3)
    ks.monitor('window-feature', { errorRate: 0.10, p50Latency: 100, p99Latency: 500, requestCount: 1000 });

    // Avec fenetre=3 : [OK, violation, violation] -> 2 violations, pas 3
    assertEqual(service.getFlag('window-feature')?.enabled, true);
  });

  // --- Exercice 4 : A/B Test ---
  await test('Ex4 — analyzeABTest treatment gagnant', () => {
    const events: UserEvent[] = [];
    // Control : 100 users, 10% conversion, 50EUR avg
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `control-${i}`, variant: 'control',
        converted: i < 10, revenue: i < 10 ? 50 : 0, pageLoadMs: 1000,
      });
    }
    // Treatment : 100 users, 20% conversion, 55EUR avg
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
    // Control : 20% conversion
    for (let i = 0; i < 100; i++) {
      events.push({
        userId: `c-${i}`, variant: 'control',
        converted: i < 20, revenue: i < 20 ? 50 : 0, pageLoadMs: 800,
      });
    }
    // Treatment : 10% conversion (pire)
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

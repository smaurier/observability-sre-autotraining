# Module 26 — Feature Flags et Observabilite : Rollout progressif et Kill Switch

## Objectifs pedagogiques

- Comprendre les concepts fondamentaux des feature flags et leur role dans le deploiement continu
- Comparer les solutions de feature flags (LaunchDarkly, Unleash, Flipt, Flagsmith)
- Implementer un rollout progressif base sur les metriques d'observabilite
- Mettre en place un canary deployment avec evaluation automatique
- Concevoir des A/B tests avec collecte de metriques
- Implementer un kill switch pour le rollback instantane

---

## 1. Feature Flags : fondamentaux

### 1.1 Qu'est-ce qu'un feature flag ?

Un feature flag (ou feature toggle) est un mecanisme qui permet d'activer ou desactiver une fonctionnalite **sans deployer de nouveau code**. C'est un decoupage entre le deploiement (mettre du code en production) et le release (rendre une fonctionnalite visible).

```
Sans feature flags :              Avec feature flags :
Deploiement = Release             Deploiement != Release
- Risque eleve                    - Deploy souvent, release quand pret
- Rollback = re-deploiement       - Rollback = toggle off
- Feature branches longues        - Trunk-based development
- Coordination equipes requise    - Autonomie des equipes
```

### 1.2 Types de feature flags

```
Type               | Duree de vie  | Exemple
-------------------|--------------|------------------------------------------
Release toggle     | Court terme  | Nouvelle page checkout (on/off)
Experiment toggle  | Court terme  | A/B test sur le bouton CTA
Ops toggle         | Long terme   | Kill switch pour desactiver le cache
Permission toggle  | Long terme   | Feature premium pour certains users
```

### 1.3 Architecture

```
Application                      Feature Flag Service
+------------------+            +------------------+
|                  |  Evaluate  |                  |
| if (isEnabled(   | ---------> | Rules Engine     |
|   'new-checkout' |            | - User segment   |
|   { userId }     |            | - % rollout      |
| ))               | <--------- | - Environment    |
|                  |  true/false | - Custom rules   |
+------------------+            +------------------+
                                        |
                                        v
                                +------------------+
                                | Dashboard        |
                                | - Toggle on/off  |
                                | - Rollout %      |
                                | - Audit log      |
                                +------------------+
```

---

## 2. Solutions de Feature Flags

### 2.1 Comparatif

```
Critere            | LaunchDarkly | Unleash       | Flipt         | Flagsmith
-------------------|-------------|---------------|---------------|----------
Type               | SaaS        | Self-hosted   | Self-hosted   | Les deux
                   |             | + Cloud       | uniquement    |
Open Source        | Non         | Oui (AGPL)    | Oui (GPL)     | Oui (BSD)
Pricing            | Eleve       | Gratuit/Cloud | Gratuit       | Gratuit/Cloud
SDK langages       | 25+         | 15+           | 10+           | 15+
A/B testing        | Oui         | Oui           | Non           | Oui
Audit log          | Oui         | Oui           | Oui           | Oui
OpenFeature        | Oui         | Oui           | Oui           | Oui
Edge evaluation    | Oui         | Non           | Non           | Non
```

### 2.2 OpenFeature : le standard ouvert

OpenFeature est un standard CNCF qui fournit une API unifiee pour les feature flags, permettant de changer de provider sans modifier le code applicatif :

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '@openfeature/flagd-provider';

// Configurer le provider (interchangeable)
OpenFeature.setProvider(new FlagdProvider());

// Utiliser l'API unifiee
const client = OpenFeature.getClient();

const showNewCheckout = await client.getBooleanValue(
  'new-checkout',
  false, // valeur par defaut
  { targetingKey: userId }
).catch(() => false); // Graceful degradation si flagd est injoignable

if (showNewCheckout) {
  renderNewCheckout();
} else {
  renderLegacyCheckout();
}
```

---

## 3. Rollout progressif

### 3.1 Strategies de rollout

```
Strategie           | Description                          | Risque
--------------------|--------------------------------------|--------
Big Bang            | 100% d'un coup                       | Eleve
Pourcentage         | 1% -> 5% -> 25% -> 50% -> 100%      | Faible
Canary              | 1 instance d'abord, puis elargir     | Tres faible
Ring-based          | Equipe interne -> beta -> GA         | Faible
User segment        | Premium d'abord, puis tous           | Moyen
Geographic          | Une region d'abord, puis toutes      | Faible
```

### 3.2 Rollout avec metriques

Le rollout progressif doit etre pilote par les metriques d'observabilite :

```typescript
// Evaluateur de sante pour le rollout
interface RolloutHealthCheck {
  errorRate: number;       // Taux d'erreur du groupe expose
  p99Latency: number;      // Latence P99
  apdex: number;           // Score Apdex (satisfaction utilisateur)
  baselineErrorRate: number;
  baselineP99: number;
}

function shouldAdvanceRollout(health: RolloutHealthCheck): boolean {
  // Conditions pour augmenter le pourcentage
  const errorRateOk = health.errorRate <= health.baselineErrorRate * 1.1; // max 10% de plus
  const latencyOk = health.p99Latency <= health.baselineP99 * 1.2; // max 20% de plus
  const apdexOk = health.apdex >= 0.9; // Apdex satisfaisant

  return errorRateOk && latencyOk && apdexOk;
}

interface RollbackConfig {
  errorRateMultiplier: number;  // defaut: 2.0
  latencyMultiplier: number;    // defaut: 3.0
  apdexMinimum: number;         // defaut: 0.5
}

const defaultRollbackConfig: RollbackConfig = {
  errorRateMultiplier: 2.0,
  latencyMultiplier: 3.0,
  apdexMinimum: 0.5,
};

function shouldRollback(
  health: RolloutHealthCheck,
  config: RollbackConfig = defaultRollbackConfig,
): boolean {
  // Conditions pour un rollback automatique (seuils configurables)
  const errorSpike = health.errorRate > health.baselineErrorRate * config.errorRateMultiplier;
  const latencySpike = health.p99Latency > health.baselineP99 * config.latencyMultiplier;
  const apdexCritical = health.apdex < config.apdexMinimum;

  return errorSpike || latencySpike || apdexCritical;
}
```

### 3.3 Pipeline de rollout automatise

```
Etape 1 : 1%              Etape 2 : 10%            Etape 3 : 50%           Etape 4 : 100%
+-----------+             +-----------+             +-----------+            +-----------+
| Deploy    | -- OK? -->  | Augmenter | -- OK? -->  | Augmenter | -- OK? --> | Full GA   |
| Observer  |             | Observer  |             | Observer  |            |           |
| 15 min    |             | 30 min    |             | 1h        |            |           |
+-----------+             +-----------+             +-----------+            +-----------+
     |                         |                         |
     | KO                      | KO                      | KO
     v                         v                         v
+-----------+             +-----------+             +-----------+
| ROLLBACK  |             | ROLLBACK  |             | ROLLBACK  |
| Kill flag |             | Kill flag |             | Kill flag |
+-----------+             +-----------+             +-----------+
```

---

## 4. Canary deployment avec metriques

### 4.1 Concept

Le canary deployment expose une petite partie du trafic a la nouvelle version et compare ses metriques avec la version stable :

```
                    Load Balancer
                    /          \
                   /            \
            95% trafic      5% trafic
                /                \
        +-----------+      +-----------+
        | Stable    |      | Canary    |
        | v1.2.3    |      | v1.3.0    |
        +-----------+      +-----------+
              |                   |
              v                   v
        +-----------+      +-----------+
        | Metriques |      | Metriques |
        | baseline  |      | canary    |
        +-----------+      +-----------+
                    \        /
                     \      /
                  Comparaison
                  automatique
```

### 4.2 Metriques de comparaison

```typescript
interface CanaryAnalysis {
  metric: string;
  baseline: number;
  canary: number;
  threshold: number; // Ecart maximum tolere en %
  pass: boolean;
}

// Metriques typiques pour un canary
const canaryChecks = [
  { metric: 'error_rate', threshold: 10, unit: 'percent' as const },      // max 10% de plus
  { metric: 'p50_latency', threshold: 15, unit: 'percent' as const },      // max 15% de plus
  { metric: 'p99_latency', threshold: 25, unit: 'percent' as const },      // max 25% de plus
  { metric: 'success_rate', threshold: 1, unit: 'percent' as const },       // max 1% de moins
  { metric: 'memory_usage', threshold: 20, unit: 'percent' as const },      // max 20% de plus
  { metric: 'cpu_usage', threshold: 20, unit: 'percent' as const },          // max 20% de plus
];
```

---

## 5. A/B testing avec observabilite

### 5.1 Metriques d'experience

```typescript
// Metriques a collecter pour un A/B test
interface ABTestMetrics {
  variant: 'control' | 'treatment';
  userId: string;

  // Metriques techniques
  pageLoadTime: number;
  timeToInteractive: number;
  errorCount: number;

  // Metriques business
  conversionRate: number;
  revenuePerUser: number;
  bounceRate: number;
  timeOnPage: number;
}

// Correlation feature flag <-> metriques
// Chaque evenement de telemetrie est tague avec le variant actif
span.setAttribute('feature_flag.new_checkout', 'treatment');
span.setAttribute('feature_flag.variant_id', 'variant-b');
```

### 5.2 Significativite statistique

```
Pour qu'un A/B test soit valide :

1. Taille d'echantillon suffisante
   - Calculer avant le test (power analysis)
   - Typiquement : 1000-10000 utilisateurs par variant

2. Duree suffisante
   - Minimum 1-2 semaines (effets de jour/nuit, week-end)
   - Eviter de conclure trop tot (peeking problem)

3. Significativite statistique
   - p-value < 0.05 (95% de confiance)
   - Utiliser un test de Chi-carre ou un test t de Student

4. Pas de biais de selection
   - Randomisation correcte (hash du userId)
   - Sticky assignment (meme variant pour le meme user)
```

---

## 6. Kill Switch

### 6.1 Concept

Un kill switch est un feature flag special concu pour desactiver instantanement une fonctionnalite en cas de probleme, sans deploiement :

```
Incident detecte         Kill switch active        Service restaure
(error rate spike)       (< 1 seconde)            (fonctionnalite desactivee)
     |                        |                         |
     v                        v                         v
  +--------+              +--------+               +--------+
  | Alerte |  ---------> | Toggle  | -----------> | Stable  |
  | PagerD |              | OFF    |               | Investig|
  +--------+              +--------+               +--------+

MTTR avec kill switch : < 1 minute
MTTR avec rollback classique : 5-15 minutes (CI/CD pipeline)
```

### 6.2 Implementation

```typescript
// Kill switch avec circuit breaker integre
class KillSwitch {
  private flagClient: FeatureFlagClient;
  private metricsCollector: MetricsCollector;

  async isFeatureAlive(flagKey: string): Promise<boolean> {
    try {
      // Verifier le flag
      const enabled = await this.flagClient.isEnabled(flagKey);
      if (!enabled) return false;

      // Verifier les metriques de sante
      const health = await this.metricsCollector.getHealth(flagKey);
      if (health.errorRate > 0.05) { // > 5% d'erreurs
        // Auto-kill : desactiver le flag automatiquement
        await this.flagClient.disable(flagKey);
        await this.alertTeam(flagKey, health);
        return false;
      }

      return true;
    } catch (err) {
      console.error(`[KillSwitch] Check failed for ${flagKey}:`, err);
      return false; // Fail-safe: disable feature on error
    }
  }
}
```

### 6.3 Bonnes pratiques

```
1. Circuit breaker automatique
   - Lier les metriques d'observabilite au kill switch
   - Desactivation automatique si seuils depasses
   - Notification immediate a l'equipe

2. Graceful degradation
   - Le code derriere le flag doit avoir un fallback
   - Tester le chemin "flag off" aussi bien que "flag on"
   - Prevoir le comportement en cas de timeout du flag service

3. Nettoyage des flags
   - Supprimer les flags apres rollout complet (dette technique)
   - Audit regulier des flags actifs
   - Date d'expiration sur chaque flag
```

---

## Resume

| Concept | Description | Impact observabilite |
|---------|------------|---------------------|
| Feature flag | Toggle on/off sans deploiement | Tag chaque trace avec le variant |
| Rollout progressif | 1% -> 100% pilote par metriques | Comparaison metriques par cohorte |
| Canary | Comparer canary vs baseline | Analyse automatique des deltas |
| A/B test | Comparer variants pour decision | Metriques business + techniques |
| Kill switch | Desactivation instantanee | MTTR < 1 minute |

---

## Exercices pratiques

Rendez-vous au [Lab 26 — Feature Flags et Observabilite](/labs/lab-26-feature-flags-observabilite/README) pour mettre en pratique ces concepts.

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 26 feature flags observabilite](../screencasts/screencast-26.md)
2. **Lab** : [lab-26-feature-flags-observabilite](../labs/lab-26-feature-flags-observabilite/README)
3. **Quiz** : [quiz 26 feature flags observabilite](../quizzes/quiz-26-feature-flags-observabilite.html)
:::

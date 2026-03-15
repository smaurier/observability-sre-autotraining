# Methodes RED & USE — Metriques qui comptent

## Objectifs pedagogiques

- Maitriser la methode RED (Rate, Errors, Duration) pour les services orientes requetes
- Maitriser la methode USE (Utilization, Saturation, Errors) pour les ressources systeme
- Connaitre les Golden Signals du livre Google SRE
- Instrumenter les metriques de saturation Node.js (event loop lag, heap, active handles)
- Identifier les anti-patterns courants (vanity metrics, explosion de labels)
- Construire un modele mental d'un dashboard avec les 5-10 metriques essentielles
- Instrumenter la demo-app avec les methodes RED et USE
- Calculer les percentiles et creer des fonctions utilitaires TypeScript

---

## La methode RED

La methode RED, creee par Tom Wilkie (Grafana Labs), est concue pour les **services orientes requetes** — exactement ce que sont les APIs REST, les microservices, et les applications web.

RED signifie :

- **R**ate — le nombre de requetes par seconde
- **E**rrors — le nombre de requetes qui echouent
- **D**uration — le temps que prennent les requetes

### Rate (taux de requetes)

Le rate repond a la question : "A quelle vitesse mon service travaille-t-il ?"

```typescript
import { Counter } from 'prom-client';

// Le counter de base pour le Rate
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requetes HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// PromQL pour obtenir le rate :
// rate(http_requests_total[5m])
// → nombre de requetes par seconde, moyennees sur 5 minutes

// Rate par route :
// sum by (route) (rate(http_requests_total[5m]))
```

Un changement brusque du rate est un signal fort :
- Rate qui chute → le service est peut-etre inaccessible
- Rate qui explose → attaque DDoS, bot, ou fonctionnalite virale
- Rate qui tombe a zero → plus personne n'atteint votre service

### Errors (taux d'erreur)

Le taux d'erreur repond a la question : "Quelle proportion de requetes echoue ?"

```typescript
// Le counter d'erreurs
const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Nombre total de requetes HTTP en erreur (4xx et 5xx)',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// PromQL pour le taux d'erreur en pourcentage :
// sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100

// Taux d'erreur par route :
// sum by (route) (rate(http_errors_total[5m]))
//   / sum by (route) (rate(http_requests_total[5m])) * 100

// Distinguer erreurs client (4xx) et serveur (5xx) :
// sum(rate(http_errors_total{status_code=~"5.."}[5m]))
//   / sum(rate(http_requests_total[5m])) * 100
```

::: warning Attention
Un taux d'erreur de 0% ne signifie pas que tout va bien. Si votre rate est aussi a zero, c'est que personne n'utilise le service. Croisez toujours le taux d'erreur avec le rate.
:::

### Duration (latence)

La duree repond a la question : "Combien de temps met mon service a repondre ?"

```typescript
import { Histogram } from 'prom-client';

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// PromQL — Percentile 99 de la latence :
// histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

// Percentile 50 (mediane) par route :
// histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))

// Latence moyenne (moins utile que les percentiles) :
// rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])
```

Pourquoi les percentiles plutot que la moyenne ? Parce que la moyenne masque les cas extremes.

```typescript
// Illustration du probleme de la moyenne
const latencies = [10, 12, 11, 13, 10, 11, 12, 10, 11, 5000]; // ms

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[index];
}

console.log('Moyenne   :', average(latencies));       // 510ms — trompeuse !
console.log('Mediane   :', percentile(latencies, 0.5));  // 11ms — realite
console.log('P99       :', percentile(latencies, 0.99)); // 5000ms — le probleme
// La moyenne de 510ms ne represente l'experience de personne.
// 90% des utilisateurs ont 10-13ms, un utilisateur a 5000ms.
```

---

## La methode USE

La methode USE, creee par Brendan Gregg, est concue pour les **ressources systeme** (CPU, memoire, disque, reseau, pool de connexions).

USE signifie :

- **U**tilization — quel pourcentage de la ressource est utilise
- **S**aturation — y a-t-il du travail en attente (file d'attente)
- **E**rrors — la ressource produit-elle des erreurs

### Utilization

```typescript
import { Gauge } from 'prom-client';

// Utilisation de la memoire heap Node.js
const heapUsageRatio = new Gauge({
  name: 'nodejs_heap_usage_ratio',
  help: 'Ratio d utilisation du heap (used / total)',
});

// Mise a jour periodique
setInterval(() => {
  const mem = process.memoryUsage();
  heapUsageRatio.set(mem.heapUsed / mem.heapTotal);
}, 5000);

// Utilisation du pool de connexions DB
const dbPoolUtilization = new Gauge({
  name: 'db_pool_utilization_ratio',
  help: 'Ratio d utilisation du pool de connexions DB',
});

function updatePoolMetrics(pool: DatabasePool) {
  const total = pool.totalConnections;
  const active = pool.activeConnections;
  dbPoolUtilization.set(active / total);
}
```

### Saturation

La saturation indique que la ressource est **debordee** et que du travail s'accumule en file d'attente.

```typescript
// Event loop lag — LE signal de saturation pour Node.js
import { Histogram, Gauge } from 'prom-client';

const eventLoopLag = new Gauge({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Latence de l event loop Node.js en secondes',
});

// Mesurer le lag manuellement
function measureEventLoopLag(): void {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const lag = Number(process.hrtime.bigint() - start) / 1e9; // en secondes
    eventLoopLag.set(lag);
  });
}

setInterval(measureEventLoopLag, 1000);

// File d'attente des connexions DB
const dbPoolWaiting = new Gauge({
  name: 'db_pool_waiting_requests',
  help: 'Nombre de requetes en attente d une connexion DB',
});

// Active handles — indicateur de charge systeme
const activeHandles = new Gauge({
  name: 'nodejs_active_handles_total',
  help: 'Nombre de handles actifs dans Node.js',
});

setInterval(() => {
  // @ts-expect-error — _getActiveHandles n'est pas dans les types
  activeHandles.set(process._getActiveHandles().length);
}, 5000);
```

### Errors (erreurs de ressources)

```typescript
// Erreurs de connexion a la base de donnees
const dbConnectionErrors = new Counter({
  name: 'db_connection_errors_total',
  help: 'Nombre total d erreurs de connexion a la DB',
  labelNames: ['error_type'] as const,
});

// Erreurs de timeout
const timeoutErrors = new Counter({
  name: 'external_service_timeout_total',
  help: 'Nombre de timeouts vers les services externes',
  labelNames: ['service'] as const,
});
```

---

## Golden Signals (Google SRE)

Le livre *Site Reliability Engineering* de Google definit 4 signaux essentiels. Ils recoupent RED et USE :

| Golden Signal | Equivalent RED/USE | Description |
|--------------|-------------------|-------------|
| **Latency** | Duration (RED) | Temps de reponse des requetes |
| **Traffic** | Rate (RED) | Volume de requetes |
| **Errors** | Errors (RED + USE) | Taux de requetes echouees |
| **Saturation** | Saturation (USE) | Niveau de "remplissage" des ressources |

```typescript
// Les 4 Golden Signals implementes pour la demo-app

// 1. LATENCY — Histogram de duree
export const requestLatency = new Histogram({
  name: 'golden_signal_latency_seconds',
  help: 'Latence des requetes (Golden Signal)',
  labelNames: ['service', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

// 2. TRAFFIC — Counter de requetes
export const requestTraffic = new Counter({
  name: 'golden_signal_traffic_total',
  help: 'Volume de trafic (Golden Signal)',
  labelNames: ['service', 'method'] as const,
});

// 3. ERRORS — Counter d'erreurs
export const requestErrors = new Counter({
  name: 'golden_signal_errors_total',
  help: 'Nombre d erreurs (Golden Signal)',
  labelNames: ['service', 'error_type'] as const,
});

// 4. SATURATION — Gauge de saturation
export const systemSaturation = new Gauge({
  name: 'golden_signal_saturation_ratio',
  help: 'Niveau de saturation (Golden Signal)',
  labelNames: ['resource'] as const,
});
```

---

## Metriques de saturation Node.js

Node.js etant single-threaded, la saturation se manifeste principalement par le **lag de l'event loop** et la **pression memoire**.

```typescript
// src/metrics/nodejs-saturation.ts
import { Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Deja inclus dans collectDefaultMetrics, mais voici des metriques custom :

// Event loop lag — le KPI numero 1 pour Node.js
export const eventLoopLagHistogram = new Histogram({
  name: 'nodejs_eventloop_lag_detailed_seconds',
  help: 'Distribution de la latence de l event loop',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

// Heap usage detaille
export const heapSpaceUsage = new Gauge({
  name: 'nodejs_heap_space_used_bytes',
  help: 'Memoire utilisee par espace heap',
  labelNames: ['space'] as const,
});

// Mettre a jour les metriques de heap
function updateHeapMetrics(): void {
  const heapSpaces = require('v8').getHeapSpaceStatistics();
  for (const space of heapSpaces) {
    heapSpaceUsage.set(
      { space: space.space_name },
      space.space_used_size
    );
  }
}

// Mesurer l'event loop lag avec un histogram
function measureEventLoopLag(): void {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const lagNs = Number(process.hrtime.bigint() - start);
    const lagSeconds = lagNs / 1e9;
    eventLoopLagHistogram.observe(lagSeconds);
  });
}

// Demarrer la collecte periodique
export function startNodejsSaturationMetrics(intervalMs = 2000): NodeJS.Timeout {
  return setInterval(() => {
    measureEventLoopLag();
    updateHeapMetrics();
  }, intervalMs);
}
```

::: tip A retenir
Pour Node.js, l'event loop lag est l'equivalent du load average pour un systeme Unix. Un lag superieur a 100ms signifie que votre application est saturee et que les requetes commencent a s'accumuler. Au-dela de 1 seconde, c'est une urgence.
:::

---

## Anti-patterns courants

### 1. Vanity metrics — les metriques flateuses mais inutiles

```typescript
// VANITY METRIC : nombre total de requetes depuis le debut
// "On a traite 50 millions de requetes !" — Et alors ?
// Ce nombre ne vous dit rien sur la sante actuelle du systeme.
// → Utilisez plutot le rate() pour connaitre le debit actuel.

// VANITY METRIC : temps de fonctionnement
// "99.99% d'uptime ce mois !" — Mais la latence etait de 30 secondes...
// → Utilisez des SLOs bases sur l'experience utilisateur (latence, erreurs).
```

### 2. Label explosion — trop de labels

```typescript
// MAUVAIS : user_id en label = millions de series
const badMetric = new Counter({
  name: 'requests_total',
  labelNames: ['method', 'route', 'user_id', 'session_id'] as const,
});

// BON : identifier les dimensions a cardinalite bornee
const goodMetric = new Counter({
  name: 'requests_total',
  labelNames: ['method', 'route', 'status_code'] as const,
});
// Les user_id et session_id vont dans les LOGS, pas dans les metriques
```

### 3. Metriques sans action

```typescript
// INUTILE : une metrique que personne ne regarde et qui ne declenche aucune alerte
const uselessMetric = new Gauge({
  name: 'some_internal_counter',
  help: 'Some internal state nobody cares about',
});

// PRINCIPE : chaque metrique doit repondre a au moins UNE de ces questions :
// - Est-ce que je peux creer une alerte dessus ?
// - Est-ce que ca m'aide a diagnostiquer un probleme ?
// - Est-ce que ca mesure une valeur metier importante ?
// Si la reponse est "non" aux trois → supprimez la metrique.
```

### 4. Moyennes sans percentiles

```typescript
// TROMPEUR : ne montrer que la moyenne
// rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])
// → La moyenne peut etre de 100ms alors que 1% des utilisateurs attendent 10s

// CORRECT : montrer p50, p95, p99
// histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
// histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
// histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

---

## Construire un dashboard mental

Pour chaque service, gardez en tete ces 5-10 metriques essentielles :

```typescript
// Les 10 metriques essentielles pour un service Node.js/Express

// RED (3 metriques orientees requetes)
// 1. rate(http_requests_total[5m])                    — Debit
// 2. sum(rate(http_errors_total[5m])) / sum(rate(...)) — Taux d'erreur
// 3. histogram_quantile(0.99, ... duration ...)        — Latence P99

// USE (4 metriques orientees ressources)
// 4. nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes  — Memoire
// 5. nodejs_eventloop_lag_seconds                                 — Event loop
// 6. db_pool_utilization_ratio                                    — Pool DB
// 7. nodejs_active_handles_total                                  — Handles

// Metier (3 metriques orientees business)
// 8.  rate(orders_created_total[5m])                  — Commandes/s
// 9.  rate(payment_amount_euros_total[5m])             — Revenu/s
// 10. active_users_current                             — Utilisateurs actifs
```

---

## Instrumenter la demo-app avec RED/USE

```typescript
// src/metrics/red-use.ts — Module complet RED + USE
import { Counter, Gauge, Histogram, Summary } from 'prom-client';

// =================== RED ===================

export const redRate = new Counter({
  name: 'red_requests_total',
  help: 'RED: Rate — nombre total de requetes',
  labelNames: ['service', 'method', 'route'] as const,
});

export const redErrors = new Counter({
  name: 'red_errors_total',
  help: 'RED: Errors — nombre total d erreurs',
  labelNames: ['service', 'method', 'route', 'error_type'] as const,
});

export const redDuration = new Histogram({
  name: 'red_duration_seconds',
  help: 'RED: Duration — distribution de la latence',
  labelNames: ['service', 'method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// =================== USE ===================

export const useUtilization = new Gauge({
  name: 'use_utilization_ratio',
  help: 'USE: Utilization — ratio d utilisation de la ressource',
  labelNames: ['resource'] as const,
});

export const useSaturation = new Gauge({
  name: 'use_saturation',
  help: 'USE: Saturation — travail en file d attente',
  labelNames: ['resource'] as const,
});

export const useErrors = new Counter({
  name: 'use_errors_total',
  help: 'USE: Errors — erreurs de la ressource',
  labelNames: ['resource', 'error_type'] as const,
});
```

### Fonctions utilitaires TypeScript

```typescript
// src/utils/metric-analysis.ts

interface PercentileResult {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  mean: number;
}

/**
 * Calcule les percentiles d'un ensemble de valeurs.
 * Utile pour l'analyse locale ou les tests.
 */
export function analyzeLatencies(values: number[]): PercentileResult {
  if (values.length === 0) {
    throw new Error('Cannot analyze empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);

  function percentile(p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    p50: percentile(0.50),
    p90: percentile(0.90),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1],
    min: sorted[0],
    mean: sum / sorted.length,
  };
}

/**
 * Calcule le taux d'erreur a partir de deux compteurs.
 */
export function errorRate(errors: number, total: number): number {
  if (total === 0) return 0;
  return (errors / total) * 100;
}

/**
 * Determine si un systeme est sature en fonction des seuils.
 */
export function isSaturated(
  eventLoopLagMs: number,
  heapUsageRatio: number,
  thresholds = { lagMs: 100, heapRatio: 0.85 }
): { saturated: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (eventLoopLagMs > thresholds.lagMs) {
    reasons.push(`Event loop lag (${eventLoopLagMs}ms) exceeds ${thresholds.lagMs}ms`);
  }

  if (heapUsageRatio > thresholds.heapRatio) {
    reasons.push(`Heap usage (${(heapUsageRatio * 100).toFixed(1)}%) exceeds ${thresholds.heapRatio * 100}%`);
  }

  return { saturated: reasons.length > 0, reasons };
}
```

```typescript
// Exemple d'utilisation dans un health check enrichi
import { analyzeLatencies, isSaturated } from './utils/metric-analysis';

app.get('/health/detailed', (_req, res) => {
  const mem = process.memoryUsage();
  const heapRatio = mem.heapUsed / mem.heapTotal;

  // Verifier la saturation
  const saturation = isSaturated(
    currentEventLoopLag,  // mis a jour periodiquement
    heapRatio
  );

  res.json({
    status: saturation.saturated ? 'degraded' : 'healthy',
    uptime: process.uptime(),
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      ratio: heapRatio,
    },
    saturation,
  });
});
```

---

## Bonnes pratiques

- **Commencez par RED** pour chaque service expose — c'est le minimum vital
- **Ajoutez USE** pour les ressources critiques (DB pool, event loop, memoire)
- **Preferez les percentiles** (p50, p95, p99) a la moyenne pour la latence
- **Limitez a 5-10 metriques cle** par service dans vos dashboards
- **Chaque metrique doit etre actionnable** : si vous ne savez pas quoi faire quand elle change, elle est inutile
- **Surveillez la cardinalite** : auditez regulierement le nombre de series temporelles
- **Documentez vos metriques** dans le code et dans un runbook
- **Testez vos metriques** : envoyez du trafic et verifiez que les valeurs correspondent

::: tip A retenir
RED pour les services, USE pour les ressources, Golden Signals pour la vue d'ensemble. Ces methodes ne sont pas en competition — elles sont complementaires. Ensemble, elles forment le vocabulaire universel de l'observabilite des metriques. Si vous ne savez pas par ou commencer, commencez par RED : Rate, Errors, Duration.
:::

---

## Prochaines etapes

- [Lab 06 — Implementer RED et USE dans la demo-app](/labs/lab-06-red-use-dashboard/README)
- [Quiz 06 — Methodes RED & USE](/quizzes/quiz-06-red-use-methodes)
- [Module suivant — Distributed Tracing & OpenTelemetry](/modules/07-distributed-tracing)

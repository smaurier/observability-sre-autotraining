# Introduction aux metriques (Counter, Gauge, Histogram)

## Objectifs pedagogiques

- Comprendre ce qu'est une metrique et pourquoi les metriques sont indispensables
- Maitriser les 4 types de metriques Prometheus (Counter, Gauge, Histogram, Summary)
- Apprehender les concepts de labels et de cardinalite
- Exposer un endpoint `/metrics` avec prom-client
- Appliquer les conventions de nommage Prometheus
- Savoir choisir le bon type de metrique pour chaque situation
- Instrumenter une application Express simple avec des metriques

---

## Qu'est-ce qu'une metrique ?

Une metrique est une **valeur numerique mesuree au fil du temps**. Contrairement aux logs qui decrivent des evenements individuels, les metriques donnent une vue agregee et quantitative du comportement d'un systeme.

```typescript
// Un log decrit UN evenement
logger.info({ orderId: 'ord-123', duration: 245 }, 'Order created');

// Une metrique agrega DES MILLIERS d'evenements
// "En moyenne, les commandes prennent 200ms a creer"
// "Il y a eu 1 500 commandes dans la derniere minute"
// "Le 99e percentile de latence est a 800ms"
```

Les metriques sont :
- **Peu couteuses** : un nombre prend quelques octets, un log prend des centaines
- **Pre-agregees** : pas besoin de scanner des millions de lignes
- **Ideales pour les alertes** : "si le taux d'erreur depasse 1%, alertez-moi"
- **Visuelles** : les graphiques de metriques donnent une comprehension immediate

---

## Les 4 types de metriques Prometheus

Prometheus definit 4 types fondamentaux. Chacun repond a un besoin precis.

### 1. Counter — Le compteur qui ne descend jamais

Un Counter est un compteur **monotone croissant**. Il ne peut qu'augmenter (ou etre remis a zero au redemarrage du processus).

```typescript
import { Counter } from 'prom-client';

// Nombre total de requetes HTTP recues
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requetes HTTP recues',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// Incrementer le compteur
httpRequestsTotal.inc({ method: 'GET', route: '/api/orders', status_code: '200' });

// Incrementer de plus de 1
httpRequestsTotal.inc({ method: 'POST', route: '/api/orders', status_code: '201' }, 1);
```

**Analogie** : Le compteur kilometrique (odometre) de votre voiture. Il augmente toujours, jamais il ne diminue. Pour connaitre la vitesse, vous calculez la **difference** entre deux releves divise par le temps : c'est exactement ce que fait la fonction `rate()` de PromQL.

**Cas d'usage** : nombre de requetes, nombre d'erreurs, nombre de commandes, octets envoyes/recus.

::: warning Attention
Ne regardez jamais la valeur brute d'un Counter — elle est peu informative. Utilisez toujours `rate()` ou `increase()` pour obtenir le taux de changement.
:::

### 2. Gauge — La jauge qui monte et descend

Un Gauge est une valeur qui peut **augmenter ET diminuer**. Il represente un etat instantane.

```typescript
import { Gauge } from 'prom-client';

// Nombre de requetes en cours de traitement
const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Nombre de requetes HTTP en cours de traitement',
});

// Incrementer quand une requete commence
httpRequestsInFlight.inc();

// Decrementer quand elle se termine
httpRequestsInFlight.dec();

// Definir une valeur absolue
const memoryUsage = new Gauge({
  name: 'nodejs_heap_used_bytes',
  help: 'Memoire heap utilisee en octets',
});
memoryUsage.set(process.memoryUsage().heapUsed);
```

**Analogie** : La jauge d'essence de votre voiture. Elle monte quand vous faites le plein, descend quand vous roulez. A chaque instant, elle reflate l'etat actuel.

**Cas d'usage** : temperature, utilisation memoire, requetes en cours, connexions actives, taille de file d'attente.

### 3. Histogram — La distribution des valeurs

Un Histogram observe des valeurs et les place dans des **buckets** (tranches). Il permet de calculer des percentiles et des moyennes.

```typescript
import { Histogram } from 'prom-client';

// Duree des requetes HTTP en secondes
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  // Les buckets definissent les tranches de mesure
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// Observer une duree
const end = httpRequestDuration.startTimer({ method: 'GET', route: '/api/orders' });
// ... traiter la requete ...
end(); // Enregistre automatiquement la duree ecoulee
```

**Analogie** : Imaginez un circuit automobile. A chaque tour, vous notez le temps. Apres 100 tours, vous voulez savoir : "Quel est le temps moyen ? 95% des tours se font en combien de temps ?" L'Histogram repond a ces questions grace aux buckets.

Les buckets fonctionnent comme des compteurs cumulatifs :

```typescript
// Si une requete prend 0.15 secondes, elle est comptee dans :
// le bucket 0.25 (car 0.15 <= 0.25)
// le bucket 0.5  (car 0.15 <= 0.5)
// le bucket 1    (car 0.15 <= 1)
// ... et tous les buckets superieurs

// Les metriques exposees :
// http_request_duration_seconds_bucket{le="0.005"} 0
// http_request_duration_seconds_bucket{le="0.01"} 0
// http_request_duration_seconds_bucket{le="0.025"} 0
// http_request_duration_seconds_bucket{le="0.05"} 0
// http_request_duration_seconds_bucket{le="0.1"} 0
// http_request_duration_seconds_bucket{le="0.25"} 1    ← comptee ici
// http_request_duration_seconds_bucket{le="0.5"} 1     ← et ici
// http_request_duration_seconds_bucket{le="+Inf"} 1    ← et ici (toujours)
// http_request_duration_seconds_sum 0.15               ← somme totale
// http_request_duration_seconds_count 1                ← nombre total
```

**Cas d'usage** : latence des requetes, taille des reponses, duree des jobs.

### 4. Summary — Le resume statistique

Le Summary est similaire a l'Histogram mais calcule les quantiles **cote client** (dans l'application) plutot que cote serveur (dans Prometheus).

```typescript
import { Summary } from 'prom-client';

const requestDurationSummary = new Summary({
  name: 'http_request_duration_summary_seconds',
  help: 'Resume des durees de requetes HTTP',
  labelNames: ['method'] as const,
  percentiles: [0.5, 0.9, 0.95, 0.99], // Medianne, p90, p95, p99
  maxAgeSeconds: 300,  // Fenetre glissante de 5 minutes
  ageBuckets: 5,
});

requestDurationSummary.observe({ method: 'GET' }, 0.15);
```

::: tip A retenir
Preferez l'Histogram au Summary dans la grande majorite des cas. L'Histogram est aggregeable entre instances (vous pouvez calculer le p99 global de 10 pods), le Summary ne l'est pas. Le Summary est utile uniquement quand vous avez besoin de percentiles exacts sur une seule instance.
:::

---

## Labels et cardinalite

Les labels (ou etiquettes) ajoutent des dimensions a une metrique. Ils permettent de filtrer et d'agreger.

```typescript
// Sans labels : une seule serie temporelle
const requestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes',
});
// Vous savez combien de requetes au total, mais pas de details

// Avec labels : plusieurs series temporelles
const requestsByMethod = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes',
  labelNames: ['method', 'route', 'status_code'] as const,
});
// Vous pouvez filtrer : combien de GET sur /api/orders avec un status 200 ?
```

### Le piege de la cardinalite

Chaque combinaison unique de labels cree une **serie temporelle** distincte en memoire.

```typescript
// BON : cardinalite maitrisee
// method (4) x route (10) x status_code (5) = 200 series
const goodMetric = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// DANGEREUX : cardinalite explosive
// Si user_id a 1 million de valeurs uniques...
// method (4) x route (10) x user_id (1M) = 40 millions de series !
const badMetric = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'user_id'] as const,
});
```

**Regle d'or** : ne mettez en label que des valeurs a **cardinalite bornee et faible** (methodes HTTP, codes de statut, noms de routes normalisees). Les identifiants d'utilisateurs, de commandes ou de sessions n'ont rien a faire dans les labels — ils vont dans les logs.

---

## Le endpoint /metrics

Prometheus fonctionne en **pull** : il vient chercher les metriques a intervalle regulier sur votre endpoint `/metrics`.

```typescript
import express from 'express';
import { register } from 'prom-client';

const app = express();

// Endpoint pour Prometheus
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});
```

Le format expose est du texte Prometheus :

```
# HELP http_requests_total Nombre total de requetes HTTP recues
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/orders",status_code="200"} 1542
http_requests_total{method="POST",route="/api/orders",status_code="201"} 89
http_requests_total{method="GET",route="/api/orders",status_code="500"} 3
```

---

## Conventions de nommage

Prometheus a des conventions strictes pour les noms de metriques :

```typescript
// Convention : <namespace>_<nom>_<unite>
// L'unite est toujours au pluriel et utilise les unites de base SI

// Durees en secondes (pas millisecondes !)
'http_request_duration_seconds'     // OK
'http_request_duration_ms'          // NON — utilisez les secondes

// Compteurs avec _total
'http_requests_total'               // OK
'http_requests'                     // NON — ajoutez _total

// Octets avec _bytes
'http_response_size_bytes'          // OK
'http_response_size_kb'             // NON — utilisez les octets

// Temperatures en celsius
'cpu_temperature_celsius'           // OK

// Ratios entre 0 et 1
'disk_usage_ratio'                  // OK (0.75 = 75%)
```

---

## Choisir le bon type de metrique

| Question a poser | Type | Exemple |
|-----------------|------|---------|
| "Combien au total ?" | Counter | Requetes, erreurs, octets |
| "Combien en ce moment ?" | Gauge | Connexions actives, temperature, memoire |
| "Quelle est la distribution ?" | Histogram | Latence, taille de reponse |
| "Quel est le percentile exact ?" | Summary | Latence (instance unique) |

```typescript
// Exercice mental : pour chaque situation, quel type ?

// "Nombre de commandes creees" → Counter (ne fait qu'augmenter)
// "Nombre d'articles dans le panier" → Gauge (monte et descend)
// "Temps de reponse de l'API" → Histogram (distribution)
// "Utilisation CPU" → Gauge (valeur instantanee)
// "Nombre d'emails envoyes" → Counter (ne fait qu'augmenter)
// "Taille de la file d'attente" → Gauge (monte et descend)
```

---

## Instrumentation d'une application Express

Voici comment instrumenter une application Express simple avec les 3 principaux types de metriques :

```typescript
// src/metrics.ts
import { Counter, Gauge, Histogram, register, collectDefaultMetrics } from 'prom-client';

// Collecter les metriques par defaut de Node.js
// (heap, event loop, GC, handles actifs, etc.)
collectDefaultMetrics({ prefix: 'demo_app_' });

// Counter : nombre total de requetes
export const httpRequestsTotal = new Counter({
  name: 'demo_app_http_requests_total',
  help: 'Nombre total de requetes HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// Gauge : requetes en cours
export const httpRequestsInFlight = new Gauge({
  name: 'demo_app_http_requests_in_flight',
  help: 'Nombre de requetes HTTP en cours',
});

// Histogram : duree des requetes
export const httpRequestDuration = new Histogram({
  name: 'demo_app_http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export { register };
```

```typescript
// src/middleware/metrics.ts
import { type Request, type Response, type NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestsInFlight,
  httpRequestDuration
} from '../metrics';

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Normaliser la route pour eviter une cardinalite explosive
  const route = normalizeRoute(req.route?.path || req.path);

  // Incrementer le gauge de requetes en cours
  httpRequestsInFlight.inc();

  // Demarrer le timer
  const stopTimer = httpRequestDuration.startTimer({
    method: req.method,
    route,
  });

  // Intercepter la fin de la requete
  res.on('finish', () => {
    httpRequestsInFlight.dec();
    stopTimer(); // Enregistre la duree dans l'histogram

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: String(res.statusCode),
    });
  });

  next();
}

function normalizeRoute(path: string): string {
  // Remplacer les IDs dynamiques par des placeholders
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}
```

---

## Bonnes pratiques

- **Nommez vos metriques avec des unites** : `_seconds`, `_bytes`, `_total`
- **Utilisez les unites de base** : secondes (pas millisecondes), octets (pas kilooctets)
- **Gardez la cardinalite sous controle** : maximum quelques centaines de series par metrique
- **Normalisez les routes** dans les labels pour eviter `/api/orders/123`, `/api/orders/456`...
- **Collectez les metriques par defaut** (`collectDefaultMetrics`) — elles sont gratuites et precieuses
- **Documentez chaque metrique** avec un `help` clair et descriptif
- **Preferez les Histograms aux Summaries** — ils sont aggregeables entre instances

::: tip A retenir
Les metriques sont le premier outil a mettre en place en observabilite. Elles sont peu couteuses, visuelles, et permettent des alertes efficaces. Retenez les 3 types principaux : **Counter** (ca augmente), **Gauge** (ca monte et descend), **Histogram** (la distribution).
:::

---

## Aller plus loin : concepts expert

### Le piege de la cardinalite — l'erreur n°1 en metriques

La cardinalite est le nombre de combinaisons uniques de labels pour une metrique. C'est le piege le plus frequent et le plus dangereux en production :

```typescript
// DANGER — cardinalite explosive
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status', 'userId'] as const, // userId !
});

// Avec 10 000 utilisateurs, 5 methodes, 20 routes, 5 status codes :
// 10 000 × 5 × 20 × 5 = 5 000 000 series temporelles
// Prometheus va mourir. Votre facture Datadog va exploser.
```

```typescript
// CORRECT — cardinalite controlee
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
});

// 5 × 20 × 5 = 500 series temporelles — parfaitement gerable
// Le userId, mettez-le dans les logs et les traces, PAS dans les labels
```

**Regle d'or** : un label de metrique doit avoir une cardinalite finie et petite (< 100 valeurs distinctes). Utilisez les logs pour le contexte haute cardinalite.

| Bon label | Mauvais label |
|-----------|---------------|
| `method` (GET, POST, PUT...) | `userId` (millions) |
| `status` (200, 404, 500...) | `requestId` (unique) |
| `service` (api, orders...) | `email` (PII + haute cardinalite) |
| `region` (eu-west, us-east...) | `timestamp` (infini) |

### Metriques custom vs metriques infrastructure

Le Google SRE Book (Chapitre 6, "Monitoring Distributed Systems") distingue deux categories :

1. **Metriques d'infrastructure** : CPU, memoire, disque, reseau, event loop lag — fournies par `collectDefaultMetrics()` et le systeme
2. **Metriques metier** : commandes creees, paiements echoues, articles en stock, utilisateurs actifs — vous devez les definir

Les equipes debutantes ne mesurent que l'infrastructure. Les equipes expertes mesurent le **comportement metier** — c'est la difference entre savoir que le CPU est a 80% et savoir que les commandes echouent.

```typescript
// Metriques metier — ce que le SRE Book appelle "symptom-based monitoring"
const ordersCreated = new Counter({
  name: 'orders_created_total',
  help: 'Total orders created',
  labelNames: ['status', 'payment_method'] as const,
});

const cartAbandonRate = new Gauge({
  name: 'cart_abandon_rate_percent',
  help: 'Current cart abandonment rate',
});

const orderValueDistribution = new Histogram({
  name: 'order_value_euros',
  help: 'Distribution of order values in euros',
  buckets: [10, 25, 50, 100, 250, 500, 1000],
});
```

::: tip Reference SRE
Le Google SRE Book, Chapitre 6 ("Monitoring Distributed Systems"), introduit les **Golden Signals** : Latency, Traffic, Errors, Saturation. Ces 4 signaux sont les metriques minimales pour comprendre la sante de tout service. Nous les approfondirons dans le module 06 (RED & USE).
:::

---

::: warning Avant de passer à la Phase 2
Si vous ne l'avez pas encore fait, complétez le **[Lab Docker — Lancer la stack](/labs/lab-20-docker-integration/README)** pour installer Prometheus, Grafana et Jaeger. Les modules suivants supposent que vous avez un environnement Docker fonctionnel.
:::

## Prochaines etapes

- [Lab 04 — Ajouter des metriques a la demo-app](/labs/lab-04-metriques-fondamentales/README)
- [Quiz 04 — Introduction aux metriques](/quizzes/quiz-04-introduction-metriques)
- [Module suivant — Metriques avec prom-client & Prometheus](/modules/05-metriques-prometheus)

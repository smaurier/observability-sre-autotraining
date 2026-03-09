# Metriques avec prom-client & Prometheus

## Objectifs pedagogiques

- Maitriser prom-client en profondeur (defaultMetrics, registries personnalises)
- Instrumenter Express de maniere complete (HTTP duration, request counter, error counter, in-flight gauge)
- Choisir les bons buckets pour les histogrammes de latence
- Creer des metriques metier (orders_created_total, payment_amount)
- Comprendre l'architecture pull de Prometheus
- Deployer Prometheus avec Docker Compose et configurer le scraping
- Explorer les metriques dans l'UI Prometheus
- Ecrire des requetes PromQL de base (rate, increase)
- Realiser une instrumentation complete de la demo-app

---

## prom-client en profondeur

### Metriques par defaut

prom-client fournit un ensemble de metriques Node.js collectees automatiquement. Elles couvrent la memoire, le garbage collector, l'event loop et les handles systeme.

```typescript
import { collectDefaultMetrics, register } from 'prom-client';

// Activer la collecte automatique
collectDefaultMetrics({
  prefix: 'demo_app_',      // Prefixe pour eviter les collisions
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Buckets pour le GC
});

// Metriques exposees automatiquement :
// demo_app_process_cpu_user_seconds_total     — temps CPU user
// demo_app_process_cpu_system_seconds_total   — temps CPU system
// demo_app_process_resident_memory_bytes      — memoire residente
// demo_app_nodejs_heap_size_total_bytes       — taille totale du heap
// demo_app_nodejs_heap_size_used_bytes        — heap utilise
// demo_app_nodejs_eventloop_lag_seconds       — latence de l'event loop
// demo_app_nodejs_active_handles_total        — handles actifs
// demo_app_nodejs_gc_duration_seconds         — duree des GC
```

### Registries personnalises

Le registry par defaut est global. Pour des cas avances (multi-tenancy, tests), vous pouvez creer des registries isoles :

```typescript
import { Registry, Counter } from 'prom-client';

// Registry personnalise
const customRegistry = new Registry();

const customCounter = new Counter({
  name: 'custom_requests_total',
  help: 'Requetes dans le registry custom',
  registers: [customRegistry], // Enregistre uniquement dans ce registry
});

// Exposer les metriques du registry custom
app.get('/metrics/custom', async (_req, res) => {
  res.set('Content-Type', customRegistry.contentType);
  res.end(await customRegistry.metrics());
});

// Fusionner plusieurs registries
const mergedRegistry = Registry.merge([register, customRegistry]);
```

### Reinitialiser les metriques (utile pour les tests)

```typescript
import { register } from 'prom-client';

// Dans vos tests, reinitialiser entre chaque test
afterEach(() => {
  register.clear();
});
```

---

## Instrumentation complete d'Express

Voici une instrumentation de reference couvrant les 4 dimensions essentielles : nombre de requetes, duree, erreurs, et requetes en cours.

### Le fichier de metriques

```typescript
// src/metrics/http-metrics.ts
import { Counter, Gauge, Histogram } from 'prom-client';

// 1. COUNTER — Nombre total de requetes
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requetes HTTP recues par le serveur',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// 2. HISTOGRAM — Distribution des durees de requetes
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Distribution de la duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// 3. COUNTER — Nombre d'erreurs HTTP (4xx et 5xx)
export const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Nombre total d erreurs HTTP (status >= 400)',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// 4. GAUGE — Requetes actuellement en cours de traitement
export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Nombre de requetes HTTP actuellement en cours de traitement',
});

// 5. HISTOGRAM — Taille des reponses
export const httpResponseSize = new Histogram({
  name: 'http_response_size_bytes',
  help: 'Taille des reponses HTTP en octets',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
});
```

### Le middleware de metriques

```typescript
// src/middleware/http-metrics.middleware.ts
import { type Request, type Response, type NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal,
  httpRequestsInFlight,
  httpResponseSize,
} from '../metrics/http-metrics';

export function httpMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const route = normalizeRoute(req);

  // Marquer le debut
  httpRequestsInFlight.inc();
  const stopTimer = httpRequestDuration.startTimer({ method: req.method, route });

  // Ecouter la fin de la reponse
  res.on('finish', () => {
    const statusCode = String(res.statusCode);

    // Arreter le timer (enregistre la duree)
    stopTimer();

    // Decrementer les requetes en cours
    httpRequestsInFlight.dec();

    // Incrementer le compteur total
    httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });

    // Compter les erreurs separement
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc({ method: req.method, route, status_code: statusCode });
    }

    // Taille de la reponse
    const contentLength = res.getHeader('content-length');
    if (contentLength) {
      httpResponseSize.observe(
        { method: req.method, route },
        Number(contentLength)
      );
    }
  });

  next();
}

function normalizeRoute(req: Request): string {
  // Utiliser le pattern de route Express si disponible
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }
  // Fallback : normaliser les IDs dans le path
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}
```

---

## Choix des buckets pour les histogrammes

Le choix des buckets est **critique** pour la precision des percentiles. Des buckets mal choisis donnent des resultats trompeurs.

```typescript
// ERREUR COURANTE : buckets lineaires
// [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
// Probleme : 90% du detail est entre 0-1s, rien au-dessus

// BONNE PRATIQUE : buckets exponentiels
// [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
// Plus de detail dans les petites valeurs (ou se trouvent la majorite des requetes)
// Couverture jusqu'a 10s pour les cas extremes

// POUR UNE API RAPIDE (< 100ms typique)
const fastApiBuckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1];

// POUR UN SERVICE AVEC DES APPELS EXTERNES (100ms - 5s)
const externalCallBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

// POUR DES JOBS BATCH (secondes a minutes)
const batchJobBuckets = [1, 5, 10, 30, 60, 120, 300, 600];
```

```typescript
// Helper pour generer des buckets exponentiels
function exponentialBuckets(start: number, factor: number, count: number): number[] {
  const buckets: number[] = [];
  let current = start;
  for (let i = 0; i < count; i++) {
    buckets.push(parseFloat(current.toPrecision(3)));
    current *= factor;
  }
  return buckets;
}

// Utilisation : 15 buckets de 0.001 a ~16 secondes (facteur 2)
const buckets = exponentialBuckets(0.001, 2, 15);
// [0.001, 0.002, 0.004, 0.008, 0.016, 0.032, 0.064, 0.128, 0.256, 0.512, 1.024, 2.048, 4.096, 8.192, 16.384]
```

---

## Metriques metier

Au-dela des metriques techniques (HTTP, memoire), les metriques **metier** sont essentielles pour comprendre l'impact reel sur vos utilisateurs.

```typescript
// src/metrics/business-metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

// Commandes creees
export const ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Nombre total de commandes creees',
  labelNames: ['status', 'payment_method'] as const,
});

// Montant des paiements traites
export const paymentAmountTotal = new Counter({
  name: 'payment_amount_euros_total',
  help: 'Montant total des paiements traites en euros',
  labelNames: ['payment_method', 'status'] as const,
});

// Distribution des montants de commande
export const orderAmountHistogram = new Histogram({
  name: 'order_amount_euros',
  help: 'Distribution des montants de commande en euros',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

// Utilisateurs actuellement connectes
export const activeUsersGauge = new Gauge({
  name: 'active_users_current',
  help: 'Nombre d utilisateurs actuellement connectes',
});

// Taille du panier
export const cartItemsHistogram = new Histogram({
  name: 'cart_items_count',
  help: 'Distribution du nombre d articles par panier',
  buckets: [1, 2, 3, 5, 10, 20, 50],
});
```

```typescript
// Utilisation dans le code metier
import { ordersCreatedTotal, paymentAmountTotal, orderAmountHistogram } from '../metrics/business-metrics';

async function createOrder(order: Order): Promise<void> {
  // ... logique de creation ...

  // Enregistrer les metriques metier
  ordersCreatedTotal.inc({
    status: 'success',
    payment_method: order.paymentMethod,
  });

  paymentAmountTotal.inc(
    { payment_method: order.paymentMethod, status: 'success' },
    order.totalAmount,
  );

  orderAmountHistogram.observe(order.totalAmount);
}
```

---

## Architecture pull de Prometheus

Prometheus utilise une architecture **pull** : c'est Prometheus qui vient chercher les metriques sur vos applications, pas vos applications qui les envoient.

```
┌─────────────────┐          GET /metrics         ┌──────────────────┐
│                  │ ──────────────────────────────→│                  │
│   Prometheus     │          toutes les 15s       │   Votre App      │
│   (scraper)      │ ←──────────────────────────────│   (target)       │
│                  │       metriques Prometheus     │   :3000/metrics  │
└─────────────────┘                                └──────────────────┘
       │
       │  Stockage local (TSDB)
       ▼
┌─────────────────┐
│  Prometheus TSDB │
│  (time-series    │
│   database)      │
└─────────────────┘
```

Avantages du pull :
- Prometheus sait quelles cibles sont **up** ou **down**
- Pas besoin de configurer chaque application pour savoir ou envoyer
- Le scraping peut etre ajuste sans modifier l'application
- Simplification du networking (pas de port ouvert cote Prometheus)

---

## Docker Compose avec Prometheus

```yaml
# docker-compose.yml
version: '3.8'

services:
  demo-app:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info

  prometheus:
    image: prom/prometheus:v2.50.0
    ports:
      - '9090:9090'
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=7d'
```

### Configuration du scraping

```yaml
# config/prometheus.yml
global:
  scrape_interval: 15s      # Frequence de collecte par defaut
  evaluation_interval: 15s  # Frequence d'evaluation des regles

scrape_configs:
  # Scraper Prometheus lui-meme (pour monitorer le moniteur)
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Scraper notre demo-app
  - job_name: 'demo-app'
    scrape_interval: 5s     # Plus frequent pour notre app
    metrics_path: '/metrics'
    static_configs:
      - targets: ['demo-app:3000']
        labels:
          environment: 'development'
          team: 'backend'
```

Lancez le tout :

```bash
docker compose up -d
```

---

## Explorer les metriques dans l'UI Prometheus

Accedez a `http://localhost:9090` pour ouvrir l'interface web de Prometheus.

### Verifier les targets

Dans **Status → Targets**, vous devez voir votre `demo-app` avec l'etat **UP**. Si c'est **DOWN**, verifiez que votre endpoint `/metrics` est accessible.

### Premiere requete

Dans l'onglet **Graph**, entrez :

```
http_requests_total
```

Vous verrez toutes les series temporelles correspondantes avec leurs labels.

### Visualiser l'evolution

Passez en mode **Graph** (plutot que Table) et selectionnez une plage de temps (15m, 1h, etc.) pour voir l'evolution des valeurs.

---

## PromQL de base

PromQL est le langage de requete de Prometheus. Voici les operations fondamentales.

### rate() — Le taux de changement par seconde

`rate()` est **la** fonction la plus importante de PromQL. Elle calcule le taux de changement moyen d'un counter sur une fenetre de temps.

```
# Requetes par seconde, moyennees sur les 5 dernieres minutes
rate(http_requests_total[5m])

# Requetes par seconde par route
rate(http_requests_total{route="/api/orders"}[5m])

# Taux d'erreur
rate(http_errors_total[5m])
```

```typescript
// Analogie TypeScript pour comprendre rate()
function rate(values: number[], windowSeconds: number): number {
  // rate = (derniere_valeur - premiere_valeur) / duree_fenetre
  const first = values[0];
  const last = values[values.length - 1];
  return (last - first) / windowSeconds;
}

// Si http_requests_total passe de 1000 a 1300 en 300 secondes (5 min)
// rate = (1300 - 1000) / 300 = 1 requete/seconde
```

### increase() — L'augmentation absolue

```
# Nombre de requetes dans les 5 dernieres minutes
increase(http_requests_total[5m])

# Nombre d'erreurs dans la derniere heure
increase(http_errors_total[1h])
```

### histogram_quantile() — Les percentiles

```
# 99e percentile de latence
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# 95e percentile de latence par route
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))

# Latence mediane (p50)
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))
```

### Operateurs d'agregation

```
# Somme de toutes les requetes par seconde
sum(rate(http_requests_total[5m]))

# Requetes par seconde groupees par status_code
sum by (status_code) (rate(http_requests_total[5m]))

# Taux d'erreur en pourcentage
sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100
```

---

## Instrumentation complete de la demo-app

Voici l'integration finale qui rassemble tout ce que nous avons vu :

```typescript
// demo-app/index.ts — version instrumentee
import express from 'express';
import { collectDefaultMetrics, register } from 'prom-client';
import { httpMetricsMiddleware } from './middleware/http-metrics.middleware';
import { ordersCreatedTotal, paymentAmountTotal } from './metrics/business-metrics';
import logger from './logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Collecter les metriques Node.js par defaut
collectDefaultMetrics({ prefix: 'demo_app_' });

// Middleware
app.use(express.json());
app.use(httpMetricsMiddleware);

// Endpoint metriques (pas de middleware de metriques sur lui-meme)
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate metrics');
    res.status(500).end();
  }
});

// Routes de l'application
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/orders', async (_req, res) => {
  const delay = Math.random() * 200;
  await new Promise((resolve) => setTimeout(resolve, delay));
  res.json({ orders: [], count: 0 });
});

app.post('/api/orders', (req, res) => {
  const { item, amount, paymentMethod } = req.body;

  // Metriques metier
  ordersCreatedTotal.inc({ status: 'success', payment_method: paymentMethod || 'card' });
  if (amount) {
    paymentAmountTotal.inc(
      { payment_method: paymentMethod || 'card', status: 'success' },
      amount
    );
  }

  res.status(201).json({ id: `order-${Date.now()}`, item, amount });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Demo app started with full instrumentation');
});
```

---

## Bonnes pratiques

- **Activez toujours `collectDefaultMetrics`** — les metriques Node.js (heap, event loop, GC) sont gratuites et precieuses
- **Choisissez des buckets adaptes a votre service** — pas de taille unique
- **Separarez metriques techniques et metier** dans des fichiers distincts
- **Utilisez un prefix** pour eviter les collisions entre services
- **Testez vos metriques** : verifiez que `/metrics` retourne bien les donnees attendues
- **Documentez chaque metrique** avec un `help` explicite
- **Ne mettez pas le middleware metriques sur l'endpoint `/metrics`** lui-meme (boucle infinie de donnees)
- **Normalisez les routes** dans les labels pour eviter l'explosion de cardinalite
- **Configurez le `scrape_interval` de Prometheus** en fonction de vos besoins (15s par defaut, 5s pour du debugging)

::: tip A retenir
Prometheus et prom-client forment la base de votre pipeline de metriques. L'architecture pull simplifie le deploiement : votre app expose `/metrics`, Prometheus vient les chercher. Les 4 fonctions PromQL indispensables sont `rate()`, `increase()`, `histogram_quantile()`, et `sum by()`.
:::

::: warning Attention
En production, securisez votre endpoint `/metrics` ! Il ne doit pas etre accessible publiquement. Utilisez un port interne separe ou une authentification. Les metriques peuvent reveler des informations sensibles sur votre infrastructure.
:::

---

## Prochaines etapes

- [Lab 05 — Deployer Prometheus et instrumenter la demo-app](/labs/lab-05-instrumenter-express/README)
- [Quiz 05 — prom-client & Prometheus](/quizzes/quiz-05-metriques-prometheus)
- [Module suivant — Methodes RED & USE](/modules/06-red-use-methodes)

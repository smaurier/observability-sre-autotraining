# Module 04 — Métriques et Prometheus

> **Durée estimée** : 4h00
> **Difficulté** : 3/5
> **Prérequis** : Module 02 (Logging structuré), Module 03 (Niveaux de log)
> **Objectifs** :
> - Comprendre les types de métriques (counter, gauge, histogram, summary)
> - Instrumenter une application Node.js avec prom-client
> - Configurer Prometheus pour le scraping
> - Écrire des requêtes PromQL de base
> - Mettre en place des dashboards Grafana

---

## 1. Pourquoi les métriques ?

Les logs racontent **ce qui s'est passé**. Les métriques racontent **comment le système se comporte dans le temps**.

```
Logs → "La requête POST /api/users a échoué avec 500 à 14:32:05"
Métriques → "Le taux d'erreur 5xx est passé de 0.1% à 12% en 5 minutes"
```

Les métriques permettent de :
- **Détecter** les anomalies avant que les utilisateurs ne se plaignent
- **Alerter** sur des seuils (SLO breach, error budget burn)
- **Dimensionner** l'infrastructure (capacity planning)
- **Comparer** les performances avant/après un déploiement

---

## 2. Les quatre types de métriques

### 2.1. Counter

Valeur qui ne fait qu'augmenter (ou se reset à 0 au redémarrage).

```typescript
import { Counter } from 'prom-client';

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total des requêtes HTTP',
  labelNames: ['method', 'status', 'route'],
});

// Chaque requête incrémente le compteur
httpRequests.inc({ method: 'GET', status: '200', route: '/api/users' });
```

**Cas d'usage** : nombre de requêtes, nombre d'erreurs, bytes transférés.

### 2.2. Gauge

Valeur qui monte et descend (mesure instantanée).

```typescript
import { Gauge } from 'prom-client';

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Nombre de connexions actives',
});

activeConnections.inc();  // +1
activeConnections.dec();  // -1
activeConnections.set(42); // valeur absolue
```

**Cas d'usage** : connexions actives, mémoire utilisée, taille de queue, température.

### 2.3. Histogram

Distribution de valeurs dans des buckets prédéfinis.

```typescript
import { Histogram } from 'prom-client';

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Mesurer la durée
const end = requestDuration.startTimer({ method: 'GET', route: '/api/users' });
// ... traitement ...
end(); // enregistre automatiquement la durée
```

**Cas d'usage** : latence, taille des réponses, durée des jobs.

### 2.4. Summary

Similaire à l'histogram mais calcule les quantiles côté client.

```typescript
import { Summary } from 'prom-client';

const requestSummary = new Summary({
  name: 'http_request_duration_summary',
  help: 'Résumé des durées de requêtes',
  percentiles: [0.5, 0.9, 0.99],
});
```

**Histogram vs Summary** : préférer l'histogram — il est agrégeable côté serveur (Prometheus) et plus flexible pour les alertes.

---

## 3. Prometheus — Architecture

```
App Node.js ──expose──> /metrics (port 9090)
                              ↑
Prometheus ──scrape──────────┘
     │
     └──> Stockage TSDB (time series)
              │
              └──> Grafana (visualisation)
              └──> Alertmanager (alertes)
```

### Configuration minimale (prometheus.yml)

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node-app'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Exposer les métriques dans Express/Fastify

```typescript
import express from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics(); // CPU, mémoire, event loop, GC

const app = express();

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## 4. PromQL — Requêtes essentielles

### Taux de requêtes par seconde

```promql
rate(http_requests_total[5m])
```

### Taux d'erreur (%)

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100
```

### Latence P99

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### Top 5 des routes les plus lentes

```promql
topk(5, avg by (route) (rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])))
```

---

## 5. Labels et cardinalité

Les labels ajoutent des dimensions aux métriques :

```typescript
httpRequests.inc({ method: 'GET', status: '200', route: '/api/users' });
```

**Attention à la cardinalité !** Chaque combinaison unique de labels crée une time series. Éviter :
- Les IDs utilisateur comme labels (cardinalité infinie)
- Les URLs avec paramètres dynamiques (`/users/123` → utiliser `/users/:id`)
- Plus de 5-6 labels par métrique

Règle : si un label peut prendre plus de ~100 valeurs distinctes, c'est un **anti-pattern**.

---

## 6. Métriques par défaut de prom-client

`collectDefaultMetrics()` expose automatiquement :

| Métrique | Type | Description |
|----------|------|-------------|
| `process_cpu_user_seconds_total` | Counter | CPU utilisateur |
| `process_resident_memory_bytes` | Gauge | Mémoire RSS |
| `nodejs_eventloop_lag_seconds` | Gauge | Lag de l'event loop |
| `nodejs_active_handles_total` | Gauge | Handles actifs (sockets, timers) |
| `nodejs_gc_duration_seconds` | Histogram | Durée du GC |

---

## 7. Bonnes pratiques

1. **Nommage** : `<namespace>_<nom>_<unité>` (ex: `http_request_duration_seconds`)
2. **Unités** : toujours en unités de base (secondes, bytes, pas ms ou KB)
3. **Labels** : garder la cardinalité basse, utiliser des valeurs enum
4. **Histogram buckets** : adapter aux SLO (si SLO = 200ms, avoir des buckets à 0.1, 0.2, 0.5)
5. **Scrape interval** : 15s est le standard, 5s pour le debug

---

## 8. Récapitulatif

- **Counter** pour ce qui s'accumule, **Gauge** pour les instantanés, **Histogram** pour les distributions
- Prometheus **pull** les métriques (scrape), il ne les reçoit pas en push
- PromQL est le langage de requête — `rate()`, `histogram_quantile()`, `sum by ()`
- La cardinalité des labels est le piège #1 en production
- `prom-client` + `collectDefaultMetrics()` = observabilité Node.js en 5 minutes

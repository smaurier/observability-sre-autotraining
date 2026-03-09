# Screencast 04 — Introduction aux metriques

## Informations
- **Duree estimee** : 15-18 min
- **Module** : `modules/04-introduction-metriques.md`
- **Lab associe** : Lab 04
- **Prerequis** : Screencast 03

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] demo-app prete a etre lancee
- [ ] Fichier `demo-app/src/lib/metrics.ts` ouvert
- [ ] Fichier `demo-app/src/middleware/metrics.ts` ouvert
- [ ] Navigateur ouvert pret a afficher `http://localhost:3000/metrics`

## Script

### [00:00-01:30] Introduction

> Nous avons couvert le premier pilier — les logs. Aujourd'hui, nous attaquons le deuxieme pilier : les metriques. Les metriques sont des valeurs numeriques agregees dans le temps. Elles sont peu couteuses, visuelles, et ideales pour les alertes. Nous allons comprendre les 4 types de metriques Prometheus et les implementer avec prom-client.

### [01:30-04:00] Counter, Gauge, Histogram — les analogies

> Commencons par comprendre intuitivement chaque type avec des analogies du monde reel.

**Action** : Ecrire les analogies dans un fichier scratch ou les commenter.

```typescript
// COUNTER — Le compteur kilometrique (odometre)
// Il augmente toujours, jamais il ne diminue.
// Pour connaitre la vitesse, on calcule la DIFFERENCE entre deux releves.
// → Nombre de requetes, nombre d'erreurs, octets envoyes

// GAUGE — La jauge d'essence
// Elle monte quand vous faites le plein, descend quand vous roulez.
// A chaque instant, elle reflete l'etat ACTUEL.
// → Temperature, memoire utilisee, connexions actives, file d'attente

// HISTOGRAM — Le chronometre de circuit
// A chaque tour, vous notez le temps.
// Apres 100 tours, vous voulez le temps moyen, le p95, le p99.
// → Latence des requetes, taille des reponses, duree des jobs

// SUMMARY — Similaire a l'Histogram mais calcule les quantiles cote client
// Preferez l'Histogram dans 95% des cas (il est aggregeable entre instances)
```

> Le Counter ne fait qu'augmenter. Le Gauge monte et descend. L'Histogram donne la distribution. Retenez ces trois-la et vous couvrez 95% des besoins.

### [04:00-07:00] Implementer avec prom-client

> Passons a l'implementation concrete.

**Action** : Ouvrir `demo-app/src/lib/metrics.ts`.

```typescript
// demo-app/src/lib/metrics.ts
import { Counter, Gauge, Histogram, register, collectDefaultMetrics } from 'prom-client';

// Collecter les metriques Node.js automatiquement
collectDefaultMetrics({ prefix: 'demo_app_' });

// COUNTER — Nombre total de requetes
export const httpRequestsTotal = new Counter({
  name: 'demo_app_http_requests_total',
  help: 'Nombre total de requetes HTTP',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// GAUGE — Requetes en cours de traitement
export const httpRequestsInFlight = new Gauge({
  name: 'demo_app_http_requests_in_flight',
  help: 'Nombre de requetes HTTP en cours',
});

// HISTOGRAM — Distribution des durees de requetes
export const httpRequestDuration = new Histogram({
  name: 'demo_app_http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export { register };
```

> Plusieurs points cles ici. `collectDefaultMetrics` ajoute automatiquement les metriques Node.js : heap, event loop, garbage collector. Gratuit et precieux. Le prefix `demo_app_` evite les collisions avec d'autres services.

> Les labels ajoutent des dimensions. `method`, `route` et `status_code` permettent de filtrer et d'agreger. Mais attention a la cardinalite — chaque combinaison cree une serie temporelle.

### [07:00-09:30] Le middleware de metriques

**Action** : Ouvrir `demo-app/src/middleware/metrics.ts`.

```typescript
// demo-app/src/middleware/metrics.ts
import { type Request, type Response, type NextFunction } from 'express';
import {
  httpRequestsTotal,
  httpRequestsInFlight,
  httpRequestDuration
} from '../lib/metrics.ts';

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const route = normalizeRoute(req.path);

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
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/\/\d+/g, '/:id');
}
```

> Le middleware fait trois choses. A l'arrivee de la requete, il incremente le gauge et demarre le timer. A la fin de la requete, il decremente le gauge, arrete le timer, et incremente le counter avec les labels.

> La fonction `normalizeRoute` est cruciale : elle remplace les IDs dynamiques par `:id` pour eviter une explosion de cardinalite. Sans ca, `/api/orders/123`, `/api/orders/456` et `/api/orders/789` seraient trois routes differentes.

### [09:30-12:30] Demo live — Observer les metriques

**Action** : Lancer la demo-app.

```bash
npx tsx demo-app/src/index.ts
```

**Action** : Envoyer des requetes.

```bash
# Quelques requetes normales
curl http://localhost:3000/health
curl http://localhost:3000/api/products
curl http://localhost:3000/api/orders
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item":"laptop","quantity":2}'
```

**Action** : Ouvrir le endpoint /metrics dans le navigateur ou curl.

```bash
curl http://localhost:3000/metrics
```

> Regardez la sortie. Vous voyez nos trois metriques personnalisees plus toutes les metriques par defaut de Node.js.

**Action** : Pointer les elements cles dans la sortie /metrics.

```
# HELP demo_app_http_requests_total Nombre total de requetes HTTP
# TYPE demo_app_http_requests_total counter
demo_app_http_requests_total{method="GET",route="/health",status_code="200"} 1
demo_app_http_requests_total{method="GET",route="/api/products",status_code="200"} 1
demo_app_http_requests_total{method="GET",route="/api/orders",status_code="200"} 1
demo_app_http_requests_total{method="POST",route="/api/orders",status_code="201"} 1

# HELP demo_app_http_request_duration_seconds Duree des requetes HTTP en secondes
# TYPE demo_app_http_request_duration_seconds histogram
demo_app_http_request_duration_seconds_bucket{method="GET",route="/health",le="0.005"} 1
demo_app_http_request_duration_seconds_bucket{method="GET",route="/health",le="0.01"} 1
...
demo_app_http_request_duration_seconds_sum{method="GET",route="/health"} 0.002
demo_app_http_request_duration_seconds_count{method="GET",route="/health"} 1
```

> Le counter montre le nombre total de requetes par combinaison method/route/status_code. L'histogram montre les buckets cumulatifs — pour la route /health, la requete a pris 2ms, donc elle est comptee dans les buckets 0.005, 0.01 et tous les suivants.

### [12:30-14:30] Envoyer du trafic et observer les changements

**Action** : Envoyer beaucoup de requetes et re-consulter les metriques.

```bash
# Envoyer 20 requetes rapides
for i in $(seq 1 20); do
  curl -s http://localhost:3000/api/orders > /dev/null
done
```

**Action** : Re-consulter /metrics.

```bash
curl http://localhost:3000/metrics 2>/dev/null | grep demo_app_http_requests_total
```

> Les compteurs ont augmente. C'est exactement ce que Prometheus viendra scraper toutes les 15 secondes. La valeur brute du counter n'est pas tres informative — c'est la fonction rate() de PromQL qui calculera le taux de changement par seconde.

### [14:30-16:30] Conventions de nommage

> Prometheus a des conventions strictes. Respectez-les.

**Action** : Montrer les regles.

```typescript
// Convention : <namespace>_<nom>_<unite>

// Durees en SECONDES (pas millisecondes)
'http_request_duration_seconds'     // OK
'http_request_duration_ms'          // NON

// Compteurs avec _total
'http_requests_total'               // OK
'http_requests'                     // NON

// Octets avec _bytes
'http_response_size_bytes'          // OK
'http_response_size_kb'             // NON

// Toujours documenter avec un help explicite
new Counter({
  name: 'demo_app_http_requests_total',
  help: 'Nombre total de requetes HTTP recues par le serveur',
  // ...
});
```

### [16:30-17:30] Recapitulatif

> Recapitulons. Les metriques sont le deuxieme pilier de l'observabilite. Counter pour "combien au total", Gauge pour "combien en ce moment", Histogram pour "quelle distribution". Les labels ajoutent des dimensions mais attention a la cardinalite. Le endpoint /metrics expose tout en format Prometheus.

> Dans le prochain module, nous lancerons Prometheus avec Docker Compose et ecrirons nos premieres requetes PromQL. Faites le Lab 04 !

**Action** : Arreter la demo-app.

## Points d'attention pour l'enregistrement
- Les analogies (odometre, jauge d'essence, chronometre) sont tres pedagogiques — prendre le temps
- Montrer le endpoint /metrics en live — c'est un moment "wow" pour les apprenants
- Insister sur normalizeRoute et le probleme de cardinalite
- Montrer les metriques qui changent apres l'envoi de trafic
- Ne pas oublier les conventions de nommage Prometheus — elles seront utilisees tout au long du cours
- Le startTimer/stopTimer de l'Histogram est un pattern a bien expliquer

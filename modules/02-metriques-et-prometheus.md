---
titre: Métriques et Prometheus
cours: 16-observability-sre
notions: ["counter / gauge / histogram / summary", "modèle pull / scrape", "exposition /metrics", "labels & cardinalité", "PromQL de base (rate, sum by, quantile)", "prom-client", "histogram_quantile & label le", "rate vs irate"]
outcomes:
  - sait choisir le bon type de métrique (counter, gauge, histogram, summary) selon la grandeur mesurée
  - sait instrumenter une API Node avec prom-client et exposer un endpoint /metrics scrapé par Prometheus
  - sait écrire les PromQL de base — rate(), sum by(), histogram_quantile() — sans les deviner
  - sait diagnostiquer une explosion de cardinalité de labels
prerequis: ["module 00 — 3 piliers logs/metrics/traces", "module 01 — logging structuré (contexte, corrélation)"]
next: 03-red-use-methodes
libs: []
tribuzen: instrumentation de l'API TribuZen — compteur de requêtes, latence des endpoints famille/RSVP, gauge des connexions actives, scrape Prometheus
last-reviewed: 2026-07
---

# Métriques et Prometheus

> **Outcomes — tu sauras FAIRE :** choisir counter/gauge/histogram/summary, instrumenter l'API TribuZen avec `prom-client` et exposer `/metrics`, écrire les PromQL de base (`rate`, `sum by`, `histogram_quantile`), repérer une bombe de cardinalité.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **Prometheus + les bases de PromQL**. Les *méthodes* d'interprétation (RED, USE, 4 signaux dorés) sont le **module 03**. Les **dashboards Grafana** et le PromQL avancé (vector matching, subqueries) sont au **module 07 (grafana-dashboards)**. Les **alerting rules** (`for`, `$value`, Alertmanager) et les **recording rules** sont au **module 09 (alerting-strategies)**. On reste ici sur : produire des métriques correctes et les interroger.

## 1. Cas concret d'abord

Vendredi soir, un parent poste dans le canal support TribuZen : « je clique sur *Confirmer ma présence* et ça tourne dans le vide ». Tu ouvres les logs (module 01) : tu vois bien la requête `POST /api/events/:id/rsvp`, elle finit en `200`... parfois. Impossible de savoir **combien** de RSVP échouent, ni **à quelle vitesse** l'endpoint répond. Les logs racontent des évènements isolés ; ils ne te disent pas la **forme du système dans le temps**.

Ce qu'il te manque, ce sont des **métriques** :

```
Log      → "POST /api/events/42/rsvp a répondu 200 en 3400 ms à 21:03:11"   (un évènement)
Métrique → "le p99 de latence de /rsvp est passé de 120 ms à 3.2 s en 10 min" (une tendance)
```

À la fin de ce module, l'API TribuZen exposera un endpoint `/metrics`, un Prometheus la scrapera toutes les 15 s, et cette PromQL te dira instantanément si `/rsvp` souffre :

```promql
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp"}[5m]))
)
```

On construit chaque brique pour y arriver — sans deviner une seule fonction PromQL.

---

## 2. Théorie complète, concise

### 2.1 Une métrique = une série temporelle

Une **métrique** Prometheus est une série temporelle : un nom, un jeu de labels, et une suite de `(timestamp, valeur float64)`. Le nom porte l'unité en base SI (`_seconds`, `_bytes`), jamais `_ms` ni `_KB`.

```
http_requests_total{method="POST", route="/api/events/:id/rsvp", status="200"}  →  1_284
└── nom (avec suffixe _total) ──┘ └────────── labels ──────────────────────┘      └ valeur
```

Chaque **combinaison unique de labels** crée une série distincte. Retiens cette phrase — c'est le fil rouge de tout le module.

### 2.2 Les quatre types de métriques

Source : docs Prometheus, *Metric types*.

**Counter** — valeur cumulée qui ne fait que **monter** (ou revenir à 0 au redémarrage du process). On ne lit jamais un counter brut : on lit sa **dérivée** avec `rate()`.

```ts
import { Counter } from 'prom-client'

const httpRequests = new Counter({
  name: 'http_requests_total',        // convention : suffixe _total
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
})

httpRequests.inc({ method: 'POST', route: '/api/events/:id/rsvp', status: '200' })
```

Usage : nombre de requêtes, d'erreurs, de RSVP confirmés, d'octets envoyés.

**Gauge** — valeur instantanée qui **monte et descend**.

```ts
import { Gauge } from 'prom-client'

const activeConnections = new Gauge({
  name: 'tribuzen_active_connections',
  help: 'Connexions WebSocket ouvertes',
})

activeConnections.inc()    // +1 à la connexion
activeConnections.dec()    // -1 à la déconnexion
activeConnections.set(42)  // valeur absolue
```

Usage : connexions ouvertes, mémoire utilisée, taille d'une file, familles actives *maintenant*.

**Histogram** — répartit les observations dans des **buckets cumulatifs** définis à l'avance. C'est LE type pour la latence. À l'exposition, un histogram nommé `x` produit **trois** familles de séries (vérifié docs Prometheus) :

- `x_bucket{le="0.1"}` — compteur cumulatif des observations `≤ 0.1` (le label `le` = *less than or equal*, borne haute **inclusive**) ;
- `x_sum` — somme de toutes les valeurs observées ;
- `x_count` — nombre total d'observations.

```ts
import { Histogram } from 'prom-client'

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route'],
  // buckets en SECONDES, calés sur les seuils qui t'intéressent
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
})

const end = requestDuration.startTimer({ method: 'POST', route: '/api/events/:id/rsvp' })
// ... traitement de la requête ...
end() // observe la durée écoulée, en secondes, dans le bon bucket
```

Les quantiles (p95, p99) se calculent **côté serveur** en PromQL via `histogram_quantile()` (§2.6).

**Summary** — comme l'histogram, mais les quantiles sont calculés **côté client** (dans le process Node) et exposés directement `x{quantile="0.99"}`.

```ts
import { Summary } from 'prom-client'

const jobDuration = new Summary({
  name: 'tribuzen_email_send_duration_seconds',
  help: 'Durée d’envoi des e-mails d’invitation',
  percentiles: [0.5, 0.9, 0.99],
})
```

**Histogram vs Summary (à connaître) :** un summary calcule ses quantiles côté client sur une fenêtre glissante — ils sont **précis mais NON agrégeables** entre instances (on ne peut pas moyenner des p99). Un histogram expose des buckets **agrégeables** entre instances et routes ; on choisit le quantile *après coup* en PromQL. **Défaut recommandé : histogram.** Summary seulement si tu veux un quantile exact sur une seule instance et que les buckets te gênent.

### 2.3 Le modèle pull (scrape)

Différence structurante avec beaucoup d'outils : Prometheus **ne reçoit pas** les métriques en push. Il va les **chercher** (pull / *scrape*) en interrogeant périodiquement un endpoint HTTP `/metrics` sur chaque cible.

```
API TribuZen  ──expose──►  GET /metrics  (texte brut)
                               ▲
Prometheus  ──scrape toutes les 15 s──┘
     │
     └─► TSDB (stockage des séries temporelles)
```

Conséquences pratiques :
- ta cible doit **rester joignable** ; Prometheus expose automatiquement `up{job="..."}` (1 = scrape réussi, 0 = cible injoignable) ;
- une métrique est un **état courant** relu à chaque scrape, pas un flux d'évènements — un pic plus court que le `scrape_interval` peut passer inaperçu ;
- pour les process courts (jobs, lambdas) qui meurent avant d'être scrapés, on utilise un *Pushgateway* (hors périmètre ici).

### 2.4 Exposer `/metrics` avec prom-client

`prom-client` (v15, `siimon/prom-client`) tient un **registre** global. `collectDefaultMetrics()` y ajoute gratuitement les métriques du process (CPU, RSS, lag d'event loop, GC). On sert le registre en texte sur `/metrics`.

```ts
import express from 'express'
import { register, collectDefaultMetrics } from 'prom-client'

collectDefaultMetrics() // process_*, nodejs_* — offert

const app = express()

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType) // type MIME exact attendu par Prometheus
  res.end(await register.metrics())             // metrics() est ASYNC → retourne une Promise
})
```

Deux points qui coûtent des heures si on les rate :
- `register.metrics()` est **asynchrone** (`await`) — oublier le `await` renvoie `[object Promise]` ;
- `res.set('Content-Type', register.contentType)` est obligatoire, sinon Prometheus refuse le format.

Côté Prometheus, la cible se déclare dans `prometheus.yml` :

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'tribuzen-api'
    static_configs:
      - targets: ['api:3000']   # host:port de l'API
    metrics_path: '/metrics'    # valeur par défaut, explicite ici pour la clarté
```

### 2.5 PromQL — les briques de base

Source : docs Prometheus, *Querying basics* & *Functions*.

**Sélecteur instantané** → une valeur par série, au dernier instant :

```promql
http_requests_total{route="/api/events/:id/rsvp", status="200"}
```

Les **matchers de labels** : `=` (égal), `!=` (différent), `=~` (regex), `!~` (regex négative).

```promql
http_requests_total{status=~"5.."}   # toutes les erreurs 5xx
```

**Sélecteur de plage** (*range vector*) → plusieurs points sur une fenêtre. Indispensable pour `rate()` :

```promql
http_requests_total[5m]              # tous les points des 5 dernières minutes
```

**`rate(counter[fenêtre])`** → taux moyen d'augmentation **par seconde** sur la fenêtre. `rate()` gère seul les resets de counter (redémarrage) et **exige un range vector d'un counter**.

```promql
rate(http_requests_total[5m])        # requêtes par seconde, par série
```

**Agrégation `sum` et `sum by (labels)`** → on additionne des séries, en gardant (ou non) certains labels :

```promql
# débit total de l'API, toutes séries confondues
sum(rate(http_requests_total[5m]))

# débit par route (on garde le label route, on écrase le reste)
sum by (route) (rate(http_requests_total[5m]))
```

**Ordre canonique à mémoriser :** `sum by (...) ( rate( counter[5m] ) )` — d'abord dériver (`rate`), ensuite agréger (`sum`). Jamais l'inverse : `rate(sum(...))` est faux.

Exemple — taux d'erreur 5xx en proportion :

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

### 2.6 `histogram_quantile()` et le label `le`

Signature exacte (vérifiée docs) : `histogram_quantile(φ scalar, b instant-vector)`, avec `0 ≤ φ ≤ 1`. Elle estime le quantile `φ` par **interpolation linéaire** entre les bornes de buckets. Elle travaille sur les séries `_bucket`, qui **doivent porter le label `le`**.

```promql
# p99 de latence, agrégé toutes routes/instances
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)

# p95 par route
histogram_quantile(
  0.95,
  sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

La règle d'or : **`le` doit TOUJOURS figurer dans le `by (...)`**. Si tu l'oublies, les buckets fusionnent et le résultat est un chiffre plausible mais **faux**.

### 2.7 `rate()` vs `irate()`

`irate(counter[fenêtre])` calcule le taux instantané à partir des **deux derniers points** seulement. Il est réactif mais bruité.

| Fonction | Calcul | Usage recommandé |
|----------|--------|------------------|
| `rate()` | moyenne sur toute la fenêtre | dashboards stables, **alertes**, SLO |
| `irate()` | 2 derniers points | debug « live », counters très rapides |

Analogie : `rate()` = vitesse moyenne du trajet ; `irate()` = aiguille du compteur à l'instant T. Pour décider d'une alerte, la moyenne est plus fiable. **N'utilise jamais `irate()` dans une alerte** (bruit + sensible à l'irrégularité du scrape) — ce point est repris au module 09.

### 2.8 Labels et cardinalité — le piège n°1 en prod

Chaque combinaison de labels = **une série stockée**. Un label à haute cardinalité multiplie les séries et peut faire tomber Prometheus.

```ts
// ❌ CATASTROPHE : userId → une série par utilisateur, cardinalité illimitée
httpRequests.inc({ userId: '5f3a...', route: `/api/events/${eventId}/rsvp` })

// ✅ route TEMPLATISÉE, labels à faible cardinalité et valeurs énumérables
httpRequests.inc({ method: 'POST', route: '/api/events/:id/rsvp', status: '200' })
```

Règles :
- **jamais** d'ID (user, event, requête, e-mail) ni d'URL brute avec valeurs dynamiques en label ;
- templatise les routes : `/api/events/:id/rsvp`, pas `/api/events/42/rsvp` ;
- vise **≤ 5–6 labels** par métrique ; si un label peut prendre > ~100 valeurs, c'est un anti-pattern (mets l'info dans un log, pas dans un label).

---

## 3. Worked examples

### Exemple 1 — instrumenter l'API TribuZen de bout en bout

Objectif : un middleware Express qui compte les requêtes **et** mesure leur latence, plus un `/metrics` exposé. C'est la base réutilisée dans tout le cours.

```ts
// src/observability/metrics.ts
import { Counter, Histogram, register, collectDefaultMetrics } from 'prom-client'

collectDefaultMetrics({ prefix: 'tribuzen_' }) // process_/nodejs_ préfixés

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
})

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], // secondes, calés SLO
})

export { register }
```

```ts
// src/observability/middleware.ts
import type { Request, Response, NextFunction } from 'express'
import { httpRequests, httpDuration } from './metrics'

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // route TEMPLATISÉE : req.route?.path donne '/api/events/:id/rsvp', pas l'URL réelle
  // (fallback sur 'unmatched' pour ne PAS injecter l'URL brute → cardinalité)
  const startTimer = httpDuration.startTimer({ method: req.method })

  res.on('finish', () => {
    const route = req.route?.path ?? 'unmatched'
    // observe la durée avec le label route résolu APRÈS le routing
    startTimer({ method: req.method, route })
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) })
  })

  next()
}
```

```ts
// src/server.ts
import express from 'express'
import { register } from './observability/metrics'
import { metricsMiddleware } from './observability/middleware'

const app = express()
app.use(metricsMiddleware)

// ... routes métier TribuZen (events, rsvp, familles) ...

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics()) // await : metrics() est async
})

app.listen(3000)
```

Vérifie à la main : `curl localhost:3000/metrics` doit lister `http_requests_total`, `http_request_duration_seconds_bucket{le="..."}`, `_sum`, `_count`.

### Exemple 2 — répondre à la question du cas concret en PromQL

Le parent se plaint de `/rsvp`. Trois requêtes, dans l'ordre où un ingénieur les taperait dans Prometheus.

```promql
# (1) /rsvp reçoit-il vraiment du trafic ? (débit par seconde)
sum by (route) (rate(http_requests_total{route="/api/events/:id/rsvp"}[5m]))

# (2) quelle proportion échoue ? (taux d'erreur 5xx de la route)
sum(rate(http_requests_total{route="/api/events/:id/rsvp", status=~"5.."}[5m]))
/
sum(rate(http_requests_total{route="/api/events/:id/rsvp"}[5m]))

# (3) est-ce lent ? (p99 de latence de la route — le OBLIGATOIRE dans le by)
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp"}[5m]))
)
```

Si (1) montre du trafic, (2) un taux faible et (3) un p99 à 3 s : le problème est la **latence**, pas les erreurs — piste base de données ou appel externe lent, pas un bug qui renvoie 500.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — lire un counter brut au lieu de son `rate()`

`http_requests_total` ne fait que monter — le tracer donne une droite croissante inutile, et il se **remet à zéro** au redémarrage. On veut toujours la dérivée : `rate(http_requests_total[5m])`. Le suffixe `_total` doit déclencher le réflexe « enrobe-moi dans un `rate()` ».

### PIÈGE #2 — oublier `le` dans le `sum by` d'un `histogram_quantile`

```promql
# ❌ FAUX : le disparaît de l'agrégation → buckets fusionnés → quantile absurde
histogram_quantile(0.99, sum by (route) (rate(http_request_duration_seconds_bucket[5m])))

# ✅ le TOUJOURS présent dans le by
histogram_quantile(0.99, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m])))
```

Le résultat faux est *plausible* (un nombre s'affiche), donc ce bug passe en revue de code. Contrôle systématique : « `histogram_quantile` ⇒ `le` est-il dans le `by` ? ».

### PIÈGE #3 — un ID en label (bombe de cardinalité)

`labelNames: ['userId']` ou une route non templatisée (`/api/events/42/rsvp`) crée une série par valeur. Quelques milliers d'utilisateurs = des centaines de milliers de séries = OOM Prometheus. Un ID va dans un **log** (module 01), jamais dans un label de métrique.

### PIÈGE #4 — histogram vs summary : vouloir moyenner des p99

Un `summary` calcule ses quantiles côté client. `avg(x{quantile="0.99"})` sur 3 instances est **mathématiquement faux** (la moyenne de trois p99 n'est pas le p99 global). Si tu dois agréger entre instances/routes, il **faut** un histogram + `histogram_quantile` sur les buckets sommés.

### PIÈGE #5 — buckets en millisecondes ou mal calés

Les buckets sont en **secondes** (`0.25` = 250 ms). Deux erreurs classiques : mettre `250` en croyant écrire des ms (bucket à 250 s...), et espacer les buckets loin du seuil qui t'intéresse. Si ton SLO est « p99 < 300 ms », mets des buckets fins **autour** de 0.3 (`0.2, 0.25, 0.3, 0.4, 0.5`), sinon l'interpolation de `histogram_quantile` est grossière.

### PIÈGE #6 — oublier `await register.metrics()`

`register.metrics()` renvoie une **Promise**. Sans `await`, le endpoint sert `[object Promise]` et Prometheus marque la cible en échec (`up = 0`) sans message évident. Réflexe : `/metrics` est un handler `async`.

---

## 5. Ancrage TribuZen

L'instrumentation de l'Exemple 1 est la **fondation métriques** de l'API TribuZen, réutilisée par les modules RED/USE (03), SLO (08) et alerting (09).

Métriques posées dès ce module :

| Métrique | Type | Labels | À quoi ça sert dans TribuZen |
|----------|------|--------|------------------------------|
| `http_requests_total` | Counter | `method, route, status` | débit et taux d'erreur des endpoints (login, RSVP, familles) |
| `http_request_duration_seconds` | Histogram | `method, route` | latence p95/p99 par endpoint (le fameux `/rsvp`) |
| `tribuzen_active_connections` | Gauge | — | WebSockets ouverts (notifications temps réel) |
| `tribuzen_rsvp_confirmed_total` | Counter | `status` | métrique **métier** : confirmations de présence |

Le `tribuzen_rsvp_confirmed_total` illustre une idée clé : les métriques ne sont pas que techniques. Compter les RSVP confirmés est un signal **produit** — une chute soudaine peut révéler un bug (le bouton du cas concret) avant même les 5xx.

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    observability/
      metrics.ts        ← registre, counters, histogram (Exemple 1)
      middleware.ts     ← metricsMiddleware branché sur app.use
    server.ts           ← route /metrics
  ops/
    prometheus.yml      ← job de scrape 'tribuzen-api'
```

> Grafana (visualiser ces séries), les SLO calés sur `http_request_duration_seconds`, et les alertes sur le taux d'erreur viennent aux modules 07, 08 et 09. Ici, on garantit que les séries **existent et sont correctes**.

---

## 6. Points clés

1. Une métrique = série temporelle `nom{labels} = float` ; nom en unité SI (`_seconds`, `_bytes`, `_total`).
2. **Counter** = ce qui s'accumule (lu via `rate`), **Gauge** = instantané montant/descendant, **Histogram** = distribution en buckets, **Summary** = quantiles côté client.
3. Prometheus **pull/scrape** un endpoint `/metrics` ; il ne reçoit rien en push. `up` dit si la cible répond.
4. `prom-client` : registre global, `collectDefaultMetrics()` offert, `/metrics` = handler `async` avec `await register.metrics()` et `register.contentType`.
5. Un histogram `x` expose `x_bucket{le}`, `x_sum`, `x_count` ; `le` = borne haute inclusive.
6. PromQL canonique : `sum by (...) ( rate( counter[5m] ) )` — dériver d'abord, agréger ensuite.
7. `histogram_quantile(φ, ...)` exige le label `le` dans le `sum by` — sinon résultat faux mais plausible.
8. `rate()` pour alertes/SLO (stable), `irate()` pour le debug live (bruité) ; jamais `irate` en alerte.
9. Cardinalité = piège n°1 : aucun ID ni URL brute en label, routes templatisées, ≤ 5–6 labels.

---

## 7. Seeds Anki

```
Pourquoi ne trace-t-on jamais un counter brut ?|Un counter ne fait que monter et se remet à 0 au redémarrage. On veut sa dérivée par seconde : rate(counter[5m]). Le suffixe _total doit déclencher le réflexe rate().
Quels trois familles de séries un histogram nommé x expose-t-il ?|x_bucket{le="..."} (compteurs cumulatifs par borne inclusive), x_sum (somme des valeurs), x_count (nombre d'observations). Le label le = less-or-equal, borne haute inclusive.
Histogram vs Summary : lequel choisir par défaut et pourquoi ?|Histogram par défaut. Ses buckets sont agrégeables entre instances/routes et on choisit le quantile après coup en PromQL. Le summary calcule ses quantiles côté client → précis mais NON agrégeables (on ne peut pas moyenner des p99).
Quel est le modèle de collecte de Prometheus ?|Pull / scrape : Prometheus interroge périodiquement (ex: 15s) un endpoint HTTP /metrics sur chaque cible. Il ne reçoit rien en push. up{job} = 1 si le scrape réussit, 0 sinon.
Écris la PromQL du p99 de latence par route.|histogram_quantile(0.99, sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))). Le label le est OBLIGATOIRE dans le by, sinon les buckets fusionnent et le résultat est faux.
Quel est l'ordre canonique rate/sum en PromQL ?|sum by (labels) ( rate( counter[5m] ) ) : on dérive d'abord (rate), on agrège ensuite (sum). rate(sum(...)) est faux.
rate() ou irate() pour une alerte, et pourquoi ?|rate() : moyenne sur toute la fenêtre, stable. irate() n'utilise que les 2 derniers points → réactif mais bruité et sensible à l'irrégularité du scrape, à réserver au debug live. Jamais irate en alerte.
Pourquoi un userId en label est-il dangereux ?|Chaque valeur de label crée une série. Un userId (cardinalité illimitée) génère une série par utilisateur → explosion du nombre de séries → OOM de Prometheus. Les IDs vont dans les logs, pas dans les labels ; on templatise les routes (/api/events/:id/rsvp).
Deux pièges du endpoint /metrics avec prom-client ?|1) register.metrics() est async → sans await on sert [object Promise]. 2) il faut res.set('Content-Type', register.contentType) sinon Prometheus refuse le format et met la cible en échec.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-02-metriques-et-prometheus/README.md`. Instrumenter l'API TribuZen avec `prom-client`, la faire scraper par un vrai Prometheus (docker-compose fourni), puis écrire trois PromQL — corrigé complet commenté, coach en session, variante J+30.

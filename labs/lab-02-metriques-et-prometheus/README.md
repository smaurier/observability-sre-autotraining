# Lab 02 — Métriques et Prometheus

> **Outcome :** à la fin, tu sais instrumenter une API Node/Express avec `prom-client`, l'exposer sur `/metrics`, la faire scraper par un **vrai Prometheus**, et écrire trois PromQL de base (débit, taux d'erreur, p99 de latence).
> **Vrai outil :** `prom-client` v15 + Prometheus (image `prom/prometheus`) via le `docker-compose.base.yml` fourni à la racine du cours. Aucun harnais simulé.
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur. Ton oracle, c'est l'UI Prometheus (`http://localhost:9090`) et `curl /metrics`.

---

## Énoncé

Tu reprends l'API TribuZen du cas concret du module : un parent signale que `POST /api/events/:id/rsvp` « tourne dans le vide ». Tu vas rendre l'API **observable** pour trancher : est-ce des erreurs, ou de la latence ?

Tu dois :

1. **Instrumenter** une petite API Express avec `prom-client` :
   - un **counter** `http_requests_total{method, route, status}` ;
   - un **histogram** `http_request_duration_seconds{method, route}` (buckets en secondes, calés SLO) ;
   - les métriques process via `collectDefaultMetrics()`.
2. **Exposer** `GET /metrics` correctement (async + `Content-Type`).
3. **Templatiser** le label `route` — jamais l'URL brute (pas de bombe de cardinalité).
4. **Faire scraper** l'API par Prometheus (docker-compose fourni).
5. **Écrire trois PromQL** dans l'UI Prometheus et savoir les lire.

**Pas de gap-fill** — tu écris l'instrumentation complète à partir du starter minimal.

### Starter minimal

Crée un dossier de travail (hors du repo cours, ou dans un scratch) :

```
tribuzen-metrics-lab/
  server.ts
  prometheus.yml
  package.json
```

```jsonc
// package.json
{
  "type": "module",
  "dependencies": {
    "express": "^4",
    "prom-client": "^15"
  }
}
```

```ts
// server.ts — STARTER (à compléter)
import express from 'express'
// TODO: importer ce qu'il faut de 'prom-client'

const app = express()

// TODO: collectDefaultMetrics()
// TODO: déclarer httpRequests (Counter) et httpDuration (Histogram)
// TODO: un middleware qui, sur res 'finish', incrémente le counter
//       et observe la durée avec la route TEMPLATISÉE (req.route?.path)

// --- routes métier de démo (fournies) ---
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/events/:id/rsvp', (req, res) => {
  // simulate : lenteur aléatoire + 10% d'erreurs, pour avoir des données à observer
  const delay = Math.random() < 0.2 ? 1500 : 80
  setTimeout(() => {
    if (Math.random() < 0.1) return res.status(500).json({ error: 'db timeout' })
    res.json({ eventId: req.params.id, status: 'confirmed' })
  }, delay)
})

// TODO: app.get('/metrics', ...) — async, Content-Type, await register.metrics()

app.listen(3000, () => console.log('API sur http://localhost:3000'))
```

```yaml
# prometheus.yml — STARTER (à compléter)
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'tribuzen-api'
    static_configs:
      # TODO: cible host:port de l'API
      # ATTENTION depuis un conteneur Docker : 'localhost' = le conteneur Prometheus,
      # pas ta machine. Sur Docker Desktop, utilise 'host.docker.internal:3000'.
      - targets: ['???']
```

Le `docker-compose.base.yml` fourni à la racine du cours démarre Prometheus (port 9090) + Grafana (port 3001). Tu peux le lancer tel quel et lui monter **ton** `prometheus.yml`, ou lancer Prometheus seul :

```bash
docker run --rm -p 9090:9090 \
  -v "$PWD/prometheus.yml:/etc/prometheus/prometheus.yml" \
  prom/prometheus
```

---

## Étapes (en friction)

1. **Installe et lance l'API nue** (`npm i` puis `npx tsx server.ts`). Vérifie `curl localhost:3000/api/health`.
2. **Déclare le registre et les métriques** — `collectDefaultMetrics()`, un `Counter` `http_requests_total` avec `labelNames: ['method','route','status']`, un `Histogram` `http_request_duration_seconds` avec `labelNames: ['method','route']` et des `buckets` **en secondes** (`[0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`).
3. **Écris le middleware** — `startTimer` au début, et sur `res.on('finish', ...)` : résous la route via `req.route?.path ?? 'unmatched'`, observe la durée, incrémente le counter avec `status: String(res.statusCode)`.
4. **Expose `/metrics`** — handler `async`, `res.set('Content-Type', register.contentType)`, `res.end(await register.metrics())`.
5. **Vérifie l'exposition à la main** — `curl localhost:3000/metrics` doit montrer `http_requests_total`, `http_request_duration_seconds_bucket{le="..."}`, `_sum`, `_count`.
6. **Génère du trafic** — boucle une trentaine de `curl -X POST localhost:3000/api/events/42/rsvp` (certains seront lents/erronés par design).
7. **Branche Prometheus** — complète `prometheus.yml` (cible `host.docker.internal:3000` sous Docker Desktop), lance-le, ouvre `http://localhost:9090`. Dans *Status → Targets*, la cible `tribuzen-api` doit être **UP**.
8. **Écris les trois PromQL** dans l'onglet *Graph* (voir corrigé). Fais varier la fenêtre `[5m]` / `[1m]` et observe.
9. **Provoque un pic** — modifie le code pour renvoyer 100 % de 500 pendant 1 min, régénère du trafic, regarde le taux d'erreur monter dans Prometheus.

---

## Corrigé complet commenté

```ts
// server.ts — CORRIGÉ
import express from 'express'
import {
  Counter,
  Histogram,
  register,
  collectDefaultMetrics,
} from 'prom-client'

// Métriques du process (CPU, RSS, event-loop lag, GC) — offertes, préfixées
collectDefaultMetrics({ prefix: 'tribuzen_' })

// Counter : ce qui s'accumule. Suffixe _total = réflexe rate() en PromQL.
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Nombre total de requêtes HTTP',
  labelNames: ['method', 'route', 'status'], // 3 labels à faible cardinalité
})

// Histogram : distribution de latence. Buckets en SECONDES, calés sur les seuils utiles.
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
})

const app = express()

// Middleware d'instrumentation — branché AVANT les routes métier
app.use((req, res, next) => {
  // startTimer démarre le chrono ; on complétera les labels au 'finish'
  const stop = httpDuration.startTimer({ method: req.method })

  res.on('finish', () => {
    // req.route n'est peuplé qu'APRÈS le routing → dispo ici, dans finish.
    // path = '/api/events/:id/rsvp' (TEMPLATISÉ), pas l'URL brute '/api/events/42/rsvp'.
    // Fallback 'unmatched' pour ne jamais injecter d'URL dynamique → cardinalité maîtrisée.
    const route = req.route?.path ?? 'unmatched'

    // observe la durée écoulée avec le label route résolu
    stop({ method: req.method, route })

    // status en string : Prometheus stocke des labels string
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) })
  })

  next()
})

// --- routes métier de démo ---
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/events/:id/rsvp', (req, res) => {
  const delay = Math.random() < 0.2 ? 1500 : 80 // 20% de requêtes lentes
  setTimeout(() => {
    if (Math.random() < 0.1) return res.status(500).json({ error: 'db timeout' })
    res.json({ eventId: req.params.id, status: 'confirmed' })
  }, delay)
})

// Exposition Prometheus — handler ASYNC obligatoire
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType) // type MIME exact attendu par Prometheus
  res.end(await register.metrics())             // metrics() renvoie une Promise → await
})

app.listen(3000, () => console.log('API sur http://localhost:3000'))
```

```yaml
# prometheus.yml — CORRIGÉ
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'tribuzen-api'
    static_configs:
      # Docker Desktop (Win/Mac) : host.docker.internal résout la machine hôte.
      # Prometheus lancé en natif (pas Docker) : 'localhost:3000'.
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics' # défaut, explicite pour la clarté
```

**Les trois PromQL (onglet Graph de `http://localhost:9090`) :**

```promql
# (1) Débit de /rsvp — requêtes par seconde, par route
sum by (route) (rate(http_requests_total{route="/api/events/:id/rsvp"}[5m]))
```

```promql
# (2) Taux d'erreur 5xx de /rsvp — proportion (0 à 1)
sum(rate(http_requests_total{route="/api/events/:id/rsvp", status=~"5.."}[5m]))
/
sum(rate(http_requests_total{route="/api/events/:id/rsvp"}[5m]))
```

```promql
# (3) p99 de latence de /rsvp — le OBLIGATOIRE dans le sum by
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp"}[5m]))
)
```

**Pourquoi ce corrigé est correct :**
- Le label `route` vient de `req.route?.path` (templatisé) → cardinalité bornée même avec des milliers d'events. Injecter `req.originalUrl` aurait créé une série par event ID.
- `/metrics` est `async` avec `await register.metrics()` et `register.contentType` : sans ça, la cible tombe en `up = 0` sans erreur explicite.
- La requête (3) garde `le` dans le `sum by`. Sans `le`, les buckets fusionnent et `histogram_quantile` renvoie un nombre **plausible mais faux**.
- Lecture croisée : si (1) montre du trafic, (2) un taux d'erreur faible, (3) un p99 à ~1.5 s → le problème est la **latence**, pas les erreurs. C'est exactement la réponse cherchée dans le cas concret.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Cardinalité | route templatisée `:id`, ≤ 6 labels, aucun ID | URL brute ou userId en label |
| Exposition | `/metrics` async + `contentType`, cible **UP** dans Prometheus | `up = 0`, `[object Promise]`, ou 404 |
| Type de métrique | counter pour le compte, histogram pour la latence | gauge/summary mal employés |
| Buckets | en secondes, resserrés autour des seuils utiles | en ms, ou trop espacés |
| PromQL p99 | `le` présent dans `sum by`, `rate` autour du `_bucket` | `le` oublié, ou `rate(sum(...))` |
| Lecture | sait conclure « latence vs erreurs » depuis les 3 requêtes | lit une requête sans la relier au symptôme |

### Coach — questions de vérification en session

- « Montre-moi `/metrics` et pointe `_bucket`, `_sum`, `_count`. À quoi sert `le` ? »
- « Dans ta PromQL p99, que se passe-t-il si tu enlèves `le` du `by` ? » (attendu : buckets fusionnés → faux)
- « Pourquoi `req.route?.path` et pas `req.originalUrl` ? » (attendu : cardinalité)
- « Ta cible est `up`. Où le vois-tu, et que vaut `up{job="tribuzen-api"}` si tu arrêtes l'API ? »
- « Débit OK, erreurs faibles, p99 à 1.5 s : ton diagnostic ? »

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reproduis l'instrumentation **de mémoire, en 30 min**, sur une nouvelle route `POST /api/families/:id/invite`.
2. Ajoute une **métrique métier** : un counter `tribuzen_invites_sent_total{channel}` avec `channel` ∈ `{email, sms}` (deux valeurs seulement — cardinalité maîtrisée).
3. Écris une **quatrième PromQL** : le nombre d'invitations envoyées par minute et par canal — `sum by (channel) (rate(tribuzen_invites_sent_total[1m]))`.
4. **Piège volontaire à éviter :** ne mets **pas** l'ID de famille en label. Explique au coach en une phrase pourquoi.

**Critère de réussite :** cible `up` dans Prometheus, les quatre PromQL renvoient des séries cohérentes, et zéro label à cardinalité non bornée dans `curl /metrics`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette instrumentation vit ici :

```
tribuzen/
  src/
    observability/
      metrics.ts        ← registre, counters, histogram
      middleware.ts     ← metricsMiddleware (app.use)
    server.ts           ← route /metrics
  ops/
    prometheus.yml      ← job de scrape 'tribuzen-api'
```

**Différences avec le lab :**
- Le middleware devient un module réutilisé par toutes les routes (pas inline dans `server.ts`).
- La cible de scrape passe de `host.docker.internal` à un service Docker Compose nommé (`api:3000`) quand l'API et Prometheus tournent dans le même réseau.
- Les buckets seront recalés une fois les **SLO** définis (module 08) — ici, valeurs par défaut raisonnables.

**Commit cible :**
```
feat(observability): instrumente l'API — http_requests_total + latence histogram + /metrics scrapé
```

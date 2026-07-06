---
titre: OpenTelemetry — instrumentation unifiée & Collector
cours: 16-observability-sre
notions: ["signaux unifiés (traces/métriques/logs)", "SDK Node (NodeSDK)", "auto-instrumentation vs instrumentation manuelle", "OTLP (gRPC 4317 / HTTP 4318)", "Collector (receivers/processors/exporters)", "pipelines de service", "semantic conventions", "resource & service.name", "vendor-neutralité"]
outcomes:
  - sait initialiser le SDK OpenTelemetry Node et le charger AVANT le code applicatif
  - sait distinguer auto-instrumentation et spans manuels, et combiner les deux
  - sait exporter en OTLP vers un Collector puis router vers plusieurs backends
  - sait lire et écrire une config Collector (receivers, processors, exporters, pipelines)
prerequis: [modules 00-04, dont 04-distributed-tracing]
next: 06-error-tracking-sentry
libs: []
tribuzen: API TribuZen (Express/Node) — instrumentation OTel de bout en bout, export OTLP vers le Collector du cours
last-reviewed: 2026-07
---

# OpenTelemetry — instrumentation unifiée & Collector

> **Outcomes — tu sauras FAIRE :** initialiser le SDK OTel Node et le charger avant l'app, combiner auto-instrumentation et spans manuels, exporter en OTLP vers un Collector, écrire une config Collector qui route vers plusieurs backends.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module unifie ce que tu as vu séparément — les **logs** (module 01), les **métriques Prometheus** (module 02) et le **tracing distribué** (module 04). OpenTelemetry est la couche qui produit ces trois signaux avec **une seule API, un seul SDK, un seul protocole (OTLP)**. On couvre le **SDK Node** (côté app) et le **Collector** (côté infra). Le choix des SLI/SLO reste au module 08 ; Sentry (backend d'erreurs) au module 06.

## 1. Cas concret d'abord

Ton équipe TribuZen a trois instrumentations séparées dans l'API : Pino pour les logs (module 01), `prom-client` pour les métriques (module 02), et un début d'OTel pour les traces (module 04). Trois librairies, trois formats, trois chemins d'export. Le jour où l'équipe veut changer de backend de traces (passer de Jaeger à Grafana Tempo), il faut **modifier et redéployer l'API**.

Pire : dans `demo-app/src/lib/tracing.ts`, le tracing est encore un placeholder :

```typescript
// demo-app/src/lib/tracing.ts — état actuel (placeholder)
export function initTracing(): void {
  console.log('[tracing] OpenTelemetry tracing not yet configured.');
  console.log('[tracing] See module 05 for distributed tracing setup.');
}
```

**La question du jour :** comment instrumenter l'API TribuZen **une seule fois** pour produire traces + métriques, sans coupler le code aux backends, et pouvoir changer de vendor sans toucher à l'app ?

La réponse tient en deux pièces :
1. Le **SDK OTel** dans l'app — génère les signaux et les envoie en **OTLP** vers un seul endpoint.
2. Le **Collector** — reçoit l'OTLP, traite, et **route** vers Jaeger, Prometheus, Loki… La config du routage vit dans un YAML, pas dans ton code.

C'est ce que tu vas construire dans le lab. Ce module te donne la théorie complète d'abord.

---

## 2. Théorie complète, concise

### 2.1 Les trois signaux, une seule fondation

OpenTelemetry (OTel) est un standard **CNCF** qui unifie les **trois piliers** de l'observabilité (vus au module 00) :

| Signal | Ce qu'il répond | Vu au module |
|--------|-----------------|--------------|
| **Traces** | « où le temps est-il passé dans CETTE requête ? » | 04 |
| **Métriques** | « combien / à quel taux, agrégé ? » | 02 |
| **Logs** | « qu'est-il précisément arrivé à l'instant T ? » | 01 |

Avant OTel, chaque signal avait son SDK propriétaire (Jaeger client, Prometheus client, un logger). OTel fournit **une API unique** (`@opentelemetry/api`), **un SDK** (`@opentelemetry/sdk-node`) et **un protocole de transport** (OTLP). Le gain central : la **vendor-neutralité** — le code d'instrumentation ne connaît aucun backend, seulement OTLP.

### 2.2 API vs SDK — la séparation clé

OTel sépare volontairement deux choses :

- **`@opentelemetry/api`** : les *interfaces* que ton code appelle (`trace.getTracer`, `metrics.getMeter`). Si aucun SDK n'est configuré, ces appels sont des **no-ops** (ne coûtent rien). C'est ce que les **bibliothèques** utilisent pour s'instrumenter sans imposer de SDK.
- **`@opentelemetry/sdk-node`** : l'*implémentation* qui collecte réellement, échantillonne et exporte. C'est **l'application** (pas les libs) qui configure le SDK, **une fois**, au démarrage.

Conséquence pratique : ton code métier n'importe que `@opentelemetry/api`. Le SDK est branché à part.

### 2.3 Initialiser le SDK Node — `NodeSDK`

Le SDK s'initialise dans un fichier séparé (`instrumentation.ts`), chargé **avant** le code applicatif. Packages officiels :

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/sdk-metrics \
  @opentelemetry/sdk-trace-node
```

```typescript
// instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new NodeSDK({
  // Un seul endpoint : le Collector. L'app ne connaît aucun backend final.
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:4318/v1/metrics',
    }),
  }),
  // Auto-instrumentation : HTTP, Express, fetch, DB... tracés sans code métier
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

### 2.4 Charger le SDK AVANT l'app — le point qui casse tout le monde

L'auto-instrumentation fonctionne en **patchant les modules** (`http`, `express`, `pg`…) au moment de leur chargement. Si ton app importe Express **avant** que le SDK démarre, le patch arrive trop tard : **rien n'est tracé**. D'où le chargement via `--import` (Node 20+), qui exécute `instrumentation.ts` avant le point d'entrée :

```bash
# JavaScript
node --import ./instrumentation.mjs app.js

# TypeScript (tsx)
npx tsx --import ./instrumentation.ts app.ts
```

Alternative historique : `node --require ./instrumentation.js app.js` (CommonJS). Le principe est identique : **le SDK d'abord, l'app ensuite**.

### 2.5 Auto-instrumentation vs instrumentation manuelle

**Auto-instrumentation** (`getNodeAutoInstrumentations()`) : des *plugins* détectent les libs connues et créent des spans automatiquement. Un appel HTTP entrant, une requête `pg`, un `fetch` sortant → spans gratuits, avec les bons attributs de semantic conventions. C'est **80 % du travail** pour zéro ligne métier.

**Instrumentation manuelle** : pour le **code métier** que l'auto ne connaît pas (calcul de facturation, règle d'accès famille TribuZen…), tu crées des spans à la main via `@opentelemetry/api` :

```typescript
// service métier — n'importe QUE l'API, jamais le SDK
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('tribuzen-orders', '1.0.0');

export async function processOrder(orderId: string) {
  // startActiveSpan : le span devient le contexte courant (parent des enfants)
  return tracer.startActiveSpan('processOrder', async (span) => {
    try {
      span.setAttribute('order.id', orderId);        // attribut métier
      const result = await chargePayment(orderId);   // appel auto-instrumenté enfant
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);            // attache l'erreur au span
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();                                    // OBLIGATOIRE, sinon span jamais exporté
    }
  });
}
```

Règle : **auto pour l'infrastructure** (HTTP/DB/broker), **manuel pour la logique métier** qui a du sens dans une trace.

### 2.6 Métriques via l'API OTel

Même API unifiée pour les métriques (rappel module 02 sur les *types* : counter, histogram…) :

```typescript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('tribuzen-api');
const ordersCreated = meter.createCounter('tribuzen.orders.created');
const orderLatency = meter.createHistogram('tribuzen.order.duration');

ordersCreated.add(1, { plan: 'family' });        // + attributs (labels)
orderLatency.record(142, { route: '/orders' });
```

Le SDK exporte ces métriques en OTLP ; le Collector les convertit au format Prometheus (voir §2.9).

### 2.7 Semantic conventions & Resource

Les **semantic conventions** sont un dictionnaire d'attributs standardisés : `http.request.method`, `http.response.status_code`, `url.path`, `db.system`, `service.name`… L'auto-instrumentation les pose **automatiquement**. L'intérêt : un backend affiche « toutes les requêtes 5xx » de la même façon **quel que soit le langage** — c'est ça, la neutralité.

La **Resource** décrit *qui* émet les signaux : `service.name`, `service.version`, `deployment.environment`. Elle est attachée à **tous** les signaux. Le plus simple pour la définir est la variable d'env :

```bash
OTEL_SERVICE_NAME=tribuzen-api
OTEL_RESOURCE_ATTRIBUTES=service.version=1.4.0,deployment.environment=production
```

Sans `service.name`, tes traces apparaissent sous `unknown_service` — piège classique (§4).

### 2.8 OTLP — le protocole unique

**OTLP** (OpenTelemetry Protocol) transporte les trois signaux. Deux variantes :

| Variante | Port | Endpoint | Quand |
|----------|------|----------|-------|
| **gRPC** | 4317 | (pas de chemin) | gros volumes, streaming, prod |
| **HTTP/protobuf ou JSON** | 4318 | `/v1/traces`, `/v1/metrics`, `/v1/logs` | simple, debuggable (curl), proxies |

Variable d'environnement standard pour pointer le Collector sans toucher au code :

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

Packages exporteurs Node vérifiés : `@opentelemetry/exporter-trace-otlp-http` (HTTP/JSON), `@opentelemetry/exporter-trace-otlp-proto` (HTTP/protobuf), `@opentelemetry/exporter-trace-otlp-grpc` (gRPC) — et leurs équivalents `exporter-metrics-otlp-*`.

### 2.9 Le Collector — receivers / processors / exporters

Le Collector est un binaire séparé (souvent l'image `otel/opentelemetry-collector-contrib`). Il **découple** l'app des backends : l'app envoie tout au Collector, le Collector route. Trois composants + un assemblage :

- **Receivers** : *entrées*. Écoutent (ex : `otlp` sur 4317/4318, `prometheus` pour scraper).
- **Processors** : *transformations* entre entrée et sortie (`batch`, `memory_limiter`, `filter`, `attributes`, `tail_sampling`).
- **Exporters** : *sorties* vers les backends (`otlp` vers Jaeger/Tempo, `prometheus`, `debug`).
- **service.pipelines** : le câblage. **Déclarer un composant ne l'active pas** — il faut le mettre dans une pipeline.

```yaml
# config/otel-collector/config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:          # protège le Collector de l'OOM — TOUJOURS en premier
    check_interval: 1s
    limit_mib: 512
  batch:                   # regroupe avant export — indispensable en prod
    timeout: 5s
    send_batch_size: 1024

exporters:
  otlp/jaeger:             # traces vers Jaeger (compatible OTLP)
    endpoint: jaeger:4317
    tls:
      insecure: true
  prometheus:             # expose un /metrics que Prometheus scrape
    endpoint: 0.0.0.0:8889
  debug:                  # affiche dans les logs du Collector (dev)
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

Pour changer de backend de traces (Jaeger → Tempo), on modifie **cet exporter YAML** — **pas** l'application. C'est le point de tout le module.

---

## 3. Worked examples

### Exemple 1 — Instrumenter l'API TribuZen de bout en bout

On remplace le placeholder de `tracing.ts` par un vrai SDK, et on trace une route.

```typescript
// instrumentation.ts — chargé via `node --import ./instrumentation.mjs`
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  // OTEL_EXPORTER_OTLP_ENDPOINT est lu automatiquement si l'URL n'est pas passée.
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces`,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start(); // à partir d'ici, Express + http sont patchés

// arrêt propre : flush les spans en attente avant de quitter
process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
```

```typescript
// src/services/order-service.ts — span manuel autour de la logique métier
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('tribuzen-orders', '1.0.0');

export async function createOrder(userId: string, items: string[]) {
  return tracer.startActiveSpan('createOrder', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('order.item_count', items.length);
    try {
      const order = await persist(userId, items); // requête DB auto-instrumentée (span enfant)
      span.setStatus({ code: SpanStatusCode.OK });
      return order;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

**Ce qu'on obtient dans Jaeger** : une trace `POST /orders` (span racine auto), avec un span enfant `createOrder` (manuel) portant `user.id` et `order.item_count`, lui-même parent du span DB (auto). Le lien parent-enfant est géré par `startActiveSpan` — pas de propagation manuelle de contexte.

### Exemple 2 — Router traces + métriques vers deux backends

Scénario : les traces vont à Jaeger, les métriques deviennent scrapables par Prometheus, et pour déboguer on veut aussi tout voir dans les logs du Collector.

```yaml
# config/otel-collector/config.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  memory_limiter: { check_interval: 1s, limit_mib: 512 }
  batch: { timeout: 5s, send_batch_size: 1024 }
  # supprime le bruit des health checks avant export
  filter/health:
    error_mode: ignore
    traces:
      span:
        - 'attributes["url.path"] == "/health"'

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }
  prometheus:
    endpoint: 0.0.0.0:8889
  debug: { verbosity: basic }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, filter/health, batch]  # filtre AVANT batch
      exporters: [otlp/jaeger, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, debug]
```

**Lecture pas à pas :**
1. L'app envoie **tout** en OTLP sur 4318 → le receiver `otlp` reçoit.
2. Pipeline `traces` : `memory_limiter` (garde-fou mémoire) → `filter/health` (jette les `/health`) → `batch` (regroupe) → export vers Jaeger **et** logs debug.
3. Pipeline `metrics` : même garde-fou et batch → l'exporter `prometheus` **expose** un endpoint `:8889/metrics` que le serveur Prometheus vient scraper (module 02).
4. Changer Jaeger pour Tempo = éditer la ligne `endpoint:` de `otlp/jaeger`. L'app ne bouge pas.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — SDK chargé APRÈS l'app → rien n'est tracé

```typescript
// ❌ app.ts
import express from 'express';        // Express chargé ici
import './instrumentation';           // SDK démarré APRÈS → patch trop tard
```

L'auto-instrumentation patche les modules au chargement. Si Express est importé avant le `sdk.start()`, il n'est pas patché. **Correct :** charger le SDK via `node --import ./instrumentation.mjs app.js`, jamais par un `import` en haut de `app.ts`.

### PIÈGE #2 — Oublier `span.end()`

Un span sans `.end()` n'est **jamais exporté** (le SDK attend sa fin) et fuit en mémoire. Toujours `end()` dans un `finally`. Avec `startActiveSpan`, `end()` reste **manuel** — le callback ne le ferme pas pour toi.

### PIÈGE #3 — Confondre API et SDK

Instrumenter une **bibliothèque** avec `@opentelemetry/sdk-node` la couple à un SDK et casse les apps qui l'utilisent. Les libs n'importent que `@opentelemetry/api` (no-op si pas de SDK). Seule **l'application finale** configure le SDK, une fois.

### PIÈGE #4 — `unknown_service` dans le backend

Pas de `service.name` → toutes tes traces s'agglutinent sous `unknown_service:node`. Définir `OTEL_SERVICE_NAME=tribuzen-api` (ou via la Resource). C'est l'attribut le plus important : sans lui, impossible de distinguer les services.

### PIÈGE #5 — Déclarer un composant Collector sans l'ajouter à une pipeline

Ajouter un exporter `prometheus:` dans la section `exporters` **ne l'active pas**. Tant qu'il n'est pas listé dans `service.pipelines.<signal>.exporters`, il est ignoré. Le câblage `service` est ce qui rend un composant vivant.

### PIÈGE #6 — `memory_limiter` mal placé

`memory_limiter` doit être le **premier** processor de chaque pipeline : il doit pouvoir rejeter des données **avant** le traitement coûteux (`batch`, `tail_sampling`). Le mettre après `batch` le rend inutile sous charge.

### PIÈGE #7 — Exporter direct vers le backend (sans Collector)

Pointer l'exporter de l'app directement sur Jaeger « pour aller plus vite » recouple app et backend, et supprime le traitement centralisé (filtrage, sampling, enrichissement, retries). En prod, l'app parle **toujours** au Collector.

---

## 5. Ancrage TribuZen

L'observabilité de TribuZen converge vers OTel. Concrètement dans `smaurier/tribuzen` :

```
tribuzen/
  apps/
    api/
      instrumentation.ts          ← NodeSDK + OTLP, chargé via --import
      src/
        services/
          order-service.ts        ← span manuel createOrder (métier)
          family-service.ts       ← span manuel checkFamilyAccess
  infra/
    otel-collector/
      config.yaml                 ← receivers otlp / processors / exporters Jaeger+Prometheus
    docker-compose.tracing.yml    ← collector + jaeger (fourni à la racine du cours)
```

**Ce que OTel remplace / unifie :**
- Le tracing du module 04 (jusqu'ici branché « à la main ») devient l'auto-instrumentation `getNodeAutoInstrumentations()`.
- Les métriques `prom-client` du module 02 peuvent migrer vers l'API `metrics` OTel, exportées via la pipeline `metrics` du Collector.
- Les logs Pino du module 01 sont corrélables aux traces via `trace_id`/`span_id` (OTel unifie l'identité du signal).

**Décision d'architecture TribuZen :** l'API n'écrit **jamais** l'adresse de Jaeger/Tempo/Prometheus dans son code. Elle ne connaît que `OTEL_EXPORTER_OTLP_ENDPOINT` (le Collector). Tout changement de backend est une modif de `config.yaml` + redéploiement du **Collector**, pas de l'API. C'est la vendor-neutralité appliquée au produit.

---

## 6. Points clés

1. OTel unifie traces + métriques + logs derrière **une API, un SDK, un protocole (OTLP)** — vendor-neutre.
2. `@opentelemetry/api` = interfaces (no-op sans SDK) pour les libs ; `@opentelemetry/sdk-node` = implémentation, configurée par **l'app seule**.
3. Le SDK se charge **avant** le code applicatif (`node --import ./instrumentation.mjs app.js`), sinon l'auto-instrumentation ne patche rien.
4. Auto-instrumentation pour l'infra (HTTP/DB) ; spans manuels via `tracer.startActiveSpan` pour le métier ; toujours `span.end()` dans un `finally`.
5. OTLP : gRPC sur 4317, HTTP sur 4318 (`/v1/traces`, `/v1/metrics`, `/v1/logs`) ; endpoint pilotable par `OTEL_EXPORTER_OTLP_ENDPOINT`.
6. `service.name` (via `OTEL_SERVICE_NAME`) est obligatoire — sinon `unknown_service`.
7. Collector = receivers → processors → exporters, **câblés** dans `service.pipelines` ; déclarer ≠ activer.
8. `memory_limiter` en premier, `batch` obligatoire en prod ; changer de backend = éditer un exporter YAML, pas l'app.

---

## 7. Seeds Anki

```
Pourquoi charger le SDK OTel via `--import` avant l'app plutôt qu'avec un import en haut de app.ts ?|L'auto-instrumentation patche les modules (http, express, pg) au chargement. Si l'app importe Express avant sdk.start(), le patch arrive trop tard et rien n'est tracé. `--import ./instrumentation.mjs` garantit SDK d'abord, app ensuite.
Quelle est la différence entre @opentelemetry/api et @opentelemetry/sdk-node ?|api = les interfaces que le code/les libs appellent (no-op si aucun SDK). sdk-node = l'implémentation qui collecte, échantillonne, exporte. Seule l'application configure le SDK, une fois ; les libs n'importent que l'api.
Quand utiliser l'auto-instrumentation vs un span manuel ?|Auto (getNodeAutoInstrumentations) pour l'infrastructure connue : HTTP entrant/sortant, DB, brokers. Manuel (tracer.startActiveSpan) pour la logique métier qu'OTel ne connaît pas (facturation, règle d'accès), avec attributs métier.
Que se passe-t-il si on oublie span.end() ?|Le span n'est jamais exporté (le SDK attend sa fin) et fuit en mémoire. Toujours appeler span.end() dans un finally ; startActiveSpan ne ferme PAS le span automatiquement.
Quels sont les deux transports OTLP et leurs ports ?|gRPC sur 4317 (gros volumes, streaming, prod) et HTTP sur 4318 avec chemins /v1/traces, /v1/metrics, /v1/logs (simple, debuggable). L'endpoint se configure sans code via OTEL_EXPORTER_OTLP_ENDPOINT.
Quels sont les trois composants d'un Collector et qu'est-ce qui les active ?|receivers (entrées, ex otlp), processors (batch, memory_limiter, filter), exporters (otlp/jaeger, prometheus, debug). Déclarer un composant ne l'active pas : il faut le lister dans service.pipelines.<signal>.
Où placer memory_limiter dans une pipeline Collector et pourquoi ?|En premier processor. Il doit pouvoir rejeter des données avant le traitement coûteux (batch, tail_sampling) pour protéger le Collector de l'OOM. Placé après batch, il devient inutile sous charge.
Comment changer de backend de traces (Jaeger → Tempo) sans toucher à l'application ?|Éditer l'exporter dans config.yaml du Collector (endpoint) et redéployer le Collector. L'app ne connaît que OTEL_EXPORTER_OTLP_ENDPOINT (le Collector) — c'est la vendor-neutralité d'OTLP.
À quoi servent les semantic conventions et service.name ?|Les semantic conventions standardisent les attributs (http.request.method, db.system...) pour un affichage uniforme quel que soit le langage. service.name (OTEL_SERVICE_NAME) identifie le service ; sans lui, les traces tombent sous unknown_service.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-05-opentelemetry-instrumentation/README.md`. Instrumenter la demo-app avec le SDK OTel (auto + un span manuel), exporter en OTLP, écrire la config Collector qui route vers Jaeger, et vérifier la trace dans l'UI Jaeger — vrai `docker-compose.tracing.yml`, zéro harnais simulé.

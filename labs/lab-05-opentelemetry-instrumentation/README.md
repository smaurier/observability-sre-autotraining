# Lab 05 — OpenTelemetry : instrumenter l'API TribuZen & router via le Collector

> **Outcome :** à la fin, tu sais instrumenter une API Node avec le SDK OpenTelemetry (auto-instrumentation + un span manuel), l'exporter en OTLP vers un Collector, et écrire la config Collector qui route les traces vers Jaeger — puis lire ta trace dans l'UI Jaeger.
> **Vrai outil :** OpenTelemetry SDK Node réel + `otel/opentelemetry-collector-contrib` + Jaeger, lancés par `docker-compose.tracing.yml` (fourni à la racine du cours). Aucun harnais simulé, aucun auto-correcteur.
> **Feedback :** le coach valide en session à partir de la trace visible dans Jaeger (`http://localhost:16686`).

---

## Énoncé

La demo-app (`16-observability-sre/demo-app`) est une API Express (routes `/products`, `/orders`, `/health`). Son tracing est encore un **placeholder** :

```typescript
// demo-app/src/lib/tracing.ts — état de départ
export function initTracing(): void {
  console.log('[tracing] OpenTelemetry tracing not yet configured.');
}
```

Ta mission, en 4 blocs :

1. **Installer et configurer le SDK OTel** dans un fichier `instrumentation.ts` séparé, chargé **avant** l'app via `--import`.
2. **Auto-instrumenter** les requêtes HTTP/Express (zéro code métier).
3. **Ajouter un span manuel** dans le service métier `createOrder` (ou l'équivalent de `order-service.ts`), avec attributs et gestion d'erreur.
4. **Écrire la config Collector** (`config/otel-collector/config.yaml`) qui reçoit l'OTLP et route les traces vers Jaeger, puis vérifier la trace de bout en bout dans l'UI Jaeger.

**Contraintes :**
- L'app ne doit **jamais** connaître l'adresse de Jaeger. Elle n'exporte que vers le Collector (`OTEL_EXPORTER_OTLP_ENDPOINT`).
- `service.name` doit valoir `tribuzen-api` (sinon `unknown_service` dans Jaeger).
- Pas de gap-fill : tu écris `instrumentation.ts` et la config Collector à partir des starters minimaux.

### Stack fournie (à lancer)

```bash
# depuis 16-observability-sre/
docker compose -f docker-compose.tracing.yml up -d
# → otel-collector (OTLP 4317/4318) + jaeger (UI 16686)
```

Le Collector monte `./config/otel-collector/config.yaml` — c'est ce fichier que tu vas éditer au bloc 4.

### Starter minimal — `instrumentation.ts`

Crée `demo-app/instrumentation.ts` :

```typescript
// instrumentation.ts — starter (à compléter)
import { NodeSDK } from '@opentelemetry/sdk-node';
// TODO: importer getNodeAutoInstrumentations et OTLPTraceExporter (HTTP)

const sdk = new NodeSDK({
  // TODO: traceExporter OTLP/HTTP vers le Collector (4318, /v1/traces)
  // TODO: instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
// TODO: shutdown propre sur SIGTERM pour flush les spans
```

Packages à installer (dans `demo-app/`) :

```bash
npm install @opentelemetry/sdk-node @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

### Starter minimal — `config/otel-collector/config.yaml`

Un fichier existe déjà (pipeline traces+metrics). Pour ce lab, pars de ce squelette **traces-only** et complète-le :

```yaml
# config/otel-collector/config.yaml — starter
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  # TODO: memory_limiter (en premier) + batch

exporters:
  # TODO: otlp/jaeger (endpoint jaeger:4317, tls insecure) + debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      # TODO: processors + exporters
```

---

## Étapes (en friction)

1. **Lance la stack** `docker compose -f docker-compose.tracing.yml up -d` et ouvre `http://localhost:16686` (Jaeger vide pour l'instant).
2. **Installe les 4 packages OTel** dans `demo-app/`.
3. **Complète `instrumentation.ts`** : `OTLPTraceExporter` vers `http://localhost:4318/v1/traces`, `getNodeAutoInstrumentations()`, `sdk.start()`, shutdown sur SIGTERM.
4. **Lance l'app avec le SDK chargé d'abord** :
   `OTEL_SERVICE_NAME=tribuzen-api npx tsx --import ./instrumentation.ts src/index.ts`
5. **Génère du trafic** : `curl http://localhost:3000/products` puis `curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" -d '{...}'`.
6. **Vérifie l'auto-instrumentation** dans Jaeger : sélectionne le service `tribuzen-api` → tu dois voir des traces `GET /products`, `POST /orders`.
7. **Ajoute un span manuel** dans `order-service.ts` (`tracer.startActiveSpan('createOrder', ...)`) avec `order.item_count` et gestion d'erreur (`recordException` + `setStatus`). Relance, refais un POST.
8. **Complète la config Collector** (memory_limiter en premier, batch, exporter Jaeger + debug, câblage dans la pipeline). `docker compose -f docker-compose.tracing.yml restart otel-collector`.
9. **Vérifie de bout en bout** : la trace `POST /orders` dans Jaeger contient un span enfant `createOrder` portant tes attributs métier, lui-même parent du span DB auto-instrumenté.
10. **Cas d'erreur** : provoque une erreur métier → le span `createOrder` doit apparaître en rouge (status ERROR) avec l'exception attachée.

---

## Corrigé complet commenté

### `instrumentation.ts`

```typescript
// instrumentation.ts — chargé AVANT l'app via `npx tsx --import ./instrumentation.ts src/index.ts`
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// L'endpoint pointe le COLLECTOR, jamais Jaeger directement.
// OTEL_EXPORTER_OTLP_ENDPOINT (ex: http://otel-collector:4318 en docker) surcharge sans toucher au code.
const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${base}/v1/traces`, // OTLP/HTTP → chemin /v1/traces obligatoire
  }),
  // Patche http, express, pg, fetch... et pose les semantic conventions automatiquement.
  instrumentations: [getNodeAutoInstrumentations()],
});

// À partir d'ici, les modules chargés ENSUITE (Express dans src/index.ts) sont instrumentés.
sdk.start();

// Arrêt propre : flush les spans encore en buffer avant de quitter (sinon on les perd).
process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

> `service.name` est fourni via l'env `OTEL_SERVICE_NAME=tribuzen-api` au lancement — le NodeSDK le lit automatiquement dans la Resource. Sans lui : `unknown_service:node` dans Jaeger.

### Span manuel dans `order-service.ts`

```typescript
// src/services/order-service.ts — extrait instrumenté
import { trace, SpanStatusCode } from '@opentelemetry/api';

// Le service métier n'importe QUE l'API OTel (jamais le SDK) → découplé, no-op si pas de SDK.
const tracer = trace.getTracer('tribuzen-orders', '1.0.0');

export async function createOrder(userId: string, items: string[]) {
  // startActiveSpan installe le span comme contexte courant :
  // tout span créé pendant le callback (ex: requête DB auto-instrumentée) devient son ENFANT.
  return tracer.startActiveSpan('createOrder', async (span) => {
    // Attributs métier — utiles pour filtrer/analyser dans Jaeger.
    span.setAttribute('user.id', userId);
    span.setAttribute('order.item_count', items.length);
    try {
      const order = await persistOrder(userId, items); // span DB enfant (auto)
      span.setStatus({ code: SpanStatusCode.OK });
      return order;
    } catch (err) {
      // recordException attache la stack au span ; setStatus ERROR le colore en rouge dans Jaeger.
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err; // on relance : l'erreur métier n'est pas avalée
    } finally {
      // OBLIGATOIRE : startActiveSpan ne ferme pas le span pour toi.
      // Sans end(), le span n'est jamais exporté et fuit en mémoire.
      span.end();
    }
  });
}
```

### `config/otel-collector/config.yaml`

```yaml
# config/otel-collector/config.yaml — corrigé (traces vers Jaeger)
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }   # l'app exporte ici

processors:
  memory_limiter:            # TOUJOURS en premier : garde-fou OOM avant tout traitement
    check_interval: 1s
    limit_mib: 512
  batch:                     # regroupe les spans avant export (indispensable en prod)
    timeout: 5s
    send_batch_size: 1024

exporters:
  otlp/jaeger:               # Jaeger accepte l'OTLP natif (COLLECTOR_OTLP_ENABLED=true)
    endpoint: jaeger:4317    # nom de service docker, port gRPC
    tls:
      insecure: true         # réseau docker local, pas de TLS
  debug:                     # affiche les spans dans les logs du Collector (dev/debug)
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]   # ordre = ordre d'exécution
      exporters: [otlp/jaeger, debug]        # déclarer un exporter ne suffit PAS : il faut le câbler ici
```

**Pourquoi ce corrigé est correct :**
- L'app exporte vers le **Collector** (4318), pas vers Jaeger — changer de backend = éditer `otlp/jaeger.endpoint`, pas l'app.
- `memory_limiter` avant `batch` : il doit rejeter avant le travail coûteux.
- L'exporter `debug` est **listé dans la pipeline** — sinon il serait ignoré (piège #5 du module).
- Le span manuel `createOrder` s'imbrique automatiquement sous le span HTTP auto grâce à `startActiveSpan` : aucune propagation de contexte à écrire à la main (module 04).

**Vérification finale (oracle visuel) :** dans Jaeger, ouvrir la trace `POST /orders` → arbre à 3 niveaux : `POST /orders` (auto) › `createOrder` (manuel, attributs `user.id`/`order.item_count`) › requête DB (auto). En cas d'erreur, `createOrder` est rouge avec l'exception. C'est le coach qui valide cet arbre en session.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. **En 25 minutes**, réinstrumente la route `/products` avec un span manuel `listProducts` + attribut `products.count`.
2. **Ajoute une pipeline `metrics`** dans le Collector : exporter `prometheus` sur `:8889`, et un compteur OTel `tribuzen.orders.created` incrémenté dans `createOrder`.
3. **Change de backend** : remplace l'exporter Jaeger par un exporter `otlp` vers un second Collector (ou commente-le et n'exporte qu'en `debug`) — **sans toucher une seule ligne de l'app**. Prouve que l'app n'a pas bougé (`git diff` sur `demo-app/` vide).

**Critère de réussite :** le compteur apparaît sur `http://localhost:8889/metrics`, la trace `/products` montre `listProducts`, et le `git diff` de l'app est vide après le changement de backend.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette instrumentation vit ici :

```
tribuzen/
  apps/
    api/
      instrumentation.ts          ← NodeSDK + OTLPTraceExporter, chargé via --import
      src/services/
        order-service.ts          ← span manuel createOrder + compteur OTel
  infra/
    otel-collector/config.yaml    ← receivers otlp / processors / exporters (Jaeger + Prometheus)
```

**Différences par rapport au lab :**
- L'endpoint OTLP viendra d'une variable d'env d'infra (`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`), pas d'une URL en dur.
- La Resource portera `service.version` et `deployment.environment` (via `OTEL_RESOURCE_ATTRIBUTES`) pour distinguer staging/prod.
- Les logs Pino (module 01) seront corrélés aux traces par `trace_id` — brancher l'injection du trace context dans le logger.

**Commit cible :**
```
feat(obs): instrumente l'API en OpenTelemetry (auto + span createOrder) + route Collector vers Jaeger
```

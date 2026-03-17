# Distributed Tracing & OpenTelemetry

## Objectifs pedagogiques

- Comprendre pourquoi le tracing distribue est indispensable dans les architectures microservices
- Maîtriser les concepts fondamentaux : Trace, Span, SpanContext
- Apprehender les relations parent-enfant entre spans
- Connaître le standard W3C Trace Context et la propagation du contexte
- Installer et configurer l'OpenTelemetry SDK pour Node.js
- Utiliser l'auto-instrumentation pour tracer automatiquement les appels HTTP, DB, etc.
- Créer des spans manuels pour le code metier
- Enrichir les spans avec des attributs et des events
- Déployer Jaeger comme backend de traces
- Instrumenter la demo-app avec OpenTelemetry de bout en bout

---

## Pourquoi le tracing distribue ?

### Le problème des microservices

Quand une requête utilisateur traverse 5, 10 ou 15 services, identifier la cause d'une erreur ou d'un ralentissement devient un casse-tete.

```typescript
// Parcours d'une commande dans notre architecture
// Utilisateur → API Gateway → Order Service → Inventory Service
//                                           → Payment Service → Bank API
//                                           → Notification Service → Email Provider

// La requete prend 3 secondes. Ou est le probleme ?
// - L'API Gateway ?
// - Le Order Service ?
// - Le Payment Service qui attend la Bank API ?
// - Le Notification Service ?

// Les logs vous montrent des evenements isoles par service.
// Les metriques vous montrent des agregats par service.
// Seule une TRACE vous montre le parcours complet de CETTE requete.
```

### L'analogie FedEx

Imaginez un colis FedEx. A chaque étape, il est scanne :

1. **Depart** : entrepot Paris → scan (timestamp, lieu, statut)
2. **Transit** : centre de tri CDG → scan
3. **Vol** : CDG → JFK → scan
4. **Livraison** : camion local → scan
5. **Arrive** : porte du client → scan final

Chaque scan est un **span**. L'ensemble des scans forme la **trace**. Le numéro de suivi est le **traceId**. A tout moment, vous pouvez voir exactement ou en est le colis et combien de temps chaque étape a pris.

Le tracing distribue fait exactement la même chose pour vos requêtes.

---

## Concepts fondamentaux

### Trace

Une trace represente le **parcours complet** d'une requête a travers le système. C'est un arbre de spans.

```typescript
// Representation conceptuelle d'une trace
interface Trace {
  traceId: string;  // Identifiant unique de 32 caracteres hex
  spans: Span[];    // L'ensemble des spans de cette trace
}

// Exemple de traceId : "4bf92f3577b34da6a3ce929d0e0e4736"
```

### Span

Un span represente une **unite de travail** : un appel HTTP, une requête SQL, un appel de fonction. Il à un debut, une fin, et des metadonnees.

```typescript
// Structure conceptuelle d'un span
interface Span {
  traceId: string;      // Appartient a quelle trace
  spanId: string;       // Identifiant unique du span (16 chars hex)
  parentSpanId?: string; // Le span parent (undefined pour le root span)
  operationName: string; // Ex: "POST /api/orders", "db.query"
  startTime: number;     // Timestamp de debut
  endTime: number;       // Timestamp de fin
  duration: number;      // endTime - startTime
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];   // Evenements ponctuels dans le span
}

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}
```

### SpanContext

Le SpanContext contient les informations de propagation : le traceId et le spanId. C'est ce qui permet de relier les spans entre services.

```typescript
interface SpanContext {
  traceId: string;   // 32 hex chars
  spanId: string;    // 16 hex chars
  traceFlags: number; // 01 = sampled, 00 = not sampled
  traceState?: string; // Metadata vendor-specific optionnelle
}
```

### Relations parent-enfant

Les spans forment un arbre. Le premier span de la trace est le **root span**. Chaque span peut avoir des enfants.

```
Trace: 4bf92f3577b34da6a3ce929d0e0e4736

[Root Span] POST /api/orders (350ms)
  ├── [Child] validateOrder (15ms)
  ├── [Child] checkInventory (80ms)
  │     └── [Child] db.query SELECT stock (60ms)
  ├── [Child] processPayment (200ms)
  │     └── [Child] HTTP POST bank-api.com/charge (180ms)
  └── [Child] sendConfirmation (40ms)
        └── [Child] HTTP POST email-provider.com/send (30ms)

// On voit immediatement que processPayment (200ms) est le goulot
// d'etranglement, et plus precisement l'appel a la bank API (180ms).
```

---

## W3C Trace Context

Le standard [W3C Trace Context](https://www.w3.org/TR/trace-context/) définit comment propager le contexte de trace entre services via des headers HTTP.

### Le header traceparent

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              │  │                                │                │
              │  │                                │                └─ trace-flags (01 = sampled)
              │  │                                └─ parent-span-id (16 hex)
              │  └─ trace-id (32 hex)
              └─ version (toujours 00 actuellement)
```

### Propagation entre services

```typescript
// Service A envoie une requete a Service B
// Le SDK OpenTelemetry ajoute automatiquement le header traceparent

// Service A → HTTP GET http://service-b/api/data
// Headers envoyes:
//   traceparent: 00-abc123...def-span1234...-01

// Service B recoit la requete
// Le SDK OpenTelemetry lit le header et cree un nouveau span
// qui est enfant du span de Service A

// Service B → HTTP GET http://service-c/api/more-data
// Headers envoyes:
//   traceparent: 00-abc123...def-span5678...-01
//                    ^-- meme trace-id ! Le span-id a change.
```

### Le header tracestate (optionnel)

```
tracestate: vendor1=value1,vendor2=value2
```

Le `tracestate` permet à chaque vendor d'ajouter ses propres metadonnees sans casser la propagation.

---

## OpenTelemetry SDK pour Node.js

OpenTelemetry (OTel) est le standard open-source pour l'instrumentation. Il fournit des APIs et SDKs pour tous les langages.

### Installation

```bash
npm install @opentelemetry/api \
            @opentelemetry/sdk-node \
            @opentelemetry/sdk-trace-node \
            @opentelemetry/exporter-trace-otlp-http \
            @opentelemetry/resources \
            @opentelemetry/semantic-conventions \
            @opentelemetry/auto-instrumentations-node
```

### Configuration de base

```typescript
// src/tracing.ts — a charger AVANT tout autre import
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'demo-app',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    // URL de l'OTel Collector ou directement Jaeger
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Configuration fine des auto-instrumentations
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health', '/metrics'], // Ne pas tracer les health checks
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
});

// Demarrer le SDK
sdk.start();

// Arret propre
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OTel SDK shut down'))
    .catch((err) => console.error('Error shutting down OTel SDK', err))
    .finally(() => process.exit(0));
});

export default sdk;
```

### Charger le tracing au démarrage

```typescript
// demo-app/index.ts
// IMPORTANT : le tracing doit etre importe AVANT Express et les autres modules
import './tracing';

import express from 'express';
// ... reste de l'application
```

::: warning Attention
L'import de la configuration OTel **doit** etre le tout premier import de votre application. Si Express ou d'autres modules sont importes avant, l'auto-instrumentation ne pourra pas les patcher et les traces seront incompletes.
:::

---

## Auto-instrumentation

L'auto-instrumentation est la magie d'OpenTelemetry : sans modifier votre code, le SDK patch automatiquement les bibliotheques courantes pour créer des spans.

```typescript
// Biblioteques auto-instrumentees par @opentelemetry/auto-instrumentations-node :
// - http / https        → spans pour chaque requete HTTP entrante et sortante
// - express             → spans pour chaque route Express
// - pg (PostgreSQL)     → spans pour chaque requete SQL
// - mysql2              → spans pour chaque requete SQL
// - redis / ioredis     → spans pour chaque commande Redis
// - mongodb             → spans pour chaque operation MongoDB
// - grpc                → spans pour chaque appel gRPC
// - aws-sdk             → spans pour chaque appel AWS

// Exemple : sans aucun code supplementaire, un appel HTTP sortant genere :
// Span: "HTTP GET"
//   Attributes:
//     http.method = "GET"
//     http.url = "https://api.example.com/data"
//     http.status_code = 200
//     http.response_content_length = 1234
//     net.peer.name = "api.example.com"
//     net.peer.port = 443
```

---

## Spans manuels (custom instrumentation)

L'auto-instrumentation couvre les appels I/O, mais pour le code metier, vous devez créer des spans manuellement.

```typescript
// src/services/order.service.ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

// Obtenir un tracer nomme pour votre service
const tracer = trace.getTracer('order-service', '1.0.0');

export async function createOrder(userId: string, items: OrderItem[]): Promise<Order> {
  // Creer un span qui devient automatiquement le span courant
  return tracer.startActiveSpan('createOrder', async (span) => {
    try {
      // Ajouter des attributs metier
      span.setAttribute('user.id', userId);
      span.setAttribute('order.items_count', items.length);
      span.setAttribute('order.total_amount', calculateTotal(items));

      // Etape 1 : validation
      const validationResult = await tracer.startActiveSpan('validateOrder', async (validationSpan) => {
        validationSpan.setAttribute('validation.rules_count', 5);
        const result = await validateItems(items);
        validationSpan.end();
        return result;
      });

      // Etape 2 : verification du stock
      await tracer.startActiveSpan('checkInventory', async (inventorySpan) => {
        inventorySpan.setAttribute('inventory.items_to_check', items.length);
        await checkStock(items);
        inventorySpan.end();
      });

      // Etape 3 : traitement du paiement
      const payment = await tracer.startActiveSpan('processPayment', async (paymentSpan) => {
        paymentSpan.setAttribute('payment.method', 'card');
        paymentSpan.setAttribute('payment.amount', calculateTotal(items));
        const result = await chargeCard(userId, calculateTotal(items));
        paymentSpan.end();
        return result;
      });

      // Ajouter un event pour marquer un moment cle
      span.addEvent('order_confirmed', {
        'order.id': payment.orderId,
        'payment.transaction_id': payment.transactionId,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return { id: payment.orderId, items, userId, status: 'confirmed' };

    } catch (error) {
      // Enregistrer l'erreur dans le span
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;

    } finally {
      span.end(); // Toujours terminer le span
    }
  });
}
```

---

## Attributs et events de span

### Attributs (metadonnees permanentes du span)

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('demo-app');

tracer.startActiveSpan('processOrder', (span) => {
  // Attributs standards (conventions semantiques OpenTelemetry)
  span.setAttribute('http.method', 'POST');
  span.setAttribute('http.url', '/api/orders');
  span.setAttribute('http.status_code', 201);

  // Attributs metier personnalises
  span.setAttribute('order.id', 'ord-123');
  span.setAttribute('order.item_count', 3);
  span.setAttribute('order.total', 149.99);
  span.setAttribute('customer.tier', 'premium');
  span.setAttribute('payment.method', 'credit_card');

  // Attributs d'infrastructure
  span.setAttribute('deployment.region', 'eu-west-1');
  span.setAttribute('k8s.pod.name', 'order-service-abc123');

  span.end();
});
```

### Events (moments ponctuels dans un span)

```typescript
tracer.startActiveSpan('processOrder', async (span) => {
  // Un event marque un moment precis dans la vie du span
  span.addEvent('validation_started');

  await validateOrder(order);
  span.addEvent('validation_completed', {
    'validation.rules_passed': 5,
    'validation.duration_ms': 12,
  });

  span.addEvent('payment_initiated', {
    'payment.provider': 'stripe',
    'payment.amount': 149.99,
  });

  await processPayment(order);
  span.addEvent('payment_completed', {
    'payment.transaction_id': 'txn_abc123',
  });

  span.end();
});
```

::: tip A retenir
Les **attributs** decrivent le span dans son ensemble (comme des colonnes dans une base de donnees). Les **events** marquent des moments spécifiques au sein du span (comme des logs horodates). Utilisez les attributs pour le filtrage et les events pour le detail chronologique.
:::

---

## Jaeger comme backend de traces

[Jaeger](https://www.jaegertracing.io/) est un système de tracing distribue open-source, créé par Uber. C'est l'un des backends les plus populaires pour OpenTelemetry.

### Docker Compose avec Jaeger

```yaml
# docker-compose.yml (extrait)
services:
  jaeger:
    image: jaegertracing/all-in-one:1.65
    ports:
      - '16686:16686'   # UI Web
      - '4317:4317'     # OTLP gRPC
      - '4318:4318'     # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

### Configuration OTel pour Jaeger

```typescript
// L'exporteur OTLP HTTP fonctionne directement avec Jaeger
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces', // Jaeger OTLP HTTP endpoint
});
```

### Explorer les traces dans Jaeger UI

Accedez a `http://localhost:16686` pour l'interface Jaeger :

1. **Search** : selectionnez le service (`demo-app`), une operation (ex: `POST /api/orders`), et une plage de temps
2. **Trace Detail** : cliquez sur une trace pour voir l'arbre de spans
3. **Span Detail** : cliquez sur un span pour voir ses attributs et events
4. **Compare** : selectionnez deux traces pour comparer leurs structures
5. **Dependencies** : visualisez le graphe de dépendances entre services

```
Jaeger UI — Vue d'une trace :

▼ POST /api/orders (demo-app) ─────────────────────── 350ms
    ▼ validateOrder (demo-app) ──── 15ms
    ▼ checkInventory (demo-app) ──────── 80ms
        ▼ pg.query SELECT (pg) ─────── 60ms
    ▼ processPayment (demo-app) ───────────────── 200ms
        ▼ HTTP POST bank-api.com (http) ────────── 180ms
    ▼ sendConfirmation (demo-app) ──── 40ms
        ▼ HTTP POST email.com (http) ── 30ms
```

---

## Instrumentation complete de la demo-app

```typescript
// src/tracing.ts — Configuration complete
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {},
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'demo-app',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  spanProcessors: [
    new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health', '/metrics', '/ready'],
        requestHook: (span, request) => {
          // Enrichir les spans HTTP avec du contexte supplementaire
          span.setAttribute('http.request_id',
            (request as any).headers?.['x-request-id'] || 'unknown'
          );
        },
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
});

sdk.start();
console.log('OpenTelemetry tracing initialized');

const shutdown = async () => {
  await sdk.shutdown();
  console.log('OpenTelemetry shut down gracefully');
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default sdk;
```

---

## Bonnes pratiques

- **Importez le tracing en premier** — avant Express, avant les clients DB, avant tout
- **Utilisez l'auto-instrumentation** pour couvrir les appels I/O sans effort
- **Ajoutez des spans manuels** pour le code metier significatif
- **Nommez vos spans clairement** : `createOrder`, `validatePayment`, pas `doWork`
- **Ajoutez des attributs metier** : orderId, userId, amount — ils permettent de filtrer dans Jaeger
- **Enregistrez les exceptions** avec `span.recordException()` pour voir les erreurs dans la trace
- **Terminez toujours vos spans** avec `span.end()` — un span non termine est un span perdu
- **Utilisez `startActiveSpan`** plutot que `startSpan` — il géré automatiquement le contexte parent
- **Configurez le BatchSpanProcessor** pour la production — il envoie les traces par lots plutot qu'une par une
- **Ne tracez pas les health checks** — ils polluent les traces sans valeur ajoutee

::: tip A retenir
Le tracing distribue est le troisieme pilier de l'observabilité. Il repond à la question que ni les logs ni les metriques ne peuvent résoudre : "Quel chemin a pris cette requête spécifique, et ou a-t-elle ralenti ou echoue ?". OpenTelemetry est le standard. Jaeger est le backend. Le `traceId` est le fil qui relie tout.
:::

---

## Aller plus loin : concepts expert

### Head-based vs Tail-based sampling

Le sampling est la decision la plus critique en tracing a grande echelle. A 10 000 requêtes/seconde, stocker toutes les traces est impossible. Deux stratégies existent :

**Head-based sampling** (decision au debut de la trace) :

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

// Garder 10% des traces — decision prise a la creation du root span
const sampler = new TraceIdRatioBasedSampler(0.1);

// Avantage : simple, performant, decide immediatement
// Inconvenient : vous ratez 90% des traces, y compris les erreurs rares
```

Le problème ? Si une erreur survient dans 0.01% des requêtes et que vous echantillonnez 10%, vous ne verrez qu'une erreur sur 100. Les pannes rares — les plus difficiles a debugger — disparaissent.

**Tail-based sampling** (decision à la fin de la trace) :

```typescript
// Configuration du Collector OTel — tail_sampling processor
// Voir module 08 pour la config YAML complete
//
// Logique :
// 1. Le Collector bufferise toutes les traces pendant 30s
// 2. Quand tous les spans d'une trace sont arrives :
//    - Si la trace contient une erreur → GARDER (100%)
//    - Si la latence depasse le p99 → GARDER (100%)
//    - Sinon → echantillonner a 5%
```

```typescript
// Conceptuellement, le tail-based sampling fait ceci :
interface SamplingDecision {
  traceId: string;
  keep: boolean;
  reason: string;
}

function decideSampling(trace: CompletedTrace): SamplingDecision {
  // Regle 1 : garder toutes les traces avec erreurs
  if (trace.spans.some(s => s.status === 'ERROR')) {
    return { traceId: trace.traceId, keep: true, reason: 'contains_error' };
  }

  // Regle 2 : garder les traces lentes (> p99 historique)
  if (trace.totalDuration > 2000) {
    return { traceId: trace.traceId, keep: true, reason: 'high_latency' };
  }

  // Regle 3 : garder les traces avec des operations rares
  if (trace.spans.some(s => s.operationName.includes('payment'))) {
    return { traceId: trace.traceId, keep: true, reason: 'critical_operation' };
  }

  // Regle 4 : echantillonner le reste a 5%
  const hash = hashTraceId(trace.traceId);
  return {
    traceId: trace.traceId,
    keep: hash % 20 === 0,
    reason: 'probabilistic_5pct',
  };
}
```

::: warning Cout du tail-based sampling
Le tail-based sampling exige que le Collector bufferise toutes les traces en mémoire pendant une fenêtre (typiquement 30-60s). Cela consomme beaucoup de RAM. Pour 50 000 traces/seconde avec 30s de buffer, comptez 4-8 Go de mémoire. C'est un compromis a évaluer sérieusement.
:::

### Propagation dans les systèmes non-HTTP

Le tracing ne se limite pas aux appels HTTP. En production, les requêtes traversent aussi des files de messages, des caches, des bases de donnees :

```typescript
// Propagation via Kafka/RabbitMQ : injecter le contexte dans les headers du message
import { propagation, context } from '@opentelemetry/api';

function publishMessage(queue: string, payload: unknown): void {
  const headers: Record<string, string> = {};

  // Injecter le contexte de trace dans les headers du message
  propagation.inject(context.active(), headers);

  // headers contient maintenant { traceparent: '00-abc...', tracestate: '...' }
  broker.publish(queue, { payload, headers });
}

// Cote consommateur : extraire le contexte et continuer la trace
function consumeMessage(msg: { payload: unknown; headers: Record<string, string> }): void {
  const extractedContext = propagation.extract(context.active(), msg.headers);

  // Creer un span enfant dans le contexte de la trace originale
  context.with(extractedContext, () => {
    tracer.startActiveSpan('process_message', (span) => {
      processPayload(msg.payload);
      span.end();
    });
  });
}
```

### Le tracing en pratique : patterns avances

**Pattern 1 — Trace-based testing** : utiliser les traces pour valider le comportement en intégration :

```typescript
// Verifier qu'une requete API genere bien les spans attendus
function assertTraceShape(trace: Trace): void {
  const spans = trace.spans;
  assert(spans.some(s => s.operationName === 'HTTP GET /api/orders'));
  assert(spans.some(s => s.operationName === 'pg.query'));
  assert(spans.some(s => s.attributes.get('db.statement')?.toString().includes('SELECT')));
  assert(spans.every(s => s.status !== 'ERROR'));
}
```

**Pattern 2 — Span links** : relier des traces independantes (ex: une requête API qui declenche un job asynchrone) :

```typescript
import { SpanKind } from '@opentelemetry/api';

// La requete API cree la commande
const apiSpan = tracer.startSpan('POST /api/orders');
const apiContext = apiSpan.spanContext();

// Plus tard, le worker asynchrone traite la commande
// Il cree une NOUVELLE trace mais avec un LINK vers la trace API
const workerSpan = tracer.startSpan('process_order_async', {
  kind: SpanKind.CONSUMER,
  links: [{ context: apiContext }], // lien vers la trace originale
});
```

::: tip Référence SRE
Le Google SRE Workbook (Chapitre 11, "Managing Load") explique comment les traces sont utilisees pour identifier les "long tail latencies" — ces requêtes qui prennent 10x plus longtemps que la mediane. Sans tracing, ces anomalies sont invisibles dans les metriques agregees. Le sampling tail-based est la clé pour les capturer.
:::

---

## Prochaines étapes

- [Lab 06 — Instrumenter la demo-app avec OpenTelemetry et Jaeger](/labs/lab-06-tracing-opentelemetry/README)
- [Quiz 06 — Distributed Tracing](/quizzes/quiz-06-distributed-tracing)
- [Module suivant — Sentry Error Tracking](/modules/07-sentry-error-tracking)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 06 distributed tracing](../screencasts/screencast-06-distributed-tracing.md)
2. **Lab** : [lab-06-tracing-opentelemetry](../labs/lab-06-tracing-opentelemetry/README)
3. **Visualisation** : [Three Pillars](../visualizations/three-pillars.html)
4. **Visualisation** : [Distributed Trace](../visualizations/distributed-trace.html)
5. **Quiz** : [quiz 06 distributed tracing](../quizzes/quiz-06-distributed-tracing.html)
:::

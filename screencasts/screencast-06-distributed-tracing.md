# Screencast 07 — Distributed Tracing avec OpenTelemetry

## Informations
- **Duree estimee** : 18-22 min
- **Module** : `modules/07-distributed-tracing.md`
- **Lab associe** : Lab 07
- **Prerequis** : Screencast 06

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Desktop lance et fonctionnel
- [ ] Fichier `docker-compose.tracing.yml` ouvert
- [ ] Fichier `demo-app/src/lib/tracing.ts` pret a etre cree
- [ ] Navigateur ouvert avec onglets pour `localhost:3000` et `localhost:16686` (Jaeger)

## Script

### [00:00-02:00] Introduction

> Nous avons couvert les logs et les metriques — les deux premiers piliers de l'observabilite. Aujourd'hui, nous attaquons le troisieme pilier : les traces distribuees. Quand une requete traverse plusieurs services, les logs vous montrent des evenements isoles, les metriques vous montrent des agregats. Seule une trace vous montre le parcours complet de cette requete precise.

> L'analogie est celle d'un colis FedEx. A chaque etape, le colis est scanne : entrepot, centre de tri, vol, camion de livraison, porte du client. Chaque scan est un span. L'ensemble des scans forme la trace du colis. Si le colis a mis 5 jours au lieu de 2, vous pouvez voir exactement ou il a ete bloque.

### [02:00-05:00] Concepts fondamentaux — Trace, Span, SpanContext

**Action** : Ecrire les definitions dans un fichier scratch.

```typescript
// Une TRACE represente le parcours complet d'une requete
// Elle est composee de SPANS — des unites de travail

interface Span {
  traceId: string;       // Identifiant unique de la trace (partage entre tous les spans)
  spanId: string;        // Identifiant unique de ce span
  parentSpanId?: string; // Lien vers le span parent (undefined pour le root span)
  operationName: string; // Ex: "GET /api/orders", "db.query", "http.request"
  startTime: number;     // Debut de l'operation
  duration: number;      // Duree en millisecondes
  status: 'OK' | 'ERROR';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, string> }>;
}

// Exemple de trace pour une commande :
// [Root]  GET /api/orders          (traceId: abc123, spanId: 001)
//   [Child]  validateOrder          (traceId: abc123, spanId: 002, parentSpanId: 001)
//   [Child]  db.query SELECT        (traceId: abc123, spanId: 003, parentSpanId: 001)
//   [Child]  http.request /payments (traceId: abc123, spanId: 004, parentSpanId: 001)
//     [Child]  processPayment        (traceId: abc123, spanId: 005, parentSpanId: 004)
```

> Le traceId est le fil conducteur — il est identique pour tous les spans de la meme requete. Le parentSpanId cree la hierarchie parent-enfant. C'est grace a ces liens que Jaeger peut afficher la vue en cascade (waterfall).

### [05:00-09:00] Installer et configurer l'OpenTelemetry SDK

**Action** : Installer les dependances OpenTelemetry.

```bash
npm install @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions
```

**Action** : Creer le fichier `demo-app/src/lib/tracing.ts`.

```typescript
// demo-app/src/lib/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'demo-app',
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});

export { sdk };
```

> Trois points cles ici. Premierement, l'auto-instrumentation detecte automatiquement les librairies utilisees — Express, HTTP, etc. — et cree des spans sans modifier votre code applicatif. Deuxiemement, le Resource identifie votre service dans les traces. Troisiemement, l'exporter OTLP envoie les traces au Collector ou directement a Jaeger.

> Ce fichier doit etre importe en tout premier, avant Express et toutes les autres librairies. C'est essentiel pour que le monkey-patching de l'auto-instrumentation fonctionne.

### [09:00-12:00] Ajouter des spans manuels pour la logique metier

**Action** : Ouvrir `demo-app/src/routes/orders.ts` et ajouter des spans manuels.

```typescript
// demo-app/src/routes/orders.ts
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('demo-app', '1.0.0');

router.post('/', async (req, res) => {
  // Creer un span manuel pour la logique metier
  const span = tracer.startSpan('createOrder', {
    attributes: {
      'order.item': req.body.item,
      'order.quantity': req.body.quantity,
    },
  });

  try {
    // Sous-span pour la validation
    const validationSpan = tracer.startSpan('validateOrder');
    const isValid = validateOrder(req.body);
    validationSpan.setAttribute('order.valid', isValid);
    validationSpan.end();

    if (!isValid) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid order' });
      span.end();
      return res.status(400).json({ error: 'Invalid order' });
    }

    // Sous-span pour la sauvegarde
    const saveSpan = tracer.startSpan('saveOrder');
    const order = await saveOrder(req.body);
    saveSpan.setAttribute('order.id', order.id);
    saveSpan.end();

    span.setAttribute('order.id', order.id);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    res.status(201).json(order);
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
    span.recordException(error as Error);
    span.end();
    res.status(500).json({ error: 'Internal error' });
  }
});
```

> Les spans manuels ajoutent de la visibilite sur votre logique metier. L'auto-instrumentation capture les appels HTTP et les requetes DB, mais elle ne sait pas ce que fait votre code entre les deux. Le span `validateOrder` et le span `saveOrder` rendent visible le detail de l'operation.

### [12:00-15:00] Lancer Jaeger et visualiser les traces

**Action** : Lancer la stack de tracing avec Docker Compose.

```bash
docker compose -f docker-compose.tracing.yml up -d
```

**Action** : Verifier que Jaeger est accessible.

```bash
docker compose -f docker-compose.tracing.yml ps
```

**Action** : Envoyer des requetes a la demo-app.

```bash
# Quelques requetes pour generer des traces
curl http://localhost:3000/api/products
curl http://localhost:3000/api/orders
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item":"laptop","quantity":2}'

# Requete qui genere une erreur
curl http://localhost:3000/api/orders/invalid-id
```

**Action** : Ouvrir Jaeger UI sur `http://localhost:16686`.

> Voici l'interface de Jaeger. Dans le menu deroulant Service, selectionnez `demo-app`. Cliquez sur Find Traces.

**Action** : Montrer la liste des traces et cliquer sur une trace.

> Chaque ligne est une trace complete. La duree totale est affichee a droite. Cliquons sur la trace du POST /api/orders.

### [15:00-18:00] Vue en cascade (Waterfall) et relations parent-enfant

**Action** : Explorer la vue waterfall dans Jaeger.

> Voici la vue en cascade. Le root span est en haut — c'est la requete HTTP entrante. En dessous, vous voyez les spans enfants : le middleware Express, notre span `createOrder`, puis `validateOrder` et `saveOrder`. Les barres horizontales montrent la duree de chaque span — vous voyez immediatement ou le temps est passe.

**Action** : Cliquer sur un span pour voir ses details.

> En cliquant sur un span, on voit ses attributs : `order.item`, `order.quantity`, `order.id`. Ces attributs sont ceux que nous avons ajoutes avec `setAttribute`. Ils donnent du contexte metier a la trace.

**Action** : Montrer la propagation de contexte en envoyant des requetes entre services.

```bash
# Envoyer une requete qui traverse plusieurs services
# Le traceId est propage automatiquement via le header W3C Trace Context
curl -v http://localhost:3000/api/orders 2>&1 | grep traceparent
```

> Le header `traceparent` contient le traceId et le spanId du parent. Quand votre service appelle un autre service via HTTP, le SDK injecte automatiquement ce header. Le service aval le lit, cree un span enfant avec le meme traceId, et la trace est complete de bout en bout. C'est la propagation de contexte W3C Trace Context — le standard utilise par OpenTelemetry.

### [18:00-20:00] Comparer une trace normale et une trace en erreur

**Action** : Dans Jaeger, filtrer les traces par tag `error=true`.

> Les traces en erreur sont marquees en rouge. Cliquons sur une trace en erreur. On voit immediatement quel span a echoue — il est marque avec un point rouge. Les logs d'exception sont attaches au span. Vous voyez le message d'erreur, la stack trace, tout ce qu'il faut pour diagnostiquer.

> Comparez cela avec les logs : vous devriez chercher dans des centaines de lignes, correler les requestId manuellement. Avec la trace, tout est visible d'un coup.

### [20:00-21:30] Recapitulatif

> Recapitulons. Une trace represente le parcours complet d'une requete a travers votre systeme. Elle est composee de spans — des unites de travail avec un debut, une duree et des attributs. L'auto-instrumentation capture les appels HTTP et DB automatiquement. Les spans manuels ajoutent de la visibilite sur votre logique metier.

> Jaeger affiche les traces en vue cascade — vous voyez immediatement ou le temps est passe et ou les erreurs se produisent. La propagation de contexte W3C Trace Context lie les spans entre les services.

> Dans le prochain module, nous decouvrirons l'OTel Collector — le composant central qui recoit, traite et route vos traces vers les backends. Faites le Lab 07 !

## Points d'attention pour l'enregistrement
- Le fichier tracing.ts doit etre importe AVANT toute autre librairie — bien insister sur ce point
- Montrer la vue waterfall de Jaeger clairement — c'est le moment "wow" de ce screencast
- Prendre le temps d'expliquer la relation parent-enfant entre spans avec le diagramme
- Comparer visuellement une trace OK et une trace en erreur dans Jaeger
- S'assurer que Docker Compose est lance avec Jaeger accessible sur le port 16686
- Envoyer suffisamment de requetes pour avoir des traces variees a montrer
- Expliquer le header traceparent et la propagation W3C — c'est un concept fondamental

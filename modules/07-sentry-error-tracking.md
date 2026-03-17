# Module 22 — Error Tracking avec Sentry

## Objectifs pedagogiques

- Comprendre le role de l'error tracking dans une stratégie d'observabilité
- Installer et configurer le SDK Sentry pour Node.js et les frameworks front
- Maîtriser les concepts : events, breadcrumbs, contexts, tags, fingerprinting
- Configurer les alertes et le triage des issues
- Intégrer Sentry avec OpenTelemetry
- Proteger les donnees sensibles (PII scrubbing, RGPD)

---

<details>
<summary>Rappel du module précédent</summary>

1. **Qu'est-ce que le distributed tracing et quel probleme resout-il ?**
   Le distributed tracing permet de suivre une requete de bout en bout a travers plusieurs services. Chaque service cree des spans (unites de travail) rattaches a une trace commune, ce qui permet de visualiser le parcours complet et d'identifier ou se situent les goulots d'etranglement.

2. **Quelle est la difference entre une trace, un span et un span context ?**
   Une trace represente le parcours complet d'une requete. Un span represente une operation individuelle (appel HTTP, requete DB, traitement). Le span context (trace ID + span ID + trace flags) est l'information propagee entre les services via les headers HTTP pour relier les spans entre eux.

3. **Comment OpenTelemetry propage-t-il le contexte entre les services ?**
   OpenTelemetry utilise le standard W3C Trace Context : le header `traceparent` contient le trace ID, le parent span ID et les flags de sampling. Chaque service extrait ce header, cree un nouveau span enfant, et re-propage le header vers les services en aval.

</details>

---

## 1. Pourquoi l'error tracking ?

### Le problème du logging seul

Le logging (modules 02-03) capture tout ce que vous decidez de logger. Mais en production :

```typescript
// Votre code peut planter la ou vous ne l'attendez pas
app.get('/api/products/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);
  res.json({ name: product.name }); // TypeError si product est null
});
```

Sans error tracking dedié :
- L'erreur apparait dans les logs... si vous loggez les erreurs non gerees
- Pas de stack trace du navigateur client
- Pas de contexte (quel utilisateur ? quel navigateur ? quelle action precedait ?)
- Pas de grouping : 1000 occurrences de la même erreur = 1000 lignes de log separees
- Pas d'alerte intelligente (nouvelle erreur vs erreur connue)

### Error tracking vs Logging vs APM

| Dimension | Logging (Pino/Loki) | Error Tracking (Sentry) | APM (Datadog/New Relic) |
|-----------|---------------------|-------------------------|-------------------------|
| **Focus** | Tout ce que vous loggez | Erreurs et exceptions | Performance des transactions |
| **Grouping** | Aucun (texte brut) | Intelligent (stack trace) | Par endpoint/service |
| **Contexte** | Ce que vous ajoutez | Automatique (device, user, breadcrumbs) | Automatique (traces) |
| **Alertes** | Regex/count sur logs | Nouvelle erreur, regression, spike | Latence, error rate, SLO |
| **Source maps** | Non | Oui (deobfuscation front) | Partiel |
| **Cout** | Faible (self-hosted) | Moyen (SaaS) ou gratuit (self-hosted) | Eleve (SaaS) |

### Sentry — Vue d'ensemble

Sentry est la plateforme d'error tracking la plus utilisee dans l'ecosysteme JavaScript. Creee en 2008 (initialement pour Django), elle supporte aujourd'hui 100+ langages et frameworks.

**Architecture** :

```
App (SDK Sentry)  →  Sentry Relay  →  Sentry Backend
  ↑                    (proxy)         (ingestion, processing)
  |                                         ↓
  |                                    Sentry UI
  |                                    (issues, alerts, dashboards)
  └── Source Maps (upload via CLI)
```

**Deployment** :
- **SaaS** : sentry.io (gratuit jusqu'a 5K erreurs/mois)
- **Self-hosted** : Docker Compose officiel (Kafka, PostgreSQL, Redis, ClickHouse)

---

## 2. Installation et configuration

### Node.js / Express

```bash
npm install @sentry/node
```

```typescript
// instrument.ts — DOIT etre importe en PREMIER
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',

  // Environnement
  environment: process.env.NODE_ENV || 'development',

  // Release — lie les erreurs a une version deployee
  release: `my-api@${process.env.npm_package_version}`,

  // Sampling : 100% des erreurs, 20% des transactions perf
  sampleRate: 1.0,
  tracesSampleRate: 0.2,

  // Hook avant envoi — filtrage, scrubbing
  beforeSend(event) {
    // Ne pas envoyer en dev
    if (process.env.NODE_ENV === 'development') return null;
    return event;
  },

  // Integrations
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
  ],
});
```

```typescript
// main.ts
import './instrument'; // PREMIER import
import express from 'express';

const app = express();

// Sentry request handler — DOIT etre le premier middleware
Sentry.setupExpressErrorHandler(app);

app.get('/api/products/:id', async (req, res) => {
  // Les erreurs sont automatiquement capturees
  const product = await db.findProduct(req.params.id);
  res.json(product);
});

// Sentry error handler — DOIT etre le dernier middleware d'erreur
app.use(Sentry.expressErrorHandler());

app.listen(3000);
```

### NestJS

```bash
npm install @sentry/nestjs @sentry/profiling-node
```

```typescript
// instrument.ts
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.RELEASE_VERSION,
  tracesSampleRate: 0.2,
});
```

```typescript
// main.ts
import './instrument';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Filtre global pour capturer les exceptions NestJS
  const { SentryGlobalFilter } = await import('@sentry/nestjs/setup');
  app.useGlobalFilters(new SentryGlobalFilter());

  await app.listen(3000);
}
bootstrap();
```

### React

```bash
npm install @sentry/react
```

```typescript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: '__DSN__',
  environment: import.meta.env.MODE,
  release: '__VERSION__',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

```tsx
// ErrorBoundary
import { ErrorBoundary } from '@sentry/react';

function App() {
  return (
    <ErrorBoundary fallback={<p>Une erreur est survenue.</p>}>
      <Router />
    </ErrorBoundary>
  );
}
```

### Vue

```bash
npm install @sentry/vue
```

```typescript
import * as Sentry from '@sentry/vue';
import { createApp } from 'vue';
import { createRouter } from 'vue-router';

const app = createApp(App);
const router = createRouter({ /* ... */ });

Sentry.init({
  app,
  dsn: '__DSN__',
  integrations: [
    Sentry.browserTracingIntegration({ router }),
  ],
  tracesSampleRate: 0.2,
});
```

### Angular

```bash
npm install @sentry/angular
```

```typescript
// main.ts
import * as Sentry from '@sentry/angular';

Sentry.init({
  dsn: '__DSN__',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.2,
});

// app.config.ts
import { APP_INITIALIZER, ErrorHandler } from '@angular/core';
import { createErrorHandler, TraceService } from '@sentry/angular';

export const appConfig = {
  providers: [
    { provide: ErrorHandler, useValue: createErrorHandler() },
    { provide: TraceService, deps: [Router] },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [TraceService],
      multi: true,
    },
  ],
};
```

---

## 3. Concepts clés

### Events et Exceptions

Un **event** Sentry est un signal envoye au serveur. Le type le plus courant est une **exception**.

```typescript
// Capture automatique — les erreurs non gerees sont capturees
throw new Error('Product not found');

// Capture manuelle
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error);
}

// Capture avec contexte additionnel
Sentry.captureException(error, {
  tags: { module: 'payments', priority: 'high' },
  extra: { orderId: '12345', amount: 99.99 },
  user: { id: '42', email: 'user@example.com' },
  level: 'error',
});

// Capture d'un message (pas une exception)
Sentry.captureMessage('Payment timeout after 30s', 'warning');
```

### Breadcrumbs

Les breadcrumbs sont un **fil d'Ariane** des actions qui ont precede l'erreur. Sentry en capture automatiquement (clics, navigation, requêtes HTTP, console.log).

```typescript
// Breadcrumbs automatiques (captures par le SDK)
// ✓ console.log/warn/error
// ✓ fetch/XHR requests
// ✓ DOM clicks (front)
// ✓ Navigation (front)

// Breadcrumbs manuels
Sentry.addBreadcrumb({
  category: 'cart',
  message: `Added product ${productId} to cart`,
  level: 'info',
  data: {
    productId,
    quantity,
    cartTotal: cart.total,
  },
});

// Plus tard, si une erreur survient lors du checkout,
// Sentry affichera la sequence :
// 1. User clicked "Add to cart"         (auto)
// 2. POST /api/cart/items → 200         (auto)
// 3. Added product abc123 to cart       (manual)
// 4. User clicked "Checkout"            (auto)
// 5. POST /api/checkout → 500           (auto)  ← ERREUR
```

### Contexts et Tags

```typescript
// Scope global — s'applique a tous les events
Sentry.setUser({
  id: '42',
  email: 'alice@example.com',
  username: 'alice',
  // segment, subscription, role...
});

Sentry.setTag('tenant', 'acme-corp');
Sentry.setTag('feature_flag', 'new-checkout-v2');

// Scope local — s'applique a un block
Sentry.withScope(scope => {
  scope.setTag('transaction', 'checkout');
  scope.setContext('order', {
    id: 'ORD-123',
    items: 3,
    total: 149.99,
  });
  Sentry.captureException(error);
});
```

**Tags vs Context** :
- **Tags** : indexees, filtrables, searchables. Utilisez pour les dimensions de recherche (tenant, environment, feature flag).
- **Context** : non indexees, affichees dans le detail de l'event. Utilisez pour les donnees riches (payload, state).

---

## 4. Source Maps

En production, le JavaScript front est minifie. Sans source maps, les stack traces sont illisibles.

```bash
# Installation
npm install @sentry/cli

# Upload des source maps
sentry-cli releases new 1.0.0
sentry-cli releases files 1.0.0 upload-sourcemaps ./dist --url-prefix '~/static/js'
sentry-cli releases finalize 1.0.0
```

Avec le plugin Vite/Webpack :

```typescript
// vite.config.ts
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  build: { sourcemap: true },
  plugins: [
    sentryVitePlugin({
      org: 'my-org',
      project: 'my-project',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

---

## 5. Fingerprinting et grouping

Sentry groupe automatiquement les erreurs similaires en **issues**. Le grouping est base sur la **stack trace** et le **type d'erreur**.

### Quand personnaliser le fingerprint ?

```typescript
// Par defaut : Sentry groupe par stack trace
// Mais parfois vous voulez un grouping different :

Sentry.captureException(error, {
  // Grouper par route + type d'erreur
  fingerprint: ['{{ default }}', req.route.path],
});

// Grouper toutes les erreurs de timeout ensemble
Sentry.captureException(error, {
  fingerprint: ['timeout-errors', service],
});

// Grouper par message (ignorer la stack trace)
Sentry.captureException(error, {
  fingerprint: [error.message],
});
```

### Issue states

| État | Description |
|------|-------------|
| **Unresolved** | Nouvelle erreur, a traiter |
| **Resolved** | Corrigee (re-ouverte si elle revient) |
| **Ignored** | Connue, pas prioritaire |
| **Archived** | Ne plus afficher |

La fonctionnalite **Regression** est puissante : si vous marquez une issue comme "resolved in release 1.2.0" et qu'elle reapparait en 1.3.0, Sentry créé une alerte de regression automatiquement.

---

## 6. Alerting

### Types d'alertes

```
Issue Alerts (basees sur les events)
├── First seen — Premiere occurrence d'une nouvelle erreur
├── Regression — Une erreur resolue reapparait
├── Frequency — Plus de N erreurs en X minutes
└── Custom — Conditions complexes

Metric Alerts (basees sur les metriques)
├── Error rate — Taux d'erreur > seuil
├── Transaction duration — P95 latence > seuil
└── Custom — Requete sur les metriques
```

### Configuration d'alerte

```yaml
# Exemple : alerte si plus de 50 erreurs en 5 minutes
- name: "High Error Rate"
  conditions:
    - type: event_frequency
      value: 50
      interval: 5m
  actions:
    - type: slack
      channel: "#alerts-production"
    - type: email
      targetType: team
  environment: production
  frequency: 30m  # ne pas re-alerter avant 30 min
```

---

## 7. Performance Monitoring

Sentry capture aussi les **transactions** (requêtes HTTP, navigations de page) et leurs **spans** (operations individuelles).

```typescript
// Backend — automatique avec l'integration HTTP
// Chaque requete cree une transaction avec des spans :
// Transaction: GET /api/products
//   ├── Span: db.query (SELECT * FROM products)
//   ├── Span: serialize (JSON.stringify)
//   └── Span: http.response

// Spans manuels pour les operations custom
const span = Sentry.startSpan(
  { name: 'cache.lookup', op: 'cache' },
  () => {
    return cache.get(key);
  },
);
```

### Web Vitals (front)

Sentry capture automatiquement les Core Web Vitals :
- **LCP** (Largest Contentful Paint)
- **FID** (First Input Delay)
- **CLS** (Cumulative Layout Shift)
- **TTFB** (Time To First Byte)
- **INP** (Interaction to Next Paint)

---

## 8. Sentry + OpenTelemetry

Depuis la version 8, Sentry utilise **OpenTelemetry sous le capot**. Vous pouvez envoyer des traces OTel a Sentry et vice versa.

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '__DSN__',
  // Sentry utilise automatiquement OTel pour le tracing
  tracesSampleRate: 0.2,
  integrations: [
    Sentry.httpIntegration(),
  ],
});

// Les spans OTel sont automatiquement envoyes a Sentry
// ET vous pouvez exporter vers Jaeger/Grafana Tempo en parallele
```

Pour envoyer a Sentry **et** a votre stack OTel :

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

Sentry.init({
  dsn: '__DSN__',
  tracesSampleRate: 1.0,
  // Ajouter un exporteur OTel additionnel
  integrations: [
    Sentry.openTelemetryIntegration({
      traceExporters: [
        new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' }),
      ],
    }),
  ],
});
```

---

## 9. PII Scrubbing et RGPD

### beforeSend — Filtrer les donnees sensibles

```typescript
Sentry.init({
  dsn: '__DSN__',
  beforeSend(event) {
    // Supprimer les cookies
    if (event.request?.cookies) {
      delete event.request.cookies;
    }

    // Supprimer les headers sensibles
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    // Scrubber les emails dans les breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(bc => ({
        ...bc,
        message: bc.message?.replace(
          /[\w.-]+@[\w.-]+\.\w+/g,
          '[EMAIL_REDACTED]',
        ),
      }));
    }

    return event;
  },

  beforeSendTransaction(event) {
    // Scrubber les transactions aussi
    return event;
  },
});
```

### Data Scrubbing cote serveur

Dans les paramètres du projet Sentry :
- **IP address** : ne pas stocker
- **User data** : anonymiser
- **Sensitive fields** : password, secret, token, credit_card, ssn
- **Safe fields** : id, timestamp, level (ne jamais scrubber)

### Consentement utilisateur (RGPD)

```typescript
// N'initialiser Sentry que si l'utilisateur a consenti
if (userConsent.errorTracking) {
  Sentry.init({ dsn: '__DSN__', /* ... */ });
}
```

---

## 10. Bonnes pratiques

### Sampling strategy

```typescript
Sentry.init({
  // 100% des erreurs — ne manquez aucune erreur
  sampleRate: 1.0,

  // Sampling dynamique pour les transactions
  tracesSampler: (samplingContext) => {
    // Toujours sampler les erreurs de paiement
    if (samplingContext.name?.includes('/api/payments')) return 1.0;

    // Health checks : jamais
    if (samplingContext.name?.includes('/health')) return 0;

    // Le reste : 10%
    return 0.1;
  },
});
```

### Environments et releases

```typescript
Sentry.init({
  environment: process.env.NODE_ENV,  // staging, production
  release: `api@${gitCommitSha}`,     // lie au commit

  // Associer le deploy
  // sentry-cli releases deploys api@abc123 new -e production
});
```

### Ce qu'il ne faut PAS faire

1. **Ne capturez pas les erreurs attendues** (404, validation) — elles polluent les issues
2. **N'envoyez pas les donnees en dev** — utilisez `beforeSend` pour filtrer
3. **Ne mettez pas le DSN dans le code** — variable d'environnement
4. **Ne sur-samplez pas les transactions** — le volume peut exploser le budget
5. **N'ignorez pas les regressions** — c'est la fonctionnalite la plus precieuse de Sentry

---

## Exercices

Passez au **Lab 23** pour mettre en pratique :
- Configuration Sentry (simulee)
- Capture d'exceptions avec contexte
- Breadcrumbs manuels
- PII scrubbing
- Fingerprinting personnalise
- Logique de sampling

---

## Ressources

- [Documentation Sentry Node.js](https://docs.sentry.io/platforms/javascript/guides/node/)
- [Documentation Sentry React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Documentation Sentry Vue](https://docs.sentry.io/platforms/javascript/guides/vue/)
- [Self-hosted Sentry](https://develop.sentry.dev/self-hosted/)
- [Sentry + OpenTelemetry](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/)
- [Data Management & GDPR](https://docs.sentry.io/security-legal-pii/scrubbing/)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 07 sentry error tracking](../screencasts/screencast-07-sentry-error-tracking.md)
2. **Lab** : [lab-07-sentry-error-tracking](../labs/lab-07-sentry-error-tracking/README)
3. **Quiz** : [quiz 07 sentry error tracking](../quizzes/quiz-07-sentry-error-tracking.html)
:::

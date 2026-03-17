# Module 24 — Instrumentation Nuxt et Next.js

> **Durée estimée** : 3h00
> **Difficulté** : 3/5
> **Prérequis** : Module 06 (Distributed Tracing), Module 08 (OTel Collector), Module 23 (Obs frontend)
> **Objectifs** :
> - Instrumenter une application Nuxt 3 avec OpenTelemetry
> - Instrumenter une application Next.js avec @vercel/otel
> - Tracer les rendus SSR et les API routes
> - Connecter le RUM frontend aux traces backend

---

## 1. OpenTelemetry pour Node.js

L'auto-instrumentation OTel instrumente automatiquement les modules Node.js courants (http, express, pg, mysql, redis...).

```typescript
// instrumentation.ts — À charger AVANT l'application
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'my-nuxt-app',
});

try {
  sdk.start();
} catch (err) {
  // Ne pas bloquer le démarrage de l'application si l'OTel Collector est injoignable
  console.warn('[OTel] SDK failed to start — tracing disabled:', (err as Error).message);
}
```

---

## 1.1 Logs structurés avec Pino

### Intégration Pino + OTel

Pino est le logger de référence dans l'écosystème Nitro/Nuxt. Le transport `pino-opentelemetry-transport` relaie chaque log vers le pipeline OTel en injectant automatiquement `trace_id`, `span_id` et `trace_flags` depuis le contexte actif.

```bash
pnpm add pino pino-opentelemetry-transport @opentelemetry/api
```

```typescript
// server/plugins/logger.ts
import pino from 'pino';
import { context, trace } from '@opentelemetry/api';

// Sérialiseur qui injecte le trace context W3C dans chaque entrée de log
function withTraceContext(obj: Record<string, unknown>): Record<string, unknown> {
  const span = trace.getActiveSpan();
  if (!span) return obj;

  const spanContext = span.spanContext();
  return {
    ...obj,
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    targets: [
      // Console lisible en développement
      ...(process.dev
        ? [{ target: 'pino-pretty', options: { colorize: true }, level: 'debug' }]
        : []),
      // Transport OTel : envoie vers le Collector configuré dans OTEL_EXPORTER_OTLP_ENDPOINT
      {
        target: 'pino-opentelemetry-transport',
        options: {
          resourceAttributes: {
            'service.name': process.env.OTEL_SERVICE_NAME ?? 'nuxt-app',
            'deployment.environment': process.env.NODE_ENV ?? 'development',
          },
        },
        level: 'info',
      },
    ],
  },
  // Mixin exécuté à chaque log : injecte les IDs de trace
  mixin(_mergeObject, _level) {
    return withTraceContext({});
  },
});

export default defineNitroPlugin(() => {
  // Rend le logger disponible via useLogger() dans les event handlers
  // (pattern Nitro : attach au globalThis ou utiliser provide/inject Nitro)
});
```

### Utilisation dans un event handler

```typescript
// server/api/users/[id].get.ts
import { logger } from '~/server/plugins/logger';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  logger.info({ userId: id }, 'Fetch user start');

  try {
    const user = await db.users.findById(id);
    if (!user) {
      logger.warn({ userId: id }, 'User not found');
      throw createError({ statusCode: 404, message: 'User not found' });
    }

    logger.info({ userId: id, email: user.email }, 'Fetch user success');
    return user;
  } catch (err) {
    logger.error({ userId: id, err }, 'Fetch user failed');
    throw err;
  }
});
```

### Résultat dans Grafana Loki

Chaque ligne de log JSON contient les champs `trace_id` et `span_id`, ce qui permet depuis Explore (Loki) de sauter directement vers la trace Tempo correspondante via le **Derived Fields** :

```
Derived field name : trace_id
Regex              : "trace_id":"(\w+)"
URL                : http://tempo:3200/api/traces/$${__value.raw}
```

---

## 2. Instrumentation Nuxt 3

### Server plugin pour le tracing

```typescript
// server/plugins/otel.ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('nuxt-server');

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const span = tracer.startSpan(`${event.method} ${event.path}`, {
      attributes: {
        'http.method': event.method,
        'http.url': event.path,
      },
    });
    event.context._otelSpan = span;
  });

  nitroApp.hooks.hook('afterResponse', (event) => {
    const span = event.context._otelSpan;
    if (span) {
      span.setAttributes({ 'http.status_code': event.node.res.statusCode });
      span.end();
    }
  });
});
```

### Tracer les composables

Le stub original n'injectait pas réellement le `traceparent`. Voici l'implémentation complète avec propagation W3C via `@opentelemetry/api` :

```typescript
// composables/useTracedFetch.ts
import { context, propagation, trace, SpanStatusCode } from '@opentelemetry/api';
import type { FetchContext } from 'ofetch';

/**
 * Wrapper autour de useFetch qui :
 * 1. Injecte le header W3C traceparent dans chaque requête sortante
 * 2. Ouvre un span client pour mesurer la latence
 * 3. Enregistre les erreurs avec span.recordException
 */
export function useTracedFetch<T>(url: string, opts?: Parameters<typeof useFetch<T>>[1]) {
  const tracer = trace.getTracer('nuxt-client');

  return useFetch<T>(url, {
    ...opts,

    onRequest({ options }: FetchContext) {
      // Récupérer les headers existants sous forme d'objet mutable
      const headers: Record<string, string> =
        options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : { ...((options.headers as Record<string, string> | undefined) ?? {}) };

      // Injecter le contexte de propagation W3C (traceparent + tracestate)
      propagation.inject(context.active(), headers);

      options.headers = headers;
    },

    onRequestError({ error }: FetchContext & { error: Error }) {
      const span = trace.getActiveSpan();
      if (span) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
    },

    onResponseError({ response }: FetchContext) {
      const span = trace.getActiveSpan();
      if (span && response) {
        span.setAttributes({ 'http.status_code': response.status });
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${response.status}`,
        });
      }
    },
  });
}
```

### Configuration OTel via runtimeConfig

Éviter de coder en dur l'URL de l'exporter : utiliser `useRuntimeConfig()` côté serveur (Nitro) et les variables d'environnement standard `OTEL_*` côté SDK.

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    // Privé (server-only)
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    otelServiceName: process.env.OTEL_SERVICE_NAME ?? 'nuxt-app',
    otelEnvironment: process.env.NODE_ENV ?? 'development',
    // Public (exposé au client)
    public: {
      otelClientEndpoint: process.env.NUXT_PUBLIC_OTEL_CLIENT_ENDPOINT ?? '',
    },
  },
});
```

```typescript
// server/plugins/otel.ts  (version complète avec runtimeConfig + error handling)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig();

  // Démarrage du SDK (idempotent : ne pas redémarrer si déjà actif)
  if (!sdk) {
    sdk = new NodeSDK({
      serviceName: config.otelServiceName,
      traceExporter: new OTLPTraceExporter({ url: `${config.otelEndpoint}/v1/traces` }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false }, // trop verbeux
        }),
      ],
    });
    try {
      sdk.start();
    } catch (err) {
      console.warn('[OTel] SDK failed to start — tracing disabled:', (err as Error).message);
    }
  }

  const tracer = trace.getTracer('nuxt-server');

  nitroApp.hooks.hook('request', (event) => {
    const span = tracer.startSpan(`${event.method} ${event.path}`, {
      attributes: {
        'http.method': event.method,
        'http.url': event.path,
        'http.scheme': event.node.req.headers['x-forwarded-proto'] ?? 'http',
        'net.host.name': event.node.req.headers.host ?? 'unknown',
      },
    });
    // Stocker le span ET le contexte actif pour pouvoir le restaurer
    event.context._otelSpan = span;
    event.context._otelCtx = trace.setSpan(context.active(), span);
  });

  nitroApp.hooks.hook('afterResponse', (event) => {
    const span = event.context._otelSpan as Span | undefined;
    if (!span) return;

    const status = event.node.res.statusCode;
    span.setAttributes({ 'http.status_code': status });

    if (status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
  });

  nitroApp.hooks.hook('error', (error, { event }) => {
    const span = event?.context._otelSpan as Span | undefined;
    if (!span) return;
    span.recordException(error as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    span.end();
  });
});

---

## 3. Instrumentation Next.js

### instrumentation.ts (Next.js 13.4+)

```typescript
// instrumentation.ts — racine du projet
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );

    const sdk = new NodeSDK({
      instrumentations: [getNodeAutoInstrumentations()],
      serviceName: 'my-next-app',
    });
    sdk.start();
  }
}
```

### @vercel/otel (simplification Vercel)

```typescript
// instrumentation.ts
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: 'my-next-app' });
}
```

---

## 3.1 Edge Runtime — Considérations Next.js

### Pourquoi l'OTel Node SDK ne fonctionne pas en Edge

Le middleware Next.js (`middleware.ts`) et les Route Handlers configurés avec `export const runtime = 'edge'` s'exécutent dans le **Edge Runtime** (V8 isolate, pas Node.js). Ce runtime n'a pas accès aux API Node.js (`process`, `async_hooks`, `perf_hooks`) dont dépend le SDK OTel.

| Contexte | SDK utilisable | Solution |
|---|---|---|
| `app/api/*` runtime Node | `@opentelemetry/sdk-node` | `instrumentation.ts` standard |
| `middleware.ts` (Edge) | ✗ | `@vercel/otel` + fetch natif |
| Route Handler `runtime='edge'` | ✗ | `@vercel/otel` + propagation manuelle |

### `@vercel/otel` pour l'Edge

`@vercel/otel` détecte automatiquement le runtime et utilise l'API OTel browser-compatible quand Node n'est pas disponible.

```typescript
// instrumentation.ts (racine du projet)
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'next-app',
    // Désactiver les instrumentations Node si Edge
    instrumentationConfig: {
      fetch: { propagateContextUrls: ['.*'] }, // instrumenter tous les fetch sortants
    },
  });
}
```

### Propagation manuelle dans un Edge middleware

Quand `@vercel/otel` ne peut pas injecter automatiquement, propager le contexte manuellement :

```typescript
// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Lire le traceparent entrant (injecté par le CDN/load-balancer)
  const traceparent = request.headers.get('traceparent');

  const requestHeaders = new Headers(request.headers);

  if (traceparent) {
    // Relayer le traceparent vers les requêtes downstream
    requestHeaders.set('traceparent', traceparent);
  } else {
    // Générer un traceparent synthétique si absent
    const traceId = crypto.randomUUID().replace(/-/g, '');
    const spanId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    requestHeaders.set('traceparent', `00-${traceId}-${spanId}-01`);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|favicon.ico).*)'],
};
```

### Instrumenter un fetch dans un Route Handler Edge

```typescript
// app/api/edge-data/route.ts
export const runtime = 'edge';

export async function GET(request: Request): Promise<Response> {
  const traceparent = request.headers.get('traceparent') ?? '';

  // Propager manuellement vers l'API downstream
  const upstream = await fetch('https://api.example.com/data', {
    headers: {
      traceparent,
      'content-type': 'application/json',
    },
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'upstream failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const data = await upstream.json();
  return Response.json(data);
}
```

---

## 4. Tracer les rendus SSR

```typescript
// Nuxt 3 : middleware serveur pour mesurer le SSR
export default defineEventHandler(async (event) => {
  const tracer = trace.getTracer('nuxt-ssr');
  return tracer.startActiveSpan('ssr-render', async (span) => {
    span.setAttribute('route', event.path);
    try {
      // Le rendu SSR se fait automatiquement
      // On mesure juste le temps total
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
});
```

### Custom spans pour le data fetching

```typescript
// server/api/products.ts
export default defineEventHandler(async () => {
  const tracer = trace.getTracer('nuxt-api');

  return tracer.startActiveSpan('fetch-products', async (span) => {
    try {
      const products = await db.query('SELECT * FROM products');
      span.setAttribute('db.row_count', products.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return products;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
});
```

---

## 4.1 RUM SDK Setup

### Sentry Browser SDK dans Nuxt 3

```bash
pnpm add @sentry/nuxt
```

```typescript
// plugins/sentry.client.ts
import * as Sentry from '@sentry/nuxt';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();

  Sentry.init({
    dsn: config.public.sentryDsn,
    environment: config.public.appEnv ?? 'production',

    // Intégrations navigateur
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],

    // Sampling
    tracesSampleRate: config.public.appEnv === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,

    // Propagation W3C vers les API Nuxt
    tracePropagationTargets: [
      'localhost',
      /^\/api\//,                              // API routes relatives
      /^https:\/\/api\.myapp\.com/,            // API externe
    ],
  });
});
```

```typescript
// nuxt.config.ts — exposer le DSN côté public
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN ?? '',
      appEnv: process.env.NODE_ENV ?? 'development',
    },
  },
});
```

### Grafana Faro dans Next.js

Faro est la solution RUM open-source de Grafana Labs, compatible avec l'écosystème Loki/Tempo.

```bash
npm install @grafana/faro-web-sdk @grafana/faro-web-tracing
```

```typescript
// lib/faro.ts (côté client uniquement)
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

let faroInstance: ReturnType<typeof initializeFaro> | null = null;

export function initFaro() {
  if (typeof window === 'undefined' || faroInstance) return;

  faroInstance = initializeFaro({
    url: process.env.NEXT_PUBLIC_FARO_COLLECTOR_URL ?? 'http://localhost:12347/collect',
    app: {
      name: 'next-app',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
      environment: process.env.NODE_ENV ?? 'production',
    },
    instrumentations: [
      ...getWebInstrumentations({ captureConsole: false }),
      new TracingInstrumentation(),
    ],
  });
}

export function getFaro() {
  return faroInstance;
}
```

```typescript
// app/layout.tsx — initialisation au montage
'use client';
import { useEffect } from 'react';
import { initFaro } from '@/lib/faro';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initFaro();
  }, []);

  return <html><body>{children}</body></html>;
}
```

### Propagation W3C trace context du RUM vers le backend (exemple complet)

L'objectif est que le `trace_id` généré par le SDK RUM soit le même que celui qui apparaît dans les traces backend, permettant une corrélation complète dans Tempo.

```typescript
// composables/useInstrumentedFetch.ts (Nuxt 3)
import { context, propagation, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

/**
 * fetch instrumenté côté client :
 * - Crée un span client-side (visible dans Tempo via Faro/Sentry)
 * - Injecte traceparent dans le header HTTP
 * - Enregistre les erreurs et le status HTTP
 */
export async function instrumentedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const tracer = trace.getTracer('nuxt-browser');

  return tracer.startActiveSpan(
    `fetch ${url}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      // Construire les headers avec propagation W3C
      const headers = new Headers(init.headers);
      propagation.inject(context.active(), {
        set: (carrier: Headers, key: string, value: string) => carrier.set(key, value),
      }, headers);

      span.setAttributes({
        'http.method': init.method ?? 'GET',
        'http.url': url,
      });

      try {
        const response = await fetch(url, { ...init, headers });

        span.setAttributes({ 'http.status_code': response.status });

        if (!response.ok) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        return response;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    }
  );
}
```

---

## 5. Monitoring des API routes

Les API routes (Nuxt `server/api/`, Next `app/api/`) sont critiques. Métriques à suivre :

| Métrique | Implémentation |
|----------|----------------|
| Latence par route | Histogram avec label `route` |
| Taux d'erreur | Counter `api_errors_total` par route et status |
| Requêtes actives | Gauge `api_active_requests` |
| Taille des réponses | Histogram `api_response_size_bytes` |

---

## 5.1 Grafana Dashboard pour le SSR

### Panels recommandés

| Panel | Type | Requête PromQL |
|---|---|---|
| SSR render time (p50/p95/p99) | Histogram | voir ci-dessous |
| Latence API routes par route | Heatmap | voir ci-dessous |
| Taux d'erreur par route | Time series | voir ci-dessous |
| Requêtes actives | Gauge | voir ci-dessous |

### Requêtes PromQL

```promql
# SSR render time — histogramme des percentiles
histogram_quantile(0.95,
  sum(rate(http_server_duration_milliseconds_bucket{
    service_name="nuxt-app",
    http_route=~"/.*"
  }[5m])) by (le, http_route)
)

# Latence P50 toutes routes confondues
histogram_quantile(0.50,
  sum(rate(http_server_duration_milliseconds_bucket{
    service_name="nuxt-app"
  }[5m])) by (le)
)

# Taux d'erreur par route (status 5xx / total)
sum(rate(http_server_request_count_total{
  service_name="nuxt-app",
  http_status_code=~"5.."
}[5m])) by (http_route)
/
sum(rate(http_server_request_count_total{
  service_name="nuxt-app"
}[5m])) by (http_route)

# Requêtes actives (gauge instantanée)
sum(http_server_active_requests{service_name="nuxt-app"}) by (http_route)
```

### Snippet JSON pour le panel "SSR Render Time"

```json
{
  "title": "SSR Render Time p95 (ms)",
  "type": "timeseries",
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "targets": [
    {
      "expr": "histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket{service_name=\"nuxt-app\"}[5m])) by (le, http_route))",
      "legendFormat": "p95 — {{http_route}}"
    },
    {
      "expr": "histogram_quantile(0.50, sum(rate(http_server_duration_milliseconds_bucket{service_name=\"nuxt-app\"}[5m])) by (le, http_route))",
      "legendFormat": "p50 — {{http_route}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "ms",
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 500 },
          { "color": "red", "value": 1500 }
        ]
      }
    }
  },
  "options": { "tooltip": { "mode": "multi" } }
}
```

### Alerte : SSR dégradé

```yaml
# alerts/ssr-latency.yaml
groups:
  - name: nuxt-ssr
    rules:
      - alert: SSRRenderTimeTooHigh
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_server_duration_milliseconds_bucket{
              service_name="nuxt-app"
            }[5m])) by (le)
          ) > 1500
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "SSR p95 > 1.5s depuis 2 minutes"
          runbook: "https://wiki.example.com/runbooks/ssr-latency"
```

---

## 6. Connecter RUM et backend traces

Le trace context W3C permet de suivre une requête du clic utilisateur jusqu'à la DB :

```
Navigateur (RUM)                    Serveur (OTel)
┌─────────────┐                     ┌──────────────┐
│ Click → fetch │──traceparent──────>│ SSR render    │
│ INP: 120ms   │                     │  └─ DB query  │
│ LCP: 1.2s    │                     │  └─ API call  │
└─────────────┘                     └──────────────┘
     trace-id: abc123                    trace-id: abc123
```

Tout le parcours partage le même `trace-id`.

---

## 6.1 Recettes pratiques

### Scénario 1 — "Le SSR prend 3s sur certaines pages"

**Symptôme** : p95 SSR > 3s détecté sur l'alerte `SSRRenderTimeTooHigh`. Les pages concernées ne sont pas identifiées depuis les métriques seules.

**Démarche** :

1. Dans Grafana → Explore → Tempo, filtrer par `service.name = "nuxt-app"` + durée > 2000ms.
2. Ouvrir une trace longue : la vue waterfall montre un span `fetch-products` de 2.8s.
3. Ce span contient l'attribut `db.statement` (injecté par l'auto-instrumentation `pg`) : `SELECT * FROM products WHERE category = $1` sans index.

**Code correctif** : ajouter un custom span avec attributs DB explicites pour accélérer le diagnostic :

```typescript
// server/api/products.ts
export default defineEventHandler(async (event) => {
  const tracer = trace.getTracer('nuxt-api');
  const category = getQuery(event).category as string;

  return tracer.startActiveSpan('db.query.products', async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': 'SELECT',
      'db.sql.table': 'products',
      'query.filter.category': category ?? 'all',
    });

    try {
      const products = await db.query(
        'SELECT * FROM products WHERE ($1::text IS NULL OR category = $1)',
        [category ?? null]
      );
      span.setAttribute('db.row_count', products.rows.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return products.rows;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
});
```

**Résultat dans Tempo** : le waterfall révèle le span `db.query.products` de 2.8s immédiatement. Après ajout de l'index `CREATE INDEX ON products(category)`, le span tombe à 12ms.

---

### Scénario 2 — "Les erreurs sur /api/orders spikent après un déploiement"

**Symptôme** : `http_server_request_count_total{http_status_code="500", http_route="/api/orders"}` monte de 0 à 40 req/min 5 minutes après le déploiement v2.3.1.

**Démarche** :

1. **Grafana → Explore → Loki** : filtrer `{service_name="nuxt-app"} |= "error" | json | trace_id != ""`
2. Les logs d'erreur contiennent `trace_id`. Cliquer sur le Derived Field → Tempo.
3. Dans la trace, le span `db.query.orders` a le status `ERROR` avec l'exception : `column "customer_uuid" does not exist`.
4. La migration v2.3.1 a renommé `customer_id` → `customer_uuid` mais la requête SQL n'a pas été mise à jour.

**Pattern de corrélation logs ↔ traces dans Loki** :

```logql
# Trouver les traces en erreur sur /api/orders dans les 30 dernières minutes
{service_name="nuxt-app", http_route="/api/orders"}
  | json
  | level = "error"
  | line_format "trace_id={{.trace_id}} err={{.err}}"
```

**Correction** : la présence du `trace_id` dans chaque log (via le mixin Pino de la section 1.1) est ce qui rend possible la corrélation immédiate sans grep manuel.

---

### Scénario 3 — "Hydration mismatch dans Nuxt — détecter et tracker"

**Symptôme** : Vue émet des avertissements `[Vue warn]: Hydration node mismatch` dans la console, causant des re-renders côté client non mesurés.

**Démarche** :

Nuxt/Vue n'expose pas d'API officielle pour capturer les hydration mismatches programmatiquement. La technique consiste à intercepter `console.warn` en production via un plugin client, à créer un span d'erreur et à l'envoyer au RUM.

```typescript
// plugins/hydration-tracker.client.ts
import * as Sentry from '@sentry/nuxt';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export default defineNuxtPlugin(() => {
  // Uniquement en production — en dev, laisser Vue afficher les warnings normalement
  if (import.meta.dev) return;

  const originalWarn = console.warn.bind(console);
  const tracer = trace.getTracer('nuxt-browser');

  console.warn = (...args: unknown[]) => {
    const message = args.map(String).join(' ');

    if (message.includes('Hydration') && message.includes('mismatch')) {
      // Créer un span pour tracer l'événement
      const span = tracer.startSpan('hydration.mismatch', {
        attributes: {
          'vue.hydration.message': message.slice(0, 200),
          'page.url': window.location.pathname,
          'page.referrer': document.referrer,
        },
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Hydration mismatch' });
      span.end();

      // Remonter également dans Sentry pour le tracking release
      Sentry.captureMessage(`Hydration mismatch: ${message.slice(0, 200)}`, {
        level: 'warning',
        tags: { route: useRoute().name?.toString() ?? 'unknown' },
      });
    }

    originalWarn(...args);
  };

  // Nettoyage si le plugin est démonté (HMR en dev)
  onScopeDispose(() => {
    console.warn = originalWarn;
  });
});
```

**Métriques à créer dans Grafana** : requêter les spans `hydration.mismatch` dans Tempo par `page.url` pour identifier les pages les plus touchées. Après correction (généralement : ne pas utiliser `Date.now()` ou `Math.random()` dans le rendu SSR), les spans disparaissent.

---

## 7. Récapitulatif

- **OTel auto-instrumentation** couvre la majorité des cas Node.js
- Nuxt 3 : server plugins + Nitro hooks pour le tracing
- Next.js : `instrumentation.ts` + `@vercel/otel`
- Les rendus SSR doivent être tracés comme des spans
- Le **W3C Trace Context** (`traceparent`) connecte frontend et backend
- Toujours mesurer : latence, erreurs, requêtes actives sur les API routes

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 24 instrumentation nuxt next](../screencasts/screencast-24.md)
2. **Lab** : [lab-24-instrumentation-nuxt-next](../labs/lab-24-instrumentation-nuxt-next/README)
3. **Quiz** : [quiz 24 instrumentation nuxt next](../quizzes/quiz-24-instrumentation-nuxt-next.html)
:::

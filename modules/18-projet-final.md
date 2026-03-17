# Projet final — Plateforme d'observabilité complete

## Objectifs pedagogiques

- Synthetiser l'ensemble des 18 modules précédents dans un projet concret
- Construire une application instrumentee de bout en bout (logs, metriques, traces)
- Déployer un stack d'observabilité complet avec Docker Compose
- Définir et mesurer des SLOs avec des burn rate alerts
- Exécuter des tests de charge et des experiences de chaos
- Simuler un incident et rediger un postmortem
- Evaluer la production readiness d'un service
- Demontrer une maîtrise complete de l'observabilité et du SRE

---

## Introduction : de la théorie à la pratique

Au cours des 18 modules précédents, vous avez decouvert les fondamentaux de l'observabilité et du Site Reliability Engineering : logging structure, metriques Prometheus, tracing distribue, SLOs, alerting, incident management, chaos engineering, DORA metrics, et bien plus.

Ce projet final est votre opportunite de **tout assembler** dans une plateforme coherente. Vous allez construire, instrumenter, tester et operer une application comme le ferait une équipe SRE en production.

L'analogie : ce projet est votre **examen de pilotage**. Vous avez appris la théorie, pratique chaque manoeuvre individuellement dans les labs. Maintenant, vous devez effectuer un vol complet du decollage a l'atterrissage.

```typescript
// Les 18 modules synthetises dans le projet final
interface ModuleSynthesis {
  module: number;
  title: string;
  applicationInProject: string;
}

const moduleSynthesis: ModuleSynthesis[] = [
  { module: 0, title: 'Prerequis et introduction', applicationInProject: 'Setup de l\'environnement de developpement' },
  { module: 1, title: 'Pourquoi l\'observabilite', applicationInProject: 'Comprendre les limites du monitoring traditionnel' },
  { module: 2, title: 'Logging structure', applicationInProject: 'Configuration Pino avec logs JSON structures' },
  { module: 3, title: 'Niveaux de log et contexte', applicationInProject: 'Log levels dynamiques, contexte requete, redaction' },
  { module: 4, title: 'Introduction metriques', applicationInProject: 'Types de metriques (counter, gauge, histogram, summary)' },
  { module: 5, title: 'Metriques Prometheus', applicationInProject: 'Endpoint /metrics avec prom-client, metriques custom' },
  { module: 6, title: 'RED/USE methodes', applicationInProject: 'Metriques RED pour les endpoints, USE pour les ressources' },
  { module: 7, title: 'Distributed tracing', applicationInProject: 'OpenTelemetry SDK, spans, propagation du contexte' },
  { module: 8, title: 'OTel Collector pipeline', applicationInProject: 'Collector en mode gateway, export vers Jaeger' },
  { module: 9, title: 'Grafana dashboards', applicationInProject: 'Dashboard service + dashboard SLO dans Grafana' },
  { module: 10, title: 'SLI/SLO/SLA', applicationInProject: 'Definition des SLOs (availability 99.9%, latency p99 < 500ms)' },
  { module: 11, title: 'Alerting strategies', applicationInProject: 'Burn rate alerts multi-window' },
  { module: 12, title: 'Incident management', applicationInProject: 'Simulation d\'incident avec roles et communication' },
  { module: 13, title: 'Postmortems', applicationInProject: 'Redaction d\'un postmortem blameless apres l\'incident simule' },
  { module: 14, title: 'Capacity planning', applicationInProject: 'Analyse des resultats k6 pour le dimensionnement' },
  { module: 15, title: 'Chaos engineering', applicationInProject: 'Injection de latence et d\'erreurs' },
  { module: 16, title: 'DORA metrics', applicationInProject: 'Tracking des metriques DORA du projet' },
  { module: 17, title: 'Observability as Code', applicationInProject: 'Dashboards et alertes generes en TypeScript' },
  { module: 18, title: 'Production Readiness', applicationInProject: 'PRR checklist complete du service' },
];
```

---

## Partie 1 : Application instrumentee (demo-app)

### Architecture de l'application

```typescript
// Architecture de la demo-app
interface ServiceDefinition {
  name: string;
  port: number;
  description: string;
  dependencies: string[];
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
}

const demoAppArchitecture: ServiceDefinition[] = [
  {
    name: 'api-gateway',
    port: 3000,
    description: 'Point d\'entree HTTP, routing vers les services',
    dependencies: ['user-service', 'order-service'],
    endpoints: [
      { method: 'GET', path: '/api/users/:id', description: 'Recuperer un utilisateur' },
      { method: 'POST', path: '/api/orders', description: 'Creer une commande' },
      { method: 'GET', path: '/api/orders/:id', description: 'Recuperer une commande' },
      { method: 'GET', path: '/health/live', description: 'Liveness probe' },
      { method: 'GET', path: '/health/ready', description: 'Readiness probe' },
      { method: 'GET', path: '/metrics', description: 'Metriques Prometheus' },
    ],
  },
  {
    name: 'user-service',
    port: 3001,
    description: 'Gestion des utilisateurs',
    dependencies: ['PostgreSQL'],
    endpoints: [
      { method: 'GET', path: '/users/:id', description: 'Recuperer un utilisateur par ID' },
      { method: 'GET', path: '/health/live', description: 'Liveness probe' },
      { method: 'GET', path: '/health/ready', description: 'Readiness probe' },
      { method: 'GET', path: '/metrics', description: 'Metriques Prometheus' },
    ],
  },
  {
    name: 'order-service',
    port: 3002,
    description: 'Gestion des commandes',
    dependencies: ['PostgreSQL', 'user-service'],
    endpoints: [
      { method: 'POST', path: '/orders', description: 'Creer une commande' },
      { method: 'GET', path: '/orders/:id', description: 'Recuperer une commande' },
      { method: 'GET', path: '/health/live', description: 'Liveness probe' },
      { method: 'GET', path: '/health/ready', description: 'Readiness probe' },
      { method: 'GET', path: '/metrics', description: 'Metriques Prometheus' },
    ],
  },
];
```

### Instrumentation logging (Pino)

```typescript
import pino from 'pino';

// Configuration Pino pour la demo-app
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label: string) {
      return { level: label };
    },
    bindings(bindings: pino.Bindings) {
      return {
        service: process.env.SERVICE_NAME || 'demo-app',
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        hostname: bindings.hostname,
        pid: bindings.pid,
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redaction des donnees sensibles
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
});

// Child logger avec contexte de requete
function createRequestLogger(req: { id: string; method: string; url: string; traceId?: string }) {
  return logger.child({
    requestId: req.id,
    method: req.method,
    url: req.url,
    traceId: req.traceId || 'no-trace',
  });
}

// Exemples de logs structures
const reqLogger = createRequestLogger({
  id: 'req-abc123',
  method: 'POST',
  url: '/api/orders',
  traceId: 'trace-xyz789',
});

reqLogger.info('Requete recue');
reqLogger.info({ orderId: 'order-456', userId: 'user-789' }, 'Commande creee avec succes');
reqLogger.warn({ latencyMs: 1200, threshold: 500 }, 'Latence elevee detectee sur la dependance user-service');
reqLogger.error({ err: new Error('Connection refused'), dependency: 'PostgreSQL' }, 'Erreur de connexion a la base de donnees');
```

### Instrumentation metriques (prom-client)

```typescript
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Registry dedie au service
const registry = new Registry();

// Metriques par defaut (CPU, memoire, event loop, etc.)
collectDefaultMetrics({ register: registry, prefix: 'demoapp_' });

// Metriques HTTP (methode RED)
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Nombre de requetes HTTP en cours de traitement',
  labelNames: ['method'] as const,
  registers: [registry],
});

// Metriques business
const ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Nombre total de commandes creees',
  labelNames: ['status'] as const,
  registers: [registry],
});

const orderAmountHistogram = new Histogram({
  name: 'order_amount_euros',
  help: 'Montant des commandes en euros',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [registry],
});

// Middleware Express pour les metriques HTTP
function metricsMiddleware(req: any, res: any, next: any): void {
  const start = process.hrtime.bigint();
  const method = req.method;

  httpRequestsInFlight.inc({ method });

  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path || 'unknown';
    const status = res.statusCode.toString();

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route, status }, duration);
    httpRequestsInFlight.dec({ method });
  });

  next();
}
```

### Instrumentation tracing (OpenTelemetry)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Configuration OpenTelemetry SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || 'demo-app',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, request) => {
          span.setAttribute('http.request_id', (request as any).headers?.['x-request-id'] || 'unknown');
        },
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
    }),
  ],
});

// Demarrer le SDK avant tout le reste
sdk.start();

// Arret propre
process.on('SIGTERM', async () => {
  await sdk.shutdown();
  process.exit(0);
});
```

---

## Partie 2 : Stack Docker Compose

### Configuration complete

```typescript
// Representation TypeScript du Docker Compose
interface DockerComposeService {
  name: string;
  image: string;
  ports: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  dependsOn?: string[];
  description: string;
}

const dockerComposeStack: DockerComposeService[] = [
  // --- Services applicatifs ---
  {
    name: 'api-gateway',
    image: 'demo-app/api-gateway:latest',
    ports: ['3000:3000'],
    environment: {
      SERVICE_NAME: 'api-gateway',
      LOG_LEVEL: 'info',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      USER_SERVICE_URL: 'http://user-service:3001',
      ORDER_SERVICE_URL: 'http://order-service:3002',
    },
    dependsOn: ['user-service', 'order-service', 'otel-collector'],
    description: 'Point d\'entree HTTP',
  },
  {
    name: 'user-service',
    image: 'demo-app/user-service:latest',
    ports: ['3001:3001'],
    environment: {
      SERVICE_NAME: 'user-service',
      LOG_LEVEL: 'info',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      DATABASE_URL: 'postgres://user:password@postgres:5432/users',
    },
    dependsOn: ['postgres', 'otel-collector'],
    description: 'Service utilisateurs',
  },
  {
    name: 'order-service',
    image: 'demo-app/order-service:latest',
    ports: ['3002:3002'],
    environment: {
      SERVICE_NAME: 'order-service',
      LOG_LEVEL: 'info',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
      DATABASE_URL: 'postgres://user:password@postgres:5432/orders',
      USER_SERVICE_URL: 'http://user-service:3001',
    },
    dependsOn: ['postgres', 'user-service', 'otel-collector'],
    description: 'Service commandes',
  },
  // --- Infrastructure ---
  {
    name: 'postgres',
    image: 'postgres:16-alpine',
    ports: ['5432:5432'],
    environment: { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'password' },
    volumes: ['postgres-data:/var/lib/postgresql/data'],
    description: 'Base de donnees relationnelle',
  },
  // --- Observabilite ---
  {
    name: 'prometheus',
    image: 'prom/prometheus:v2.54.0',
    ports: ['9090:9090'],
    volumes: ['./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml', './prometheus/rules:/etc/prometheus/rules'],
    description: 'Collecte et stockage des metriques',
  },
  {
    name: 'grafana',
    image: 'grafana/grafana:11.4.0',
    ports: ['4000:3000'],
    volumes: ['./grafana/provisioning:/etc/grafana/provisioning', './grafana/dashboards:/var/lib/grafana/dashboards'],
    environment: { GF_SECURITY_ADMIN_PASSWORD: 'admin' },
    description: 'Visualisation des metriques et dashboards',
  },
  {
    name: 'otel-collector',
    image: 'otel/opentelemetry-collector-contrib:0.97.0',
    ports: ['4317:4317', '4318:4318'],
    volumes: ['./otel-collector/config.yaml:/etc/otelcol-contrib/config.yaml'],
    description: 'Pipeline de collecte OpenTelemetry',
  },
  {
    name: 'jaeger',
    image: 'jaegertracing/all-in-one:1.55',
    ports: ['16686:16686'],
    environment: { COLLECTOR_OTLP_ENABLED: 'true' },
    description: 'Backend de tracing distribue',
  },
];
```

::: tip Commandes Docker Compose
```bash
# Demarrer le stack complet
docker compose up -d

# Verifier que tout est running
docker compose ps

# Consulter les logs d'un service
docker compose logs -f api-gateway

# URLs d'acces :
# Application  : http://localhost:3000
# Prometheus   : http://localhost:9090
# Grafana      : http://localhost:4000
# Jaeger       : http://localhost:16686
```
:::

---

## Partie 3 : SLOs définis et mesures

### Definition des SLOs du projet

```typescript
interface ProjectSLO {
  name: string;
  sliType: 'availability' | 'latency';
  target: number;
  description: string;
  promqlGood: string;
  promqlTotal: string;
  errorBudget30d: string;
}

const projectSLOs: ProjectSLO[] = [
  {
    name: 'Disponibilite API Gateway',
    sliType: 'availability',
    target: 0.999,
    description: '99.9% des requetes HTTP retournent un statut non-5xx',
    promqlGood: 'sum(rate(http_requests_total{job="api-gateway",status!~"5.."}[30d]))',
    promqlTotal: 'sum(rate(http_requests_total{job="api-gateway"}[30d]))',
    errorBudget30d: '43.2 minutes de downtime, ou 4320 erreurs sur 4 320 000 requetes',
  },
  {
    name: 'Latence API Gateway p99',
    sliType: 'latency',
    target: 0.99,
    description: '99% des requetes HTTP ont une latence p99 inferieure a 500ms',
    promqlGood: 'sum(rate(http_request_duration_seconds_bucket{job="api-gateway",le="0.5"}[30d]))',
    promqlTotal: 'sum(rate(http_request_duration_seconds_count{job="api-gateway"}[30d]))',
    errorBudget30d: '1% des requetes peuvent depasser 500ms, soit 43 200 sur 4 320 000',
  },
];

// Calcul de l'error budget restant
function calculateErrorBudgetRemaining(
  goodEvents: number,
  totalEvents: number,
  target: number,
): {
  currentSLI: number;
  errorBudgetTotal: number;
  errorBudgetConsumed: number;
  errorBudgetRemaining: number;
  errorBudgetRemainingPercent: number;
  status: 'healthy' | 'warning' | 'critical';
} {
  const currentSLI = totalEvents > 0 ? goodEvents / totalEvents : 1;
  const errorBudgetTotal = (1 - target) * totalEvents;
  const badEvents = totalEvents - goodEvents;
  const errorBudgetConsumed = badEvents;
  const errorBudgetRemaining = errorBudgetTotal - errorBudgetConsumed;
  const errorBudgetRemainingPercent = errorBudgetTotal > 0
    ? (errorBudgetRemaining / errorBudgetTotal) * 100
    : 100;

  let status: 'healthy' | 'warning' | 'critical';
  if (errorBudgetRemainingPercent > 50) status = 'healthy';
  else if (errorBudgetRemainingPercent > 0) status = 'warning';
  else status = 'critical';

  return {
    currentSLI,
    errorBudgetTotal,
    errorBudgetConsumed,
    errorBudgetRemaining,
    errorBudgetRemainingPercent,
    status,
  };
}

// Exemple
const budget = calculateErrorBudgetRemaining(
  4_318_000,  // requetes reussies
  4_320_000,  // requetes totales
  0.999,      // target 99.9%
);

console.log('Error budget status:', budget.status);
console.log(`SLI actuel: ${(budget.currentSLI * 100).toFixed(3)}%`);
console.log(`Budget restant: ${budget.errorBudgetRemainingPercent.toFixed(1)}%`);
```

---

## Partie 4 : Burn Rate Alerts

### Configuration des alertes multi-window

```typescript
// Regles d'alerting burn rate pour le projet
interface BurnRateAlert {
  name: string;
  sloName: string;
  severity: 'critical' | 'warning';
  longWindow: string;
  shortWindow: string;
  burnRate: number;
  for: string;
  description: string;
  prometheusExpr: string;
}

function generateBurnRateAlerts(slo: ProjectSLO): BurnRateAlert[] {
  const errorRate = 1 - slo.target;

  return [
    {
      name: `${slo.name} — Burn rate rapide (1h/5m)`,
      sloName: slo.name,
      severity: 'critical',
      longWindow: '1h',
      shortWindow: '5m',
      burnRate: 14.4,
      for: '2m',
      description: `A ce rythme, l'error budget de 30j est epuise en 2 heures`,
      prometheusExpr:
        `(1 - (${slo.promqlGood.replace('[30d]', '[1h]')}) / (${slo.promqlTotal.replace('[30d]', '[1h]')}))` +
        ` > ${(errorRate * 14.4).toFixed(6)}\n` +
        `AND\n` +
        `(1 - (${slo.promqlGood.replace('[30d]', '[5m]')}) / (${slo.promqlTotal.replace('[30d]', '[5m]')}))` +
        ` > ${(errorRate * 14.4).toFixed(6)}`,
    },
    {
      name: `${slo.name} — Burn rate modere (6h/30m)`,
      sloName: slo.name,
      severity: 'critical',
      longWindow: '6h',
      shortWindow: '30m',
      burnRate: 6,
      for: '5m',
      description: `A ce rythme, l'error budget de 30j est epuise en 5 jours`,
      prometheusExpr:
        `(1 - (${slo.promqlGood.replace('[30d]', '[6h]')}) / (${slo.promqlTotal.replace('[30d]', '[6h]')}))` +
        ` > ${(errorRate * 6).toFixed(6)}\n` +
        `AND\n` +
        `(1 - (${slo.promqlGood.replace('[30d]', '[30m]')}) / (${slo.promqlTotal.replace('[30d]', '[30m]')}))` +
        ` > ${(errorRate * 6).toFixed(6)}`,
    },
    {
      name: `${slo.name} — Burn rate lent (1d/2h)`,
      sloName: slo.name,
      severity: 'warning',
      longWindow: '1d',
      shortWindow: '2h',
      burnRate: 3,
      for: '15m',
      description: `A ce rythme, l'error budget de 30j est epuise en 10 jours`,
      prometheusExpr:
        `(1 - (${slo.promqlGood.replace('[30d]', '[1d]')}) / (${slo.promqlTotal.replace('[30d]', '[1d]')}))` +
        ` > ${(errorRate * 3).toFixed(6)}\n` +
        `AND\n` +
        `(1 - (${slo.promqlGood.replace('[30d]', '[2h]')}) / (${slo.promqlTotal.replace('[30d]', '[2h]')}))` +
        ` > ${(errorRate * 3).toFixed(6)}`,
    },
  ];
}

for (const slo of projectSLOs) {
  const alerts = generateBurnRateAlerts(slo);
  console.log(`\n=== Alertes pour "${slo.name}" ===`);
  for (const alert of alerts) {
    console.log(`[${alert.severity.toUpperCase()}] ${alert.name}`);
    console.log(`  Burn rate: ${alert.burnRate}x | Windows: ${alert.longWindow}/${alert.shortWindow}`);
    console.log(`  ${alert.description}`);
  }
}
```

---

## Partie 5 : Tests de charge k6

### Suite de tests de charge

```typescript
// Representation TypeScript des scenarios k6
interface K6Scenario {
  name: string;
  description: string;
  executor: string;
  stages?: Array<{ duration: string; target: number }>;
  duration?: string;
  vus?: number;
  rate?: number;
  thresholds: Record<string, string[]>;
}

const k6Scenarios: K6Scenario[] = [
  {
    name: 'ramp-up',
    description: 'Montee en charge progressive pour trouver la capacite maximale',
    executor: 'ramping-vus',
    stages: [
      { duration: '2m', target: 10 },
      { duration: '3m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '3m', target: 200 },
      { duration: '2m', target: 0 },
    ],
    thresholds: {
      'http_req_duration{name:GET /api/users}': ['p(99) < 500'],
      'http_req_duration{name:POST /api/orders}': ['p(99) < 1000'],
      http_req_failed: ['rate < 0.01'],
    },
  },
  {
    name: 'steady-state',
    description: 'Charge constante pendant une duree prolongee pour valider la stabilite',
    executor: 'constant-vus',
    duration: '15m',
    vus: 50,
    thresholds: {
      http_req_duration: ['p(99) < 500', 'p(95) < 200'],
      http_req_failed: ['rate < 0.001'],
      http_reqs: ['rate > 100'],
    },
  },
  {
    name: 'spike',
    description: 'Pic soudain de trafic pour tester la resilience',
    executor: 'ramping-vus',
    stages: [
      { duration: '1m', target: 20 },    // Baseline
      { duration: '30s', target: 500 },   // Spike brutal
      { duration: '2m', target: 500 },    // Maintien du pic
      { duration: '30s', target: 20 },    // Retour a la normale
      { duration: '2m', target: 20 },     // Verification de la recovery
    ],
    thresholds: {
      http_req_duration: ['p(99) < 2000'],
      http_req_failed: ['rate < 0.05'],
    },
  },
];

// Script k6 simplifie (a ecrire en JavaScript pour k6)
const k6Script = `
// k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const orderDuration = new Trend('order_creation_duration');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  scenarios: {
    steady_state: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
    },
  },
  thresholds: {
    http_req_duration: ['p(99) < 500'],
    http_req_failed: ['rate < 0.01'],
    errors: ['rate < 0.01'],
  },
};

export default function () {
  // Scenario 1 : Lire un utilisateur
  const userRes = http.get(BASE_URL + '/api/users/1', {
    tags: { name: 'GET /api/users' },
  });
  check(userRes, {
    'user status 200': (r) => r.status === 200,
    'user latency < 200ms': (r) => r.timings.duration < 200,
  }) || errorRate.add(1);

  sleep(1);

  // Scenario 2 : Creer une commande
  const orderPayload = JSON.stringify({
    userId: 1,
    items: [{ productId: 'prod-1', quantity: 2, price: 29.99 }],
  });

  const orderRes = http.post(BASE_URL + '/api/orders', orderPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/orders' },
  });
  check(orderRes, {
    'order status 201': (r) => r.status === 201,
    'order latency < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);

  orderDuration.add(orderRes.timings.duration);

  sleep(2);
}
`;

console.log('Script k6 genere:');
console.log(k6Script);
```

::: warning Exécuter les tests de charge
```bash
# Installer k6
# https://k6.io/docs/get-started/installation/

# Executer le test steady-state
k6 run --env BASE_URL=http://localhost:3000 k6-load-test.js

# Executer avec un scenario specifique
k6 run --env BASE_URL=http://localhost:3000 \
  --tag testid=spike-$(date +%s) \
  k6-spike-test.js
```
:::

---

## Partie 6 : Chaos Engineering

### Experiences de chaos pour le projet

```typescript
interface ChaosExperiment {
  id: string;
  name: string;
  hypothesis: string;
  faultType: 'latency-injection' | 'error-injection' | 'pod-kill' | 'resource-stress';
  target: string;
  parameters: Record<string, string | number>;
  steadyStateValidation: string[];
  rollback: string;
  expectedOutcome: string;
}

const chaosExperiments: ChaosExperiment[] = [
  {
    id: 'CHAOS-001',
    name: 'Injection de latence sur user-service',
    hypothesis:
      'Quand le user-service a une latence de 2s, l\'api-gateway ' +
      'doit repondre en moins de 3s grace au timeout, et le taux d\'erreur ' +
      'ne doit pas depasser 1%.',
    faultType: 'latency-injection',
    target: 'user-service',
    parameters: {
      delayMs: 2000,
      durationMinutes: 5,
      affectedPercentage: 50,
    },
    steadyStateValidation: [
      'http_request_duration_seconds{job="api-gateway",quantile="0.99"} < 3',
      'rate(http_requests_total{job="api-gateway",status=~"5.."}[5m]) / rate(http_requests_total{job="api-gateway"}[5m]) < 0.01',
    ],
    rollback: 'Desactiver le middleware de chaos (DELETE /chaos/faults)',
    expectedOutcome:
      'Le circuit breaker s\'ouvre apres 5 erreurs consecutives. ' +
      'L\'api-gateway retourne des donnees en cache ou une erreur 503 gracieuse.',
  },
  {
    id: 'CHAOS-002',
    name: 'Injection d\'erreurs 500 sur order-service',
    hypothesis:
      'Quand le order-service retourne 500 sur 30% des requetes, ' +
      'les alertes burn rate doivent se declencher en moins de 5 minutes ' +
      'et l\'error budget doit refleter la consommation.',
    faultType: 'error-injection',
    target: 'order-service',
    parameters: {
      errorCode: 500,
      errorPercentage: 30,
      durationMinutes: 10,
    },
    steadyStateValidation: [
      'Alertmanager recoit une alerte SLOBurnRateFast en < 5 minutes',
      'Le dashboard error budget montre une consommation acceleree',
    ],
    rollback: 'Desactiver le middleware de chaos (DELETE /chaos/faults)',
    expectedOutcome:
      'L\'alerte critical (burn rate 14.4x) se declenche en 2 minutes. ' +
      'Le dashboard SLO montre la consommation d\'error budget en temps reel.',
  },
];

// Middleware de chaos pour Express
function chaosMiddleware(config: { delayMs?: number; errorRate?: number; errorCode?: number }) {
  return (req: any, res: any, next: any) => {
    // Injection de latence
    if (config.delayMs && Math.random() < 0.5) {
      setTimeout(next, config.delayMs);
      return;
    }

    // Injection d'erreurs
    if (config.errorRate && Math.random() < config.errorRate) {
      res.status(config.errorCode || 500).json({
        error: 'Chaos injection: simulated failure',
        chaosExperiment: true,
      });
      return;
    }

    next();
  };
}
```

---

## Partie 7 : Incident simulation et postmortem

### Scenario d'incident

```typescript
interface IncidentScenario {
  title: string;
  triggerAction: string;
  expectedTimeline: Array<{
    time: string;
    event: string;
    role: string;
  }>;
  postmortemTemplate: {
    title: string;
    sections: string[];
  };
}

const incidentScenario: IncidentScenario = {
  title: 'Degradation de latence suite a une fuite memoire',
  triggerAction:
    'Activer le chaos experiment CHAOS-001 (injection latence) ' +
    'ET augmenter progressivement l\'utilisation memoire du order-service.',
  expectedTimeline: [
    { time: 'T+0', event: 'Chaos experiment active', role: 'Facilitateur' },
    { time: 'T+2m', event: 'Alerte burn rate rapide declenchee', role: 'Systeme' },
    { time: 'T+3m', event: 'On-call recoit la page et acknowledge', role: 'Incident Commander' },
    { time: 'T+5m', event: 'Canal #incident-XXX cree, roles assignes', role: 'Incident Commander' },
    { time: 'T+8m', event: 'Premiere investigation : dashboard SLO consulte', role: 'Investigateur' },
    { time: 'T+10m', event: 'Traces Jaeger analysees, latence identifiee sur user-service', role: 'Investigateur' },
    { time: 'T+12m', event: 'Communication aux stakeholders', role: 'Communicateur' },
    { time: 'T+15m', event: 'Root cause identifiee : chaos middleware actif', role: 'Investigateur' },
    { time: 'T+17m', event: 'Mitigation : desactivation du chaos middleware', role: 'Incident Commander' },
    { time: 'T+20m', event: 'Verification : metriques de retour a la normale', role: 'Investigateur' },
    { time: 'T+22m', event: 'Incident resolu, canal archive', role: 'Incident Commander' },
    { time: 'T+24h', event: 'Postmortem redige et partage', role: 'Incident Commander' },
  ],
  postmortemTemplate: {
    title: 'Postmortem — [Date] — Degradation latence API Gateway',
    sections: [
      '## Resume de l\'incident',
      '## Impact',
      '## Timeline detaillee',
      '## Root cause',
      '## Resolution',
      '## Detection et reponse',
      '## Lecons apprises',
      '## Action items (avec owners et deadlines)',
    ],
  },
};
```

---

## Partie 8 : Production Readiness Checklist

```typescript
interface PRREvaluation {
  category: string;
  items: Array<{
    requirement: string;
    status: 'done' | 'partial' | 'missing';
    evidence: string;
    notes?: string;
  }>;
}

const prrEvaluation: PRREvaluation[] = [
  {
    category: 'Observabilite',
    items: [
      { requirement: 'Logs structures JSON (Pino)', status: 'done', evidence: 'Configuration Pino dans src/logger.ts' },
      { requirement: 'Metriques RED (prom-client)', status: 'done', evidence: 'Endpoint /metrics, metriques http_requests_total et http_request_duration_seconds' },
      { requirement: 'Tracing distribue (OpenTelemetry)', status: 'done', evidence: 'Traces visibles dans Jaeger avec propagation W3C' },
      { requirement: 'Dashboard Grafana', status: 'done', evidence: 'Dashboard provisionne via JSON as code' },
      { requirement: 'SLOs definis et mesures', status: 'done', evidence: 'Availability 99.9%, latency p99 < 500ms' },
      { requirement: 'Alertes burn rate', status: 'done', evidence: 'Fichier alert-rules.yaml avec 3 niveaux de burn rate' },
    ],
  },
  {
    category: 'Resilience',
    items: [
      { requirement: 'Health checks (liveness, readiness, startup)', status: 'done', evidence: 'Endpoints /health/live, /health/ready, /health/startup' },
      { requirement: 'Circuit breaker sur les dependances', status: 'done', evidence: 'Circuit breaker configure sur les appels inter-services' },
      { requirement: 'Timeouts configures', status: 'done', evidence: 'Timeouts explicites sur tous les appels HTTP et DB' },
      { requirement: 'Graceful shutdown', status: 'done', evidence: 'Gestion SIGTERM avec drain des connexions' },
    ],
  },
  {
    category: 'Tests',
    items: [
      { requirement: 'Tests de charge k6', status: 'done', evidence: 'Scripts k6 avec scenarios ramp-up, steady, spike' },
      { requirement: 'Chaos experiments documentes', status: 'done', evidence: '2 experiences de chaos executees et documentees' },
      { requirement: 'Test de rollback', status: 'partial', evidence: 'Procedure documentee, pas encore testee en conditions reelles', notes: 'A tester au prochain sprint' },
    ],
  },
  {
    category: 'Documentation',
    items: [
      { requirement: 'Dependency map', status: 'done', evidence: 'Carte des dependances avec classification hard/soft' },
      { requirement: 'Runbooks pour chaque alerte', status: 'partial', evidence: '3 runbooks sur 5 alertes rediges', notes: 'Completer les 2 runbooks manquants' },
      { requirement: 'Postmortem template', status: 'done', evidence: 'Template disponible dans /docs/postmortem-template.md' },
    ],
  },
];

// Calculer le score PRR
function calculatePRRScore(evaluation: PRREvaluation[]): {
  totalItems: number;
  doneCount: number;
  partialCount: number;
  missingCount: number;
  scorePercent: number;
  status: 'approved' | 'conditionally-approved' | 'rejected';
} {
  let totalItems = 0;
  let doneCount = 0;
  let partialCount = 0;
  let missingCount = 0;

  for (const category of evaluation) {
    for (const item of category.items) {
      totalItems++;
      if (item.status === 'done') doneCount++;
      else if (item.status === 'partial') partialCount++;
      else missingCount++;
    }
  }

  const scorePercent = ((doneCount + partialCount * 0.5) / totalItems) * 100;

  let status: 'approved' | 'conditionally-approved' | 'rejected';
  if (scorePercent >= 90 && missingCount === 0) status = 'approved';
  else if (scorePercent >= 70) status = 'conditionally-approved';
  else status = 'rejected';

  return { totalItems, doneCount, partialCount, missingCount, scorePercent, status };
}

const prrScore = calculatePRRScore(prrEvaluation);
console.log(`\n=== PRODUCTION READINESS REVIEW ===`);
console.log(`Score: ${prrScore.scorePercent.toFixed(0)}%`);
console.log(`Status: ${prrScore.status.toUpperCase()}`);
console.log(`Done: ${prrScore.doneCount} | Partial: ${prrScore.partialCount} | Missing: ${prrScore.missingCount}`);
```

---

## Criteres d'évaluation

### Grille de notation

```typescript
interface EvaluationCriterion {
  category: string;
  weight: number; // Sur 100
  criteria: Array<{
    description: string;
    points: number;
  }>;
}

const evaluationRubric: EvaluationCriterion[] = [
  {
    category: 'Instrumentation (Modules 2-8)',
    weight: 25,
    criteria: [
      { description: 'Logs structures avec Pino (JSON, levels, contexte, redaction)', points: 5 },
      { description: 'Metriques RED/USE avec prom-client (counter, histogram, gauge)', points: 5 },
      { description: 'Tracing OpenTelemetry (SDK, auto-instrumentation, custom spans)', points: 5 },
      { description: 'OTel Collector configure (receivers, processors, exporters)', points: 5 },
      { description: 'Correlation logs/metriques/traces (traceId, exemplars)', points: 5 },
    ],
  },
  {
    category: 'SLOs & Alerting (Modules 10-11)',
    weight: 20,
    criteria: [
      { description: 'SLOs definis avec targets et error budgets', points: 5 },
      { description: 'SLIs mesures correctement en Prometheus', points: 5 },
      { description: 'Burn rate alerts multi-window configures', points: 5 },
      { description: 'Dashboard error budget dans Grafana', points: 5 },
    ],
  },
  {
    category: 'Infrastructure & Dashboards (Modules 9, 17)',
    weight: 15,
    criteria: [
      { description: 'Docker Compose fonctionnel avec tous les composants', points: 5 },
      { description: 'Dashboard Grafana complet (RED, USE, SLOs)', points: 5 },
      { description: 'Configuration as code (dashboards JSON, alert rules YAML)', points: 5 },
    ],
  },
  {
    category: 'Tests & Chaos (Modules 14-15)',
    weight: 15,
    criteria: [
      { description: 'Tests de charge k6 (ramp-up, steady, spike)', points: 5 },
      { description: 'Au moins 2 experiences de chaos documentees', points: 5 },
      { description: 'Analyse des resultats et recommandations', points: 5 },
    ],
  },
  {
    category: 'Incident Management (Modules 12-13)',
    weight: 10,
    criteria: [
      { description: 'Simulation d\'incident avec roles assignes', points: 5 },
      { description: 'Postmortem blameless redige avec action items', points: 5 },
    ],
  },
  {
    category: 'Production Readiness (Module 18)',
    weight: 10,
    criteria: [
      { description: 'Health checks (liveness, readiness, startup)', points: 3 },
      { description: 'Dependency map et FMEA', points: 3 },
      { description: 'PRR checklist complete', points: 4 },
    ],
  },
  {
    category: 'Qualite generale',
    weight: 5,
    criteria: [
      { description: 'Code propre, structure et documente', points: 2 },
      { description: 'README avec instructions de demarrage', points: 1 },
      { description: 'Git history propre avec messages clairs', points: 2 },
    ],
  },
];

function displayRubric(rubric: EvaluationCriterion[]): void {
  let totalPoints = 0;
  console.log('\n=== GRILLE D\'EVALUATION ===\n');

  for (const category of rubric) {
    const categoryPoints = category.criteria.reduce((sum, c) => sum + c.points, 0);
    totalPoints += categoryPoints;
    console.log(`${category.category} (${category.weight}% — ${categoryPoints} pts)`);
    for (const criterion of category.criteria) {
      console.log(`  [ ] ${criterion.description} (${criterion.points} pts)`);
    }
    console.log('');
  }

  console.log(`Total: ${totalPoints} points`);
}

displayRubric(evaluationRubric);
```

---

## Bonus : defis supplementaires

### Defi 1 : DORA Metrics Tracking

```typescript
// Implementer un tracker DORA pour votre projet
// (voir Module 16 pour les details)
interface DORAChallenge {
  metric: string;
  implementation: string;
  dataSource: string;
}

const doraChallenge: DORAChallenge[] = [
  {
    metric: 'Deployment Frequency',
    implementation: 'Compter les deployments via GitHub Actions ou les tags Docker',
    dataSource: 'GitHub API / Docker Registry',
  },
  {
    metric: 'Lead Time for Changes',
    implementation: 'Mesurer le temps entre le commit et le deployment',
    dataSource: 'Git log + GitHub Actions timestamps',
  },
  {
    metric: 'Change Failure Rate',
    implementation: 'Ratio de deployments suivis d\'un rollback ou incident',
    dataSource: 'GitHub Actions + incident tracker',
  },
  {
    metric: 'MTTR',
    implementation: 'Temps moyen entre la detection d\'un incident et sa resolution',
    dataSource: 'Incident timeline dans le postmortem',
  },
];
```

### Defi 2 : Pipeline Observability-as-Code

```typescript
// Mettre en place un pipeline complet :
// 1. Les dashboards et alertes sont definis en TypeScript
// 2. Un script genere les JSON/YAML
// 3. La CI valide la configuration
// 4. Le CD deploie automatiquement sur Grafana/Prometheus

interface OaCPipelineStep {
  step: number;
  name: string;
  command: string;
  description: string;
}

const oacPipeline: OaCPipelineStep[] = [
  { step: 1, name: 'Generate', command: 'npx ts-node scripts/generate-dashboards.ts', description: 'Generer les JSON Grafana depuis TypeScript' },
  { step: 2, name: 'Generate', command: 'npx ts-node scripts/generate-alerts.ts', description: 'Generer les YAML Prometheus depuis TypeScript' },
  { step: 3, name: 'Validate', command: 'npx ts-node scripts/validate-slos.ts', description: 'Valider les definitions SLO' },
  { step: 4, name: 'Lint', command: 'promtool check rules alerts/*.yaml', description: 'Linter les regles Prometheus' },
  { step: 5, name: 'Test', command: 'promtool test rules tests/alert-tests.yaml', description: 'Tester les regles d\'alerting' },
  { step: 6, name: 'Deploy', command: 'scripts/deploy-to-grafana.sh', description: 'Deployer les dashboards via l\'API Grafana' },
  { step: 7, name: 'Deploy', command: 'scripts/reload-prometheus.sh', description: 'Recharger les regles Prometheus' },
];
```

---

## Ressources pour continuer à apprendre

```typescript
interface LearningResource {
  title: string;
  type: 'book' | 'website' | 'video' | 'tool' | 'community';
  url?: string;
  description: string;
}

const resources: LearningResource[] = [
  // Livres
  {
    title: 'Site Reliability Engineering (Google SRE Book)',
    type: 'book',
    url: 'https://sre.google/sre-book/table-of-contents/',
    description: 'Le livre fondateur du SRE par Google, disponible gratuitement en ligne',
  },
  {
    title: 'The Site Reliability Workbook',
    type: 'book',
    url: 'https://sre.google/workbook/table-of-contents/',
    description: 'Le guide pratique companion du SRE Book, avec des exemples concrets',
  },
  {
    title: 'Observability Engineering (Charity Majors et al.)',
    type: 'book',
    description: 'Le livre de reference sur l\'observabilite moderne par les fondateurs de Honeycomb',
  },
  {
    title: 'Accelerate (Nicole Forsgren et al.)',
    type: 'book',
    description: 'La recherche scientifique derriere les DORA metrics',
  },
  {
    title: 'Release It! (Michael Nygard)',
    type: 'book',
    description: 'Patterns de resilience et anti-patterns en production',
  },
  // Outils
  {
    title: 'OpenTelemetry',
    type: 'tool',
    url: 'https://opentelemetry.io/',
    description: 'Standard open source pour la collecte de telemetrie',
  },
  {
    title: 'Prometheus',
    type: 'tool',
    url: 'https://prometheus.io/',
    description: 'Systeme de monitoring et d\'alerting time-series',
  },
  {
    title: 'Grafana',
    type: 'tool',
    url: 'https://grafana.com/',
    description: 'Plateforme de visualisation et d\'observabilite',
  },
  {
    title: 'k6',
    type: 'tool',
    url: 'https://k6.io/',
    description: 'Outil de test de charge moderne avec scripting JavaScript',
  },
  // Communaute
  {
    title: 'CNCF (Cloud Native Computing Foundation)',
    type: 'community',
    url: 'https://www.cncf.io/',
    description: 'La fondation derriere Prometheus, OpenTelemetry, Jaeger et de nombreux projets',
  },
  {
    title: 'SRE Weekly',
    type: 'website',
    url: 'https://sreweekly.com/',
    description: 'Newsletter hebdomadaire sur le SRE et la fiabilite',
  },
];
```

---

## Guide de livraison étape par étape

::: tip Ordre recommande
Suivez ces étapes dans l'ordre pour construire le projet de manière incrementale. Chaque étape ajoute une couche d'observabilité supplementaire.
:::

1. **Étape 1 — Setup** : Créer le repository, initialiser Docker Compose avec PostgreSQL et les 3 services Express
2. **Étape 2 — Logging** : Intégrer Pino avec logs structures, log levels, contexte requête et redaction
3. **Étape 3 — Metriques** : Ajouter prom-client avec metriques RED et endpoint /metrics
4. **Étape 4 — Tracing** : Intégrer OpenTelemetry SDK avec auto-instrumentation et export vers Jaeger
5. **Étape 5 — Collecte** : Ajouter Prometheus (scraping) et OTel Collector (traces) au Docker Compose
6. **Étape 6 — Visualisation** : Configurer Grafana avec dashboards provisionnes (service + SLO)
7. **Étape 7 — SLOs** : Définir les SLOs, configurer les recording rules et le dashboard error budget
8. **Étape 8 — Alerting** : Ajouter les burn rate alerts multi-window dans Prometheus
9. **Étape 9 — Health checks** : Implementer liveness, readiness et startup probes
10. **Étape 10 — Tests de charge** : Écrire et exécuter les scripts k6 (ramp-up, steady, spike)
11. **Étape 11 — Chaos** : Implementer le chaos middleware et exécuter 2 experiences documentees
12. **Étape 12 — Incident** : Simuler un incident avec la timeline et rediger le postmortem
13. **Étape 13 — PRR** : Remplir la checklist de production readiness
14. **Étape 14 — Polish** : README, git history propre, derniers ajustements

---

::: warning Date de livraison
Le projet est a livrer en **un repository Git** contenant tout le code source, les configurations, les scripts de test, la documentation et le postmortem. Assurez-vous que `docker compose up -d` lance l'ensemble du stack sans intervention manuelle.
:::

---

::: tip Felicitations !
Si vous etes arrive jusqu'ici, vous avez parcouru un chemin considerable. Vous maitrisez maintenant les fondamentaux de l'**observabilité** et du **Site Reliability Engineering** :

- Vous savez **instrumenter** une application avec les 3 piliers (logs, metriques, traces)
- Vous comprenez les **SLOs** et savez les définir, mesurer et alerter dessus
- Vous pouvez **diagnostiquer** un incident en correlant les signaux
- Vous savez écrire un **postmortem** blameless et en extraire des actions concretes
- Vous connaissez le **chaos engineering** et pouvez prouver la résilience de vos systèmes
- Vous pouvez évaluer la **production readiness** d'un service

Ces compétences sont recherchees par toutes les entreprises qui operent des systèmes distribues en production. Que vous deveniez SRE, DevOps engineer, platform engineer ou simplement un développeur qui comprend la production, ce savoir vous servira tout au long de votre carriere.

**Bonne chance pour le projet final, et surtout, continuez à apprendre !**
:::

---

## Pour aller plus loin

Après avoir terminé ce projet final, explorez les modules bonus :

- **[Module 20 — Kubernetes & Container Observability](/modules/20-kubernetes-observability)** : Observabilité spécifique aux environnements Kubernetes — kube-state-metrics, Prometheus Operator, logging et tracing en K8s
- **[Module 21 — FinOps : Coût de l'Observabilité](/modules/21-finops-observability)** : Maîtriser les coûts de votre stack d'observabilité — cardinalité, sampling, rétention, ROI

- [Tous les labs du cours](/labs/)
- [Tous les quizzes du cours](/quizzes/)
- Google SRE Book (gratuit en ligne) : https://sre.google/sre-book/table-of-contents/
- Google SRE Workbook (gratuit en ligne) : https://sre.google/workbook/table-of-contents/
- OpenTelemetry Documentation : https://opentelemetry.io/docs/
- Prometheus Documentation : https://prometheus.io/docs/
- Grafana Documentation : https://grafana.com/docs/

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 18 projet final](../screencasts/screencast-18-projet-final.md)
2. **Lab** : [lab-18-projet-final](../labs/lab-18-projet-final/README)
3. **Quiz** : [quiz 18 projet final](../quizzes/quiz-18-projet-final.html)
:::

---

<!-- navigation-inter-cours -->

::: info Cours suivant
Bravo, tu as termine le cours **Observabilité & SRE** ! 
> Ce cours est optionnel (Palier 5 — bonus). Tu peux aussi passer directement au cours suivant.
Le prochain cours du curriculum est **React Native**.

[Commencer React Native →](../../13-react-native/modules/00-prerequis-et-introduction.md)
:::

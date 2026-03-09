# Observability as Code (Dashboards, Alerts, SLOs)

## Objectifs pedagogiques

- Comprendre pourquoi codifier la configuration d'observabilite
- Savoir generer des dashboards Grafana en TypeScript (JSON model)
- Ecrire des regles d'alerting Prometheus en tant que code versionne
- Definir des SLOs comme structures de donnees validees
- Mettre en place un workflow GitOps pour l'observabilite
- Tester et valider la configuration d'observabilite (linting, schemas)
- Construire un pipeline CI/CD complet pour l'observability-as-code

---

## Introduction : pourquoi codifier l'observabilite ?

Imaginez une equipe qui configure ses dashboards Grafana manuellement via l'interface web. Un jour, quelqu'un supprime accidentellement un dashboard critique pendant un incident. Pas de backup, pas d'historique, pas de moyen de le reconstruire rapidement. Cette situation est malheureusement courante.

L'**Observability as Code** applique les memes principes que l'Infrastructure as Code (IaC) a la configuration d'observabilite : dashboards, alertes, SLOs, et regles de recording sont definis dans des fichiers versionnes, revises par des pairs, et deployes automatiquement.

```typescript
interface ObservabilityAsCodeBenefits {
  benefit: string;
  description: string;
  withoutCode: string;
  withCode: string;
}

const benefits: ObservabilityAsCodeBenefits[] = [
  {
    benefit: 'Reproductibilite',
    description: 'La configuration peut etre recree identiquement a tout moment',
    withoutCode: 'Dashboard recree de memoire apres suppression accidentelle',
    withCode: 'git checkout + apply : dashboard restaure en secondes',
  },
  {
    benefit: 'Revue par les pairs',
    description: 'Chaque changement passe par une code review',
    withoutCode: 'Un ingenieur modifie un seuil d\'alerte sans concertation',
    withCode: 'Pull request revue par l\'equipe avant merge',
  },
  {
    benefit: 'Historique et audit',
    description: 'Chaque modification est tracee dans Git',
    withoutCode: 'Qui a change cette alerte ? Quand ? Pourquoi ?',
    withCode: 'git log --oneline alerting-rules.yaml : historique complet',
  },
  {
    benefit: 'Coherence multi-environnement',
    description: 'Meme configuration en staging et production',
    withoutCode: 'Dashboards differents en staging et prod, bugs non detectes',
    withCode: 'Un seul template parametre par environnement',
  },
  {
    benefit: 'Scalabilite',
    description: 'Generer la configuration pour N services automatiquement',
    withoutCode: 'Creer manuellement un dashboard par microservice (50 services = 50 clicks)',
    withCode: 'Boucle TypeScript qui genere 50 dashboards en 1 seconde',
  },
];
```

::: warning Anti-pattern classique
Ne configurez **jamais** vos dashboards et alertes uniquement via l'interface graphique. Toute configuration manuelle est une dette technique d'observabilite. Si votre Grafana tombe, pouvez-vous tout reconstruire en 5 minutes ?
:::

---

## Dashboards as Code : le modele JSON Grafana

### Structure d'un dashboard Grafana

Grafana stocke ses dashboards sous forme de JSON. Comprendre cette structure permet de les generer programmatiquement.

```typescript
// Types representant le modele JSON Grafana
interface GrafanaDashboard {
  id: null | number;
  uid: string;
  title: string;
  tags: string[];
  timezone: string;
  schemaVersion: number;
  version: number;
  refresh: string;
  time: {
    from: string;
    to: string;
  };
  templating: {
    list: GrafanaVariable[];
  };
  panels: GrafanaPanel[];
}

interface GrafanaVariable {
  type: 'query' | 'custom' | 'constant' | 'interval';
  name: string;
  label: string;
  datasource?: string;
  query?: string;
  current: { text: string; value: string };
  options?: Array<{ text: string; value: string }>;
  refresh?: number;
  includeAll?: boolean;
  multi?: boolean;
}

interface GrafanaPanel {
  id: number;
  type: 'timeseries' | 'stat' | 'gauge' | 'table' | 'row' | 'heatmap' | 'text';
  title: string;
  description?: string;
  gridPos: { x: number; y: number; w: number; h: number };
  datasource?: string;
  targets: GrafanaTarget[];
  fieldConfig?: {
    defaults: {
      color?: { mode: string };
      thresholds?: {
        mode: string;
        steps: Array<{ color: string; value: number | null }>;
      };
      unit?: string;
    };
    overrides?: Array<Record<string, unknown>>;
  };
  options?: Record<string, unknown>;
}

interface GrafanaTarget {
  refId: string;
  expr: string;
  legendFormat?: string;
  interval?: string;
}
```

### Generateur de panels Grafana

```typescript
// ===== Utilitaire de generation de panels Grafana =====

let panelIdCounter = 1;

function createTimeseriesPanel(config: {
  title: string;
  description?: string;
  queries: Array<{ expr: string; legend: string }>;
  unit?: string;
  gridPos: { x: number; y: number; w: number; h: number };
  thresholds?: Array<{ color: string; value: number | null }>;
}): GrafanaPanel {
  return {
    id: panelIdCounter++,
    type: 'timeseries',
    title: config.title,
    description: config.description,
    gridPos: config.gridPos,
    targets: config.queries.map((q, i) => ({
      refId: String.fromCharCode(65 + i), // A, B, C...
      expr: q.expr,
      legendFormat: q.legend,
    })),
    fieldConfig: {
      defaults: {
        unit: config.unit || 'short',
        thresholds: config.thresholds
          ? { mode: 'absolute', steps: config.thresholds }
          : undefined,
      },
    },
    options: {
      tooltip: { mode: 'multi', sort: 'desc' },
      legend: { displayMode: 'table', calcs: ['mean', 'max', 'last'] },
    },
  };
}

function createStatPanel(config: {
  title: string;
  query: string;
  unit?: string;
  gridPos: { x: number; y: number; w: number; h: number };
  thresholds: Array<{ color: string; value: number | null }>;
  reduceCalc?: string;
}): GrafanaPanel {
  return {
    id: panelIdCounter++,
    type: 'stat',
    title: config.title,
    gridPos: config.gridPos,
    targets: [{ refId: 'A', expr: config.query }],
    fieldConfig: {
      defaults: {
        unit: config.unit || 'short',
        thresholds: { mode: 'absolute', steps: config.thresholds },
      },
    },
    options: {
      reduceOptions: { calcs: [config.reduceCalc || 'lastNotNull'] },
      colorMode: 'background',
      textMode: 'value_and_name',
    },
  };
}

function createGaugePanel(config: {
  title: string;
  query: string;
  unit?: string;
  min?: number;
  max?: number;
  gridPos: { x: number; y: number; w: number; h: number };
  thresholds: Array<{ color: string; value: number | null }>;
}): GrafanaPanel {
  return {
    id: panelIdCounter++,
    type: 'gauge',
    title: config.title,
    gridPos: config.gridPos,
    targets: [{ refId: 'A', expr: config.query }],
    fieldConfig: {
      defaults: {
        unit: config.unit || 'percentunit',
        thresholds: { mode: 'absolute', steps: config.thresholds },
      },
    },
    options: {
      showThresholdLabels: true,
      showThresholdMarkers: true,
    },
  };
}

function createRowPanel(title: string, y: number): GrafanaPanel {
  return {
    id: panelIdCounter++,
    type: 'row',
    title,
    gridPos: { x: 0, y, w: 24, h: 1 },
    targets: [],
  };
}
```

### Template de dashboard avec variables

```typescript
function createServiceDashboard(serviceName: string): GrafanaDashboard {
  // Reinitialiser le compteur pour chaque dashboard
  panelIdCounter = 1;

  return {
    id: null,
    uid: `svc-${serviceName}`,
    title: `Service: ${serviceName}`,
    tags: ['auto-generated', 'service', serviceName],
    timezone: 'browser',
    schemaVersion: 39,
    version: 1,
    refresh: '30s',
    time: { from: 'now-1h', to: 'now' },
    templating: {
      list: [
        {
          type: 'query',
          name: 'instance',
          label: 'Instance',
          datasource: 'Prometheus',
          query: `label_values(up{job="${serviceName}"}, instance)`,
          current: { text: 'All', value: '$__all' },
          includeAll: true,
          multi: true,
          refresh: 2,
        },
        {
          type: 'interval',
          name: 'rate_interval',
          label: 'Rate Interval',
          current: { text: '5m', value: '5m' },
          options: [
            { text: '1m', value: '1m' },
            { text: '5m', value: '5m' },
            { text: '15m', value: '15m' },
            { text: '1h', value: '1h' },
          ],
        },
        {
          type: 'custom',
          name: 'percentile',
          label: 'Percentile',
          current: { text: '0.99', value: '0.99' },
          options: [
            { text: 'p50', value: '0.5' },
            { text: 'p90', value: '0.9' },
            { text: 'p95', value: '0.95' },
            { text: 'p99', value: '0.99' },
          ],
        },
      ],
    },
    panels: [
      // ---- Section : Vue d'ensemble ----
      createRowPanel('Vue d\'ensemble', 0),

      createStatPanel({
        title: 'Requetes/sec',
        query: `sum(rate(http_requests_total{job="${serviceName}"}[$rate_interval]))`,
        unit: 'reqps',
        gridPos: { x: 0, y: 1, w: 6, h: 4 },
        thresholds: [
          { color: 'green', value: null },
          { color: 'yellow', value: 100 },
          { color: 'red', value: 500 },
        ],
      }),

      createStatPanel({
        title: 'Taux d\'erreur',
        query:
          `sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[$rate_interval]))` +
          ` / sum(rate(http_requests_total{job="${serviceName}"}[$rate_interval])) * 100`,
        unit: 'percent',
        gridPos: { x: 6, y: 1, w: 6, h: 4 },
        thresholds: [
          { color: 'green', value: null },
          { color: 'yellow', value: 1 },
          { color: 'red', value: 5 },
        ],
      }),

      createStatPanel({
        title: 'Latence p99',
        query:
          `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket` +
          `{job="${serviceName}"}[$rate_interval])) by (le))`,
        unit: 's',
        gridPos: { x: 12, y: 1, w: 6, h: 4 },
        thresholds: [
          { color: 'green', value: null },
          { color: 'yellow', value: 0.3 },
          { color: 'red', value: 0.5 },
        ],
      }),

      createGaugePanel({
        title: 'Disponibilite (30j)',
        query:
          `1 - (sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[30d]))` +
          ` / sum(rate(http_requests_total{job="${serviceName}"}[30d])))`,
        unit: 'percentunit',
        gridPos: { x: 18, y: 1, w: 6, h: 4 },
        thresholds: [
          { color: 'red', value: null },
          { color: 'yellow', value: 0.99 },
          { color: 'green', value: 0.999 },
        ],
      }),

      // ---- Section : Trafic (RED) ----
      createRowPanel('Trafic — Methode RED', 5),

      createTimeseriesPanel({
        title: 'Request Rate',
        queries: [
          {
            expr: `sum(rate(http_requests_total{job="${serviceName}"}[$rate_interval])) by (method)`,
            legend: '{{method}}',
          },
        ],
        unit: 'reqps',
        gridPos: { x: 0, y: 6, w: 8, h: 8 },
      }),

      createTimeseriesPanel({
        title: 'Error Rate',
        queries: [
          {
            expr: `sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[$rate_interval])) by (status)`,
            legend: '{{status}}',
          },
        ],
        unit: 'reqps',
        gridPos: { x: 8, y: 6, w: 8, h: 8 },
      }),

      createTimeseriesPanel({
        title: 'Duration (percentiles)',
        queries: [
          {
            expr: `histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket{job="${serviceName}"}[$rate_interval])) by (le))`,
            legend: 'p50',
          },
          {
            expr: `histogram_quantile(0.9, sum(rate(http_request_duration_seconds_bucket{job="${serviceName}"}[$rate_interval])) by (le))`,
            legend: 'p90',
          },
          {
            expr: `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="${serviceName}"}[$rate_interval])) by (le))`,
            legend: 'p99',
          },
        ],
        unit: 's',
        gridPos: { x: 16, y: 6, w: 8, h: 8 },
      }),

      // ---- Section : Ressources ----
      createRowPanel('Ressources (USE)', 14),

      createTimeseriesPanel({
        title: 'CPU Usage',
        queries: [
          {
            expr: `rate(process_cpu_seconds_total{job="${serviceName}"}[$rate_interval])`,
            legend: '{{instance}}',
          },
        ],
        unit: 'percentunit',
        gridPos: { x: 0, y: 15, w: 12, h: 8 },
      }),

      createTimeseriesPanel({
        title: 'Memory Usage',
        queries: [
          {
            expr: `process_resident_memory_bytes{job="${serviceName}"}`,
            legend: '{{instance}}',
          },
        ],
        unit: 'bytes',
        gridPos: { x: 12, y: 15, w: 12, h: 8 },
      }),
    ],
  };
}

// Generer des dashboards pour plusieurs services
const services = ['api-gateway', 'user-service', 'order-service', 'payment-service'];

const dashboards = services.map((svc) => createServiceDashboard(svc));

// Exporter en JSON pour provisioning Grafana
for (const dashboard of dashboards) {
  const json = JSON.stringify(dashboard, null, 2);
  console.log(`Dashboard genere: ${dashboard.title} (${json.length} bytes)`);
  // En production : fs.writeFileSync(`dashboards/${dashboard.uid}.json`, json);
}
```

::: tip Generation en masse
L'interet majeur de l'approche programmatique : quand vous ajoutez un nouveau microservice, un simple ajout dans le tableau `services` genere automatiquement un dashboard complet avec les bonnes queries, les bons seuils et les bonnes variables.
:::

---

## Alerting Rules as Code

### Structure des regles Prometheus

Les regles d'alerting Prometheus sont definies en YAML. En les generant depuis TypeScript, on garantit la coherence et on evite les erreurs de syntaxe.

```typescript
// Types pour les regles d'alerting Prometheus
interface PrometheusAlertRule {
  alert: string;
  expr: string;
  for: string;
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
    dashboard_url?: string;
  };
}

interface PrometheusRuleGroup {
  name: string;
  interval?: string;
  rules: PrometheusAlertRule[];
}

interface PrometheusRuleFile {
  groups: PrometheusRuleGroup[];
}

// Generateur de regles d'alerting
function generateServiceAlertRules(config: {
  serviceName: string;
  errorRateThresholdPercent: number;
  latencyP99ThresholdMs: number;
  availabilityTarget: number; // ex: 0.999
  team: string;
  runbookBaseUrl: string;
}): PrometheusRuleGroup {
  const { serviceName, errorRateThresholdPercent, latencyP99ThresholdMs, availabilityTarget, team, runbookBaseUrl } = config;

  return {
    name: `${serviceName}-alerts`,
    interval: '30s',
    rules: [
      // Alerte : taux d'erreur eleve
      {
        alert: `${capitalize(serviceName)}HighErrorRate`,
        expr:
          `(sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[5m]))` +
          ` / sum(rate(http_requests_total{job="${serviceName}"}[5m]))) * 100` +
          ` > ${errorRateThresholdPercent}`,
        for: '5m',
        labels: {
          severity: 'critical',
          team,
          service: serviceName,
        },
        annotations: {
          summary: `Taux d'erreur eleve sur ${serviceName}`,
          description:
            `Le taux d'erreur de ${serviceName} est {{ $value | printf "%.2f" }}%` +
            ` (seuil: ${errorRateThresholdPercent}%).`,
          runbook_url: `${runbookBaseUrl}/${serviceName}/high-error-rate.md`,
          dashboard_url: `https://grafana.example.com/d/svc-${serviceName}`,
        },
      },

      // Alerte : latence elevee
      {
        alert: `${capitalize(serviceName)}HighLatency`,
        expr:
          `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket` +
          `{job="${serviceName}"}[5m])) by (le)) > ${latencyP99ThresholdMs / 1000}`,
        for: '10m',
        labels: {
          severity: 'warning',
          team,
          service: serviceName,
        },
        annotations: {
          summary: `Latence p99 elevee sur ${serviceName}`,
          description:
            `La latence p99 de ${serviceName} est {{ $value | printf "%.3f" }}s` +
            ` (seuil: ${latencyP99ThresholdMs}ms).`,
          runbook_url: `${runbookBaseUrl}/${serviceName}/high-latency.md`,
          dashboard_url: `https://grafana.example.com/d/svc-${serviceName}`,
        },
      },

      // Alerte : service down
      {
        alert: `${capitalize(serviceName)}Down`,
        expr: `up{job="${serviceName}"} == 0`,
        for: '1m',
        labels: {
          severity: 'critical',
          team,
          service: serviceName,
        },
        annotations: {
          summary: `${serviceName} est down`,
          description:
            `L'instance {{ $labels.instance }} de ${serviceName} ne repond plus ` +
            `depuis plus d'1 minute.`,
          runbook_url: `${runbookBaseUrl}/${serviceName}/service-down.md`,
        },
      },

      // Alerte : burn rate SLO (fenetre rapide)
      {
        alert: `${capitalize(serviceName)}SLOBurnRateFast`,
        expr:
          `(sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[5m]))` +
          ` / sum(rate(http_requests_total{job="${serviceName}"}[5m])))` +
          ` > ${((1 - availabilityTarget) * 14.4).toFixed(6)}`,
        for: '2m',
        labels: {
          severity: 'critical',
          team,
          service: serviceName,
          alert_type: 'slo-burn-rate',
          window: 'fast',
        },
        annotations: {
          summary: `Burn rate SLO rapide depasse sur ${serviceName}`,
          description:
            `Le burn rate 5m de ${serviceName} est {{ $value | printf "%.6f" }}. ` +
            `A ce rythme, l'error budget sera epuise en moins de 1 heure.`,
          runbook_url: `${runbookBaseUrl}/${serviceName}/slo-burn-rate.md`,
        },
      },

      // Alerte : burn rate SLO (fenetre lente)
      {
        alert: `${capitalize(serviceName)}SLOBurnRateSlow`,
        expr:
          `(sum(rate(http_requests_total{job="${serviceName}",status=~"5.."}[1h]))` +
          ` / sum(rate(http_requests_total{job="${serviceName}"}[1h])))` +
          ` > ${((1 - availabilityTarget) * 3).toFixed(6)}`,
        for: '15m',
        labels: {
          severity: 'warning',
          team,
          service: serviceName,
          alert_type: 'slo-burn-rate',
          window: 'slow',
        },
        annotations: {
          summary: `Burn rate SLO lent depasse sur ${serviceName}`,
          description:
            `Le burn rate 1h de ${serviceName} est {{ $value | printf "%.6f" }}. ` +
            `A ce rythme, l'error budget sera epuise en moins de 10 jours.`,
          runbook_url: `${runbookBaseUrl}/${serviceName}/slo-burn-rate.md`,
        },
      },
    ],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-./g, (m) => m[1].toUpperCase());
}
```

### Generer le fichier YAML complet

```typescript
// Convertir les regles en YAML (simplifie, sans librairie externe)
function toYaml(obj: unknown, indent = 0): string {
  const prefix = ' '.repeat(indent);

  if (obj === null || obj === undefined) return `${prefix}null`;
  if (typeof obj === 'string') return obj.includes('\n') ? `|-\n${prefix}  ${obj}` : `${obj}`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${obj}`;

  if (Array.isArray(obj)) {
    return obj
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const entries = Object.entries(item);
          const first = entries[0];
          const rest = entries.slice(1);
          let result = `${prefix}- ${first[0]}: ${toYaml(first[1], indent + 4)}`;
          for (const [key, value] of rest) {
            if (typeof value === 'object' && value !== null) {
              result += `\n${prefix}  ${key}:\n${toYaml(value, indent + 4)}`;
            } else {
              result += `\n${prefix}  ${key}: ${toYaml(value, indent + 4)}`;
            }
          }
          return result;
        }
        return `${prefix}- ${toYaml(item, indent + 2)}`;
      })
      .join('\n');
  }

  if (typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${prefix}${key}:\n${toYaml(value, indent + 2)}`;
        }
        return `${prefix}${key}: ${toYaml(value, indent + 2)}`;
      })
      .join('\n');
  }

  return `${obj}`;
}

// Generer le fichier de regles pour tous les services
function generateAlertRuleFile(
  services: Array<{
    name: string;
    errorThreshold: number;
    latencyThreshold: number;
    availabilityTarget: number;
    team: string;
  }>,
): string {
  const ruleFile: PrometheusRuleFile = {
    groups: services.map((svc) =>
      generateServiceAlertRules({
        serviceName: svc.name,
        errorRateThresholdPercent: svc.errorThreshold,
        latencyP99ThresholdMs: svc.latencyThreshold,
        availabilityTarget: svc.availabilityTarget,
        team: svc.team,
        runbookBaseUrl: 'https://wiki.example.com/runbooks',
      }),
    ),
  };

  return toYaml(ruleFile);
}

// Exemple d'utilisation
const alertYaml = generateAlertRuleFile([
  { name: 'api-gateway', errorThreshold: 1, latencyThreshold: 300, availabilityTarget: 0.999, team: 'platform' },
  { name: 'user-service', errorThreshold: 2, latencyThreshold: 500, availabilityTarget: 0.995, team: 'identity' },
  { name: 'order-service', errorThreshold: 1, latencyThreshold: 400, availabilityTarget: 0.999, team: 'commerce' },
]);

console.log(alertYaml);
// En production : fs.writeFileSync('prometheus/alert-rules.yaml', alertYaml);
```

---

## SLO as Code

### Definir des SLOs comme structures de donnees

```typescript
// ===== SLO Definition Types =====

type SLIType = 'availability' | 'latency' | 'throughput' | 'correctness';

interface SLODefinition {
  name: string;
  service: string;
  description: string;
  sliType: SLIType;
  target: number; // ex: 0.999 pour 99.9%
  window: '7d' | '28d' | '30d' | '90d';
  goodQuery: string;   // Requete PromQL pour les "bons" evenements
  totalQuery: string;  // Requete PromQL pour le total des evenements
  burnRateWindows: Array<{
    severity: 'critical' | 'warning' | 'info';
    longWindow: string;
    shortWindow: string;
    burnRateThreshold: number;
    for: string;
  }>;
  metadata: {
    team: string;
    tier: 'tier-1' | 'tier-2' | 'tier-3';
    documentationUrl: string;
    lastReviewDate: string;
  };
}

// Catalogue de SLOs pour un service
const sloDefinitions: SLODefinition[] = [
  {
    name: 'api-gateway-availability',
    service: 'api-gateway',
    description: 'Le pourcentage de requetes HTTP qui recoivent une reponse non-5xx',
    sliType: 'availability',
    target: 0.999,
    window: '30d',
    goodQuery: 'sum(rate(http_requests_total{job="api-gateway",status!~"5.."}[${window}]))',
    totalQuery: 'sum(rate(http_requests_total{job="api-gateway"}[${window}]))',
    burnRateWindows: [
      { severity: 'critical', longWindow: '1h', shortWindow: '5m', burnRateThreshold: 14.4, for: '2m' },
      { severity: 'critical', longWindow: '6h', shortWindow: '30m', burnRateThreshold: 6, for: '5m' },
      { severity: 'warning', longWindow: '1d', shortWindow: '2h', burnRateThreshold: 3, for: '10m' },
      { severity: 'warning', longWindow: '3d', shortWindow: '6h', burnRateThreshold: 1, for: '30m' },
    ],
    metadata: {
      team: 'platform',
      tier: 'tier-1',
      documentationUrl: 'https://wiki.example.com/slos/api-gateway-availability',
      lastReviewDate: '2025-03-01',
    },
  },
  {
    name: 'api-gateway-latency',
    service: 'api-gateway',
    description: 'Le pourcentage de requetes HTTP avec une latence inferieure a 300ms',
    sliType: 'latency',
    target: 0.99,
    window: '30d',
    goodQuery: 'sum(rate(http_request_duration_seconds_bucket{job="api-gateway",le="0.3"}[${window}]))',
    totalQuery: 'sum(rate(http_request_duration_seconds_count{job="api-gateway"}[${window}]))',
    burnRateWindows: [
      { severity: 'critical', longWindow: '1h', shortWindow: '5m', burnRateThreshold: 14.4, for: '2m' },
      { severity: 'warning', longWindow: '1d', shortWindow: '2h', burnRateThreshold: 3, for: '10m' },
    ],
    metadata: {
      team: 'platform',
      tier: 'tier-1',
      documentationUrl: 'https://wiki.example.com/slos/api-gateway-latency',
      lastReviewDate: '2025-03-01',
    },
  },
];
```

### Validation des SLOs

```typescript
// ===== Validation des definitions SLO =====

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateSLODefinition(slo: SLODefinition): ValidationError[] {
  const errors: ValidationError[] = [];

  // Le target doit etre entre 0 et 1
  if (slo.target <= 0 || slo.target >= 1) {
    errors.push({
      field: 'target',
      message: `Le target doit etre entre 0 et 1 (recu: ${slo.target})`,
      severity: 'error',
    });
  }

  // Le target ne devrait pas etre superieur a 99.99% (4 nines)
  if (slo.target > 0.9999) {
    errors.push({
      field: 'target',
      message: `Un target de ${slo.target * 100}% est probablement irealiste. ` +
        `Meme Google vise rarement au-dessus de 99.99%.`,
      severity: 'warning',
    });
  }

  // Verifier que les burn rate windows sont ordonnees
  const burnRates = slo.burnRateWindows.map((w) => w.burnRateThreshold);
  for (let i = 1; i < burnRates.length; i++) {
    if (burnRates[i] >= burnRates[i - 1]) {
      errors.push({
        field: 'burnRateWindows',
        message: `Les burn rate thresholds doivent etre decroissants. ` +
          `Window ${i}: ${burnRates[i]} >= Window ${i - 1}: ${burnRates[i - 1]}`,
        severity: 'error',
      });
    }
  }

  // Verifier que les queries PromQL contiennent le placeholder ${window}
  if (!slo.goodQuery.includes('${window}')) {
    errors.push({
      field: 'goodQuery',
      message: 'La goodQuery devrait contenir ${window} pour etre parametrable',
      severity: 'warning',
    });
  }

  if (!slo.totalQuery.includes('${window}')) {
    errors.push({
      field: 'totalQuery',
      message: 'La totalQuery devrait contenir ${window} pour etre parametrable',
      severity: 'warning',
    });
  }

  // Verifier que le nom est en kebab-case
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slo.name)) {
    errors.push({
      field: 'name',
      message: `Le nom doit etre en kebab-case (recu: "${slo.name}")`,
      severity: 'error',
    });
  }

  // Verifier la date de review (< 90 jours)
  const lastReview = new Date(slo.metadata.lastReviewDate);
  const daysSinceReview = (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceReview > 90) {
    errors.push({
      field: 'metadata.lastReviewDate',
      message: `Le SLO n'a pas ete revu depuis ${Math.floor(daysSinceReview)} jours. ` +
        `Revue recommandee tous les 90 jours.`,
      severity: 'warning',
    });
  }

  // Verifier coherence burn rate avec target
  for (const window of slo.burnRateWindows) {
    const errorBudget = 1 - slo.target;
    const maxBurnRate = 1 / errorBudget;
    if (window.burnRateThreshold > maxBurnRate) {
      errors.push({
        field: 'burnRateWindows',
        message: `Burn rate ${window.burnRateThreshold} depasse le maximum theorique ` +
          `de ${maxBurnRate.toFixed(1)} pour un target de ${slo.target * 100}%`,
        severity: 'error',
      });
    }
  }

  return errors;
}

// Valider tous les SLOs
function validateAllSLOs(slos: SLODefinition[]): void {
  let hasErrors = false;

  for (const slo of slos) {
    const errors = validateSLODefinition(slo);
    if (errors.length > 0) {
      console.log(`\n=== ${slo.name} ===`);
      for (const error of errors) {
        const icon = error.severity === 'error' ? 'ERREUR' : 'ATTENTION';
        console.log(`  [${icon}] ${error.field}: ${error.message}`);
        if (error.severity === 'error') hasErrors = true;
      }
    }
  }

  if (hasErrors) {
    console.error('\nValidation echouee — corrigez les erreurs avant de deployer.');
    process.exit(1);
  } else {
    console.log('\nValidation reussie — toutes les definitions SLO sont valides.');
  }
}

validateAllSLOs(sloDefinitions);
```

---

## GitOps Workflow pour l'observabilite

### Structure du repository

```typescript
interface ObservabilityRepoStructure {
  path: string;
  description: string;
}

const repoStructure: ObservabilityRepoStructure[] = [
  { path: 'observability/', description: 'Racine du code d\'observabilite' },
  { path: 'observability/dashboards/', description: 'Dashboards Grafana generes (JSON)' },
  { path: 'observability/alerts/', description: 'Regles d\'alerting Prometheus (YAML)' },
  { path: 'observability/slos/', description: 'Definitions de SLOs (TypeScript)' },
  { path: 'observability/recording-rules/', description: 'Recording rules Prometheus (YAML)' },
  { path: 'observability/generators/', description: 'Scripts TypeScript de generation' },
  { path: 'observability/tests/', description: 'Tests de validation' },
  { path: 'observability/ci/', description: 'Pipeline CI/CD' },
  { path: '.github/workflows/observability.yaml', description: 'GitHub Actions workflow' },
];
```

::: tip Structure recommandee
Gardez le code d'observabilite dans le **meme repository** que le service qu'il observe. Ainsi, quand un developpeur ajoute un nouvel endpoint, il peut ajouter le panel de dashboard et l'alerte dans la meme pull request. C'est le principe du **shift-left** applique a l'observabilite.
:::

### Pipeline CI/CD

```typescript
// Representation du pipeline GitHub Actions en TypeScript
interface GithubActionsWorkflow {
  name: string;
  on: Record<string, unknown>;
  jobs: Record<string, GithubActionsJob>;
}

interface GithubActionsJob {
  'runs-on': string;
  steps: Array<{
    name: string;
    uses?: string;
    run?: string;
    with?: Record<string, string>;
  }>;
}

const observabilityPipeline: GithubActionsWorkflow = {
  name: 'Observability as Code',
  on: {
    push: { branches: ['main'], paths: ['observability/**'] },
    pull_request: { paths: ['observability/**'] },
  },
  jobs: {
    validate: {
      'runs-on': 'ubuntu-latest',
      steps: [
        { name: 'Checkout', uses: 'actions/checkout@v4' },
        { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
        { name: 'Install dependencies', run: 'npm ci' },
        { name: 'Validate SLO definitions', run: 'npx ts-node observability/generators/validate-slos.ts' },
        { name: 'Generate dashboards', run: 'npx ts-node observability/generators/generate-dashboards.ts' },
        { name: 'Generate alert rules', run: 'npx ts-node observability/generators/generate-alerts.ts' },
        { name: 'Lint Prometheus rules', run: 'promtool check rules observability/alerts/*.yaml' },
        { name: 'Test alert rules', run: 'promtool test rules observability/tests/alert-tests.yaml' },
        { name: 'Validate Grafana JSON', run: 'npx ts-node observability/generators/validate-dashboards.ts' },
      ],
    },
    deploy: {
      'runs-on': 'ubuntu-latest',
      steps: [
        { name: 'Checkout', uses: 'actions/checkout@v4' },
        {
          name: 'Deploy dashboards to Grafana',
          run: [
            'for file in observability/dashboards/*.json; do',
            '  curl -s -X POST "https://grafana.example.com/api/dashboards/db"',
            '    -H "Authorization: Bearer ${{ secrets.GRAFANA_API_KEY }}"',
            '    -H "Content-Type: application/json"',
            '    -d "{\\\"dashboard\\\": $(cat $file), \\\"overwrite\\\": true}"',
            'done',
          ].join('\n'),
        },
        {
          name: 'Reload Prometheus rules',
          run: [
            'cp observability/alerts/*.yaml /etc/prometheus/rules/',
            'curl -s -X POST http://prometheus:9090/-/reload',
          ].join('\n'),
        },
      ],
    },
  },
};
```

---

## Tester la configuration d'observabilite

### Validation des dashboards

```typescript
// ===== Validation de dashboards Grafana =====

interface DashboardValidationResult {
  dashboardUid: string;
  dashboardTitle: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateGrafanaDashboard(dashboard: GrafanaDashboard): DashboardValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verifier les champs obligatoires
  if (!dashboard.uid) errors.push('Le champ "uid" est requis');
  if (!dashboard.title) errors.push('Le champ "title" est requis');
  if (dashboard.panels.length === 0) warnings.push('Le dashboard n\'a aucun panel');

  // Verifier l'unicite des IDs de panel
  const panelIds = dashboard.panels.map((p) => p.id);
  const duplicateIds = panelIds.filter((id, idx) => panelIds.indexOf(id) !== idx);
  if (duplicateIds.length > 0) {
    errors.push(`IDs de panel dupliques: ${duplicateIds.join(', ')}`);
  }

  // Verifier que les panels ne se chevauchent pas
  for (let i = 0; i < dashboard.panels.length; i++) {
    for (let j = i + 1; j < dashboard.panels.length; j++) {
      const a = dashboard.panels[i].gridPos;
      const b = dashboard.panels[j].gridPos;
      if (a && b && a.y === b.y && a.x === b.x) {
        warnings.push(
          `Panels "${dashboard.panels[i].title}" et "${dashboard.panels[j].title}" ` +
          `se chevauchent a la position (${a.x}, ${a.y})`,
        );
      }
    }
  }

  // Verifier que chaque panel a au moins un target (sauf les rows)
  for (const panel of dashboard.panels) {
    if (panel.type !== 'row' && panel.type !== 'text') {
      if (!panel.targets || panel.targets.length === 0) {
        errors.push(`Le panel "${panel.title}" n'a aucun target/query`);
      }
    }
  }

  // Verifier les tags
  if (!dashboard.tags || dashboard.tags.length === 0) {
    warnings.push('Le dashboard n\'a pas de tags — les tags facilitent la recherche');
  }

  // Verifier le refresh rate
  if (!dashboard.refresh) {
    warnings.push('Pas de refresh rate defini — les donnees ne se mettront pas a jour automatiquement');
  }

  return {
    dashboardUid: dashboard.uid,
    dashboardTitle: dashboard.title,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Valider tous les dashboards generes
function validateAllDashboards(dashboards: GrafanaDashboard[]): boolean {
  let allValid = true;

  for (const dashboard of dashboards) {
    const result = validateGrafanaDashboard(dashboard);
    console.log(`\n[${result.isValid ? 'OK' : 'ERREUR'}] ${result.dashboardTitle}`);

    for (const error of result.errors) {
      console.log(`  ERREUR: ${error}`);
    }
    for (const warning of result.warnings) {
      console.log(`  ATTENTION: ${warning}`);
    }

    if (!result.isValid) allValid = false;
  }

  return allValid;
}
```

### Tests unitaires pour les regles d'alerting

```typescript
// ===== Test des regles d'alerting (format promtool test) =====

interface PromtoolTestCase {
  interval: string;
  input_series: Array<{
    series: string;
    values: string;
  }>;
  alert_rule_test: Array<{
    eval_time: string;
    alertname: string;
    exp_alerts?: Array<{
      exp_labels: Record<string, string>;
      exp_annotations: Record<string, string>;
    }>;
  }>;
}

function generateAlertTest(serviceName: string): PromtoolTestCase {
  return {
    interval: '1m',
    input_series: [
      {
        series: `http_requests_total{job="${serviceName}",status="200"}`,
        values: '0+100x30',  // 100 requetes par minute pendant 30 minutes
      },
      {
        series: `http_requests_total{job="${serviceName}",status="500"}`,
        values: '0+0x10 0+10x20',  // 0 erreurs pendant 10min, puis 10/min pendant 20min
      },
    ],
    alert_rule_test: [
      {
        eval_time: '10m',
        alertname: `${capitalize(serviceName)}HighErrorRate`,
        // Pas d'alerte attendue a t=10m (pas encore de 5xx)
      },
      {
        eval_time: '20m',
        alertname: `${capitalize(serviceName)}HighErrorRate`,
        exp_alerts: [
          {
            exp_labels: {
              severity: 'critical',
              service: serviceName,
            },
            exp_annotations: {
              summary: `Taux d'erreur eleve sur ${serviceName}`,
            },
          },
        ],
      },
    ],
  };
}
```

---

## Bonnes pratiques

1. **Tout versionner** : dashboards, alertes, SLOs, recording rules — tout doit etre dans Git
2. **Generer, ne pas ecrire** : utilisez TypeScript pour generer le JSON/YAML plutot que de l'ecrire a la main
3. **Valider dans la CI** : utilisez `promtool check rules` et des validateurs de schema JSON
4. **Tester les alertes** : utilisez `promtool test rules` pour verifier que vos alertes se declenchent correctement
5. **Revue par les pairs** : chaque changement d'observabilite doit passer par une code review
6. **Parametrer par environnement** : les seuils de staging et de production peuvent differer
7. **Documenter les SLOs** : chaque SLO doit avoir un lien vers la documentation et le runbook
8. **Auditer regulierement** : verifiez trimestriellement que les SLOs, alertes et dashboards sont toujours pertinents
9. **Eviter le drift** : bloquez les modifications manuelles dans Grafana (provisioned dashboards en read-only)
10. **Commencer simple** : un seul dashboard et quelques alertes bien definies valent mieux que 50 dashboards non maintenus

::: warning Piege du dashboard drift
Si vous permettez les modifications manuelles en plus du code, vous aurez inevitablement un **drift** entre le code et la realite. Configurez vos dashboards Grafana en mode **provisioned** (lecture seule dans l'UI) pour forcer les modifications via le code.
:::

---

::: tip A retenir
- L'**Observability as Code** applique les principes de l'IaC aux dashboards, alertes et SLOs
- **Grafana** stocke ses dashboards en JSON — generez-les depuis TypeScript pour la coherence
- Les **regles Prometheus** en YAML peuvent etre generees, validees avec `promtool` et testees unitairement
- Les **SLOs** doivent etre des structures de donnees typees, validees et versionnees
- Le pipeline CI/CD doit **valider, generer, tester et deployer** automatiquement
- Bloquez les modifications manuelles pour eviter le **drift** entre le code et la realite
- Chaque nouveau service doit avoir ses dashboards et alertes generes automatiquement
:::

---

## Pour aller plus loin

- [Lab 17 — Pipeline Observability as Code](/labs/lab-17-observability-as-code/README)
- [Quiz 17 — Observability as Code](/quizzes/quiz-17-observability-as-code)
- Grafana Dashboard JSON Model Documentation
- Prometheus Alerting Rules Documentation
- Google SRE Workbook, Chapitre 5 : "Alerting on SLOs"
- Grafana Provisioning Documentation

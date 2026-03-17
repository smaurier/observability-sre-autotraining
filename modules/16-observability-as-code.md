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

Benefices cles : **reproductibilite** (restauration en secondes via Git), **revue par les pairs** (PR avant chaque changement), **historique et audit** (git log complet), **coherence multi-environnement** (un template parametre), **scalabilite** (generation automatique pour N services).

::: warning Anti-pattern classique
Ne configurez **jamais** vos dashboards et alertes uniquement via l'interface graphique. Toute configuration manuelle est une dette technique d'observabilite. Si votre Grafana tombe, pouvez-vous tout reconstruire en 5 minutes ?
:::

---

## Dashboards as Code : le modele JSON Grafana

### Structure d'un dashboard Grafana

Grafana stocke ses dashboards sous forme de JSON. Comprendre cette structure permet de les generer programmatiquement.

```typescript
// Types cles du modele JSON Grafana (simplifie)
interface GrafanaDashboard {
  id: null | number;
  uid: string;
  title: string;
  tags: string[];
  schemaVersion: number;
  refresh: string;
  time: { from: string; to: string };
  templating: { list: GrafanaVariable[] };
  panels: GrafanaPanel[];
}

interface GrafanaVariable {
  type: 'query' | 'custom' | 'constant' | 'interval';
  name: string;
  label: string;
  datasource?: string;
  query?: string;
  current: { text: string; value: string };
}

interface GrafanaPanel {
  id: number;
  type: 'timeseries' | 'stat' | 'gauge' | 'table' | 'row' | 'heatmap' | 'text';
  title: string;
  gridPos: { x: number; y: number; w: number; h: number };
  targets: Array<{ refId: string; expr: string; legendFormat?: string }>;
  fieldConfig?: {
    defaults: {
      unit?: string;
      thresholds?: { mode: string; steps: Array<{ color: string; value: number | null }> };
    };
  };
  options?: Record<string, unknown>;
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

// createGaugePanel et createRowPanel suivent le meme pattern.
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
        { type: 'query', name: 'instance', label: 'Instance',
          datasource: 'Prometheus', query: `label_values(up{job="${serviceName}"}, instance)`,
          current: { text: 'All', value: '$__all' } },
        { type: 'interval', name: 'rate_interval', label: 'Rate Interval',
          current: { text: '5m', value: '5m' } },
        { type: 'custom', name: 'percentile', label: 'Percentile',
          current: { text: '0.99', value: '0.99' } },
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
        thresholds: [{ color: 'green', value: null }, { color: 'yellow', value: 100 }, { color: 'red', value: 500 }],
      }),
      // + Taux d'erreur (stat), Latence p99 (stat), Disponibilite 30j (gauge)
      // Meme pattern avec des queries et seuils differents

      // ---- Section : Trafic (RED) ----
      createRowPanel('Trafic — Methode RED', 5),

      createTimeseriesPanel({
        title: 'Request Rate',
        queries: [{
          expr: `sum(rate(http_requests_total{job="${serviceName}"}[$rate_interval])) by (method)`,
          legend: '{{method}}',
        }],
        unit: 'reqps',
        gridPos: { x: 0, y: 6, w: 8, h: 8 },
      }),
      // + Error Rate (timeseries), Duration percentiles (timeseries avec p50/p90/p99)

      // ---- Section : Ressources (USE) ----
      // CPU Usage (rate(process_cpu_seconds_total)), Memory Usage (process_resident_memory_bytes)
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

Pour convertir les objets TypeScript en YAML, utilisez une librairie comme `js-yaml` ou `yaml`. L'essentiel est la fonction de generation :

```typescript
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
interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

function validateSLODefinition(slo: SLODefinition): ValidationError[] {
  const errors: ValidationError[] = [];

  // Target entre 0 et 1, et pas au-dessus de 4 nines (irealiste)
  if (slo.target <= 0 || slo.target >= 1)
    errors.push({ field: 'target', message: `Doit etre entre 0 et 1 (recu: ${slo.target})`, severity: 'error' });
  if (slo.target > 0.9999)
    errors.push({ field: 'target', message: `${slo.target * 100}% est probablement irealiste`, severity: 'warning' });

  // Burn rate thresholds doivent etre decroissants
  const burnRates = slo.burnRateWindows.map((w) => w.burnRateThreshold);
  for (let i = 1; i < burnRates.length; i++) {
    if (burnRates[i] >= burnRates[i - 1])
      errors.push({ field: 'burnRateWindows', message: `Thresholds non decroissants a l'index ${i}`, severity: 'error' });
  }

  // Burn rate ne doit pas depasser le maximum theorique
  for (const window of slo.burnRateWindows) {
    const maxBurnRate = 1 / (1 - slo.target);
    if (window.burnRateThreshold > maxBurnRate)
      errors.push({ field: 'burnRateWindows', message: `Burn rate ${window.burnRateThreshold} > max ${maxBurnRate.toFixed(1)}`, severity: 'error' });
  }

  // Nom en kebab-case, queries parametrables, review < 90 jours
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slo.name))
    errors.push({ field: 'name', message: 'Doit etre en kebab-case', severity: 'error' });

  const daysSinceReview = (Date.now() - new Date(slo.metadata.lastReviewDate).getTime()) / 86_400_000;
  if (daysSinceReview > 90)
    errors.push({ field: 'lastReviewDate', message: `Non revu depuis ${Math.floor(daysSinceReview)} jours`, severity: 'warning' });

  return errors;
}
```

Integrez cette validation dans la CI : si `validateSLODefinition` retourne des erreurs de severite `'error'`, le pipeline doit echouer (`process.exit(1)`).

---

## GitOps Workflow pour l'observabilite

### Structure du repository

```
observability/
  dashboards/          # Dashboards Grafana generes (JSON)
  alerts/              # Regles d'alerting Prometheus (YAML)
  slos/                # Definitions de SLOs (TypeScript)
  recording-rules/     # Recording rules Prometheus (YAML)
  generators/          # Scripts TypeScript de generation
  tests/               # Tests de validation
.github/workflows/observability.yaml
```

::: tip Structure recommandee
Gardez le code d'observabilite dans le **meme repository** que le service qu'il observe. Ainsi, quand un developpeur ajoute un nouvel endpoint, il peut ajouter le panel de dashboard et l'alerte dans la meme pull request. C'est le principe du **shift-left** applique a l'observabilite.
:::

### Pipeline CI/CD

Le workflow GitHub Actions suit deux etapes : **validate** (sur chaque PR) et **deploy** (sur merge dans main).

**Job validate** (declenche sur `pull_request` + `paths: ['observability/**']`) :

1. Valider les definitions SLO (`validate-slos.ts`)
2. Generer dashboards et alert rules (`generate-dashboards.ts`, `generate-alerts.ts`)
3. Lint des regles Prometheus (`promtool check rules`)
4. Tests unitaires des alertes (`promtool test rules`)
5. Validation des dashboards JSON

**Job deploy** (declenche sur `push` vers `main`) :

1. Deployer les dashboards via l'API Grafana (`POST /api/dashboards/db`)
2. Copier les regles d'alerting et recharger Prometheus (`POST /-/reload`)

---

## Tester la configuration d'observabilite

### Validation des dashboards

Validez vos dashboards generes dans la CI. Points de verification essentiels :

- Champs `uid` et `title` presents
- IDs de panel uniques (pas de doublons)
- Chaque panel (sauf `row`/`text`) a au moins un `target`
- Pas de chevauchement de `gridPos`
- Tags et refresh rate definis

L'implementation complete du validateur est disponible dans le [Lab 17](/labs/lab-17-observability-as-code/README).

### Tests unitaires pour les regles d'alerting

Utilisez `promtool test rules` pour verifier que vos alertes se declenchent correctement. Le format de test permet de definir des series temporelles simulees (`input_series` avec la notation `0+100x30` pour 100 requetes/min pendant 30 min) et de verifier qu'a un instant donne (`eval_time`), une alerte est ou n'est pas declenchee. Generez ces fichiers de test en meme temps que vos regles d'alerting.

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

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 16 observability as code](../screencasts/screencast-16-observability-as-code.md)
2. **Lab** : [lab-16-observability-as-code](../labs/lab-16-observability-as-code/README)
3. **Quiz** : [quiz 16 observability as code](../quizzes/quiz-16-observability-as-code.html)
:::

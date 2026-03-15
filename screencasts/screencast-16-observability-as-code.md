# Screencast 17 — Observability as Code

## Informations
- **Duree estimee** : 22-28 min
- **Module** : `modules/17-observability-as-code.md`
- **Lab associe** : Lab 17
- **Prerequis** : Screencast 16

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Grafana accessible sur `http://localhost:3001`
- [ ] Prometheus accessible sur `http://localhost:9090`
- [ ] Fichier `scripts/generate-dashboard.ts` pret a etre cree
- [ ] Fichier `scripts/generate-alerts.ts` pret a etre cree
- [ ] Git initialise dans le projet

## Script

### [00:00-02:30] Introduction

> Dans le module 09, nous avons construit un dashboard Grafana manuellement — clic par clic dans l'interface. Dans le module 11, nous avons ecrit les regles d'alerting Prometheus a la main. Ca fonctionne pour un service. Mais avec 10, 50 ou 100 services, le travail manuel devient du toil. C'est exactement le probleme que nous avons identifie dans le module precedent.

> L'observability as code consiste a generer les configurations d'observabilite — dashboards, alertes, regles — a partir de code. Les avantages : versionne dans Git, reproductible, revise en PR, deploye automatiquement. Aujourd'hui, nous allons generer des dashboards Grafana et des regles Prometheus programmatiquement en TypeScript.

### [02:30-08:00] Generer un dashboard Grafana en JSON depuis TypeScript

**Action** : Creer le fichier `scripts/generate-dashboard.ts`.

```typescript
// scripts/generate-dashboard.ts

interface GrafanaPanel {
  id: number;
  title: string;
  type: string;
  gridPos: { h: number; w: number; x: number; y: number };
  targets: Array<{ expr: string; legendFormat: string; refId: string }>;
  fieldConfig?: Record<string, unknown>;
}

interface GrafanaDashboard {
  dashboard: {
    id: null;
    uid: string;
    title: string;
    tags: string[];
    timezone: string;
    refresh: string;
    templating: { list: Array<Record<string, unknown>> };
    panels: GrafanaPanel[];
  };
  overwrite: boolean;
}

// Fonction generique pour creer un panel Time Series
function createTimeSeriesPanel(
  id: number,
  title: string,
  queries: Array<{ expr: string; legend: string }>,
  gridPos: { h: number; w: number; x: number; y: number },
  unit: string = 'short'
): GrafanaPanel {
  return {
    id,
    title,
    type: 'timeseries',
    gridPos,
    targets: queries.map((q, i) => ({
      expr: q.expr,
      legendFormat: q.legend,
      refId: String.fromCharCode(65 + i), // A, B, C...
    })),
    fieldConfig: {
      defaults: {
        unit,
        custom: { lineWidth: 2, fillOpacity: 10 },
      },
    },
  };
}

// Generer un dashboard RED pour un service donne
function generateREDDashboard(serviceName: string, metricPrefix: string): GrafanaDashboard {
  const uid = `red-${serviceName}`;

  const panels: GrafanaPanel[] = [
    // Panel 1 : Request Rate
    createTimeSeriesPanel(
      1,
      'Request Rate (req/s)',
      [
        {
          expr: `sum by (route) (rate(${metricPrefix}_http_requests_total{job="$service"}[5m]))`,
          legend: '{{ route }}',
        },
      ],
      { h: 8, w: 12, x: 0, y: 0 },
      'reqps'
    ),

    // Panel 2 : Error Rate
    createTimeSeriesPanel(
      2,
      'Error Rate (%)',
      [
        {
          expr: `sum(rate(${metricPrefix}_http_requests_total{job="$service",status_code=~"5.."}[5m])) / sum(rate(${metricPrefix}_http_requests_total{job="$service"}[5m])) * 100`,
          legend: 'Error Rate',
        },
      ],
      { h: 8, w: 12, x: 12, y: 0 },
      'percent'
    ),

    // Panel 3 : Latency Percentiles
    createTimeSeriesPanel(
      3,
      'Latency Percentiles',
      [
        {
          expr: `histogram_quantile(0.5, sum by (le) (rate(${metricPrefix}_http_request_duration_seconds_bucket{job="$service"}[5m])))`,
          legend: 'p50',
        },
        {
          expr: `histogram_quantile(0.95, sum by (le) (rate(${metricPrefix}_http_request_duration_seconds_bucket{job="$service"}[5m])))`,
          legend: 'p95',
        },
        {
          expr: `histogram_quantile(0.99, sum by (le) (rate(${metricPrefix}_http_request_duration_seconds_bucket{job="$service"}[5m])))`,
          legend: 'p99',
        },
      ],
      { h: 8, w: 24, x: 0, y: 8 },
      's'
    ),

    // Panel 4 : SLO Availability
    createTimeSeriesPanel(
      4,
      'SLO Availability (target: 99.9%)',
      [
        {
          expr: `sum(rate(${metricPrefix}_http_requests_total{job="$service",status_code!~"5.."}[30m])) / sum(rate(${metricPrefix}_http_requests_total{job="$service"}[30m])) * 100`,
          legend: 'Availability %',
        },
        {
          expr: '99.9',
          legend: 'SLO Target',
        },
      ],
      { h: 8, w: 12, x: 0, y: 16 },
      'percent'
    ),

    // Panel 5 : Error Budget Remaining
    createTimeSeriesPanel(
      5,
      'Error Budget Consumption (%)',
      [
        {
          expr: `(1 - (sum(rate(${metricPrefix}_http_requests_total{job="$service",status_code!~"5.."}[30m])) / sum(rate(${metricPrefix}_http_requests_total{job="$service"}[30m])))) / (1 - 0.999) * 100`,
          legend: 'Budget Consumed',
        },
      ],
      { h: 8, w: 12, x: 12, y: 16 },
      'percent'
    ),
  ];

  return {
    dashboard: {
      id: null,
      uid,
      title: `RED Dashboard — ${serviceName}`,
      tags: ['sre', 'red', 'generated'],
      timezone: 'browser',
      refresh: '30s',
      templating: {
        list: [
          {
            name: 'service',
            type: 'query',
            query: `label_values(${metricPrefix}_http_requests_total, job)`,
            current: { text: serviceName, value: serviceName },
          },
        ],
      },
      panels,
    },
    overwrite: true,
  };
}

// Generer pour chaque service
const services = [
  { name: 'demo-app', prefix: 'demo_app' },
  // Ajouter d'autres services ici
];

for (const service of services) {
  const dashboard = generateREDDashboard(service.name, service.prefix);
  const filename = `config/grafana/dashboards/${service.name}-red.json`;

  // Ecrire le fichier JSON
  const fs = await import('fs');
  fs.writeFileSync(filename, JSON.stringify(dashboard, null, 2));
  console.log(`Dashboard genere : ${filename}`);
}
```

**Action** : Executer le script.

```bash
npx tsx scripts/generate-dashboard.ts
```

> Le fichier JSON est genere dans `config/grafana/dashboards/`. Grafana le charge automatiquement via le provisioning. Ouvrons Grafana pour verifier.

**Action** : Ouvrir Grafana et montrer le dashboard genere.

> Le dashboard est la — genere a partir de code. Chaque panel est correct : Rate, Error Rate, Latency Percentiles, SLO, Error Budget. Pour ajouter un nouveau service, il suffit d'ajouter une entree dans le tableau `services` et de relancer le script.

### [08:00-13:00] Generer des regles d'alerting Prometheus

**Action** : Creer le fichier `scripts/generate-alerts.ts`.

```typescript
// scripts/generate-alerts.ts
import * as fs from 'fs';
import * as yaml from 'yaml';

interface AlertConfig {
  serviceName: string;
  metricPrefix: string;
  sloTarget: number;        // ex: 0.999
  burnRateConfigs: Array<{
    severity: 'page' | 'ticket';
    burnRate: number;
    longWindow: string;
    shortWindow: string;
    forDuration: string;
  }>;
}

function generateAlertRules(config: AlertConfig) {
  const errorBudgetRate = 1 - config.sloTarget; // 0.001 pour 99.9%

  const rules = config.burnRateConfigs.map((br, index) => {
    const threshold = (br.burnRate * errorBudgetRate).toFixed(6);
    return {
      alert: `HighErrorBudgetBurn_${br.severity}_${config.serviceName}_${index}`,
      expr: [
        `(`,
        `  sum(rate(${config.metricPrefix}_http_requests_total{status_code=~"5.."}[${br.longWindow}]))`,
        `  /`,
        `  sum(rate(${config.metricPrefix}_http_requests_total[${br.longWindow}]))`,
        `) > ${threshold}`,
        `and`,
        `(`,
        `  sum(rate(${config.metricPrefix}_http_requests_total{status_code=~"5.."}[${br.shortWindow}]))`,
        `  /`,
        `  sum(rate(${config.metricPrefix}_http_requests_total[${br.shortWindow}]))`,
        `) > ${threshold}`,
      ].join('\n'),
      for: br.forDuration,
      labels: {
        severity: br.severity,
        service: config.serviceName,
        slo: 'availability',
      },
      annotations: {
        summary: `Burn rate ${br.burnRate}x sur ${config.serviceName} (${br.severity})`,
        description: `Error budget consomme a ${br.burnRate}x la vitesse normale. Fenetre longue: ${br.longWindow}, fenetre courte: ${br.shortWindow}.`,
        runbook: `https://wiki.internal/runbooks/${config.serviceName}-high-error-rate`,
      },
    };
  });

  return {
    groups: [
      {
        name: `slo-alerts-${config.serviceName}`,
        rules,
      },
    ],
  };
}

// Configuration pour la demo-app
const alertConfig: AlertConfig = {
  serviceName: 'demo-app',
  metricPrefix: 'demo_app',
  sloTarget: 0.999,
  burnRateConfigs: [
    { severity: 'page',   burnRate: 14.4, longWindow: '1h',  shortWindow: '5m',  forDuration: '1m' },
    { severity: 'page',   burnRate: 6,    longWindow: '6h',  shortWindow: '30m', forDuration: '5m' },
    { severity: 'ticket', burnRate: 3,    longWindow: '24h', shortWindow: '2h',  forDuration: '10m' },
    { severity: 'ticket', burnRate: 1,    longWindow: '72h', shortWindow: '6h',  forDuration: '30m' },
  ],
};

const rules = generateAlertRules(alertConfig);
const yamlContent = yaml.stringify(rules);
const outputPath = `config/prometheus/rules/slo-alerts-${alertConfig.serviceName}.yml`;
fs.writeFileSync(outputPath, yamlContent);
console.log(`Alert rules generees : ${outputPath}`);
```

**Action** : Executer le script.

```bash
npx tsx scripts/generate-alerts.ts
```

**Action** : Verifier le fichier YAML genere.

```bash
cat config/prometheus/rules/slo-alerts-demo-app.yml
```

> Les regles sont generees en YAML valide, pretes a etre chargees par Prometheus. Pour ajouter un nouveau service avec les memes regles, il suffit de creer une nouvelle `AlertConfig` et de relancer le script.

### [13:00-17:00] Version control et workflow GitOps

**Action** : Montrer le workflow GitOps.

```typescript
// Workflow GitOps pour l'observability as code
const gitOpsWorkflow = {
  steps: [
    {
      step: 1,
      action: 'Modifier la configuration (ajouter un service, changer un SLO)',
      file: 'scripts/generate-alerts.ts',
    },
    {
      step: 2,
      action: 'Regenerer les fichiers',
      command: 'npm run generate:dashboards && npm run generate:alerts',
    },
    {
      step: 3,
      action: 'Commit et push',
      command: 'git add config/ && git commit -m "feat(observability): add alerts for payment-service"',
    },
    {
      step: 4,
      action: 'Ouvrir une PR pour revue',
      detail: 'Le reviewer verifie les seuils, les requetes PromQL, les runbooks',
    },
    {
      step: 5,
      action: 'Merge et deploy automatique',
      detail: 'Le CI/CD applique les configs a Prometheus et Grafana',
    },
  ],
};
```

**Action** : Faire une demo du workflow.

```bash
# Generer les fichiers
npx tsx scripts/generate-dashboard.ts
npx tsx scripts/generate-alerts.ts

# Verifier les fichiers generes
ls -la config/grafana/dashboards/
ls -la config/prometheus/rules/

# Commit
git add config/grafana/dashboards/ config/prometheus/rules/
git status
```

> Tous les fichiers generes sont versiones. Un `git diff` montre exactement ce qui a change. Un reviewer peut verifier les requetes PromQL, les seuils d'alerte, les annotations — tout est visible dans la PR.

### [17:00-21:00] Valider les configurations generees

**Action** : Ecrire un script de validation.

```typescript
// scripts/validate-configs.ts
import * as fs from 'fs';

function validateDashboard(filePath: string): string[] {
  const errors: string[] = [];
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Verifier les champs obligatoires
  if (!content.dashboard?.uid) {
    errors.push(`${filePath}: missing dashboard.uid`);
  }
  if (!content.dashboard?.title) {
    errors.push(`${filePath}: missing dashboard.title`);
  }

  // Verifier que chaque panel a au moins une target
  for (const panel of content.dashboard?.panels ?? []) {
    if (!panel.targets || panel.targets.length === 0) {
      errors.push(`${filePath}: panel "${panel.title}" has no targets`);
    }

    // Verifier que les requetes PromQL ne sont pas vides
    for (const target of panel.targets ?? []) {
      if (!target.expr || target.expr.trim() === '') {
        errors.push(`${filePath}: panel "${panel.title}" has empty expr`);
      }
    }
  }

  return errors;
}

function validateAlertRules(filePath: string): string[] {
  const errors: string[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');

  // Verifier que le YAML est valide
  try {
    const yaml = require('yaml');
    const parsed = yaml.parse(content);

    for (const group of parsed.groups ?? []) {
      for (const rule of group.rules ?? []) {
        // Chaque alerte doit avoir un severity
        if (!rule.labels?.severity) {
          errors.push(`${filePath}: alert "${rule.alert}" missing severity label`);
        }
        // Chaque alerte doit avoir un runbook
        if (!rule.annotations?.runbook) {
          errors.push(`${filePath}: alert "${rule.alert}" missing runbook annotation`);
        }
      }
    }
  } catch (e) {
    errors.push(`${filePath}: invalid YAML — ${e}`);
  }

  return errors;
}

// Valider tous les fichiers
const dashboardErrors = validateDashboard('config/grafana/dashboards/demo-app-red.json');
const alertErrors = validateAlertRules('config/prometheus/rules/slo-alerts-demo-app.yml');

const allErrors = [...dashboardErrors, ...alertErrors];
if (allErrors.length > 0) {
  console.error('Validation errors:');
  allErrors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
} else {
  console.log('All configs valid!');
}
```

**Action** : Executer la validation.

```bash
npx tsx scripts/validate-configs.ts
```

> La validation passe. Ce script peut etre integre dans le CI/CD — si la validation echoue, la PR est bloquee. C'est un filet de securite qui empeche de deployer des configurations invalides.

### [21:00-25:00] Benefices et patterns avances

**Action** : Resumer les benefices.

```typescript
// Benefices de l'observability as code
const benefits = {
  reproductible: 'Meme commande = meme resultat. Pas de "ca marchait sur ma machine".',
  versionne: 'Git historique complet. git blame pour savoir qui a change un seuil et pourquoi.',
  revise: 'PR review : un collegue verifie les requetes PromQL avant le deploiement.',
  automatise: 'CI/CD applique les changements. Pas de clic manuel dans Grafana.',
  scalable: 'Ajouter un service = ajouter une ligne. Pas 2 heures de configuration manuelle.',
  coherent: 'Tous les services ont le meme format de dashboard et les memes regles d alerte.',
};
```

> L'observability as code reduit le toil que nous avons identifie dans le module 16. Les 2 heures de mise a jour manuelle des dashboards deviennent 5 minutes de modification de code + CI/CD.

### [25:00-27:00] Recapitulatif

> Recapitulons. L'observability as code genere les dashboards Grafana et les regles Prometheus a partir de TypeScript. Les fichiers generes sont versiones dans Git, revises en PR et deployes automatiquement. Un script de validation verifie les configurations avant le deploiement.

> Le workflow GitOps est : modifier le code → regenerer → commit → PR → review → merge → deploy. C'est reproductible, scalable et coherent.

> Dans le prochain module, nous abordons la production readiness — comment savoir si un service est pret pour la production. Faites le Lab 17 !

## Points d'attention pour l'enregistrement
- Montrer le dashboard genere dans Grafana — c'est le moment "wow"
- Le code TypeScript de generation doit etre explique pas a pas
- Comparer le workflow manuel (clic dans Grafana) vs le workflow as code (script + Git)
- La validation des configs est un point de securite important — insister dessus
- Le workflow GitOps (commit → PR → review → deploy) doit etre montre en action
- Lier explicitement a la reduction du toil du module 16
- S'assurer que Grafana charge bien le dashboard genere via le provisioning
- Montrer un git diff pour illustrer la traçabilite des changements

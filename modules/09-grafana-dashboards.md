# Grafana Dashboards & PromQL

## Objectifs pedagogiques

- Maîtriser PromQL en profondeur (selecteurs, vecteurs, fonctions d'agregation, prediction)
- Comprendre les concepts Grafana (datasources, panels, variables, annotations)
- Construire un dashboard RED étape par étape
- Configurer des regles d'alerte dans Grafana
- Gérer les dashboards as code (modèle JSON)
- Utiliser des template variables pour des dashboards multi-services
- Appliquer les bonnes pratiques de conception de dashboards

---

> **Grafana 11 (mi-2024)** : Nouvelle navigation unifiee, Explore Logs (recherche de logs sans PromQL), Scenes framework pour des dashboards dynamiques, alerting ameliore avec multi-folder rules, et support natif des correlations traces↔logs↔metriques. Les concepts de ce module restent valides — Grafana 11 ameliore l'UX sans casser les APIs.

---

## PromQL en profondeur

PromQL (Prometheus Query Language) est le langage de requête de Prometheus. C'est un langage fonctionnel specialise pour les series temporelles.

### Selecteurs

Les selecteurs permettent de choisir quelles series temporelles interroger.

```typescript
// Analogie TypeScript pour comprendre les selecteurs PromQL

interface TimeSeries {
  name: string;
  labels: Record<string, string>;
  values: Array<{ timestamp: number; value: number }>;
}

// Selecteur simple : toutes les series avec ce nom
// PromQL: http_requests_total
function selectByName(series: TimeSeries[], name: string): TimeSeries[] {
  return series.filter(s => s.name === name);
}

// Selecteur avec label exact
// PromQL: http_requests_total{method="GET"}
function selectByLabel(series: TimeSeries[], name: string, label: string, value: string): TimeSeries[] {
  return series.filter(s => s.name === name && s.labels[label] === value);
}

// Selecteur avec regex
// PromQL: http_requests_total{status_code=~"5.."}
function selectByRegex(series: TimeSeries[], name: string, label: string, pattern: RegExp): TimeSeries[] {
  return series.filter(s => s.name === name && pattern.test(s.labels[label]));
}
```

```
# Selecteurs PromQL — syntaxe
http_requests_total                          # Toutes les series
http_requests_total{method="GET"}            # Label exact
http_requests_total{method!="GET"}           # Label different
http_requests_total{status_code=~"5.."}      # Regex match
http_requests_total{route!~"/health|/metrics"} # Regex negation
http_requests_total{method="GET", route="/api/orders"} # Plusieurs labels
```

### Instant vectors vs Range vectors

C'est une distinction fondamentale en PromQL.

```
# Instant vector : la derniere valeur de chaque serie
http_requests_total
# Retourne : {method="GET", route="/api/orders"} 1542 @timestamp

# Range vector : les valeurs sur une plage de temps
http_requests_total[5m]
# Retourne : {method="GET", route="/api/orders"} [(1500, t1), (1520, t2), (1542, t3)]

# Les range vectors ne peuvent pas etre affiches directement dans Grafana.
# Ils sont utilises comme entree pour les fonctions (rate, increase, etc.)
```

```typescript
// Analogie TypeScript
type InstantVector = Map<string, number>;           // une valeur par serie
type RangeVector = Map<string, [number, number][]>; // plusieurs (valeur, timestamp) par serie

// rate() transforme un RangeVector en InstantVector
function rate(rangeVector: RangeVector): InstantVector {
  const result: InstantVector = new Map();
  for (const [key, samples] of rangeVector) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    const valueChange = last[0] - first[0];
    const timeChange = (last[1] - first[1]);
    result.set(key, valueChange / timeChange);
  }
  return result;
}
```

### rate() — taux de changement par seconde

```
# Requetes par seconde, moyennees sur 5 minutes
rate(http_requests_total[5m])

# IMPORTANT : rate() gere automatiquement les resets de counter
# Si le counter passe de 1000 a 0 (redemarrage du processus),
# rate() ne calcule pas un taux negatif — il detecte le reset.

# Regle d'or pour choisir la fenetre [Xm] :
# - Elle doit couvrir au moins 4 scrape intervals
# - Si scrape_interval = 15s, utilisez [1m] minimum
# - [5m] est un bon choix par defaut
# - Plus la fenetre est grande, plus le lissage est fort
```

### increase() — augmentation absolue

```
# Nombre de requetes dans les 5 dernieres minutes
increase(http_requests_total[5m])

# Nombre d'erreurs dans la derniere heure
increase(http_errors_total[1h])

# increase() est essentiellement rate() * duree_fenetre
# increase(x[5m]) ≈ rate(x[5m]) * 300
```

### histogram_quantile() — percentiles

```
# Percentile 99 de la latence
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# Percentile 95 par route
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
)

# Percentile 50 (mediane) global
histogram_quantile(0.5,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# ATTENTION : le label 'le' (less than or equal) est OBLIGATOIRE dans le by()
# C'est le label des buckets de l'histogram — sans lui, le calcul est incorrect.
```

```typescript
// Comprendre histogram_quantile avec du TypeScript
function histogramQuantile(quantile: number, buckets: Array<{ le: number; count: number }>): number {
  // Les buckets sont cumulatifs et tries par 'le'
  // bucket {le="0.1"} count=80   → 80 requetes <= 100ms
  // bucket {le="0.25"} count=95  → 95 requetes <= 250ms
  // bucket {le="0.5"} count=99   → 99 requetes <= 500ms
  // bucket {le="+Inf"} count=100 → 100 requetes au total

  // Pour le P95, on cherche la valeur ou 95% des requetes sont en dessous
  const totalCount = buckets[buckets.length - 1].count;
  const targetCount = quantile * totalCount; // 0.95 * 100 = 95

  // 95 tombe dans le bucket {le="0.25"} (count=95)
  // Interpolation lineaire entre le bucket precedent et celui-ci
  // Resultat ≈ 0.25 secondes (250ms)
  return 0.25; // simplifie
}
```

### Operateurs d'agregation

```
# sum — somme de toutes les series
sum(rate(http_requests_total[5m]))
# → une seule valeur : le debit total

# sum by — somme groupee
sum by (method) (rate(http_requests_total[5m]))
# → une valeur par methode HTTP (GET, POST, etc.)

# sum without — somme en excluant des labels
sum without (instance) (rate(http_requests_total[5m]))
# → agrega toutes les instances, garde les autres labels

# avg — moyenne
avg(rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m]))

# max / min
max(nodejs_heap_size_used_bytes)
min(http_request_duration_seconds_count)

# count — nombre de series
count(up == 1)
# → nombre de targets qui sont UP

# topk — les N plus grandes valeurs
topk(5, sum by (route) (rate(http_requests_total[5m])))
# → les 5 routes avec le plus de trafic
```

### predict_linear() — prediction

```
# Predire quand le disque sera plein
predict_linear(node_filesystem_avail_bytes[6h], 24 * 3600)
# → valeur prevue dans 24h, basee sur la tendance des 6 dernieres heures

# Predire l'utilisation memoire dans 1h
predict_linear(nodejs_heap_size_used_bytes[1h], 3600)
```

### Requetes avancees utiles

```
# Taux d'erreur en pourcentage
sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100

# Requetes par seconde par service et status
sum by (service, status_code) (rate(http_requests_total[5m]))

# Apdex score (ratio de requetes "satisfaisantes")
# Satisfait < 0.5s, Tolere < 2s, Frustre >= 2s
(
  sum(rate(http_request_duration_seconds_bucket{le="0.5"}[5m]))
  +
  sum(rate(http_request_duration_seconds_bucket{le="2"}[5m]))
) / 2 / sum(rate(http_request_duration_seconds_count[5m]))

# Alerte : taux d'erreur > 1% pendant 5 minutes
sum(rate(http_errors_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01
```

---

## Concepts Grafana

### Datasources

Les datasources sont les connexions vers vos backends de donnees. Pour notre stack :

```yaml
# config/grafana/datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: '15s'

  - name: Jaeger
    type: jaeger
    access: proxy
    url: http://jaeger:16686
    jsonData:
      tracesToMetrics:
        datasourceUid: prometheus
        tags:
          - key: service.name
            value: service

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: jaeger
          matcherRegex: '"traceId":"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'
```

### Types de panels

Grafana offre de nombreux types de visualisation :

```typescript
// Les types de panels les plus utiles pour l'observabilite
interface GrafanaPanels {
  timeSeries: {
    usage: 'Evolution dans le temps';
    example: 'Requetes par seconde, latence, utilisation memoire';
  };
  stat: {
    usage: 'Valeur unique mise en evidence';
    example: 'Uptime actuel, taux d erreur actuel, nombre d instances UP';
  };
  gauge: {
    usage: 'Valeur avec seuils visuels';
    example: 'Utilisation CPU (vert/jaune/rouge)';
  };
  barChart: {
    usage: 'Comparaison de valeurs categoriques';
    example: 'Top 10 des routes les plus sollicitees';
  };
  table: {
    usage: 'Donnees tabulaires detaillees';
    example: 'Liste des endpoints avec leur latence P99';
  };
  heatmap: {
    usage: 'Distribution dans le temps';
    example: 'Distribution de latence (histogram_quantile)';
  };
  logs: {
    usage: 'Affichage de logs (avec Loki)';
    example: 'Logs filtres par service et niveau';
  };
  traces: {
    usage: 'Visualisation de traces (avec Jaeger/Tempo)';
    example: 'Traces filtrees par duree ou erreur';
  };
}
```

---

## Construire un dashboard RED étape par étape

### Étape 1 : Panneau Rate (trafic)

```
# Panel : Time Series
# Titre : "Request Rate (req/s)"

# Query A — Rate total
sum(rate(http_requests_total[5m]))
# Legend : Total

# Query B — Rate par methode
sum by (method) (rate(http_requests_total[5m]))
# Legend : {{ method }}
```

### Étape 2 : Panneau Errors (taux d'erreur)

```
# Panel : Time Series + seuil a 1%
# Titre : "Error Rate (%)"

# Query
sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m])) * 100
# Legend : Error Rate %

# Ajouter un seuil :
# - Vert : < 1%
# - Jaune : 1-5%
# - Rouge : > 5%
```

### Étape 3 : Panneau Duration (latence)

```
# Panel : Time Series
# Titre : "Request Latency"

# Query A — P50
histogram_quantile(0.5, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
# Legend : p50

# Query B — P95
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
# Legend : p95

# Query C — P99
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
# Legend : p99

# Unite de l'axe Y : secondes
```

### Étape 4 : Panneaux complementaires

```
# Panel Stat : "Requetes en cours"
http_requests_in_flight

# Panel Gauge : "Utilisation memoire"
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes

# Panel Time Series : "Event Loop Lag"
nodejs_eventloop_lag_seconds

# Panel Table : "Top 5 des routes les plus lentes (P99)"
topk(5,
  histogram_quantile(0.99,
    sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
  )
)
```

### Disposition du dashboard

```
┌─────────────────────────────────────────────────────┐
│  [Stat]         [Stat]         [Stat]      [Gauge]  │
│  Req/s          Error %        P99 (ms)    Memory   │
├────────────────────────────────┬────────────────────┤
│                                │                    │
│  Request Rate (Time Series)    │  Error Rate (%)    │
│                                │                    │
├────────────────────────────────┼────────────────────┤
│                                │                    │
│  Latency p50/p95/p99           │  Event Loop Lag    │
│  (Time Series)                 │  (Time Series)     │
│                                │                    │
├────────────────────────────────┴────────────────────┤
│                                                      │
│  Top Routes by Latency (Table)                       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Regles d'alerte dans Grafana

Grafana permet de définir des alertes directement sur les requêtes PromQL.

### Créer une alerte pour le taux d'erreur

```yaml
# Alerte : taux d'erreur HTTP 5xx > 1% pendant 5 minutes
# Dans Grafana : Alerting → Alert Rules → New Alert Rule

# Condition :
# Query A : sum(rate(http_errors_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
# Condition : IS ABOVE 1
# Evaluate every : 1m
# For : 5m (doit etre vrai pendant 5 min avant de declencher)
```

```typescript
// Logique equivalente en TypeScript pour comprendre les alertes
interface AlertRule {
  name: string;
  query: string;
  condition: 'IS_ABOVE' | 'IS_BELOW';
  threshold: number;
  evaluateEvery: string;  // Frequence de verification
  forDuration: string;    // Combien de temps la condition doit persister
  labels: Record<string, string>;
  annotations: {
    summary: string;
    description: string;
    runbook_url?: string;
  };
}

const errorRateAlert: AlertRule = {
  name: 'High Error Rate',
  query: 'sum(rate(http_errors_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100',
  condition: 'IS_ABOVE',
  threshold: 1,
  evaluateEvery: '1m',
  forDuration: '5m',
  labels: { severity: 'critical', team: 'backend' },
  annotations: {
    summary: 'Taux d erreur HTTP 5xx eleve ({{ $value }}%)',
    description: 'Le taux d erreur 5xx depasse 1% depuis 5 minutes.',
    runbook_url: 'https://wiki.internal/runbooks/high-error-rate',
  },
};
```

### Exemples d'alertes essentielles

```
# Alerte 1 : Latence P99 > 2 secondes
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2

# Alerte 2 : Event loop lag > 500ms
nodejs_eventloop_lag_seconds > 0.5

# Alerte 3 : Memoire heap > 85%
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.85

# Alerte 4 : Aucune requete depuis 5 minutes (service down ?)
sum(rate(http_requests_total[5m])) == 0

# Alerte 5 : Target Prometheus down
up{job="demo-app"} == 0
```

---

## Dashboard as code (modèle JSON)

Grafana permet d'exporter et d'importer des dashboards en JSON. C'est la meilleure approche pour le versionning et le déploiement automatise.

```typescript
// Structure simplifiee d'un dashboard Grafana en JSON
interface GrafanaDashboard {
  uid: string;
  title: string;
  tags: string[];
  timezone: string;
  refresh: string;         // Auto-refresh interval ("5s", "1m")
  templating: {
    list: TemplateVariable[];
  };
  panels: Panel[];
  annotations: {
    list: Annotation[];
  };
  time: {
    from: string;          // "now-1h"
    to: string;            // "now"
  };
}

interface Panel {
  id: number;
  type: string;            // "timeseries", "stat", "gauge", "table"
  title: string;
  gridPos: { h: number; w: number; x: number; y: number };
  targets: Array<{
    expr: string;          // Requete PromQL
    legendFormat: string;
    refId: string;
  }>;
  fieldConfig: {
    defaults: {
      unit: string;        // "reqps", "s", "percent", "bytes"
      thresholds: {
        steps: Array<{ color: string; value: number | null }>;
      };
    };
  };
}
```

```json
{
  "uid": "red-dashboard",
  "title": "RED Dashboard — Demo App",
  "tags": ["observability", "red", "demo-app"],
  "timezone": "browser",
  "refresh": "10s",
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "query": "label_values(http_requests_total, service)",
        "current": { "value": "demo-app" },
        "refresh": 2
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "stat",
      "title": "Requests / sec",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{service=\"$service\"}[5m]))",
          "legendFormat": "",
          "refId": "A"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "reqps",
          "thresholds": {
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 100 },
              { "color": "red", "value": 500 }
            ]
          }
        }
      }
    }
  ]
}
```

---

## Template variables pour dashboards multi-services

Les variables de template rendent un dashboard réutilisable pour plusieurs services, environnements ou instances.

```
# Variable "service" — liste des services disponibles
Type : Query
Query : label_values(http_requests_total, service)
Usage dans les requetes : http_requests_total{service="$service"}

# Variable "environment" — environnements
Type : Query
Query : label_values(http_requests_total, environment)
Usage : http_requests_total{service="$service", environment="$environment"}

# Variable "instance" — instances du service
Type : Query
Query : label_values(http_requests_total{service="$service"}, instance)
Usage : http_requests_total{service="$service", instance="$instance"}

# Variable "interval" — intervalle de calcul
Type : Interval
Values : 1m, 5m, 15m, 1h
Usage : rate(http_requests_total[${interval}])
```

```typescript
// Les variables transforment un dashboard statique en dashboard dynamique
// Un seul dashboard RED peut couvrir 50 services differents
// Il suffit de changer le selecteur de service en haut du dashboard

// Variables predefinies Grafana utiles :
// $__interval     — intervalle automatique base sur la plage affichee
// $__rate_interval — intervalle optimal pour rate()
// $__range        — duree de la plage affichee

// Exemples d'utilisation :
// rate(http_requests_total{service="$service"}[$__rate_interval])
// increase(http_requests_total{service="$service"}[$__range])
```

---

## Annotations

Les annotations marquent des événements ponctuels sur les graphiques (deploiements, incidents, etc.).

```yaml
# Annotation automatique basee sur une requete
# Exemple : marquer les deploiements
annotations:
  list:
    - name: Deployments
      datasource: Prometheus
      expr: 'changes(process_start_time_seconds{job="demo-app"}[1m]) > 0'
      tagKeys: 'service'
      titleFormat: 'Deployment detected'
      textFormat: 'Service {{ $labels.service }} restarted'
```

```typescript
// Les annotations ajoutent du contexte visuel aux dashboards
// Quand vous voyez un pic de latence, une annotation "Deploy v2.3.1"
// vous dit immediatement si c'est lie au deploiement

// Vous pouvez aussi ajouter des annotations manuellement via l'API Grafana :
// POST /api/annotations
// { "text": "Deploy v2.3.1", "tags": ["deploy"], "time": 1705312800000 }
```

---

## Bonnes pratiques

### Conception de dashboards

- **Un dashboard = un objectif** : ne melangez pas le dashboard RED avec le dashboard infrastructure
- **Les panneaux Stat en haut** : les KPIs les plus importants visibles immediatement
- **Les graphiques temporels au milieu** : pour l'analyse des tendances
- **Les tableaux en bas** : pour le detail
- **Utilisez des couleurs coherentes** : vert = OK, jaune = attention, rouge = critique
- **Ajoutez des liens** entre dashboards (drill-down du global vers le detail)

### PromQL

- **Utilisez `$__rate_interval`** au lieu de valeurs codees en dur dans Grafana
- **Toujours `sum by`** plutot que `sum without` pour éviter les surprises
- **Testez vos requêtes** dans l'onglet Explore avant de les mettre dans un dashboard
- **Documentez les requêtes** complexes avec des commentaires dans le titre ou la description du panel

### Alertes

- **Chaque alerte doit avoir un runbook** : un lien vers la procedure de résolution
- **Evitez les alertes trop sensibles** : un `for: 5m` reduit les faux positifs
- **Regroupez les alertes par severite** : critical (pager), warning (email), info (dashboard)
- **Testez vos alertes** : simulez des pannes pour vérifier qu'elles se declenchent

::: tip A retenir
Grafana + PromQL forment le couple de visualisation et d'interrogation le plus puissant de l'ecosysteme open-source. La clé est de maîtriser 5 fonctions PromQL (`rate`, `increase`, `histogram_quantile`, `sum by`, `predict_linear`) et de structurer vos dashboards autour de la méthode RED. Versionez vos dashboards en JSON et utilisez les template variables pour les rendre réutilisables.
:::

::: warning Attention
Un dashboard avec 50 panels et 200 requêtes PromQL sera lent et illisible. Visez 8-12 panels maximum par dashboard. Creez plusieurs dashboards specialises plutot qu'un mega-dashboard qui fait tout.
:::

---

## Prochaines étapes

- [Lab 09 — Construire un dashboard RED dans Grafana](/labs/lab-09-promql-grafana/README)
- [Quiz 09 — Grafana & PromQL](/quizzes/quiz-09-grafana-dashboards)
- [Module suivant — SLI, SLO & SLA](/modules/10-sli-slo-sla)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 09 grafana dashboards](../screencasts/screencast-09-grafana-dashboards.md)
2. **Lab** : [lab-09-promql-grafana](../labs/lab-09-promql-grafana/README)
3. **Quiz** : [quiz 09 grafana dashboards](../quizzes/quiz-09-grafana-dashboards.html)
:::

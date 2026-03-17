# Module 04 — Métriques et Prometheus

> **Durée estimée** : 4h00
> **Difficulté** : 3/5
> **Prérequis** : Module 02 (Logging structuré), Module 03 (Niveaux de log)
> **Objectifs** :
> - Comprendre les types de métriques (counter, gauge, histogram, summary)
> - Instrumenter une application Node.js avec prom-client
> - Configurer Prometheus pour le scraping
> - Écrire des requêtes PromQL de base
> - Mettre en place des dashboards Grafana
> - Maîtriser les recording rules et les alerting rules
> - Configurer Alertmanager pour le routage des alertes
> - Écrire du PromQL avancé (subqueries, vector matching, histogrammes)
> - Comprendre la fédération Prometheus et le remote_write

---

<details>
<summary>Rappel du module précédent</summary>

1. **Quels sont les niveaux de log standard et quand utiliser chacun ?**
   Les niveaux standard sont : `fatal` (arret du service), `error` (erreur traitable), `warn` (situation anormale mais non bloquante), `info` (evenement metier important), `debug` (detail technique pour le dev), `trace` (detail tres fin). En production, on configure generalement le niveau minimum a `info`.

2. **Qu'est-ce qu'un correlation ID et pourquoi est-il indispensable ?**
   Un correlation ID (ou trace ID) est un identifiant unique propage via les headers HTTP (`X-Request-Id` ou `traceparent`) a travers tous les services. Il permet de relier tous les logs d'une même requete utilisateur, même quand elle traverse plusieurs microservices.

3. **Comment enrichir les logs avec du contexte metier ?**
   On utilise le child logger pattern (ex: `logger.child({ userId, orderId })`) pour attacher automatiquement des champs metier a chaque ligne de log, sans les repeter manuellement a chaque appel.

</details>

---

## 1. Pourquoi les métriques ?

Les logs racontent **ce qui s'est passé**. Les métriques racontent **comment le système se comporte dans le temps**.

```
Logs → "La requête POST /api/users a échoué avec 500 à 14:32:05"
Métriques → "Le taux d'erreur 5xx est passé de 0.1% à 12% en 5 minutes"
```

Les métriques permettent de :
- **Détecter** les anomalies avant que les utilisateurs ne se plaignent
- **Alerter** sur des seuils (SLO breach, error budget burn)
- **Dimensionner** l'infrastructure (capacity planning)
- **Comparer** les performances avant/après un déploiement

---

## 2. Les quatre types de métriques

### 2.1. Counter

Valeur qui ne fait qu'augmenter (ou se reset à 0 au redémarrage).

```typescript
import { Counter } from 'prom-client';

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total des requêtes HTTP',
  labelNames: ['method', 'status', 'route'],
});

// Chaque requête incrémente le compteur
httpRequests.inc({ method: 'GET', status: '200', route: '/api/users' });
```

**Cas d'usage** : nombre de requêtes, nombre d'erreurs, bytes transférés.

### 2.2. Gauge

Valeur qui monte et descend (mesure instantanée).

```typescript
import { Gauge } from 'prom-client';

const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Nombre de connexions actives',
});

activeConnections.inc();  // +1
activeConnections.dec();  // -1
activeConnections.set(42); // valeur absolue
```

**Cas d'usage** : connexions actives, mémoire utilisée, taille de queue, température.

### 2.3. Histogram

Distribution de valeurs dans des buckets prédéfinis.

```typescript
import { Histogram } from 'prom-client';

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Mesurer la durée
const end = requestDuration.startTimer({ method: 'GET', route: '/api/users' });
// ... traitement ...
end(); // enregistre automatiquement la durée
```

**Cas d'usage** : latence, taille des réponses, durée des jobs.

### 2.4. Summary

Similaire à l'histogram mais calcule les quantiles côté client.

```typescript
import { Summary } from 'prom-client';

const requestSummary = new Summary({
  name: 'http_request_duration_summary',
  help: 'Résumé des durées de requêtes',
  percentiles: [0.5, 0.9, 0.99],
});
```

**Histogram vs Summary** : préférer l'histogram — il est agrégeable côté serveur (Prometheus) et plus flexible pour les alertes.

---

## 3. Prometheus — Architecture

```
App Node.js ──expose──> /metrics (port 9090)
                              ↑
Prometheus ──scrape──────────┘
     │
     └──> Stockage TSDB (time series)
              │
              └──> Grafana (visualisation)
              └──> Alertmanager (alertes)
```

### Configuration minimale (prometheus.yml)

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node-app'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### Exposer les métriques dans Express/Fastify

```typescript
import express from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics(); // CPU, mémoire, event loop, GC

const app = express();

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## 4. PromQL — Requêtes essentielles

### Taux de requêtes par seconde

```promql
rate(http_requests_total[5m])
```

### Taux d'erreur (%)

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100
```

### Latence P99

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

### Top 5 des routes les plus lentes

```promql
topk(5, avg by (route) (rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])))
```

---

## 5. PromQL avancé

Le PromQL de base couvre 80% des cas. Mais pour des alertes précises et des dashboards riches, il faut maîtriser les fonctionnalités avancées.

### 5.1. rate() vs irate()

`rate()` calcule le taux moyen sur une fenêtre. `irate()` calcule le taux instantané entre les deux derniers points.

```promql
# rate() — taux moyen sur 5 minutes (lisse les pics)
rate(http_requests_total[5m])

# irate() — taux instantané (réactif mais bruité)
irate(http_requests_total[5m])
```

**Quand utiliser quoi ?**

| Fonction | Comportement | Usage recommandé |
|----------|-------------|-----------------|
| `rate()` | Moyenne sur la fenêtre | Alertes, SLO, dashboards stables |
| `irate()` | Dernier intervalle seulement | Debug temps réel, dashboards "live" |

L'analogie : `rate()` est la vitesse moyenne sur un trajet, `irate()` est la vitesse indiquée sur le compteur à un instant T. Pour savoir si vous êtes en retard (alerte), la moyenne est plus fiable. Pour savoir si vous roulez trop vite maintenant (debug), l'instantané est plus utile.

::: warning Piège classique
`irate()` peut donner des résultats trompeurs si le scrape interval est irrégulier. Ne l'utilisez jamais dans des alerting rules — préférez `rate()`.
:::

### 5.2. Subqueries

Les subqueries permettent d'appliquer une fonction d'agrégation temporelle sur le résultat d'une expression PromQL.

```promql
# Syntaxe : <expression>[<range>:<resolution>]

# Moyenne du taux d'erreur sur les dernières 24h, calculée toutes les 5 minutes
avg_over_time(
  rate(http_requests_total{status=~"5.."}[5m])[24h:5m]
)

# Maximum du taux de requêtes sur la dernière heure, échantillonné toutes les minutes
max_over_time(
  rate(http_requests_total[5m])[1h:1m]
)

# Détecter un pic : le taux actuel est-il > 2x la moyenne sur 7 jours ?
rate(http_requests_total[5m])
  > 2 * avg_over_time(rate(http_requests_total[5m])[7d:1h])
```

Les subqueries sont coûteuses en calcul. Utilisez-les avec parcimonie et préférez les **recording rules** pour les requêtes fréquentes.

### 5.3. histogram_quantile() en profondeur

`histogram_quantile()` calcule un quantile à partir des buckets d'un histogram. C'est la fonction la plus importante pour les SLO de latence.

```promql
# P50 (médiane) — la moitié des requêtes sont plus rapides
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))

# P95 — 95% des requêtes sont plus rapides
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99 par route — identifier quelle route est lente
histogram_quantile(0.99,
  sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))
)

# P99 global — agréger toutes les instances
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

::: warning Le piège du `le`
`histogram_quantile()` exige le label `le` (less-or-equal). Si vous utilisez `sum by (...)`, vous devez **toujours** inclure `le` dans le `by`. Sinon, les buckets sont écrasés et le résultat est faux.
:::

**Comment fonctionne l'interpolation ?** Prometheus interpole linéairement entre les bornes des buckets. Si vos buckets sont `[0.1, 0.5, 1]` et que le P99 est entre 0.5 et 1, Prometheus estime la valeur exacte. Des buckets plus fins = un résultat plus précis.

```typescript
// Buckets adaptés aux SLO
const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée des requêtes',
  // Si SLO = 99% < 300ms, mettre des buckets fins autour de 300ms
  buckets: [0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 1, 2.5, 5, 10],
});
```

### 5.4. Vector matching — on, ignoring, group_left

Quand on divise ou multiplie deux vecteurs, Prometheus doit faire correspondre les séries. Par défaut, il fait un **exact match** sur tous les labels.

```promql
# Problème : les labels ne correspondent pas exactement
# http_requests_total a les labels {method, route, status}
# http_request_duration_seconds_count a les labels {method, route}

# Solution 1 : ignoring() — ignorer les labels en trop
http_requests_total{status="500"}
  / ignoring(status) http_request_duration_seconds_count

# Solution 2 : on() — ne matcher que sur certains labels
http_requests_total{status="500"}
  / on(method, route) http_request_duration_seconds_count
```

**many-to-one avec group_left / group_right**

Quand un côté a plusieurs séries pour une seule série de l'autre côté :

```promql
# Ajouter le nom du service (label "service_name" de la métrique d'info)
# node_info{instance="app1", service_name="order-api"} = 1
# http_requests_total{instance="app1", method="GET"} = 1234

http_requests_total
  * on(instance) group_left(service_name) node_info

# Résultat : http_requests_total{instance="app1", method="GET", service_name="order-api"} = 1234
```

| Clause | Rôle | Exemple |
|--------|------|---------|
| `on(label1, label2)` | Matcher uniquement sur ces labels | `on(instance, job)` |
| `ignoring(label1)` | Matcher sur tous les labels sauf ceux-ci | `ignoring(status)` |
| `group_left(label)` | many-to-one, enrichir depuis le côté droit | Ajouter des infos |
| `group_right(label)` | one-to-many, enrichir depuis le côté gauche | Plus rare |

### 5.5. label_replace() et label_join()

Manipuler les labels directement dans PromQL.

```promql
# label_replace — créer ou modifier un label par regex
# Extraire le nom du service de l'instance "order-api:8080"
label_replace(
  up,
  "service", "$1", "instance", "(.+):.+"
)
# Résultat : up{instance="order-api:8080", service="order-api"}

# label_join — concaténer plusieurs labels en un seul
label_join(
  http_requests_total,
  "endpoint", "/", "method", "route"
)
# Résultat : http_requests_total{..., endpoint="GET//api/users"}
```

**Cas d'usage concrets** :
- Normaliser les labels entre différentes sources
- Créer un label `environment` à partir du nom d'instance
- Préparer les données pour un `group_left` quand les labels ne matchent pas directement

### 5.6. Opérateurs d'agrégation avancés

```promql
# count_values — distribution de valeurs
# "Combien d'instances par version ?"
count_values("version", build_info)

# quantile — quantile sur un vecteur (pas un histogram)
quantile(0.95, rate(http_requests_total[5m]))

# bottomk — les 3 instances les plus lentes
bottomk(3, avg by (instance) (rate(http_request_duration_seconds_sum[5m])))

# group — vecteur de 1 pour chaque série (utile pour les jointures)
group by (instance) (up)
```

---

## 6. Labels et cardinalité

Les labels ajoutent des dimensions aux métriques :

```typescript
httpRequests.inc({ method: 'GET', status: '200', route: '/api/users' });
```

**Attention à la cardinalité !** Chaque combinaison unique de labels crée une time series. Éviter :
- Les IDs utilisateur comme labels (cardinalité infinie)
- Les URLs avec paramètres dynamiques (`/users/123` → utiliser `/users/:id`)
- Plus de 5-6 labels par métrique

Règle : si un label peut prendre plus de ~100 valeurs distinctes, c'est un **anti-pattern**.

---

## 7. Métriques par défaut de prom-client

`collectDefaultMetrics()` expose automatiquement :

| Métrique | Type | Description |
|----------|------|-------------|
| `process_cpu_user_seconds_total` | Counter | CPU utilisateur |
| `process_resident_memory_bytes` | Gauge | Mémoire RSS |
| `nodejs_eventloop_lag_seconds` | Gauge | Lag de l'event loop |
| `nodejs_active_handles_total` | Gauge | Handles actifs (sockets, timers) |
| `nodejs_gc_duration_seconds` | Histogram | Durée du GC |

---

## 8. Recording Rules

Les recording rules permettent de **pré-calculer des requêtes PromQL coûteuses** et de stocker le résultat comme une nouvelle time series. C'est l'équivalent d'une vue matérialisée en base de données.

### Pourquoi les recording rules ?

1. **Performance** : une requête complexe calculée toutes les 15s au lieu d'être recalculée à chaque affichage du dashboard
2. **Cohérence** : tous les dashboards et alertes utilisent la même formule
3. **Lisibilité** : remplacer une formule longue par un nom court
4. **Fédération** : pré-agréger les données avant de les remonter à un Prometheus central

### Configuration dans prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s  # fréquence d'évaluation des rules

rule_files:
  - 'rules/recording_rules.yml'
  - 'rules/alerting_rules.yml'

scrape_configs:
  - job_name: 'node-app'
    static_configs:
      - targets: ['localhost:3000']
```

### Syntaxe des recording rules

```yaml
# rules/recording_rules.yml
groups:
  - name: http_rules
    interval: 15s  # optionnel, override de evaluation_interval
    rules:
      # Taux de requêtes par seconde, agrégé par service et route
      - record: job:http_requests:rate5m
        expr: sum by (job, route) (rate(http_requests_total[5m]))

      # Taux d'erreur en pourcentage
      - record: job:http_error_rate:ratio5m
        expr: |
          sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum by (job) (rate(http_requests_total[5m]))

      # Latence P99 par route
      - record: job_route:http_request_duration:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (job, route, le) (rate(http_request_duration_seconds_bucket[5m]))
          )

  - name: node_rules
    rules:
      # Utilisation mémoire en pourcentage
      - record: job:memory_usage:ratio
        expr: |
          process_resident_memory_bytes
          /
          node_memory_MemTotal_bytes

      # Taux de GC par type
      - record: job:nodejs_gc_duration:rate5m
        expr: sum by (job, kind) (rate(nodejs_gc_duration_seconds_sum[5m]))
```

### Convention de nommage

Les recording rules suivent la convention `level:metric:operations` :

| Composant | Description | Exemple |
|-----------|-------------|---------|
| `level` | Niveau d'agrégation | `job`, `instance`, `job_route` |
| `metric` | Nom de la métrique source | `http_requests`, `http_request_duration` |
| `operations` | Opérations appliquées | `rate5m`, `ratio5m`, `p99_5m` |

```yaml
# Exemples de nommage correct
- record: job:http_requests:rate5m           # rate sur 5m, agrégé par job
- record: job_route:http_errors:ratio5m      # ratio d'erreur par job et route
- record: instance:node_cpu:avg_idle5m       # moyenne CPU idle par instance
```

### Utiliser les recording rules

Une fois définies, les recording rules s'utilisent comme n'importe quelle métrique :

```promql
# Dans un dashboard Grafana
job:http_error_rate:ratio5m{job="order-service"}

# Dans une alerte
job:http_error_rate:ratio5m{job="order-service"} > 0.01

# Composition : recording rule dans une autre recording rule
# (pré-calculer à plusieurs niveaux)
avg_over_time(job:http_error_rate:ratio5m[1h])
```

### Bonnes pratiques des recording rules

1. **Pré-agréger les histogrammes** : les requêtes `histogram_quantile()` sur de larges fenêtres sont les plus coûteuses
2. **Ne pas en abuser** : chaque recording rule crée de nouvelles séries. Ne pré-calculez que les requêtes réellement coûteuses ou fréquentes
3. **Versionner les fichiers de rules** dans Git, comme du code
4. **Tester avec `promtool`** :

```bash
# Vérifier la syntaxe des rules
promtool check rules rules/recording_rules.yml

# Test unitaire des rules
promtool test rules rules/tests.yml
```

```yaml
# rules/tests.yml — tests unitaires pour les recording rules
rule_files:
  - recording_rules.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_series:
      - series: 'http_requests_total{job="api", status="200"}'
        values: '0+10x5'  # 0, 10, 20, 30, 40, 50
      - series: 'http_requests_total{job="api", status="500"}'
        values: '0+1x5'   # 0, 1, 2, 3, 4, 5
    alert_rule_test: []
    promql_expr_test:
      - expr: job:http_error_rate:ratio5m{job="api"}
        eval_time: 5m
        exp_samples:
          - labels: 'job:http_error_rate:ratio5m{job="api"}'
            value: 0.0909  # 1/(1+10) ≈ 0.0909
```

---

## 9. Alerting Rules et Alertmanager

### 9.1. Architecture de l'alerting

```
Prometheus ─── évalue les alerting rules ───> déclenche l'alerte
                                                     │
                                              Alertmanager
                                                     │
                                          ┌──────────┼──────────┐
                                          ↓          ↓          ↓
                                       Slack    PagerDuty     Email
                                     (#alerts)  (on-call)   (digest)
```

Le workflow est le suivant :
1. **Prometheus** évalue périodiquement les alerting rules
2. Si la condition est vraie pendant `for` (durée), l'alerte passe en état `firing`
3. Prometheus envoie l'alerte à **Alertmanager**
4. Alertmanager **route**, **déduplique**, **groupe** et envoie aux receivers

### 9.2. Alerting rules — syntaxe et exemples

```yaml
# rules/alerting_rules.yml
groups:
  - name: slo_alerts
    rules:
      # Taux d'erreur élevé
      - alert: HighErrorRate
        expr: job:http_error_rate:ratio5m{job="order-service"} > 0.01
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "Taux d'erreur élevé sur {{ $labels.job }}"
          description: >
            Le taux d'erreur 5xx de {{ $labels.job }} est à
            {{ $value | humanizePercentage }} depuis 5 minutes.
            Seuil: 1%.
          runbook_url: "https://wiki.internal/runbooks/high-error-rate"

      # Latence P99 dégradée
      - alert: HighLatencyP99
        expr: job_route:http_request_duration:p99_5m > 0.5
        for: 10m
        labels:
          severity: warning
          team: backend
        annotations:
          summary: "P99 latence élevée sur {{ $labels.job }} {{ $labels.route }}"
          description: >
            La latence P99 de {{ $labels.route }} est à {{ $value | humanizeDuration }}.
            Seuil: 500ms.

      # Error budget burn rate (approche recommandée par Google SRE)
      - alert: ErrorBudgetBurnRate
        expr: |
          (
            sum(rate(http_requests_total{status=~"5..", job="api"}[1h]))
            / sum(rate(http_requests_total{job="api"}[1h]))
          ) > 14.4 * (1 - 0.999)
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error budget burn rate critique"
          description: >
            Le taux de consommation de l'error budget est 14.4x le taux normal.
            A ce rythme, l'error budget sera épuisé en moins de 2h.

  - name: infrastructure_alerts
    rules:
      # Mémoire haute
      - alert: HighMemoryUsage
        expr: |
          process_resident_memory_bytes / (1024^3) > 1.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Utilisation mémoire élevée sur {{ $labels.instance }}"
          description: "RSS = {{ $value | humanize1024 }}B"

      # Instance down
      - alert: InstanceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} down"
          description: "L'instance {{ $labels.instance }} du job {{ $labels.job }} est down depuis 2 minutes."

      # Event loop lag Node.js
      - alert: HighEventLoopLag
        expr: nodejs_eventloop_lag_seconds > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Event loop lag élevé"
          description: "Lag = {{ $value | humanizeDuration }} sur {{ $labels.instance }}"
```

### 9.3. Bonnes pratiques pour les alerting rules

Le paramètre `for` est crucial : il évite les faux positifs.

| Sévérité | `for` recommandé | Justification |
|----------|-------------------|---------------|
| critical | 2-5 min | Suffisant pour filtrer les pics, assez rapide pour réagir |
| warning | 10-15 min | Éviter le bruit, laisser le temps à l'auto-healing |
| info | 30 min - 1h | Notification non urgente |

**Règles d'or de l'alerting** :
1. Chaque alerte doit avoir un **runbook_url** qui dit quoi faire
2. Si une alerte n'entraîne aucune action humaine, elle ne devrait pas exister
3. Alerter sur les **symptômes** (latence élevée), pas les **causes** (CPU élevé) — sauf pour l'infra
4. Utiliser des **recording rules** dans les alerting rules pour la lisibilité

### 9.4. Alertmanager — configuration complète

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/T00/B00/XXXXX'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

# Templates personnalisés
templates:
  - '/etc/alertmanager/templates/*.tmpl'

# Arbre de routage
route:
  # Route par défaut
  receiver: 'slack-warnings'
  group_by: ['alertname', 'job']
  group_wait: 30s       # attendre 30s pour grouper les alertes
  group_interval: 5m    # ne pas re-notifier avant 5m pour le même groupe
  repeat_interval: 4h   # re-notifier toutes les 4h si toujours firing

  routes:
    # SEV-1 et SEV-2 → PagerDuty (réveille le on-call)
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      group_wait: 10s
      repeat_interval: 1h
      continue: false  # ne pas continuer vers d'autres routes

    # Alertes du team backend → channel Slack dédié
    - match:
        team: backend
      receiver: 'slack-backend'
      routes:
        - match:
            severity: critical
          receiver: 'pagerduty-critical'

    # Alertes infra → channel ops
    - match_re:
        alertname: '(InstanceDown|HighMemory.*|HighCPU.*)'
      receiver: 'slack-ops'

# Configuration des inhibitions
inhibit_rules:
  # Si l'instance est down, ne pas alerter sur les métriques de cette instance
  - source_match:
      alertname: 'InstanceDown'
    target_match_re:
      alertname: '(HighErrorRate|HighLatency.*|HighMemory.*)'
    equal: ['instance']

  # Si un SEV-1 est actif, inhiber les warnings associés
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'job']

# Configuration des receivers
receivers:
  - name: 'slack-warnings'
    slack_configs:
      - channel: '#alerts-warnings'
        title: '{{ .GroupLabels.alertname }}'
        text: >-
          {{ range .Alerts }}
          *{{ .Annotations.summary }}*
          {{ .Annotations.description }}
          {{ end }}
        send_resolved: true

  - name: 'slack-backend'
    slack_configs:
      - channel: '#backend-alerts'
        title: '{{ template "slack.title" . }}'
        text: '{{ template "slack.text" . }}'
        actions:
          - type: button
            text: 'Runbook :book:'
            url: '{{ (index .Alerts 0).Annotations.runbook_url }}'
          - type: button
            text: 'Dashboard :chart_with_upwards_trend:'
            url: 'https://grafana.internal/d/slo-dashboard'
        send_resolved: true

  - name: 'slack-ops'
    slack_configs:
      - channel: '#ops-alerts'
        send_resolved: true

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: '<PAGERDUTY_INTEGRATION_KEY>'
        severity: '{{ if eq .CommonLabels.severity "critical" }}critical{{ else }}warning{{ end }}'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ template "pagerduty.instances" .Alerts.Firing }}'
```

### 9.5. Alertmanager — Silences et maintenance

Les **silences** permettent de couper temporairement les notifications (ex: pendant une maintenance planifiée).

```bash
# Créer un silence via l'API
amtool silence add \
  --alertmanager.url=http://localhost:9093 \
  --author="alice" \
  --comment="Maintenance DB planifiée" \
  --duration=2h \
  alertname="HighLatencyP99" job="order-service"

# Lister les silences actifs
amtool silence query --alertmanager.url=http://localhost:9093

# Supprimer un silence
amtool silence expire <silence-id> --alertmanager.url=http://localhost:9093
```

Vous pouvez aussi créer des silences via l'interface web d'Alertmanager (`http://localhost:9093/#/silences`).

### 9.6. Schéma récapitulatif du routage

```
Alerte reçue
    │
    ├── Inhibée ? ──> oui ──> STOP (pas de notification)
    │
    ├── Silencée ? ──> oui ──> STOP (pas de notification)
    │
    ├── Déjà notifiée dans le group_interval ? ──> oui ──> STOP
    │
    └── Router vers le receiver approprié
         │
         ├── group_wait : attendre pour grouper
         │
         └── Envoyer la notification (Slack, PagerDuty, Email, Webhook)
```

---

## 10. Fédération Prometheus et remote_write

### 10.1. Le problème de la scalabilité

Un seul Prometheus ne suffit pas quand vous avez :
- **Plusieurs clusters** (staging, production, multi-région)
- **Des millions de séries** dépassant la capacité d'une instance
- **Un besoin de rétention longue** (Prometheus garde typiquement 15-30 jours)

### 10.2. Fédération hiérarchique

Un Prometheus "global" scrape des Prometheus "locaux", en récupérant uniquement les recording rules pré-agrégées.

```yaml
# prometheus-global.yml
scrape_configs:
  # Fédérer depuis le Prometheus de production EU
  - job_name: 'federate-prod-eu'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{__name__=~"job:.*"}'  # uniquement les recording rules
        - 'up'                      # et le health check
    static_configs:
      - targets: ['prometheus-prod-eu:9090']
        labels:
          region: 'eu-west-1'

  # Fédérer depuis le Prometheus de production US
  - job_name: 'federate-prod-us'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{__name__=~"job:.*"}'
    static_configs:
      - targets: ['prometheus-prod-us:9090']
        labels:
          region: 'us-east-1'
```

**Pourquoi `honor_labels: true` ?** Sans cette option, Prometheus global ajouterait un label `exported_job` à la place de `job`, ce qui casserait les requêtes.

### 10.3. remote_write — stockage longue durée

`remote_write` envoie les métriques à un backend de stockage externe compatible (Thanos, Cortex, Mimir, VictoriaMetrics).

```yaml
# prometheus.yml
remote_write:
  - url: "http://mimir:9009/api/v1/push"
    queue_config:
      max_samples_per_send: 1000
      batch_send_deadline: 5s
      max_shards: 200
    write_relabel_configs:
      # N'envoyer que les métriques importantes (réduire les coûts)
      - source_labels: [__name__]
        regex: '(http_requests_total|http_request_duration_seconds_bucket|up|node_.*)'
        action: keep
```

### 10.4. Comparaison des solutions de scalabilité

| Solution | Rétention longue | Multi-cluster | Haute disponibilité | Complexité |
|----------|-----------------|---------------|---------------------|------------|
| Fédération | Non | Oui | Non | Faible |
| remote_write + Mimir/Cortex | Oui | Oui | Oui | Moyenne |
| remote_write + Thanos | Oui | Oui | Oui (sidecar) | Moyenne |
| remote_write + VictoriaMetrics | Oui | Oui | Oui | Faible |

L'analogie : la fédération est une chaîne de résumés — chaque niveau perd du détail. Le remote_write est un archivage complet — vous gardez tout, mais ça coûte plus cher en stockage.

---

## 11. Bonnes pratiques

1. **Nommage** : `<namespace>_<nom>_<unité>` (ex: `http_request_duration_seconds`)
2. **Unités** : toujours en unités de base (secondes, bytes, pas ms ou KB)
3. **Labels** : garder la cardinalité basse, utiliser des valeurs enum
4. **Histogram buckets** : adapter aux SLO (si SLO = 200ms, avoir des buckets à 0.1, 0.2, 0.5)
5. **Scrape interval** : 15s est le standard, 5s pour le debug
6. **Recording rules** : pré-calculer toute requête utilisée dans plus d'un dashboard ou alerte
7. **Alerting** : alerter sur les symptômes, inclure un runbook, utiliser `for` pour éviter le bruit
8. **Fédération** : ne remonter que les recording rules, jamais les métriques brutes
9. **remote_write** : filtrer avec `write_relabel_configs` pour maîtriser les coûts

---

## 12. Récapitulatif

- **Counter** pour ce qui s'accumule, **Gauge** pour les instantanés, **Histogram** pour les distributions
- Prometheus **pull** les métriques (scrape), il ne les reçoit pas en push
- PromQL est le langage de requête — `rate()`, `histogram_quantile()`, `sum by ()`
- La cardinalité des labels est le piège #1 en production
- `prom-client` + `collectDefaultMetrics()` = observabilité Node.js en 5 minutes
- **rate()** pour les alertes (stable), **irate()** pour le debug temps réel (réactif)
- **Vector matching** (`on`, `ignoring`, `group_left`) permet de croiser des métriques avec des labels différents
- Les **recording rules** pré-calculent les requêtes coûteuses — convention `level:metric:operations`
- **Alertmanager** route, déduplique et groupe les alertes vers Slack, PagerDuty, email
- Les **inhibitions** suppriment les alertes redondantes, les **silences** coupent les alertes pendant les maintenances
- La **fédération** agrège plusieurs Prometheus, le **remote_write** permet le stockage longue durée

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Lab** : [lab-04-metriques-et-prometheus](../labs/lab-04-metriques-et-prometheus/README)
2. **Quiz** : [quiz 04 metriques et prometheus](../quizzes/quiz-04-metriques-et-prometheus.html)
:::

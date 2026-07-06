# Lab 13 — Observability as Code (provisioning & GitOps)

> **Outcome :** à la fin, tu sais sortir un dashboard et une règle d'alerte du **clickops** : provisionner un **datasource** et un **dashboard** Grafana **par fichiers versionnés**, verrouiller Grafana contre le **drift**, et versionner + **tester** une règle Prometheus avec `promtool test rules`. Tu prouves qu'un `git revert` restaure un dashboard supprimé.
> **Vrai outil :** Grafana + Prometheus (`grafana/grafana`, `prom/prometheus`) + `promtool` + la `demo-app` du cours, via les `docker-compose` fournis à la racine du cours. Aucun harnais simulé.
> **Feedback :** le coach valide en session. Tes oracles : l'UI Grafana (`http://localhost:3001`), l'onglet **Rules** de Prometheus (`http://localhost:9090/rules`), et la sortie de `promtool`.

---

## Énoncé

Tu reprends l'incident du module : le dashboard **« API — vue RSVP »** a été supprimé d'un clic et une alerte a été trafiquée sans trace, parce que l'observabilité de TribuZen vivait **dans l'UI** au lieu de **Git**. Tu vas mettre cette observabilité sous code, pour de bon.

Tu dois livrer :

1. **Un datasource provisionné** par fichier (`datasources.yaml`) — Prometheus, `editable: false`.
2. **Un provider de dashboards** (`dashboards.yaml`) verrouillé : `allowUiUpdates: false`, `disableDeletion: true`.
3. **Un dashboard versionné** (`api-rsvp.json`) chargé automatiquement au démarrage, avec un `uid` stable et une datasource par variable.
4. **Une règle Prometheus versionnée** (`slo-burn.yml`) + son **test** (`slo-burn_test.yml`) qui passe avec `promtool test rules`.
5. **La démonstration anti-drift** : essayer de modifier le dashboard dans l'UI (refusé), puis **supprimer le fichier `.json`**, redémarrer, constater qu'il disparaît, faire un `git checkout` du fichier, redémarrer, constater qu'il **revient** — l'équivalent d'un `git revert` en incident.

**Pas de gap-fill** — tu écris les fichiers complets à partir des starters ci-dessous.

### Point de départ — ce qui est déjà fourni

- `docker-compose.full.yml` (racine du cours) démarre `demo-app` (:3000), `prometheus` (:9090), `grafana` (:3001).
- Le service `grafana` monte déjà `./config/grafana/provisioning` → `/etc/grafana/provisioning` et `./config/grafana/dashboards` → `/var/lib/grafana/dashboards`.
- Le service `prometheus` monte `./config/prometheus/prometheus.yml` et `./config/prometheus/rules`, et `prometheus.yml` charge déjà `rule_files: ['rules/*.yml']`.
- `demo-app` expose `http_requests_total{method, route, status_code, ...}` et `http_request_duration_seconds_bucket{...}` sur `/metrics`.

> **Vérifie le nom exact du label de statut** (`curl localhost:3000/metrics | grep http_requests_total`). Sur la demo-app c'est `status_code` ; dans TribuZen ce sera `status`. **Ne devine pas le nom du label** — adapte tes `status_code=~"5.."` en conséquence.

### Ce que tu dois écrire toi-même

Crée cette arborescence sous `config/` à la racine du cours :

```
config/
  grafana/
    provisioning/
      datasources/datasources.yaml   ← à écrire
      dashboards/dashboards.yaml      ← à écrire (le PROVIDER, pas le dashboard)
    dashboards/
      api-rsvp.json                   ← à écrire (le dashboard)
  prometheus/
    rules/slo-burn.yml                ← à écrire
    tests/slo-burn_test.yml           ← à écrire
```

---

## Étapes (en friction)

1. **Démarre la stack** : `docker compose -f docker-compose.full.yml up -d`. Vérifie `http://localhost:9090/targets` → `demo-app` **UP**.
2. **Repère le label de statut** : `curl localhost:3000/metrics | grep http_requests_total`. Note `status_code` (ou `status`).
3. **Écris le datasource** `config/grafana/provisioning/datasources/datasources.yaml` : Prometheus, `url: http://prometheus:9090`, `isDefault: true`, `editable: false`.
4. **Écris le provider** `config/grafana/provisioning/dashboards/dashboards.yaml` : `type: file`, `options.path: /var/lib/grafana/dashboards`, `allowUiUpdates: false`, `disableDeletion: true`. **Attention** : ce fichier ne contient PAS de panel.
5. **Construis d'abord le dashboard à la souris** dans Grafana (un panel `timeseries` p99 latence + un `stat` taux d'erreur), puis **exporte-le** (*Dashboard settings → JSON Model*), mets `id: null` et un `uid` stable (`tribuzen-api-rsvp`), remplace la datasource en dur par une **variable** `${DS_PROMETHEUS}`, et sauvegarde dans `config/grafana/dashboards/api-rsvp.json`.
6. **Redémarre Grafana** : `docker compose -f docker-compose.full.yml up -d grafana`. Le dashboard apparaît **verrouillé** : essaie de le modifier/sauvegarder dans l'UI → refusé (provisionné). ✅ anti-drift.
7. **Écris la règle** `config/prometheus/rules/slo-burn.yml` (recording du taux 5xx 5m + une alerte burn-rate). Utilise `job="demo-app"` et le bon label de statut.
8. **Lint** : `docker compose exec prometheus promtool check rules /etc/prometheus/rules/slo-burn.yml`. Corrige jusqu'au vert.
9. **Écris le test** `config/prometheus/tests/slo-burn_test.yml` (séries simulées à 20 % d'erreur) et lance `promtool test rules`. Il doit **passer**. Puis casse volontairement le seuil (`> 0.5`) et relance → le test **échoue** : tu viens de voir la CI attraper un drift.
10. **Démo restauration** : supprime `config/grafana/dashboards/api-rsvp.json`, `docker compose up -d grafana` → le dashboard disparaît. `git checkout config/grafana/dashboards/api-rsvp.json`, redémarre → il **revient**. C'est le `git revert` de l'incident du module.

---

## Corrigé complet commenté

### 1. Datasource — `config/grafana/provisioning/datasources/datasources.yaml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090   # nom du service dans docker-compose (pas localhost)
    isDefault: true
    editable: false               # non modifiable dans l'UI -> anti-drift
```

### 2. Provider de dashboards — `config/grafana/provisioning/dashboards/dashboards.yaml`

```yaml
apiVersion: 1

providers:
  - name: 'tribuzen-dashboards'
    orgId: 1
    folder: 'TribuZen'                     # dossier créé dans l'UI Grafana
    type: file
    disableDeletion: true                  # l'UI ne peut pas supprimer un dashboard provisionné
    updateIntervalSeconds: 10              # relit le disque toutes les 10 s
    allowUiUpdates: false                  # l'UI ne peut pas persister une modif -> anti-drift
    options:
      path: /var/lib/grafana/dashboards    # dossier monté où sont les .json
      foldersFromFilesStructure: false
```

> Ce fichier ne décrit **pas** de dashboard : il dit à Grafana *où lire* les `.json`. Le dashboard est le fichier séparé ci-dessous.

### 3. Dashboard versionné — `config/grafana/dashboards/api-rsvp.json`

```jsonc
{
  "id": null,                       // était l'id interne -> null pour la portabilité
  "uid": "tribuzen-api-rsvp",       // uid STABLE : identité du dashboard entre déploiements
  "title": "API — vue RSVP",
  "tags": ["tribuzen", "api", "rsvp"],
  "schemaVersion": 39,
  "refresh": "30s",
  "time": { "from": "now-1h", "to": "now" },
  "templating": {
    "list": [
      {
        "type": "datasource",
        "name": "DS_PROMETHEUS",    // variable de datasource -> portable entre environnements
        "query": "prometheus",
        "current": { "text": "Prometheus", "value": "Prometheus" }
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "p99 latence /rsvp",
      "datasource": "${DS_PROMETHEUS}",   // JAMAIS le nom d'instance en dur
      "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
      "fieldConfig": { "defaults": { "unit": "s" } },
      "targets": [
        {
          "refId": "A",
          "expr": "histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job=\"demo-app\", route=\"/api/products\"}[5m])))",
          "legendFormat": "p99"
        }
      ]
    },
    {
      "id": 2,
      "type": "stat",
      "title": "Taux d'erreur 5xx",
      "datasource": "${DS_PROMETHEUS}",
      "gridPos": { "x": 12, "y": 0, "w": 6, "h": 8 },
      "fieldConfig": {
        "defaults": {
          "unit": "percentunit",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 0.01 }
            ]
          }
        }
      },
      "targets": [
        {
          "refId": "A",
          "expr": "sum(rate(http_requests_total{job=\"demo-app\", status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"demo-app\"}[5m]))"
        }
      ]
    }
  ]
}
```

> Remplace `route="/api/products"` / `job="demo-app"` / `status_code` par ce que **ta** demo-app expose réellement (étape 2). Le `.json` que tu exportes depuis l'UI aura plus de champs : garde-les, ne touche qu'à `id`, `uid` et la datasource.

### 4. Règle Prometheus — `config/prometheus/rules/slo-burn.yml`

```yaml
# SLO disponibilité 99.9% de demo-app -> error_budget = 0.001.
# Label de statut = status_code sur la demo-app (status dans TribuZen).
groups:
  - name: demo-slo-recording
    interval: 30s
    rules:
      - record: job:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total{job="demo-app"}[5m]))

  - name: demo-slo-alerts
    rules:
      - alert: DemoSLOBurnRateFast
        expr: job:slo_errors:ratio_rate5m > (14.4 * 0.001)   # burn 14.4x x budget 0.001
        for: 2m
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 14.4x - SLO dispo demo-app"
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-fast"
```

### 5. Test de la règle — `config/prometheus/tests/slo-burn_test.yml`

```yaml
rule_files:
  - ../rules/slo-burn.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_series:
      # 20 req 5xx/min + 80 OK/min pendant 10 min -> 20% d'erreur, > seuil 1.44%
      - series: 'http_requests_total{job="demo-app", status_code="500"}'
        values: '0+20x10'
      - series: 'http_requests_total{job="demo-app", status_code="200"}'
        values: '0+80x10'
    alert_rule_test:
      - eval_time: 10m
        alertname: DemoSLOBurnRateFast
        exp_alerts:
          - exp_labels:
              severity: page
              slo: api-availability
```

Lancement :

```bash
docker compose exec prometheus promtool check rules /etc/prometheus/rules/slo-burn.yml
docker compose exec prometheus promtool test rules /etc/prometheus/tests/slo-burn_test.yml
# -> "SUCCESS" ; si tu passes le seuil à > 0.5, le test échoue (l'alerte ne fire plus).
```

**Pourquoi ce corrigé est correct :**
- **Datasource `editable: false` + provider `allowUiUpdates: false`/`disableDeletion: true`** : l'UI ne peut ni modifier ni supprimer ce qui est provisionné → le drift est structurellement impossible, le `.json` reste la seule source de vérité.
- **Provider ≠ dashboard** : `dashboards.yaml` ne fait que pointer vers `options.path` ; le dashboard est un fichier séparé. Confondre les deux = « pourquoi mon dashboard n'apparaît pas ».
- **`uid` stable + `id: null`** : le dashboard est mis à jour (pas dupliqué) à chaque déploiement, et reste portable entre instances.
- **Datasource par variable `${DS_PROMETHEUS}`** : le même `.json` marche en staging et en prod, où l'instance de datasource peut porter un autre nom.
- **`check rules` puis `test rules`** : `check` valide la syntaxe, `test` prouve le comportement (l'alerte fire bien à 20 % d'erreur). Casser le seuil casse le test → un drift d'alerte est attrapé **avant** la prod.
- **Recording rule partagée** : l'alerte ne recalcule pas le ratio ; réutilisable par d'autres alertes/dashboards.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Provider vs dashboard | provider pointe vers `path`, dashboard = `.json` séparé | JSON du dashboard mis dans `dashboards.yaml` |
| Anti-drift | `allowUiUpdates: false` + `disableDeletion: true` + `editable: false` | valeurs par défaut, UI peut écrire par-dessus |
| uid | stable, fixé à la main, `id: null` | uid vide/régénéré → doublons |
| Datasource | par variable `${DS_PROMETHEUS}` | nom d'instance en dur dans les panels |
| Règle versionnée | dans `rules/*.yml`, chargée par `rule_files` | éditée à la main sur le serveur |
| `check` **et** `test` | les deux passent ; casser le seuil casse le test | seulement `check`, jamais `test` |
| Restauration | `git checkout` du `.json` → dashboard revient | aucune source de vérité hors UI |
| Secrets | aucun token/mot de passe dans les fichiers | secret commité |

### Coach — questions de vérification en session

- « Montre que l'UI refuse d'enregistrer une modif du dashboard. Quel réglage le garantit ? » (attendu : `allowUiUpdates: false`)
- « Supprime le `.json`, redémarre : le dashboard part. Comment le ramènes-tu ? » (attendu : `git checkout`/`git revert` puis reload — c'est tout l'intérêt)
- « Mets le JSON du dashboard dans `dashboards.yaml`. Que se passe-t-il ? » (attendu : rien ne se charge — provider ≠ dashboard)
- « Passe le seuil de l'alerte à `> 0.5` et relance `promtool test rules`. Résultat, et pourquoi c'est une bonne nouvelle ? » (attendu : échec → la CI aurait bloqué le drift de l'incident du module)
- « Pourquoi `${DS_PROMETHEUS}` plutôt que `Prometheus` en dur dans les panels ? » (attendu : portabilité staging/prod)
- « Différence entre `promtool check rules` et `promtool test rules` ? » (attendu : syntaxe vs comportement)

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reproduis le provisioning **de mémoire, en 30 min**, mais déploie le **même `api-rsvp.json`** cette fois via le **Grafana Terraform provider** au lieu du provisioning par fichiers : un `main.tf` avec `required_providers { grafana = { source = "grafana/grafana" } }`, un `provider "grafana"` (url + `auth` par variable), un `resource "grafana_folder"` et un `resource "grafana_dashboard"` avec `config_json = file("dashboards/api-rsvp.json")` et `overwrite = true`. Lance `terraform plan` puis `terraform apply`.
2. **Vérifie que le token n'est jamais en clair** dans le repo (variable `TF_VAR_grafana_service_account_token` / `terraform.tfvars` gitignoré).
3. Ajoute une **seconde règle** (`DemoSLOBurnRateSlow`, burn `1x`) **et** son cas de test `promtool` : un scénario à **faible** taux d'erreur (0,05 %) où le rapide **ne fire pas** mais le lent **oui**. Explique au coach pourquoi il faut tester le *négatif* (l'alerte qui ne doit PAS partir) autant que le positif.

**Critère de réussite :** le dashboard apparaît dans Grafana via `terraform apply` sans aucun clic, le `.json` reste la source de vérité (Terraform ne fait que le pousser), aucun secret n'est dans l'historique Git, et tes deux règles ont chacune un test `promtool` vert.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces artefacts vivent ici :

```
tribuzen/
  config/
    grafana/
      provisioning/
        datasources/datasources.yaml   ← Prometheus, editable: false
        dashboards/dashboards.yaml      ← provider, allowUiUpdates/disableDeletion
      dashboards/
        api-rsvp.json                   ← dashboard versionné (uid stable, DS variable)
    prometheus/
      prometheus.yml                    ← rule_files: ['rules/*.yml']
      rules/slo-burn.yml                ← recording + alertes burn-rate
      tests/slo-burn_test.yml           ← promtool test rules
  .github/workflows/observability.yml   ← job validate : promtool check + test sur chaque PR
```

**Différences avec le lab :**
- Le job devient `tribuzen-api` et le label de statut `status` (pas `status_code`).
- Le datasource pointe la vraie instance Prometheus/Grafana Cloud ; l'auth passe par un **secret** (jamais `datasources.yaml` en clair).
- Le dashboard est exporté depuis l'instance de dev **une seule fois**, puis toute évolution passe par une **PR** revue (grille ci-dessus), jamais par un clic dans l'UI de prod.
- La CI (`.github/workflows/observability.yml`) lance `promtool check rules` **et** `promtool test rules` : une PR qui casse une alerte est **bloquée** avant merge.

**Commit cible :**
```
feat(observability): dashboards & règles Prometheus versionnés + provisioning anti-drift
```

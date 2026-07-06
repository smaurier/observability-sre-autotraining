---
titre: Observability as Code
cours: 16-observability-sre
notions: ["dashboards as code (JSON model)", "provisioning Grafana par fichiers", "datasources.yaml & dashboards provider", "allowUiUpdates & anti-drift", "Prometheus rules en git (rule_files)", "promtool check rules / test rules", "GitOps de l'observabilité", "revue de dashboard en PR", "Grafana Terraform provider (grafana_dashboard)", "clickops (anti-pattern)"]
outcomes:
  - sait provisionner un datasource et un dashboard Grafana par fichiers versionnés (au lieu du clickops)
  - sait versionner des règles Prometheus (alerting + recording) et les valider avec promtool check/test rules
  - sait mettre en place un anti-drift Grafana (allowUiUpdates false, dashboards en lecture seule)
  - sait décrire un workflow GitOps de l'observabilité et ce qu'on revoit dans une PR de dashboard
prerequis: ["modules 00-12 du cours", "module 07 — grafana-dashboards (panels, variables, JSON model)", "module 09 — alerting-strategies (règles d'alerte, burn-rate)"]
next: 14-kubernetes-observability
libs: []
tribuzen: ops/ de TribuZen — dashboards Grafana et règles Prometheus versionnés, provisionnés par fichiers, revus en PR (fin du clickops)
last-reviewed: 2026-07
---

# Observability as Code

> **Outcomes — tu sauras FAIRE :** provisionner datasources + dashboards Grafana **par fichiers versionnés**, versionner et **tester** des règles Prometheus (`promtool`), verrouiller Grafana contre le **drift**, décrire le workflow GitOps qui remplace le clickops.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module traite de la **codification** de l'observabilité — comment mettre dashboards, alertes et datasources sous Git et les déployer sans clic. La **construction** d'un bon dashboard (panels, variables, PromQL) est le **module 07**, et l'**écriture** des règles burn-rate est le **module 09**. Ici on ne réapprend pas à faire un dashboard : on apprend à ne plus jamais le perdre. Le pipeline CI/CD complet (GitHub Actions) est effleuré ; DORA et production-readiness sont au **module 20**.

## 1. Cas concret d'abord

Mardi 23h. Un contributeur TribuZen répond à une astreinte : le dashboard **« API — vue RSVP »**, celui qui montre le p99 du fameux `/rsvp`, **a disparu**. Quelqu'un l'a « nettoyé » depuis l'UI Grafana la semaine dernière — un clic *Delete*, pas de confirmation forcée, pas de corbeille. Il n'existe **aucune** sauvegarde : ce dashboard a toujours vécu dans l'interface, construit à la souris, jamais exporté. Il faut le **reconstruire de mémoire** en plein incident.

Le même soir, on découvre qu'une **alerte** `SLOBurnRateFast` a été « temporairement » modifiée dans un fichier sur le serveur Prometheus par un ex-collègue, sans trace : le seuil est passé de `14.4 × budget` à `> 50 %`, et plus personne ne sait pourquoi. Personne ne l'a **revue**. Personne ne peut la **restaurer**.

Ces deux pannes ont la même cause : l'observabilité de TribuZen vit **dans des interfaces**, pas dans **Git**. On appelle ça le **clickops** — configurer à la souris, sans historique, sans revue, sans reproductibilité.

À la fin de ce module, tout ça est un fichier dans le repo. Un `git revert` ramène le dashboard supprimé. Une PR aurait bloqué le seuil d'alerte trafiqué. Le principe :

```
Clickops : dashboard construit dans l'UI  →  perdu au premier clic Delete, aucune trace
Obs. as Code : dashboard = fichier JSON dans git  →  git log, git revert, revue en PR, redéploiement en secondes
```

On code chaque brique — provisioning par fichiers, règles en git, anti-drift, GitOps — pour que TribuZen ne perde plus jamais un dashboard ni une alerte.

---

## 2. Théorie complète, concise

### 2.1 Clickops vs Observability as Code

Le **clickops** = configurer dashboards, alertes, datasources **à la main dans l'UI**. Ça marche le premier jour, puis ça pourrit : pas d'historique (qui a changé quoi, quand, pourquoi ?), pas de revue, pas de reproductibilité (Grafana tombe → tout est à refaire), drift silencieux entre environnements.

L'**Observability as Code** applique à l'observabilité les principes de l'Infrastructure as Code : dashboards, règles d'alerte, recording rules, datasources et SLO sont des **fichiers versionnés**, **revus en PR**, **déployés automatiquement**. On gagne : reproductibilité (restauration par `git revert`), revue par les pairs, audit complet (`git log`), cohérence multi-environnement (un template paramétré), et la possibilité de **tester** la config avant de la déployer.

Règle mentale : **si ça n'est pas dans Git, ça n'existe pas.** Une modification faite dans l'UI est une dette qui sera perdue ou écrasée.

### 2.2 Provisioning Grafana par fichiers

Source : docs Grafana, *Provisioning*. Grafana lit au démarrage des fichiers de configuration dans `/etc/grafana/provisioning/`, organisés par type :

- `/etc/grafana/provisioning/datasources/` → déclaration des sources de données ;
- `/etc/grafana/provisioning/dashboards/` → **providers** qui disent à Grafana où charger les dashboards sur le disque.

**Datasource provisionné** — `datasources/datasources.yaml` :

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090   # nom du service docker-compose
    isDefault: true
    editable: false               # non modifiable depuis l'UI -> anti-drift
```

`editable: false` est le premier verrou anti-drift : la datasource ne se touche que par le fichier.

**Provider de dashboards** — `dashboards/dashboards.yaml`. Attention à la confusion classique : ce fichier **ne contient pas** de dashboard. Il déclare **où** Grafana va lire les fichiers JSON des dashboards :

```yaml
apiVersion: 1

providers:
  - name: 'tribuzen-dashboards'
    orgId: 1
    folder: 'TribuZen'                       # dossier créé dans l'UI Grafana
    type: file
    disableDeletion: true                    # l'UI ne peut pas supprimer un dashboard provisionné
    updateIntervalSeconds: 10                # relit le disque toutes les 10 s
    allowUiUpdates: false                    # modifications UI interdites (verrou anti-drift)
    options:
      path: /var/lib/grafana/dashboards      # dossier où sont montés les .json
      foldersFromFilesStructure: true        # arborescence de fichiers -> dossiers Grafana
```

Chaque dashboard est ensuite un **fichier `.json`** (le *JSON model* du module 07) déposé dans `path`. Grafana le charge tout seul, sans clic.

En docker-compose, on **monte** ces deux dossiers (déjà cablé dans le `docker-compose.full.yml` du cours) :

```yaml
grafana:
  image: grafana/grafana:latest
  volumes:
    - ./config/grafana/provisioning:/etc/grafana/provisioning
    - ./config/grafana/dashboards:/var/lib/grafana/dashboards
```

### 2.3 Le JSON model d'un dashboard, versionné

Un dashboard Grafana **est** un objet JSON (`uid`, `title`, `tags`, `schemaVersion`, `panels[]`, `templating`). Deux façons de l'obtenir sans l'écrire à la main :

1. **Le construire à la souris une fois**, puis l'**exporter** (*Dashboard settings → JSON Model*, ou *Share → Export → Save to file*) et **committer** le `.json`. C'est le chemin pragmatique pour démarrer.
2. **Le générer** depuis du code (TypeScript, Grafana Foundation SDK, jsonnet/grafonnet) quand tu produis N dashboards similaires pour N services. Puissant mais à réserver quand la duplication le justifie — commence simple.

Un piège d'export à connaître : quand tu exportes un dashboard construit dans l'UI, le champ `id` (interne à l'instance) doit être mis à `null` et le `uid` doit être **stable** — c'est le `uid` (pas le titre) qui identifie le dashboard entre déploiements. Deux fichiers avec le même `uid` = collision.

### 2.4 Règles Prometheus en git

Source : docs Prometheus, *Recording/Alerting rules* & *Configuration*. Les règles vivent dans des **rules files** YAML, chargés par `prometheus.yml` via `rule_files` :

```yaml
# prometheus.yml
rule_files:
  - 'rules/*.yml'     # tous les fichiers de règles versionnés dans config/prometheus/rules/
```

Structure exacte d'un rules file (champs vérifiés docs) — `groups` → `name` / `interval` / `rules`, chaque règle étant soit **recording** (`record` + `expr`) soit **alerting** (`alert` + `expr` + `for` + `labels` + `annotations`) :

```yaml
groups:
  - name: tribuzen-slo-recording
    interval: 30s
    rules:
      # recording rule : pré-calcule un ratio réutilisé par plusieurs alertes
      - record: job:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[5m]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[5m]))

  - name: tribuzen-slo-alerts
    rules:
      # alerting rule : consomme la recording rule, seuil = burn-rate x error_budget
      - alert: TribuZenSLOBurnRateFast
        expr: job:slo_errors:ratio_rate5m > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 14.4x - SLO dispo TribuZen"
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-fast"
```

Le contenu PromQL de ces règles est le module 09 ; ici, l'important est qu'elles soient **des fichiers dans le repo**, à côté du service qu'elles observent.

### 2.5 Valider et tester les règles avec promtool

C'est le gain décisif du versioning : on **teste** l'observabilité comme du code. `promtool` (livré avec Prometheus) offre deux commandes :

```bash
# 1) lint / vérification de syntaxe — à mettre en CI sur chaque PR
promtool check rules config/prometheus/rules/*.yml

# 2) tests unitaires d'alertes — vérifie qu'une alerte FIRE (ou pas) sur des séries simulées
promtool test rules config/prometheus/tests/slo-burn_test.yml
```

Un fichier de test décrit des séries d'entrée et l'état attendu des alertes à un instant donné :

```yaml
# slo-burn_test.yml
rule_files:
  - ../rules/slo-burn.yml

evaluation_interval: 1m

tests:
  - interval: 1m
    input_series:
      # 100 requêtes/min dont 20 en 5xx pendant 10 min -> 20% d'erreur, bien au-dessus du seuil
      - series: 'http_requests_total{job="tribuzen-api", status="500"}'
        values: '0+20x10'
      - series: 'http_requests_total{job="tribuzen-api", status="200"}'
        values: '0+80x10'
    alert_rule_test:
      - eval_time: 10m
        alertname: TribuZenSLOBurnRateFast
        exp_alerts:
          - exp_labels:
              severity: page
              slo: api-availability
```

La notation `0+20x10` = « part de 0, +20 à chaque pas, 10 pas ». Si l'alerte **ne fire pas** quand elle devrait, `promtool test rules` échoue → la CI casse → la PR est bloquée. Une alerte cassée ne part **jamais** en prod silencieusement.

### 2.6 Anti-drift : verrouiller Grafana

Le **drift** = l'écart entre le code (Git) et la réalité (l'instance) quand quelqu'un modifie dans l'UI. Trois verrous, du plus doux au plus dur :

| Verrou | Où | Effet |
|--------|-----|-------|
| `allowUiUpdates: false` | provider dashboards | l'UI ne peut pas enregistrer de modif sur un dashboard provisionné |
| `disableDeletion: true` | provider dashboards | l'UI ne peut pas supprimer un dashboard provisionné |
| `editable: false` | datasource | datasource non modifiable dans l'UI |

Avec `allowUiUpdates: false`, un utilisateur peut **explorer** un dashboard (changer une variable, zoomer) mais **pas persister** son bricolage : la source de vérité reste le `.json`. Le clickops devient structurellement impossible.

### 2.7 GitOps de l'observabilité

Le **GitOps** applique un principe simple : **Git est la source de vérité**, et un automate réconcilie l'instance avec le repo. Appliqué à l'observabilité :

```
PR (modif dashboard/règle)  →  CI valide (promtool check + test rules, lint JSON)
                            →  revue par un pair (approve)
                            →  merge sur main
                            →  déploiement : fichiers montés dans Grafana/Prometheus, reload
```

Deux mécaniques de déploiement, selon le contexte :

- **Provisioning par fichiers** (ce module) : les `.json`/`.yml` sont montés (volume, ConfigMap k8s) ; Grafana relit son disque (`updateIntervalSeconds`), Prometheus recharge via `POST /-/reload` (flag `--web.enable-lifecycle`). Simple, sans dépendance externe.
- **Grafana Terraform provider** (§2.8) : un `terraform apply` pousse les dashboards via l'**API** Grafana. Plus adapté à Grafana Cloud / multi-instances.

### 2.8 Grafana Terraform provider (survol)

Source : registry Terraform `grafana/grafana` + docs Grafana. Quand le provisioning par fichiers ne suffit pas (Grafana Cloud, plusieurs orgs), le **provider Terraform** gère dashboards et dossiers comme des ressources :

```hcl
terraform {
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = ">= 2.9.0"
    }
  }
}

provider "grafana" {
  url  = "https://tribuzen.grafana.net"
  auth = var.grafana_service_account_token   # jamais en clair dans le repo
}

resource "grafana_folder" "tribuzen" {
  title = "TribuZen"
}

resource "grafana_dashboard" "rsvp" {
  # config_json lit le MÊME fichier .json versionné -> pas de duplication
  config_json = file("${path.module}/dashboards/api-rsvp.json")
  folder      = grafana_folder.tribuzen.uid
  overwrite   = true
}
```

Retiens deux choses : `config_json` pointe vers le **fichier JSON versionné** (le dashboard reste la source de vérité, Terraform ne fait que le pousser), et le token d'auth passe par une **variable/secret**, jamais commité. C'est un mode de **déploiement**, pas une façon différente d'écrire les dashboards.

### 2.9 La revue de dashboard (ce qu'on regarde en PR)

Une PR d'observabilité se revoit comme du code. La checklist utile :

- **`uid` stable et unique** (pas de collision, pas de `uid` régénéré à chaque export) ;
- **datasource par variable**, pas en dur (`${DS_PROMETHEUS}`) → portable entre environnements ;
- **PromQL correcte** : `rate()` sur les counters, `le` présent dans `sum by` d'un `histogram_quantile` (piège du module 02/07) ;
- **seuils justifiés** : une alerte modifiée doit expliquer *pourquoi* le seuil change ;
- **runbook** : chaque alerte a un `runbook_url` ;
- **pas de secret** dans le JSON (URL interne, token) ;
- **diff lisible** : un JSON réordonné à chaque export pollue la revue → committer un JSON à clés stables.

---

## 3. Worked examples

### Exemple 1 — sortir un dashboard du clickops et le versionner

Le dashboard « API — vue RSVP » existe dans l'UI. On le met sous Git de bout en bout.

**Étape A — exporter le JSON model.** Dans Grafana : *Dashboard settings → JSON Model* → copier. Nettoyer deux champs :

```jsonc
{
  "id": null,                 // était 42 (id interne) -> null pour la portabilité
  "uid": "tribuzen-api-rsvp", // uid STABLE : c'est lui qui identifie le dashboard
  "title": "API — vue RSVP",
  "tags": ["tribuzen", "api", "rsvp"],
  "schemaVersion": 39,
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  },
  "panels": [
    {
      "type": "timeseries",
      "title": "p99 latence /rsvp",
      "datasource": "${DS_PROMETHEUS}",
      "targets": [
        {
          "refId": "A",
          "expr": "histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{route=\"/api/events/:id/rsvp\"}[5m])))"
        }
      ]
    }
  ]
}
```

**Étape B — le déposer dans le repo** à l'emplacement monté :

```
config/grafana/dashboards/api-rsvp.json
```

**Étape C — vérifier le provider** (`config/grafana/provisioning/dashboards/dashboards.yaml`) : `options.path` doit pointer vers le dossier monté (`/var/lib/grafana/dashboards`) et `allowUiUpdates: false`.

**Étape D — redémarrer / relire.** `docker compose up -d grafana`. Le dashboard réapparaît, **verrouillé**. Test décisif : dans l'UI, essaie de le modifier et de sauvegarder → Grafana refuse (provisionné). Désormais `git revert` = restauration.

### Exemple 2 — une alerte revue et testée avant la prod

Un collègue veut relâcher le seuil de `TribuZenSLOBurnRateFast`. Au lieu d'éditer le fichier sur le serveur (le drame du §1), il ouvre une PR.

**`config/prometheus/rules/slo-burn.yml`** (diff proposé) :

```diff
   - alert: TribuZenSLOBurnRateFast
-    expr: job:slo_errors:ratio_rate5m > (14.4 * 0.001)
+    expr: job:slo_errors:ratio_rate5m > 0.5
     for: 2m
```

**Ce que la CI fait tourner :**

```bash
promtool check rules config/prometheus/rules/slo-burn.yml     # syntaxe OK ?
promtool test rules config/prometheus/tests/slo-burn_test.yml # l'alerte fire-t-elle encore ?
```

Le test du §2.5 injecte 20 % d'erreur : avec le seuil `> 0.5` (50 %), l'alerte **ne fire plus** → `promtool test rules` échoue → **CI rouge, PR bloquée**. Le reviewer commente : « un seuil à 50 % ne page que sur une panne totale, on rate toutes les dégradations partielles ; garde `14.4 × budget` ». Le drift est **empêché avant** d'atteindre la prod — exactement ce qui a manqué mardi 23h.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — confondre le *provider* de dashboards et le dashboard

`dashboards/dashboards.yaml` (le provider) **ne contient aucun panel**. Il dit seulement à Grafana *où lire* les `.json`. Mettre le JSON d'un dashboard dans ce fichier ne charge rien. Le dashboard = un `.json` séparé dans `options.path`.

### PIÈGE #2 — laisser `allowUiUpdates` par défaut et croire que c'est versionné

Provisionner un dashboard **sans** `allowUiUpdates: false` (ni `disableDeletion: true`) laisse l'UI le modifier/supprimer par-dessus le fichier. Résultat : drift silencieux, le `.json` de Git ne reflète plus la réalité. Le versioning n'a de valeur que si l'UI est **verrouillée en écriture**.

### PIÈGE #3 — un `uid` instable (régénéré à chaque export)

Si le `uid` change à chaque export (ou reste vide), Grafana crée un **nouveau** dashboard au lieu de mettre à jour l'ancien → doublons, liens morts, alertes pointant vers un `d/<uid>` disparu. Le `uid` doit être **fixé à la main et stable** ; c'est l'identité du dashboard, pas le titre.

### PIÈGE #4 — datasource en dur dans le JSON

Coder `"datasource": "Prometheus"` (nom d'instance) dans un panel casse la portabilité : en staging la datasource s'appelle autrement, le dashboard affiche *No data*. Utilise une **variable de datasource** (`${DS_PROMETHEUS}`) résolue par le provisioning.

### PIÈGE #5 — versionner sans tester (`check` ≠ `test`)

`promtool check rules` valide la **syntaxe**, pas la **logique**. Une alerte syntaxiquement correcte mais au mauvais seuil (l'Exemple 2) passe `check` et ne fire jamais. Il faut **aussi** `promtool test rules` avec des séries simulées pour vérifier le comportement. Versionner une alerte non testée, c'est verrouiller un bug.

### PIÈGE #6 — committer un token / secret dans la config

Un token Grafana dans le `provider "grafana"`, un mot de passe de datasource en clair dans `datasources.yaml` : dès le premier `git push`, le secret est dans l'historique **pour toujours**. Les secrets passent par variables d'environnement / `secureJsonData` / secret manager, jamais dans un fichier versionné.

### PIÈGE #7 — croire que « generate from code » est obligatoire

Générer des dashboards en TypeScript/jsonnet est utile pour N services quasi identiques, mais ce n'est **pas** le prérequis de l'Observability as Code. Exporter un `.json` construit à la souris et le committer suffit à sortir du clickops. Commence simple ; génère quand la duplication le justifie.

---

## 5. Ancrage TribuZen

Tout ce que les modules précédents ont construit dans des UI (dashboards du module 07, alertes burn-rate du module 09, SLO du module 08) **descend dans le repo** `smaurier/tribuzen`, à côté du code qu'il observe — principe *shift-left* : quand un dev ajoute l'endpoint `/api/events/:id/rsvp`, il ajoute **dans la même PR** le panel et l'alerte.

Emplacement cible :

```
tribuzen/
  config/
    grafana/
      provisioning/
        datasources/datasources.yaml     ← Prometheus, editable: false
        dashboards/dashboards.yaml        ← provider, allowUiUpdates: false, disableDeletion: true
      dashboards/
        api-rsvp.json                     ← dashboard exporté & versionné (Exemple 1)
        api-overview.json
    prometheus/
      prometheus.yml                      ← rule_files: ['rules/*.yml']
      rules/
        slo-burn.yml                      ← recording + alertes burn-rate (module 09)
      tests/
        slo-burn_test.yml                 ← promtool test rules (CI)
  .github/workflows/observability.yml     ← validate (promtool check + test) sur chaque PR
```

Ce que ça change concrètement pour TribuZen :

| Avant (clickops) | Après (as code) |
|------------------|-----------------|
| dashboard supprimé = perdu | `git revert` → restauré en secondes |
| seuil d'alerte changé sans trace | PR + revue + `promtool test rules` bloquant |
| « ça marchait en prod, pas en staging » | même fichier, datasource par variable |
| nouveau service = tout recliquer | copier un `.json`, adapter le `job`, PR |

Le dashboard « API — vue RSVP » du cas concret est maintenant `config/grafana/dashboards/api-rsvp.json` : verrouillé, revu, restaurable. L'incident de mardi 23h ne peut plus se reproduire.

> Le pipeline CI/CD complet (GitHub Actions : jobs *validate* puis *deploy*) et les métriques DORA qui mesurent la vélocité de ces déploiements relèvent du **module 20**. Ici, on a garanti que dashboards et alertes **vivent dans Git, sont revus et sont testés**.

---

## 6. Points clés

1. **Clickops** = configurer à la souris, sans historique ni revue → perte, drift, irreproductibilité. Si ça n'est pas dans Git, ça n'existe pas.
2. Grafana **provisionne par fichiers** : `datasources/*.yaml` (sources) et `dashboards/*.yaml` (**providers** `type: file` pointant vers `options.path`) — le provider n'est pas le dashboard.
3. Un dashboard = un **`.json`** (JSON model) versionné ; `uid` **stable** = identité ; datasource **par variable**, pas en dur.
4. Règles Prometheus = **rules files** YAML chargés par `rule_files` ; `record`/`expr` (recording) et `alert`/`expr`/`for`/`labels`/`annotations` (alerting).
5. **`promtool check rules`** (syntaxe) **et** **`promtool test rules`** (comportement sur séries simulées, notation `0+20x10`) → en CI, bloquent une PR cassée. `check` ≠ `test`.
6. **Anti-drift** : `allowUiUpdates: false` + `disableDeletion: true` (dashboards) + `editable: false` (datasource) → l'UI n'écrit plus par-dessus le code.
7. **GitOps** : PR → CI valide/teste → revue → merge → déploiement (fichiers montés + reload, ou **Grafana Terraform provider** `config_json = file(...)`).
8. **Revue de dashboard** : `uid` stable, datasource variable, PromQL correcte, seuils justifiés, runbook, aucun secret.
9. **Jamais** de token/mot de passe dans un fichier versionné (variables/secret manager).

---

## 7. Seeds Anki

```
Qu'est-ce que le clickops et pourquoi le fuir en observabilité ?|Configurer dashboards/alertes/datasources à la souris dans l'UI, sans versioning. Problèmes : pas d'historique (qui/quand/pourquoi), pas de revue, pas de reproductibilité (Grafana tombe = tout à refaire), drift silencieux. Règle : si ça n'est pas dans Git, ça n'existe pas.
Dans le provisioning Grafana, quelle est la différence entre le fichier provider de dashboards et un dashboard ?|Le provider (dashboards/*.yaml, type: file) ne contient AUCUN panel : il dit à Grafana OÙ lire les .json (options.path). Le dashboard lui-même est un fichier .json séparé déposé dans ce path. Mettre le JSON du dashboard dans le provider ne charge rien.
Quels réglages verrouillent Grafana contre le drift ?|allowUiUpdates: false (l'UI ne peut pas persister une modif d'un dashboard provisionné) + disableDeletion: true (l'UI ne peut pas le supprimer) sur le provider ; editable: false sur la datasource. Sans eux, l'UI écrit par-dessus le fichier et le Git ne reflète plus la réalité.
Pourquoi le uid d'un dashboard exporté doit-il être stable ?|Le uid (pas le titre) identifie le dashboard entre déploiements. S'il change ou est vide à chaque export, Grafana crée un NOUVEAU dashboard au lieu de mettre à jour l'ancien -> doublons, liens d/<uid> morts, alertes cassées. On fixe le uid à la main. On met aussi id: null pour la portabilité.
promtool check rules vs promtool test rules ?|check rules = validation de SYNTAXE d'un rules file (à mettre en CI). test rules = tests unitaires du COMPORTEMENT : on simule des séries (input_series, notation 0+20x10) et on vérifie qu'une alerte fire ou non à un eval_time donné. check passe même si le seuil est faux ; il FAUT test rules pour attraper une alerte qui ne fire plus.
Comment sont chargées les règles Prometheus versionnées ?|Via rule_files dans prometheus.yml (ex: rule_files: ['rules/*.yml']). Chaque fichier = groups -> name/interval/rules, chaque règle étant recording (record + expr) ou alerting (alert + expr + for + labels + annotations). Les fichiers vivent dans le repo, à côté du service observé.
À quoi sert le Grafana Terraform provider et où reste la source de vérité ?|Provider grafana/grafana : déploie dashboards/dossiers via l'API Grafana (utile pour Grafana Cloud/multi-instances). resource grafana_dashboard avec config_json = file(\"...json\") -> le .json versionné reste la source de vérité, Terraform ne fait que le pousser. Le token d'auth passe par une variable/secret, jamais commité.
Que revoit-on dans une PR de dashboard ?|uid stable et unique ; datasource par variable (${DS_PROMETHEUS}) pas en dur ; PromQL correcte (rate sur counters, le dans le sum by d'un histogram_quantile) ; seuils justifiés ; runbook_url sur chaque alerte ; aucun secret ; diff lisible (JSON à clés stables). Un dashboard se revoit comme du code.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-13-observability-as-code/README.md`. Sortir un dashboard TribuZen du clickops et le provisionner **par fichiers** dans un vrai Grafana (docker-compose fourni), verrouiller le drift (`allowUiUpdates: false`), versionner une règle Prometheus et la **tester** avec `promtool test rules` — grille de revue, coach en session, variante J+30 (Terraform provider).

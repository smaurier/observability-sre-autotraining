---
titre: "Stratégies d'alerting (burn-rate & Alertmanager)"
cours: 16-observability-sre
notions: ["alerter sur symptômes pas causes", "alerting rule Prometheus (alert/expr/for/keep_firing_for)", "annotations & templating ($value / $labels)", "recording rules pour l'alerting", "burn rate & error budget", "multi-window multi-burn-rate (SRE workbook)", "Alertmanager routing", "grouping (group_by / group_wait / repeat_interval)", "silences", "inhibition (inhibit_rules)", "fatigue d'alerte", "alertes actionnables & runbook", "sévérité page vs ticket", "on-call"]
outcomes:
  - sait distinguer une alerte sur symptôme (SLO/utilisateur) d'une alerte sur cause (CPU/mémoire) et privilégier la première
  - sait écrire une alerting rule Prometheus complète (expr, for, keep_firing_for, labels, annotations avec templating)
  - sait implémenter une alerte multi-window multi-burn-rate selon les seuils du SRE workbook
  - sait configurer Alertmanager (routing par sévérité, grouping, inhibition, silences)
  - sait diagnostiquer et combattre la fatigue d'alerte (alertes actionnables, runbook, budget de pages)
prerequis: ["modules 00-08 du cours", "module 08 — SLI/SLO/SLA & error budget (indispensable)", "module 02 — Prometheus & PromQL (rate, sum, recording rules)"]
next: 10-incidents-et-postmortems
libs: []
tribuzen: alerting de production TribuZen — règles burn-rate sur le SLO disponibilité de l'API, routing Alertmanager (page vers l'astreinte, ticket vers Slack), runbooks des alertes RSVP/login
last-reviewed: 2026-07
---

# Stratégies d'alerting (burn-rate & Alertmanager)

> **Outcomes — tu sauras FAIRE :** distinguer alerte sur symptôme vs sur cause, écrire une alerting rule Prometheus complète, implémenter une alerte multi-window multi-burn-rate (SRE workbook), configurer Alertmanager (routing/grouping/inhibition/silences), et combattre la fatigue d'alerte.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module s'appuie sur le **module 08 (SLI/SLO/error budget)** — on suppose acquis qu'un SLO disponibilité est défini pour l'API TribuZen. On construit ici les **alertes** au-dessus de ces SLO. La **gestion de l'incident déclenché** (rôles, timeline, postmortem blameless) est le **module 10**. Les **métriques et PromQL de base** (counter, `rate`, `sum by`, recording rules) viennent du **module 02**. On ne recouvre pas Grafana (module 07).

## 1. Cas concret d'abord

Deux nuits chez TribuZen, deux échecs opposés de l'alerting.

**Nuit A — le réveil inutile.** À 2h47, l'astreinte est réveillée par un SMS : `CPU usage > 80% on api-2`. L'ingénieur se connecte, groggy… et tout va bien : les utilisateurs dorment, le RSVP répond en 90 ms, aucune erreur. Le CPU était élevé parce qu'un job d'envoi d'e-mails d'invitation tournait — comportement **normal**. L'alerte a coûté une nuit pour **rien**.

**Nuit B — le vrai incident manqué.** À 3h10, la base de données de TribuZen ralentit. `POST /api/events/:id/rsvp` renvoie 15 % de 500. Mais aucune page ne part : le seuil configuré était `error_rate > 20%`, jamais franchi. Au réveil, le canal `#alerts` contient **214 notifications** de la nuit (CPU, disque, latence réseau, redémarrages de pods…) que personne ne lit plus depuis des semaines. L'incident RSVP est découvert par un **parent sur Twitter**, pas par le monitoring.

Ces deux nuits illustrent le même problème : **on alerte sur les mauvaises choses, trop, et sans lien avec la douleur réelle des utilisateurs**. La nuit A alerte sur une **cause** (CPU) qui n'impacte personne. La nuit B **noie** le seul signal utile sous le bruit, et son seuil binaire ne capte pas une dégradation progressive.

À la fin de ce module, TribuZen aura :

```
Symptôme utilisateur  →  SLO (dispo /rsvp 99.9%)  →  burn-rate multi-fenêtres  →  page actionnable
     (module 08)              (module 08)                  (ce module)               (astreinte)
```

Une seule règle bien conçue, qui se déclenche **quand et seulement quand** l'error budget se consume anormalement vite — et un Alertmanager qui route la page vers l'astreinte, groupe le reste, et tait le bruit. On construit chaque brique.

---

## 2. Théorie complète, concise

### 2.1 Alerter sur les symptômes, pas sur les causes

Le principe fondateur (Google SRE, *Monitoring Distributed Systems*) : **une page doit signaler un symptôme ressenti par l'utilisateur, urgent et actionnable.** Pas une cause interne.

| Type | Exemple d'alerte | Problème |
|------|------------------|----------|
| **Cause** (à éviter en page) | `CPU > 80%`, `mémoire > 90%`, `disque à 85%`, `pod redémarré` | Souvent sans impact ; bruyant ; « normal » la moitié du temps |
| **Symptôme** (à privilégier) | `le RSVP échoue pour X% des parents`, `la latence dépasse le SLO`, `le SLO de dispo brûle son budget` | Corrèle à la douleur réelle ; actionnable |

Une alerte sur cause n'est légitime que si elle est **prédictive et actionnable** (ex. `disque plein dans 4h` → agir avant la panne). Le CPU élevé, lui, n'est un problème que **s'il produit un symptôme** (latence, erreurs) — et dans ce cas, alerte sur le symptôme directement.

C'est pourquoi l'alerting moderne s'ancre sur les **SLO** (module 08) : le SLO *est* la définition mesurable du « l'utilisateur souffre ».

### 2.2 Anatomie d'une alerting rule Prometheus

Source : docs Prometheus, *Alerting rules*. Une alerte vit dans un fichier de règles chargé par `rule_files:` (le même mécanisme que les recording rules du module 02).

```yaml
groups:
  - name: tribuzen-api
    rules:
      - alert: HighRequestLatency
        expr: job:request_latency_seconds:mean5m{job="tribuzen-api"} > 0.5
        for: 10m              # la condition doit tenir 10 min AVANT de "firing"
        keep_firing_for: 5m   # reste firing 5 min APRÈS que la condition retombe
        labels:
          severity: page      # label consommé par Alertmanager pour le routing
        annotations:
          summary: "Latence élevée sur {{ $labels.job }}"
          description: "p-moyenne à {{ $value }}s (seuil 0.5s)"
          runbook_url: "https://wiki.tribuzen/runbooks/high-latency"
```

Les champs (tous vérifiés docs) :

- **`alert`** : nom de l'alerte.
- **`expr`** : expression PromQL. Tant qu'elle **retourne au moins une série**, l'alerte est « active » (`pending` puis `firing`).
- **`for`** : durée pendant laquelle `expr` doit rester vraie **avant** de passer `firing`. Absorbe les pics transitoires. Sans `for`, l'alerte firing dès la première évaluation vraie.
- **`keep_firing_for`** : maintient `firing` un moment **après** que la condition retombe — évite le battement (flapping) d'une alerte qui s'allume/s'éteint.
- **`labels`** : labels **ajoutés** à l'alerte (typiquement `severity`) — ce sont eux qu'Alertmanager utilise pour router.
- **`annotations`** : texte humain (résumé, description, lien runbook). Non utilisées pour le routing.

**Templating** : dans `annotations` et `labels`, <code v-pre>{{ $value }}</code> (inline code — voir docs) rend la valeur évaluée de l'alerte, et <code v-pre>{{ $labels.&lt;nom&gt; }}</code> rend un label de la série. C'est ce qui rend un message d'alerte concret (« p99 à 3.2s sur /rsvp ») plutôt que générique.

> **Recording rules & alerting.** Une bonne pratique (module 02) : pré-calculer les ratios coûteux dans des **recording rules** (`record:`), puis écrire des `expr` d'alerte courtes qui **lisent** ces séries. Indispensable pour le multi-window (§2.5) : on ne veut pas répéter un `sum(rate(...))/sum(rate(...))` sur 5 fenêtres dans chaque alerte.

### 2.3 Le burn rate — vitesse de consommation de l'error budget

Rappel module 08 : un SLO de 99.9 % sur 30 jours autorise **0.1 % d'erreurs** — c'est l'**error budget**. Le **burn rate** mesure *à quelle vitesse* on le consomme, relativement au rythme « pile dans le budget ».

> **Note fenêtre 28j vs 30j :** nos SLO TribuZen sont calés sur une fenêtre de **28 jours** (module 08, alignée sur 4 semaines). Le SRE workbook, lui, calibre ses seuils **14.4×/6×** sur une fenêtre de **30 jours** ; l'écart (28 vs 30 j) est assez faible pour **réutiliser tels quels** ces seuils sans les recalculer — on garde les valeurs du workbook ci-dessous.

```
burn_rate = taux_d_erreur_observé / error_budget
          = taux_d_erreur_observé / (1 - SLO)
```

Un burn rate de **1** = on consomme le budget exactement au rythme prévu (épuisé pile à la fin des 30 jours). Un burn rate de **10** = on l'épuise 10× plus vite (en 3 jours).

Table de référence — **SLO 99.9 % sur 30 jours** (`error_budget = 0.1 %`) :

| Burn rate | Taux d'erreur | Budget épuisé en | Réaction |
|-----------|---------------|------------------|----------|
| 1× | 0.1 % | 30 jours | rien (au budget) |
| 2× | 0.2 % | 15 jours | surveiller |
| 10× | 1 % | 3 jours | **ticket** |
| 14.4× | 1.44 % | ~2 jours | **page** |
| 36× | 3.6 % | ~20 h | page urgente |
| 720× | 72 % | 1 h | page immédiate |

L'intérêt : un **seul seuil binaire** (« error_rate > 20 % ») rate à la fois la dégradation lente (nuit B) et sur-alerte sur les micro-pics. Le burn rate transforme le SLO en une **échelle de gravité continue**.

### 2.4 Multi-window multi-burn-rate (SRE workbook)

Une **seule** fenêtre de mesure ne peut pas tout faire (source : Google SRE Workbook, *Alerting on SLOs*) :

- **Fenêtre courte** (5 min) seule → réactive mais **bruyante** : un pic bref de 30 s déclenche une page inutile.
- **Fenêtre longue** (24 h) seule → stable mais **lente** : un incident grave brûle des heures de budget avant de pager, et l'alerte **reste allumée des heures** après résolution (reset lent).

La solution du workbook : **deux fenêtres par alerte**, combinées en `and` :

1. **Fenêtre longue** — détecte la tendance (le budget brûle vraiment) ;
2. **Fenêtre courte** — confirme que **c'est encore en cours** maintenant.

L'alerte ne firing que si le burn rate dépasse le seuil **dans les deux fenêtres**. Bénéfice clé : dès que les erreurs cessent, la fenêtre courte retombe et l'alerte **s'éteint en ~5 min** au lieu de traîner.

**Les trois niveaux recommandés** (vérifiés SRE workbook, pour une fenêtre SLO de 30 jours) :

| Sévérité | Fenêtre longue | Fenêtre courte | Burn rate | Budget consommé |
|----------|----------------|----------------|-----------|-----------------|
| **page** | 1 h | 5 min | **14.4×** | 2 % en 1 h |
| **page** | 6 h | 30 min | **6×** | 5 % en 6 h |
| **ticket** | 3 jours | 6 h | **1×** | 10 % en 3 j |

Lecture : le premier niveau **page** attrape les incidents rapides (2 % du budget mensuel cramé en 1 h → grave) ; le troisième niveau **ticket** attrape la fuite lente qui, sur 3 jours, finit par manger 10 % du budget sans jamais franchir un seuil binaire. Ensemble, ils couvrent tout le spectre de la nuit A à la nuit B.

### 2.5 Écrire l'alerte burn-rate en PromQL

On calcule le **taux d'erreur** (le SLI « mauvais ») par fenêtre dans des recording rules, puis on compare au seuil `burn_rate × error_budget`.

```yaml
# rules/slo-burn.yml
groups:
  - name: tribuzen-slo-recording
    rules:
      # Taux d'erreur (proportion de 5xx) par fenêtre — une série chacune.
      - record: job:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="tribuzen-api"}[5m]))
      - record: job:slo_errors:ratio_rate1h
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[1h]))
          /
          sum(rate(http_requests_total{job="tribuzen-api"}[1h]))
      - record: job:slo_errors:ratio_rate30m
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[30m]))
          /
          sum(rate(http_requests_total{job="tribuzen-api"}[30m]))
      - record: job:slo_errors:ratio_rate6h
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[6h]))
          /
          sum(rate(http_requests_total{job="tribuzen-api"}[6h]))

  - name: tribuzen-slo-alerts
    rules:
      # SLO 99.9% -> error_budget = 0.001. Seuil page rapide = 14.4 x 0.001.
      - alert: SLOBurnRateFast
        expr: |
          job:slo_errors:ratio_rate1h  > (14.4 * 0.001)
          and
          job:slo_errors:ratio_rate5m  > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 14.4x sur l'API TribuZen"
          description: "Budget d'erreur brûlé 14.4x trop vite — taux 1h à {{ $value }}."
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-fast"
```

Points de vigilance :

- **`rate()`, jamais `irate()`** dans une alerte (module 02) : `irate` n'utilise que 2 points → bruit → pages fantômes.
- **`for` court** (`2m`) sur le niveau rapide : la fenêtre courte de 5 min filtre déjà les pics ; un `for` long **retarderait** la page rapide et annulerait son intérêt. Sur le niveau lent (ticket), un `for` plus long est acceptable.
- Le seuil est écrit `14.4 * 0.001` (burn × error_budget), lisible et modifiable si le SLO change.

### 2.6 Alertmanager — routing, grouping, silences, inhibition

Prometheus **déclenche** les alertes ; **Alertmanager** décide **qui est notifié, comment, groupé, et ce qui est tu**. Source : docs Alertmanager.

**Routing** — un arbre : la `route` racine attrape tout, des `routes` enfants la spécialisent via des `matchers`. La première branche qui matche gagne.

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'slo']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'pagerduty-astreinte'
      matchers: [ severity="page" ]     # syntaxe moderne (match/match_re = DÉPRÉCIÉ)
      repeat_interval: 1h
    - receiver: 'slack-tickets'
      matchers: [ severity="ticket" ]
      repeat_interval: 12h
```

**Grouping** — Alertmanager **agrège** les alertes qui partagent les labels de `group_by` en **une** notification, pour ne pas envoyer 200 SMS lors d'une panne :

- `group_by` : labels qui définissent un groupe (ex. toutes les `page` d'un même `slo` = 1 notif) ;
- `group_wait` : attente avant la **première** notif d'un nouveau groupe (laisse le temps à d'autres alertes de rejoindre) ;
- `group_interval` : délai avant d'envoyer les **nouveautés** d'un groupe déjà notifié ;
- `repeat_interval` : ré-envoi d'un groupe **inchangé** toujours actif (rappel).

**Silences** — mise en sourdine **temporaire** et **manuelle**, par matchers, avec début/fin et commentaire. Créée dans l'UI Alertmanager ou via `amtool` :

```bash
amtool silence add slo=api-availability severity=page \
  --duration=2h \
  --comment="Maintenance BDD planifiée #1234" \
  --author="sylvain"
```

Un silence sert aux **maintenances planifiées** — jamais à taire une alerte « bruyante » (on corrige la règle, pas le symptôme).

**Inhibition** — une alerte en **supprime automatiquement** d'autres. Si le burn-rate rapide (14.4×) firing, inutile de pager *aussi* le lent (1×) sur le même SLO : le rapide **inhibe** le lent.

```yaml
inhibit_rules:
  - source_matchers: [ severity="page" ]
    target_matchers: [ severity="ticket" ]
    equal: ['slo']     # même SLO -> le page tue le ticket redondant
```

`equal` liste les labels qui doivent **coïncider** entre source et cible pour que l'inhibition s'applique.

### 2.7 Fatigue d'alerte, alertes actionnables, on-call

La **fatigue d'alerte** (nuit B) : trop d'alertes non actionnables → l'équipe les ignore → les vraies passent inaperçues. C'est le premier ennemi d'un système de monitoring.

Symptômes : le canal `#alerts` est mute ; les incidents sont trouvés par les clients ; > ~20 alertes/semaine ; des pages « pour information ».

Règles d'hygiène (Google SRE) :

1. **Chaque page est actionnable** — si l'ingénieur ne peut *rien* faire, ce n'est pas une page (au mieux un dashboard).
2. **Chaque page a un runbook** — `runbook_url` en annotation, avec diagnostic + mitigation + escalade.
3. **Symptôme, pas cause** (§2.1) — page sur l'impact utilisateur.
4. **Budget de pages** : viser **≤ 2 pages par rotation d'astreinte**. Au-delà, les seuils sont trop agressifs ou le système est instable.
5. **Revue périodique** : supprimer les alertes jamais actionnées, réajuster les seuils.
6. **Deux sévérités seulement** : `page` (humain réveillé, urgent) vs `ticket` (heures ouvrées). Le reste = dashboard.

**On-call** : une rotation d'astreinte tient si chaque page qu'elle reçoit est *rare, réelle, et guidée par un runbook*. Le design de l'alerting **est** ce qui rend l'astreinte soutenable — ou invivable.

---

## 3. Worked examples

### Exemple 1 — L'alerte multi-window burn-rate de TribuZen, de bout en bout

Objectif : alerter sur le **SLO disponibilité 99.9 %** de l'API TribuZen avec les trois niveaux du SRE workbook, en réutilisant `http_requests_total` (module 02).

```yaml
# config/prometheus/rules/slo-burn.yml
groups:
  # --- Recording rules : un taux d'erreur par fenêtre (lecture O(1) ensuite) ---
  - name: tribuzen-slo-recording
    rules:
      - record: job:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[5m]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[5m]))
      - record: job:slo_errors:ratio_rate30m
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[30m]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[30m]))
      - record: job:slo_errors:ratio_rate1h
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[1h]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[1h]))
      - record: job:slo_errors:ratio_rate6h
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[6h]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[6h]))
      - record: job:slo_errors:ratio_rate3d
        expr: |
          sum(rate(http_requests_total{job="tribuzen-api", status=~"5.."}[3d]))
          / sum(rate(http_requests_total{job="tribuzen-api"}[3d]))

  # --- Alertes : SLO 99.9% -> error_budget = 0.001 ---
  - name: tribuzen-slo-alerts
    rules:
      # PAGE rapide : 14.4x sur 1h, confirmé sur 5m
      - alert: SLOBurnRateFast
        expr: |
          job:slo_errors:ratio_rate1h > (14.4 * 0.001)
          and
          job:slo_errors:ratio_rate5m > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 14.4x — SLO dispo API TribuZen"
          description: "Taux d'erreur 1h à {{ $value }} (>1.44%). Budget mensuel cramé en ~2j."
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-fast"

      # PAGE moyen : 6x sur 6h, confirmé sur 30m
      - alert: SLOBurnRateMedium
        expr: |
          job:slo_errors:ratio_rate6h > (6 * 0.001)
          and
          job:slo_errors:ratio_rate30m > (6 * 0.001)
        for: 5m
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 6x — SLO dispo API TribuZen"
          description: "Dégradation soutenue, taux 6h à {{ $value }}."
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-medium"

      # TICKET lent : 1x sur 3j, confirmé sur 6h
      - alert: SLOBurnRateSlow
        expr: |
          job:slo_errors:ratio_rate3d > (1 * 0.001)
          and
          job:slo_errors:ratio_rate6h > (1 * 0.001)
        for: 15m
        labels:
          severity: ticket
          slo: api-availability
        annotations:
          summary: "Burn-rate 1x soutenu — budget en danger"
          description: "Fuite lente : taux 3j à {{ $value }}. Investiguer en heures ouvrées."
          runbook_url: "https://wiki.tribuzen/runbooks/slo-burn-slow"
```

Ce qu'il faut retenir de la structure : **5 recording rules** (une par fenêtre utilisée) partagées, **3 alertes** qui ne font que comparer à un seuil. Chaque alerte combine sa fenêtre longue (tendance) et sa fenêtre courte (encore actif) par `and`.

### Exemple 2 — Alertmanager pour ces alertes

Objectif : router les `page` vers l'astreinte (PagerDuty), les `ticket` vers Slack ; grouper par SLO ; faire inhiber le lent par le rapide ; prévoir un silence de maintenance.

```yaml
# config/alertmanager/alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'slo']   # 1 notif par (alerte, SLO), pas 1 par instance
  group_wait: 30s                  # laisse arriver les alertes corrélées avant d'envoyer
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'pagerduty-astreinte'
      matchers: [ severity="page" ]
      repeat_interval: 1h          # rappel toutes les heures tant que ça brûle
    - receiver: 'slack-tickets'
      matchers: [ severity="ticket" ]
      repeat_interval: 12h

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts-divers'

  - name: 'pagerduty-astreinte'
    pagerduty_configs:
      - routing_key: '<CLE_PAGERDUTY>'

  - name: 'slack-tickets'
    slack_configs:
      - channel: '#alerts-tickets'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'

# Le page rapide rend le ticket lent redondant sur le MÊME slo -> on l'inhibe.
inhibit_rules:
  - source_matchers: [ severity="page" ]
    target_matchers: [ severity="ticket" ]
    equal: ['slo']
```

Et le silence de maintenance BDD (à poser **avant** l'opération, via `amtool`) :

```bash
amtool silence add slo=api-availability \
  --duration=2h \
  --comment="Migration BDD planifiée, ticket #1234" \
  --author="sylvain"
```

**Pourquoi c'est correct :**
- `group_by: [alertname, slo]` → si `/rsvp` génère 500 partout, l'astreinte reçoit **une** page, pas cent.
- L'inhibition évite le double-signal : quand `SLOBurnRateFast` (page) brûle, `SLOBurnRateSlow` (ticket) sur le même `slo` est **automatiquement tu** — l'astreinte gère déjà l'incident.
- Le silence est **borné dans le temps** et **commenté** : traçable, il ne masque rien après la fenêtre de maintenance.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Alerter sur la cause (CPU/mémoire) plutôt que le symptôme

`CPU > 80%` réveille l'astreinte quand tout va bien (nuit A). Le CPU élevé n'est un problème *que* s'il produit un symptôme (latence, erreurs) — alors alerte sur le symptôme. Garde les métriques de cause pour le **dashboard de diagnostic**, pas pour la page.

### PIÈGE #2 — Une seule fenêtre de burn rate

Fenêtre courte seule → pages sur des pics de 30 s (faux positifs). Fenêtre longue seule → détection lente **et** reset lent (l'alerte traîne des heures après résolution). Le multi-window (`long and short`) est ce qui donne à la fois **précision** et **reset rapide**. Ne choisis jamais une seule fenêtre pour un SLO.

### PIÈGE #3 — Seuil binaire au lieu du burn rate

`error_rate > 20%` rate la dégradation lente (5 % d'erreurs pendant 3 jours ne franchit jamais 20 %, mais crame tout le budget) **et** sur-alerte sur un micro-pic à 25 % pendant 10 s. Le burn rate rapporte le taux d'erreur à l'**error budget**, pas à un chiffre magique.

### PIÈGE #4 — `irate()` dans une alerte

`irate` n'utilise que les 2 derniers points → hypersensible au bruit et à l'irrégularité du scrape → pages fantômes à 3h du matin. **Toujours `rate()`** dans une règle d'alerte (rappel module 02).

### PIÈGE #5 — `for` trop long sur le niveau rapide

Mettre `for: 30m` sur l'alerte 14.4× **annule** sa réactivité : la fenêtre courte de 5 min filtre déjà les pics, un `for` long ne fait que **retarder la page** d'un incident grave. `for` court (`2m`) sur le rapide, plus long sur le lent.

### PIÈGE #6 — Silence pour cacher une alerte bruyante

Silencer une alerte « qui sonne trop » masque un vrai problème (ou une mauvaise règle). Le silence est **uniquement** pour les maintenances planifiées, borné et commenté. Une alerte bruyante se **corrige** (seuil, symptôme vs cause), elle ne se tait pas.

### PIÈGE #7 — Inhibition mal configurée (`equal` oublié)

Sans `equal`, une `page` sur le SLO *dispo* inhiberait les `ticket` de **tous** les SLO, y compris latence — on masque de vrais problèmes. `equal: ['slo']` garantit que l'inhibition ne joue qu'entre alertes du **même** SLO.

### PIÈGE #8 — Une page sans runbook

Une page sans `runbook_url` réveille quelqu'un qui ne sait pas quoi faire → panique, escalade, temps perdu. Règle : **pas de runbook, pas de page**. L'annotation runbook est aussi obligatoire que l'`expr`.

---

## 5. Ancrage TribuZen

L'alerting de production de TribuZen repose entièrement sur le SLO disponibilité défini au module 08 et l'instrumentation `http_requests_total` du module 02.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  ops/
    prometheus/
      prometheus.yml                    ← rule_files: ['rules/*.yml'] + alerting: alertmanagers
      rules/
        slo-burn.yml                    ← Exemple 1 : recording + 3 alertes burn-rate
    alertmanager/
      alertmanager.yml                  ← Exemple 2 : routing page/ticket, grouping, inhibition
  docs/
    runbooks/
      slo-burn-fast.md                  ← diagnostic /rsvp + login, mitigation, escalade
      slo-burn-medium.md
      slo-burn-slow.md
```

Décisions d'alerting propres à TribuZen :

| Alerte | Sévérité | Route | Runbook |
|--------|----------|-------|---------|
| `SLOBurnRateFast` (14.4×) | page | PagerDuty astreinte | diagnostic RSVP/login, rollback, circuit-breaker BDD |
| `SLOBurnRateMedium` (6×) | page | PagerDuty astreinte | idem, urgence moindre |
| `SLOBurnRateSlow` (1×) | ticket | Slack `#alerts-tickets` | investigation en heures ouvrées |

Prometheus doit connaître Alertmanager — bloc à ajouter au `prometheus.yml` du cours (module 02) :

```yaml
# ops/prometheus/prometheus.yml (extrait)
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

> La **gestion de l'incident** une fois la page reçue (déclaration, rôles Incident Commander / Scribe, timeline, postmortem blameless) est le **module 10**. Ici, on garantit que la bonne personne est réveillée, au bon moment, avec le bon runbook — et **jamais** pour rien.

---

## 6. Points clés

1. **Symptôme, pas cause** : une page signale une douleur utilisateur (SLO), pas une métrique interne (CPU). Les causes vont au dashboard de diagnostic.
2. Une alerting rule Prometheus = `alert`, `expr`, `for` (absorbe les pics), `keep_firing_for` (anti-flapping), `labels` (routing), `annotations` (humain + runbook).
3. <code v-pre>{{ $value }}</code> et <code v-pre>{{ $labels.x }}</code> (dans les annotations) rendent le message concret ; les recording rules pré-calculent les ratios coûteux.
4. **Burn rate** = taux d'erreur / error budget ; 1× = pile au budget, 14.4× = budget mensuel cramé en ~2 jours.
5. **Multi-window multi-burn-rate** (SRE workbook) : fenêtre longue (tendance) `and` fenêtre courte (encore actif) → précision + reset en ~5 min.
6. Seuils du workbook : **14.4× (1h/5m, page)**, **6× (6h/30m, page)**, **1× (3d/6h, ticket)** pour un SLO 30 jours.
7. Alertmanager : **routing** par `matchers` (severity), **grouping** (`group_by`/`group_wait`/`repeat_interval`) pour ne pas noyer, **silences** (maintenance planifiée uniquement), **inhibition** (`inhibit_rules` + `equal`) pour tuer les redondances.
8. **Fatigue d'alerte** = ennemi n°1 : chaque page actionnable, avec runbook, ≤ 2 pages/rotation, deux sévérités (page/ticket), revue périodique.
9. `rate()` jamais `irate()` en alerte ; `for` court sur le niveau rapide ; silence borné et commenté, jamais pour cacher.

---

## 7. Seeds Anki

```
Pourquoi alerter sur un symptôme plutôt que sur une cause ?|Un symptôme (SLO, erreurs /rsvp, latence) corrèle à la douleur réelle de l'utilisateur et est actionnable. Une cause (CPU>80%, mémoire) est souvent sans impact et bruyante — le CPU élevé n'est un problème QUE s'il produit un symptôme, qu'on alerte alors directement.
Que fait le champ `for` dans une alerting rule Prometheus ?|`for` exige que `expr` reste vraie pendant toute la durée AVANT de passer l'alerte en firing. Il absorbe les pics transitoires. Sans `for`, l'alerte firing dès la première évaluation vraie. `keep_firing_for` fait l'inverse : maintient firing après que la condition retombe (anti-flapping).
Qu'est-ce que le burn rate et comment se calcule-t-il ?|Le burn rate = taux_d_erreur_observé / error_budget (= 1 - SLO). 1× = on consomme le budget pile au rythme prévu (épuisé à la fin de la fenêtre). 14.4× = 14.4 fois plus vite → pour un SLO 99.9%/30j, budget cramé en ~2 jours.
Pourquoi utiliser deux fenêtres (multi-window) pour une alerte burn-rate ?|La fenêtre longue détecte la tendance (le budget brûle vraiment), la fenêtre courte confirme que c'est ENCORE en cours. Combinées en `and` : on évite les faux positifs des pics brefs ET on obtient un reset rapide (~5 min après résolution) au lieu d'une alerte qui traîne des heures.
Quels sont les trois niveaux du SRE workbook pour un SLO sur 30 jours ?|Page 14.4× (fenêtre 1h + 5min, 2% du budget en 1h) ; page 6× (6h + 30min, 5% en 6h) ; ticket 1× (3 jours + 6h, 10% en 3 jours). L'alerte firing si le seuil est dépassé dans les DEUX fenêtres.
À quoi servent group_by et repeat_interval dans Alertmanager ?|group_by agrège en UNE notification les alertes partageant ces labels (évite 200 SMS lors d'une panne). repeat_interval = délai avant de ré-notifier un groupe inchangé toujours actif (rappel). group_wait = attente avant la 1re notif d'un nouveau groupe.
Différence entre un silence et une inhibition dans Alertmanager ?|Un silence est MANUEL et temporaire (matchers + début/fin + commentaire), pour une maintenance planifiée. L'inhibition est AUTOMATIQUE : une alerte source (severity=page) supprime des alertes cibles (severity=ticket) via inhibit_rules, avec `equal` pour n'inhiber qu'entre alertes du même SLO.
Qu'est-ce que la fatigue d'alerte et comment la combattre ?|Trop d'alertes non actionnables → l'équipe les ignore → les vraies passent (incident trouvé par les clients). Remèdes : chaque page actionnable + runbook, alerter sur symptômes, ≤ 2 pages/rotation d'astreinte, deux sévérités (page/ticket), revue périodique des seuils.
Pourquoi ne jamais utiliser irate() ni un `for` long dans une alerte burn-rate rapide ?|irate() n'utilise que 2 points → bruit → pages fantômes ; on utilise rate(). Un `for` long sur le niveau 14.4× annule sa réactivité : la fenêtre courte de 5 min filtre déjà les pics, un `for` long ne fait que retarder la page d'un incident grave.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-09-alerting-strategies/README.md`. Écrire les règles burn-rate multi-window du SLO TribuZen, les charger dans un vrai Prometheus, ajouter un Alertmanager (routing/grouping/inhibition/silence) via le docker-compose fourni, provoquer un burn et observer la page — corrigé complet commenté, coach en session, variante J+30.

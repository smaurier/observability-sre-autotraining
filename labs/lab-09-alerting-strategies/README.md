# Lab 09 — Stratégies d'alerting (burn-rate & Alertmanager)

> **Outcome :** à la fin, tu sais écrire des règles d'alerte **multi-window multi-burn-rate** sur un SLO, les charger dans un **vrai Prometheus**, brancher un **vrai Alertmanager** (routing par sévérité, grouping, inhibition, silence), provoquer un burn et **voir la page partir** — puis constater qu'elle **s'éteint toute seule** après résolution.
> **Vrai outil :** Prometheus + Alertmanager (`prom/prometheus`, `prom/alertmanager`) + la `demo-app` du cours, via les `docker-compose` fournis à la racine du cours. Aucun harnais simulé.
> **Feedback :** le coach valide en session. Tes oracles : l'onglet **Alerts** de Prometheus (`http://localhost:9090/alerts`) et l'UI **Alertmanager** (`http://localhost:9093`).

---

## Énoncé

Tu reprends l'incident de la **nuit B** du module : une dégradation de `demo-app` (l'API qui joue TribuZen) brûle l'error budget du SLO disponibilité, mais aucune alerte ne part et le canal `#alerts` est noyé de bruit. Tu vas corriger ça **pour de bon**.

SLO cible (défini au module 08) : **disponibilité 99.9 %** de l'API → `error_budget = 0.1 %` → seuil page rapide = `14.4 × 0.001`.

Tu dois livrer :

1. **Des recording rules** — le taux d'erreur 5xx par fenêtre (`5m`, `30m`, `1h`, `6h`, `3d`).
2. **Trois alertes burn-rate** multi-window : `page 14.4×`, `page 6×`, `ticket 1×` (seuils du SRE workbook).
3. **Un Alertmanager** : routing `page`→astreinte / `ticket`→tickets, **grouping** par SLO, **inhibition** du ticket lent par la page rapide.
4. **Un silence** de maintenance planifiée (borné + commenté).
5. La **démonstration** : injecter des 5xx, voir `SLOBurnRateFast` passer `pending → firing`, la voir routée et **groupée** dans Alertmanager, le ticket lent **inhibé**, puis l'alerte **se resolve** ~5 min après l'arrêt du chaos.

**Pas de gap-fill** — tu écris les règles et la config complètes à partir des starters ci-dessous.

### Point de départ — ce qui est déjà fourni

- `docker-compose.full.yml` (racine du cours) démarre `demo-app` (:3000), `prometheus` (:9090), `grafana` (:3001).
- `config/prometheus/prometheus.yml` charge déjà `rule_files: ['rules/*.yml']` et scrape le job **`demo-app`**.
- `config/prometheus/rules/` contient déjà des exemples (`slo-rules.yml`, `alerting-rules.yml`) — tu écris **ton** fichier `slo-burn.yml` à côté.
- `demo-app` expose déjà `http_requests_total{method, route, status_code, ...}` sur `/metrics`.

> **Vérifie le nom exact du label de statut** dans `curl localhost:3000/metrics` (`status_code` sur la demo-app). Dans TribuZen, ce sera `status`. Adapte tes `status_code=~"5.."` en conséquence — **ne devine pas le nom du label**.

### Ce que tu dois ajouter toi-même

**(a) Un Alertmanager** — crée `docker-compose.alerting.yml` (racine du cours) en override :

```yaml
# docker-compose.alerting.yml — à écrire
services:
  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - '9093:9093'
    volumes:
      - ./config/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
```

Lancement combiné : `docker compose -f docker-compose.full.yml -f docker-compose.alerting.yml up`.

**(b) Un moyen d'injecter des 5xx** (« teste tes alertes » — bonne pratique du module). La demo-app ne produit pas de 5xx spontanément : ajoute une **route chaos** minimale dans `demo-app/src/index.ts`, juste avant le `errorHandlerMiddleware` :

```ts
// route chaos — À RETIRER après le lab. Renvoie 500 selon ?rate=0..1 (défaut 1).
app.get('/chaos', (req, res) => {
  const rate = Number(req.query.rate ?? 1)
  if (Math.random() < rate) return res.status(500).json({ error: 'chaos' })
  res.json({ ok: true })
})
```

---

## Étapes (en friction)

1. **Démarre la stack** : `docker compose -f docker-compose.full.yml up -d`. Vérifie dans `http://localhost:9090/targets` que `demo-app` est **UP**.
2. **Repère le label de statut** : `curl localhost:3000/metrics | grep http_requests_total`. Note si c'est `status` ou `status_code`.
3. **Écris `config/prometheus/rules/slo-burn.yml`** — 5 recording rules (taux d'erreur 5xx par fenêtre) + 3 alertes burn-rate multi-window (voir corrigé). Utilise `job="demo-app"`.
4. **Recharge Prometheus** sans le tuer : `curl -X POST http://localhost:9090/-/reload` (le flag `--web.enable-lifecycle` est déjà activé dans le compose). Vérifie tes règles dans `http://localhost:9090/rules`.
5. **Écris `config/alertmanager/alertmanager.yml`** — route racine + branches `severity=page` / `severity=ticket`, `group_by: [alertname, slo]`, `inhibit_rules` (page inhibe ticket, `equal: [slo]`).
6. **Branche Prometheus → Alertmanager** : ajoute le bloc `alerting:` au `config/prometheus/prometheus.yml`, puis crée `docker-compose.alerting.yml` et relance : `docker compose -f docker-compose.full.yml -f docker-compose.alerting.yml up -d`.
7. **Ajoute la route chaos** à `demo-app/src/index.ts` et laisse `tsx watch` recharger (ou `docker compose ... up -d --build demo-app`).
8. **Provoque le burn** : martèle `/chaos` pour faire monter le taux 5xx au-dessus de `1.44 %` sur les fenêtres 1h **et** 5m :
   ```bash
   # bruit de fond "sain" + salve d'erreurs
   while true; do curl -s localhost:3000/api/products > /dev/null; curl -s localhost:3000/chaos > /dev/null; sleep 0.2; done
   ```
   (Astuce : la fenêtre `1h` monte lentement. Pour voir firing en quelques minutes en TP, teste d'abord une variante de tes règles avec des fenêtres réduites — ex. `long=5m`, `short=1m` — puis remets les fenêtres du workbook. **Documente que c'est un raccourci de TP**, pas la config de prod.)
9. **Observe** : `http://localhost:9090/alerts` → `SLOBurnRateFast` passe `inactive → pending → firing`. Puis `http://localhost:9093` → l'alerte est **routée** vers le receiver `page`, **groupée** par `(alertname, slo)`, et le `ticket` lent est **inhibé**.
10. **Pose un silence** de maintenance (UI Alertmanager *Silences → New*, ou `amtool`), puis **arrête le chaos** et vérifie que l'alerte **se resolve** en ~5 min (reset de la fenêtre courte).

---

## Corrigé complet commenté

### 1. Règles Prometheus — `config/prometheus/rules/slo-burn.yml`

```yaml
# SLO disponibilité 99.9% de demo-app -> error_budget = 0.001.
# NB: label de statut = status_code sur la demo-app (status dans TribuZen).
groups:
  # --- Recording rules : taux d'erreur 5xx par fenêtre (calcul partagé) ---
  - name: demo-slo-recording
    rules:
      - record: job:slo_errors:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total{job="demo-app"}[5m]))
      - record: job:slo_errors:ratio_rate30m
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[30m]))
          / sum(rate(http_requests_total{job="demo-app"}[30m]))
      - record: job:slo_errors:ratio_rate1h
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[1h]))
          / sum(rate(http_requests_total{job="demo-app"}[1h]))
      - record: job:slo_errors:ratio_rate6h
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[6h]))
          / sum(rate(http_requests_total{job="demo-app"}[6h]))
      - record: job:slo_errors:ratio_rate3d
        expr: |
          sum(rate(http_requests_total{job="demo-app", status_code=~"5.."}[3d]))
          / sum(rate(http_requests_total{job="demo-app"}[3d]))

  # --- Alertes multi-window multi-burn-rate (SRE workbook) ---
  - name: demo-slo-alerts
    rules:
      # PAGE rapide : 14.4x sur 1h, confirmé sur 5m
      - alert: SLOBurnRateFast
        expr: |
          job:slo_errors:ratio_rate1h > (14.4 * 0.001)
          and
          job:slo_errors:ratio_rate5m > (14.4 * 0.001)
        for: 2m                       # court : la fenêtre 5m filtre déjà les pics
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn-rate 14.4x — SLO dispo demo-app"
          description: "Taux 5xx 1h à {{ $value }} (>1.44%). Budget mensuel cramé en ~2j."
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
          summary: "Burn-rate 6x — SLO dispo demo-app"
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

### 2. Branchement Prometheus → Alertmanager — extrait de `config/prometheus/prometheus.yml`

```yaml
# à ajouter au prometheus.yml existant (à la racine, à côté de scrape_configs)
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']   # nom du service docker-compose
```

### 3. Alertmanager — `config/alertmanager/alertmanager.yml`

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'slo']   # 1 notif par (alerte, SLO) — pas 1 par série
  group_wait: 30s                  # laisse les alertes corrélées se regrouper
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'page-astreinte'
      matchers: [ severity="page" ]     # syntaxe moderne (match/match_re = déprécié)
      repeat_interval: 1h
    - receiver: 'ticket-slack'
      matchers: [ severity="ticket" ]
      repeat_interval: 12h

receivers:
  # En prod : pagerduty_configs / slack_configs. En lab, un webhook suffit
  # (l'UI Alertmanager montre le routing/grouping/inhibition sans livraison réelle).
  - name: 'default'
    webhook_configs:
      - url: 'http://host.docker.internal:5001/'
        send_resolved: true
  - name: 'page-astreinte'
    webhook_configs:
      - url: 'http://host.docker.internal:5001/page'
        send_resolved: true
  - name: 'ticket-slack'
    webhook_configs:
      - url: 'http://host.docker.internal:5001/ticket'
        send_resolved: true

# La page rapide rend le ticket lent redondant sur le MÊME slo -> inhibition.
inhibit_rules:
  - source_matchers: [ severity="page" ]
    target_matchers: [ severity="ticket" ]
    equal: ['slo']     # sans equal, une page inhiberait TOUS les tickets (dangereux)
```

### 4. Silence de maintenance — via `amtool` (dans le conteneur) ou l'UI

```bash
# amtool est embarqué dans l'image prom/alertmanager
docker compose exec alertmanager amtool silence add \
  slo=api-availability severity=page \
  --duration=2h \
  --comment="Migration BDD planifiée #1234" \
  --author="sylvain" \
  --alertmanager.url=http://localhost:9093
```

**Pourquoi ce corrigé est correct :**
- **Recording rules partagées** : chaque alerte ne fait qu'une comparaison à un seuil ; on ne recalcule pas 5 fois le même `sum(rate)/sum(rate)`.
- **Multi-window** : chaque alerte combine sa fenêtre longue (tendance) `and` sa fenêtre courte (encore actif) → pas de faux positif sur un pic bref, et **reset en ~5 min** après résolution (c'est la fenêtre courte qui retombe).
- **`for` court sur le rapide** (`2m`) : la fenêtre 5m filtre déjà le bruit ; un `for` long ne ferait que **retarder** la page d'un incident grave.
- **`rate()` partout**, jamais `irate()` : pas de page fantôme due au bruit du scrape.
- **Grouping** `group_by: [alertname, slo]` : une panne massive = **une** page, pas cent.
- **Inhibition** avec `equal: [slo]` : quand `SLOBurnRateFast` (page) brûle, `SLOBurnRateSlow` (ticket) sur le même SLO est **tu automatiquement** — l'astreinte gère déjà. Sans `equal`, l'inhibition déborderait sur les tickets d'autres SLO.
- **Silence borné + commenté** : traçable, ne masque rien après la fenêtre de maintenance.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Symptôme vs cause | alerte sur le SLO (5xx utilisateur) | alerte sur CPU/mémoire de demo-app |
| Multi-window | chaque alerte a fenêtre longue `and` courte | une seule fenêtre |
| Burn rate | seuil = `burn × error_budget` (ex. `14.4 * 0.001`) | seuil binaire arbitraire (`> 20%`) |
| `for` | court (`2m`) sur le rapide, plus long sur le lent | `for` long sur le rapide (page retardée) |
| `rate` vs `irate` | `rate()` partout | `irate()` dans une règle |
| Routing | `page`→astreinte, `ticket`→slack via `matchers` | tout au receiver par défaut |
| Grouping | `group_by: [alertname, slo]`, 1 notif pour N séries | pas de group_by → spam |
| Inhibition | page inhibe ticket, `equal: [slo]` présent | `equal` oublié, ou pas d'inhibition |
| Silence | borné + commenté, pour maintenance | silence pour taire une alerte bruyante |
| Runbook | `runbook_url` sur chaque alerte | page sans runbook |

### Coach — questions de vérification en session

- « Montre `SLOBurnRateFast` en `pending` puis `firing`. Pourquoi `pending` d'abord ? » (attendu : le `for: 2m`)
- « Coupe le chaos. Combien de temps avant `resolved`, et **pourquoi** ? » (attendu : ~5 min, la fenêtre courte retombe)
- « Enlève la fenêtre courte de ton `expr`. Que se passe-t-il sur un pic de 30 s ? » (attendu : faux positif)
- « Ton `SLOBurnRateSlow` n'apparaît pas dans Alertmanager alors qu'il firing dans Prometheus. Normal ? » (attendu : oui, inhibé par la page)
- « Pourquoi `equal: [slo]` dans l'inhibition ? Qu'inhiberais-tu sans ça ? » (attendu : tous les tickets, y compris d'autres SLO)
- « Différence entre poser un silence et supprimer la règle ? Quand fait-on quoi ? »

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reproduis les règles burn-rate **de mémoire, en 30 min**, mais pour un **SLO de latence** cette fois : le SLI « bon » = requêtes servies **sous 300 ms**. Utilise `http_request_duration_seconds_bucket` et le ratio `1 - (bucket{le="0.3"} / count)` comme taux de « mauvais ». (Indice : c'est le complément d'un ratio de buckets, pas un `status=~"5.."`.)
2. Ajoute un **second SLO** (`slo: api-latency`) avec ses propres alertes `page`/`ticket`, et **vérifie que l'inhibition `equal: [slo]` ne mélange pas** les deux SLO (une page dispo ne doit PAS inhiber un ticket latence).
3. Ajoute un **`keep_firing_for: 5m`** sur l'alerte rapide et explique au coach ce que ça change quand le taux oscille autour du seuil (attendu : anti-flapping).

**Critère de réussite :** les deux SLO alertent indépendamment, l'inhibition reste cloisonnée par SLO, et tu sais expliquer pourquoi un SLO de latence ne se mesure pas avec `status=~"5.."`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces artefacts vivent ici :

```
tribuzen/
  ops/
    prometheus/
      prometheus.yml            ← + bloc alerting: alertmanagers
      rules/slo-burn.yml        ← recording + 3 alertes burn-rate
    alertmanager/
      alertmanager.yml          ← routing page/ticket, grouping, inhibition
  docs/
    runbooks/
      slo-burn-fast.md          ← diagnostic RSVP/login, rollback, circuit-breaker BDD
```

**Différences avec le lab :**
- Le job devient `tribuzen-api` et le label de statut `status` (pas `status_code`).
- Les receivers `webhook` de test deviennent de vrais `pagerduty_configs` (astreinte) et `slack_configs` (`#alerts-tickets`).
- La route chaos **n'existe pas** en prod : on teste les alertes via un environnement de staging ou un game-day (module 12), pas en injectant des 500 en production.
- Chaque `runbook_url` pointe vers un vrai runbook versionné dans `docs/runbooks/`.

**Commit cible :**
```
feat(alerting): SLO burn-rate multi-window + Alertmanager (routing/grouping/inhibition)
```

---
titre: Projet final — la stack d'observabilité complète de TribuZen
cours: 16-observability-sre
notions:
  - "assemblage des 3 piliers (logs, métriques, traces)"
  - "corrélation par traceId entre logs, métriques et traces"
  - "dashboard RED de bout en bout"
  - "SLO + error budget + alerte burn-rate multi-fenêtres"
  - "incident joué et postmortem blameless"
  - "production readiness d'un service observé"
outcomes:
  - sait assembler logs structurés, métriques Prometheus et traces OTel dans une seule stack cohérente
  - sait relier un dashboard RED, un SLO et une alerte burn-rate à la même série de métriques
  - sait jouer un incident de bout en bout et en tirer un postmortem blameless actionnable
  - sait dérouler une checklist de production readiness sur un service TribuZen
prerequis: ["ensemble des modules 00 à 20 du cours 16-observability-sre"]
next: fin-parcours-16-observability-sre
libs: []
tribuzen: stack d'observabilité complète de TribuZen — API instrumentée, Prometheus/Grafana, OTel/Jaeger, SLO, burn-rate, incident joué et postmortem
last-reviewed: 2026-07
---

# Projet final — la stack d'observabilité complète de TribuZen

> **Outcomes — tu sauras FAIRE :** assembler les 3 piliers (logs + métriques + traces) en une stack cohérente, relier un dashboard RED, un SLO et une alerte burn-rate à la même métrique, jouer un incident de bout en bout et en écrire le postmortem, dérouler une checklist de production readiness.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module est le **capstone** du cours. Il **n'introduit aucune notion neuve** — il assemble ce que les modules 00 à 20 ont posé brique par brique. Si un concept ci-dessous te semble flou (PromQL, `histogram_quantile`, burn-rate, span, error budget), c'est le signal de rouvrir le module source **avant** de monter la stack, pas de deviner.

## 1. Cas concret d'abord

Vendredi 18 h. TribuZen part en soirée : les familles organisent leurs week-ends, le trafic sur `/rsvp` triple. À 18 h 12, un premier parent écrit dans le support : « impossible de confirmer, ça tourne ». À 18 h 15, trois autres. Personne dans l'équipe ne sait encore : **est-ce lent, ou est-ce cassé ? sur quel endpoint ? depuis quand ? combien d'utilisateurs touchés ?**

C'est exactement la situation que ce cours t'a appris à ne **plus** subir. Un service correctement observé répond à ces questions en moins de deux minutes, sans SSH sur le serveur, sans ajouter un `console.log` en catastrophe :

- **le dashboard RED** (module 07) montre d'un coup d'œil que le débit de `/rsvp` est normal mais que son **p99 latence** est passé de 120 ms à 3,4 s ;
- **l'alerte burn-rate** (module 09) a déjà *paged* l'astreinte à 18 h 09 — avant même le premier ticket support — parce que l'**error budget** du SLO latence (module 08) brûle 14,4× trop vite ;
- **une trace Jaeger** (modules 04-05) d'une requête `/rsvp` lente montre que 3,2 s des 3,4 s sont passées dans un span `SELECT` sur la base — pas dans le code applicatif ;
- **les logs structurés** (module 01) filtrés sur le `traceId` de cette trace donnent la requête SQL exacte et le `familyId` concerné.

En trois minutes, le diagnostic est posé : *pas un bug de code, une requête N+1 sur le feed famille qui sature le pool de connexions sous charge*. Le reste (mitigation, communication, postmortem) suit un processus rodé.

**Ce module te fait monter cette stack complète pour TribuZen**, de l'instrumentation de l'API jusqu'au postmortem, en réutilisant les `docker-compose` fournis à la racine du cours. Rien de neuf : tout a été vu. On assemble.

---

## 2. Théorie complète, concise

Aucune notion nouvelle ici — une **carte de montage**. Elle relie chaque brique du cours à sa place dans la stack, et surtout aux **jointures** qui font qu'un ensemble de briques devient un système observable.

### 2.1 Les trois piliers et leur point de couture : le `traceId`

Les trois piliers ne valent que **corrélés**. Le fil qui les coud est un identifiant unique par requête, propagé partout.

| Pilier | Répond à la question | Outil TribuZen | Module |
|--------|----------------------|----------------|--------|
| **Logs** structurés JSON | « que s'est-il passé, précisément, pour *cette* requête ? » | Pino | 01 |
| **Métriques** | « quelle est la *forme* du système dans le temps ? » | prom-client + Prometheus | 02, 03 |
| **Traces** | « où le temps est-il passé, à travers quels services ? » | OpenTelemetry + Jaeger | 04, 05 |

La couture : chaque log porte le `traceId` de la requête (`logger.child({ traceId })`), chaque métrique d'erreur peut exposer un **exemplar** pointant vers une trace, et la trace agrège tous les spans d'un même parcours. Partir d'un symptôme (métrique) → sauter à une trace → filtrer les logs sur son `traceId` : c'est le **workflow de debug** que toute la stack sert à rendre possible.

### 2.2 De la métrique brute au signal actionnable : la chaîne RED → SLO → alerte

C'est la colonne vertébrale du capstone. **Une seule et même métrique** (`http_request_duration_seconds` et `http_requests_total`) alimente trois usages en cascade :

```
http_requests_total / http_request_duration_seconds   (module 02, l'instrumentation)
        │
        ├─►  RED dashboard          (module 07) — Rate, Errors, Duration, visualisés
        │
        ├─►  SLI/SLO + error budget (module 08) — « 99,9% des /rsvp < 500 ms sur 30j »
        │
        └─►  alerte burn-rate       (module 09) — page si le budget brûle 14,4× trop vite
```

La leçon d'assemblage : **on n'invente pas de métrique par usage**. On instrumente *une fois*, proprement (labels à faible cardinalité, routes templatisées), puis dashboard, SLO et alerte se branchent tous sur ces mêmes séries. Si tu te retrouves à créer une métrique dédiée à l'alerte, c'est un signal de conception à revoir.

### 2.3 L'architecture de collecte de la stack

Les `docker-compose` fournis matérialisent le flux. L'API **expose** (pull métriques) et **pousse** (OTLP traces) ; les backends collectent.

```
                 GET /metrics  (pull, 15s)
  API TribuZen ─────────────────────────►  Prometheus ──► Grafana (RED, SLO, budget)
       │                                        │
       │  OTLP :4318  (push traces)             └──► Alertmanager (burn-rate → astreinte)
       └──────────────────────────►  OTel Collector ──► Jaeger (waterfall de spans)
```

- `docker-compose.base.yml` : Prometheus + Grafana (le socle métriques/dashboards) ;
- `docker-compose.tracing.yml` : OTel Collector + Jaeger (le pilier traces) ;
- `docker-compose.full.yml` : l'ensemble + l'API `demo-app` instrumentée.

Prometheus **scrape** (il va chercher) ; l'API **ne pousse pas** ses métriques. Les traces, elles, sont **poussées** en OTLP vers le collector. Confondre les deux modèles est l'erreur d'intégration n°1 (§4).

### 2.4 SLO, error budget, burn-rate — le rappel qui pilote l'alerte

Un **SLO** est une cible sur un **SLI** (ex. « 99,9% des requêtes non-5xx sur 30 jours »). Le complément `1 − 99,9% = 0,1%` est l'**error budget** : le droit à l'erreur. Le **burn-rate** est la vitesse de consommation de ce budget.

L'alerte multi-fenêtres (fichier `alerting-rules.yml` du cours) ne se déclenche pas sur un seuil brut d'erreurs mais sur la **vitesse** :

```promql
# fenêtre courte (1h) : brûle-t-on 14,4× trop vite ? → page immédiat
(
  sum(rate(http_requests_total{status=~"5.."}[1h]))
  /
  sum(rate(http_requests_total[1h]))
) > (14.4 * 0.001)
```

`14.4 × 0.001` : à ce rythme, les 30 jours d'error budget partent en ~2 h → sévérité `page`. La fenêtre 6h à `6 × 0.001` → sévérité `ticket`. **Alerter sur le symptôme et la vitesse, pas sur la cause** : c'est ce qui évite la fatigue d'alerte (module 09).

### 2.5 Incident joué et postmortem — le pilier humain

Observer sans processus de réponse ne sert à rien. Le capstone **joue** un incident (on injecte une panne, module 12/chaos si dispo, ou une latence à la main), puis en tire un **postmortem blameless** (module 10). Structure canonique :

```
## Résumé          — 3 lignes : quoi, quand, impact
## Impact          — utilisateurs/familles touchés, durée, budget consommé
## Timeline        — T+0 détection → mitigation → résolution (heures précises)
## Root cause      — la cause technique, pas « le dev X a poussé »
## Résolution      — ce qui a stoppé le saignement
## Lessons learned — ce qui a marché / manqué dans la détection
## Action items    — owner + deadline pour CHAQUE item
```

Le principe **blameless** : on cherche *pourquoi le système a permis l'erreur*, jamais *qui a fauté*. Un postmortem qui nomme un coupable ne produit aucune amélioration durable.

### 2.6 Production readiness — la checklist de sortie

Avant de dire « TribuZen est prête pour la prod », on déroule une checklist (module 20). Extrait des lignes que ce cours permet de cocher :

- Logs structurés JSON avec `traceId` et redaction des PII (module 01, 19) ;
- Métriques RED exposées sur `/metrics`, scrapées (module 02) ;
- Traces distribuées avec propagation W3C (modules 04-05) ;
- Dashboard RED + dashboard error budget provisionnés **as code** (modules 07, 13) ;
- SLO définis, mesurés, avec alertes burn-rate branchées sur l'astreinte (modules 08, 09) ;
- Health checks (`/health/live`, `/health/ready`), timeouts, graceful shutdown (module 20) ;
- Un runbook par alerte, un postmortem template (module 10).

---

## 3. Worked examples

Deux exemples end-to-end. Le premier **assemble** la stack et prouve la corrélation. Le second **joue** l'incident du cas concret et le clôt par un postmortem.

### Exemple 1 — corréler les trois piliers sur une requête `/rsvp`

Objectif : partir d'un symptôme métrique et descendre jusqu'à la ligne de log, en trois sauts. On suppose l'API instrumentée (modules 01, 02, 05) et la stack `full` levée.

**Saut 1 — le symptôme (Prometheus / dashboard RED).** Le p99 de `/rsvp` explose :

```promql
histogram_quantile(
  0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp"}[5m]))
)
# → 3.4 (secondes)  au lieu des 0.12 habituels
```

Le débit (`sum by (route) (rate(http_requests_total{route="/api/events/:id/rsvp"}[5m]))`) est normal, le taux 5xx est faible. Donc : **lent, pas cassé**. On veut *où* le temps est passé → une trace.

**Saut 2 — la trace (Jaeger).** Dans Jaeger, filtre `service = tribuzen-api`, `operation = POST /api/events/:id/rsvp`, tri par durée décroissante. La trace la plus lente montre la répartition des spans :

```
POST /api/events/:id/rsvp                                3420 ms  ← trace complète
├─ middleware.auth                                          4 ms
├─ handler.rsvp                                          3400 ms
│   └─ db.query  SELECT ... FROM family_feed ...         3180 ms  ← le coupable
└─ response.serialize                                      12 ms
```

3,18 s sur 3,42 s sont dans **un** span SQL. Le code applicatif n'est pas en cause. On note le `traceId` de cette trace : `4bf92f3577b34da6a3ce929d0e0e4736`.

**Saut 3 — les logs (Pino, filtrés par `traceId`).** Les logs structurés portent tous le `traceId` (child logger, module 01). On filtre dessus :

```jsonc
{ "level":"info", "traceId":"4bf92f...", "route":"/api/events/:id/rsvp",
  "familyId":"fam_912", "msg":"rsvp request received" }
{ "level":"warn", "traceId":"4bf92f...", "durationMs":3180, "rows":1,
  "query":"SELECT * FROM family_feed WHERE family_id=$1 ORDER BY created_at",
  "msg":"slow query" }
```

Le log `warn` donne la requête exacte et le `familyId`. **Diagnostic complet en 3 sauts, ~2 minutes :** une requête sur `family_feed` sans index approprié devient lente quand le feed grossit et que la charge monte. La corrélation `métrique → trace → log par traceId` est *toute* la valeur de la stack assemblée.

### Exemple 2 — jouer l'incident et écrire le postmortem

On rejoue le vendredi soir de bout en bout, avec les rôles du module 10.

**a) Déclenchement.** On injecte la panne (latence de 3 s sur le span DB, via le middleware de chaos du cours ou un `sleep` temporaire côté handler). On génère de la charge sur `/rsvp` (k6, module 11) pour faire monter le p99.

**b) Détection automatique.** L'alerte burn-rate latence se déclenche seule. Timeline observée :

```
T+0min   charge + latence injectées
T+2min   alerte HighLatencyBurnRate (fenêtre courte) → page astreinte
T+3min   IC (Incident Commander) acknowledge, ouvre #inc-rsvp-latency
T+6min   dashboard RED consulté : p99 /rsvp à 3.4s, débit normal, 5xx bas
T+9min   trace Jaeger : span db.query à 3.18s identifié
T+11min  logs filtrés traceId : slow query sur family_feed confirmée
T+14min  mitigation : rollback du déploiement suspect + ajout LIMIT
T+18min  p99 revenu sous 200ms, error budget stabilisé
T+20min  incident clos, canal archivé
```

**c) Postmortem blameless** (le livrable), rédigé à froid le lendemain :

```markdown
# Postmortem — 2026-07-03 — Latence /rsvp en soirée

## Résumé
De 18h09 à 18h27, le p99 de POST /api/events/:id/rsvp est passé de 120ms à 3.4s.
Cause : requête non indexée sur family_feed, saturant le pool DB sous charge de soirée.

## Impact
~340 familles n'ont pas pu confirmer leur présence pendant 18 min.
Error budget latence 30j consommé : 22%. Aucune erreur 5xx (dégradation, pas panne).

## Timeline
(voir ci-dessus — détection automatique à T+2, résolution à T+18)

## Root cause
Un déploiement à 17h50 a introduit un SELECT sans LIMIT sur family_feed.
À faible charge, invisible ; à 3x le trafic, saturation du pool de connexions.

## Résolution
Rollback du déploiement + ajout d'un index sur (family_id, created_at) et d'un LIMIT.

## Lessons learned
- CE QUI A MARCHÉ : l'alerte burn-rate a paged 3 min avant le premier ticket support.
- CE QUI A MANQUÉ : aucun test de charge sur family_feed avant le déploiement.

## Action items
- [ ] Ajouter un test k6 sur /rsvp au CI — owner: @sylvain — deadline: 2026-07-10
- [ ] Alerte sur la saturation du pool DB (métrique USE) — owner: @sylvain — deadline: 2026-07-17
- [ ] Runbook « latence /rsvp » — owner: @sylvain — deadline: 2026-07-10
```

Noter : la root cause est **le système** (pas de garde-fou charge/index), jamais « l'auteur du déploiement ». Chaque action item a un **owner et une deadline** — un postmortem sans action items datés est un journal, pas un outil.

---

## 4. Pièges & misconceptions

Ces pièges sont **spécifiques à l'assemblage** — ils n'apparaissent que quand on branche les briques ensemble.

### PIÈGE #1 — croire que Prometheus reçoit les métriques (push), comme les traces

Les traces sont **poussées** en OTLP vers le collector. Par analogie, on croit que l'API pousse aussi ses métriques vers Prometheus — faux. Prometheus **scrape** (pull) : il va chercher `/metrics` toutes les 15 s. Si `/metrics` n'est pas exposé ou pas déclaré dans `prometheus.yml`, la cible reste `up=0` et **aucun** dashboard, SLO ou alerte ne fonctionne. Vérifier `up{job="tribuzen-api"} == 1` est le tout premier check d'intégration.

### PIÈGE #2 — dashboard, SLO et alerte sur des métriques *différentes*

```promql
# ❌ le dashboard trace la latence sur une métrique, l'alerte sur une autre
#    → le graphe est vert mais l'alerte page (ou l'inverse). Incohérence garantie.
# Dashboard : http_request_duration_seconds (bon)
# Alerte     : une métrique custom "rsvp_latency_ms" créée à part

# ✅ UNE source de vérité : la même série alimente les trois usages
#    RED dashboard, SLO et burn-rate lisent http_request_duration_seconds_bucket
```

Si le dashboard est vert mais l'alerte crie, suspecte d'abord une **divergence de source**, pas un faux positif.

### PIÈGE #3 — logs et traces non corrélés (pas de `traceId` dans les logs)

Sans `traceId` dans les logs, la corrélation de l'Exemple 1 est impossible : tu vois une trace lente mais tu ne peux pas retrouver *ses* logs parmi des milliers. Le child logger `logger.child({ traceId })` (module 01) doit être branché sur le contexte OTel actif. C'est **la** jointure qui transforme trois outils isolés en une stack.

### PIÈGE #4 — alerter sur la cause plutôt que sur le symptôme

```promql
# ❌ alerte « CPU > 80% » — la cause. Se déclenche sans impact utilisateur (bruit),
#    ou reste muette si l'impact vient d'ailleurs (base lente, CPU bas).
# ✅ alerte « error budget latence brûle 14,4× trop vite » — le symptôme.
#    Corrélée à l'expérience utilisateur réelle. Le CPU va dans le dashboard, pas l'alerte.
```

Le burn-rate alerte sur ce que l'utilisateur **subit**, à la bonne **vitesse**. Multiplier les alertes de cause = fatigue d'alerte = alertes ignorées le jour du vrai incident.

### PIÈGE #5 — postmortem qui nomme un coupable

« Le développeur X a poussé une mauvaise requête » n'améliore rien : la prochaine personne refera l'erreur car le système le permet toujours. La formulation blameless : « une requête non indexée a pu atteindre la prod car aucun test de charge ne la couvrait » → action item : test de charge au CI. On corrige le **système**, pas la personne.

### PIÈGE #6 — confondre p99 agrégé et p99 par route dans le SLO

Un SLO « p99 < 500 ms » calculé sur **toutes** les routes confondues masque une route critique lente derrière des routes triviales rapides. Pour un SLO qui protège l'expérience RSVP, il faut agréger **par route** en gardant `le` dans le `by` (module 02) : `sum by (route, le) (...)`. Oublier `le`, ou noyer `/rsvp` dans la moyenne globale, donne un SLO vert pendant que les parents rament.

---

## 5. Ancrage TribuZen

Ce module **est** l'ancrage : la stack d'observabilité complète de TribuZen, telle qu'elle vit dans `smaurier/tribuzen` et dans les `docker-compose` du cours.

Grille récapitulative — chaque couche, son outil, sa métrique/artefact, son module source :

| Couche | Outil | Artefact TribuZen | Module |
|--------|-------|-------------------|--------|
| Logs structurés | Pino | `logger.child({ traceId, familyId })` | 01 |
| Métriques | prom-client + Prometheus | `http_requests_total`, `http_request_duration_seconds` | 02, 03 |
| Traces | OpenTelemetry + Jaeger | spans `POST /rsvp` → `db.query` | 04, 05 |
| Erreurs | Sentry | releases + source maps de l'API | 06 |
| Dashboards | Grafana | `red-dashboard.json`, dashboard error budget | 07, 13 |
| SLO | recording rules | `slo-rules.yml` (p99, error rate) | 08 |
| Alertes | Alertmanager | `alerting-rules.yml` (burn-rate 14.4×/6×) | 09 |
| Incident | processus + Slack | canal `#inc-*`, rôles IC/investigateur | 10 |
| Postmortem | template MD | `postmortem-2026-07-03-rsvp.md` | 10 |
| Charge | k6 | scénario `/rsvp` steady + spike | 11 |
| Readiness | checklist | PRR du service `tribuzen-api` | 20 |

Emplacement cible dans le repo :

```
tribuzen/
  src/
    observability/
      logger.ts          ← Pino + traceId (module 01)
      metrics.ts         ← registre, counters, histogram (module 02)
      tracing.ts         ← OTel SDK, OTLP export (module 05)
  ops/
    prometheus.yml       ← scrape 'tribuzen-api'
    rules/
      slo-rules.yml      ← recording rules SLI
      alerting-rules.yml ← burn-rate multi-fenêtres
    grafana/
      red-dashboard.json
      error-budget.json
    postmortems/
      2026-07-03-rsvp-latency.md
```

Le lab associé te fait monter cette stack **de bout en bout** sur la `demo-app` du cours (proxy de l'API TribuZen), via les `docker-compose` fournis.

---

## 6. Points clés

1. Le capstone **assemble**, il n'ajoute rien : chaque brique vient d'un module 00-20 ; un flou = rouvrir le module source, pas deviner.
2. Le `traceId` est la **couture** des trois piliers : sans lui dans les logs, pas de corrélation métrique → trace → log.
3. **Une** instrumentation, **trois** usages : dashboard RED, SLO et alerte burn-rate lisent les mêmes séries (`http_requests_total`, `http_request_duration_seconds`).
4. Prometheus **scrape** (pull) les métriques ; les traces sont **poussées** (OTLP push). Confondre les deux = cible `up=0`, stack morte.
5. On alerte sur le **symptôme** et la **vitesse** (burn-rate), pas sur la cause (CPU, mémoire) — sinon fatigue d'alerte.
6. Le workflow de debug type : symptôme métrique → trace la plus lente → logs filtrés par `traceId` → root cause.
7. Un postmortem est **blameless** (on corrige le système) et **actionnable** (chaque item a owner + deadline).
8. La production readiness se **coche** : logs+métriques+traces corrélés, dashboards+alertes as code, SLO branché sur l'astreinte, health checks, runbooks.

---

## 7. Seeds Anki

```
Qu'est-ce qui « coud » ensemble les trois piliers de l'observabilité ?|Le traceId propagé partout : chaque log le porte (logger.child), chaque trace l'agrège. Il permet le workflow symptôme (métrique) → trace → logs filtrés par traceId. Sans lui, trois outils isolés au lieu d'une stack.
Une même métrique alimente quels trois usages dans la stack TribuZen ?|http_requests_total / http_request_duration_seconds alimentent : (1) le dashboard RED, (2) le SLO + error budget, (3) l'alerte burn-rate. Une seule instrumentation, trois usages — jamais une métrique dédiée par usage.
Prometheus reçoit-il les métriques comme le collector reçoit les traces ?|Non. Les traces sont POUSSÉES en OTLP (push) vers le collector. Prometheus SCRAPE (pull) /metrics toutes les 15s. Confondre → cible up=0 → dashboard, SLO et alerte muets. Premier check d'intégration : up{job} == 1.
Pourquoi alerter sur le burn-rate plutôt que sur le CPU ?|Le burn-rate alerte sur le symptôme subi par l'utilisateur (error budget qui brûle) à la bonne vitesse (14,4× → page). Le CPU est une cause : alerter dessus crée du bruit (pic sans impact) ou du silence (impact sans pic CPU). La cause va au dashboard, pas à l'alerte.
Quel est le workflow de debug type dans une stack observée ?|Symptôme métrique (p99 explose sur le dashboard RED) → trace la plus lente dans Jaeger (où le temps est passé, ex. span db.query) → logs filtrés sur le traceId de cette trace (requête SQL + familyId exacts) → root cause. ~2 minutes, sans SSH.
Qu'est-ce qui rend un postmortem « blameless » et utile ?|Blameless : on cherche pourquoi le SYSTÈME a permis l'erreur (« requête non indexée atteinte la prod, pas de test de charge »), jamais qui a fauté. Utile : chaque action item a un owner ET une deadline. Sans ça, c'est un journal, pas un outil d'amélioration.
Pourquoi un SLO latence doit-il souvent être calculé par route ?|Un p99 agrégé toutes routes masque une route critique lente (/rsvp) derrière des routes triviales rapides : SLO vert, utilisateurs qui rament. Il faut sum by (route, le) — en gardant le label le, sinon histogram_quantile fusionne les buckets et rend un chiffre faux.
Cite trois lignes d'une checklist de production readiness cochables grâce à ce cours.|(1) Logs structurés JSON avec traceId + redaction PII ; (2) SLO définis, mesurés, avec alertes burn-rate branchées sur l'astreinte ; (3) dashboards et alertes provisionnés as code + un runbook par alerte. Plus : traces W3C, health checks, graceful shutdown.
```

---

## Pour aller plus loin (références intégrées)

Une fois la stack montée, ces ressources approfondissent chaque pilier. Elles sont classées par ce qu'elles apportent **concrètement**, pas par prestige.

**Les fondamentaux SRE (gratuits en ligne) :**
- **Google SRE Book** — https://sre.google/sre-book/table-of-contents/ — le texte fondateur. Commence par le Ch. 6 (Monitoring Distributed Systems), Ch. 14 (Managing Incidents), Ch. 15 (Postmortem Culture).
- **Google SRE Workbook** — https://sre.google/workbook/table-of-contents/ — le compagnon pratique. Le **Ch. 5 (Alerting on SLOs)** est la source directe du burn-rate multi-fenêtres du module 09.

**Approfondir l'observabilité :**
- **Observability Engineering** (Charity Majors, Liz Fong-Jones, George Miranda, O'Reilly) — pourquoi l'observabilité dépasse les 3 piliers ; données haute cardinalité, wide events, debug par les traces.
- **Release It!** (Michael Nygard, 2e éd.) — patterns de résilience (circuit breaker, bulkhead, timeout) : la source des garde-fous testés au module 12.

**Docs officielles (à garder ouvertes pendant le montage) :**
- OpenTelemetry — https://opentelemetry.io/docs/
- Prometheus — https://prometheus.io/docs/
- Grafana — https://grafana.com/docs/
- k6 — https://grafana.com/docs/k6/

**Continuer :**
- **SRE Weekly** (sreweekly.com) — newsletter hebdomadaire curée sur la fiabilité.
- **Prometheus Certified Associate (PCA)** — certification CNCF si tu veux valider Prometheus formellement.

---

## Pont vers le lab

> Lab associé : `labs/lab-21-projet-final/README.md`. **Capstone** : monter l'observabilité complète de TribuZen de bout en bout via les `docker-compose` fournis (base / tracing / full), corréler les trois piliers, brancher SLO + burn-rate, jouer un incident et écrire le postmortem — grille récapitulative, coach en session, variante J+30.

---

> **Note :** ce module est le **dernier module du parcours 16-observability-sre**. Le `next` pointe vers `fin-parcours-16-observability-sre` — tu as couvert l'intégralité du curriculum Observabilité & SRE, de la première ligne de log structuré jusqu'au postmortem d'un incident joué sur une stack complète.

← [Module 20 — DORA & production readiness](20-dora-et-production-readiness.md)

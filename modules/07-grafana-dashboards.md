---
titre: Grafana & dashboards RED
cours: 16-observability-sre
notions: ["datasources Grafana (provisioning)", "types de panels (time series, stat, gauge, table)", "PromQL avancé — agrégations by / without", "topk / bottomk / count", "variables & templating (label_values)", "$__rate_interval vs $__interval", "dashboard RED (Rate / Errors / Duration)", "bonnes pratiques dashboard (un dashboard = une question)"]
outcomes:
  - sait connecter Grafana à Prometheus et choisir le bon type de panel selon la grandeur
  - sait écrire les agrégations PromQL by et without et savoir laquelle utiliser
  - sait construire un dashboard RED de bout en bout depuis les métriques de l'API
  - sait rendre un dashboard réutilisable avec des variables de templating (label_values)
  - sait utiliser $__rate_interval plutôt qu'une fenêtre codée en dur
prerequis: ["module 00 — 3 piliers", "module 01 — logging structuré", "module 02 — métriques & PromQL de base (rate, sum by, histogram_quantile)", "module 03 — méthode RED/USE", "modules 04-06 — tracing, OTel, Sentry"]
next: 08-sli-slo-sla
libs: []
tribuzen: dashboard RED de l'API TribuZen dans Grafana — Rate/Errors/Duration par endpoint, variable de service, alimenté par le Prometheus du module 02
last-reviewed: 2026-07
---

# Grafana & dashboards RED

> **Outcomes — tu sauras FAIRE :** connecter Grafana à Prometheus, choisir le bon panel, écrire les agrégations PromQL `by`/`without`, construire un dashboard **RED** de l'API TribuZen, le rendre réutilisable avec des variables (`label_values`), et utiliser `$__rate_interval`.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **Grafana (datasources, panels, variables) + le PromQL avancé d'agrégation** (`by`/`without`, `topk`). Les métriques et le PromQL de base (`rate`, `histogram_quantile`) sont le **module 02** — acquis. La méthode d'interprétation **RED** est le **module 03** — ici on la *matérialise* en dashboard. Le **versionnage des dashboards** (JSON en Git, GitOps, `observability-as-code`) est le **module 13** ; on n'en donne ici qu'un **survol du provisioning**. Les **alertes** (Grafana Alerting, burn-rate) sont les modules **08-09**.

## 1. Cas concret d'abord

Au module 02, tu as instrumenté l'API TribuZen : elle expose `/metrics`, un Prometheus la scrape, et tu sais taper trois PromQL dans l'onglet *Graph* de Prometheus. Ça marche — pour toi, seul, en train de déboguer.

Lundi 9 h, la situation change. Le support demande : « est-ce que `/rsvp` va mieux depuis le correctif de vendredi ? ». Ta cheffe de projet veut « un écran qu'on laisse sur la télé de l'open-space ». Un collègue arrive sur l'astreinte et doit voir l'état de l'API **en 5 secondes**, sans connaître PromQL.

L'onglet *Graph* de Prometheus ne répond à aucun de ces besoins : une requête à la fois, pas de mise en page, pas de partage, pas de sélecteur de service, rien à laisser affiché. Il te faut un **dashboard** : plusieurs panels rangés sur un écran, rafraîchis en continu, lisibles par quelqu'un qui ne tape jamais de PromQL.

À la fin de ce module, l'API TribuZen aura ce dashboard dans Grafana :

```
┌──────────────────────────────────────────────────────────────┐
│  Service: [ tribuzen-api ▾ ]        (variable de templating)   │
├───────────────┬───────────────┬───────────────┬──────────────┤
│ [Stat] Req/s  │ [Stat] Err %  │ [Stat] p99    │ [Gauge] Mém  │
├───────────────┴───────────────┼──────────────────────────────┤
│  Rate — req/s par route        │  Errors — taux 5xx (%)       │
│  (time series)                 │  (time series, seuil 1%)     │
├────────────────────────────────┼──────────────────────────────┤
│  Duration — p50/p95/p99        │  Top 5 routes les + lentes   │
│  (time series, axe en s)       │  (table)                     │
└────────────────────────────────┴──────────────────────────────┘
```

C'est un dashboard **RED** (Rate, Errors, Duration — méthode du module 03). On le construit brique par brique, sans deviner une seule fonction PromQL.

---

## 2. Théorie complète, concise

### 2.1 Où Grafana se place dans la chaîne

Prometheus **stocke** les séries et **répond** à des requêtes PromQL. Grafana ne stocke rien : c'est une **couche de visualisation** qui interroge Prometheus (et d'autres sources) et dessine. La séparation est nette :

```
API TribuZen ──/metrics──► Prometheus (stockage + PromQL) ──HTTP query──► Grafana (dessine)
```

Dans le `docker-compose.base.yml` du cours, Grafana écoute sur `http://localhost:3001` (login `admin` / `admin`), Prometheus sur `http://localhost:9090`.

### 2.2 Datasources — la connexion vers Prometheus

Une **datasource** est une connexion vers un backend de données. Sans elle, Grafana n'a rien à dessiner. On peut la créer à la main dans l'UI, mais l'approche pro est le **provisioning** : un fichier YAML monté au démarrage (survol ici, détaillé au module 13).

```yaml
# config/grafana/provisioning/datasources/datasources.yml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy          # Grafana (serveur) appelle Prometheus, pas le navigateur
    url: http://prometheus:9090   # nom de service Docker, PAS localhost
    isDefault: true
```

Deux points qui coûtent des heures :
- `access: proxy` = le **serveur** Grafana interroge Prometheus (recommandé). En `direct`, c'est le navigateur — il faut alors une URL joignable depuis le poste.
- `url` = le **nom de service Docker** (`prometheus`), pas `localhost` : dans le réseau Compose, `localhost` désigne le conteneur Grafana lui-même.

### 2.3 Les types de panels utiles

Un **panel** = une visualisation = une (ou plusieurs) requête(s) PromQL + un type de rendu. Les quatre à connaître pour l'observabilité :

| Panel | Usage | Exemple TribuZen |
|-------|-------|------------------|
| **Time series** | évolution dans le temps | req/s, latence p99, taux d'erreur |
| **Stat** | une valeur unique mise en avant | « p99 actuel : 240 ms » |
| **Gauge** | valeur avec seuils colorés | mémoire heap (vert/jaune/rouge) |
| **Table** | données tabulaires triées | top 5 des routes les plus lentes |

Règle simple : **tendance → time series**, **KPI instantané → stat**, **jauge avec seuil → gauge**, **classement/détail → table**.

### 2.4 PromQL avancé — les agrégations `by` et `without`

Au module 02, tu connais `sum by (route) (rate(...))`. Grafana pousse à maîtriser **toute** la famille des opérateurs d'agrégation. Source : docs Prometheus, *Aggregation operators*.

Un opérateur d'agrégation **replie** plusieurs séries en moins de séries. Les principaux :

```promql
sum(...)      # somme des séries
avg(...)      # moyenne
min(...)      max(...)
count(...)    # NOMBRE de séries (pas la somme des valeurs)
topk(5, ...)  # les 5 plus grandes valeurs (garde les labels)
bottomk(5, ...)
```

Chaque opérateur accepte une clause de groupage : `by` ou `without`. Syntaxe exacte (vérifiée docs) — la clause peut se placer **avant ou après** les parenthèses, les deux formes sont valides :

```promql
sum by (route) (rate(http_requests_total[5m]))     # forme préfixe (la plus lue)
sum(rate(http_requests_total[5m])) by (route)      # forme suffixe, équivalente
```

La distinction **`by` vs `without`** est le cœur du module :

- **`by (labels)`** = ne **garde QUE** les labels listés, écrase tout le reste.
- **`without (labels)`** = **retire** les labels listés, **garde tout le reste**.

Ce sont deux façons de dire la même chose. Exemple : une métrique porte les labels `method, route, status, instance`.

```promql
# je veux le débit par route, tout le reste agrégé
sum by (route) (rate(http_requests_total[5m]))

# STRICTEMENT ÉQUIVALENT si (route) est le SEUL label à garder
sum without (method, status, instance) (rate(http_requests_total[5m]))
```

**Quand préférer `without` ?** Quand tu veux juste **écraser un label parasite** (typiquement `instance`) et **garder tous les autres sans les énumérer** :

```promql
# agrège les 3 instances de l'API, garde route ET status ET method
sum without (instance) (rate(http_requests_total[5m]))
```

Piège structurant : `without` te fait garder **automatiquement** tout nouveau label ajouté plus tard. Avec `by`, tu maîtrises exactement la sortie. **Défaut recommandé : `by`** (explicite) ; `without (instance)` quand agréger les répliques est le seul but.

`topk` / `count`, très utiles en dashboard :

```promql
# top 5 des routes les plus lentes en p99 (pour un panel table)
topk(5, histogram_quantile(0.99,
  sum by (route, le) (rate(http_request_duration_seconds_bucket[5m]))))

# combien de cibles sont UP ? (count = nombre de séries, pas somme des valeurs)
count(up == 1)
```

### 2.5 Le dashboard RED, panel par panel

La méthode **RED** (module 03) = pour chaque service, trois signaux : **R**ate (débit), **E**rrors (taux d'erreur), **D**uration (latence). En dashboard, un panel par lettre.

```promql
# R — Rate : débit par route (time series)
sum by (route) (rate(http_requests_total[5m]))

# E — Errors : proportion de 5xx, en % (time series, seuil visuel à 1%)
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100

# D — Duration : p50 / p95 / p99 (time series, 3 requêtes, axe en secondes)
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

Rappel du module 02 qui vaut de l'or ici : dans un `histogram_quantile`, le label `le` doit **toujours** figurer dans le `sum by (...)`, sinon le résultat est faux mais plausible.

Pour nommer les courbes, Grafana utilise un **legend format** qui interpole les labels avec des doubles accolades — à écrire dans le champ *Legend* du panel :

```
{{route}}     ← une courbe par route, nommée par la valeur du label route
```

### 2.6 `$__rate_interval` vs `$__interval` — ne code jamais la fenêtre en dur

Dans le module 02 tu écrivais `rate(...[5m])`. En dashboard, la fenêtre codée en dur est un **bug** : si l'utilisateur zoome sur 6 h, `[5m]` reste `[5m]` et lisse mal ; s'il dézoome sur 30 jours, `[5m]` peut tomber sous le pas d'échantillonnage et **trouer** la courbe.

Grafana fournit des variables calculées. Source : docs Grafana, *Prometheus template variables*.

- **`$__interval`** = pas de temps auto (largeur du panel / plage). **Trop petit** pour `rate()` → risque de trous.
- **`$__rate_interval`** = pensé POUR `rate()` : garantit une fenêtre couvrant **au moins 4 échantillons de scrape**. Formule : `max($__interval + scrape_interval, 4 * scrape_interval)`.

```promql
# ✅ en dashboard, toujours ceci
sum by (route) (rate(http_requests_total[$__rate_interval]))

# ❌ fenêtre figée : trous au dézoom, sur-lissage au zoom
sum by (route) (rate(http_requests_total[5m]))
```

Règle : **`rate()` dans Grafana ⇒ `[$__rate_interval]`**, jamais une durée figée.

### 2.7 Variables & templating — un dashboard, N services

Sans variables, tu dupliquerais le dashboard RED pour chaque service. Une **variable de templating** ajoute un menu déroulant en haut du dashboard ; sa valeur s'injecte dans les requêtes via `$nom`.

Types de variables (docs Grafana) : **Query** (valeurs issues d'une requête), **Custom** (liste figée), **Interval** (`1m,5m,15m`), **Data source** (basculer de source). Le plus utile ici : **Query**, avec la fonction `label_values`.

```
# Variable "service" — type Query, datasource Prometheus
label_values(http_requests_total, service)   # toutes les valeurs du label service
label_values(up, job)                          # toutes les valeurs de job
```

Signature (vérifiée docs Grafana, type de requête *Classic*) :
- `label_values(metric, label)` → valeurs d'un label **pour une métrique donnée** (à préférer, plus ciblé) ;
- `label_values(label)` → valeurs du label **toutes métriques confondues**.

On référence ensuite la variable avec `$service` dans les requêtes :

```promql
sum by (route) (rate(http_requests_total{service="$service"}[$__rate_interval]))
```

Bonus : les valeurs de variables se retrouvent dans l'URL (`?var-service=tribuzen-api`) → un lien partageable pointe sur le bon service. `label_values` (type *Classic*) ne supporte pas les variables de temps (`$__range`) ; pour ça il faut `query_result()` (hors périmètre ici).

### 2.8 Bonnes pratiques de dashboard

Source : docs Grafana, *Dashboard best practices*.

- **Un dashboard = une question / une histoire.** « Comment va l'API TribuZen ? » → un dashboard RED. Ne mélange pas RED applicatif et métriques d'infra (CPU/disque des nœuds) sur le même écran.
- **Charge cognitive minimale** : le sens de chaque panel doit être évident en 5 s pour quelqu'un qui découvre. Titres explicites, unités correctes (`s`, `percent`, `reqps`), descriptions de panel.
- **Mise en page du général au détail** : KPI (stat/gauge) en haut, tendances (time series) au milieu, détail (table) en bas. Drill-down du global vers le spécifique.
- **Variables plutôt que duplication** : un dashboard paramétré par `$service` couvre 50 services.
- **Couleurs cohérentes** : vert = OK, rouge = problème. Seuils sur les panels (ex. taux d'erreur : vert < 1 %, rouge > 5 %).
- **Grafana recommande d'alerter sur les dashboards RED** : ils reflètent l'expérience utilisateur (symptômes), pas les causes d'infra — on y revient au module 09.
- **8-12 panels max** par dashboard : au-delà, c'est lent et illisible ; découpe en plusieurs dashboards spécialisés.

### 2.9 Provisioning — survol (détaillé au module 13)

Cliquer pour créer datasources et dashboards ne **scale** pas et n'est pas versionnable. Grafana sait tout **provisionner** depuis des fichiers montés au démarrage :

```yaml
# provisioning/dashboards/dashboards.yml — charge les .json d'un dossier
apiVersion: 1
providers:
  - name: TribuZen
    folder: TribuZen
    type: file
    options:
      path: /var/lib/grafana/dashboards
```

Un dashboard est un **objet JSON** (panels, requêtes, variables). L'exporter en JSON, le committer, le provisionner = le début de l'**observability-as-code**. Ici on s'arrête au principe ; la mécanique complète (export propre, GitOps, `foldersFromFilesStructure`) est le **module 13**.

---

## 3. Worked examples

### Exemple 1 — construire le panel Duration du dashboard RED

Objectif : un panel time series affichant p50/p95/p99 de latence, réutilisable via `$service`.

1. **Nouveau panel → type Time series.** Datasource : Prometheus.
2. **Trois requêtes** (A, B, C), chacune un quantile, avec `le` dans le `by` et `$__rate_interval` :

```promql
# Query A — legend: p50
histogram_quantile(0.50,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))

# Query B — legend: p95
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))

# Query C — legend: p99
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))
```

3. **Unité de l'axe Y** : *seconds (s)* — sinon Grafana affiche `0.24` sans savoir que ce sont des secondes.
4. **Legend** : `p50` / `p95` / `p99` en dur (une valeur par requête, pas besoin de <code v-pre>{{ }}</code>).

Résultat : trois courbes empilées, l'écart p50↔p99 saute aux yeux — une longue traîne (p99 loin du p50) signale que *certaines* requêtes souffrent, invisible sur une moyenne.

### Exemple 2 — `by` vs `without` sur un cas réel multi-instance

L'API TribuZen tourne en **3 répliques** (`instance="api-1|api-2|api-3"`). La métrique porte `method, route, status, instance`. Tu veux le **débit par route**, toutes répliques confondues.

```promql
# Option 1 — by : j'énumère ce que je GARDE
sum by (route) (rate(http_requests_total[$__rate_interval]))
# → garde route uniquement. method, status, instance écrasés.

# Option 2 — without : j'énumère ce que je JETTE
sum without (instance, method, status) (rate(http_requests_total[$__rate_interval]))
# → même résultat, mais je dois lister TOUS les autres labels.
```

Maintenant je veux garder **route ET status** (pour distinguer 2xx/5xx par route), en agrégeant seulement les répliques :

```promql
# by : je dois penser à lister route ET status
sum by (route, status) (rate(http_requests_total[$__rate_interval]))

# without : je jette juste instance, le reste suit tout seul
sum without (instance) (rate(http_requests_total[$__rate_interval]))
```

Ici `without (instance)` est **plus robuste** : si demain on ajoute un label `version`, il sera automatiquement conservé sans toucher la requête. C'est le cas d'usage canonique de `without` : **agréger les répliques, garder le reste**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — croire que Grafana stocke les données

Grafana ne stocke **rien** : il interroge Prometheus à chaque rafraîchissement. Si un panel est vide, le problème est presque toujours en amont (datasource injoignable, cible `up=0`, mauvais nom de métrique), pas dans Grafana. Réflexe : vérifier la requête dans l'**Explore** de Grafana, ou directement dans Prometheus.

### PIÈGE #2 — fenêtre de `rate()` codée en dur dans un dashboard

`rate(...[5m])` est correct pour un debug ponctuel (module 02) mais **faux en dashboard** : au dézoom sur 30 jours la courbe se troue, au zoom sur 5 min elle sur-lisse. En dashboard : **toujours `[$__rate_interval]`**.

### PIÈGE #3 — confondre `by` et `without`

```promql
# je veux agréger les instances mais garder route + status
# ❌ FAUX : by (instance) garde SEULEMENT instance, écrase route et status
sum by (instance) (rate(http_requests_total[$__rate_interval]))

# ✅ without (instance) : jette instance, garde tout le reste
sum without (instance) (rate(http_requests_total[$__rate_interval]))
```

`by` liste ce qu'on **garde**, `without` liste ce qu'on **jette**. Les inverser produit un résultat radicalement différent, sans erreur.

### PIÈGE #4 — `count` vs `sum`

`count(up == 1)` renvoie le **nombre de séries** (combien de cibles UP), `sum(up)` renvoie la **somme des valeurs**. Pour compter des instances UP les deux donnent le même chiffre par coïncidence (valeur = 1), mais dès que la valeur n'est pas 1, `count` (cardinalité) et `sum` (total) divergent. `count` = « combien de séries ? », `sum` = « quel total ? ».

### PIÈGE #5 — oublier l'unité de l'axe Y

Un panel de latence sans unité affiche `0.24` : est-ce 0,24 s, 240 ms, 0,24 % ? Toujours régler l'unité (*seconds*, *percent*, *reqps*, *bytes*). Une latence affichée en « short » au lieu de « s » rend le panel inexploitable en astreinte.

### PIÈGE #6 — le méga-dashboard qui fait tout

30 panels et 3 objectifs mélangés sur un écran = lent, illisible, personne ne le regarde. Un dashboard répond à **une** question (« comment va l'API ? »). Le CPU des nœuds Kubernetes est un **autre** dashboard (module 14).

---

## 5. Ancrage TribuZen

Ce dashboard est la **face visible** de l'instrumentation posée au module 02. Aucune nouvelle métrique : on **visualise** `http_requests_total` et `http_request_duration_seconds` déjà scrapées.

Le dashboard **RED de l'API TribuZen** :

| Panel | Type | Requête (résumée) | Répond à |
|-------|------|-------------------|----------|
| Req/s | Stat | `sum(rate(http_requests_total{service="$service"}[$__rate_interval]))` | « ça tourne ? » |
| Error % | Stat + seuil | ratio 5xx `* 100` | « ça casse ? » |
| p99 | Stat | `histogram_quantile(0.99, sum by (le) (...))` | « c'est lent ? » |
| Mémoire | Gauge | `process_resident_memory_bytes` | « ça sature ? » |
| Rate | Time series | `sum by (route) (rate(...))` | trafic par endpoint |
| Errors | Time series | taux 5xx `* 100`, seuil 1 % | où ça casse |
| Duration | Time series | p50/p95/p99 | où c'est lent |
| Top routes lentes | Table | `topk(5, histogram_quantile(0.99, sum by (route, le) (...)))` | quel endpoint prioriser |

La variable `$service` (via `label_values(http_requests_total, service)`) rend ce dashboard réutilisable pour l'API, les workers d'e-mail, et tout futur service TribuZen.

Emplacement cible dans `smaurier/tribuzen` (le JSON sera versionné au module 13) :

```
tribuzen/
  ops/
    grafana/
      provisioning/
        datasources/datasources.yml   ← connexion Prometheus
        dashboards/dashboards.yml      ← provider qui charge les .json
      dashboards/
        tribuzen-red.json              ← le dashboard RED exporté
```

> Le dashboard **montre** que `/rsvp` a un p99 à 3 s. Décider que « p99 < 300 ms » est un objectif contractuel et alerter dessus, c'est **SLO (module 08)** et **alerting (module 09)**. Versionner ce JSON en Git, c'est **observability-as-code (module 13)**.

---

## 6. Points clés

1. Grafana **visualise**, Prometheus **stocke** : un panel vide = problème en amont (datasource, cible, nom de métrique).
2. Une **datasource** connecte Grafana à Prometheus ; en provisioning, `url` = nom de service Docker (`prometheus:9090`), `access: proxy`.
3. Panels : **time series** (tendance), **stat** (KPI), **gauge** (seuil), **table** (classement/détail).
4. `by (labels)` = garde SEULEMENT ces labels ; `without (labels)` = jette ces labels, garde le reste. Défaut `by` ; `without (instance)` pour agréger les répliques.
5. `topk(k, ...)` = k plus grandes valeurs (garde les labels) ; `count(...)` = nombre de séries (≠ `sum`).
6. Un **dashboard RED** = Rate + Errors + Duration, un panel par lettre, alimenté par les métriques du module 02.
7. En dashboard, `rate()` prend **`[$__rate_interval]`**, jamais une fenêtre figée (`$__interval` est trop petit).
8. **Variables de templating** : `label_values(metric, label)` → menu déroulant, injecté via `$service` ; un dashboard couvre N services.
9. Un dashboard = **une question** ; KPI en haut, tendances au milieu, détail en bas ; unités correctes ; 8-12 panels max.
10. Le **provisioning** (datasources + dashboards en YAML/JSON) est le pont vers l'observability-as-code (module 13).

---

## 7. Seeds Anki

```
Grafana stocke-t-il les métriques ?|Non. Grafana ne stocke rien : il interroge Prometheus (ou une autre source) à chaque rafraîchissement et dessine. Un panel vide = problème en amont (datasource injoignable, cible up=0, mauvais nom de métrique), pas dans Grafana.
Différence entre by et without en PromQL ?|by (labels) garde SEULEMENT les labels listés et écrase le reste. without (labels) retire les labels listés et garde tout le reste. Défaut : by (explicite). without (instance) sert à agréger les répliques en gardant automatiquement les autres labels.
Écris le débit par route en agrégeant 3 instances, avec without.|sum without (instance) (rate(http_requests_total[$__rate_interval])). without jette instance et garde route, method, status — et tout label ajouté plus tard, sans modifier la requête.
Pourquoi $__rate_interval plutôt qu'une fenêtre [5m] en dur dans un dashboard ?|$__rate_interval s'adapte à la plage/zoom et garantit une fenêtre couvrant au moins 4 scrapes (max($__interval + scrape_interval, 4*scrape_interval)). Une fenêtre figée troue la courbe au dézoom et sur-lisse au zoom. $__interval seul est trop petit pour rate().
Qu'est-ce qu'un dashboard RED et de quoi est-il fait ?|RED = Rate (débit), Errors (taux d'erreur), Duration (latence). Un panel par lettre : rate par route (time series), taux 5xx en % (time series + seuil), p50/p95/p99 (time series). Reflète l'expérience utilisateur (symptômes), pas les causes d'infra.
Comment rendre un dashboard réutilisable pour plusieurs services ?|Une variable de templating type Query : label_values(http_requests_total, service) remplit un menu déroulant. On l'injecte dans les requêtes via $service : rate(http_requests_total{service="$service"}[$__rate_interval]). Un seul dashboard couvre N services au lieu d'un par service.
topk vs count en PromQL ?|topk(k, v) renvoie les k plus grandes valeurs en gardant les labels (ex : top 5 routes les plus lentes). count(v) renvoie le NOMBRE de séries (ex : count(up == 1) = nombre de cibles UP), à ne pas confondre avec sum qui somme les valeurs.
Deux règles de bonnes pratiques de dashboard Grafana ?|1) Un dashboard = une question / une histoire (ne pas mélanger RED applicatif et infra). 2) Mise en page général→détail : KPI (stat/gauge) en haut, tendances (time series) au milieu, table en bas ; unités correctes ; 8-12 panels max ; variables plutôt que duplication.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-07-grafana-dashboards/README.md`. Construire le dashboard **RED** de l'API TribuZen dans un **vrai Grafana** (docker-compose fourni), avec une variable `$service`, `$__rate_interval` et un panel `topk` — grille d'auto-éval, coach en session, variante J+30.

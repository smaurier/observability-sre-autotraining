# Lab 07 — Grafana & dashboard RED

> **Outcome :** à la fin, tu sais connecter Grafana à Prometheus, construire le dashboard **RED** (Rate / Errors / Duration) de l'API TribuZen, le paramétrer avec une variable `$service`, utiliser `$__rate_interval`, et ajouter un panel `topk` — le tout dans un **vrai Grafana**.
> **Vrai outil :** Grafana (image `grafana/grafana`) + Prometheus, via le `docker-compose.base.yml` fourni à la racine du cours. Aucun harnais simulé.
> **Feedback :** le coach valide visuellement en session — pas de test-runner auto-correcteur. Ton oracle, c'est l'UI Grafana (`http://localhost:3001`) qui dessine tes courbes.

---

## Prérequis

Ce lab **réutilise l'API instrumentée du lab 02** (`prom-client`, `/metrics`, counter `http_requests_total` + histogram `http_request_duration_seconds`). Tu dois avoir :

1. l'API TribuZen du lab 02 qui tourne et expose `/metrics` ;
2. un Prometheus qui la scrape (cible **UP** dans *Status → Targets*).

Si tu ne l'as plus, reprends le corrigé du lab 02 (5 min de copier-coller). **Rien à visualiser sans métriques scrapées.**

---

## Énoncé

Le support demande : « est-ce que `/rsvp` va mieux ? » et ta cheffe veut « un écran pour la télé de l'open-space ». L'onglet *Graph* de Prometheus ne suffit plus. Tu construis un **dashboard RED** dans Grafana.

Tu dois :

1. **Démarrer Grafana** via le docker-compose fourni et **connecter la datasource Prometheus**.
2. **Construire 3 panels RED** : Rate (débit par route), Errors (taux 5xx en %), Duration (p50/p95/p99).
3. **Utiliser `$__rate_interval`** partout dans les `rate()` — jamais de fenêtre codée en dur.
4. **Ajouter une variable de templating `$service`** (`label_values`) et l'injecter dans les requêtes.
5. **Ajouter un panel `table` « Top 5 routes les plus lentes »** avec `topk`.
6. **Soigner la lisibilité** : unités d'axe correctes, titres, seuil visuel sur les erreurs.

**Pas de gap-fill** — tu construis chaque panel à la main dans l'UI.

### Démarrage

Le `docker-compose.base.yml` à la racine du cours lance Prometheus (9090) + Grafana (3001, login `admin` / `admin`) :

```bash
docker compose -f docker-compose.base.yml up -d
```

Génère du trafic sur l'API (sinon les courbes sont plates) :

```bash
# une trentaine de requêtes, certaines lentes/erronées par design (lab 02)
for i in $(seq 1 40); do curl -s -X POST localhost:3000/api/events/42/rsvp > /dev/null; done
```

---

## Étapes (en friction)

1. **Connecte la datasource.** Grafana → *Connections → Data sources → Add → Prometheus*. URL : `http://prometheus:9090` (nom de service Docker, **pas** `localhost`). *Save & test* → « Data source is working ».
2. **Vérifie dans Explore.** Onglet *Explore*, tape `http_requests_total`, exécute. Si rien ne sort, le problème est en amont (cible `up=0`) — corrige avant de continuer.
3. **Crée le dashboard.** *Dashboards → New → New dashboard*.
4. **Panel R (Rate).** *Add panel* → type **Time series**. Requête : débit par route (voir corrigé), `[$__rate_interval]`. Legend : `{{route}}`. Titre : « Rate — req/s par route ».
5. **Panel E (Errors).** Time series. Requête : proportion 5xx `* 100`. Unité axe Y : *percent (0-100)*. Ajoute un **seuil** à 1 (rouge au-dessus). Titre : « Error rate (%) ».
6. **Panel D (Duration).** Time series, **3 requêtes** (A/B/C = p50/p95/p99), `le` dans le `by`. Unité axe Y : *seconds (s)*. Legends : `p50` / `p95` / `p99`.
7. **Ajoute la variable `$service`.** *Dashboard settings → Variables → Add variable* : type **Query**, datasource Prometheus, requête `label_values(http_requests_total, service)`. Nom : `service`.
   - **Attention** : si ton API n'expose pas de label `service` sur `http_requests_total`, la variable sera vide. Deux options : (a) ajoute `service` dans les `labelNames` de ton counter, ou (b) pour l'exercice, base la variable sur `label_values(up, job)` et injecte `$job`. Choisis, et sache pourquoi.
8. **Injecte `$service`** dans chaque requête : `{service="$service"}`. Change la valeur dans le menu déroulant → les panels suivent.
9. **Panel Top 5 (Table).** Type **Table**. Requête `topk(5, ...)` sur le p99 par route (voir corrigé). Format : *Instant* + transformation « Labels to fields » si besoin pour lire les routes.
10. **Provoque un pic.** Fais renvoyer 100 % de 500 à `/rsvp` pendant 1 min, régénère du trafic, regarde le panel Errors franchir le seuil rouge.
11. **Sauvegarde** le dashboard (nom : « TribuZen — RED »).

---

## Corrigé complet commenté

Les requêtes des panels (à taper dans le champ *Metrics browser* / éditeur de chaque panel) :

```promql
# --- Panel R : Rate — débit par route (time series, legend {{route}}) ---
sum by (route) (rate(http_requests_total{service="$service"}[$__rate_interval]))
# by (route) : garde route, agrège method/status/instance.
# $__rate_interval : fenêtre auto ≥ 4 scrapes — jamais [5m] figé en dashboard.
# {service="$service"} : la variable de templating filtre le service sélectionné.
```

```promql
# --- Panel E : Errors — proportion de 5xx en % (time series, seuil 1) ---
sum(rate(http_requests_total{service="$service", status=~"5.."}[$__rate_interval]))
/
sum(rate(http_requests_total{service="$service"}[$__rate_interval]))
* 100
# ratio (5xx / total) * 100. Axe Y en percent (0-100).
# Seuil visuel : vert < 1, rouge > 1 (voir field config du panel).
```

```promql
# --- Panel D : Duration — p50 / p95 / p99 (time series, 3 requêtes, axe en s) ---
# Query A — legend p50
histogram_quantile(0.50,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))
# Query B — legend p95
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))
# Query C — legend p99
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval])))
# le OBLIGATOIRE dans le by (rappel module 02) — sinon buckets fusionnés → faux mais plausible.
# Unité axe Y : seconds (s), sinon Grafana affiche 0.24 sans contexte.
```

```promql
# --- Panel Top 5 : routes les plus lentes en p99 (table, format Instant) ---
topk(5,
  histogram_quantile(0.99,
    sum by (route, le) (rate(http_request_duration_seconds_bucket{service="$service"}[$__rate_interval]))))
# topk garde les labels → une ligne par route, triée décroissante.
# by (route, le) : on garde route EN PLUS de le, pour un p99 par route.
```

**Variable de templating (Dashboard settings → Variables) :**

```
Nom       : service
Type      : Query
Datasource: Prometheus
Requête   : label_values(http_requests_total, service)
```

**Pourquoi ce corrigé est correct :**
- Chaque `rate()` utilise `[$__rate_interval]` : le dashboard reste juste au zoom comme au dézoom, sans trou ni sur-lissage.
- `by (route)` pour le débit, `by (le)` (et `by (route, le)`) pour les quantiles : on garde exactement les labels utiles, le `le` toujours présent dès qu'il y a `histogram_quantile`.
- `$service` rend le dashboard réutilisable : le même écran sert l'API, les workers, tout futur service exposant `http_requests_total`.
- `topk(5, ...)` garde les labels → le panel table liste les 5 routes les plus lentes, nommées, triées : de quoi prioriser un correctif.
- Lecture RED : si Rate montre du trafic sur `/rsvp`, Errors reste bas mais Duration a un p99 à 3 s → c'est de la **latence**, pas des erreurs. Le dashboard répond à la question du support en un coup d'œil.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Datasource | `http://prometheus:9090`, test OK, Explore renvoie des séries | `localhost:9090` en Docker, ou panels vides |
| RED complet | 3 panels R/E/D présents et lisibles | un signal manquant, ou tout dans un panel |
| Fenêtre rate | `[$__rate_interval]` partout | `[5m]` codé en dur |
| Quantiles | `le` dans le `by`, unité axe = *seconds* | `le` oublié, ou axe sans unité |
| Variable | `$service` (ou `$job`) fonctionne, panels suivent le menu | variable vide, ou pas injectée dans les requêtes |
| topk | table triée, une route par ligne | `topk` sans labels, ou `sum` à la place |
| Lisibilité | titres clairs, seuil sur Errors, unités correctes | panels « Panel Title », valeurs sans unité |
| Portée | RED applicatif seul (pas de CPU nœuds mélangé) | méga-dashboard fourre-tout |

### Coach — questions de vérification en session

- « Ta datasource pointe où, et pourquoi pas `localhost` ? » (attendu : nom de service Docker, `access: proxy`)
- « Remplace `$__rate_interval` par `[5m]`, dézoome sur 7 jours. Que se passe-t-il ? » (attendu : trous / sur-lissage)
- « Dans le panel Duration, enlève `le` du `by`. Le chiffre change-t-il ? Est-il juste ? » (attendu : plausible mais faux)
- « Montre-moi `by` vs `without` : réécris le débit par route en agrégeant les instances avec `without`. »
- « Change `$service` dans le menu. Qu'est-ce qui suit, et pourquoi un seul dashboard suffit pour N services ? »
- « Rate OK, Errors bas, p99 à 3 s : ton diagnostic pour le support ? » (attendu : latence, pas erreurs)

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reconstruis le dashboard RED **de mémoire, en 30 min**, sur un nouveau service (workers d'e-mail exposant `tribuzen_email_send_duration_seconds`).
2. Ajoute une **variable d'intervalle** (type *Interval*, valeurs `1m,5m,15m,1h`) nommée `window`, et fais-la piloter au moins un panel : `rate(...[$window])`. Sache dire au coach quand `$window` est pertinent vs `$__rate_interval`.
3. Réécris le panel Rate en utilisant **`without`** au lieu de `by`, et explique en une phrase pourquoi `without (instance)` est plus robuste si on ajoute un label `version` demain.
4. Ajoute un **panel Stat** « p99 actuel » avec un seuil rouge à 0,3 s (300 ms).

**Critère de réussite :** le dashboard fonctionne, `$service` et `$window` changent les panels, le panel `without` donne le même débit par route que la version `by`, et zéro fenêtre `rate()` codée en dur (sauf via `$window`, qui est volontaire).

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, le dashboard sera versionné (exporté en JSON) et provisionné :

```
tribuzen/
  ops/
    grafana/
      provisioning/
        datasources/datasources.yml   ← connexion Prometheus (access: proxy)
        dashboards/dashboards.yml      ← provider file → charge les .json
      dashboards/
        tribuzen-red.json              ← le dashboard RED exporté
```

**Différences avec le lab :**
- On **exporte** le dashboard en JSON et on le **committe** (au lab, on clique dans l'UI). Le versionnage + GitOps est le **module 13** (observability-as-code).
- La datasource et le provider dashboards sont provisionnés au démarrage (pas créés à la main).
- Les seuils (p99, taux d'erreur) seront **calés sur les SLO** définis au **module 08**, pas choisis à la louche.

**Commit cible :**
```
feat(observability): dashboard Grafana RED de l'API — rate/errors/duration + variable service
```

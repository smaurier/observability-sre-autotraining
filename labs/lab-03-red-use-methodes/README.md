# Lab 03 — Définir les métriques RED/USE de l'API TribuZen

> **Outcome :** à la fin, tu sais produire, pour un service et ses ressources, le tableau RED/USE complet **et** la PromQL de chaque signal, vérifiée contre un vrai Prometheus.
> **Vrai outil :** la stack du cours — `docker compose -f docker-compose.full.yml up` (demo-app + Prometheus sur `:9090` + Grafana sur `:3001`) qui scrape la `demo-app` (l'API TribuZen). PromQL exécutée dans l'explorateur Prometheus, pas simulée.
> **Feedback :** le coach valide en session avec la grille ci-dessous. Pas de test-runner auto-correcteur.

---

## Énoncé

Tu prépares la mise en production du **service `orders`** de l'API TribuZen (créer / lister des commandes d'activité tribu). Avant le go, l'équipe exige un **contrat d'observabilité** : le petit jeu de métriques qu'on suivra, choisi avec méthode — pas 100 courbes au hasard.

Tu dois livrer un document `red-use-tribuzen.md` contenant **trois livrables** :

1. **Table RED** du service `orders` — les 3 signaux, la PromQL de chacun, et le seuil indicatif.
2. **Table USE** d'**au moins deux ressources** derrière ce service (au choix : event loop Node.js, pool de connexions DB, heap V8, CPU process) — les 3 signaux par ressource, avec pour chacune le **signal de saturation** identifié explicitement.
3. **Mapping 4 signaux dorés** — un tableau qui relie Latency/Traffic/Errors/Saturation à tes lignes RED/USE, pour le dashboard de tête.

Contraintes de méthode (non négociables, ce sont elles qu'on évalue) :
- Duration en **percentiles** (P50/P95/P99), jamais en moyenne.
- Latence des **succès séparée** de celle des échecs (filtre `status`).
- Errors **croisé avec Rate** (les deux présents).
- **Zéro label à cardinalité non bornée** (`user_id`, `request_id`… interdits dans les métriques).
- Pour USE, chaque ressource DOIT nommer son signal de **saturation** (pas seulement l'utilisation).

**Pas de gap-fill.** Tu écris les PromQL toi-même à partir des métriques réellement exposées.

### Métriques réellement exposées par la demo-app (source `metrics.ts`)

```
http_requests_total{method, route, status}        # Counter
http_request_duration_seconds{method, route, status}  # Histogram → _bucket / _sum / _count
http_requests_in_flight                            # Gauge
orders_created_total{status}                       # Counter (métier)
process_cpu_seconds_total                          # défaut prom-client
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes  # défaut prom-client
```

### Démarrer la stack et générer du trafic

```bash
# À la racine du cours 16-observability-sre
docker compose -f docker-compose.full.yml up -d
# Génère du trafic sur l'API pour que les métriques bougent
for i in $(seq 1 200); do curl -s localhost:3000/products > /dev/null; done
# Ouvre l'explorateur Prometheus : http://localhost:9090/graph
```

Chaque PromQL que tu écris, tu la **colles dans l'explorateur** et tu vérifies qu'elle renvoie une série non vide.

---

## Étapes (en friction)

1. **Classe d'abord.** Pour chaque chose à observer, écris à côté « service » ou « ressource ». `orders` = service → RED. Event loop, pool DB, heap, CPU = ressources → USE. Cette classification conditionne tout.
2. **Écris la table RED d'`orders`.** Rate (par route), Errors (5xx/total), Duration (P50/P95/P99 des succès). Teste chaque PromQL dans Prometheus.
3. **Ajoute la séparation succès/échec** sur la Duration : une requête pour les 2xx, une pour les 5xx. Observe la différence à l'écran.
4. **Choisis 2 ressources** et écris leur table USE. Pour chacune, la ligne la plus importante est la **Saturation** — nomme le signal concret (lag, requêtes en attente, in-flight).
5. **Provoque une dérive** pour rendre les courbes vivantes : lance beaucoup de requêtes en parallèle et regarde `http_requests_in_flight` monter (proxy de saturation).
6. **Construis le mapping 4 signaux dorés** : une ligne Latency, Traffic, Errors, Saturation, chacune renvoyant à une PromQL déjà écrite.
7. **Passe la grille d'auto-évaluation** avant de montrer au coach.

---

## Corrigé complet commenté

> Un corrigé possible — pas le seul. Ce qui compte : la bonne méthode par élément et des PromQL qui renvoient une série réelle.

### 1. Table RED — service `orders`

```promql
# R — Rate : requêtes/seconde sur les routes /orders, moyenné 5 min
sum by (route) (rate(http_requests_total{route=~"/orders.*"}[5m]))

# E — Errors : proportion de 5xx (erreurs SERVEUR) sur le total /orders
# On croise implicitement avec R (même dénominateur = le volume).
100 * (
  sum(rate(http_requests_total{route=~"/orders.*", status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total{route=~"/orders.*"}[5m]))
)

# D — Duration : percentiles des SUCCÈS (status 2xx) uniquement
histogram_quantile(0.50,
  sum by (le) (rate(http_request_duration_seconds_bucket{route=~"/orders.*", status=~"2.."}[5m])))
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{route=~"/orders.*", status=~"2.."}[5m])))
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route=~"/orders.*", status=~"2.."}[5m])))

# D (échecs) — latence des 5xx, à comparer à celle des succès
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket{route=~"/orders.*", status=~"5.."}[5m])))
```

| Signal | Ce qu'il répond | Seuil indicatif |
|--------|-----------------|-----------------|
| Rate | à quelle vitesse `orders` travaille | chute > 80 % vs baseline |
| Errors | % de requêtes serveur en échec | > 1 % sur 5 min |
| Duration (P99 succès) | temps de réponse ressenti | > 500 ms |

**Pourquoi c'est correct :** Duration en percentiles (pas de moyenne), succès et échecs séparés par le filtre `status`, Errors et Rate partagent le volume donc se lisent ensemble. Labels bornés (`route`, `status`).

### 2. Tables USE — deux ressources

**Ressource A — Pool de connexions DB** *(la plus probable derrière des 5xx lents sur une écriture)*

| Signal | PromQL / mesure | Note |
|--------|-----------------|------|
| Utilization | `db_pool_active / db_pool_max` | 100 % = suspect, pas une preuve |
| **Saturation** | `db_pool_waiting` (requêtes en attente d'une connexion) | **LE signal** : file d'attente = douleur |
| Errors | `rate(db_connection_errors_total[5m])` | timeouts / refus de connexion |

> `db_pool_*` s'instrumente au module 05 (instrumentation). En attendant, le proxy disponible dès aujourd'hui côté service :
> ```promql
> # Saturation observable maintenant : requêtes en cours qui ne s'écoulent plus
> http_requests_in_flight
> ```

**Ressource B — Event loop Node.js**

| Signal | PromQL / mesure | Note |
|--------|-----------------|------|
| Utilization | `rate(process_cpu_seconds_total[1m])` | le process est-il occupé |
| **Saturation** | lag de l'event loop (`nodejs_eventloop_lag_seconds`) | **> 100 ms = saturé** (équivalent du load average pour Node) |
| Errors | — (pas d'erreur propre à l'event loop) | tiret assumé |

**Pourquoi c'est correct :** chaque ressource nomme explicitement sa **saturation** (waiting, lag), pas seulement son utilisation. On assume le tiret quand une case n'a pas de sens (Errors de l'event loop) — c'est prévu par la méthode USE.

### 3. Mapping 4 signaux dorés (dashboard de tête)

| Signal doré | Source | PromQL réutilisée |
|-------------|--------|-------------------|
| Latency | Duration (RED) | `histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{status=~"2.."}[5m])))` |
| Traffic | Rate (RED) | `sum(rate(http_requests_total[5m]))` |
| Errors | Errors (RED) | `100 * sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| Saturation | Saturation (USE) | `http_requests_in_flight` + lag event loop |

**Pourquoi c'est correct :** les 4 signaux dorés = RED + le S de USE. Chaque ligne pointe une PromQL déjà écrite : le dashboard de tête ne réinvente rien, il agrège.

---

## Grille d'auto-évaluation (avant de montrer au coach)

- [ ] Chaque élément observé est classé **service (RED)** ou **ressource (USE)** — aucun mélange (pas de RED sur un CPU, pas de USE sur un endpoint).
- [ ] La table RED a bien **Rate, Errors, Duration** et Errors est lisible **croisé avec Rate**.
- [ ] Duration est en **percentiles** (P50/P95/P99), **aucune** moyenne `_sum/_count`.
- [ ] Latence **succès et échecs séparées** (filtre `status`).
- [ ] Chaque ressource USE **nomme son signal de saturation** (pas juste l'utilisation).
- [ ] **Aucun label à cardinalité non bornée** (`user_id`, `request_id`, `session_id`).
- [ ] Le mapping 4 signaux dorés **réutilise** les PromQL RED/USE (ne les réinvente pas).
- [ ] **Chaque PromQL renvoie une série non vide** dans l'explorateur Prometheus `:9090`.

## Coach — points de contrôle en session

- Demande à l'apprenant de **justifier oralement le classement** service/ressource d'un élément ambigu (« et le pool DB, pourquoi USE et pas RED ? »). S'il hésite, revenir au module §2.1.
- Faire **provoquer une saturation en direct** (rafale de requêtes parallèles) et lire `http_requests_in_flight` monter : la saturation doit se *voir*, pas se raconter.
- Piège à tendre : proposer une métrique « nombre total de commandes depuis le lancement » et demander si elle mérite le dashboard → doit être identifiée comme **vanity metric** (préférer `rate(orders_created_total[5m])`).
- Vérifier que l'apprenant sait dire **ce que RED ne dit pas** (le *pourquoi* d'une panne ressource → USE) et inversement.

## Variante J+30 (fading)

Reprends l'exercice **de mémoire, en 25 minutes, sans rouvrir ce corrigé ni le module**, avec deux contraintes ajoutées :

1. **Nouveau service** : le service `payments` (route `/orders/:id/pay`), pas `orders`. Réécris sa table RED de zéro.
2. **Alerte multi-fenêtres** : pour Errors, propose une seconde PromQL sur une fenêtre courte (`[1m]`) en plus de `[5m]`, et explique en une phrase pourquoi une alerte fiable croise une fenêtre longue (peu de faux positifs) et une courte (réactivité) — teaser du module 09 (burn-rate).

**Critère de réussite :** les trois livrables (RED, USE ×2, mapping doré) reproduits sans support, PromQL testées et non vides, et la distinction fenêtre courte/longue expliquée juste.

---

## Application TribuZen

Livrable porté dans `smaurier/tribuzen` :

```
tribuzen/
  apps/api/
    docs/
      red-use-tribuzen.md   ← le contrat d'observabilité : tables RED/USE + PromQL par service
    src/observability/
      metrics.ts            ← les Counters/Histograms posés au module 02, référencés ici
```

**Différences par rapport au lab :**
- `nodejs_eventloop_lag_seconds` (et les métriques heap) arrivent **gratuitement dès le module 02** via `collectDefaultMetrics()` ; les `db_pool_*` seront réellement instrumentées au **module 05**. Ici tu documentes *quel signal suivre*, la pose du code custom vient après.
- Les seuils indicatifs (« P99 < 500 ms ») deviendront des **SLO contractuels avec error budget** au **module 08** — ce document en est la matière première.

**Commit cible :**
```
docs(observability): contrat RED/USE du service orders — PromQL + 4 signaux dorés
```

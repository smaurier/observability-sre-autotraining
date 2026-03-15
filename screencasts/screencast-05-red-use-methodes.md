# Screencast 06 — Méthodes RED & USE

## Informations
- **Duree estimee** : 18-22 min
- **Module** : `modules/06-red-use-methodes.md`
- **Lab associe** : Lab 06
- **Prérequis** : Screencast 05

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal intégré ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.base.yml up -d`)
- [ ] Prometheus UI ouvert sur `http://localhost:9090`
- [ ] demo-app accessible sur `http://localhost:3000`
- [ ] Script de génération de trafic pret

## Script

### [00:00-02:00] Introduction

> Nous avons des metriques et Prometheus. Mais quelles metriques regarder en premier ? Aujourd'hui, nous decouvrons deux méthodes eprouvees pour structurer notre reflexion : RED pour les services et USE pour les ressources. Ce sont des modèles mentaux qui repondent à la question : "Par où commencer quand quelque chose ne va pas ?"

### [02:00-05:00] La méthode RED — Rate, Errors, Duration

> RED a ete popularisee par Tom Wilkie de Grafana Labs. Elle se concentre sur les services — ce que vos utilisateurs experimentent.

**Action** : Écrire les définitions.

```typescript
// RED — Pour chaque service, mesurez :
//
// R — Rate    : combien de requetes par seconde ?
// E — Errors  : combien echouent ?
// D — Duration : combien de temps prennent-elles ?
//
// C'est du point de vue de l'UTILISATEUR du service.
```

**Action** : Montrer les requêtes PromQL correspondantes dans Prometheus.

```
# R — Rate : requetes par seconde
sum(rate(demo_app_http_requests_total[5m]))

# E — Errors : taux d'erreur en pourcentage
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(demo_app_http_requests_total[5m]))
* 100

# D — Duration : 99e percentile de latence
histogram_quantile(0.99, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le))
```

> Avec ces trois metriques, vous savez si votre service est en bonne sante. Le Rate vous dit si le trafic est normal. Les Errors montrent le pourcentage de requêtes qui echouent. La Duration revele si les requêtes sont lentes.

### [05:00-08:00] Instrumenter la demo-app avec RED

**Action** : Envoyer du trafic varie vers la demo-app.

```bash
# Trafic normal
for i in $(seq 1 100); do
  curl -s http://localhost:3000/api/orders > /dev/null
  curl -s http://localhost:3000/api/products > /dev/null
done
```

**Action** : Observer les metriques RED dans Prometheus.

```
# Rate par route
sum by (route) (rate(demo_app_http_requests_total[5m]))
```

> On voit le debit par route. Si une route recoit soudainement 10x plus de trafic, c'est visible immediatement.

```
# Errors par route
sum by (route) (rate(demo_app_http_requests_total{status_code=~"[45].."}[5m]))
```

```
# Duration — p50 et p99 par route
histogram_quantile(0.5, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le, route))

histogram_quantile(0.99, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le, route))
```

> Comparez le p50 (median) et le p99. Si le p50 est a 10ms mais le p99 est a 2 secondes, vous avez un problème de latence en queue de distribution. Certains utilisateurs ont une experience degradee.

### [08:00-11:00] La méthode USE — Utilization, Saturation, Errors

> USE a ete créée par Brendan Gregg. Elle se concentre sur les ressources — CPU, mémoire, disque, réseau, event loop.

**Action** : Écrire les définitions.

```typescript
// USE — Pour chaque ressource, mesurez :
//
// U — Utilization : quel pourcentage de la capacite est utilise ?
// S — Saturation  : y a-t-il une file d'attente ? Des requetes en attente ?
// E — Errors      : y a-t-il des erreurs sur cette ressource ?
//
// C'est du point de vue de l'INFRASTRUCTURE.
```

**Action** : Montrer les metriques USE pour Node.js dans Prometheus.

```
# U — Utilization : memoire utilisee par rapport a la totale
demo_app_nodejs_heap_size_used_bytes
/
demo_app_nodejs_heap_size_total_bytes

# S — Saturation : latence de l'event loop (la file d'attente de Node.js)
demo_app_nodejs_eventloop_lag_seconds

# E — Errors : erreurs sur les ressources (connexions refusees, timeouts)
rate(demo_app_http_requests_total{status_code="503"}[5m])
```

> L'event loop lag est la metrique de saturation la plus importante pour Node.js. Quand le thread principal est surcharge, les requêtes s'empilent dans la file d'attente et le lag augmente. Si le lag dépasse 100ms, vos utilisateurs le ressentent.

### [11:00-14:00] Event loop lag en detail

**Action** : Montrer le graphique de l'event loop lag dans Prometheus.

```
# Event loop lag — histogramme
histogram_quantile(0.99, rate(demo_app_nodejs_eventloop_lag_seconds_bucket[5m]))
```

> L'event loop est le coeur de Node.js. Toute operation synchrone bloque l'event loop. Un JSON.parse sur un objet de 10 Mo, un calcul crypto, une boucle longue — tout cela augmente le lag.

**Action** : Montrer un exemple de code qui bloquerait l'event loop.

```typescript
// MAUVAIS — bloque l'event loop
app.get('/api/heavy', (req, res) => {
  const data = JSON.parse(hugeJsonString); // 10 Mo de JSON = event loop bloque
  res.json(data);
});

// BON — utiliser des streams ou du traitement asynchrone
app.get('/api/heavy', async (req, res) => {
  const stream = createReadStream('large-file.json');
  stream.pipe(res);
});
```

### [14:00-17:00] RED + USE : le modèle mental complet

> RED et USE sont complementaires. RED vous dit comment vos utilisateurs experimentent le service. USE vous dit pourquoi.

**Action** : Dessiner le lien entre les deux.

```
Symptome (RED)                →    Cause (USE)
─────────────────────────────────────────────────
Latence elevee (Duration)     →    Event loop sature (Saturation)
Taux d'erreur haut (Errors)   →    Memoire pleine (Utilization)
Debit en baisse (Rate)        →    CPU a 100% (Utilization)
```

**Action** : Montrer un scenario concret.

> Scenario : le taux d'erreur monte a 5%. C'est RED qui vous alerte. Vous regardez USE : l'event loop lag est a 500ms. Saturation. Vous regardez les traces : une requête fait un JSON.parse sur un objet enorme. Cause identifiee.

```
# Dashboard mental en 6 requetes
# RED
sum(rate(demo_app_http_requests_total[5m]))                                    # Rate
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(demo_app_http_requests_total[5m])) * 100  # Error %
histogram_quantile(0.99, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le))  # Duration p99

# USE
demo_app_nodejs_heap_size_used_bytes / demo_app_nodejs_heap_size_total_bytes   # Utilization
demo_app_nodejs_eventloop_lag_seconds                                          # Saturation
rate(demo_app_http_requests_total{status_code="503"}[5m])                      # Errors
```

### [17:00-19:30] Construire un reflexe

> Quand un incident arrive, votre premier reflexe doit etre de regarder RED puis USE.

**Action** : Montrer le workflow de diagnostic.

```typescript
// Workflow de diagnostic
// 1. Regarder RED : est-ce que le Rate, les Errors ou la Duration sont anormaux ?
// 2. Si oui, regarder USE : quelle ressource est sous pression ?
// 3. Correler avec les traces : quelle requete ou quel service cause le probleme ?
// 4. Plonger dans les logs : quel est le detail de l'erreur ?
//
// RED → USE → Traces → Logs
// C'est la cascade de diagnostic que nous utiliserons tout au long du cours.
```

> Ce workflow sera la base de nos dashboards Grafana dans le module 09 et de nos SLOs dans le module 10.

### [19:30-21:00] Récapitulatif

> Recapitulons. RED mesure l'experience utilisateur : Rate, Errors, Duration. USE mesure la sante des ressources : Utilization, Saturation, Errors. Les deux sont complementaires — RED détecté les symptomes, USE identifie les causes.

> L'event loop lag est la metrique de saturation la plus critique pour Node.js. Surveillez-le en permanence.

> Dans le prochain module, nous plongeons dans le troisieme pilier : les traces distribuees avec OpenTelemetry. Faites le Lab 06 pour construire votre dashboard RED/USE.

## Points d'attention pour l'enregistrement
- Prendre le temps d'expliquer les analogies RED et USE — ce sont des modèles mentaux
- Montrer les graphiques Prometheus en temps réel avec du trafic
- Insister sur l'event loop lag — c'est spécifique a Node.js et très important
- Le lien RED (symptome) → USE (cause) est le point clé du module
- Montrer le workflow de diagnostic RED → USE → Traces → Logs
- S'assurer que Docker Compose est bien lance avec Prometheus

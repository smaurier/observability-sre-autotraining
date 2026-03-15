# Screencast 09 — Grafana Dashboards & PromQL

## Informations
- **Duree estimee** : 18-22 min
- **Module** : `modules/09-grafana-dashboards.md`
- **Lab associe** : Lab 09
- **Prérequis** : Screencast 08

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal intégré ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Prometheus accessible sur `http://localhost:9090`
- [ ] Grafana accessible sur `http://localhost:3001` (login: admin/admin)
- [ ] demo-app accessible sur `http://localhost:3000`
- [ ] Script de génération de trafic pret

## Script

### [00:00-02:00] Introduction

> Nous avons des metriques dans Prometheus et des traces dans Jaeger. Mais Prometheus n'est pas fait pour construire des dashboards operationnels. Aujourd'hui, nous decouvrons Grafana — l'outil de référence pour visualiser les metriques. Nous allons connecter Grafana a Prometheus, maîtriser PromQL en profondeur, et construire un dashboard RED complet étape par étape.

### [02:00-04:30] Lancer Grafana et ajouter la datasource Prometheus

**Action** : Ouvrir Grafana sur `http://localhost:3001`.

> Grafana est déjà lance via Docker Compose. Connectez-vous avec admin/admin. A la première connexion, Grafana demandé de changer le mot de passe — vous pouvez le skipper en dev.

**Action** : Naviguer vers Configuration > Data Sources > Add data source.

> Selectionnez Prometheus. Dans le champ URL, entrez `http://prometheus:9090`. C'est le nom du service Docker, pas localhost, car Grafana tourne dans le même réseau Docker que Prometheus.

**Action** : Cliquer sur "Save & Test".

> Le message "Data source is working" confirme que Grafana peut interroger Prometheus. Si vous avez une erreur, verifiez que Prometheus est bien up avec `docker compose ps`.

### [04:30-08:00] PromQL avance — rate(), histogram_quantile(), aggregations

**Action** : Ouvrir l'Explore de Grafana pour tester des requêtes.

> Avant de construire le dashboard, maitrisons les requêtes. L'Explore de Grafana est un bac a sable pour tester PromQL.

```
# rate() — taux de changement par seconde sur une fenetre
rate(demo_app_http_requests_total[5m])
```

> `rate()` est la fonction la plus utilisee. Elle prend un counter et retourne le nombre moyen d'increments par seconde sur la fenêtre de 5 minutes. Sans rate(), un counter est juste un nombre qui monte — inutile pour un graphique.

```
# sum() avec by — agreger par label
sum by (route) (rate(demo_app_http_requests_total[5m]))
```

> `sum by (route)` additionne les series par route. Si vous avez 3 instances du même service, les valeurs sont agregees. C'est essentiel en production avec plusieurs replicas.

```
# histogram_quantile() — calculer les percentiles
histogram_quantile(0.99, sum by (le) (rate(demo_app_http_request_duration_seconds_bucket[5m])))
```

> `histogram_quantile` transforme les buckets de l'histogram en percentile. Le 0.99 donne le 99e percentile — la latence en dessous de laquelle 99% des requêtes sont servies. Le `by (le)` est obligatoire — `le` est le label des bornes de buckets.

```
# Combiner rate() et division pour un pourcentage
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(demo_app_http_requests_total[5m]))
* 100
```

> Le taux d'erreur en pourcentage. Numerateur : requêtes 5xx par seconde. Denominateur : toutes les requêtes par seconde. Multiplie par 100 pour un pourcentage lisible.

### [08:00-11:00] Construire le dashboard RED — Panel Request Rate

**Action** : Créer un nouveau dashboard dans Grafana. Cliquer sur le + > Dashboard > Add visualization.

> Nous allons construire un dashboard RED avec trois panels : Rate, Errors, Duration. Commencons par le Rate.

**Action** : Configurer le panel Request Rate.

```
# Requete PromQL pour le panel Rate
sum by (route) (rate(demo_app_http_requests_total[5m]))
```

> Selectionnez le type "Time series". Dans le titre, mettez "Request Rate (req/s)". Dans l'onglet Standard options, mettez l'unite en "requests/sec". Activez la legende avec les labels de route.

**Action** : Envoyer du trafic pour voir des donnees.

```bash
# Generer du trafic varie
for i in $(seq 1 200); do
  curl -s http://localhost:3000/api/orders > /dev/null
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/health > /dev/null
done
```

> Le graphique se remplit. Chaque ligne represente une route. Vous voyez le debit en requêtes par seconde — c'est le R de RED.

### [11:00-14:00] Panel Error Rate et Panel Latency Percentiles

**Action** : Ajouter un deuxieme panel pour le taux d'erreur.

```
# Requete PromQL pour le panel Error Rate
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(demo_app_http_requests_total[5m]))
* 100
```

> Titre : "Error Rate (%)". Type : Time series. Unite : percent (0-100). Ajoutez un seuil rouge a 1% — si le taux d'erreur dépasse 1%, la zone se colore en rouge. C'est le E de RED.

**Action** : Ajouter un troisieme panel pour les percentiles de latence.

```
# p50 — latence mediane
histogram_quantile(0.5, sum by (le) (rate(demo_app_http_request_duration_seconds_bucket[5m])))

# p95
histogram_quantile(0.95, sum by (le) (rate(demo_app_http_request_duration_seconds_bucket[5m])))

# p99
histogram_quantile(0.99, sum by (le) (rate(demo_app_http_request_duration_seconds_bucket[5m])))
```

> Ajoutez ces trois requêtes dans le même panel. Titre : "Latency Percentiles". Type : Time series. Unite : seconds. Le p50 montre l'experience mediane, le p95 l'experience de la majorite, et le p99 celle des utilisateurs les plus malchanceux. C'est le D de RED.

### [14:00-17:00] Template variables pour le filtrage par service

**Action** : Naviguer vers Dashboard Settings > Variables > Add variable.

> Les template variables rendent un dashboard réutilisable. Au lieu de hardcoder le nom du service, on créé une variable.

**Action** : Configurer la variable.

```
Nom    : service
Type   : Query
Query  : label_values(demo_app_http_requests_total, job)
```

> Cette requête extrait toutes les valeurs du label `job` des metriques. En production avec plusieurs services, un menu deroulant apparait en haut du dashboard pour filtrer.

**Action** : Modifier les requêtes des panels pour utiliser la variable.

```
# Avant
sum by (route) (rate(demo_app_http_requests_total[5m]))

# Apres — avec la variable $service
sum by (route) (rate(demo_app_http_requests_total{job="$service"}[5m]))
```

> Desormais, quand vous changez la valeur du menu deroulant, tous les panels se mettent a jour automatiquement. Un seul dashboard pour tous vos services.

### [17:00-19:30] Organiser et sauvegarder le dashboard

**Action** : Reorganiser les panels en grille.

> Placez le Rate en haut a gauche, l'Error Rate en haut a droite, et les Latency Percentiles en pleine largeur en dessous. Ajoutez des annotations de texte pour separer les sections.

**Action** : Ajouter un panel de type Stat pour les valeurs instantanees.

```
# Requetes par seconde — valeur instantanee
sum(rate(demo_app_http_requests_total[5m]))
```

> Les panels Stat montrent une seule valeur en grand. Placez-les tout en haut comme des compteurs de tableau de bord.

**Action** : Sauvegarder le dashboard avec Ctrl+S.

> Donnez un nom : "RED Dashboard — demo-app". Ajoutez un tag "sre". Le dashboard est sauvegarde dans Grafana.

### [19:30-21:00] Récapitulatif

> Recapitulons. Grafana se connecte a Prometheus via la datasource. PromQL est le langage de requête — les fonctions clés sont rate(), sum by(), histogram_quantile(). Le dashboard RED se compose de trois categories de panels : Request Rate (debit), Error Rate (taux d'erreur) et Duration (latence par percentiles). Les template variables rendent le dashboard réutilisable.

> Ce dashboard sera la base de nos SLOs dans le module 10 et de nos alertes dans le module 11. Faites le Lab 09 pour construire votre propre dashboard !

## Points d'attention pour l'enregistrement
- Se connecter a Grafana AVANT le screencast pour éviter le delai de chargement initial
- Envoyer du trafic AVANT de construire les panels pour avoir des donnees visibles
- Expliquer chaque requête PromQL ligne par ligne — ne pas aller trop vite
- Montrer l'Explore avant de construire les panels — ça permet de tester sans risque
- Le `by (le)` dans histogram_quantile est un piege classique — bien l'expliquer
- Insister sur les unites (seconds, percent, requests/sec) — un graphique sans unite est inutile
- La variable $service est un pattern de production important — montrer son utilite
- Sauvegarder regulierement le dashboard pendant la construction

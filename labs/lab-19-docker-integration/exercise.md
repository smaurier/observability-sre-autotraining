# Lab 20 — Guide pas a pas : Integration Docker

Ce lab est un guide pratique (walkthrough). Il n'y a pas de fichier TypeScript a ecrire :
vous allez manipuler Docker, Prometheus, Grafana et Jaeger directement.

---

## Etape 1 : Verifier les prerequis

Avant de commencer, assurez-vous que Docker et Docker Compose sont installes et fonctionnels.

```bash
docker --version
# Docker version 24.x ou superieur attendu

docker compose version
# Docker Compose version v2.x ou superieur attendu
```

Ensuite, positionnez-vous a la racine du projet et installez les dependances :

```bash
cd observability-sre-course
npm install
```

Puis installez les dependances de la demo-app :

```bash
cd demo-app
npm install
```

> **Astuce** : Si `npm install` echoue, verifiez votre version de Node.js (`node --version`).
> Le projet necessite Node.js 18 ou superieur.

---

## Etape 2 : Lancer la stack de base (Prometheus + Grafana)

On commence par lancer uniquement Prometheus et Grafana, sans la demo-app dans Docker.
La demo-app tournera en local sur votre machine.

```bash
# Depuis la racine du projet
docker compose -f docker-compose.base.yml up -d
```

Verifiez que les conteneurs sont en cours d'execution :

```bash
docker compose -f docker-compose.base.yml ps
```

Vous devriez voir deux services `running` : `prometheus` et `grafana`.

Ouvrez les interfaces dans votre navigateur :

| Service    | URL                        | Identifiants     |
|------------|----------------------------|------------------|
| Prometheus | http://localhost:9090       | aucun            |
| Grafana    | http://localhost:3001       | admin / admin    |

> **Note** : La demo-app n'est pas encore lancee. Prometheus ne trouvera pas sa target
> pour l'instant — c'est normal. On la lance a l'etape suivante.

> **Attention** : Lors de la premiere connexion a Grafana, il vous sera demande de changer
> le mot de passe. Vous pouvez cliquer sur "Skip" pour le moment.

---

## Etape 3 : Lancer la demo-app localement

Ouvrez un nouveau terminal et lancez la demo-app :

```bash
cd demo-app
npm run dev
```

L'application devrait demarrer sur le port 3000. Testez-la :

```bash
# Lister les produits
curl http://localhost:3000/api/products
```

Vous devriez obtenir un JSON contenant une liste de produits.

Maintenant, verifiez que la demo-app expose bien ses metriques Prometheus :

```bash
curl http://localhost:3000/metrics
```

La sortie ressemble a ceci :

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/products",status="200"} 1

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/api/products",le="0.005"} 1
http_request_duration_seconds_bucket{method="GET",route="/api/products",le="0.01"} 1
...

# HELP http_requests_in_flight Number of HTTP requests currently in flight
# TYPE http_requests_in_flight gauge
http_requests_in_flight 0
```

**Que signifie cette sortie ?**

- `http_requests_total` : un **compteur** (counter) qui s'incremente a chaque requete. Il est segmente par methode HTTP, route et code de statut.
- `http_request_duration_seconds` : un **histogramme** qui mesure la distribution des durees de requetes. Les `_bucket` representent les seuils (le = "less or equal").
- `http_requests_in_flight` : une **jauge** (gauge) qui indique le nombre de requetes en cours de traitement a cet instant.

Ce sont les metriques que Prometheus va scraper regulierement.

---

## Etape 4 : Verifier le scraping Prometheus

Ouvrez Prometheus dans votre navigateur : http://localhost:9090/targets

Vous devriez voir une target pour la demo-app. Son etat doit etre **UP** (en vert).

### Depannage : Prometheus ne voit pas la demo-app

> **Si la target est DOWN ou absente**, c'est probablement un probleme de reseau.
> Prometheus tourne dans Docker, mais la demo-app tourne sur votre machine hote.
>
> Sur **macOS** et **Windows** (Docker Desktop), utilisez `host.docker.internal` comme
> adresse au lieu de `localhost`.
>
> Sur **Linux**, ajoutez `extra_hosts: ["host.docker.internal:host-gateway"]` dans le
> service Prometheus de votre `docker-compose.base.yml`, ou utilisez `--network=host`.

Pour corriger la configuration Prometheus, editez le fichier `prometheus/prometheus.yml` :

```yaml
scrape_configs:
  - job_name: 'demo-app'
    scrape_interval: 15s
    static_configs:
      - targets: ['host.docker.internal:3000']
        # Remplacez 'localhost:3000' par 'host.docker.internal:3000'
        # si Prometheus tourne dans Docker et la demo-app en local
```

Apres modification, rechargez la configuration Prometheus sans redemarrer le conteneur :

```bash
# Option 1 : via l'API HTTP (si --web.enable-lifecycle est active)
curl -X POST http://localhost:9090/-/reload

# Option 2 : redemarrer le conteneur
docker compose -f docker-compose.base.yml restart prometheus
```

Retournez sur http://localhost:9090/targets et verifiez que la target est maintenant **UP**.

### Premiere requete PromQL

Dans l'interface Prometheus (http://localhost:9090), allez dans l'onglet **Graph** et
executez la requete suivante :

```promql
rate(http_requests_total[1m])
```

Cette requete calcule le **taux de requetes par seconde** sur la derniere minute.
Si vous n'avez envoye qu'une seule requete jusqu'ici, le resultat sera proche de zero.
C'est normal — on va generer du trafic a l'etape suivante.

---

## Etape 5 : Generer du trafic

Il est temps d'envoyer des requetes pour avoir des metriques interessantes.

### Trafic normal (100 iterations)

```bash
for i in $(seq 1 100); do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/products/prod-001 > /dev/null
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"productId":"prod-001","quantity":1}' \
    http://localhost:3000/api/orders > /dev/null
done
```

Ce script envoie 300 requetes au total (3 par iteration) :
- 100 GET sur `/api/products`
- 100 GET sur `/api/products/prod-001`
- 100 POST sur `/api/orders`

### Generer des erreurs 404

```bash
for i in $(seq 1 20); do
  curl -s http://localhost:3000/api/products/nonexistent > /dev/null
done
```

### Generer des erreurs 500 (si la demo-app le supporte)

```bash
for i in $(seq 1 10); do
  curl -s http://localhost:3000/api/orders -X POST \
    -H "Content-Type: application/json" \
    -d '{"productId":"invalid-product","quantity":-1}' > /dev/null
done
```

> **Attendez 30 secondes** apres avoir envoye le trafic. Prometheus scrape les metriques
> toutes les 15 secondes par defaut. Deux cycles de scrape suffisent pour que les donnees
> soient disponibles dans l'interface.

---

## Etape 6 : Explorer les metriques dans Prometheus

Retournez sur http://localhost:9090 et essayez les requetes suivantes dans l'onglet **Graph**.
Pour chaque requete, cliquez sur l'onglet **Graph** (pas **Table**) pour voir l'evolution
dans le temps.

### 6.1 — Taux de requetes global

```promql
rate(http_requests_total[5m])
```

**Explication** : Affiche le taux de requetes par seconde, par serie (chaque combinaison
unique de labels). Vous verrez plusieurs lignes, une par combinaison `{method, route, status}`.

### 6.2 — Taux de requetes reussies uniquement

```promql
rate(http_requests_total{status="200"}[5m])
```

**Explication** : Filtre uniquement les requetes avec un code HTTP 200. Les 404 et 500 sont
exclues. Comparez avec la requete precedente pour voir la proportion d'erreurs.

### 6.3 — Latence au 99e percentile

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Explication** : Calcule le temps de reponse en dessous duquel 99 % des requetes se situent.
C'est le **p99** — un indicateur cle en SRE. Si votre p99 est a 200 ms, cela signifie que
99 % de vos utilisateurs voient un temps de reponse inferieur a 200 ms.

### 6.4 — Requetes en cours

```promql
http_requests_in_flight
```

**Explication** : Jauge instantanee du nombre de requetes actuellement en cours de traitement.
En conditions normales, cette valeur devrait etre proche de zero (les requetes sont traitees
rapidement). Sous charge, elle augmente.

### 6.5 — Commandes creees

```promql
orders_created_total
```

**Explication** : Compteur du nombre total de commandes creees. Cette metrique est un exemple
de **metrique metier** — elle mesure un evenement fonctionnel, pas uniquement technique.

> **Astuce** : Utilisez `sum()` pour agreger les series.
> Par exemple : `sum(rate(http_requests_total[5m]))` donne le taux de requetes total,
> toutes routes et statuts confondus.

---

## Etape 7 : Creer un dashboard Grafana

C'est ici que l'observabilite prend tout son sens : on va construire un **dashboard RED**
(Rate, Errors, Duration) dans Grafana.

### 7.1 — Se connecter a Grafana

Ouvrez http://localhost:3001 et connectez-vous :
- **Login** : admin
- **Mot de passe** : admin

### 7.2 — Ajouter la datasource Prometheus

1. Menu lateral gauche → **Connections** → **Data sources**
2. Cliquez **Add data source**
3. Selectionnez **Prometheus**
4. Dans le champ **Prometheus server URL**, entrez : `http://prometheus:9090`

> **Important** : On utilise `prometheus` (le nom du service Docker) et non `localhost`,
> car Grafana tourne dans le meme reseau Docker que Prometheus.

5. Cliquez **Save & Test** — vous devez voir "Successfully queried the Prometheus API"

### 7.3 — Creer un nouveau dashboard

1. Menu lateral gauche → **Dashboards**
2. Cliquez **New** → **New Dashboard**
3. Cliquez **Add visualization**

### Panel 1 : Request Rate (Taux de requetes)

- **Datasource** : Prometheus
- **Requete PromQL** :

```promql
rate(http_requests_total[5m])
```

- **Visualization** : Time series
- **Titre du panel** : Request Rate (req/s)
- Cliquez **Apply**

### Panel 2 : Error Rate (Taux d'erreurs en %)

- Cliquez **Add** → **Visualization**
- **Requete PromQL** :

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100
```

- **Visualization** : Time series
- **Titre du panel** : Error Rate (%)
- Dans les options du panel, section **Standard options**, changez l'unite en **Percent (0-100)**
- Cliquez **Apply**

> **Explication de la requete** :
> - `status=~"5.."` est une regex qui matche tous les codes 5xx (500, 502, 503...)
> - Le numerateur est le taux d'erreurs 5xx
> - Le denominateur est le taux total de requetes
> - On multiplie par 100 pour obtenir un pourcentage

### Panel 3 : Latency p99 (Duree au 99e percentile)

- Cliquez **Add** → **Visualization**
- **Requete PromQL** :

```promql
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

- **Visualization** : Time series
- **Titre du panel** : Latency p99 (seconds)
- Dans les options du panel, section **Standard options**, changez l'unite en **seconds (s)**
- Cliquez **Apply**

> **Pourquoi `sum(...) by (le)` ?** L'histogramme Prometheus a un label `le` (less or equal)
> pour chaque bucket. On doit agreger toutes les autres dimensions (method, route...) tout en
> gardant le label `le`, sinon `histogram_quantile` ne peut pas calculer le percentile.

### 7.4 — Sauvegarder le dashboard

1. Cliquez sur l'icone de sauvegarde (disquette) en haut a droite
2. Nommez le dashboard : **RED Dashboard — Demo App**
3. Cliquez **Save**

> **Astuce** : Configurez l'auto-refresh a 10s (menu deroulant en haut a droite) pour voir
> les metriques evoluer en temps reel pendant que vous generez du trafic.

Votre dashboard RED est pret. Relancez le script de trafic de l'etape 5 et observez les
courbes bouger en temps reel.

---

## Etape 8 : Ajouter le tracing (stack complete)

Jusqu'ici, on avait uniquement des metriques. Ajoutons maintenant le **tracing distribue**
avec Jaeger.

### 8.1 — Arreter la stack de base

```bash
docker compose -f docker-compose.base.yml down
```

### 8.2 — Lancer la stack complete

```bash
docker compose -f docker-compose.full.yml up -d
```

Cette stack ajoute **Jaeger** (collecteur et UI de traces) en plus de Prometheus et Grafana.

Verifiez que tous les services sont en cours d'execution :

```bash
docker compose -f docker-compose.full.yml ps
```

> **Attendez que tous les services soient `running` et sains** avant de continuer.
> Cela peut prendre 30 a 60 secondes au premier lancement (telechargement des images Docker).

### 8.3 — Relancer la demo-app

Si la demo-app a ete arretee, relancez-la :

```bash
cd demo-app
npm run dev
```

> **Note** : La demo-app doit etre configuree pour envoyer ses traces a Jaeger.
> Verifiez que la variable d'environnement `OTEL_EXPORTER_OTLP_ENDPOINT` pointe vers
> `http://localhost:4318` (le port OTLP HTTP de Jaeger).

### 8.4 — Explorer Jaeger

Ouvrez Jaeger dans votre navigateur : http://localhost:16686

Envoyez quelques requetes pour generer des traces :

```bash
curl http://localhost:3000/api/products
curl http://localhost:3000/api/products/prod-001
curl -X POST -H "Content-Type: application/json" \
  -d '{"productId":"prod-001","quantity":2}' \
  http://localhost:3000/api/orders
```

Dans Jaeger :

1. Dans le menu deroulant **Service**, selectionnez le service de la demo-app
2. Cliquez **Find Traces**
3. Vous devriez voir les traces de vos requetes recentes

### 8.5 — Lire une trace (vue waterfall)

Cliquez sur une trace pour voir la **vue waterfall** (cascade). Chaque barre horizontale
represente un **span** (une unite de travail) :

- Le span racine represente la requete HTTP entrante
- Les spans enfants representent les operations internes (appels BDD, appels HTTP sortants, etc.)
- La largeur de chaque barre est proportionnelle a sa duree

**Ce que vous pouvez observer :**
- Le temps total de la requete
- Quelle operation prend le plus de temps
- S'il y a des appels sequentiels qui pourraient etre parallelises
- Les erreurs eventuelles (spans en rouge)

> **Astuce** : Comparez une requete GET simple (`/api/products`) avec une requete POST
> (`/api/orders`) — la commande devrait avoir plus de spans car elle implique plus d'operations.

---

## Etape 9 : Connecter les piliers

L'observabilite, c'est la **correlation** entre metriques, traces et logs.
Connectons Grafana a Jaeger pour pouvoir naviguer entre ces piliers.

### 9.1 — Ajouter Jaeger comme datasource dans Grafana

1. Ouvrez Grafana : http://localhost:3001
2. Menu lateral gauche → **Connections** → **Data sources**
3. Cliquez **Add data source**
4. Selectionnez **Jaeger**
5. Dans le champ **URL**, entrez : `http://jaeger:16686`
6. Cliquez **Save & Test**

### 9.2 — La boucle d'observabilite

Voici le workflow concret d'un SRE face a un incident :

```
 METRIQUES              TRACES                LOGS
    |                     |                     |
    v                     v                     v
 "QUOI"               "POURQUOI"             "COMMENT"
    |                     |                     |
    |   Je vois un pic    |                     |
    |   d'erreurs 5xx     |                     |
    |   a 14h32           |                     |
    |-------------------->|                     |
    |   Je cherche les    |                     |
    |   traces entre      |                     |
    |   14h30 et 14h35    |                     |
    |                     |                     |
    |                     |   Je trouve un span |
    |                     |   en erreur sur     |
    |                     |   /api/orders       |
    |                     |------------------->|
    |                     |   Je regarde les   |
    |                     |   logs de ce span  |
    |                     |   pour le detail   |
```

**En pratique :**

1. **Metriques (QUOI)** : Le dashboard RED montre un pic d'erreurs 5xx a 14h32.
   Le taux d'erreurs passe de 0 % a 15 %.

2. **Traces (POURQUOI)** : Dans Jaeger, filtrez les traces entre 14h30 et 14h35
   avec le tag `error=true`. Vous trouvez que les requetes POST sur `/api/orders`
   echouent systematiquement avec une erreur de base de donnees.

3. **Logs (COMMENT)** : Le span en erreur contient le message exact :
   `Connection refused: database:5432`. Le serveur de base de donnees est tombe.

### 9.3 — Exercice pratique

Essayez cette boucle vous-meme :

1. Relancez le script de trafic de l'etape 5 (y compris les erreurs)
2. Dans Grafana, observez le dashboard RED — repez le moment ou les erreurs apparaissent
3. Notez la fenetre temporelle
4. Ouvrez Jaeger et cherchez les traces dans cette fenetre temporelle
5. Explorez les spans en erreur

> **Felicitations** : Vous venez de realiser une investigation d'incident en utilisant les
> trois piliers de l'observabilite.

---

## Etape 10 : Nettoyage

Une fois le lab termine, arretez et nettoyez tout :

```bash
# Arreter la stack complete et supprimer les volumes
docker compose -f docker-compose.full.yml down -v

# Si vous aviez aussi lance la stack de base separement
docker compose -f docker-compose.base.yml down -v
```

> **Note** : Le flag `-v` supprime les volumes Docker (donnees de Prometheus, Grafana, Jaeger).
> Si vous voulez conserver vos dashboards Grafana, omettez `-v`.

Arretez egalement la demo-app (Ctrl+C dans le terminal ou elle tourne).

---

## Recapitulatif

| Etape | Ce que vous avez fait                                      |
|-------|------------------------------------------------------------|
| 1     | Verifie les prerequis (Docker, Node.js)                    |
| 2     | Lance Prometheus + Grafana avec Docker Compose              |
| 3     | Lance la demo-app localement et verifie `/metrics`          |
| 4     | Verifie le scraping Prometheus et execute une requete PromQL|
| 5     | Genere 300+ requetes de trafic (dont des erreurs)           |
| 6     | Explore les metriques PromQL (rate, quantile, gauge)        |
| 7     | Cree un dashboard RED dans Grafana (3 panels)               |
| 8     | Ajoute Jaeger pour le tracing distribue                     |
| 9     | Connecte les piliers : metriques → traces → logs            |
| 10    | Nettoye l'environnement                                     |

## Pour aller plus loin

- Ajoutez un panel **Saturation** au dashboard (CPU, memoire) pour transformer le RED en **USE**
- Configurez des **alertes Grafana** sur le taux d'erreurs (> 5 % pendant 5 minutes)
- Exportez votre dashboard en JSON et committez-le dans le repo
- Ajoutez **Loki** pour centraliser les logs et completer les trois piliers dans Grafana
- Essayez de creer un **SLO** (Service Level Objective) : 99.9 % de requetes sous 500 ms

---

## Depannage

### Prometheus ne scrape pas la demo-app

**Symptome** : La target est DOWN dans http://localhost:9090/targets

**Solutions** :
1. Verifiez que la demo-app tourne bien : `curl http://localhost:3000/metrics`
2. Sur macOS/Windows, remplacez `localhost` par `host.docker.internal` dans `prometheus.yml`
3. Sur Linux, ajoutez `extra_hosts: ["host.docker.internal:host-gateway"]` au service Prometheus
4. Rechargez la config : `curl -X POST http://localhost:9090/-/reload`

### Grafana n'arrive pas a joindre Prometheus

**Symptome** : "Error — Prometheus is not reachable" dans la datasource

**Solutions** :
1. Utilisez `http://prometheus:9090` (nom du service Docker), pas `http://localhost:9090`
2. Verifiez que les deux services sont dans le meme reseau Docker : `docker network ls`

### Jaeger ne montre pas de traces

**Symptome** : Aucune trace dans Jaeger apres avoir envoye des requetes

**Solutions** :
1. Verifiez que la demo-app est configuree pour envoyer des traces (variable `OTEL_EXPORTER_OTLP_ENDPOINT`)
2. Verifiez que Jaeger est accessible : `curl http://localhost:16686`
3. Attendez quelques secondes — les traces ne sont pas instantanees
4. Verifiez les logs de la demo-app pour des erreurs d'export de traces

### Les ports sont deja utilises

**Symptome** : `bind: address already in use`

**Solutions** :
1. Identifiez le processus qui utilise le port : `lsof -i :9090` (macOS/Linux) ou `netstat -ano | findstr :9090` (Windows)
2. Arretez le processus ou changez le port dans le `docker-compose.yml`

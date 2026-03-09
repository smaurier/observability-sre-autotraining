# Screencast 05 — Metriques avec prom-client & Prometheus

## Informations
- **Duree estimee** : 18-22 min
- **Module** : `modules/05-metriques-prometheus.md`
- **Lab associe** : Lab 05
- **Prerequis** : Screencast 04

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Desktop lance et fonctionnel
- [ ] Fichier `docker-compose.base.yml` ouvert
- [ ] Fichier `config/prometheus.yml` pret
- [ ] Navigateur ouvert avec onglets pour `localhost:3000` et `localhost:9090`

## Script

### [00:00-01:30] Introduction

> Dans le module precedent, nous avons ajoute des metriques a la demo-app avec prom-client. Aujourd'hui, nous allons lancer Prometheus avec Docker Compose, configurer le scraping, et ecrire nos premieres requetes PromQL. C'est ici que les metriques deviennent vraiment puissantes.

### [01:30-04:00] Architecture pull de Prometheus

> Prometheus utilise une architecture pull — c'est lui qui vient chercher les metriques, pas vos applications qui les envoient.

**Action** : Dessiner le schema dans un commentaire ou montrer un diagramme.

```
┌─────────────────┐     GET /metrics (toutes les 15s)    ┌──────────────────┐
│                  │ ──────────────────────────────────→  │                  │
│   Prometheus     │                                      │   demo-app       │
│   :9090          │ ←──────────────────────────────────  │   :3000/metrics  │
│                  │     reponse format Prometheus         │                  │
└─────────────────┘                                      └──────────────────┘
       │
       │  Stocke dans sa TSDB locale
       ▼
  [Requetes PromQL via l'UI web]
```

> Avantages du pull : Prometheus sait quelles cibles sont up ou down. Pas besoin de configurer chaque application pour savoir ou envoyer les donnees. Le scraping peut etre ajuste sans modifier l'application.

### [04:00-07:30] Docker Compose et configuration Prometheus

**Action** : Ouvrir `docker-compose.base.yml`.

```yaml
# docker-compose.base.yml
services:
  demo-app:
    build: ./demo-app
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info

  prometheus:
    image: prom/prometheus:v2.50.0
    ports:
      - '9090:9090'
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=7d'
```

**Action** : Ouvrir `config/prometheus.yml`.

```yaml
# config/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'demo-app'
    scrape_interval: 5s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['demo-app:3000']
        labels:
          environment: 'development'
          team: 'backend'
```

> La configuration est simple. `scrape_interval: 15s` dit a Prometheus de collecter toutes les 15 secondes par defaut. Pour notre demo-app, on met 5 secondes pour voir les changements plus vite. Le target utilise le nom du service Docker `demo-app:3000`.

**Action** : Lancer Docker Compose.

```bash
docker compose -f docker-compose.base.yml up -d
```

**Action** : Verifier que les conteneurs sont lances.

```bash
docker compose -f docker-compose.base.yml ps
```

### [07:30-10:00] Explorer l'UI Prometheus

**Action** : Ouvrir `http://localhost:9090` dans le navigateur.

> Voici l'interface web de Prometheus. Commencons par verifier que notre target est detectee.

**Action** : Naviguer vers Status > Targets.

> On doit voir deux targets : prometheus lui-meme (localhost:9090) et notre demo-app (demo-app:3000). Les deux doivent etre en etat UP avec un point vert. Si demo-app est DOWN, verifiez que le conteneur tourne et que le endpoint /metrics est accessible.

**Action** : Revenir sur la page Graph et taper une premiere requete.

```
demo_app_http_requests_total
```

> On voit toutes les series temporelles pour notre counter. Chaque combinaison de labels est une serie distincte. Pas encore beaucoup de donnees — envoyons du trafic.

**Action** : Envoyer du trafic dans un terminal.

```bash
for i in $(seq 1 50); do
  curl -s http://localhost:3000/health > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
  curl -s http://localhost:3000/api/products > /dev/null
done
```

### [10:00-14:00] PromQL de base — rate, increase, histogram_quantile

**Action** : Revenir dans l'UI Prometheus et passer en mode Graph.

> La requete la plus importante de PromQL est rate(). Elle calcule le taux de changement par seconde d'un counter sur une fenetre de temps.

**Action** : Taper les requetes suivantes une par une.

```
# Requetes par seconde sur les 5 dernieres minutes
rate(demo_app_http_requests_total[5m])
```

> Regardez le graphique. Chaque serie montre le nombre de requetes par seconde pour une combinaison method/route/status_code. C'est beaucoup plus utile que la valeur brute du counter.

```
# Requetes par seconde, filtrees sur une route
rate(demo_app_http_requests_total{route="/api/orders"}[5m])
```

```
# Nombre total de requetes dans les 5 dernieres minutes
increase(demo_app_http_requests_total[5m])
```

> `increase()` donne l'augmentation absolue sur la fenetre — c'est le nombre de requetes, pas le taux.

```
# 99e percentile de latence
histogram_quantile(0.99, rate(demo_app_http_request_duration_seconds_bucket[5m]))
```

> `histogram_quantile` calcule les percentiles a partir des buckets de l'histogram. Le 99e percentile signifie que 99% des requetes sont plus rapides que cette valeur.

```
# Taux d'erreur en pourcentage
sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(demo_app_http_requests_total[5m]))
* 100
```

> Cette requete divise le taux de requetes en erreur (5xx) par le taux total, puis multiplie par 100 pour avoir un pourcentage. C'est la base du calcul de SLI que nous verrons dans le module 10.

### [14:00-16:30] collectDefaultMetrics en detail

**Action** : Explorer les metriques par defaut dans Prometheus.

```
# Memoire heap utilisee
demo_app_nodejs_heap_size_used_bytes

# Latence de l'event loop
demo_app_nodejs_eventloop_lag_seconds

# Duree du garbage collector
rate(demo_app_nodejs_gc_duration_seconds_sum[5m])
```

> Les metriques par defaut sont gratuites et precieuses. La memoire heap vous alerte sur les memory leaks. La latence de l'event loop montre si le thread principal est surcharge. Le GC montre si le garbage collector travaille trop.

**Action** : Montrer le graphique de la memoire heap.

> Regardez ce graphique. On voit la memoire monter legerement puis redescendre lors du garbage collector. Si elle ne faisait que monter, ce serait un signe de memory leak.

### [16:30-19:00] Metriques metier

> Au-dela des metriques techniques, les metriques metier sont essentielles.

**Action** : Montrer un exemple de metriques metier dans le code.

```typescript
// Exemples de metriques metier
import { Counter, Histogram } from 'prom-client';

export const ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Nombre total de commandes creees',
  labelNames: ['status', 'payment_method'] as const,
});

export const orderAmountHistogram = new Histogram({
  name: 'order_amount_euros',
  help: 'Distribution des montants de commande en euros',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});
```

> Les metriques metier repondent aux questions du product owner : combien de commandes aujourd'hui ? Quel est le montant moyen ? Quel pourcentage echoue au paiement ? C'est le pont entre l'ingenierie et le business.

### [19:00-20:30] Recapitulatif

> Recapitulons. Prometheus fonctionne en pull — il vient chercher les metriques toutes les N secondes. La configuration se fait dans prometheus.yml. Les 4 fonctions PromQL essentielles sont rate(), increase(), histogram_quantile() et sum by().

> Les metriques par defaut de Node.js (heap, event loop, GC) sont gratuites et precieuses. Les metriques metier font le pont entre technique et business.

> Dans le prochain module, nous appliquerons les methodes RED et USE pour creer un modele mental de la sante de notre application. Faites le Lab 05 pour pratiquer Prometheus et PromQL !

**Action** : Arreter Docker Compose.

```bash
docker compose -f docker-compose.base.yml down
```

## Points d'attention pour l'enregistrement
- S'assurer que Docker est lance AVANT le screencast
- Verifier que les targets sont UP dans Prometheus avant d'avancer
- Envoyer du trafic AVANT de montrer les requetes PromQL pour avoir des donnees
- Prendre le temps d'expliquer rate() — c'est LA fonction la plus importante
- Montrer les graphiques en mode Graph (pas Table) pour les requetes PromQL
- Le taux d'erreur en pourcentage est un calcul important — bien l'expliquer
- Ne pas oublier de montrer les metriques par defaut Node.js

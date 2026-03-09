# Screencast 08 — OTel Collector & Pipeline d'observabilite

## Informations
- **Duree estimee** : 18-22 min
- **Module** : `modules/08-otel-collector-pipeline.md`
- **Lab associe** : Lab 08
- **Prerequis** : Screencast 07

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Desktop lance et fonctionnel
- [ ] Fichier `config/otel-collector/config.yaml` ouvert
- [ ] Fichier `docker-compose.full.yml` ouvert
- [ ] Navigateur ouvert avec onglets pour Jaeger (`localhost:16686`), Prometheus (`localhost:9090`)

## Script

### [00:00-02:00] Introduction

> Dans le module precedent, notre application envoyait les traces directement a Jaeger. Ca fonctionne en dev, mais en production, vous avez besoin d'un intermediaire : l'OpenTelemetry Collector. Il recoit les donnees de telemetrie, les traite et les route vers un ou plusieurs backends. C'est le hub central de votre pipeline d'observabilite.

> L'analogie : sans Collector, c'est comme si chaque habitant d'une ville envoyait directement ses lettres au destinataire. Avec un Collector, vous avez un bureau de poste central qui trie, regroupe et distribue le courrier.

### [02:00-06:00] Architecture du Collector — Receivers, Processors, Exporters

**Action** : Dessiner l'architecture dans un commentaire.

```
┌─────────────────────────────────────────────────────────┐
│                   OTel Collector                         │
│                                                         │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ Receivers  │───→│  Processors   │───→│  Exporters    │ │
│  │            │    │              │    │              │ │
│  │ - otlp     │    │ - batch      │    │ - otlp/jaeger│ │
│  │ - prometheus│   │ - memory_    │    │ - prometheus  │ │
│  │ - filelog   │    │   limiter   │    │ - logging    │ │
│  │            │    │ - filter     │    │              │ │
│  │            │    │ - tail_      │    │              │ │
│  │            │    │   sampling   │    │              │ │
│  └───────────┘    └──────────────┘    └──────────────┘ │
│                                                         │
│  Pipelines: traces, metrics, logs                       │
└─────────────────────────────────────────────────────────┘
```

> Le Collector est compose de trois blocs. Les Receivers recoivent les donnees — via OTLP (gRPC ou HTTP), en scrapant Prometheus, en lisant des fichiers de log. Les Processors transforment les donnees — regroupement en batch, limitation memoire, filtrage, echantillonnage. Les Exporters envoient les donnees aux backends — Jaeger, Prometheus, Loki, ou un autre Collector.

### [06:00-11:00] Ecrire la configuration YAML

**Action** : Ouvrir `config/otel-collector/config.yaml` et ecrire la configuration.

```yaml
# config/otel-collector/config.yaml

# --- RECEIVERS ---
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

# --- PROCESSORS ---
processors:
  batch:
    send_batch_size: 1024
    timeout: 5s
    send_batch_max_size: 2048

  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

# --- EXPORTERS ---
exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true

  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: otel

  logging:
    loglevel: info

# --- PIPELINES ---
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger, logging]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, logging]
```

> Detaillons chaque section. Le receiver OTLP ecoute sur deux ports : 4317 pour gRPC et 4318 pour HTTP. Notre application envoie en HTTP, d'autres applications pourraient utiliser gRPC.

> Le processor `batch` est essentiel en production. Au lieu d'envoyer chaque span individuellement, il les regroupe par lots de 1024. Ca reduit le nombre de connexions reseau et ameliore les performances. Le `timeout: 5s` garantit qu'un lot est envoye au maximum toutes les 5 secondes, meme s'il n'est pas plein.

> Le `memory_limiter` protege le Collector contre les pics de trafic. Si la memoire depasse 512 Mo, il commence a rejeter des donnees plutot que de crasher.

### [11:00-14:00] Visualiser le flux de donnees complet

**Action** : Montrer le flux de bout en bout.

```
App (SDK OTel)                OTel Collector              Backends
─────────────                ──────────────              ────────
                  OTLP/HTTP
demo-app:3000  ───────────→  collector:4318
                              │
                              ├─ memory_limiter
                              ├─ batch (regroupe par 1024)
                              │
                              ├──────────→  Jaeger:4317 (traces)
                              └──────────→  Prometheus:8889 (metriques)
```

**Action** : Lancer la stack complete.

```bash
docker compose -f docker-compose.full.yml up -d
```

**Action** : Verifier que tous les services sont up.

```bash
docker compose -f docker-compose.full.yml ps
```

> Tous les services doivent etre en etat running : demo-app, otel-collector, prometheus, jaeger, grafana.

### [14:00-17:00] Ajouter le tail sampling

> Le tail sampling est une strategie avancee. Contrairement au head sampling qui decide au debut de la trace si elle sera gardee, le tail sampling attend la fin de la trace pour decider. Resultat : vous gardez 100% des traces en erreur ou lentes, meme si vous echantillonnez 90% du trafic normal.

**Action** : Ajouter le processeur tail_sampling a la configuration.

```yaml
processors:
  batch:
    send_batch_size: 1024
    timeout: 5s

  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

  tail_sampling:
    decision_wait: 10s
    num_traces: 100
    policies:
      # Garder toutes les traces en erreur
      - name: errors-policy
        type: status_code
        status_code:
          status_codes: [ERROR]

      # Garder toutes les traces lentes (> 500ms)
      - name: latency-policy
        type: latency
        latency:
          threshold_ms: 500

      # Echantillonner 10% du trafic normal
      - name: probabilistic-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 10
```

> Le `decision_wait: 10s` dit au Collector d'attendre 10 secondes apres le dernier span recu pour cette trace avant de decider. Les trois politiques fonctionnent en OR : si la trace est en erreur OU lente OU selectionnee par le tirage a 10%, elle est gardee.

**Action** : Mettre a jour la pipeline traces pour inclure le tail sampling.

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlp/jaeger, logging]
```

> L'ordre des processeurs est important. Le memory_limiter est en premier pour proteger le Collector. Le tail_sampling vient avant le batch — il doit voir toutes les traces pour decider.

### [17:00-19:30] Observer les traces et metriques dans les backends

**Action** : Envoyer du trafic pour generer des donnees.

```bash
for i in $(seq 1 100); do
  curl -s http://localhost:3000/api/orders > /dev/null
  curl -s http://localhost:3000/api/products > /dev/null
done

# Quelques requetes qui generent des erreurs
for i in $(seq 1 10); do
  curl -s http://localhost:3000/api/orders/invalid > /dev/null
done
```

**Action** : Ouvrir Jaeger sur `http://localhost:16686` et montrer les traces.

> Les traces arrivent dans Jaeger en passant par le Collector. Remarquez que les traces en erreur sont presentes — le tail sampling les a gardees. Les traces normales sont echantillonnees a 10%.

**Action** : Ouvrir Prometheus sur `http://localhost:9090` et chercher les metriques OTel.

```
# Metriques exportees par le Collector vers Prometheus
otel_demo_app_http_requests_total
```

> Les metriques transitent aussi par le Collector, du meme SDK, vers Prometheus. Un seul SDK dans l'application, un seul Collector, plusieurs backends.

### [19:30-21:30] Recapitulatif

> Recapitulons. L'OTel Collector est le hub central de votre pipeline d'observabilite. Il decouple vos applications des backends — changer de backend ne necessite aucune modification de code. La configuration YAML definit les receivers, processors et exporters. Le batch processing ameliore les performances. Le memory_limiter protege contre les pics. Le tail sampling garde les traces importantes tout en reduisant le volume.

> Le flux complet est : Application → SDK OpenTelemetry → Collector → Backends (Jaeger, Prometheus, Grafana). C'est cette architecture que nous utiliserons pour le reste du cours.

> Dans le prochain module, nous construirons nos dashboards Grafana avec PromQL. Faites le Lab 08 !

**Action** : Laisser Docker Compose tourne pour le prochain module.

## Points d'attention pour l'enregistrement
- Le schema du Collector (receivers/processors/exporters) est le concept central — bien le dessiner
- Prendre le temps d'expliquer chaque section du YAML — ne pas aller trop vite
- Le batch processing et le memory_limiter sont des concepts de production importants
- Le tail sampling est une notion avancee — utiliser l'analogie head vs tail clairement
- Montrer les donnees qui arrivent dans Jaeger ET Prometheus pour prouver que le Collector route correctement
- L'ordre des processeurs dans la pipeline est important — insister dessus
- S'assurer que tous les conteneurs Docker sont up avant de commencer la demo

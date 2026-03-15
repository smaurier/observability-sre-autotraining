# OTel Collector & Pipeline d'observabilité

## Objectifs pedagogiques

- Comprendre pourquoi un Collector est essentiel (decouplage, traitement, routage)
- Maîtriser l'architecture du Collector (receivers, processors, exporters)
- Écrire et comprendre une configuration YAML complete
- Connaître le protocole OTLP (gRPC et HTTP)
- Utiliser les processeurs clés (batch, memory_limiter, filter, tail_sampling, attributes)
- Visualiser la pipeline complete : App → SDK → Collector → Backends
- Comparer le head-based et le tail-based sampling
- Choisir le bon pattern de déploiement (agent vs gateway)
- Configurer la stack complete du cours

---

## Pourquoi un Collector ?

### Le problème du couplage direct

Sans Collector, chaque application envoie ses donnees directement aux backends :

```
┌─────────┐     ┌───────────┐
│  App 1   │────→│ Jaeger     │
│          │────→│ Prometheus │
│          │────→│ Loki       │
└─────────┘     └───────────┘

┌─────────┐     ┌───────────┐
│  App 2   │────→│ Jaeger     │
│          │────→│ Prometheus │
│          │────→│ Loki       │
└─────────┘     └───────────┘
```

Problemes :
- Chaque application doit connaître l'adresse de chaque backend
- Changer de backend = modifier et redeployer **toutes** les applications
- Pas de traitement intermédiaire (filtrage, sampling, enrichissement)
- Chaque application géré ses propres retries et buffers

### La solution : le Collector comme intermédiaire

```
┌─────────┐           ┌───────────────┐           ┌───────────┐
│  App 1   │──OTLP──→│               │──export──→│ Jaeger     │
└─────────┘           │  OTel         │──export──→│ Prometheus │
                      │  Collector    │──export──→│ Loki       │
┌─────────┐           │               │           └───────────┘
│  App 2   │──OTLP──→│  (traitement) │
└─────────┘           └───────────────┘
```

Avantages :
- **Decouplage** : les applications n'envoient qu'à un seul endpoint (le Collector)
- **Traitement** : filtrage, sampling, enrichissement, transformation
- **Routage** : envoyer les traces a Jaeger, les metriques a Prometheus, les logs a Loki
- **Résilience** : buffering, retries, backpressure geres centralement
- **Agilite** : changer de backend sans toucher aux applications

---

## Architecture du Collector

Le Collector est structure en 3 composants organises en **pipelines** :

```
┌─────────────────────────────────────────────────────────────┐
│                      OTel Collector                          │
│                                                              │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │ Receivers │───→│ Processors   │───→│ Exporters    │      │
│   │          │    │              │    │              │      │
│   │ - OTLP   │    │ - batch      │    │ - OTLP       │      │
│   │ - Prom   │    │ - filter     │    │ - Jaeger     │      │
│   │ - Zipkin │    │ - attributes │    │ - Prometheus │      │
│   │ - etc.   │    │ - sampling   │    │ - Loki       │      │
│   └──────────┘    └──────────────┘    └──────────────┘      │
│                                                              │
│   Pipeline traces:  otlp → [batch, filter] → jaeger          │
│   Pipeline metrics: otlp → [batch] → prometheus              │
│   Pipeline logs:    otlp → [batch, attributes] → loki        │
└─────────────────────────────────────────────────────────────┘
```

### Receivers (recepteurs)

Les receivers acceptent les donnees en entree. Ils ecoutent sur un port et decodent les donnees.

```yaml
# Les receivers les plus courants
receivers:
  # OTLP — le protocole natif d'OpenTelemetry
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317   # Port gRPC standard
      http:
        endpoint: 0.0.0.0:4318   # Port HTTP standard

  # Prometheus — pour scraper des targets existantes
  prometheus:
    config:
      scrape_configs:
        - job_name: 'demo-app'
          scrape_interval: 15s
          static_configs:
            - targets: ['demo-app:3000']

  # Zipkin — pour la compatibilite avec d'anciens systemes
  zipkin:
    endpoint: 0.0.0.0:9411
```

### Processors (processeurs)

Les processors transforment, filtrent et enrichissent les donnees entre reception et export.

### Exporters (exporteurs)

Les exporters envoient les donnees traitees vers les backends finaux.

```yaml
exporters:
  # OTLP vers un autre Collector ou un backend compatible
  otlp:
    endpoint: jaeger:4317
    tls:
      insecure: true

  # Prometheus (expose un endpoint /metrics que Prometheus scrape)
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: otel

  # Loki pour les logs
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

  # Debug — affiche les donnees dans la console (developpement)
  debug:
    verbosity: detailed
```

---

## Configuration YAML complete

Voici une configuration complete et annotee du Collector pour notre cours :

```yaml
# config/otel-collector.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  batch:
    timeout: 5s
    send_batch_size: 512
    send_batch_max_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  attributes:
    actions:
      - { key: environment, value: development, action: upsert }
  filter:
    error_mode: ignore
    traces:
      span:
        - 'attributes["http.route"] == "/health"'
        - 'attributes["http.route"] == "/metrics"'

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: otel
    resource_to_telemetry_conversion: { enabled: true }
  debug: { verbosity: basic }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, filter, attributes]
      exporters: [otlp/jaeger, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch, attributes]
      exporters: [debug]
  telemetry:
    logs: { level: info }
    metrics: { address: 0.0.0.0:8888 }
```

---

## Le protocole OTLP

OTLP (OpenTelemetry Protocol) est le protocole natif d'OpenTelemetry. Il existe en deux variantes.

### OTLP/gRPC (port 4317)

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
const exporter = new OTLPTraceExporter({ url: 'http://localhost:4317' });
```

Streaming bidirectionnel, compression native, meilleures performances sur de gros volumes.

### OTLP/HTTP (port 4318)

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
const exporter = new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' });
```

Plus simple (JSON over HTTP), compatible avec proxies/load balancers, debugging facile (curl, Postman).

::: tip A retenir
En développement, utilisez OTLP/HTTP pour sa simplicite. En production avec de gros volumes, preferez OTLP/gRPC pour ses performances. Le Collector supporte les deux simultanement.
:::

---

## Processeurs en detail

### batch — regrouper pour la performance

```yaml
processors:
  batch:
    # Envoyer un lot toutes les 5 secondes...
    timeout: 5s
    # ...ou quand on atteint 512 elements...
    send_batch_size: 512
    # ...avec un maximum de 1024 par lot
    send_batch_max_size: 1024
```

Le batch processor est **indispensable** en production. Sans lui, chaque span/metrique est exporte individuellement, ce qui généré enormement de requêtes réseau.

### memory_limiter — protection contre l'OOM

```yaml
processors:
  memory_limiter:
    check_interval: 1s        # Verifier la memoire toutes les secondes
    limit_mib: 512             # Limite dure a 512 MB
    spike_limit_mib: 128       # Commencer a rejeter a 384 MB (512-128)
```

Le `spike_limit_mib` definit une zone tampon : le Collector commence a rejeter des donnees a `limit_mib - spike_limit_mib` (ici 384 MB) avant d'atteindre la limite dure (512 MB).

### filter — eliminer le bruit

```yaml
processors:
  filter:
    error_mode: ignore
    traces:
      span:
        - 'attributes["http.route"] == "/health"'
        - 'attributes["http.route"] == "/metrics"'
```

Utilisez `filter` pour supprimer les spans de health check, les metriques inutiles et les spans tres courts sans erreur.

### tail_sampling — echantillonnage intelligent

Le tail_sampling est l'un des processeurs les plus puissants. Contrairement au head-based sampling (decision prise au debut), il prend la decision **après avoir vu la trace complete**.

```yaml
processors:
  tail_sampling:
    decision_wait: 10s           # Attendre 10s pour voir la trace complete
    num_traces: 100000           # Garder 100k traces en memoire
    expected_new_traces_per_sec: 1000
    policies:
      # Politique 1 : garder toutes les traces en erreur
      - name: errors-policy
        type: status_code
        status_code:
          status_codes: [ERROR]

      # Politique 2 : garder les traces lentes (> 2s)
      - name: latency-policy
        type: latency
        latency:
          threshold_ms: 2000

      # Politique 3 : echantillonner 10% des traces normales
      - name: probabilistic-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

      # Politique 4 : toujours garder certaines operations critiques
      - name: critical-operations
        type: string_attribute
        string_attribute:
          key: operation.critical
          values: ["true"]
```

### attributes — enrichir les donnees

```yaml
processors:
  attributes:
    actions:
      - key: environment
        value: production
        action: insert    # Ajouter si absent
      - key: user.email
        action: delete     # Supprimer (PII)
      - key: user.ip
        action: hash       # Hasher un attribut sensible
```

Actions disponibles : `insert`, `upsert`, `update`, `delete`, `hash`, `extract` (regex).

---

## Head-based vs Tail-based sampling

### Head-based sampling

Decision prise **au debut de la trace** (cote SDK). Simple et previsible, sans surcout memoire. Inconvenient : risque de perdre des traces en erreur.

```typescript
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
const sampler = new TraceIdRatioBasedSampler(0.1); // Garder 10% aleatoirement
```

### Tail-based sampling

<<<<<<< HEAD
Decision prise **a la fin de la trace** (cote Collector). Conserve 100% des erreurs et traces lentes. Inconvenient : consommation memoire et necessite un Collector.
=======
La decision est prise **à la fin de la trace**, quand tous les spans ont ete recus.

```typescript
// Tail-based : le Collector attend la trace complete avant de decider

// Avantages :
// - 100% des traces en erreur conservees
// - 100% des traces lentes conservees
// - Decision basee sur le contenu reel de la trace

// Inconvenients :
// - Necessite un Collector (pas faisable cote SDK)
// - Consommation memoire (garder les traces en attente)
// - Latence d'export (attente de la fin de trace)
// - Plus complexe a configurer
```
>>>>>>> 1557558 (fix: add parcours blocks, inter-course nav, fix accents, copy visualizations to public)

```
Head-based:                  Tail-based:

 Requete arrive               Requete arrive
       │                            │
   Garder ?                    Collecter tous
   (aleatoire)                 les spans
       │                            │
  Oui    Non                   Trace complete ?
   │      │                         │
 Tracer  Ignorer              Oui ── Analyser
                                     │
                              Error?  Lent?  Normal?
                                │       │       │
                              Garder  Garder  10% alea
```

::: warning Attention
Le tail-based sampling requiert que **toutes les instances** d'un service envoient leurs spans au **même Collector** (où au même groupe). Sinon, le Collector ne verra qu'une partie de la trace et ne pourra pas prendre une decision correcte. En mode multi-instance, utilisez un load balancer par traceId ou un mode gateway.
:::

---

## Patterns de déploiement

### Mode Agent (sidecar)

Chaque instance d'application a son propre Collector. Ideal pour Kubernetes (sidecar container).

```
┌──────────────────────────┐
│         Pod K8s          │
│  ┌────────┐ ┌──────────┐│
│  │  App   │→│ Collector ││
│  │        │ │ (agent)   ││
│  └────────┘ └──────┬───┘│
└─────────────────────┼────┘
                      │
                      ▼
              Backend (Jaeger, etc.)
```

Avantages : faible latence (communication locale), isolation (un crash n'affecte qu'un pod), configuration legere.

### Mode Gateway (centralise)

Un Collector central recoit les donnees de toutes les applications. Ideal pour le tail-based sampling.

```
┌────────┐
│  App 1 │──OTLP──┐
└────────┘         │
                   ▼
┌────────┐    ┌──────────┐
│  App 2 │──→│ Collector │──→ Backends
└────────┘    │ (gateway) │
              └──────────┘
┌────────┐         ▲
│  App 3 │──OTLP──┘
└────────┘
```

### Mode Hybride (agent + gateway)

Le pattern le plus robuste en production : agents locaux + gateway central.

```
┌────────────────┐
│ Pod 1          │
│ App → Agent ───┼──┐
└────────────────┘  │
                    │     ┌───────────┐
┌────────────────┐  ├────→│  Gateway  │───→ Backends
│ Pod 2          │  │     │ Collector │
│ App → Agent ───┼──┘     └───────────┘
└────────────────┘
```

| Pattern | Sampling | Ideal pour |
|---------|----------|------------|
| **Agent** | Head-based uniquement | Buffering local, faible latence |
| **Gateway** | Tail-based possible | Sampling intelligent, transformations |
| **Hybride** | Head (agent) + tail (gateway) | Production a grande echelle |

---

## Configuration de la stack du cours

<<<<<<< HEAD
Le fichier `docker-compose.yml` complet est disponible dans le [Lab 08](/labs/lab-08-otel-collector/README). Il lance : `demo-app`, `otel-collector`, `jaeger`, `prometheus` et `grafana`.
=======
Voici le Docker Compose complet pour lancer toute la stack d'observabilité du cours :

```yaml
# docker-compose.yml
version: '3.8'

services:
  demo-app:
    build: ./demo-app
    ports:
      - '3000:3000'
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
      - OTEL_SERVICE_NAME=demo-app
      - NODE_ENV=development
      - LOG_LEVEL=info
    depends_on:
      - otel-collector

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    command: ['--config=/etc/otel-collector.yaml']
    ports:
      - '4317:4317'   # OTLP gRPC
      - '4318:4318'   # OTLP HTTP
      - '8888:8888'   # Metriques du Collector
      - '8889:8889'   # Metriques exportees pour Prometheus
    volumes:
      - ./config/otel-collector.yaml:/etc/otel-collector.yaml
    depends_on:
      - jaeger

  jaeger:
    image: jaegertracing/all-in-one:1.54
    ports:
      - '16686:16686' # UI
      - '14268:14268' # Legacy Jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  prometheus:
    image: prom/prometheus:v2.50.0
    ports:
      - '9090:9090'
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:10.3.1
    ports:
      - '3001:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./config/grafana/datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
```

```bash
# Lancer toute la stack
docker compose up -d
>>>>>>> 1557558 (fix: add parcours blocks, inter-course nav, fix accents, copy visualizations to public)

---

> **Grafana Alloy** (successeur de Grafana Agent) : Si vous utilisez la stack Grafana (Loki + Tempo + Mimir), Alloy est une alternative au OTel Collector generique. Il supporte nativement les formats Grafana et offre une configuration visuelle. Pour les stacks multi-vendor, restez sur le OTel Collector standard.

---

## Bonnes pratiques

- **Toujours utiliser un Collector** en production — ne jamais exporter directement vers les backends
- **Le processeur `batch` est obligatoire** — sans lui, les performances s'effondrent
- **Le processeur `memory_limiter` est obligatoire** — sans lui, le Collector peut crasher par OOM
- **Placez `memory_limiter` en premier** dans la liste des processeurs — il doit pouvoir rejeter avant le traitement
- **Commencez par le head-based sampling** — plus simple, suffisant pour la plupart des cas
- **Passez au tail-based sampling** quand vous voulez garder 100% des erreurs et des traces lentes
- **Filtrez le bruit** : health checks, metriques inutiles, spans trop courts
- **Surveillez le Collector** lui-même (port 8888) — un Collector sature = perte de donnees
- **Utilisez le mode agent + gateway** en production pour la résilience et le tail sampling

::: tip A retenir
Le Collector est le **système nerveux central** de votre pipeline d'observabilité. Il decouple vos applications des backends, permet le traitement intermédiaire, et offre le tail-based sampling. Sa configuration YAML suit toujours le même schema : receivers → processors → exporters, assembles en pipelines dans la section `service`.
:::

---

## Prochaines étapes

- [Lab 08 — Déployer le Collector et configurer la pipeline](/labs/lab-08-otel-collector/README)
- [Quiz 08 — OTel Collector & Pipeline](/quizzes/quiz-08-otel-collector-pipeline)
- [Module suivant — Grafana Dashboards & PromQL](/modules/09-grafana-dashboards)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 08 otel collector pipeline](../screencasts/screencast-08-otel-collector-pipeline.md)
2. **Lab** : [lab-08-otel-collector](../labs/lab-08-otel-collector/README)
3. **Visualisation** : [Distributed Trace](../visualizations/distributed-trace.html)
4. **Quiz** : [quiz 08 otel collector pipeline](../quizzes/quiz-08-otel-collector-pipeline.html)
:::

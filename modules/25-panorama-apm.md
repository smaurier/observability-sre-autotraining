# Module 25 — Panorama APM : Comparatif des outils de monitoring applicatif

> **Durée estimée** : 3h00
> **Difficulté** : 2/5

## Objectifs pedagogiques

- Comprendre ce qu'est un APM (Application Performance Monitoring) et ses composantes
- Comparer les principales solutions APM du marche (Datadog, New Relic, Elastic APM, Grafana Cloud)
- Evaluer les criteres de choix : fonctionnalites, pricing, self-hosted vs SaaS, OpenTelemetry
- Comprendre l'architecture d'un APM et ses composantes (agent, collector, backend, UI)
- Savoir quand privilegier le self-hosted vs le SaaS
- Integrer OpenTelemetry comme standard ouvert dans une strategie APM

---

## 1. Qu'est-ce qu'un APM ?

### 1.1 Definition

Un APM (Application Performance Monitoring) est un ensemble d'outils qui permettent de :
- **Detecter** les problemes de performance en temps reel
- **Diagnostiquer** la cause racine via les traces distribuees
- **Mesurer** l'impact sur les utilisateurs (Apdex, error rate, latency)
- **Correler** les metriques, logs et traces pour une vue unifiee

```
Les 3 piliers de l'APM :

1. Metriques         | Taux d'erreur, latence P50/P95/P99, throughput
                     | Metriques systeme (CPU, RAM, disk, network)
                     | Metriques custom (business KPIs)

2. Traces            | Traces distribuees (request flow across services)
                     | Profiling continu (CPU, memory allocation)
                     | Database query analysis

3. Logs              | Logs structures correles aux traces
                     | Error grouping et deduplication
                     | Log patterns et anomaly detection
```

### 1.2 Architecture type

```
Application          Agent/SDK              Collector            Backend           UI
+-----------+       +----------+          +----------+        +----------+     +-------+
| App Node  | --->  | OTel SDK | -------> | OTel     | -----> | Tempo/   | --> | Dash  |
| (auto-    |       | + Agent  |   OTLP   | Collector|  OTLP  | Jaeger   |    | board |
|  instrum) |       +----------+          +----------+        +----------+    +-------+
+-----------+                                   |
                                                |
+-----------+       +----------+                v
| App Python| --->  | OTel SDK | -------> +----------+
|           |       |          |          | Prom/    | -----> Alerting
+-----------+       +----------+          | Mimir    |
                                          +----------+
```

---

## 2. Comparatif des solutions APM

### 2.1 Datadog

```
Type           : SaaS uniquement
Fondation      : 2010, New York
Pricing        : Par host + ingestion
Langages       : Java, Python, Node, Go, Ruby, .NET, PHP, C++, Rust
OTel support   : Oui (Datadog Agent comme collector OTel)

Forces :
+ Interface unifiee (metrics, traces, logs, RUM, synthetics, profiling)
+ Correlation automatique logs <-> traces <-> metriques
+ Machine learning pour anomaly detection
+ Tres riche en integrations (800+)
+ Notebooks collaboratifs et dashboards avances
+ Profiling continu (CPU, memory, wall time)

Faiblesses :
- Pricing eleve et complexe (par host, par GB ingere, par feature)
- Vendor lock-in (agent proprietaire par defaut)
- Cout imprevisible (ingestion-based billing)
- Pas de self-hosted

Pricing indicatif (2024) :
- Infrastructure : ~23 EUR/host/mois
- APM : ~40 EUR/host/mois
- Logs : ~1.70 EUR/GB ingere + ~0.06 EUR/GB/mois stockage
- RUM : ~1.50 EUR / 1000 sessions
```

### 2.2 New Relic

```
Type           : SaaS uniquement
Fondation      : 2008, San Francisco
Pricing        : Par utilisateur + ingestion (100GB/mois gratuit)
Langages       : Java, Python, Node, Go, Ruby, .NET, PHP, C
OTel support   : Natif (OTLP endpoint direct)

Forces :
+ 100 GB/mois gratuit (genereux pour les petites equipes)
+ NRQL (New Relic Query Language) tres puissant
+ Support OTel natif (pas besoin d'agent proprietaire)
+ All-in-one : APM, infra, logs, browser, mobile, synthetics
+ Applied Intelligence (AIOps) pour la correlation d'incidents

Faiblesses :
- Pricing par utilisateur peut etre cher pour les grosses equipes
- Interface parfois complexe (beaucoup de menus)
- Historiquement moins performant sur les logs
- Pas de self-hosted

Pricing indicatif (2024) :
- Free : 1 utilisateur full, 100 GB/mois
- Standard : ~99 USD/utilisateur/mois
- Pro : ~349 USD/utilisateur/mois
- Enterprise : ~549 USD/utilisateur/mois
- Ingestion au-dela de 100GB : ~0.35 USD/GB
```

### 2.3 Elastic APM (Elastic Observability)

```
Type           : Self-hosted OU SaaS (Elastic Cloud)
Fondation      : 2012, Amsterdam (Elastic NV)
Pricing        : Self-hosted gratuit (licence) / Cloud par ressource
Langages       : Java, Python, Node, Go, Ruby, .NET, PHP, Rust
OTel support   : Oui (Elastic APM Server comme collector OTel)

Forces :
+ Self-hosted possible (controle total des donnees)
+ Elastic Stack complet (ELK + APM)
+ Recherche full-text puissante sur les logs
+ SIEM integre (Elastic Security)
+ Machine learning pour anomaly detection
+ Licence gratuite pour le self-hosted (basic) — APM Server inclus ;
  certaines features Elasticsearch/Kibana (X-Pack Security, ML) necessitent une licence commerciale

Faiblesses :
- Complexite operationnelle du self-hosted (Elasticsearch cluster)
- Consommation de ressources importante (RAM, disk)
- Courbe d'apprentissage ELK
- UI moins intuitive que Datadog pour l'APM

Pricing indicatif (2024) :
- Self-hosted : gratuit (basic license) ou Platinum/Enterprise
- Elastic Cloud Standard : a partir de ~95 USD/mois
- Elastic Cloud Enterprise : sur devis
```

### 2.4 Grafana Cloud (Grafana + Tempo + Mimir + Loki)

```
Type           : Self-hosted OU SaaS (Grafana Cloud)
Fondation      : 2014, New York (Grafana Labs)
Pricing        : Self-hosted gratuit (OSS) / Cloud par usage
Langages       : Agnostique (via OpenTelemetry)
OTel support   : Natif (OTLP est le protocole principal)

Forces :
+ Full open-source (Grafana, Tempo, Mimir, Loki, Alloy)
+ Self-hosted gratuit sans limitation
+ OTel-native (pas d'agent proprietaire)
+ Grafana : meilleur outil de dashboarding
+ Pricing previsible (par metrique, par GB)
+ Grafana Faro pour le RUM (GA depuis 2024)
+ Communaute tres active

Faiblesses :
- Necessite d'assembler plusieurs composants (pas monolithique)
- Complexite operationnelle du self-hosted
- Pas de profiling continu integre (Pyroscope en cours d'integration)
- Alerting moins avance que Datadog/New Relic
- Grafana Cloud n'a pas encore toutes les features des concurrents

Pricing indicatif (2024) :
- Free : 10K metriques, 50GB logs, 50GB traces/mois
- Pro : ~8 USD/utilisateur/mois + usage
- Metriques : ~8 USD / 1000 series actives
- Logs : ~0.50 USD/GB
- Traces : ~0.50 USD/GB
```

### 2.5 Tableau comparatif

```
Critere              | Datadog   | New Relic | Elastic   | Grafana Cloud
--------------------|-----------|-----------|-----------|---------------
Self-hosted         | Non       | Non       | Oui       | Oui (OSS)
Free tier           | 14j trial | 100GB/mois| Basic     | 10K metrics
OTel natif          | Partiel   | Oui       | Oui       | Oui
Logs + Traces + Met | Oui       | Oui       | Oui       | Oui
RUM                 | Oui       | Oui       | Oui       | Faro (GA)
Profiling           | Oui       | Oui       | Partiel   | Pyroscope
Session Replay      | Oui       | Non       | Non       | Non
SIEM / Securite     | Oui       | Non       | Oui       | Non
Pricing model       | Host+GB   | User+GB   | Resource  | Usage
Vendor lock-in      | Eleve     | Moyen     | Faible    | Tres faible
Complexite ops      | Aucune    | Aucune    | Elevee    | Moyenne-Elevee
EU Data Residency   | Oui       | Oui       | Oui       | Oui
```

---

## 3. Self-hosted vs SaaS

### 3.1 Criteres de decision

```
Choisir SaaS quand :                    Choisir Self-hosted quand :
- Equipe SRE < 3 personnes             - Contraintes reglementaires strictes
- Time-to-value critique               - Volume de donnees tres eleve
- Pas de contraintes de data residency  - Budget ops disponible
  specifiques                           - Besoin de customisation profonde
- Budget operationnel disponible        - Souverainete des donnees requise
- Besoin de features avancees (ML, AI)  - Cout SaaS prohibitif a l'echelle
```

### 3.2 Cout total de possession (TCO)

```
SaaS (exemple Datadog, 50 hosts, 500GB logs/mois) :
- Infrastructure APM : 50 x 40 = 2,000 EUR/mois
- Logs ingestion : 500 x 1.70 = 850 EUR/mois
- Logs retention : 500 x 0.06 x 30 = 900 EUR/mois
- Total : ~3,750 EUR/mois = ~45,000 EUR/an

Self-hosted (Grafana stack, equivalent) :
- Infrastructure (3 nodes Elasticsearch, Grafana, etc.) : ~1,500 EUR/mois
- Stockage S3 (logs, traces) : ~200 EUR/mois
- Temps ingenieur SRE (20% FTE) : ~1,500 EUR/mois
- Total : ~3,200 EUR/mois = ~38,400 EUR/an

Note : le self-hosted devient plus avantageux a grande echelle
mais necessite une expertise operationnelle significative.
```

---

## 4. OpenTelemetry comme standard

### 4.1 Pourquoi OTel est strategique

```
Avant OTel :                            Avec OTel :
- Agent Datadog pour Datadog            - Un seul SDK universel
- Agent New Relic pour New Relic        - Protocol OTLP standard
- Agent Elastic pour Elastic            - Changement de backend sans
- Vendor lock-in total                    modifier le code applicatif
- Chaque migration = re-instrumentation - Communaute CNCF massive
```

### 4.2 Architecture OTel-first

```
Application          OTel SDK            OTel Collector           Backends
+-----------+       +----------+        +----------------+      +----------+
|           | --->  | Traces   | -----> | Recevoir       | ---> | Tempo    |
| Auto-     |       | Metrics  |  OTLP  | Traiter        |      | Mimir    |
| instrum   |       | Logs     |        | Router/Exporter| ---> | Loki     |
+-----------+       +----------+        +----------------+      +----------+
                                               |
                                               | Si migration :
                                               | changer uniquement
                                               | les exporters
                                               v
                                        +----------------+
                                        | Datadog        |
                                        | New Relic      |
                                        | Elastic        |
                                        +----------------+
```

### 4.3 OTel Collector comme pivot

Le Collector est le composant central d'une strategie OTel-first :

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 8192
  memory_limiter:
    check_interval: 1s
    limit_mib: 4096

exporters:
  # Envoyer a Grafana Cloud
  otlphttp/grafana:
    endpoint: https://tempo-eu-west-0.grafana.net/tempo
    headers:
      Authorization: "Basic ${GRAFANA_TOKEN}"

  # OU envoyer a Datadog
  datadog:
    api:
      key: ${DD_API_KEY}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/grafana]  # Changer ici pour migrer
```

---

## 5. Recommandation par contexte

```
Startup / Petite equipe :
-> Grafana Cloud (free tier) + OTel
   Cout : 0 EUR pour demarrer
   Avantage : pas de vendor lock-in, evolutif

Scale-up / PME :
-> New Relic (free tier genereux) + OTel
   Cout : 0-500 EUR/mois
   Avantage : 100GB gratuit, all-in-one

Enterprise avec equipe SRE :
-> Datadog (si budget) ou Grafana self-hosted (si expertise)
   Cout : 5K-50K+ EUR/mois
   Avantage : features avancees, support enterprise

Secteur reglemente (sante, finance, defense) :
-> Elastic self-hosted ou Grafana self-hosted
   Cout : infrastructure + ops
   Avantage : souverainete totale des donnees
```

---

## Resume

| Solution | Ideal pour | OTel | Self-hosted | Prix depart |
|----------|-----------|------|-------------|-------------|
| Datadog | Enterprise, time-to-value | Partiel | Non | ~63 EUR/host/mois |
| New Relic | PME, petites equipes | Natif | Non | Gratuit (100GB) |
| Elastic | Reglemente, logs lourds | Oui | Oui | Gratuit (OSS) |
| Grafana | Flexibilite, open-source | Natif | Oui | Gratuit (OSS/Cloud) |

---

## Exercices pratiques

Rendez-vous au [Lab 25 — Panorama APM](/labs/lab-25-panorama-apm/README) pour mettre en pratique ces concepts.

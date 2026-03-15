# Module 23 — ELK Stack & Kibana

## Objectifs pedagogiques

- Comprendre l'architecture ELK (Elasticsearch, Logstash, Kibana)
- Comparer ELK avec la stack Grafana (Loki, Prometheus, Tempo)
- Maîtriser les concepts Elasticsearch : index, mapping, shards, replicas
- Configurer Logstash et Filebeat pour l'ingestion de logs
- Créer des dashboards et visualisations dans Kibana
- Écrire des requêtes KQL et Lucene
- Gérer le cycle de vie des index (ILM)

---

## 1. ELK vs Grafana Stack

Jusqu'ici, le cours s'est concentre sur la stack open-source Grafana (Prometheus, Loki, Tempo, Grafana). ELK est **l'autre grande stack d'observabilité**, très repandue en entreprise.

| Critere | ELK Stack | Grafana Stack |
|---------|-----------|---------------|
| **Logs** | Elasticsearch + Kibana | Loki + Grafana |
| **Metriques** | Elasticsearch (où Metricbeat) | Prometheus + Grafana |
| **Traces** | Elastic APM | Tempo + Grafana |
| **Ingestion** | Logstash, Filebeat, Elastic Agent | Promtail, OTel Collector |
| **Requetes** | KQL, Lucene, Elasticsearch DSL | LogQL, PromQL |
| **Stockage logs** | Index inversé (full-text natif) | Chunks comprimes + index legers |
| **Cout stockage** | Eleve (tout est indexe) | Faible (seuls les labels sont indexes) |
| **Recherche full-text** | Excellente | Basique (grep-like) |
| **Scaling** | Horizontal (shards) | Horizontal (microservices) |
| **Licence** | SSPL (Elasticsearch) / Apache 2.0 (OpenSearch) | AGPLv3 |
| **SaaS** | Elastic Cloud | Grafana Cloud |

### Quand choisir ELK ?

- **Recherche full-text avancee** sur les logs (analyseurs, stemming, synonymes)
- **Volume massif** avec besoin de recherche rapide
- **Équipe déjà formee** a Elasticsearch
- **Ecosysteme Elastic** déjà en place (APM, Security, SIEM)

### Quand rester sur Grafana ?

- **Cout** est un facteur (Loki stocke beaucoup moins cher)
- **Metriques Prometheus** sont centrales
- Stack plus **simple a operer** (moins de composants)
- Pas besoin de full-text sur les logs

---

## 2. Elasticsearch — Fondamentaux

### Architecture

```
Elasticsearch Cluster
├── Node 1 (Master + Data)
│   ├── Index "logs-2024.03"
│   │   ├── Shard 0 (Primary)
│   │   └── Shard 2 (Replica)
│   └── Index "logs-2024.02"
│       └── Shard 1 (Primary)
├── Node 2 (Data)
│   ├── Index "logs-2024.03"
│   │   ├── Shard 1 (Primary)
│   │   └── Shard 0 (Replica)
│   └── ...
└── Node 3 (Data + Ingest)
    └── ...
```

### Concepts clés

| Concept | Description | Analogie SQL |
|---------|-------------|-------------|
| **Index** | Collection de documents | Table |
| **Document** | Unite de donnees (JSON) | Ligne |
| **Field** | Propriété d'un document | Colonne |
| **Mapping** | Schema d'un index | DDL (CREATE TABLE) |
| **Shard** | Partition horizontale d'un index | Partition |
| **Replica** | Copie d'un shard (haute dispo) | Replica |

### Mapping — Le schema d'un index

```json
PUT /logs-app
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "level": { "type": "keyword" },
      "message": { "type": "text", "analyzer": "standard" },
      "service": { "type": "keyword" },
      "host": { "type": "keyword" },
      "duration_ms": { "type": "float" },
      "status_code": { "type": "integer" },
      "user_id": { "type": "keyword" },
      "request": {
        "properties": {
          "method": { "type": "keyword" },
          "path": { "type": "keyword" },
          "body": { "type": "text" }
        }
      },
      "geo": {
        "properties": {
          "country": { "type": "keyword" },
          "city": { "type": "keyword" },
          "location": { "type": "geo_point" }
        }
      }
    }
  }
}
```

### Types de champs importants

| Type | Usage | Indexation |
|------|-------|-----------|
| `keyword` | Valeurs exactes (status, userId, tags) | Pas analysé, filtre exact |
| `text` | Texte libre (message, description) | Analyse, tokenise, full-text search |
| `date` | Timestamps | Range queries, date math |
| `integer` / `float` | Numerique | Range queries, aggregations |
| `boolean` | Vrai/faux | Filtres |
| `geo_point` | Coordonnees | Queries geographiques |
| `nested` | Objets dans un tableau | Queries sur objets imbriques |

::: warning keyword vs text
`keyword` = valeur exacte, pas de tokenisation. Utilisez pour les filtres (status, userId).
`text` = texte analyse, tokenise en mots. Utilisez pour la recherche full-text (messages, descriptions).
Un champ peut etre les deux : `"type": "text", "fields": { "raw": { "type": "keyword" } }`.
:::

---

## 3. Logstash — Pipeline d'ingestion

Logstash est le **ETL** (Extract, Transform, Load) de la stack ELK.

### Architecture pipeline

```
Input → Filter → Output

Exemples :
  file → grok + date + geoip → elasticsearch
  beats → json + mutate      → elasticsearch + s3
  kafka → csv + aggregate     → elasticsearch
```

### Configuration type

```ruby
# /etc/logstash/conf.d/app-logs.conf

input {
  beats {
    port => 5044
  }
}

filter {
  # Parser les logs JSON
  json {
    source => "message"
    target => "parsed"
  }

  # Extraire les champs
  mutate {
    rename => {
      "[parsed][level]" => "level"
      "[parsed][msg]" => "log_message"
      "[parsed][service]" => "service"
      "[parsed][duration]" => "duration_ms"
    }
    remove_field => ["parsed"]
  }

  # Parser la date
  date {
    match => ["[parsed][time]", "ISO8601"]
    target => "@timestamp"
  }

  # Geoip a partir de l'IP client
  geoip {
    source => "client_ip"
    target => "geo"
  }

  # Parser le User-Agent
  useragent {
    source => "user_agent"
    target => "ua"
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-app-%{+YYYY.MM.dd}"
  }
}
```

### Grok — Parser des logs non structures

Grok utilise des patterns nommes pour extraire des champs à partir de texte :

```ruby
# Log Apache
# 192.168.1.1 - - [15/Mar/2024:10:30:00 +0000] "GET /api/products HTTP/1.1" 200 1234

filter {
  grok {
    match => {
      "message" => '%{IP:client_ip} - - \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:path} HTTP/%{NUMBER:http_version}" %{NUMBER:status_code:int} %{NUMBER:bytes:int}'
    }
  }
}

# Resultat :
# client_ip: "192.168.1.1"
# method: "GET"
# path: "/api/products"
# status_code: 200
# bytes: 1234
```

### Patterns Grok courants

| Pattern | Match |
|---------|-------|
| `%{IP}` | Adresse IP |
| `%{WORD}` | Un mot (sans espaces) |
| `%{NUMBER}` | Nombre entier ou decimal |
| `%{HTTPDATE}` | Date format Apache |
| `%{URIPATHPARAM}` | Chemin URI avec paramètres |
| `%{GREEDYDATA}` | Tout le reste |
| `%{LOGLEVEL}` | DEBUG, INFO, WARN, ERROR |

---

## 4. Filebeat — Agent de collecte

Filebeat est un agent leger qui envoie les fichiers de log a Logstash ou Elasticsearch directement.

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/app/*.log
    json:
      keys_under_root: true
      add_error_key: true
    fields:
      service: my-api
      environment: production

  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log

output.logstash:
  hosts: ["logstash:5044"]

# Ou directement vers Elasticsearch
# output.elasticsearch:
#   hosts: ["elasticsearch:9200"]
#   index: "logs-app-%{+yyyy.MM.dd}"
```

### Modules Filebeat

Filebeat inclut des modules preconfigures pour les services courants :

```bash
filebeat modules enable nginx
filebeat modules enable postgresql
filebeat modules enable system
filebeat setup  # cree les index patterns et dashboards Kibana
```

---

## 5. Kibana — Discover

### Index Patterns

Avant d'explorer les donnees, creez un **index pattern** :
1. Stack Management → Index Patterns
2. Pattern : `logs-app-*`
3. Champ timestamp : `@timestamp`

### KQL — Kibana Query Language

```
# Recherche simple
status_code: 500

# AND / OR
status_code: 500 AND service: "api-gateway"
level: "error" OR level: "fatal"

# NOT
NOT status_code: 200

# Wildcards
path: /api/products/*
message: *timeout*

# Ranges
duration_ms >= 1000
@timestamp >= "2024-03-01" AND @timestamp < "2024-03-15"

# Nested
request.method: "POST" AND request.path: "/api/orders"

# Exists
user_id: *     # le champ existe
NOT user_id: * # le champ n'existe pas
```

### Lucene (alternative)

```
# Lucene est plus expressif mais plus verbeux
status_code:[500 TO 599]
message:"connection refused" AND service:api*
duration_ms:{1000 TO *}
```

---

## 6. Kibana — Dashboards et visualisations

### Lens — Editeur visuel

Lens est l'editeur de visualisation recommande. Drag & drop des champs pour créer :
- **Bar chart** : erreurs par service
- **Line chart** : latence P95 dans le temps
- **Pie chart** : repartition par status code
- **Heatmap** : erreurs par heure et jour de la semaine
- **Metric** : nombre d'erreurs total
- **Table** : top 10 des endpoints les plus lents

### TSVB (Time Series Visual Builder)

Pour les visualisations temporelles avancees :
- Annotations (deploiements, incidents)
- Mathematiques entre series (error_rate = errors / total)
- Comparaison avec une periode précédente

### Aggregations

Les visualisations Kibana reposent sur les **aggregations Elasticsearch** :

```json
GET /logs-app-*/_search
{
  "size": 0,
  "aggs": {
    "errors_by_service": {
      "terms": { "field": "service", "size": 10 },
      "aggs": {
        "error_count": {
          "filter": { "range": { "status_code": { "gte": 500 } } }
        },
        "avg_duration": {
          "avg": { "field": "duration_ms" }
        },
        "p95_duration": {
          "percentiles": { "field": "duration_ms", "percents": [95] }
        }
      }
    },
    "errors_over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "calendar_interval": "1h"
      },
      "aggs": {
        "error_rate": {
          "filter": { "range": { "status_code": { "gte": 500 } } }
        }
      }
    }
  }
}
```

---

## 7. Alerting

### Kibana Alert Rules

```
Stack Management → Rules → Create Rule

Types :
├── Index threshold — "Si le count de status_code:500 depasse 100 en 5 min"
├── Elasticsearch query — Requete custom
├── Log threshold — Seuil sur les logs
└── Anomaly detection — ML (licence Platinum)

Actions (Connectors) :
├── Slack
├── Email
├── PagerDuty
├── Webhook
└── Jira / ServiceNow
```

### Watcher (API)

```json
PUT _watcher/watch/high-error-rate
{
  "trigger": {
    "schedule": { "interval": "5m" }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["logs-app-*"],
        "body": {
          "query": {
            "bool": {
              "must": [
                { "range": { "@timestamp": { "gte": "now-5m" } } },
                { "range": { "status_code": { "gte": 500 } } }
              ]
            }
          }
        }
      }
    }
  },
  "condition": {
    "compare": { "ctx.payload.hits.total.value": { "gt": 50 } }
  },
  "actions": {
    "slack_alert": {
      "slack": {
        "message": {
          "to": ["#alerts"],
          "text": "High error rate: {{ctx.payload.hits.total.value}} errors in 5 min"
        }
      }
    }
  }
}
```

---

## 8. Index Lifecycle Management (ILM)

### Architecture Hot-Warm-Cold

```
Hot (SSD rapide)     → Donnees recentes (0-7 jours), ecritures actives
Warm (HDD standard)  → Donnees recentes (7-30 jours), lecture seule
Cold (stockage eco)   → Donnees anciennes (30-90 jours), acces rare
Delete               → Suppression apres retention
```

### Configuration ILM

```json
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "1d",
            "max_primary_shard_size": "50gb"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {},
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### Data Streams (moderne)

```json
PUT _index_template/logs-template
{
  "index_patterns": ["logs-app-*"],
  "data_stream": {},
  "template": {
    "settings": {
      "index.lifecycle.name": "logs-policy"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" },
        "level": { "type": "keyword" }
      }
    }
  }
}
```

---

## 9. Docker Compose — Stack ELK locale

```yaml
# docker-compose.yml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.17.0
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
    ports:
      - "5044:5044"
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.17.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch

  filebeat:
    image: docker.elastic.co/beats/filebeat:8.17.0
    volumes:
      - ./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    depends_on:
      - logstash

volumes:
  es-data:
```

---

## 10. Performance et scaling

### Dimensionnement des shards

| Regle | Valeur |
|-------|--------|
| Taille optimale d'un shard | 10-50 GB |
| Nombre max de shards par noeud | ~600 |
| Nombre de shards primaires | Non modifiable après création |
| Nombre de replicas | Modifiable a chaud |

### Formule de dimensionnement

```
Donnees quotidiennes : 100 GB/jour
Retention : 30 jours
Volume total : 100 × 30 = 3000 GB

Taille shard cible : 30 GB
Shards necessaires : 3000 / 30 = 100 shards primaires
Avec 1 replica : 200 shards au total

Noeuds data (40 shards/noeud) : 200 / 40 = 5 noeuds
```

### Optimisations

1. **Index par jour** (`logs-app-2024.03.14`) plutot qu'un seul gros index
2. **Forcemerge** les vieux index (1 segment = recherche plus rapide)
3. **Frozen indices** pour les donnees > 30 jours (hors heap)
4. **Source filtering** — ne récupérer que les champs nécessaires
5. **Index sorting** — trier les documents a l'indexation pour accelerer les queries

---

## 11. Sécurité

### RBAC (Role-Based Access Control)

```json
POST _security/role/logs-reader
{
  "indices": [
    {
      "names": ["logs-app-*"],
      "privileges": ["read", "view_index_metadata"],
      "field_security": {
        "grant": ["@timestamp", "level", "message", "service"]
      }
    }
  ]
}
```

### Spaces Kibana

Les Spaces isolent les dashboards et index patterns par équipe :
- Space "Backend Team" : logs des services API
- Space "Frontend Team" : logs RUM et Core Web Vitals
- Space "Security" : logs d'audit et SIEM

---

## Exercices

Passez au **Lab 24** pour mettre en pratique :
- Mapping Elasticsearch
- Parsing de logs avec grok
- Requetes KQL
- Index Lifecycle Management
- Aggregations pour dashboards

---

## Ressources

- [Elasticsearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
- [Kibana Guide](https://www.elastic.co/guide/en/kibana/current/index.html)
- [Logstash Référence](https://www.elastic.co/guide/en/logstash/current/index.html)
- [Grok Debugger](https://grokdebugger.com/)
- [OpenSearch](https://opensearch.org/) — Fork Apache 2.0 d'Elasticsearch
- [ELK Docker Compose](https://github.com/deviantony/docker-elk)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 23 elk stack kibana](../screencasts/screencast-23-elk-stack-kibana.md)
2. **Lab** : [lab-23-sentry-error-tracking](../labs/lab-23-sentry-error-tracking/README)
3. **Quiz** : [quiz 23 elk stack kibana](../quizzes/quiz-23-elk-stack-kibana.html)
:::

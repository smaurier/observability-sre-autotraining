# Screencast 23 — ELK Stack & Kibana

## Informations
- **Duree estimee** : 15-18 min
- **Module** : `modules/23-elk-stack-kibana.md`
- **Lab associe** : `labs/lab-24-elk-kibana/`
- **Prerequis** : Screencast 02-03 (Logging structure), Screencast 09 (Grafana)

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Docker et docker-compose installes
- [ ] Terminal integre ouvert
- [ ] Navigateur ouvert

## Script

### [00:00-02:30] Introduction — ELK vs Grafana Stack

> On a utilise Grafana + Loki pour les logs jusqu'ici. Aujourd'hui, on decouvre l'autre grande stack : ELK — Elasticsearch, Logstash, Kibana. C'est la stack historique de gestion de logs, utilisee par des milliers d'entreprises.

**Action** : Afficher le slide "Grafana Stack vs ELK Stack".

> Grafana Stack (Loki + Grafana) est optimise pour le cout : Loki indexe uniquement les labels, pas le contenu des logs. ELK indexe tout — chaque mot de chaque log est searchable. C'est plus couteux en stockage mais beaucoup plus puissant pour l'analyse.

> Quand choisir ELK : quand vous avez besoin de recherche full-text dans les logs, d'analyses complexes avec des aggregations, ou quand votre equipe connait deja Kibana. C'est le cas dans beaucoup d'entreprises.

### [02:30-06:00] Architecture ELK

**Action** : Montrer le diagramme d'architecture.

```
Applications → Filebeat → Logstash → Elasticsearch → Kibana
                (collecte)  (transform)  (stockage+index) (visualisation)
```

> Chaque composant a un role precis :
> - **Filebeat** collecte les logs depuis les fichiers ou les conteneurs Docker
> - **Logstash** transforme les logs : parsing, enrichissement, filtrage
> - **Elasticsearch** stocke et indexe les logs — c'est le moteur de recherche
> - **Kibana** visualise et explore les logs

**Action** : Lancer la stack avec Docker Compose.

```yaml
# docker-compose-elk.yml
services:
  elasticsearch:
    image: elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports:
      - 9200:9200

  logstash:
    image: logstash:8.12.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: kibana:8.12.0
    ports:
      - 5601:5601
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
```

### [06:00-10:00] Logstash — Parsing avec Grok

> Logstash est l'ETL des logs. Sa fonctionnalite la plus importante est le parsing avec les patterns grok.

**Action** : Montrer un pipeline Logstash.

```ruby
# logstash.conf
input {
  beats { port => 5044 }
}

filter {
  grok {
    match => {
      "message" => "%{IPORHOST:client_ip} - %{USER:user} \\[%{HTTPDATE:timestamp}\\] \"%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}\" %{NUMBER:status:int} %{NUMBER:bytes:int}"
    }
  }

  date {
    match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
    target => "@timestamp"
  }

  geoip {
    source => "client_ip"
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "logs-%{+YYYY.MM.dd}"
  }
}
```

> Grok transforme une ligne de log brute en champs structures. Le pattern `%{WORD:method}` extrait le premier mot et le nomme "method". `%{NUMBER:status:int}` extrait un nombre et le convertit en entier. C'est du regex rendu lisible.

### [10:00-13:00] Kibana — Discover et KQL

**Action** : Ouvrir Kibana et montrer Discover.

> Kibana Discover est l'interface de recherche des logs. Le langage de requete est KQL — Kibana Query Language.

```
# Exemples KQL
status: 500                          # Erreurs serveur
method: POST and status >= 400       # POST en erreur
message: "timeout" or message: "connection refused"
response_time > 2000                 # Requetes lentes
NOT user_agent: "HealthChecker"      # Exclure les health checks
```

> KQL est plus simple que Lucene (l'ancien langage). Pas besoin de guillemets pour les valeurs simples, les operateurs booleen sont en minuscule.

**Action** : Creer un dashboard avec des visualisations.

> Un dashboard Kibana typique pour les logs : un histogramme des erreurs par heure, un camembert des status codes, un tableau des top 10 endpoints les plus lents, et une carte geographique des requetes par pays.

### [13:00-16:00] ILM — Index Lifecycle Management

> Les logs accumulent enormement de donnees. Sans gestion, votre cluster Elasticsearch va manquer d'espace en quelques semaines.

**Action** : Montrer la strategie hot-warm-cold.

```
Hot (SSD rapide, 7 jours)    → Logs recents, recherche temps reel
Warm (HDD, 30 jours)         → Logs anciens, recherche occasionnelle
Cold (stockage archive, 1 an) → Archives, conformite, rarement accede
Delete (apres 1 an)           → Suppression automatique
```

> ILM automatise le cycle de vie : les logs arrivent sur les noeud hot (rapides), migrent vers warm apres 7 jours (moins chers), puis cold apres 30 jours (tres bon marche), et sont supprimes apres un an.

> C'est le meme principe que le tiering S3 Standard → Glacier chez AWS. L'objectif est d'optimiser le rapport cout/performance.

### [16:00-18:00] Recapitulatif

> ELK est la stack de reference pour la gestion de logs en entreprise. Elasticsearch indexe tout et permet la recherche full-text. Logstash parse et enrichit les logs avec grok. Kibana visualise et explore.

> KQL est le langage de requete de Kibana. ILM gere le cycle de vie des index pour maitriser les couts. Et Filebeat collecte les logs depuis vos applications.

> Faites le Lab 24 pour parser des logs avec grok, ecrire des requetes KQL, et configurer une politique ILM !

## Points d'attention pour l'enregistrement
- Docker Compose pour ELK necessite au moins 4 Go de RAM — prevenir les etudiants
- Le grok pattern est le concept le plus complexe — decomposer chaque pattern
- Montrer Kibana Discover en live avec des vrais logs
- La strategie hot-warm-cold est intuitive mais il faut bien expliquer le rationale economique
- Comparer avec Grafana/Loki pour que les etudiants comprennent les tradeoffs

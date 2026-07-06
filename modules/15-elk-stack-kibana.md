---
titre: ELK Stack & Kibana — agrégation centralisée des logs
cours: 16-observability-sre
notions: ["Elastic Stack (Elasticsearch, Kibana, ingestion)", "index & mapping (keyword vs text)", "ingestion (Elastic Agent / Beats / Logstash)", "data streams & index inversé", "Kibana Discover & Data Views", "requêtes KQL (AND/OR/NOT, wildcard, range, exists)", "quand ELK vs Loki (coût/rétention/full-text)", "ILM (hot-warm-cold, rétention)"]
outcomes:
  - sait expliquer l'architecture Elastic Stack (Elasticsearch, ingestion, Kibana) et le rôle de l'index inversé
  - sait poser un mapping avec les bons types (keyword pour filtrer, text pour full-text) sur les logs TribuZen
  - sait ingérer des logs JSON structurés dans Elasticsearch et les explorer dans Kibana Discover
  - sait écrire des requêtes KQL de base (égalité, AND/OR/NOT, wildcard, range, exists) sans les deviner
  - sait décider ELK vs Loki selon le coût, la rétention et le besoin de full-text
prerequis: ["modules 00-14 du cours", "module 01 — logging structuré JSON (requestId, traceId, redaction PII)"]
next: 16-observabilite-frontend
libs: []
tribuzen: agrégation centralisée des logs TribuZen (API + workers) dans Elasticsearch, exploration et requêtes KQL dans Kibana
last-reviewed: 2026-07
---

# ELK Stack & Kibana — agrégation centralisée des logs

> **Outcomes — tu sauras FAIRE :** décrire l'Elastic Stack et l'index inversé, poser un mapping `keyword`/`text` correct, ingérer les logs JSON de TribuZen dans Elasticsearch, les explorer dans Kibana Discover, écrire des KQL de base, et trancher ELK vs Loki.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module traite ELK **comme back-end d'agrégation de logs**, en prolongement direct du **module 01 (logging structuré Pino)** — on prend le JSON qu'on émet déjà et on le rend cherchable à l'échelle. On **ne refait pas** le pilier Logs (module 01), ni les métriques Prometheus (02) ou les traces (04-05). Elastic APM (traces/métriques) et le SIEM/sécurité sont **hors périmètre**. La rétention/minimisation des PII en profondeur est le **module 19 (RGPD)** — ici on pose seulement le lien ILM ↔ coût. La comparaison Loki s'appuie sur ce que tu connais déjà des modules Grafana (02, 07).

## 1. Cas concret d'abord

TribuZen tourne en production sur **trois instances** de l'API plus **deux workers** (envoi d'e-mails d'invitation, notifications). Grâce au module 01, chaque service émet du JSON Pino propre, avec `requestId` et `traceId`. Mais ce JSON part dans `stdout`, capturé par Docker, **éparpillé sur cinq conteneurs**.

Vendredi soir, un parent signale : « mon invitation n'est jamais arrivée ». Tu as le `requestId` dans la réponse d'erreur (`req_8f3a...`). Aujourd'hui, pour suivre cette requête, tu devrais te connecter en SSH à chaque hôte et `grep` les logs conteneur par conteneur :

```bash
# ce que tu fais SANS agrégation — infernal à 5 conteneurs, impossible à 50
docker logs tribuzen-api-1 | grep req_8f3a
docker logs tribuzen-worker-2 | grep req_8f3a
# ... et le worker a peut-être déjà été recyclé, ses logs sont PERDUS
```

Le problème n'est pas la qualité des logs — ils sont bons. C'est qu'ils sont **non centralisés et volatils**. Il te manque un endroit unique où **tous** les logs de **tous** les services atterrissent, sont **indexés**, et où une seule requête retrouve la trace complète d'une invitation.

À la fin de ce module, tes logs TribuZen seront ingérés dans **Elasticsearch**, et depuis **Kibana** cette requête KQL te rendra la timeline entière de l'invitation ratée, tous services confondus, en une seconde :

```
trace.id: "req_8f3a" and log.level: ("error" or "warn")
```

On construit chaque brique — index, mapping, ingestion, KQL — pour y arriver, sans deviner une seule syntaxe.

---

## 2. Théorie complète, concise

### 2.1 L'Elastic Stack (ex « ELK ») en une image

Source : docs Elastic (`elastic.co/guide`, version courante **9.x** ; la **8.x** reste supportée — les concepts ci-dessous valent pour les deux).

L'acronyme historique **ELK** = **E**lasticsearch + **L**ogstash + **K**ibana. Aujourd'hui Elastic parle d'**Elastic Stack**, car l'ingestion s'est diversifiée (Beats, Elastic Agent) et Logstash n'est plus obligatoire.

```
[ Services TribuZen ]        [ Ingestion ]           [ Stockage/moteur ]     [ UI ]
 api-1  stdout JSON  ──►  Elastic Agent / Filebeat  ──►  Elasticsearch  ──►  Kibana
 api-2  stdout JSON  ──►  (option: + Logstash          (index inversé,      (Discover,
 worker stdout JSON  ──►   pour transformer)            data streams)        dashboards)
```

Les trois rôles :
- **Elasticsearch** — le moteur : stocke les documents JSON, les **indexe**, répond aux recherches. C'est le cœur.
- **Ingestion** — amène les logs jusqu'à Elasticsearch : **Elastic Agent** (recommandé aujourd'hui), **Beats** (Filebeat pour les fichiers/conteneurs), et optionnellement **Logstash** quand il faut transformer/parser du non-structuré (ETL).
- **Kibana** — l'interface web : explorer (Discover), requêter (KQL), visualiser (dashboards), alerter.

### 2.2 Pourquoi Elasticsearch est rapide : l'index inversé

Une base classique (SQL) indexe **document → contenu**. Elasticsearch construit l'inverse : un **index inversé** **terme → documents qui le contiennent**, comme l'index alphabétique à la fin d'un livre.

```
Document 1 : { message: "timeout connecting to postgres" }
Document 2 : { message: "postgres pool exhausted" }

Index inversé (simplifié) :
  "timeout"    → [1]
  "connecting" → [1]
  "postgres"   → [1, 2]
  "pool"       → [2]
```

Chercher `postgres` ne scanne rien : on lit directement la liste `[1, 2]`. C'est ce qui rend la **recherche full-text** quasi instantanée sur des milliards de logs — et c'est aussi la raison du **coût de stockage** (§2.7) : tout est indexé.

### 2.3 Index, document, mapping

Vocabulaire Elasticsearch, avec l'analogie SQL (à connaître, mais Elasticsearch n'est **pas** relationnel) :

| Concept ES | Rôle | Analogie SQL |
|------------|------|--------------|
| **Index** | collection de documents du même type | table |
| **Document** | une unité JSON (ici : une ligne de log) | ligne |
| **Field** | une propriété du document | colonne |
| **Mapping** | le schéma d'un index (types des champs) | DDL / `CREATE TABLE` |
| **Shard** | partition physique d'un index (scaling horizontal) | partition |
| **Replica** | copie d'un shard (haute dispo) | réplica |

Le **mapping** est la pièce décisive pour des logs. Il déclare le **type** de chaque champ, ce qui détermine comment il est indexé et donc **cherchable**.

```json
// PUT logs-tribuzen — mapping explicite des champs Pino
{
  "mappings": {
    "properties": {
      "@timestamp":  { "type": "date" },
      "log.level":   { "type": "keyword" },
      "service.name":{ "type": "keyword" },
      "trace.id":    { "type": "keyword" },
      "req.id":      { "type": "keyword" },
      "status_code": { "type": "integer" },
      "duration_ms": { "type": "float" },
      "message":     { "type": "text" }
    }
  }
}
```

### 2.4 `keyword` vs `text` — LE choix qui casse tout si on le rate

C'est la distinction n°1 à maîtriser sur Elasticsearch.

- **`keyword`** — la valeur est stockée **telle quelle**, non découpée. Idéale pour **filtrer, agréger, trier** : `log.level`, `service.name`, `trace.id`, un `status`. `log.level: "error"` matche **exactement** `error`.
- **`text`** — la valeur est **analysée** : découpée en tokens, minusculisée, indexée mot par mot. Idéale pour la **recherche full-text** dans un `message` : chercher `postgres` retrouve `"timeout connecting to postgres"`.

```
level = "error"           → keyword : on veut le filtre EXACT "error"
message = "DB timeout on rsvp" → text : on veut retrouver via "timeout" OU "rsvp"
```

Un même champ peut être **les deux** via un `multi-field` (`message` en `text`, `message.keyword` en `keyword` pour l'agréger). Elasticsearch le fait par défaut sur les chaînes détectées automatiquement, mais **mappe explicitement tes champs de logs** : un `trace.id` mis en `text` par erreur devient impossible à filtrer proprement (il serait tokenisé).

### 2.5 Ingestion : comment les logs entrent

Trois voies, de la plus simple à la plus outillée :

1. **Elastic Agent** (recommandé aujourd'hui) — un agent unique, piloté centralement (Fleet), avec des **intégrations** prêtes (Nginx, PostgreSQL, Docker…). Remplace la plupart des usages Beats.
2. **Beats** — collecteurs légers spécialisés. **Filebeat** lit des fichiers ou les logs de conteneurs Docker et les pousse vers Elasticsearch (ou Logstash). Parfait quand tes services écrivent déjà du **JSON structuré** (cas TribuZen) : Filebeat décode le JSON et l'envoie tel quel.
3. **Logstash** — le **ETL** (Input → Filter → Output). Utile seulement quand il faut **transformer du non-structuré** : parser des logs texte legacy avec `grok`, enrichir (geoip), router. Si tes logs sont déjà du JSON propre (module 01), **tu n'as pas besoin de Logstash**.

```yaml
# filebeat.yml (extrait) — cas TribuZen : logs déjà en JSON, aucun parsing requis
filebeat.inputs:
  - type: container
    paths: ["/var/lib/docker/containers/*/*.log"]
    json.keys_under_root: true   # remonte les clés JSON à la racine du document
    json.add_error_key: true     # ajoute un champ d'erreur si le JSON est invalide
output.elasticsearch:
  hosts: ["http://elasticsearch:9200"]
  index: "logs-tribuzen-%{+yyyy.MM.dd}"
```

> **Le réflexe à retenir :** JSON structuré en amont (module 01) ⇒ ingestion simple (Filebeat/Agent) et **pas de Logstash**. Logs texte libre ⇒ Logstash + `grok` pour reconstruire de la structure. Le module 01 t'a évité le travail le plus pénible.

### 2.6 Kibana : Data View, Discover, KQL

Avant d'explorer, Kibana a besoin d'une **Data View** (ex « index pattern ») : un motif d'index (`logs-tribuzen-*`) + le champ temps (`@timestamp`). Elle dit à Kibana **quels index lire** et **sur quel champ dérouler le temps**.

**Discover** est l'écran d'exploration : histogramme temporel + table de documents + barre de recherche. C'est là qu'on tape du **KQL**.

**KQL (Kibana Query Language)** — syntaxe de **filtrage** (pas d'agrégation). Vérifiée sur la doc Kibana courante :

```
# égalité sur un champ
log.level: "error"

# recherche libre tous champs (pas de nom de champ)
timeout

# AND / OR / NOT (opérateurs insensibles à la casse)
log.level: "error" and service.name: "tribuzen-worker"
log.level: "error" or log.level: "fatal"
not status_code: 200

# parenthèses : plusieurs valeurs pour un même champ
log.level: ("error" or "warn")

# wildcard (zéro ou plusieurs caractères)
status_code: 5*
req.path: "/api/events/*"

# ranges numériques / temporels
duration_ms > 1000
duration_ms > 1000 and duration_ms <= 5000
@timestamp < now-2w

# exists : le champ est présent et indexé
trace.id: *
not trace.id: *      # documents SANS trace.id
```

**Lucene** est l'alternative historique, plus expressive mais plus verbeuse (`status_code:[500 TO 599]`, `message:"connection refused"`). Pour de l'exploration de logs, **KQL suffit** et se lit mieux ; on ne bascule sur Lucene que pour des besoins pointus (regex, plages de bornes inclusives).

Les **dashboards** Kibana (Lens en drag-and-drop, TSVB pour le temporel) reposent sur les **aggregations** Elasticsearch (`terms`, `date_histogram`, `percentiles`). On les mentionne pour la carte mentale, mais l'exercice du lab porte sur **Discover + KQL**, l'usage quotidien d'un dev en incident.

### 2.7 ELK vs Loki : quand choisir quoi (coût / rétention / full-text)

Le cours a construit le pilier Logs côté **Grafana Loki** (agrégation par labels, requêtes LogQL, stockage bon marché). ELK est l'**autre grande stack**. La différence structurante tient en une phrase :

> **Elasticsearch indexe le contenu de chaque log ; Loki n'indexe que les labels et garde le corps compressé.**

C'est le même arbitrage que métriques haute vs basse cardinalité (module 02), appliqué aux logs.

| Critère | ELK / Elasticsearch | Grafana Loki |
|---------|---------------------|--------------|
| Ce qui est indexé | **tout le contenu** (index inversé) | **labels seulement**, corps compressé |
| Recherche full-text | **excellente** (analyseurs, wildcard, pertinence) | basique, type `grep` sur une fenêtre de labels |
| Coût stockage / calcul | **élevé** (index volumineux, plus de RAM/CPU) | **faible** (peu d'index, stockage objet) |
| Requêtes | KQL, Lucene, Query DSL | LogQL (proche de PromQL) |
| Intégration métriques | Elastic APM, Metricbeat | Prometheus + Grafana natif |
| Opération | plus de composants à opérer | plus simple, s'aligne sur Prometheus/Grafana |

**Choisis ELK quand** : tu as besoin de **recherche full-text avancée** (analyseurs, pertinence, exploration ad hoc profonde), un **gros volume** avec recherche rapide, ou tu es déjà dans l'écosystème Elastic (APM, sécurité).

**Reste sur Loki quand** : le **coût** prime, tes **métriques Prometheus** sont centrales, tu veux une stack **simple à opérer**, et un `grep` par labels sur une fenêtre récente te suffit (le cas le plus fréquent pour une petite app comme TribuZen).

> Ce n'est pas « l'un OU l'autre pour toujours » : beaucoup d'équipes gardent Loki pour le volume courant bon marché et n'envoient vers Elasticsearch que ce qui exige du full-text.

### 2.8 ILM : rétention et coût maîtrisés

Indexer tout coûte cher ; on ne garde donc pas tout indexé « à chaud » éternellement. L'**Index Lifecycle Management (ILM)** fait vieillir les données par phases, sur des **data streams** (la façon moderne de gérer des index de logs qui roulent dans le temps) :

```
hot   (SSD, écritures + recherche fréquente)   0–7 j
warm  (moins de ressources, lecture seule)     7–30 j
cold  (stockage éco, accès rare)               30–90 j
delete (suppression = rétention appliquée)     > 90 j
```

L'ILM est le **levier coût** (module 18 FinObs) **et** le **levier rétention** (module 19 RGPD : on ne conserve pas des logs contenant potentiellement des données personnelles au-delà du nécessaire). Ici, retiens le principe : la phase `delete` **applique ta politique de rétention**.

---

## 3. Worked examples

### Exemple 1 — de zéro à « je requête mes logs TribuZen »

Objectif : poser l'index, y mettre un log Pino réel, le retrouver en KQL. On utilise l'API Elasticsearch directement (ce que Kibana Dev Tools ou `curl` envoient).

**Étape 1 — créer l'index avec un mapping explicite** (les bons `keyword`/`text`) :

```json
// PUT logs-tribuzen-000001
{
  "mappings": {
    "properties": {
      "@timestamp":   { "type": "date" },
      "log.level":    { "type": "keyword" },  // filtre exact
      "service.name": { "type": "keyword" },  // filtre exact
      "trace.id":     { "type": "keyword" },  // corrélation (module 01) — JAMAIS text
      "status_code":  { "type": "integer" },  // range
      "duration_ms":  { "type": "float" },    // range
      "message":      { "type": "text" }      // full-text
    }
  }
}
```

**Étape 2 — indexer un document** (exactement la forme d'un log Pino de TribuZen) :

```json
// POST logs-tribuzen-000001/_doc
{
  "@timestamp": "2026-07-06T21:03:11.482Z",
  "log.level": "error",
  "service.name": "tribuzen-worker",
  "trace.id": "req_8f3a",
  "status_code": 500,
  "duration_ms": 4210,
  "message": "invitation email failed: SMTP timeout"
}
```

**Étape 3 — le retrouver.** En Discover (Data View `logs-tribuzen-*`), la recherche du cas concret :

```
trace.id: "req_8f3a" and log.level: ("error" or "warn")
```

Elle rend **tous** les logs de cette requête, worker **et** API confondus, parce qu'ils partagent le `trace.id` posé au module 01. C'est la timeline complète de l'invitation ratée — impossible à obtenir avec un `grep` par conteneur.

### Exemple 2 — trois questions d'incident, trois KQL

Le soir d'un grand évènement, tu enquêtes. Voici l'ordre dans lequel un dev tape ses requêtes.

```
# (1) Y a-t-il un pic d'erreurs, et sur quel service ?
log.level: ("error" or "fatal")
#   → puis on regarde l'histogramme temporel et on ventile par service.name

# (2) Est-ce les e-mails d'invitation qui cassent ? (full-text sur message)
log.level: "error" and message: "invitation"
#   → 'invitation' matche grâce au type TEXT de message (tokenisé)

# (3) Combien de requêtes lentes ET en erreur serveur ? (range + keyword)
duration_ms > 3000 and status_code: 5*
```

La question (2) **ne marcherait pas** si `message` était en `keyword` : `message: "invitation"` chercherait alors le message **exactement égal** à `invitation`, jamais `"invitation email failed: SMTP timeout"`. C'est tout l'enjeu du §2.4.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — mettre un identifiant en `text` au lieu de `keyword`

`trace.id`, `req.id`, `service.name`, `status` doivent être **`keyword`**. En `text`, ils sont tokenisés : `trace.id: "req_8f3a"` peut alors matcher de travers, et **l'agrégation** (compter par service) devient impossible ou fausse. Règle : **tout ce qui est une valeur exacte à filtrer/grouper = `keyword` ; seul le texte libre à fouiller = `text`.**

### PIÈGE #2 — croire que `message: "invitation"` en `text` est une égalité

Sur un champ `text`, `message: "invitation"` est une **recherche full-text** (le doc match s'il *contient* le token `invitation`), pas une égalité. Inversement, sur un `keyword`, c'est une **égalité stricte**. Le même KQL n'a pas le même sens selon le type du champ — d'où l'importance de connaître ton mapping.

### PIÈGE #3 — sortir Logstash alors que tes logs sont déjà en JSON

Logstash + `grok` sert à **reconstruire de la structure** à partir de texte libre. Si le module 01 t'a fait émettre du JSON Pino propre, ajouter Logstash n'apporte rien qu'un composant de plus à opérer et à faire tomber. Filebeat/Elastic Agent décodent le JSON directement. **Ne paie pas Logstash sans logs non structurés à parser.**

### PIÈGE #4 — « ELK est mieux que Loki » (ou l'inverse)

Ce n'est pas un classement, c'est un **arbitrage coût / full-text**. Elasticsearch indexe tout → recherche riche mais cher. Loki indexe les labels → bon marché mais recherche pauvre. Choisir ELK « parce que c'est plus puissant » sur une petite app où un `grep` par labels suffit, c'est payer un index inversé qu'on n'exploite pas.

### PIÈGE #5 — indexer sans ILM ni rétention

Sans **ILM**, les index grossissent sans fin : la facture explose (§2.7) **et** tu conserves des logs — potentiellement porteurs de PII — bien au-delà du légal (module 19). Un index de logs sans phase `delete` est un bug de coût **et** de conformité, pas un détail d'ops.

### PIÈGE #6 — confondre KQL et Query DSL / Lucene

**KQL** = la barre de recherche Kibana (filtrage lisible). **Query DSL** = le JSON envoyé à l'API `_search` d'Elasticsearch (ce que Kibana génère sous le capot, et ce qu'on écrit pour les agrégations/dashboards). **Lucene** = l'autre langage de la barre Kibana, plus verbeux. Taper de la Query DSL JSON dans la barre KQL ne marche pas, et vice-versa.

---

## 5. Ancrage TribuZen

ELK est la **couche d'agrégation de logs centralisée** de TribuZen. Elle consomme le JSON structuré posé au module 01 — elle ne le remplace pas.

Ce qu'on met en place :

| Élément | Rôle dans TribuZen |
|---------|--------------------|
| Index `logs-tribuzen-*` (data stream) | destination unique de tous les logs API + workers |
| Mapping `keyword`/`text` | `log.level`, `service.name`, `trace.id`, `status_code` filtrables ; `message` full-text |
| Filebeat / Elastic Agent | collecte des `stdout` JSON des conteneurs, zéro parsing (JSON déjà propre) |
| Data View Kibana `logs-tribuzen-*` | exploration Discover, requêtes KQL d'incident |
| Politique ILM (rétention) | coût maîtrisé + rétention conforme (prépare le module 19) |

La valeur concrète : le `trace.id` du module 01 devient un **lien cliquable de bout en bout**. Une invitation ratée se reconstruit d'une requête KQL, à travers API et workers, sans SSH ni `grep`.

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  ops/
    elk/
      docker-compose.elk.yml     ← Elasticsearch + Kibana (+ Filebeat)
      filebeat.yml               ← collecte des logs conteneurs (JSON)
      mappings/
        logs-tribuzen.json       ← mapping keyword/text explicite
      ilm/
        logs-policy.json         ← hot-warm-cold + delete (rétention)
```

> **Choix TribuZen assumé :** pour une app de cette taille, **Loki reste le défaut** (coût, simplicité, alignement Prometheus/Grafana). ELK est introduit ici parce que c'est le standard entreprise que tu croiseras — et parce qu'un besoin de **full-text avancé** sur les logs support (retrouver un message métier précis) justifierait de router *une partie* des logs vers Elasticsearch. Décision = arbitrage, pas dogme.

---

## 6. Points clés

1. **Elastic Stack** = Elasticsearch (moteur/index) + ingestion (Elastic Agent / Beats / Logstash) + Kibana (UI). « ELK » est le nom historique. Versions actuelles : **9.x**, la **8.x** encore supportée.
2. Elasticsearch est rapide grâce à l'**index inversé** (terme → documents) — d'où sa force en full-text **et** son coût de stockage.
3. Vocabulaire : **index** (≈ table), **document** (≈ ligne JSON = un log), **mapping** (≈ schéma), **shard/replica** (scaling/HA).
4. **`keyword`** = valeur exacte à **filtrer/agréger** (level, trace.id, status) ; **`text`** = texte libre à **fouiller en full-text** (message). Se tromper de type casse les requêtes.
5. **Ingestion** : JSON structuré en amont (module 01) ⇒ Filebeat/Agent suffisent, **pas de Logstash** ; Logstash + `grok` seulement pour du texte non structuré.
6. **Kibana** : une **Data View** (`logs-tribuzen-*` + `@timestamp`), puis **Discover** + **KQL** pour explorer.
7. **KQL** : `champ: "val"`, `and/or/not`, `champ: ("a" or "b")`, wildcard `5*`, ranges `>`/`<`, `exists` via `champ: *`. C'est du **filtrage**, pas de l'agrégation.
8. **ELK vs Loki** = arbitrage **full-text riche mais cher** (ES indexe tout) vs **grep bon marché** (Loki indexe les labels). TribuZen : Loki par défaut, ELK si full-text.
9. **ILM** (hot-warm-cold-delete) = levier **coût** (module 18) **et** **rétention/RGPD** (module 19). Un index de logs sans phase `delete` est un bug.

---

## 7. Seeds Anki

```
Elasticsearch est rapide en full-text grâce à quelle structure, et quel en est le coût ?|L'index inversé : terme → liste des documents qui le contiennent (comme l'index d'un livre). Chercher un mot ne scanne rien, on lit la liste directe. Contrepartie : TOUT le contenu est indexé → coût de stockage/RAM élevé.
keyword vs text dans un mapping Elasticsearch : lequel pour quoi ?|keyword = valeur stockée telle quelle, pour FILTRER/AGRÉGER/TRIER exactement (log.level, trace.id, status). text = valeur analysée/tokenisée, pour la recherche FULL-TEXT dans du texte libre (message). Un id en text est un bug : impossible à filtrer/agréger proprement.
Sens de `message: "invitation"` selon que message est keyword ou text ?|Sur un champ text : recherche full-text, le doc match s'il CONTIENT le token invitation (ex: "invitation email failed"). Sur un champ keyword : égalité STRICTE, le message doit valoir exactement "invitation". Le même KQL n'a pas le même sens selon le mapping.
Quand a-t-on besoin de Logstash dans une stack Elastic ?|Uniquement pour transformer/parser du NON-structuré : logs texte libre à reconstruire avec grok, enrichissement (geoip), routage. Si les logs sont déjà en JSON propre (module 01 Pino), Filebeat/Elastic Agent les décodent directement → pas de Logstash.
Écris la KQL qui retrouve tous les logs error OU warn d'une requête donnée.|trace.id: "req_8f3a" and log.level: ("error" or "warn"). KQL filtre (pas d'agrégation) ; les parenthèses donnent plusieurs valeurs pour un même champ ; and/or/not sont insensibles à la casse.
KQL : comment tester qu'un champ existe / n'existe pas ?|Existe : champ: * (ex trace.id: *). N'existe pas : not champ: * (ex not trace.id: *). * = wildcard zéro-ou-plus ; sur exists il signifie "le champ est présent et indexé".
ELK vs Loki : la différence structurante en une phrase ?|Elasticsearch indexe TOUT le contenu de chaque log (full-text riche mais cher) ; Loki n'indexe que les LABELS et garde le corps compressé (grep bon marché mais pauvre). C'est un arbitrage coût/full-text, pas un classement. TribuZen : Loki par défaut, ELK si besoin de full-text.
À quoi sert l'ILM et pourquoi est-ce à la fois un sujet coût ET RGPD ?|ILM = Index Lifecycle Management : fait vieillir les index par phases hot→warm→cold→delete. Coût (module 18) : on ne garde pas tout indexé à chaud indéfiniment. RGPD (module 19) : la phase delete APPLIQUE la rétention, on ne conserve pas des logs (potentiellement PII) au-delà du légal.
Que faut-il configurer dans Kibana avant d'explorer des logs, et où tape-t-on le KQL ?|Une Data View (ex index pattern) : un motif d'index (logs-tribuzen-*) + le champ temps (@timestamp). Ensuite l'écran Discover (histogramme + table + barre de recherche) est là où on tape le KQL pour filtrer.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-15-elk-stack-kibana/README.md`. Lancer une vraie stack Elasticsearch + Kibana (docker-compose fourni), ingérer les logs JSON de TribuZen, poser un mapping `keyword`/`text` correct, puis écrire trois KQL d'incident dans Discover — corrigé commenté, grille, coach en session, variante J+30.

# Lab 15 — ELK Stack & Kibana : agréger les logs TribuZen

> **Outcome :** à la fin, tu sais lancer une vraie stack **Elasticsearch + Kibana**, y **ingérer** les logs JSON structurés de TribuZen, poser un **mapping** `keyword`/`text` correct, créer une **Data View**, et écrire **trois KQL d'incident** dans Discover pour retrouver la timeline complète d'une invitation ratée.
> **Vrai outil :** Elasticsearch 8.x/9.x + Kibana (docker-compose fourni ci-dessous). Aucun harnais simulé, aucun auto-correcteur.
> **Feedback :** le coach valide en session — la lecture de Discover et le choix des types de mapping se discutent à deux.

---

## Prérequis

- Modules **01** (logging structuré Pino : `requestId`/`traceId`, JSON) et **15** lus.
- Docker + Docker Compose installés (`docker compose version`).
- ~2 Go de RAM libres pour Elasticsearch (baisse `ES_JAVA_OPTS` si besoin).

> Cette stack ELK est **volontairement séparée** des docker-compose du cours (`docker-compose.full.yml` = Prometheus/Grafana/OTel). ELK est un back-end de **logs**, on le monte à part.

### Stack fournie (à copier dans `lab-15/`)

`docker-compose.elk.yml` — Elasticsearch + Kibana, sécurité désactivée pour le lab local **uniquement** :

```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.17.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false        # LAB LOCAL SEULEMENT — jamais en prod
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      retries: 12

  kibana:
    image: docker.elastic.co/kibana/kibana:8.17.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"                         # UI Kibana : http://localhost:5601
    depends_on:
      elasticsearch:
        condition: service_healthy
```

```bash
docker compose -f docker-compose.elk.yml up -d
# attends ~1 min puis vérifie :
curl localhost:9200                                   # infos cluster ES
curl localhost:9200/_cluster/health?pretty            # "status" doit être green ou yellow
# Kibana : ouvre http://localhost:5601 (peut mettre 1-2 min à démarrer)
```

> `yellow` est **normal** en single-node : les replicas n'ont pas de second nœud où se poser. Ce n'est pas une erreur pour ce lab.

---

## Énoncé

La CTO de TribuZen te dit : *« un parent n'a jamais reçu son invitation, requête `req_8f3a`. Les logs sont bons (module 01) mais éparpillés sur 5 conteneurs. Centralise-les dans Elasticsearch et retrouve-moi la timeline complète. »*

Tu vas, **sans gap-fill** :

1. **Créer l'index** `logs-tribuzen` avec un **mapping explicite** : les bons types `keyword` (à filtrer) vs `text` (full-text).
2. **Ingérer** un jeu de logs JSON TribuZen (fourni ci-dessous) via l'API `_bulk`.
3. **Créer la Data View** `logs-tribuzen*` sur `@timestamp` dans Kibana.
4. **Écrire trois KQL** dans Discover répondant à trois questions d'incident.

> On indexe via l'API `_bulk` (au lieu de Filebeat) pour que le lab tienne en un fichier, sans monter d'agent. Le mapping et les KQL — le cœur pédagogique — sont **identiques** à une ingestion Filebeat réelle. L'**Application TribuZen** en fin de lab montre la version Filebeat.

### Jeu de logs fourni (`logs.ndjson`)

Format **bulk** Elasticsearch (une ligne d'action, une ligne de document, alternées). Ce sont de vrais logs Pino TribuZen : deux services, un `trace.id` commun sur la requête fautive.

```
{"index":{}}
{"@timestamp":"2026-07-06T21:03:10.101Z","log.level":"info","service.name":"tribuzen-api","trace.id":"req_8f3a","status_code":202,"duration_ms":38,"message":"rsvp accepted, invitation email queued"}
{"index":{}}
{"@timestamp":"2026-07-06T21:03:11.482Z","log.level":"error","service.name":"tribuzen-worker","trace.id":"req_8f3a","status_code":500,"duration_ms":4210,"message":"invitation email failed: SMTP timeout"}
{"index":{}}
{"@timestamp":"2026-07-06T21:03:12.900Z","log.level":"warn","service.name":"tribuzen-worker","trace.id":"req_8f3a","status_code":500,"duration_ms":10,"message":"invitation retry scheduled in 60s"}
{"index":{}}
{"@timestamp":"2026-07-06T21:04:02.005Z","log.level":"info","service.name":"tribuzen-api","trace.id":"req_2c19","status_code":200,"duration_ms":52,"message":"family created"}
{"index":{}}
{"@timestamp":"2026-07-06T21:05:44.771Z","log.level":"error","service.name":"tribuzen-api","trace.id":"req_77aa","status_code":503,"duration_ms":3100,"message":"db pool exhausted on rsvp"}
```

### Starter minimal

```bash
# 1. Crée l'index avec TON mapping (à compléter) :
curl -X PUT localhost:9200/logs-tribuzen -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "@timestamp":   { "type": "date" }
      /* À toi : log.level, service.name, trace.id, status_code, duration_ms, message
         avec le BON type (keyword pour filtrer, text pour full-text). */
    }
  }
}'

# 2. Ingère le bulk (le fichier logs.ndjson ci-dessus, dans le même dossier) :
curl -X POST localhost:9200/logs-tribuzen/_bulk \
  -H 'Content-Type: application/x-ndjson' --data-binary @logs.ndjson

# 3. Vérifie l'ingestion :
curl 'localhost:9200/logs-tribuzen/_count?pretty'    # doit renvoyer 5
```

Puis, dans Kibana (`http://localhost:5601`) → **Discover** → crée la Data View, écris les KQL.

---

## Étapes (en friction)

1. **Décide chaque type de mapping AVANT de taper.** Pour chacun — `log.level`, `service.name`, `trace.id`, `status_code`, `duration_ms`, `message` — demande-toi : *« vais-je le filtrer/grouper exactement, ou le fouiller en full-text ? »* Écris ta réponse, puis mappe.
2. **Crée l'index** avec ton mapping (starter). Si tu l'as déjà créé, supprime-le d'abord (`curl -X DELETE localhost:9200/logs-tribuzen`) — un mapping n'est **pas** modifiable a posteriori sur un champ existant.
3. **Vérifie le mapping appliqué** : `curl 'localhost:9200/logs-tribuzen/_mapping?pretty'`. Contrôle que `message` est bien `text` et `trace.id` bien `keyword`.
4. **Ingère** le bulk, vérifie `_count` = 5.
5. **Crée la Data View** dans Kibana : Discover → *Create data view* → nom de motif `logs-tribuzen*`, champ temps `@timestamp`. Élargis la fenêtre temporelle à *Last 1 year* (les logs sont datés du 6 juillet).
6. **Écris les trois KQL** dans la barre Discover, une par question :
   - **Q1** — la timeline complète de la requête fautive, seulement error/warn.
   - **Q2** — toutes les erreurs qui parlent d'**invitation** (full-text sur `message`).
   - **Q3** — les logs **lents** (`> 1000 ms`) **et** en erreur serveur (status `5xx`).
7. **Provoque le piège #2** : refais Q2 en changeant mentalement `message` en `keyword` — pourquoi ne matcherait-il plus rien ? (Tu peux le tester en vrai : recrée l'index avec `message` en `keyword` et observe Q2 revenir vide.)

---

## Corrigé complet commenté

**Mapping (étape 1-2) :**

```json
// PUT logs-tribuzen
{
  "mappings": {
    "properties": {
      "@timestamp":   { "type": "date" },
      "log.level":    { "type": "keyword" },  // filtre exact : "error", "warn"...
      "service.name": { "type": "keyword" },  // filtre/groupe : tribuzen-api vs worker
      "trace.id":     { "type": "keyword" },  // corrélation module 01 — JAMAIS text
      "status_code":  { "type": "integer" },  // range numérique + wildcard 5*
      "duration_ms":  { "type": "float" },    // range numérique
      "message":      { "type": "text" }      // full-text : on fouille les mots
    }
  }
}
```

**Les trois KQL (étape 6) :**

```
// Q1 — timeline complète de req_8f3a, error/warn seulement
// trace.id est keyword → égalité exacte ; parenthèses = plusieurs valeurs d'un champ
trace.id: "req_8f3a" and log.level: ("error" or "warn")
//   → 2 documents (l'error SMTP + le warn retry du worker). L'info initiale (api)
//     est exclue par le filtre de niveau : c'est voulu, on cherche ce qui a cassé.

// Q2 — toutes les erreurs qui parlent d'invitation
// message est TEXT → full-text : "invitation" matche s'il est un token du message
log.level: "error" and message: "invitation"
//   → 1 document : "invitation email failed: SMTP timeout".
//     Le doc "db pool exhausted" est error mais ne contient pas le mot invitation → exclu.

// Q3 — logs lents ET en erreur serveur
// duration_ms range numérique (grâce au type float) + wildcard sur status_code
duration_ms > 1000 and status_code: 5*
//   → 2 documents : le SMTP timeout (4210 ms, 500) et le db pool (3100 ms, 503).
//     Le warn retry (10 ms) est exclu : rapide, malgré son status 500.
```

**Pourquoi ce corrigé est correct :**

- **`trace.id` en `keyword`** : `trace.id: "req_8f3a"` est une égalité stricte. En `text`, l'id serait tokenisé (`req`, `8f3a`…) et le filtre deviendrait ambigu — d'où la règle « id = keyword ».
- **`message` en `text`** : Q2 repose entièrement là-dessus. Un champ `text` tokenise `"invitation email failed: SMTP timeout"` en `invitation`, `email`, `failed`, `smtp`, `timeout` ; `message: "invitation"` matche le token. **En `keyword`, Q2 renverrait 0** (aucun message ne vaut *exactement* `invitation`) — c'est le piège #2 du module, à vérifier en direct.
- **`status_code` en `integer`** : permet le range de Q3 (`duration_ms > 1000`) sur un champ numérique et le wildcard `5*` sur le status. Un champ mal typé (string) casserait le range.
- **Data View + fenêtre temporelle** : oublier d'élargir la fenêtre (défaut *Last 15 minutes*) est la cause n°1 de « Discover est vide alors que `_count` = 5 ». Les données existent, elles sont juste hors de la fenêtre affichée.

---

## Grille d'évaluation (le coach coche)

| Critère | Attendu | OK ? |
|---|---|---|
| Types de mapping | `keyword` pour level/service/trace.id ; `text` pour message ; numériques pour status/duration | ☐ |
| Justifie keyword vs text | sait dire *pourquoi* chaque champ a son type (filtrer vs fouiller) | ☐ |
| Ingestion | `_bulk` réussi, `_count` = 5, `_mapping` vérifié | ☐ |
| Data View | motif `logs-tribuzen*` + `@timestamp` + fenêtre temporelle élargie | ☐ |
| Q1 corrélation | `trace.id: "..." and log.level: ("error" or "warn")`, comprend les parenthèses | ☐ |
| Q2 full-text | `message: "invitation"` et sait que ça dépend du type `text` | ☐ |
| Q3 range + wildcard | `duration_ms > 1000 and status_code: 5*` | ☐ |
| Piège #2 vérifié | a compris/testé que Q2 casserait si `message` était `keyword` | ☐ |

---

## Notes coach (à dérouler en session)

- **Relance si silence** : avant de créer l'index — « pour `trace.id`, tu mets `keyword` ou `text` ? Pourquoi ? ». S'il hésite, faire décrire ce que devient l'id une fois tokenisé.
- **Piège à provoquer (le point du lab)** : une fois Q2 verte, demander « et si `message` était `keyword`, Q2 renverrait quoi ? ». Le faire **tester en vrai** (recréer l'index, message en keyword, relancer Q2 → 0 résultat). L'aha-moment keyword/text vaut tout le reste.
- **Vérifier la compréhension, pas la recopie** : s'il colle les KQL du corrigé sans les avoir dérivés, lui donner une **4e question à froid** (ex : « tous les logs du worker qui ne sont PAS des erreurs » → `service.name: "tribuzen-worker" and not log.level: "error"`).
- **Erreur classique à guetter** : Discover vide malgré `_count` = 5 → 9 fois sur 10 la fenêtre temporelle est trop étroite. Faire regarder l'histogramme, pas paniquer sur l'ingestion.
- **Ouvrir sur la décision** : conclure par « pour TribuZen, tu partirais ELK ou Loki, et pourquoi ? ». Bonne réponse = arbitrage coût/full-text argumenté, pas un camp.
- **Louange calibrée** : féliciter seulement si Sylvain a **justifié ses types de mapping** et **dérivé** ses KQL. Une stack qui tourne n'est pas l'objectif ; le choix keyword/text et la lecture des résultats le sont.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées** (sans rouvrir ce corrigé ni le module 15), en **30 minutes** :

1. **Sans mapping explicite** : laisse Elasticsearch **auto-détecter** les types (indexe le bulk dans un index neuf sans `PUT` préalable), puis inspecte `_mapping`. Repère comment ES a typé `message` et `trace.id` (indice : chaînes → `text` **avec** un sous-champ `.keyword`). Écris la KQL de corrélation Q1 en tenant compte de ce mapping auto (faut-il viser `trace.id` ou `trace.id.keyword` ?).
2. **Ajoute une politique ILM minimale** : crée une policy `logs-tribuzen-policy` avec une phase `delete` à `min_age: 90d`, et explique en une phrase pourquoi cette ligne relève **à la fois** du coût (module 18) et du RGPD (module 19).
3. **Écris une 4e KQL** que tu n'as jamais tapée : « les requêtes de l'API en 5xx **ou** de plus de 3 s, hors requête `req_8f3a` ».

**Critère de réussite :** tu expliques la différence entre mapping explicite et auto-détecté (et son impact sur les KQL), ta policy ILM a une phase `delete`, et tes KQL renvoient les bons documents.

---

## Application TribuZen

Dans `smaurier/tribuzen`, la version réelle **n'ingère pas via `_bulk`** mais via **Filebeat**, qui lit les `stdout` JSON des conteneurs :

```
tribuzen/
  ops/
    elk/
      docker-compose.elk.yml     ← Elasticsearch + Kibana + Filebeat
      filebeat.yml               ← collecte des logs conteneurs (json.keys_under_root)
      mappings/
        logs-tribuzen.json       ← CE mapping keyword/text (index template)
      ilm/
        logs-policy.json         ← hot-warm-cold + delete (rétention, module 19)
```

**Différences avec le lab :**
- **Ingestion réelle = Filebeat** (input `container`, `json.keys_under_root: true`) au lieu de `_bulk` manuel. Le mapping, lui, est **identique** — c'est pour ça qu'on l'a travaillé ici.
- Le mapping devient un **index template** appliqué automatiquement aux data streams `logs-tribuzen-*` qui roulent chaque jour, avec la **policy ILM** attachée.
- **Sécurité activée** (`xpack.security.enabled=true`, utilisateurs/rôles, TLS) — le `xpack.security.enabled=false` du lab est **strictement local**.
- **Décision d'archi assumée** : TribuZen reste sur **Loki par défaut** (coût, alignement Grafana). Cet ELK est monté pour l'expérience et pour router *les logs support à fort besoin full-text* — arbitrage, pas remplacement.

**Commit cible :**
```
feat(obs): agrégation logs ELK — mapping keyword/text, Filebeat, ILM rétention 90j
```

# Module 24 — Honeycomb & Observabilite Haute Cardinalite

## Objectifs pedagogiques

- Comprendre la philosophie "Observability 2.0" de Honeycomb
- Maitriser le concept de haute cardinalite et son impact
- Envoyer des evenements riches via OpenTelemetry
- Explorer des donnees avec le Query Builder et BubbleUp
- Configurer des SLOs et Triggers dans Honeycomb
- Comparer Honeycomb vs Grafana vs Datadog vs ELK

---

## 1. Observabilite 2.0 — Au-dela des trois piliers

### Le probleme des metriques classiques

Vous connaissez les trois piliers : **logs**, **metriques**, **traces** (modules 02-09). Mais cette approche a des limites.

Imaginez un probleme en production : "Les requetes sont lentes pour certains utilisateurs depuis le dernier deploiement". Avec les metriques classiques :

```
# Prometheus — latence P99 globale
http_request_duration_seconds{quantile="0.99"} = 2.5s  ← trop lent

# Mais QUELS utilisateurs ? QUEL endpoint ? QUEL build ?
# Vous devez deviner et filtrer manuellement :
http_request_duration_seconds{endpoint="/api/search", region="eu-west"} = ???
```

Le probleme : les metriques sont **pre-agregees**. Vous avez decide a l'avance quelles dimensions capturer. Si le probleme vient d'une dimension que vous n'avez pas prevue (un feature flag, un type de compte, une version du SDK mobile), vous etes bloques.

### L'approche evenementielle de Honeycomb

Honeycomb propose une approche radicalement differente : **ne pas pre-agreger, stocker les evenements bruts**.

```typescript
// Approche metriques classique (Prometheus)
// Vous decidez A L'AVANCE quelles dimensions capturer
counter.inc({ method: 'GET', status: '200', endpoint: '/api/search' });
// → 3 dimensions, c'est tout

// Approche evenementielle (Honeycomb)
// Vous capturez TOUT le contexte de chaque requete
sendEvent({
  method: 'GET',
  status: 200,
  endpoint: '/api/search',
  duration_ms: 245,
  user_id: 'usr_abc123',          // haute cardinalite
  build_id: 'build_2024_03_14',   // haute cardinalite
  region: 'eu-west-1',
  cache_hit: true,
  db_query_count: 3,
  db_duration_ms: 120,
  feature_flags: ['new-search-v2', 'premium-tier'],
  user_plan: 'enterprise',
  sdk_version: '3.2.1',
  error_message: null,
});
// → 13+ dimensions, explorees a posteriori
```

Avec les evenements bruts, vous pouvez poser **n'importe quelle question apres coup** :
- "Quelle est la latence P99 des utilisateurs enterprise sur le build d'aujourd'hui ?"
- "Les utilisateurs avec le feature flag `new-search-v2` sont-ils plus lents ?"
- "Quel est le taux d'erreur par version du SDK mobile ?"

### Le livre "Observability Engineering"

Ecrit par **Charity Majors** (CEO Honeycomb, ex-Facebook/Parse), **Liz Fong-Jones** et **George Miranda**, ce livre remet en question l'approche traditionnelle. Points cles :

1. **L'observabilite n'est pas les trois piliers** — c'est la capacite a poser des questions inedites sur votre systeme
2. **Les unknowns unknowns** — les bugs les plus difficiles sont ceux que vous n'aviez pas anticipes
3. **Instrumentation riche** — capturez le maximum de contexte par evenement
4. **Exploration, pas dashboards** — les dashboards montrent ce que vous savez deja, l'exploration revele ce que vous ne savez pas

---

## 2. Haute cardinalite — Le concept cle

### Definition

La **cardinalite** d'un champ est le nombre de valeurs uniques qu'il peut prendre.

| Champ | Cardinalite | Type |
|-------|-------------|------|
| `status_code` | ~10 (200, 201, 400, 404, 500...) | Basse |
| `http_method` | ~5 (GET, POST, PUT, DELETE, PATCH) | Basse |
| `region` | ~20 | Basse |
| `endpoint` | ~100 | Moyenne |
| `user_id` | Milliers → Millions | **Haute** |
| `request_id` | Unique par requete | **Tres haute** |
| `build_id` | Dizaines par jour | **Haute** |
| `session_id` | Unique par session | **Tres haute** |

### Pourquoi les metriques echouent avec la haute cardinalite

Prometheus stocke une **serie temporelle** par combinaison unique de labels :

```
# 5 methods × 10 status × 20 regions = 1000 series → OK
http_requests_total{method="GET", status="200", region="eu-west"}

# + 100K users = 100M series → EXPLOSION
http_requests_total{method="GET", status="200", region="eu-west", user_id="usr_123"}
# ❌ Prometheus ne peut pas gerer ca
```

C'est pour cela que la documentation Prometheus deconseille d'ajouter des labels a haute cardinalite. Mais ce sont justement ces dimensions qui sont les plus utiles pour le debugging.

### Honeycomb et la haute cardinalite

Honeycomb stocke des **evenements individuels**, pas des series temporelles. Chaque evenement est un document avec autant de champs que necessaire. La cardinalite n'est pas un probleme de stockage.

```
Evenement 1: { user_id: "usr_123", duration: 50ms, endpoint: "/search", ... }
Evenement 2: { user_id: "usr_456", duration: 2500ms, endpoint: "/search", ... }
Evenement 3: { user_id: "usr_789", duration: 45ms, endpoint: "/search", ... }
...
// Honeycomb peut GROUP BY user_id sans probleme
```

---

## 3. Architecture Honeycomb

### Concepts

| Concept | Description |
|---------|-------------|
| **Event** | Un document JSON avec des champs et un timestamp |
| **Dataset** | Collection d'evenements (comme un index Elasticsearch) |
| **Environment** | Isolation logique (production, staging, dev) |
| **API Key** | Cle d'ingestion (par environment) |
| **Team** | Organisation dans Honeycomb |

### Ingestion

Deux methodes principales :

**1. Via OpenTelemetry (recommande)** :
```typescript
// Honeycomb est 100% compatible OTel
import { HoneycombSDK } from '@honeycombio/opentelemetry-node';

const sdk = new HoneycombSDK({
  apiKey: process.env.HONEYCOMB_API_KEY,
  serviceName: 'my-api',
  // Les spans OTel deviennent des events Honeycomb
});

sdk.start();
```

**2. Via le SDK Honeycomb natif** (libhoney) :
```typescript
import Libhoney from 'libhoney';

const honey = new Libhoney({
  writeKey: process.env.HONEYCOMB_API_KEY,
  dataset: 'my-api',
});

// Envoyer un event
const event = honey.newEvent();
event.add({
  endpoint: '/api/search',
  duration_ms: 245,
  user_id: 'usr_123',
  cache_hit: true,
  db_query_count: 3,
});
event.send();
```

### Ajout de champs custom aux spans OTel

```typescript
import { trace } from '@opentelemetry/api';

app.get('/api/search', async (req, res) => {
  const span = trace.getActiveSpan();

  // Ajouter du contexte haute cardinalite
  span?.setAttributes({
    'user.id': req.user.id,
    'user.plan': req.user.plan,
    'feature_flags': JSON.stringify(req.featureFlags),
    'search.query': req.query.q,
    'search.result_count': results.length,
    'cache.hit': cacheResult !== null,
    'db.query_count': queryCount,
  });

  res.json(results);
});
```

---

## 4. Query Builder

Le Query Builder est l'interface principale de Honeycomb. Contrairement aux dashboards pre-construits, il permet d'explorer les donnees de maniere ad-hoc.

### Anatomie d'une requete

```
VISUALIZE: COUNT, P99(duration_ms), AVG(duration_ms)
WHERE: status_code >= 500
GROUP BY: endpoint, region
HAVING: COUNT > 10
ORDER: P99(duration_ms) DESC
LIMIT: 20
TIME RANGE: Last 1 hour
```

### Fonctions VISUALIZE

| Fonction | Description |
|----------|-------------|
| `COUNT` | Nombre d'evenements |
| `COUNT_DISTINCT(field)` | Valeurs uniques |
| `SUM(field)` | Somme |
| `AVG(field)` | Moyenne |
| `MAX(field)` / `MIN(field)` | Extremes |
| `P50(field)` / `P95(field)` / `P99(field)` | Percentiles |
| `HEATMAP(field)` | Distribution visuelle |
| `RATE_AVG(field)` | Taux moyen par seconde |

### Exemples de requetes

```
# Latence P99 par endpoint, derniere heure
VISUALIZE: P99(duration_ms)
GROUP BY: endpoint
TIME: Last 1 hour

# Taux d'erreur par region
VISUALIZE: COUNT
WHERE: status_code >= 500
GROUP BY: region
TIME: Last 6 hours

# Users les plus impactes par les erreurs
VISUALIZE: COUNT
WHERE: status_code >= 500
GROUP BY: user_id
ORDER: COUNT DESC
LIMIT: 10
TIME: Last 1 hour

# Distribution de la latence (heatmap)
VISUALIZE: HEATMAP(duration_ms)
WHERE: endpoint = "/api/search"
TIME: Last 1 hour
```

---

## 5. BubbleUp — Correlation automatique

BubbleUp est la fonctionnalite signature de Honeycomb. Quand vous observez une anomalie sur un graphe (un pic de latence, un spike d'erreurs), vous selectionnez la zone problematique et BubbleUp **identifie automatiquement** les dimensions qui differencient les evenements anormaux de la baseline.

### Comment ca marche

1. Vous voyez un pic de latence entre 14h00 et 14h30
2. Vous selectionnez cette zone dans le graphe
3. Honeycomb compare les evenements dans la zone avec les evenements hors zone
4. Pour chaque dimension, Honeycomb calcule la deviation
5. Les dimensions avec la plus grande deviation sont affichees en premier

### Exemple concret

```
Baseline (hors zone) :
  build_id = "build_v42"  → 95%
  build_id = "build_v43"  → 5%
  cache_hit = true         → 70%

Zone anormale :
  build_id = "build_v42"  → 10%   ← deviation massive !
  build_id = "build_v43"  → 90%   ← C'EST LE NOUVEAU BUILD
  cache_hit = true         → 15%   ← Le cache ne fonctionne plus

→ BubbleUp identifie : "build_v43" et "cache_hit=false" sont les facteurs.
→ Diagnostic : le build v43 a casse le cache.
```

Sans BubbleUp, vous auriez du deviner que le probleme venait du cache du nouveau build. Avec 50+ dimensions par evenement, ce n'est pas evident.

### Implementation simplifiee

```typescript
// Le principe algorithmique de BubbleUp
function bubbleUp(
  baselineEvents: Event[],
  anomalyEvents: Event[],
  fields: string[],
): Correlation[] {
  const correlations: Correlation[] = [];

  for (const field of fields) {
    // Distribution dans la baseline
    const baselineDist = getDistribution(baselineEvents, field);
    // Distribution dans l'anomalie
    const anomalyDist = getDistribution(anomalyEvents, field);

    // Calculer la deviation pour chaque valeur
    for (const value of Object.keys(anomalyDist)) {
      const baselineRatio = baselineDist[value] || 0;
      const anomalyRatio = anomalyDist[value];
      const deviation = Math.abs(anomalyRatio - baselineRatio);

      if (deviation > 0.1) { // seuil de significativite
        correlations.push({ field, value, deviation, anomalyRatio, baselineRatio });
      }
    }
  }

  return correlations.sort((a, b) => b.deviation - a.deviation);
}
```

---

## 6. SLOs dans Honeycomb

Honeycomb permet de definir des **SLOs** bases sur les evenements (pas sur les metriques pre-agregees).

### Definition

```
SLO: "API Search Latency"
  Good event: duration_ms < 500 AND status_code < 500
  Total events: endpoint = "/api/search"
  Target: 99.5%
  Window: 30 days
```

### Burn Alerts

Quand le taux de consumption de l'error budget depasse un seuil, Honeycomb envoie une alerte :

- **Slow burn** : le budget se consume plus vite que prevu sur une longue periode
- **Fast burn** : le budget se consume tres vite (incident en cours)

### Avantage vs SLOs Prometheus

Avec Prometheus, les SLOs sont bases sur des metriques pre-agregees. Si vous voulez savoir **pourquoi** le SLO est viole, vous devez passer aux traces.

Avec Honeycomb, les SLOs sont bases sur les memes evenements que le debugging. Quand un SLO est viole, vous cliquez directement pour voir les evenements responsables et lancer un BubbleUp.

---

## 7. Triggers

Les Triggers sont le systeme d'alerting de Honeycomb, base sur les requetes.

### Types

| Type | Exemple |
|------|---------|
| **Threshold** | P99(duration_ms) > 2000 pendant 5 min |
| **Missing data** | Aucun evenement depuis 10 min |
| **Rate of change** | COUNT augmente de 200% vs la semaine derniere |

### Configuration

```
Trigger: "Search Latency Alert"
  Query: VISUALIZE P99(duration_ms) WHERE endpoint = "/api/search"
  Condition: value > 2000 for 5 minutes
  Recipients: #alerts-search (Slack), oncall@team.com (email)
  Frequency: every 5 minutes
  Resolved notification: yes
```

---

## 8. Derived Columns

Les Derived Columns ajoutent des champs calcules a partir des champs existants.

```
# Bucket de latence
IF(LTE($duration_ms, 100), "fast",
  IF(LTE($duration_ms, 500), "medium",
    IF(LTE($duration_ms, 2000), "slow", "very_slow")))

# Extraire le domaine d'un email
REG_VALUE($user_email, "^[^@]+@(.+)$")

# Taux d'erreur booleen
IF(GTE($status_code, 500), 1, 0)

# Concatenation pour un identifiant composite
CONCAT($service, ":", $endpoint)
```

Les Derived Columns sont utiles pour :
- **Bucketing** : regrouper les latences en categories
- **Extraction** : parser un champ complexe
- **Normalisation** : creer des indicateurs booleens (is_error, is_slow)

---

## 9. Comparaison des plateformes

| Critere | Honeycomb | Grafana Cloud | Datadog | ELK | New Relic |
|---------|-----------|--------------|---------|-----|-----------|
| **Paradigme** | Evenements | Metriques + Logs | APM | Logs + Search | APM |
| **Haute cardinalite** | Natif | Limite (Loki labels) | Bon (tags) | Bon (Elasticsearch) | Bon |
| **BubbleUp / Correlation** | Natif | Non | Watchdog (ML) | Non | Lookout (ML) |
| **SLOs** | Natif, event-based | Prometheus-based | Natif | Non natif | Natif |
| **Query flexibility** | Excellente | Bonne (PromQL/LogQL) | Bonne | Excellente (KQL/DSL) | Bonne (NRQL) |
| **Cout** | Par evenement | Par serie + volume | Par host + volume | Par volume indexe | Par Go ingere |
| **Self-hosted** | Non | Oui (OSS) | Non | Oui | Non |
| **Complexite ops** | Zero (SaaS) | Elevee (self-hosted) | Faible (SaaS) | Elevee | Faible (SaaS) |
| **Communaute** | Niche, passionnee | Tres large (OSS) | Large (enterprise) | Tres large | Large |
| **Prix** | $$ | $ (OSS) → $$ (Cloud) | $$$ | $ (OSS) → $$ (Cloud) | $$ |

### Quand choisir Honeycomb ?

- **Systemes distribues complexes** avec beaucoup de services
- **Debugging** est votre priorite (pas juste le monitoring)
- **Equipe experimentee** qui veut explorer, pas juste voir des dashboards
- **Budget OK** pour du SaaS (pas d'option self-hosted)
- **Culture d'observabilite** forte

### Quand les metriques classiques suffisent ?

- Application monolithique simple
- Patterns de defaillance previsibles
- Budget restreint
- Equipe debutante en observabilite

---

## 10. Decision framework

```
Votre systeme est-il distribue (microservices) ?
├── Non → Metriques (Prometheus) + Logs (Loki) suffisent
└── Oui → Avez-vous des problemes de debugging en production ?
    ├── Non (problemes simples, dashboards suffisent) → Grafana Stack
    └── Oui (problemes complexes, "unknowns unknowns") →
        Avez-vous le budget pour du SaaS ?
        ├── Non → Grafana Stack + Traces (Tempo) + discipline d'instrumentation
        └── Oui → Honeycomb (ou Datadog si vous voulez tout-en-un)
```

---

## Exercices

Passez au **Lab 25** pour mettre en pratique :
- Modelisation d'evenements haute cardinalite
- Construction de requetes Query Builder
- Simulation de BubbleUp (correlation automatique)
- Calcul de SLOs et error budgets
- Analyse de cardinalite

---

## Ressources

- [Observability Engineering](https://www.oreilly.com/library/view/observability-engineering/9781492076438/) — Charity Majors, Liz Fong-Jones, George Miranda
- [Honeycomb documentation](https://docs.honeycomb.io/)
- [Honeycomb + OpenTelemetry](https://docs.honeycomb.io/getting-data-in/opentelemetry/)
- [Blog Charity Majors](https://charity.wtf/) — Articles fondateurs sur l'observabilite
- [Honeycomb Query Builder](https://docs.honeycomb.io/investigate/query/)
- [BubbleUp](https://docs.honeycomb.io/investigate/bubbleup/)

# Pourquoi l'Observabilité ? Monitoring vs Observability

## Objectifs pedagogiques

- Comprendre l'evolution historique du monitoring vers l'observabilité
- Maîtriser les 3 piliers de l'observabilité (Logs, Metrics, Traces)
- Distinguer monitoring (questions connues) et observabilité (questions inconnues)
- Apprehender le concept de cardinalite et son impact
- Analyser des exemples réels de pannes en production
- Comparer le debugging avec et sans observabilité
- Decouvrir la boucle d'observabilité (Observe → Understand → Act)
- Comprendre l'observabilité business et le lien entre métriques techniques et KPIs
- Évaluer la maturité d'observabilité de votre organisation

---

## Du monitoring a l'observabilité

### L'ere du monitoring traditionnel

Dans les annees 2000-2010, le monitoring se resumait a surveiller des seuils :

- CPU > 80 % → alerte
- Disque > 90 % → alerte
- Service down → alerte

C'etait suffisant quand on avait 5 serveurs monolithiques. On connaissait les questions a poser : "Est-ce que le serveur tourne ? Est-ce qu'il reste de la place disque ?"

### L'explosion de la complexite

Avec les microservices, les conteneurs et le cloud, le paysage a change :

```typescript
// Avant : 1 monolithe
// requete → [App Monolithique] → reponse

// Maintenant : 15+ services
// requete → [API Gateway] → [Auth Service] → [Order Service]
//                                              ↓
//                                          [Payment Service] → [Notification Service]
//                                              ↓
//                                          [Inventory Service]
```

Le monitoring traditionnel ne suffit plus. Quand une requête echoue, quel service est en cause ? Le réseau ? Un timeout ? Une erreur metier ?

### L'observabilité : une nouvelle approche

L'observabilité vient de la théorie du controle : un système est **observable** si vous pouvez déterminer son état interne à partir de ses sorties exterieures.

En ingenierie logicielle, cela signifie instrumenter votre code pour emettre suffisamment de donnees afin de repondre a **n'importe quelle question** sur le comportement du système — y compris des questions que vous n'aviez pas prevues.

---

## Les 3 piliers de l'observabilité

### Pilier 1 : Les Logs

Les logs sont des événements horodates et textuels emis par votre application.

```typescript
// Log non structure (difficile a exploiter)
console.log('Order created for user 42');

// Log structure (exploitable par des machines)
import pino from 'pino';
const logger = pino();

logger.info({
  event: 'order_created',
  userId: 42,
  orderId: 'ord-abc123',
  amount: 99.99,
  currency: 'EUR'
}, 'Order created successfully');
```

**Forces** : contexte riche, detail des événements individuels.
**Faiblesses** : volume enorme, cout de stockage eleve, difficile d'avoir une vue d'ensemble.

#### Logs en profondeur — quand les utiliser

Les logs excellent dans les situations suivantes :

| Situation | Exemple de log | Pourquoi les logs sont le bon outil |
|-----------|---------------|-------------------------------------|
| Debugging d'un cas specifique | `{ event: "payment_failed", userId: 42, error: "card_declined" }` | Besoin du contexte exact de CET événement |
| Audit trail | `{ event: "user_role_changed", by: "admin@corp.com", from: "viewer", to: "editor" }` | Trace immuable de QUI a fait QUOI |
| Erreurs inattendues | `{ level: "error", err: { message: "ECONNREFUSED", stack: "..." } }` | La stack trace est dans le log |
| Flux business complexe | `{ event: "order_state_change", orderId: "xxx", from: "pending", to: "confirmed" }` | Suivre les transitions d'état |

**Pipeline de logs typique** :

```
Application → Pino/Winston → stdout → Fluentd/Filebeat → Elasticsearch/Loki → Kibana/Grafana
```

Le cout des logs est souvent sous-estime. En production, un service Node.js peut generer **1 a 10 Go de logs par jour**. La strategie de retention est critique :

```yaml
# Politique de retention typique
hot_storage: 7 jours    # Elasticsearch rapide, requêtes ad hoc
warm_storage: 30 jours   # Stockage moins cher, requêtes plus lentes
cold_storage: 90 jours   # S3/GCS, pour compliance et audit
```

### Pilier 2 : Les Metriques

Les metriques sont des valeurs numériques agregees dans le temps.

```typescript
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes HTTP',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
});
```

**Forces** : peu couteuses, vision d'ensemble, ideales pour les alertes.
**Faiblesses** : pas de detail individuel, perte d'information par agregation.

#### Metriques en profondeur — les quatre types

| Type | Comportement | Exemple concret | Requete PromQL |
|------|-------------|----------------|----------------|
| **Counter** | Ne fait qu'augmenter | `http_requests_total` | `rate(http_requests_total[5m])` |
| **Gauge** | Monte et descend | `active_connections` | `active_connections` |
| **Histogram** | Distribution en buckets | `http_request_duration_seconds` | `histogram_quantile(0.99, rate(..._bucket[5m]))` |
| **Summary** | Quantiles cote client | `rpc_duration_seconds` | `rpc_duration_seconds{quantile="0.99"}` |

**Quand les metriques sont-elles le bon outil ?**

- **Alerting** : « Le taux d'erreur depasse 1% » — impossible a faire efficacement avec des logs
- **Trending** : « La latence augmente-t-elle au fil des semaines ? » — necessite des donnees agregees
- **Capacity planning** : « Combien de requetes par seconde traitons-nous ? Quelle est la tendance ? »
- **SLO tracking** : « Respectons-nous notre objectif de 99.9% de disponibilite ? »

L'analogie : les metriques sont le **tableau de bord de votre voiture** (vitesse, temperature, niveau d'essence). Elles vous disent instantanement si quelque chose ne va pas. Mais pour comprendre *pourquoi* le moteur surchauffe, il faut ouvrir le capot (les logs et les traces).

### Pilier 3 : Les Traces

Les traces suivent le parcours d'une requête a travers les services.

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function createOrder(userId: string, items: string[]) {
  return tracer.startActiveSpan('createOrder', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('order.items_count', items.length);

    // Chaque appel interne cree un sous-span
    await validateInventory(items);  // span enfant
    await processPayment(userId);    // span enfant
    await sendConfirmation(userId);  // span enfant

    span.end();
  });
}
```

**Forces** : vision du flux complet, identification des goulots d'etranglement.
**Faiblesses** : complexite de mise en place, volume de donnees.

#### Traces en profondeur — anatomie d'une trace

Une trace est composee de **spans** hierarchiques. Chaque span represente une unite de travail :

```
Trace ID: abc-123-def-456
│
├── [API Gateway] POST /api/orders  (120ms)
│   ├── [Auth Service] validateToken  (5ms)
│   ├── [Order Service] createOrder  (110ms)
│   │   ├── [DB] INSERT INTO orders  (15ms)
│   │   ├── [Payment Service] chargeCard  (80ms)
│   │   │   ├── [Stripe API] POST /charges  (75ms)  ← goulot !
│   │   │   └── [DB] UPDATE payments  (3ms)
│   │   └── [Notification Service] sendEmail  (8ms)
│   │       └── [SendGrid API] POST /send  (6ms)
```

Chaque span contient :
- **Nom de l'operation** : `POST /api/orders`, `chargeCard`
- **Timestamps** : debut et fin (pour calculer la duree)
- **Attributs** : `user.id`, `http.status_code`, `db.statement`
- **Statut** : OK ou ERROR
- **Liens** : parent span, trace ID

**Pipeline de traces typique** :

```
Application → OpenTelemetry SDK → OTLP Exporter → Collector → Jaeger/Tempo → Grafana
```

#### Correler les trois piliers

La vraie puissance de l'observabilite vient de la **correlation** entre les trois piliers :

```typescript
// 1. Une metrique detecte le probleme
// Alerte : http_error_rate > 5%

// 2. Les traces identifient le chemin
// Trace ID abc-123 : le span "chargeCard" retourne une erreur

// 3. Les logs donnent le detail
// { traceId: "abc-123", spanId: "def-456", level: "error",
//   message: "Stripe API timeout after 30s", retries: 3 }
```

Le **trace ID** est le lien entre les trois piliers. Incluez-le dans vos logs :

```typescript
import { context, trace } from '@opentelemetry/api';

function getTraceId(): string {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId ?? 'no-trace';
}

// Dans chaque log
logger.info({
  traceId: getTraceId(),
  event: 'order_created',
  orderId: 'ord-abc123'
}, 'Order created');
```

---

## Monitoring vs Observabilité — comparaison detaillee

| Aspect | Monitoring | Observabilité |
|--------|-----------|---------------|
| Questions | Connues a l'avance | Inconnues et emergentes |
| Approche | Tableaux de bord predéfinis | Exploration ad hoc |
| Donnees | Metriques agregees | Logs + Metriques + Traces correles |
| Alertes | Seuils statiques | Conditions dynamiques, SLOs |
| Debug | "Le CPU est haut" | "Pourquoi le CPU est haut" |
| Cout | Relativement faible | Plus eleve (plus de donnees) |
| Mise en place | Rapide (quelques dashboards) | Progressive (instrumentation du code) |
| Adapte a | Monolithes, systemes simples | Microservices, systemes distribues |

L'analogie medicale est eclairante :

- **Monitoring** = prise de temperature reguliere. Si > 38°C, alerte.
- **Observabilité** = avoir acces a l'ensemble des analyses (sang, radio, IRM) pour diagnostiquer un problème que vous n'aviez pas anticipe.

### Le monitoring est un sous-ensemble de l'observabilité

Il ne s'agit pas de choisir l'un ou l'autre. Le monitoring est **inclus** dans l'observabilité :

```
┌─────────────────────────────────────────┐
│            OBSERVABILITÉ                │
│  ┌───────────────────────────────────┐  │
│  │          MONITORING               │  │
│  │  Dashboards, alertes, seuils      │  │
│  └───────────────────────────────────┘  │
│  + Exploration ad hoc                   │
│  + Correlation multi-signaux            │
│  + Debugging de problemes inattendus    │
│  + Questions emergentes                 │
└─────────────────────────────────────────┘
```

Une organisation peut commencer par le monitoring et evoluer progressivement vers l'observabilite complete. C'est d'ailleurs l'approche recommandee.

---

## Observabilité business

### Des metriques techniques aux KPIs business

L'observabilite ne concerne pas uniquement les ingénieurs. Les metriques techniques ont un impact direct sur le business :

| Metrique technique | Impact business | KPI associe |
|-------------------|-----------------|-------------|
| Latence P99 > 2s | Les utilisateurs abandonnent le panier | Taux de conversion |
| Error rate > 1% | Des commandes echouent | Revenu perdu |
| Disponibilite < 99.9% | Les clients perdent confiance | Churn rate |
| Temps de chargement page > 3s | Le SEO est penalise | Trafic organique |
| API timeout rate > 0.5% | Les partenaires B2B deconnectent | Revenu partenaires |

### Metriques business a instrumenter

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

// Metriques orientees business
const ordersCreated = new Counter({
  name: 'business_orders_created_total',
  help: 'Nombre total de commandes creees',
  labelNames: ['payment_method', 'country'],
});

const orderValue = new Histogram({
  name: 'business_order_value_euros',
  help: 'Valeur des commandes en euros',
  buckets: [10, 25, 50, 100, 250, 500, 1000],
});

const cartAbandonments = new Counter({
  name: 'business_cart_abandonments_total',
  help: 'Nombre de paniers abandonnes',
  labelNames: ['step'],  // 'shipping', 'payment', 'confirmation'
});

const activeUsers = new Gauge({
  name: 'business_active_users',
  help: 'Nombre d utilisateurs actifs en ce moment',
});

// Correler technique et business
const checkoutLatency = new Histogram({
  name: 'business_checkout_duration_seconds',
  help: 'Duree du parcours de checkout',
  labelNames: ['outcome'],  // 'success', 'abandoned', 'error'
  buckets: [5, 10, 30, 60, 120, 300],
});
```

### Dashboard business-technique

Un bon dashboard d'observabilite business montre les deux dimensions cote a cote :

```
┌───────────────────────┬───────────────────────┐
│   METRIQUES BUSINESS  │  METRIQUES TECHNIQUES │
├───────────────────────┼───────────────────────┤
│ Commandes/min : 42    │ Requetes/s : 1200     │
│ Revenu/heure : 3.2k€  │ Error rate : 0.1%     │
│ Taux conversion : 3.5%│ Latence P99 : 180ms   │
│ Paniers abandonnes: 12│ CPU usage : 45%       │
└───────────────────────┴───────────────────────┘
```

Quand le taux de conversion chute, on peut immediatement regarder si les metriques techniques expliquent le probleme (latence en hausse ? erreurs en augmentation ?) ou si c'est un probleme metier (changement de prix, bug UI, probleme d'UX).

---

## Modèle de maturite d'observabilité

Toutes les organisations ne sont pas au meme niveau. Le modele de maturite permet d'evaluer où vous en etes et de planifier les prochaines etapes.

### Niveau 0 — Aveugle

| Caracteristique | Description |
|----------------|-------------|
| **Logs** | `console.log` sans structure |
| **Metriques** | Aucune (ou uniquement celles du cloud provider) |
| **Traces** | Aucune |
| **Alertes** | Les utilisateurs signalent les problemes |
| **MTTD** | Heures, voire jours |
| **Debugging** | SSH sur le serveur, `grep` dans les fichiers de log |

C'est le point de depart de beaucoup de startups. Le système fonctionne "tant que ça fonctionne". Quand ça casse, c'est la panique.

### Niveau 1 — Reactif

| Caracteristique | Description |
|----------------|-------------|
| **Logs** | Centralises (ELK, CloudWatch) mais peu structures |
| **Metriques** | Metriques systeme basiques (CPU, RAM, disque) |
| **Traces** | Aucune |
| **Alertes** | Seuils statiques (CPU > 80%, disque > 90%) |
| **MTTD** | 15-30 minutes |
| **Debugging** | Recherche dans les logs centralises |

On detecte les problemes, mais souvent trop tard et avec difficulte pour comprendre la cause racine.

### Niveau 2 — Proactif

| Caracteristique | Description |
|----------------|-------------|
| **Logs** | Structures (JSON), avec correlation ID |
| **Metriques** | Metriques applicatives (RED/USE), dashboards Grafana |
| **Traces** | Basiques (quelques services instrumentes) |
| **Alertes** | Basees sur les SLOs, alertes sur les symptomes |
| **MTTD** | < 5 minutes |
| **Debugging** | Dashboards + logs correles |

L'equipe peut repondre aux questions connues rapidement. Les dashboards sont la premiere etape de diagnostic.

### Niveau 3 — Avance

| Caracteristique | Description |
|----------------|-------------|
| **Logs** | Structures, enrichis, relies aux traces |
| **Metriques** | RED/USE + metriques business, recording rules |
| **Traces** | Tous les services instrumentes, sampling intelligent |
| **Alertes** | Error budget burn rate, alertes multi-signaux |
| **MTTD** | < 2 minutes |
| **Debugging** | Exploration ad hoc, correlation automatique des 3 piliers |

L'equipe peut repondre a des questions imprevues. Le debugging est rapide et methodique.

### Niveau 4 — Expert (Observability-Driven Development)

| Caracteristique | Description |
|----------------|-------------|
| **Logs** | Contexte business riche, trace ID partout |
| **Metriques** | Metriques business en temps reel, predictions |
| **Traces** | Sampling adaptatif, profiling continu |
| **Alertes** | Anomaly detection, auto-remediation |
| **MTTD** | < 1 minute (souvent avant l'impact utilisateur) |
| **Debugging** | AIOps, correlation automatique, suggestions de root cause |

L'observabilite fait partie du design de chaque feature. On ne deploie pas de code sans instrumentation. Les metriques business sont aussi naturelles que les tests unitaires.

### Comment progresser ?

```
Niveau 0 → 1 : Centraliser les logs, ajouter des alertes basiques
                Effort : 1-2 semaines

Niveau 1 → 2 : Structurer les logs, ajouter prom-client, créer des dashboards
                Effort : 1-2 sprints

Niveau 2 → 3 : Instrumenter avec OpenTelemetry, SLOs, correlation des 3 piliers
                Effort : 1-2 trimestres

Niveau 3 → 4 : Observabilite business, sampling adaptatif, culture observability-first
                Effort : 6-12 mois de maturite culturelle
```

---

## Le cout de la mauvaise observabilité

### Impact sur le MTTR

Le MTTR (Mean Time To Resolve) est directement correle au niveau d'observabilite :

| Niveau d'observabilite | MTTR typique (SEV-1) | Cout d'un incident de 1h |
|----------------------|---------------------|-------------------------|
| Niveau 0 (aveugle) | 4-8h | Perte de revenu + reputation + heures ingenieur |
| Niveau 1 (reactif) | 1-4h | Significatif mais contenu |
| Niveau 2 (proactif) | 30min-1h | Modere |
| Niveau 3 (avance) | 10-30min | Faible |
| Niveau 4 (expert) | < 10min | Minimal (souvent auto-remedie) |

### Exemples reels d'incidents

**Incident #1 — Panne Amazon S3 (2017)**
Amazon S3 a ete indisponible pendant 4 heures, impactant des milliers de sites web et services. La cause : une commande de maintenance mal saisie qui a retire trop de serveurs. L'observabilite insuffisante du processus de maintenance a empeche une detection rapide. Cout estime : des centaines de millions de dollars pour l'ecosysteme.

**Incident #2 — GitLab perte de donnees (2017)**
GitLab a perdu 6 heures de donnees de production suite a une erreur de manipulation de base de donnees. Cinq mecanismes de backup etaient en place, mais aucun ne fonctionnait correctement. L'absence de monitoring sur les backups (observabilite du systeme de recovery) a permis a la situation de se degrader silencieusement pendant des mois.

**Incident #3 — Cloudflare panne mondiale (2019)**
Un deploiement de regle WAF a cause une panne mondiale de 27 minutes. Le CPU de tous les serveurs edge est monte a 100%. La detection automatique a permis un rollback rapide, mais les 27 minutes ont impacte des millions de sites. L'observabilite des deploiements progressifs (canary) aurait pu limiter l'impact.

### Le cout cache : la dette d'observabilité

Comme la dette technique, la dette d'observabilite s'accumule silencieusement :

- **Services non instrumentes** : quand ils cassent, le debugging prend des heures
- **Alertes manquantes** : les problemes ne sont detectes que par les utilisateurs
- **Logs non structures** : chaque investigation necessite du `grep` artisanal
- **Pas de correlation** : impossible de suivre une requete entre les services

Chaque sprint sans investissement en observabilite augmente le risque qu'un incident futur soit beaucoup plus couteux a resoudre.

---

## Le concept de cardinalite

La **cardinalite** est le nombre de combinaisons uniques de valeurs pour un ensemble de labels.

```typescript
// Cardinalite faible (OK) : ~50 combinaisons
const httpRequests = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'status_code']
  // method: GET, POST, PUT, DELETE (4)
  // route: /health, /api/orders, /api/users (5)
  // status_code: 200, 201, 400, 404, 500 (5)
  // 4 x 5 x 5 = 100 series maximum
});

// Cardinalite explosive (DANGER) : millions de combinaisons
const badMetric = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'user_id']
  // user_id: potentiellement des millions de valeurs !
  // Cela fera exploser votre base Prometheus
});
```

::: warning Attention
Une cardinalite trop elevee est l'erreur numéro 1 des débutants en metriques. Chaque combinaison de labels créé une **serie temporelle** distincte. 1 million de series = problème de performance garanti.
:::

---

## Exemples de pannes reelles

### Panne 1 : Le "mardi lent"

Une équipe constate que chaque mardi, l'application ralentit entre 14h et 15h. Sans observabilité, il faut des semaines pour comprendre. Avec des metriques et des traces, on découvre qu'un cron de synchronisation tourne chaque mardi et sature le pool de connexions à la base de donnees.

### Panne 2 : Le memory leak silencieux

Un service Node.js consomme de plus en plus de mémoire jusqu'a crasher toutes les 48h. Le monitoring basique ne voit que le restart. Avec des metriques de heap et un profiling, on identifie un listener d'événements jamais nettoye.

### Panne 3 : La latence en cascade

Un service Payment met 5 secondes a repondre au lieu de 200ms. Sans traces distribuees, impossible de savoir si c'est le service lui-même, la base de donnees, ou un service tiers. Avec une trace, on voit immediatement quel span est le goulot d'etranglement.

---

## Debugging : avec vs sans observabilité

```typescript
// SANS observabilite — le processus de debugging
// 1. Un utilisateur signale : "Ca ne marche pas"
// 2. Vous regardez les logs : des milliers de lignes non structurees
// 3. Vous cherchez manuellement : grep "error" | tail -100
// 4. Vous trouvez un message cryptique : "Connection refused"
// 5. Vous ne savez pas quel service, quel moment, quel utilisateur
// 6. Temps de resolution : heures, voire jours

// AVEC observabilite — le processus de debugging
// 1. Une alerte SLO se declenche : "99e percentile de latence > 2s"
// 2. Dashboard Grafana : le service Order est lent depuis 14h02
// 3. Traces Jaeger : le span "database.query" prend 1.8s
// 4. Logs correles (meme traceId) : "Connection pool exhausted"
// 5. Metriques : db_connections_active = db_connections_max
// 6. Temps de resolution : minutes
```

---

## La boucle d'observabilité

L'observabilité n'est pas un produit qu'on installe — c'est un **processus continu** :

1. **Instrumenter** : ajouter des logs, metriques et traces dans le code
2. **Collecter** : acheminer les donnees vers des backends (Prometheus, Jaeger, Loki)
3. **Visualiser** : créer des dashboards et des vues exploratoires
4. **Alerter** : définir des SLOs et des conditions d'alerte
5. **Investiguer** : utiliser les donnees pour diagnostiquer les problèmes
6. **Ameliorer** : corriger le problème ET enrichir l'instrumentation

Puis le cycle recommence. Chaque incident revele des trous dans l'instrumentation que vous corrigez pour le prochain.

::: tip A retenir
Le monitoring repond à la question "Est-ce que ça marche ?". L'observabilité repond a "Pourquoi est-ce que ça ne marche pas ?" — même pour des problèmes que vous n'aviez jamais envisages. Les 3 piliers (Logs, Metriques, Traces) sont complementaires : aucun ne suffit seul.
:::

---

## Bonnes pratiques

- **Commencez par les metriques** : elles sont les moins couteuses et donnent une vue d'ensemble
- **Ajoutez des logs structures** : ils fournissent le contexte détaillé
- **Introduisez les traces** quand vous avez plusieurs services
- **Correlez les 3 piliers** : un `traceId` present dans les logs, les metriques et les traces
- **Instrumentez au fil de l'eau** : n'attendez pas un incident pour ajouter de l'observabilité
- **Mefiez-vous de la cardinalite** : chaque label est un multiplicateur
- **Pensez business** : les metriques techniques doivent se traduire en impact business
- **Evaluez votre maturite** : utilisez le modele de maturite pour planifier votre progression
- **Investissez regulierement** : traiter la dette d'observabilite comme la dette technique

---

## Checklist d'observabilite pour un nouveau service

Quand vous lancez un nouveau microservice, utilisez cette checklist pour vous assurer qu'il est observable dès le premier jour :

```markdown
## Instrumentation
□ Metriques RED exposees (Rate, Errors, Duration)
□ collectDefaultMetrics() active (Node.js)
□ Histogramme de latence avec buckets adaptes aux SLOs
□ Metriques business specifiques au service

## Logs
□ Logging structure (JSON) avec pino ou winston
□ Niveaux de log correctement utilises (error, warn, info, debug)
□ Trace ID inclus dans chaque ligne de log
□ Pas de donnees sensibles dans les logs (PII, tokens, mots de passe)

## Traces
□ OpenTelemetry SDK configure
□ Spans sur les operations principales (HTTP, DB, services externes)
□ Attributs pertinents sur les spans (user.id, order.id, etc.)
□ Propagation de contexte entre services

## Alertes
□ Alerte sur le taux d'erreur (> seuil SLO)
□ Alerte sur la latence P99 (> seuil SLO)
□ Alerte sur la disponibilite (up == 0)
□ Runbook associe a chaque alerte

## Dashboard
□ Dashboard Grafana avec les metriques RED
□ Lien vers les logs depuis le dashboard
□ Lien vers les traces depuis le dashboard
```

Cette checklist peut etre integree dans votre processus de review (Definition of Done) pour garantir que chaque nouveau service est observable avant d'arriver en production.

---

## Prochaines étapes

- [Lab 01 — Comparer debugging avec et sans observabilité](/labs/lab-01-console-log-vs-structured/README)
- [Quiz 01 — Monitoring vs Observabilité](/quizzes/quiz-01-pourquoi-observabilite)
- [Module suivant — Logging structure](/modules/02-logging-structure)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 01 pourquoi observabilité](../screencasts/screencast-01-pourquoi-observabilite.md)
2. **Lab** : [lab-01-console-log-vs-structured](../labs/lab-01-console-log-vs-structured/README)
3. **Visualisation** : [Three Pillars](../visualizations/three-pillars.html)
4. **Quiz** : [quiz 01 pourquoi observabilité](../quizzes/quiz-01-pourquoi-observabilite.html)
:::

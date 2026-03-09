# Pourquoi l'Observabilite ? Monitoring vs Observability

## Objectifs pedagogiques

- Comprendre l'evolution historique du monitoring vers l'observabilite
- Maitriser les 3 piliers de l'observabilite (Logs, Metrics, Traces)
- Distinguer monitoring (questions connues) et observabilite (questions inconnues)
- Apprehender le concept de cardinalite et son impact
- Analyser des exemples reels de pannes en production
- Comparer le debugging avec et sans observabilite
- Decouvrir la boucle d'observabilite (Observe → Understand → Act)

---

## Du monitoring a l'observabilite

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

Le monitoring traditionnel ne suffit plus. Quand une requete echoue, quel service est en cause ? Le reseau ? Un timeout ? Une erreur metier ?

### L'observabilite : une nouvelle approche

L'observabilite vient de la theorie du controle : un systeme est **observable** si vous pouvez determiner son etat interne a partir de ses sorties exterieures.

En ingenierie logicielle, cela signifie instrumenter votre code pour emettre suffisamment de donnees afin de repondre a **n'importe quelle question** sur le comportement du systeme — y compris des questions que vous n'aviez pas prevues.

---

## Les 3 piliers de l'observabilite

### Pilier 1 : Les Logs

Les logs sont des evenements horodates et textuels emis par votre application.

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

**Forces** : contexte riche, detail des evenements individuels.
**Faiblesses** : volume enorme, cout de stockage eleve, difficile d'avoir une vue d'ensemble.

### Pilier 2 : Les Metriques

Les metriques sont des valeurs numeriques agregees dans le temps.

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

### Pilier 3 : Les Traces

Les traces suivent le parcours d'une requete a travers les services.

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

---

## Monitoring vs Observabilite

| Aspect | Monitoring | Observabilite |
|--------|-----------|---------------|
| Questions | Connues a l'avance | Inconnues et emergentes |
| Approche | Tableaux de bord predéfinis | Exploration ad hoc |
| Donnees | Metriques agregees | Logs + Metriques + Traces correles |
| Alertes | Seuils statiques | Conditions dynamiques, SLOs |
| Debug | "Le CPU est haut" | "Pourquoi le CPU est haut" |

L'analogie medicale est eclairante :

- **Monitoring** = prise de temperature reguliere. Si > 38°C, alerte.
- **Observabilite** = avoir acces a l'ensemble des analyses (sang, radio, IRM) pour diagnostiquer un probleme que vous n'aviez pas anticipe.

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
Une cardinalite trop elevee est l'erreur numero 1 des debutants en metriques. Chaque combinaison de labels cree une **serie temporelle** distincte. 1 million de series = probleme de performance garanti.
:::

---

## Exemples de pannes reelles

### Panne 1 : Le "mardi lent"

Une equipe constate que chaque mardi, l'application ralentit entre 14h et 15h. Sans observabilite, il faut des semaines pour comprendre. Avec des metriques et des traces, on decouvre qu'un cron de synchronisation tourne chaque mardi et sature le pool de connexions a la base de donnees.

### Panne 2 : Le memory leak silencieux

Un service Node.js consomme de plus en plus de memoire jusqu'a crasher toutes les 48h. Le monitoring basique ne voit que le restart. Avec des metriques de heap et un profiling, on identifie un listener d'evenements jamais nettoye.

### Panne 3 : La latence en cascade

Un service Payment met 5 secondes a repondre au lieu de 200ms. Sans traces distribuees, impossible de savoir si c'est le service lui-meme, la base de donnees, ou un service tiers. Avec une trace, on voit immediatement quel span est le goulot d'etranglement.

---

## Debugging : avec vs sans observabilite

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

## La boucle d'observabilite

L'observabilite n'est pas un produit qu'on installe — c'est un **processus continu** :

1. **Instrumenter** : ajouter des logs, metriques et traces dans le code
2. **Collecter** : acheminer les donnees vers des backends (Prometheus, Jaeger, Loki)
3. **Visualiser** : creer des dashboards et des vues exploratoires
4. **Alerter** : definir des SLOs et des conditions d'alerte
5. **Investiguer** : utiliser les donnees pour diagnostiquer les problemes
6. **Ameliorer** : corriger le probleme ET enrichir l'instrumentation

Puis le cycle recommence. Chaque incident revele des trous dans l'instrumentation que vous corrigez pour le prochain.

::: tip A retenir
Le monitoring repond a la question "Est-ce que ca marche ?". L'observabilite repond a "Pourquoi est-ce que ca ne marche pas ?" — meme pour des problemes que vous n'aviez jamais envisages. Les 3 piliers (Logs, Metriques, Traces) sont complementaires : aucun ne suffit seul.
:::

---

## Bonnes pratiques

- **Commencez par les metriques** : elles sont les moins couteuses et donnent une vue d'ensemble
- **Ajoutez des logs structures** : ils fournissent le contexte detaille
- **Introduisez les traces** quand vous avez plusieurs services
- **Correlez les 3 piliers** : un `traceId` present dans les logs, les metriques et les traces
- **Instrumentez au fil de l'eau** : n'attendez pas un incident pour ajouter de l'observabilite
- **Mefiez-vous de la cardinalite** : chaque label est un multiplicateur

---

## Prochaines etapes

- [Lab 01 — Comparer debugging avec et sans observabilite](/labs/lab-01-console-log-vs-structured/README)
- [Quiz 01 — Monitoring vs Observabilite](/quizzes/quiz-01-pourquoi-observabilite)
- [Module suivant — Logging structure](/modules/02-logging-structure)

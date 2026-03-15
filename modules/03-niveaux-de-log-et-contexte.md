# Niveaux de log, contexte et correlation

## Objectifs pedagogiques

- Maîtriser chaque niveau de log et savoir quand l'utiliser
- Comprendre le concept de Correlation ID et son importance
- Implementer un `requestId` avec `AsyncLocalStorage`
- Decouvrir le W3C Trace Context et sa relation avec les logs
- Appliquer le logging contextuel (orderId, tenantId, userId)
- Savoir ce qu'il faut logger — et ce qu'il ne faut surtout pas logger
- Comprendre les stratégies de log sampling
- Construire un middleware Express complet pour la correlation

---

## Les niveaux de log en profondeur

Chaque niveau à un role précis. Utiliser le mauvais niveau est aussi grave que de ne pas logger du tout : trop de bruit tue le signal.

### trace (10) — Le microscope

```typescript
// TRACE : details ultra-fins, active uniquement pour du debugging cible
// En production, ce niveau est presque toujours desactive

logger.trace({
  buffer: rawBytes.length,
  offset: currentOffset
}, 'Reading next chunk from stream');

logger.trace({
  query: 'SELECT * FROM orders WHERE id = $1',
  params: ['ord-123']
}, 'Executing SQL query');
```

**Quand l'utiliser** : Debugging d'un algorithme précis, investigation d'un problème très spécifique.
**En production** : Desactive par defaut. Active temporairement via `LOG_LEVEL=trace` sur un pod spécifique.

### debug (20) — Le mode développeur

```typescript
// DEBUG : informations utiles pendant le developpement
// Active en dev, desactive en prod (sauf investigation)

logger.debug({
  cacheKey: 'user:42',
  hit: true,
  ttl: 300
}, 'Cache lookup result');

logger.debug({
  retryCount: 2,
  maxRetries: 3,
  backoff: 1000
}, 'Retrying failed request');
```

**Quand l'utiliser** : Flow d'exécution, états intermédiaires, résultats de cache.
**En production** : Desactive par defaut. Utile pour diagnostiquer un problème complexe.

### info (30) — Le journal de bord

```typescript
// INFO : evenements significatifs du cycle de vie normal
// C'est le niveau par defaut en production

logger.info({ port: 3000 }, 'Server started');
logger.info({ orderId: 'ord-123', userId: 42 }, 'Order created');
logger.info({ jobName: 'cleanup', duration: 1234 }, 'Scheduled job completed');
logger.info({ version: '2.1.0' }, 'Application deployed');
```

**Quand l'utiliser** : Démarrage/arret du service, événements metier importants, fins de jobs.
**En production** : Toujours active. C'est votre source principale d'information.

### warn (40) — Le signal d'alerte

```typescript
// WARN : quelque chose d'anormal s'est produit mais le systeme continue
// Ne necessitent pas une intervention immediate mais doivent etre surveilles

logger.warn({
  poolSize: 10,
  activeConnections: 9
}, 'Database connection pool nearly exhausted');

logger.warn({
  endpoint: '/api/legacy',
  deprecatedSince: '2024-01-01'
}, 'Deprecated endpoint called');

logger.warn({
  responseTime: 4500,
  threshold: 3000
}, 'Slow external API response');
```

**Quand l'utiliser** : Degradation de performance, approche d'une limite, usage d'API deprecated, fallbacks actives.
**En production** : Toujours active. Surveillez la tendance — une augmentation des warnings precede souvent une panne.

### error (50) — Le problème réel

```typescript
// ERROR : une operation a echoue et necessite une attention
// Le systeme continue mais quelque chose ne va pas

logger.error({
  err: new Error('Connection refused'),
  host: 'db-primary.internal',
  port: 5432
}, 'Database connection failed');

logger.error({
  orderId: 'ord-123',
  paymentProvider: 'stripe',
  err: new Error('Card declined')
}, 'Payment processing failed');
```

**Quand l'utiliser** : Exceptions attrapees, echecs d'operations, erreurs de services externes.
**En production** : Toujours active. Chaque error devrait idealement declencher une investigation.

### fatal (60) — L'urgence absolue

```typescript
// FATAL : le processus va s'arreter ou est dans un etat irrecuperable
// Utilisez-le juste avant un process.exit() ou un crash

logger.fatal({
  err: new Error('Cannot connect to required services'),
  services: ['database', 'cache']
}, 'Startup failed — shutting down');

logger.fatal({
  heapUsed: process.memoryUsage().heapUsed,
  heapTotal: process.memoryUsage().heapTotal
}, 'Out of memory — process will exit');
```

**Quand l'utiliser** : Echec de démarrage, corruption de donnees irreparable, impossibilite de continuer.
**En production** : Doit toujours declencher une alerte immediate.

---

## Correlation IDs — le fil d'Ariane

### Le problème

Imaginez 100 requêtes simultanees generant chacune 10 logs. Vous avez 1 000 lignes melangees dans votre terminal. Comment savoir quels logs appartiennent à la même requête ?

```typescript
// Sans correlation ID — un melange indechiffrable
// {"msg":"Order validation started"}
// {"msg":"User authenticated"}
// {"msg":"Inventory checked"}
// {"msg":"Order validation started"}   ← une autre requete !
// {"msg":"Payment initiated"}
// {"msg":"User authenticated"}          ← mais pour quelle requete ?
```

### La solution : un identifiant unique par requête

```typescript
import { randomUUID } from 'crypto';

// Chaque requete recoit un requestId unique
// {"requestId":"a1b2c3","msg":"Order validation started"}
// {"requestId":"d4e5f6","msg":"User authenticated"}
// {"requestId":"a1b2c3","msg":"Inventory checked"}
// {"requestId":"d4e5f6","msg":"Order validation started"}
// {"requestId":"a1b2c3","msg":"Payment initiated"}

// Filtrer par requestId="a1b2c3" donne le parcours complet de la requete
```

---

## AsyncLocalStorage — le contexte sans prop drilling

Node.js offre `AsyncLocalStorage` pour propager un contexte a travers toute la chaine asynchrone sans le passer explicitement en paramètre.

```typescript
// src/context.ts
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  startTime: number;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// Recuperer le contexte courant depuis n'importe ou dans le code
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}
```

### Middleware Express pour injecter le contexte

```typescript
// src/middleware/correlation.ts
import { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { asyncLocalStorage } from '../context';
import logger from '../logger';

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Recuperer un requestId existant (venant d'un service amont) ou en generer un
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Le propager dans la reponse pour le tracing cote client
  res.setHeader('x-request-id', requestId);

  const context = {
    requestId,
    userId: req.headers['x-user-id'] as string | undefined,
    tenantId: req.headers['x-tenant-id'] as string | undefined,
    startTime: Date.now(),
  };

  // Executer toute la chaine dans ce contexte
  asyncLocalStorage.run(context, () => {
    // Creer un child logger avec le requestId
    const reqLogger = logger.child({ requestId });
    reqLogger.info({ method: req.method, url: req.url }, 'Request started');

    // Intercepter la fin de la requete
    res.on('finish', () => {
      const duration = Date.now() - context.startTime;
      reqLogger.info({
        statusCode: res.statusCode,
        duration
      }, 'Request completed');
    });

    next();
  });
}
```

### Utilisation dans le code metier

```typescript
// src/services/order.service.ts
import logger from '../logger';
import { getRequestContext } from '../context';

export async function createOrder(data: OrderInput): Promise<Order> {
  const ctx = getRequestContext();
  const log = logger.child({
    requestId: ctx?.requestId,
    service: 'order'
  });

  log.info({ items: data.items.length }, 'Creating order');

  // Valider le stock
  log.debug('Checking inventory');
  await checkInventory(data.items);

  // Traiter le paiement
  log.debug({ amount: data.totalAmount }, 'Processing payment');
  await processPayment(data);

  log.info({ orderId: order.id }, 'Order created successfully');
  return order;
}
// Tous ces logs portent le meme requestId — correlation automatique !
```

---

## W3C Trace Context

Le W3C Trace Context est un standard HTTP pour propager les identifiants de trace entre services. Il utilise le header `traceparent` :

```typescript
// Format du header traceparent
// traceparent: 00-<trace-id>-<parent-span-id>-<trace-flags>
// Exemple : 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

// Dans votre middleware, vous pouvez extraire le traceId
function extractTraceId(req: Request): string | undefined {
  const traceparent = req.headers['traceparent'] as string;
  if (!traceparent) return undefined;

  const parts = traceparent.split('-');
  if (parts.length === 4) {
    return parts[1]; // Le trace-id (32 caracteres hex)
  }
  return undefined;
}

// Puis l'injecter dans vos logs
const traceId = extractTraceId(req);
const reqLogger = logger.child({
  requestId,
  traceId  // Permet de correler logs et traces OpenTelemetry
});
```

::: tip A retenir
Le `traceId` est la clé de correlation universelle. En l'incluant dans vos logs, vous pouvez passer d'un log dans Grafana Loki à la trace correspondante dans Jaeger en un clic.
:::

---

## Logging contextuel avance

Au-dela du requestId, enrichissez vos logs avec du contexte metier :

```typescript
// Contexte multi-niveaux
const baseLogger = logger.child({ service: 'order-api', version: '2.1.0' });
const requestLogger = baseLogger.child({ requestId, userId, tenantId });
const orderLogger = requestLogger.child({ orderId: 'ord-123' });

// Chaque log porte tout le contexte hierarchique
orderLogger.info({ status: 'confirmed' }, 'Order status updated');
// Sortie :
// {
//   "service": "order-api",
//   "version": "2.1.0",
//   "requestId": "abc-123",
//   "userId": "user-42",
//   "tenantId": "tenant-acme",
//   "orderId": "ord-123",
//   "status": "confirmed",
//   "msg": "Order status updated"
// }
```

---

## Ce qu'il faut logger — et ce qu'il faut éviter

### A logger

```typescript
// Evenements metier significatifs
logger.info({ orderId, amount, currency }, 'Order placed');
logger.info({ userId, action: 'login' }, 'User authenticated');

// Erreurs avec contexte complet
logger.error({ err, orderId, step: 'payment' }, 'Order processing failed');

// Decisions du systeme
logger.info({ reason: 'rate_limit', clientId }, 'Request rejected');
logger.warn({ fallback: 'cache', reason: 'db_timeout' }, 'Using fallback');
```

### A ne PAS logger

```typescript
// JAMAIS de donnees sensibles
logger.info({ password: user.password }); // INTERDIT
logger.info({ token: jwt });              // INTERDIT
logger.info({ creditCard: '4111...' });   // INTERDIT

// JAMAIS de donnees volumineuses
logger.debug({ body: entireRequestBody }); // Risque de PII + volume

// JAMAIS dans une boucle serree
for (const item of thousandItems) {
  logger.debug({ item }, 'Processing item'); // 1000 logs = bruit
}
// Preferez :
logger.info({ count: thousandItems.length }, 'Processing batch started');
```

::: warning Attention
Un log qui contient un mot de passe ou un token est une faille de sécurité, même s'il est "juste dans les logs". Les logs sont souvent accessibles a de nombreuses personnes et stockes longtemps. Utilisez les redactors de Pino comme filet de sécurité.
:::

---

## Stratégies de log sampling

En haute charge, logger chaque requête peut etre trop couteux. Le sampling permet de n'enregistrer qu'un echantillon :

```typescript
// Sampling simple : 1 log sur 100
let requestCount = 0;

function shouldLog(): boolean {
  requestCount++;
  return requestCount % 100 === 0;
}

// Sampling intelligent : toujours logger les erreurs et les requetes lentes
function shouldLogRequest(statusCode: number, duration: number): boolean {
  // Toujours logger les erreurs
  if (statusCode >= 400) return true;

  // Toujours logger les requetes lentes (> 1s)
  if (duration > 1000) return true;

  // Sinon, 10% des requetes normales
  return Math.random() < 0.1;
}
```

---

## Logging structure des erreurs

Les erreurs meritent un traitement special pour conserver le maximum d'information diagnostique :

```typescript
// Pattern recommande pour les erreurs
try {
  await processOrder(orderId);
} catch (error) {
  // Toujours passer l'erreur dans le champ 'err' (le serializer la traite)
  logger.error({
    err: error,
    orderId,
    step: 'payment_processing',
    attempt: retryCount,
    // Contexte supplementaire pour le debugging
    paymentProvider: 'stripe',
    amount: order.totalAmount,
  }, 'Order payment failed');

  // Remonter l'erreur ou la gerer
  throw error;
}
```

---

## Middleware Express complet

Voici le middleware de correlation complet que nous utiliserons dans la demo-app :

```typescript
// src/middleware/request-logger.ts
import { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { asyncLocalStorage, type RequestContext } from '../context';
import logger from '../logger';

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  const traceId = extractTraceId(req);

  res.setHeader('x-request-id', requestId);

  const context: RequestContext = {
    requestId,
    traceId,
    userId: req.headers['x-user-id'] as string | undefined,
    tenantId: req.headers['x-tenant-id'] as string | undefined,
    startTime: Date.now(),
  };

  asyncLocalStorage.run(context, () => {
    const reqLogger = logger.child({
      requestId,
      traceId,
      method: req.method,
      url: req.url
    });

    reqLogger.info('Incoming request');

    res.on('finish', () => {
      const duration = Date.now() - context.startTime;
      const level = res.statusCode >= 500 ? 'error'
                  : res.statusCode >= 400 ? 'warn'
                  : 'info';

      reqLogger[level]({
        statusCode: res.statusCode,
        duration,
        contentLength: res.getHeader('content-length'),
      }, 'Request completed');
    });

    next();
  });
}

function extractTraceId(req: Request): string | undefined {
  const traceparent = req.headers['traceparent'] as string;
  if (!traceparent) return undefined;
  const parts = traceparent.split('-');
  return parts.length === 4 ? parts[1] : undefined;
}
```

---

## Bonnes pratiques

- **Un seul requestId par requête** — généré a l'entree du système, propage a tous les services
- **Niveau info par defaut en production** — debug et trace uniquement pour les investigations
- **Contexte metier dans les logs** — orderId, userId, tenantId rendent le filtrage puissant
- **Ne jamais logger de PII** sans redaction — emails, numéros de telephone, tokens
- **Logger les entrees et sorties** des operations importantes (debut/fin de requête, debut/fin de job)
- **Utiliser le champ `err`** pour les erreurs — le serializer standard de Pino les formate correctement
- **Logger la duree des operations** — c'est une metrique gratuite dans vos logs

::: tip A retenir
Le Correlation ID est le concept le plus important de ce module. Sans lui, vos logs sont un tas de feuilles mortes melanges par le vent. Avec lui, chaque feuille porte un numéro et vous pouvez reconstituer l'arbre entier.
:::

---

## Aller plus loin : concepts expert

### Log sampling : quand vous loggez trop

A grande echelle (10 000+ requêtes/seconde), logger chaque requête en `info` peut couter cher en stockage et en bande passante. Le log sampling permet de n'emettre qu'un echantillon des logs tout en gardant une vue representative :

```typescript
import pino from 'pino';

// Sampling : ne logger que 10% des requetes normales
// mais garder 100% des erreurs
let requestCount = 0;

function shouldSample(level: string): boolean {
  if (level === 'error' || level === 'fatal') return true; // toujours
  if (level === 'warn') return true; // toujours
  requestCount++;
  return requestCount % 10 === 0; // 10% des info/debug
}

// En pratique, OpenTelemetry offre le "log bridge" qui
// synchronise le sampling des logs avec le sampling des traces :
// si une trace est echantillonnee, ses logs le sont aussi.
```

::: warning Anti-pattern : log-and-forget
Logger sans jamais relire ses logs est un gaspillage. Chaque champ que vous ajoutez à un log devrait repondre à un besoin de filtrage ou d'investigation concret. Posez-vous la question : "Est-ce que je vais chercher ce champ un jour ?" Si non, ne le loggez pas.
:::

### Structured error logging : capturer le contexte d'une erreur

Les erreurs en production sont les logs les plus precieux. Un log d'erreur expert capture tout le contexte nécessaire pour reproduire le problème :

```typescript
try {
  await processOrder(order);
} catch (error) {
  logger.error({
    err: error,                      // stack trace via serializer
    orderId: order.id,               // contexte metier
    userId: order.userId,            // qui est affecte
    input: {                         // donnees d'entree (sans PII)
      productId: order.productId,
      quantity: order.quantity,
    },
    downstream: {                    // etat des dependances
      paymentService: 'timeout',
      inventoryService: 'ok',
    },
    requestId: getRequestId(),       // correlation
    attempt: retryCount,             // combien de retries
  }, 'Order processing failed');
}
```

Ce log unique contient tout ce qu'un ingenieur d'astreinte a besoin pour comprendre le problème sans devoir reproduire le bug.

### Le concept de "Observability Tax"

Chaque log, metrique et trace à un cout : CPU, mémoire, réseau, stockage. Le Google SRE Workbook (Chapitre 5) recommande de traiter l'observabilité comme un budget :

- **Mesurez le cout** de votre telemetrie (Go/jour, $/mois)
- **Fixez un budget** par service (ex: max 5% du CPU pour le logging)
- **Optimisez** : sampling, filtrage, compression, retention reduite pour les donnees peu utiles
- **Renegociez** quand le budget est dépasse

::: tip Référence SRE
Le Google SRE Workbook, Chapitre 5 ("Alerting on SLOs"), et le Chapitre 6 ("Eliminating Toil") abordent en detail le cout de l'observabilité et comment l'optimiser. Un système sur-instrumente est aussi problematique qu'un système sous-instrumente.
:::

---

## Prochaines étapes

- [Lab 03 — Implementer la correlation dans la demo-app](/labs/lab-03-correlation-context/README)
- [Quiz 03 — Niveaux de log et contexte](/quizzes/quiz-03-niveaux-de-log-et-contexte)
- [Module suivant — Introduction aux metriques](/modules/04-introduction-metriques)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 03 niveaux de log et contexte](../screencasts/screencast-03-niveaux-de-log-et-contexte.md)
2. **Lab** : [lab-03-correlation-context](../labs/lab-03-correlation-context/README)
3. **Quiz** : [quiz 03 niveaux de log et contexte](../quizzes/quiz-03-niveaux-de-log-et-contexte.html)
:::

# Screencast 03 — Niveaux de log, contexte et correlation

## Informations
- **Duree estimee** : 15-18 min
- **Module** : `modules/03-niveaux-de-log-et-contexte.md`
- **Lab associe** : Lab 03
- **Prerequis** : Screencast 02

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] demo-app prete a etre lancee
- [ ] Fichier `demo-app/src/lib/context.ts` ouvert
- [ ] Fichier `demo-app/src/middleware/request-id.ts` ouvert
- [ ] Fichier `demo-app/src/middleware/request-logger.ts` ouvert

## Script

### [00:00-01:30] Introduction

> Nous avons maintenant un logger structure avec Pino. Mais il manque encore un element crucial : la correlation. Quand 100 requetes arrivent en meme temps, comment savoir quels logs appartiennent a la meme requete ? Aujourd'hui, nous allons implementer des Correlation IDs avec AsyncLocalStorage et maitriser les child loggers.

### [01:30-04:00] Le probleme de la correlation

> Imaginons 100 requetes simultanees, chacune generant 10 logs. On a 1000 lignes melangees.

**Action** : Montrer un exemple de logs melanges sans correlation.

```typescript
// Sans correlation ID — un melange indechiffrable
// {"msg":"Order validation started"}
// {"msg":"User authenticated"}
// {"msg":"Inventory checked"}
// {"msg":"Order validation started"}     ← une AUTRE requete !
// {"msg":"Payment initiated"}
// {"msg":"User authenticated"}           ← mais pour QUELLE requete ?
```

> Impossible de reconstituer le parcours d'une requete. La solution ? Un identifiant unique par requete.

```typescript
// Avec correlation ID — chaque requete est identifiable
// {"requestId":"a1b2c3","msg":"Order validation started"}
// {"requestId":"d4e5f6","msg":"User authenticated"}
// {"requestId":"a1b2c3","msg":"Inventory checked"}
// {"requestId":"d4e5f6","msg":"Order validation started"}
// {"requestId":"a1b2c3","msg":"Payment initiated"}

// Filtrer par requestId="a1b2c3" → parcours complet de la requete
```

### [04:00-07:30] AsyncLocalStorage en action

> Node.js offre AsyncLocalStorage pour propager un contexte a travers toute la chaine asynchrone sans le passer en parametre.

**Action** : Ouvrir `demo-app/src/lib/context.ts`.

```typescript
// demo-app/src/lib/context.ts
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  userId?: string;
  tenantId?: string;
  startTime: number;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}
```

> AsyncLocalStorage cree un "espace de stockage" lie a la chaine asynchrone courante. Tout code execute dans un `asyncLocalStorage.run()` a acces au meme contexte, sans prop drilling.

**Action** : Ouvrir `demo-app/src/middleware/request-id.ts`.

```typescript
// demo-app/src/middleware/request-id.ts
import { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { asyncLocalStorage } from '../lib/context.ts';

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', requestId);

  const context = {
    requestId,
    userId: req.headers['x-user-id'] as string | undefined,
    tenantId: req.headers['x-tenant-id'] as string | undefined,
    startTime: Date.now(),
  };

  asyncLocalStorage.run(context, () => {
    next();
  });
}
```

> Le middleware genere un requestId unique ou recupere celui fourni par un service amont via le header `x-request-id`. Il l'injecte dans le contexte AsyncLocalStorage puis appelle next(). Toute la chaine de middleware et de handlers qui suit aura acces a ce contexte.

### [07:30-10:00] Child loggers et logging contextuel

**Action** : Ouvrir `demo-app/src/middleware/request-logger.ts`.

```typescript
// demo-app/src/middleware/request-logger.ts
import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '../lib/logger.ts';
import { getRequestContext } from '../lib/context.ts';

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ctx = getRequestContext();
  const reqLogger = logger.child({
    requestId: ctx?.requestId,
    method: req.method,
    url: req.url,
  });

  reqLogger.info('Incoming request');

  res.on('finish', () => {
    const duration = ctx ? Date.now() - ctx.startTime : 0;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    reqLogger[level]({
      statusCode: res.statusCode,
      duration,
    }, 'Request completed');
  });

  next();
}
```

> Le child logger herite de la configuration du parent et ajoute des champs permanents. Ici, chaque log emis par reqLogger portera automatiquement le requestId, la methode HTTP et l'URL. Pas besoin de les repeter a chaque appel.

> Et regardez la gestion des niveaux sur le log de fin de requete : les 5xx deviennent des error, les 4xx des warn, et le reste des info. C'est un pattern tres courant.

### [10:00-12:30] Demo en live

**Action** : Lancer la demo-app.

```bash
npx tsx demo-app/src/index.ts
```

**Action** : Envoyer des requetes avec et sans requestId.

```bash
# Sans x-request-id — le middleware en genere un
curl http://localhost:3000/api/orders

# Avec x-request-id — le middleware le reutilise
curl -H "x-request-id: mon-test-123" http://localhost:3000/api/orders

# Avec user-id pour le contexte
curl -H "x-request-id: user-req-456" -H "x-user-id: alice" http://localhost:3000/api/products
```

> Observez les logs dans le terminal. Chaque requete a son requestId unique. On peut filtrer tous les logs d'une requete en une seconde. Le requestId est aussi renvoye dans les headers de la reponse — le client peut l'utiliser pour le debugging.

**Action** : Montrer le header de reponse.

```bash
curl -v http://localhost:3000/health 2>&1 | grep x-request-id
```

### [12:30-14:30] Ce qu'il ne faut PAS logger

> Un point critique : les donnees sensibles n'ont rien a faire dans les logs.

**Action** : Montrer des exemples a ne pas reproduire.

```typescript
// INTERDIT — donnees sensibles
logger.info({ password: user.password });           // Mot de passe
logger.info({ token: jwt });                        // Token JWT
logger.info({ creditCard: '4111-1111-1111-1111' }); // Carte bancaire
logger.debug({ body: entireRequestBody });           // Corps complet (risque PII)

// INTERDIT — logs dans une boucle serree
for (const item of thousandItems) {
  logger.debug({ item }, 'Processing item'); // 1000 logs = bruit
}

// CORRECT — agreger
logger.info({ count: thousandItems.length }, 'Processing batch started');
```

> Meme si vos logs sont "internes", ils sont souvent accessibles a de nombreuses personnes et stockes longtemps. Un mot de passe dans un log est une faille de securite. Utilisez les redactors de Pino comme filet de securite, mais la premiere defense est de ne jamais passer ces donnees au logger.

**Action** : Rappeler la configuration redact dans `demo-app/src/lib/logger.ts`.

```typescript
redact: {
  paths: ['password', '*.password', 'authorization', 'creditCard'],
  censor: '[REDACTED]',
}
```

### [14:30-16:30] W3C Trace Context

> Pour finir, un apercu de la correlation inter-services avec le W3C Trace Context.

**Action** : Montrer le format du header traceparent.

```typescript
// Format du header traceparent (W3C standard)
// traceparent: 00-<trace-id>-<parent-span-id>-<trace-flags>
// Exemple : 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01

function extractTraceId(req: Request): string | undefined {
  const traceparent = req.headers['traceparent'] as string;
  if (!traceparent) return undefined;
  const parts = traceparent.split('-');
  return parts.length === 4 ? parts[1] : undefined;
}

// En injectant le traceId dans les logs, vous pouvez passer
// d'un log dans Grafana Loki a la trace dans Jaeger en un clic
```

> Le traceId est la cle de correlation universelle. Quand nous configurerons OpenTelemetry dans le module 07, ce header sera genere automatiquement.

### [16:30-17:30] Recapitulatif

> Recapitulons. Le Correlation ID est le concept le plus important de ce module. Sans lui, vos logs sont un tas de feuilles mortes melanges par le vent. Avec lui, chaque feuille porte un numero et vous pouvez reconstituer l'arbre entier.

> AsyncLocalStorage propage le contexte sans prop drilling. Les child loggers ajoutent des champs permanents. Ne jamais logger de PII — utilisez les redactors comme filet de securite.

> Prochain module : les metriques ! Nous verrons les Counter, Gauge et Histogram avec prom-client. Faites le Lab 03 pour pratiquer la correlation.

**Action** : Arreter la demo-app.

## Points d'attention pour l'enregistrement
- Bien montrer les logs dans le terminal avec les requestId — c'est le coeur du module
- Insister sur le fait que AsyncLocalStorage evite le "prop drilling" du requestId
- Montrer le header x-request-id dans la reponse HTTP (curl -v)
- L'exemple des logs melanges sans correlation doit etre tres visuel
- Ne pas oublier la partie "ce qu'il ne faut PAS logger" — securite importante
- Faire le lien avec le traceId qui sera approfondi dans le module 07

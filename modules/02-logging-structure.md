# Logging structure avec Pino

## Objectifs pedagogiques

- Comprendre pourquoi `console.log` est insuffisant en production
- Maîtriser le concept de logging structure (format JSON)
- Installer et configurer Pino dans un projet TypeScript
- Utiliser les transports Pino (stdout, file, pino-pretty)
- Connaître les niveaux de severite et leur usage
- Implementer des serializers et des redactors pour proteger les donnees sensibles
- Créer des child loggers pour ajouter du contexte
- Comparer les performances de Pino, Winston et Bunyan

---

## Pourquoi console.log ne suffit pas

En développement local, `console.log` est pratique. En production, il devient un handicap :

```typescript
// Le probleme avec console.log
console.log('Order created');
// Sortie : Order created

// Questions sans reponse :
// - Quand ? (pas de timestamp)
// - Pour quel utilisateur ?
// - Quel est le niveau de severite ?
// - Comment filtrer dans 100 000 lignes ?
// - Comment parser automatiquement ?
```

Un système de log agrege (ELK, Loki, Datadog) recoit des millions de lignes. Si vos logs ne sont pas structures, ils sont **inutilisables** a grande echelle.

### Les limites concretes

| Aspect | console.log | Logger structure |
|--------|------------|-----------------|
| Format | Texte libre | JSON parseable |
| Timestamp | Absent | Automatique |
| Niveaux | Aucun | trace → fatal |
| Contexte | Manuel | Automatique (child loggers) |
| Performance | Synchrone, bloquant | Asynchrone, optimise |
| Filtrage | Impossible | Par niveau, champ, valeur |

---

## Le logging structure : penser en JSON

Le logging structure consiste a emettre chaque log sous forme d'un objet JSON avec des champs predéfinis :

```typescript
// Log non structure
'2024-01-15 User 42 created order ord-123 for 99.99 EUR'

// Log structure (JSON)
{
  "level": 30,
  "time": 1705312800000,
  "msg": "Order created",
  "userId": 42,
  "orderId": "ord-123",
  "amount": 99.99,
  "currency": "EUR",
  "service": "order-service"
}
```

L'avantage est immediat : chaque champ est indexable, filtrable, et agreable. Dans Kibana ou Grafana Loki, vous pouvez écrire des requêtes comme `userId=42 AND level>=40` en quelques secondes.

---

## Introduction a Pino

[Pino](https://github.com/pinojs/pino) est le logger Node.js le plus rapide. Il a ete concu avec une philosophie claire : **ne rien faire de superflu dans le thread principal**.

### Installation

```bash
npm install pino pino-pretty
npm install -D @types/node
```

### Configuration de base

```typescript
// src/logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // En production, on emet du JSON brut (pour les agregaturs)
  // En dev, on utilise pino-pretty pour la lisibilite
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export default logger;
```

### Utilisation basique

```typescript
import logger from './logger';

// Differents niveaux
logger.trace('Donnee tres detaillee pour le debugging fin');
logger.debug('Information utile pour le debugging');
logger.info('Evenement normal du cycle de vie');
logger.warn('Situation anormale mais non bloquante');
logger.error('Erreur qui necessite une attention');
logger.fatal('Erreur critique — le processus va s arreter');

// Avec des donnees structurees
logger.info({ orderId: 'ord-123', userId: 42 }, 'Order created');
// Sortie JSON :
// {"level":30,"time":1705312800000,"orderId":"ord-123","userId":42,"msg":"Order created"}
```

::: tip A retenir
Avec Pino, le premier argument est toujours l'objet de contexte, et le second est le message. C'est l'inverse de beaucoup d'autres loggers — mais c'est plus performant car Pino peut serialiser l'objet directement.
:::

---

## Transports Pino

Les transports sont des **workers threads** qui traitent les logs en dehors du thread principal. C'est le secret de la performance de Pino.

### Transport stdout (defaut)

```typescript
// Par defaut, Pino ecrit sur stdout en JSON
const logger = pino();
// Les logs vont sur stdout — c'est l'approche 12-Factor App
// L'infrastructure (Docker, K8s) se charge de la collecte
```

### Transport pino-pretty (développement)

```typescript
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard', // Format lisible
      ignore: 'pid,hostname',        // Masquer les champs inutiles en dev
    }
  }
});
// Sortie : [14:30:00.123] INFO: Order created
//            orderId: "ord-123"
//            userId: 42
```

### Transport fichier

```typescript
const logger = pino({
  transport: {
    target: 'pino/file',
    options: { destination: '/var/log/app.log' }
  }
});
```

### Transports multiples

```typescript
const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'debug'
      },
      {
        target: 'pino/file',
        options: { destination: '/var/log/app.log' },
        level: 'warn' // Seuls les warnings+ vont dans le fichier
      }
    ]
  }
});
```

---

## Niveaux de severite

Pino utilise des niveaux numériques (plus le nombre est eleve, plus c'est grave) :

```typescript
// Niveaux Pino par defaut
// trace = 10  — details tres fins (rarement active en prod)
// debug = 20  — informations de debugging
// info  = 30  — evenements normaux (defaut)
// warn  = 40  — situations anormales
// error = 50  — erreurs necessitant attention
// fatal = 60  — erreurs critiques, arret imminent

// Changer le niveau dynamiquement
logger.level = 'debug'; // Active debug et tout ce qui est au-dessus

// Verifier si un niveau est actif (utile pour eviter des calculs couteux)
if (logger.isLevelEnabled('debug')) {
  logger.debug({ heavyData: computeExpensiveDebugInfo() }, 'Debug details');
}
```

---

## Serializers

Les serializers transforment automatiquement certains objets avant la serialisation JSON. C'est utile pour les objets complexes comme `Error`, `Request`, `Response`.

```typescript
import pino from 'pino';

const logger = pino({
  serializers: {
    // Serializer personnalise pour les erreurs
    err: pino.stdSerializers.err,

    // Serializer pour les requetes Express
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
      remoteAddress: req.socket?.remoteAddress,
    }),

    // Serializer pour les reponses Express
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  }
});

// Utilisation : Pino appliquera automatiquement le serializer
// quand la cle correspond (err, req, res)
logger.error({ err: new Error('Database timeout') }, 'Query failed');
// Sortie : {"level":50,"err":{"type":"Error","message":"Database timeout","stack":"..."},...}
```

---

## Redactors — proteger les donnees sensibles

En production, les logs peuvent contenir des donnees personnelles (PII) ou des secrets. Pino offre un mécanisme de **redaction** intégré :

```typescript
const logger = pino({
  redact: {
    paths: [
      'password',
      'creditCard',
      'user.email',
      'headers.authorization',
      '*.ssn',          // Wildcard : n'importe quel objet avec un champ ssn
    ],
    censor: '[REDACTED]' // Valeur de remplacement
  }
});

logger.info({
  user: { id: 42, email: 'alice@example.com', name: 'Alice' },
  password: 'secret123',
  creditCard: '4111-1111-1111-1111'
}, 'User login');

// Sortie :
// { "user": { "id": 42, "email": "[REDACTED]", "name": "Alice" },
//   "password": "[REDACTED]",
//   "creditCard": "[REDACTED]",
//   "msg": "User login" }
```

::: warning Attention
La redaction par Pino est un filet de sécurité, pas une garantie absolue. Revoyez regulierement les chemins de redaction et utilisez des revues de code pour vérifier que les donnees sensibles ne fuient pas dans les logs.
:::

---

## Child loggers

Les child loggers heritent de la configuration du parent et ajoutent des champs de contexte permanents. C'est la fonctionnalite la plus puissante de Pino pour l'observabilité.

```typescript
import pino from 'pino';

const logger = pino({ level: 'info' });

// Creer un child logger avec du contexte permanent
const orderLogger = logger.child({ service: 'order-service', version: '2.1.0' });

// Chaque log emis par orderLogger inclura automatiquement service et version
orderLogger.info({ orderId: 'ord-123' }, 'Order created');
// {"level":30,"service":"order-service","version":"2.1.0","orderId":"ord-123","msg":"Order created"}

// Les child loggers peuvent etre imbriques
function handleRequest(requestId: string) {
  const reqLogger = orderLogger.child({ requestId });

  reqLogger.info('Processing started');
  // {"level":30,"service":"order-service","version":"2.1.0","requestId":"abc-123","msg":"Processing started"}

  reqLogger.info({ step: 'validation' }, 'Validating order');
  // Le requestId est automatiquement present dans chaque log
}
```

C'est fondamental pour la **correlation** : dans un middleware Express, on créé un child logger par requête, et tous les logs de cette requête portent le même `requestId`.

---

## Comparaison de performance

Pino est concu pour etre le plus rapide. Voici un comparatif typique :

```typescript
// Benchmark simplifie (operations de log par seconde)
// Mesure sur un objet JSON avec 5 champs + message

// Pino      : ~150 000 ops/s  (reference)
// Winston   : ~20 000 ops/s   (~7x plus lent)
// Bunyan    : ~25 000 ops/s   (~6x plus lent)
// console.log: ~40 000 ops/s  (~4x plus lent, sans structure)

// Pourquoi Pino est si rapide ?
// 1. Serialisation JSON optimisee (fast-json-stringify)
// 2. Transports dans des worker threads (ne bloque pas le thread principal)
// 3. Pas de formatage couteux dans le thread principal
// 4. API minimaliste — chaque feature inutile a ete supprimee
```

::: tip A retenir
Choisissez Pino si la performance compte (et en production, elle compte toujours). Son approche "JSON sur stdout + traitement externe" est alignee avec les bonnes pratiques cloud-native (12-Factor App, conteneurs, Kubernetes).
:::

---

## Intégration TypeScript complete

Voici un fichier logger complet, pret pour la production, tel que nous l'utiliserons dans la demo-app :

```typescript
// src/logger.ts — Configuration production-ready
import pino, { type Logger } from 'pino';

export function createLogger(serviceName: string): Logger {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    name: serviceName,
    redact: {
      paths: ['password', '*.password', 'authorization', 'creditCard'],
      censor: '[REDACTED]',
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    // Ajouter le timestamp ISO pour la lisibilite
    timestamp: pino.stdTimeFunctions.isoTime,
    // Transport conditionnel
    transport: process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}

// Instance par defaut pour la demo-app
const logger = createLogger('demo-app');
export default logger;
```

---

## Bonnes pratiques

- **Toujours utiliser du logging structure** en production — jamais de texte libre
- **Écrire sur stdout** et laisser l'infrastructure collecter les logs
- **Utiliser des child loggers** pour attacher du contexte plutot que de le repeter
- **Redacter les PII** (emails, numéros de carte, tokens) des les la création du logger
- **Ne jamais logger d'objets entiers** sans serializer — risque de donnees sensibles ou de références circulaires
- **Configurer le niveau via variable d'environnement** (`LOG_LEVEL`) pour pouvoir l'ajuster sans redeployer
- **Mesurer l'impact du logging** sur les performances — même Pino à un cout si vous loggez trop

---

## Aller plus loin : concepts expert

### L'analogie de la bibliotheque

Imaginez une bibliotheque de 10 millions de livres. `console.log`, c'est jeter vos livres en vrac dans un entrepot. Le logging structure, c'est le système Dewey : chaque livre à une categorie, un auteur, une date, un emplacement. Quand vous cherchez "tous les livres sur le réseau publies après 2020", le système Dewey repond en secondes. L'entrepot en vrac ? Bonne chance.

En production, vos logs arrivent à un rythme de milliers par seconde. Sans structure, chercher un événement spécifique revient a chercher une aiguille dans une botte de foin — pendant une panne, a 3h du matin.

### Correlation log-trace : le pont entre les piliers

L'un des patterns expert les plus puissants est d'injecter le `traceId` et le `spanId` dans chaque ligne de log. Cela connecte le pilier Logs au pilier Traces :

```typescript
import { context, trace } from '@opentelemetry/api';
import pino from 'pino';

// Mixin Pino qui injecte automatiquement le contexte de trace
const logger = pino({
  mixin() {
    const span = trace.getSpan(context.active());
    if (span) {
      const { traceId, spanId } = span.spanContext();
      return { traceId, spanId };
    }
    return {};
  },
});

// Chaque log contient desormais le traceId et le spanId
// { "level": 30, "traceId": "abc123...", "spanId": "def456...", "msg": "Order created" }
// Dans Grafana, un clic sur le traceId ouvre directement la trace dans Jaeger
```

::: warning Cardinalite des logs
Ne confondez pas labels de metriques et champs de logs. Un log peut contenir `userId`, `orderId`, `sessionId` sans problème — chaque log est un événement individuel. En revanche, mettre `userId` comme label d'une metrique Prometheus créer une explosion de cardinalite. Les logs sont riches en contexte, les metriques sont riches en agregation.
:::

### Pipeline de logs en production

En production, les logs ne vont pas dans un fichier. Ils suivent une pipeline :

```
App (Pino, stdout JSON)
  → Agent de collecte (Fluent Bit, Vector, Alloy)
    → Agregateur (Loki, Elasticsearch, Datadog)
      → Interface (Grafana, Kibana)
```

Le choix de la stack d'agregation est une decision architecturale importante :

| Stack | Forces | Faiblesses |
|-------|--------|------------|
| **Grafana Loki** | Leger, labels-based (comme Prometheus), bon marche | Pas de full-text search natif |
| **Elastic (ELK)** | Full-text search puissant, mature | Gourmand en ressources, complexe |
| **Datadog Logs** | SaaS, zero maintenance | Cout eleve a grande echelle |

::: tip Référence SRE
Le Google SRE Book (Chapitre 1) decrit l'observabilité comme "la capacité a poser des questions que vous n'aviez pas prevues". Le logging structure est la base de cette capacité — sans champs parseable, aucune question imprevue ne peut etre posee.
:::

---

## Prochaines étapes

- [Lab 02 — Configurer Pino dans la demo-app](/labs/lab-02-pino-logger/README)
- [Quiz 02 — Logging structure](/quizzes/quiz-02-logging-structure)
- [Module suivant — Niveaux de log et contexte](/modules/03-niveaux-de-log-et-contexte)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 02 logging structure](../screencasts/screencast-02-logging-structure.md)
2. **Lab** : [lab-02-pino-logger](../labs/lab-02-pino-logger/README)
3. **Visualisation** : [Three Pillars](../visualizations/three-pillars.html)
4. **Quiz** : [quiz 02 logging structure](../quizzes/quiz-02-logging-structure.html)
:::

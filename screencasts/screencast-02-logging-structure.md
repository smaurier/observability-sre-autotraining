# Screencast 02 — Logging structure avec Pino

## Informations
- **Duree estimee** : 15-18 min
- **Module** : `modules/02-logging-structure.md`
- **Lab associe** : Lab 02
- **Prerequis** : Screencast 01

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] demo-app prete a etre lancee
- [ ] Fichier `demo-app/src/lib/logger.ts` ouvert
- [ ] Un fichier temporaire `scratch.ts` pret pour les demos
- [ ] Paquets `pino` et `pino-pretty` installes (`npm install`)

## Script

### [00:00-01:30] Introduction

> Dans le module precedent, nous avons vu les 3 piliers de l'observabilite. Aujourd'hui, nous plongeons dans le premier pilier : le logging. Nous allons remplacer console.log par Pino et decouvrir pourquoi le logging structure est indispensable en production.

**Action** : Creer un fichier `scratch.ts` pour les demos live.

### [01:30-04:00] Le probleme avec console.log

> Commencons par voir les limites de console.log.

**Action** : Ecrire un exemple simple avec console.log.

```typescript
// scratch.ts — Le probleme avec console.log
console.log('Order created');
console.log('User 42 placed order ord-123 for 99.99 EUR');
console.log('Error: Connection refused');
```

**Action** : Executer le fichier.

```bash
npx tsx scratch.ts
```

> Regardez la sortie. C'est lisible pour un humain, dans un terminal, avec 3 lignes. Mais imaginez un systeme d'agregation de logs qui recoit des millions de lignes. Comment filtrer par utilisateur ? Comment trier par severite ? Comment parser automatiquement ? C'est impossible.

**Action** : Montrer un tableau comparatif.

```typescript
// | Aspect        | console.log       | Logger structure  |
// |---------------|-------------------|-------------------|
// | Format        | Texte libre       | JSON parseable    |
// | Timestamp     | Absent            | Automatique       |
// | Niveaux       | Aucun             | trace → fatal     |
// | Contexte      | Manuel            | Automatique       |
// | Performance   | Synchrone         | Asynchrone        |
// | Filtrage      | Impossible        | Par champ/valeur  |
```

### [04:00-07:00] Premier pas avec Pino

> Installons et configurons Pino.

**Action** : Montrer l'installation (deja faite au setup).

```bash
npm install pino pino-pretty
```

**Action** : Remplacer le contenu de `scratch.ts` par une configuration Pino de base.

```typescript
// scratch.ts — Premier pas avec Pino
import pino from 'pino';

const logger = pino({
  level: 'info',
});

// Differents niveaux
logger.trace('Donnee tres detaillee — invisible par defaut');
logger.debug('Info de debugging — invisible par defaut');
logger.info('Evenement normal du cycle de vie');
logger.warn('Situation anormale mais non bloquante');
logger.error('Erreur qui necessite une attention');
logger.fatal('Erreur critique — arret imminent');
```

**Action** : Executer et observer la sortie JSON brute.

```bash
npx tsx scratch.ts
```

> Regardez : chaque ligne est du JSON valide. Il y a un champ `level` numerique, un `time` en millisecondes, et le `msg`. Les niveaux trace et debug n'apparaissent pas car le niveau par defaut est info (30). Seuls les logs de niveau 30 et superieur sont emis.

**Action** : Montrer la sortie.

```json
{"level":30,"time":1705312800000,"msg":"Evenement normal du cycle de vie"}
{"level":40,"time":1705312800001,"msg":"Situation anormale mais non bloquante"}
{"level":50,"time":1705312800002,"msg":"Erreur qui necessite une attention"}
{"level":60,"time":1705312800003,"msg":"Erreur critique — arret imminent"}
```

### [07:00-09:30] Donnees structurees et pino-pretty

> La puissance de Pino, c'est l'ajout de donnees structurees.

**Action** : Modifier `scratch.ts` pour ajouter du contexte.

```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  // Transport pino-pretty pour le developpement
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  }
});

// Avec des donnees structurees — l'objet en PREMIER, le message en SECOND
logger.info({ orderId: 'ord-123', userId: 42 }, 'Order created');
logger.info({ duration: 245, route: '/api/orders' }, 'Request completed');
logger.error({ err: new Error('Connection refused'), host: 'db.internal' }, 'Database error');
```

**Action** : Executer et montrer la sortie formatee par pino-pretty.

```bash
npx tsx scratch.ts
```

> Avec pino-pretty, la sortie est lisible pour un humain en developpement. Mais en production, on enleve le transport et on ecrit du JSON brut sur stdout — c'est l'infrastructure (Docker, Kubernetes) qui se charge de la collecte.

> Point important : avec Pino, l'objet de contexte est toujours le premier argument, et le message est le second. C'est l'inverse de beaucoup d'autres loggers, mais c'est plus performant car Pino serialise l'objet directement.

### [09:30-12:00] Transports et serializers

> Pino utilise des worker threads pour les transports — le traitement des logs se fait en dehors du thread principal.

**Action** : Montrer la configuration multi-transports.

```typescript
import pino from 'pino';

const logger = pino({
  level: 'debug',
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'debug'
      },
      {
        target: 'pino/file',
        options: { destination: './app.log' },
        level: 'warn'  // Seuls les warnings+ vont dans le fichier
      }
    ]
  }
});

logger.debug('Visible en console, pas dans le fichier');
logger.info('Visible en console, pas dans le fichier');
logger.warn('Visible en console ET dans le fichier');
logger.error('Visible en console ET dans le fichier');
```

**Action** : Executer et verifier le fichier `app.log`.

```bash
npx tsx scratch.ts
cat app.log
```

> Les serializers transforment automatiquement certains objets avant la serialisation. Le plus courant est le serializer d'erreurs.

**Action** : Montrer le serializer d'erreurs.

```typescript
import pino from 'pino';

const logger = pino({
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: { 'user-agent': req.headers['user-agent'] },
    }),
  }
});

logger.error({ err: new Error('Database timeout') }, 'Query failed');
// Le serializer extrait le type, message et stack trace automatiquement
```

### [12:00-14:30] Configuration production-ready

> Voyons maintenant la configuration que nous utilisons dans la demo-app.

**Action** : Ouvrir `demo-app/src/lib/logger.ts`.

```typescript
// demo-app/src/lib/logger.ts — Configuration production-ready
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
    timestamp: pino.stdTimeFunctions.isoTime,
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

const logger = createLogger('demo-app');
export default logger;
```

> Plusieurs points importants ici. Le niveau est configurable via variable d'environnement — pas besoin de redeployer pour changer le niveau de log. La redaction masque automatiquement les mots de passe et numeros de carte. Le transport pino-pretty n'est actif qu'en developpement.

### [14:30-16:30] Comparaison structuree vs non-structuree

> Pour finir, comparons les deux approches cote a cote.

**Action** : Montrer le contraste final.

```typescript
// NON STRUCTURE
'2024-01-15 User 42 created order ord-123 for 99.99 EUR'
// → Comment filtrer par userId ? Parser le montant ? Trier par severite ?

// STRUCTURE (JSON)
{
  "level": 30,
  "time": "2024-01-15T14:30:00.000Z",
  "msg": "Order created",
  "userId": 42,
  "orderId": "ord-123",
  "amount": 99.99,
  "currency": "EUR",
  "service": "order-service"
}
// → Chaque champ est indexable, filtrable, agreable
// → Dans Kibana : userId=42 AND level>=40
```

**Action** : Lancer la demo-app une derniere fois pour montrer les logs en action.

```bash
npx tsx demo-app/src/index.ts
```

```bash
# Dans un autre terminal
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item":"laptop","quantity":1}'
```

### [16:30-17:30] Recapitulatif

> Recapitulons. console.log est insuffisant en production : pas de timestamp, pas de niveaux, pas de structure. Pino produit du JSON indexable et filtrable. Les transports travaillent dans des worker threads — zero impact sur le thread principal. Les serializers et redactors protegent les donnees sensibles.

> Prochaine etape : le module 03 ou nous ajouterons les correlation IDs et les child loggers pour suivre une requete a travers tout le systeme. Faites le Lab 02 pour pratiquer !

## Points d'attention pour l'enregistrement
- Toujours montrer l'execution reelle du code — pas de screenshots statiques
- Insister sur l'ordre des arguments Pino : objet d'abord, message ensuite
- Montrer la difference visuelle entre JSON brut et pino-pretty
- Ne pas oublier de mentionner la performance : Pino est 7x plus rapide que Winston
- Montrer le fichier app.log cree par le transport fichier
- Supprimer le fichier scratch.ts et app.log a la fin du screencast

---
titre: Logging structuré — niveaux, contexte et corrélation avec Pino
cours: 16-observability-sre
notions: ["log structuré JSON vs texte", "niveaux de log (trace/debug/info/warn/error/fatal)", "contexte et corrélation (requestId, traceId)", "child loggers Pino", "redaction PII (redact)", "logs vs métriques (cardinalité)"]
outcomes:
  - sait expliquer pourquoi un log texte libre est inexploitable en agrégation et émettre du JSON structuré
  - sait choisir le bon niveau (trace/debug/info/warn/error/fatal) selon la sévérité réelle
  - sait attacher un requestId et un traceId de corrélation via un child logger Pino
  - sait configurer Pino (level, transport pino-pretty en dev, redact des PII) pour une API Node
  - connaît la frontière logs/métriques et sait ce qu'on ne met JAMAIS dans un log
prerequis: [module 00 — prérequis et introduction aux 3 piliers]
next: 02-metriques-et-prometheus
libs: []
tribuzen: API TribuZen — logs structurés Pino avec requestId et traceId exploitables en agrégation
last-reviewed: 2026-07
---

# Logging structuré — niveaux, contexte et corrélation avec Pino

> **Outcomes — tu sauras FAIRE :** émettre du JSON structuré au lieu de texte libre, choisir le bon niveau de log, corréler tous les logs d'une requête TribuZen avec un `requestId`/`traceId` via un child logger Pino.
> **Difficulté :** :star::star:
>
> **Portée :** ce module couvre le **pilier Logs** et sa mise en œuvre concrète avec Pino. Les métriques (`prom-client`, Prometheus) sont le sujet du **module 02**. Les traces distribuées et la propagation OpenTelemetry sont vues aux **modules 04-05**. La protection des données personnelles en profondeur (minimisation, rétention, RGPD) est traitée au **module 19** — ici on pose seulement le réflexe « ne jamais logger de PII ».

## 1. Cas concret d'abord

L'API TribuZen tourne en production. Un parent signale que la création de sa famille « ne marche pas ». Tu ouvres les logs collectés par l'infra. Voici ce que le service émet aujourd'hui avec `console.log` :

```text
Family creation started
User authenticated
Checking quota
Family creation started
Payment failed
User authenticated
Family created
```

Impossible de répondre à la moindre question :
- **Quand** exactement ? Aucun timestamp.
- **Pour quel utilisateur, quelle famille ?** Aucun identifiant.
- **Quelles lignes appartiennent à SA requête ?** Il y a deux « Family creation started » entrelacés — deux requêtes simultanées mélangées.
- **Quelle gravité ?** « Payment failed » est-il une erreur bloquante ou un warning ? Le texte ne le dit pas à la machine.
- **Comment filtrer dans 2 millions de lignes/jour ?** `grep "Payment failed"` ne remonte aucun contexte.

Le même parcours, en **JSON structuré + corrélation**, devient exploitable :

```json
{"level":30,"time":"2026-07-06T09:12:03.114Z","service":"tribuzen-api","requestId":"a1b2c3","userId":"u-42","msg":"Family creation started"}
{"level":30,"time":"2026-07-06T09:12:03.140Z","service":"tribuzen-api","requestId":"a1b2c3","userId":"u-42","msg":"Quota checked","remaining":2}
{"level":50,"time":"2026-07-06T09:12:03.402Z","service":"tribuzen-api","requestId":"a1b2c3","userId":"u-42","err":{"type":"Error","message":"Card declined"},"provider":"stripe","msg":"Payment failed"}
```

Un filtre `requestId="a1b2c3"` reconstitue le parcours complet de CETTE requête, avec l'erreur exacte, l'utilisateur et le fournisseur de paiement. C'est ce que ce module t'apprend à produire.

---

## 2. Théorie complète, concise

### 2.1 Structuré = un événement = un objet JSON

Le logging structuré consiste à émettre **chaque log comme un objet** dont les champs sont indexables, plutôt qu'une phrase à parser.

```ts
// ❌ Texte libre — une chaîne que la machine doit re-parser (souvent avec une regex fragile)
console.log(`User ${userId} created family ${familyId} for ${amount} EUR`)

// ✅ Structuré — chaque champ est déjà une donnée
logger.info({ userId, familyId, amount, currency: 'EUR' }, 'Family created')
// {"level":30,"time":...,"userId":"u-42","familyId":"f-7","amount":9.99,"currency":"EUR","msg":"Family created"}
```

En agrégation (Loki, Elasticsearch, Datadog), une requête comme `userId="u-42" AND level>=50` se résout en secondes sur du JSON — impossible de manière fiable sur du texte libre. La règle : **le message (`msg`) est pour l'humain, les champs sont pour la machine.**

### 2.2 Les niveaux de sévérité

Un niveau de log encode la **gravité** d'un événement. Pino utilise des valeurs numériques (plus haut = plus grave), ce qui rend le filtrage `level>=40` trivial.

| Niveau | Valeur | Quand l'utiliser | En production |
|--------|--------|------------------|---------------|
| `trace` | 10 | Détail ultra-fin (contenu d'un buffer, requête SQL) | Désactivé — activé ponctuellement |
| `debug` | 20 | Flow d'exécution, résultat de cache, retries | Désactivé par défaut |
| `info` | 30 | Événement métier normal (famille créée, service démarré) | **Actif — niveau par défaut** |
| `warn` | 40 | Anormal mais non bloquant (pool presque plein, fallback, API dépréciée) | Actif — surveiller la tendance |
| `error` | 50 | Une opération a échoué et mérite investigation | Actif — chaque error compte |
| `fatal` | 60 | Le process va s'arrêter / état irrécupérable | Actif — alerte immédiate |

`silent` (valeur `Infinity`) désactive tout log — utile en test. Le seuil courant se lit et se change via `logger.level`, et `logger.isLevelEnabled('debug')` évite un calcul coûteux quand le niveau est inactif :

```ts
logger.level = 'debug'                       // active debug et tout ce qui est au-dessus
if (logger.isLevelEnabled('debug')) {
  logger.debug({ dump: computeExpensiveDump() }, 'State dump')  // dump calculé seulement si utile
}
```

**La discipline des niveaux est ce qui sépare le signal du bruit :** mettre tout en `info` (ou tout en `error`) rend le filtrage inutile.

### 2.3 Le contexte de corrélation : requestId et traceId

Le problème du §1 (logs de plusieurs requêtes entrelacés) se résout avec un **identifiant de corrélation** attaché à chaque ligne d'une même requête.

- **`requestId`** — généré à l'entrée de l'API (ou repris du header `x-request-id` d'un service amont), unique par requête. C'est le fil d'Ariane local.
- **`traceId`** — identifiant de trace **distribuée** (standard W3C `traceparent`), partagé entre TOUS les services qui participent à une même opération. C'est le fil d'Ariane global, produit par OpenTelemetry (module 04). L'injecter dans les logs crée le pont Logs ↔ Traces : un clic sur un log ouvre la trace correspondante.

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  └─ trace-id (32 hex) ────────────┘ └─ span-id ──┘  └ flags
             version
```

En pratique, on ne passe PAS ces identifiants en paramètre à chaque fonction (prop drilling). On les attache une fois via un **child logger**.

### 2.4 Child loggers — le contexte permanent

`logger.child(bindings)` crée un logger dérivé qui **réémet automatiquement** les `bindings` sur chaque ligne. C'est la fonctionnalité clé de Pino pour la corrélation.

```ts
const log = pino({ level: 'info', name: 'tribuzen-api' })

// À l'entrée de la requête : un child avec le contexte de corrélation
const reqLog = log.child({ requestId: 'a1b2c3', userId: 'u-42' })

reqLog.info('Family creation started')       // porte requestId + userId sans les répéter
reqLog.info({ remaining: 2 }, 'Quota checked')
// Les enfants s'imbriquent : contexte hiérarchique
const familyLog = reqLog.child({ familyId: 'f-7' })
familyLog.info('Member added')               // porte requestId + userId + familyId
```

Un child hérite du flux de sortie et du niveau du parent au moment de sa création. Dans une API, on crée **un child par requête** dans un middleware, et tout le code métier de cette requête logge à travers lui.

### 2.5 Pino en pratique : config d'une API

Pino est le logger Node le plus rapide parce qu'il fait le minimum sur le thread principal (sérialisation JSON optimisée, transports dans des worker threads). Configuration type d'une API :

```ts
// logger.ts
import pino from 'pino'

export const logger = pino({
  name: 'tribuzen-api',
  level: process.env.LOG_LEVEL ?? 'info',       // pilotable sans redéploiement
  timestamp: pino.stdTimeFunctions.isoTime,      // time en ISO 8601 lisible
  serializers: {
    err: pino.stdSerializers.err,                // formate Error → {type, message, stack}
  },
  redact: {
    paths: ['password', '*.password', 'req.headers.authorization', 'email', '*.email'],
    censor: '[REDACTED]',                         // filet de sécurité anti-PII (voir §2.6)
  },
  // En dev seulement : sortie colorée lisible. En prod : JSON brut sur stdout.
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
})
```

Deux points idiomatiques :
- **Objet d'abord, message ensuite** : `logger.info(mergingObject, message)`. C'est l'inverse de beaucoup de loggers, mais ça permet la sérialisation directe. `logger.info('Family created', { id })` est un bug silencieux : le second argument est traité comme un paramètre d'interpolation, pas comme des champs.
- **stdout, pas de fichier** : en prod on écrit du JSON sur stdout (principe 12-Factor) et l'infra (Docker, agent Vector/Fluent Bit) collecte et route vers l'agrégateur. `pino-pretty` reste un outil de **dev** — jamais dans le chemin de prod.

### 2.6 Ce qu'on ne logge JAMAIS — et la frontière logs/métriques

Un log qui contient un mot de passe, un token ou un email en clair est une **faille de sécurité** : les logs sont vus par beaucoup de monde et conservés longtemps. Deux lignes de défense :

```ts
// 1) Ne pas construire le champ sensible à la source (meilleure défense)
logger.info({ userId: user.id }, 'User authenticated')   // ✅ pas d'email, pas de token

// 2) redact comme filet de sécurité si un objet riche fuit malgré tout
logger.info({ user }, 'User loaded')   // user.email sera remplacé par [REDACTED] si redacté
```

`redact` est un **filet**, pas une garantie : la vraie minimisation (quelles données, quelle rétention, anonymisation) relève du RGPD et est traitée au **module 19**. Réflexe à ancrer dès maintenant : **jamais de mot de passe, token, email, numéro de carte, ni body de requête entier dans un log.**

Enfin, ne confonds pas **champ de log** et **label de métrique**. Un log est un événement individuel : y mettre `userId`, `familyId`, `requestId` est parfait. Une métrique Prometheus est agrégée : mettre `userId` en label crée une **explosion de cardinalité** (un time-series par utilisateur) qui fait exploser la mémoire (module 02). Les logs sont riches en contexte ; les métriques sont riches en agrégation.

---

## 3. Worked examples

### Exemple 1 — Migrer une route TribuZen de `console.log` vers Pino structuré

Point de départ, la route de création de famille telle qu'écrite au début du projet :

```ts
// ❌ AVANT — console.log, texte libre, zéro corrélation
app.post('/families', async (req, res) => {
  console.log('Family creation started')
  const user = await auth(req)
  console.log('User ' + user.id + ' authenticated')
  try {
    const family = await createFamily(user, req.body)
    console.log('Family created ' + family.id)
    res.status(201).json(family)
  } catch (e) {
    console.log('Error ' + e.message)      // niveau ? contexte ? perdu
    res.status(500).json({ error: 'internal' })
  }
})
```

Version structurée et corrélée :

```ts
// ✅ APRÈS — Pino, JSON, requestId de corrélation, bons niveaux
import { randomUUID } from 'node:crypto'
import { logger } from './logger'

app.post('/families', async (req, res) => {
  // requestId : repris de l'amont si présent, sinon généré
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID()
  res.setHeader('x-request-id', requestId)          // propagé vers le client

  // child logger : tout le reste de la requête porte automatiquement requestId
  const log = logger.child({ requestId, route: 'POST /families' })
  log.info('Family creation started')

  try {
    const user = await auth(req)
    // on enrichit le contexte au fil de l'eau
    const userLog = log.child({ userId: user.id })
    userLog.debug('User authenticated')             // debug : détail de flow, pas d'intérêt en prod normale

    const family = await createFamily(user, req.body)
    userLog.info({ familyId: family.id }, 'Family created')   // info : événement métier
    res.status(201).json(family)
  } catch (e) {
    // err : le serializer std formate type + message + stack
    log.error({ err: e }, 'Family creation failed')  // error : opération échouée
    res.status(500).json({ error: 'internal', requestId })  // requestId renvoyé pour le support
  }
})
```

Ce que la migration apporte :
- chaque ligne est du JSON filtrable (`requestId`, `userId`, `familyId`) ;
- les niveaux distinguent le flow (`debug`) de l'événement métier (`info`) de l'échec (`error`) ;
- l'erreur passe par le champ `err` → stack trace complète et structurée ;
- le `requestId` renvoyé au client permet à un utilisateur de citer un identifiant que le support retrouve instantanément.

### Exemple 2 — Un middleware de corrélation réutilisable

Répéter la génération du `requestId` dans chaque route est fragile. On la centralise dans un middleware, en réutilisant le `traceId` si un `traceparent` W3C est présent.

```ts
// middleware/request-logger.ts
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { logger } from '../logger'

// Extrait le trace-id (2e segment) d'un header traceparent W3C, sinon undefined
function extractTraceId(req: Request): string | undefined {
  const tp = req.headers['traceparent'] as string | undefined
  const parts = tp?.split('-')
  return parts?.length === 4 ? parts[1] : undefined
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID()
  const traceId = extractTraceId(req)          // corrèle avec les traces OpenTelemetry (module 04)
  res.setHeader('x-request-id', requestId)

  // child de requête : disponible dans tout le handler via res.locals
  const log = logger.child({ requestId, traceId, method: req.method, url: req.url })
  res.locals.log = log
  log.info('Incoming request')

  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    // niveau choisi selon le statut : 5xx = error, 4xx = warn, sinon info
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    log[level]({ statusCode: res.statusCode, duration }, 'Request completed')
  })

  next()
}
```

Résultat : chaque requête produit une ligne d'entrée et une ligne de sortie corrélées, avec la **durée** (une métrique gratuite dans les logs) et un niveau qui reflète le statut HTTP. Les handlers récupèrent `res.locals.log` et n'ont plus à se soucier de la corrélation.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Inverser objet et message

```ts
logger.info('Family created', { familyId })   // ❌ { familyId } traité comme interpolation, PAS comme champ
logger.info({ familyId }, 'Family created')   // ✅ familyId devient un champ JSON indexable
```

Chez Pino, **l'objet vient toujours en premier**. L'ordre inversé « marche » (pas de crash) mais tes champs disparaissent silencieusement du JSON — le pire des bugs d'observabilité.

### PIÈGE #2 — Tout logger au même niveau

Mettre tout en `info` (ou paniquer et tout mettre en `error`) détruit le filtrage. Si `warn`/`error` contiennent du bruit normal, l'astreinte finit par les ignorer — et rate la vraie panne. Un niveau = une décision de gravité, pas un réflexe.

### PIÈGE #3 — Logger l'erreur en texte au lieu du champ `err`

```ts
logger.error('Payment failed: ' + e.message)   // ❌ stack perdue, message noyé dans une string
logger.error({ err: e }, 'Payment failed')     // ✅ serializer std → {type, message, stack}
```

Sans le champ `err`, tu perds la stack trace — l'information la plus précieuse pour reproduire un bug en prod.

### PIÈGE #4 — Croire que `console.log` est « juste plus simple »

`console.log` est **synchrone et bloquant** (il écrit sur stdout en bloquant l'event loop), non structuré, sans niveaux ni timestamp. En prod sous charge, c'est à la fois plus lent que Pino et inexploitable en agrégation. La simplicité apparente coûte cher au premier incident.

### PIÈGE #5 — Confondre champ de log et label de métrique

Mettre `userId` dans un log : parfait. Mettre `userId` en label d'une métrique Prometheus : **explosion de cardinalité** (module 02). Les deux piliers n'ont pas les mêmes règles : contexte riche pour les logs, dimensions bornées pour les métriques.

### PIÈGE #6 — `pino-pretty` en production

`pino-pretty` reformate le JSON en texte coloré : pratique en dev, mais en prod ça **détruit la structure** que l'agrégateur attend et coûte du CPU. En prod : JSON brut sur stdout, et l'UI (Grafana/Kibana) fait le rendu lisible.

---

## 5. Ancrage TribuZen

Le pilier Logs de TribuZen repose entièrement sur ce module. L'API TribuZen (Node/Express) émet du JSON Pino sur stdout ; l'infra le collecte vers Loki (module 15). Concrètement :

- **`logger.ts`** — instance racine `pino({ name: 'tribuzen-api', ... })` avec `redact` des PII (email, password, authorization) et `serializers.err`.
- **`middleware/request-logger.ts`** — l'Exemple 2 de ce module : un child logger par requête avec `requestId` + `traceId`, exposé en `res.locals.log`. C'est la brique qui rend les incidents TribuZen investigables.
- **Routes métier** (`POST /families`, `POST /families/:id/members`, `POST /events`) — loggent les événements métier en `info` (`Family created`, `Member invited`), les dégradations en `warn` (quota proche, e-mail d'invitation en retard), les échecs en `error` avec `err`.
- Le `requestId` est **renvoyé au client** dans la réponse d'erreur : un parent qui contacte le support cite cet identifiant, et l'astreinte retrouve le parcours exact en un filtre.

Fichiers cibles dans `smaurier/tribuzen` :

```text
tribuzen/
  apps/
    api/
      src/
        logger.ts                       ← instance Pino racine (level, redact, serializers)
        middleware/
          request-logger.ts             ← child logger par requête (requestId + traceId)
        modules/
          families/families.routes.ts   ← logs métier via res.locals.log
```

> Ce module pose le pilier Logs. Le pilier Métriques (module 02) et le pilier Traces (modules 04-05) viendront s'y raccorder — le `traceId` déjà présent dans les logs est le point de jonction.

---

## 6. Points clés

1. Un log structuré = un événement = un objet JSON : `msg` pour l'humain, les champs pour la machine.
2. Six niveaux (`trace` 10 → `fatal` 60) encodent la gravité ; `info` est le défaut prod, filtrable via `level>=N`.
3. `requestId` corrèle les logs d'une requête (local) ; `traceId` corrèle entre services (distribué, W3C `traceparent`).
4. `logger.child(bindings)` attache un contexte permanent sans prop drilling — un child par requête dans un middleware.
5. Pino : objet d'abord puis message ; JSON sur stdout en prod ; `pino-pretty` en dev uniquement.
6. Les erreurs passent par le champ `err` (`pino.stdSerializers.err`) pour conserver type + message + stack.
7. Jamais de PII/secret dans un log ; `redact` est un filet, pas la stratégie (RGPD → module 19).
8. Champ de log ≠ label de métrique : `userId` en log = OK, `userId` en label Prometheus = explosion de cardinalité.

---

## 7. Seeds Anki

```
Pourquoi le texte libre est-il inexploitable en agrégation de logs ?|Il faut re-parser chaque ligne (regex fragile) pour en extraire des champs. Le JSON structuré expose des champs déjà indexables : une requête level>=50 AND userId="x" se résout en secondes.
Quels sont les 6 niveaux Pino et leurs valeurs ?|trace=10, debug=20, info=30, warn=40, error=50, fatal=60 (silent=Infinity). Plus la valeur est haute, plus c'est grave ; info est le défaut en prod.
Différence entre requestId et traceId ?|requestId = fil d'Ariane LOCAL, unique par requête à l'entrée de l'API. traceId = fil d'Ariane DISTRIBUÉ (W3C traceparent), partagé entre tous les services d'une même opération, produit par OpenTelemetry.
À quoi sert logger.child(bindings) chez Pino ?|Crée un logger dérivé qui réémet automatiquement les bindings sur chaque ligne. On crée un child par requête (avec requestId/traceId) pour corréler sans passer le contexte en paramètre partout.
Quel est l'ordre des arguments d'une méthode de log Pino ?|Objet d'abord, message ensuite : logger.info(mergingObject, message). L'inverse (message puis objet) fait disparaître silencieusement les champs du JSON.
Comment logger une erreur correctement avec Pino ?|Via le champ err : logger.error({ err: e }, 'msg'). Le serializer pino.stdSerializers.err formate type + message + stack. Concaténer e.message dans une string perd la stack.
Pourquoi ne jamais mettre userId en label d'une métrique Prometheus alors que c'est OK dans un log ?|Un log est un événement individuel (contexte riche = OK). Une métrique est agrégée : un label userId crée un time-series par utilisateur = explosion de cardinalité et saturation mémoire.
Que fait l'option redact de Pino et quelle est sa limite ?|Elle remplace la valeur de chemins sensibles (paths) par un censor (défaut [Redacted]). C'est un filet de sécurité, pas la stratégie : la vraie minimisation/rétention PII relève du RGPD (module 19).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-01-logging-structure/README.md`. Migrer les logs `console.log` de l'API TribuZen vers Pino structuré + corrélation `requestId`, avec la sortie JSON réelle comme oracle — vrai outil (Pino + tsx), corrigé commenté intégral, variante J+30.

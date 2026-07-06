# Lab 01 — Logging structuré & corrélation avec Pino

> **Outcome :** à la fin, tu sais transformer les logs `console.log` d'une route de l'API TribuZen en JSON Pino structuré, corrélé par un `requestId`, avec les bons niveaux et sans PII.
> **Vrai outil :** Pino (dernière version) exécuté sous `tsx` — tu lis la **sortie JSON réelle** dans ton terminal comme oracle. Aucun harnais auto-correcteur.
> **Feedback :** le coach valide la sortie en session à l'aide de la grille ci-dessous.

---

## Énoncé

L'API TribuZen expose une route de création de famille encore instrumentée à coups de `console.log`. Tu vas la migrer vers Pino.

Objectif fonctionnel : après migration, tu dois pouvoir **rejouer deux requêtes entrelacées** et retrouver, par simple filtre sur `requestId`, toutes les lignes d'UNE seule requête — avec le bon niveau et l'erreur structurée.

### Mise en place (vrai outil)

```bash
mkdir lab-pino && cd lab-pino
npm init -y
npm install pino
npm install -D pino-pretty tsx typescript @types/node
```

Point de départ à copier dans `src/families.ts` (**tu ne modifies pas encore la logique, seulement le logging**) :

```ts
// src/families.ts — AVANT (à migrer)
import { randomUUID } from 'node:crypto'

interface Req { headers: Record<string, string | undefined>; body: unknown }

// Simule le traitement d'une création de famille
async function handleCreateFamily(req: Req): Promise<void> {
  console.log('Family creation started')
  const userId = 'u-42'
  console.log('User ' + userId + ' authenticated')
  console.log('Checking quota')

  try {
    // Simule un échec de paiement une fois sur deux
    if (Math.random() < 0.5) throw new Error('Card declined')
    const familyId = 'f-' + Math.floor(Math.random() * 1000)
    console.log('Family created ' + familyId)
  } catch (e) {
    console.log('Error ' + (e as Error).message)
  }
}

// Deux requêtes "simultanées" pour reproduire l'entrelacement du module §1
async function main(): Promise<void> {
  await Promise.all([
    handleCreateFamily({ headers: { 'x-request-id': 'req-AAA' }, body: {} }),
    handleCreateFamily({ headers: {}, body: {} }),
  ])
}
main()
```

Lance-le pour constater le problème :

```bash
npx tsx src/families.ts
```

Tu obtiens un tas de lignes texte impossibles à démêler entre les deux requêtes. **C'est le point de départ à corriger — pas de gap-fill, tu réécris le logging toi-même.**

---

## Étapes (en friction)

1. **Crée `src/logger.ts`** — exporte une instance Pino racine : `name: 'tribuzen-api'`, `level` piloté par `process.env.LOG_LEVEL ?? 'info'`, `timestamp: pino.stdTimeFunctions.isoTime`, `serializers: { err: pino.stdSerializers.err }`, et un `redact` sur `['password', 'email', '*.email']`. Ajoute un `transport` `pino-pretty` **uniquement** si `NODE_ENV !== 'production'`.
2. **Génère un `requestId` par requête** dans `handleCreateFamily` : reprends `req.headers['x-request-id']` s'il existe, sinon `randomUUID()`.
3. **Crée un child logger** `const log = logger.child({ requestId })` et fais passer TOUS les logs de la requête par `log`.
4. **Choisis les niveaux** : `info` pour « Family creation started » et « Family created », `debug` pour « authenticated » et « quota », `error` pour l'échec — avec l'erreur dans le champ `err` (`log.error({ err: e }, 'Family creation failed')`).
5. **Ajoute du contexte métier** utile au filtrage : `userId`, et `familyId` sur la ligne de succès.
6. **Vérifie l'oracle** : relance `npx tsx src/families.ts`, copie la sortie, et confirme qu'un filtre mental sur `req-AAA` isole bien un parcours cohérent. Puis relance avec `LOG_LEVEL=debug` et compare : les lignes `debug` apparaissent en plus.
7. **Vérifie l'absence de PII** : ajoute volontairement `log.info({ email: 'a@b.com' }, 'x')` et confirme que la sortie affiche `"email":"[REDACTED]"`. Retire ensuite la ligne.

---

## Corrigé complet commenté

```ts
// src/logger.ts — instance Pino racine, prête pour une API
import pino from 'pino'

export const logger = pino({
  name: 'tribuzen-api',
  // Niveau pilotable sans redéploiement : LOG_LEVEL=debug npx tsx ...
  level: process.env.LOG_LEVEL ?? 'info',
  // Timestamp ISO 8601 lisible (au lieu de l'epoch ms par défaut)
  timestamp: pino.stdTimeFunctions.isoTime,
  // Le serializer std formate toute valeur du champ `err` en {type, message, stack}
  serializers: { err: pino.stdSerializers.err },
  // Filet de sécurité anti-PII (la vraie stratégie RGPD = module 19)
  redact: { paths: ['password', 'email', '*.email'], censor: '[REDACTED]' },
  // pino-pretty : DEV uniquement. En prod on veut du JSON brut sur stdout.
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
})
```

```ts
// src/families.ts — APRÈS migration
import { randomUUID } from 'node:crypto'
import { logger } from './logger'

interface Req { headers: Record<string, string | undefined>; body: unknown }

async function handleCreateFamily(req: Req): Promise<void> {
  // 1) requestId : repris de l'amont si présent, sinon généré
  const requestId = req.headers['x-request-id'] ?? randomUUID()

  // 2) child logger : chaque ligne portera automatiquement requestId (corrélation)
  const log = logger.child({ requestId })
  const userId = 'u-42'

  // info = événement métier normal
  log.info('Family creation started')
  // debug = détail de flow, désactivé en prod par défaut
  log.child({ userId }).debug('User authenticated')
  log.debug('Quota checked')

  try {
    if (Math.random() < 0.5) throw new Error('Card declined')
    const familyId = 'f-' + Math.floor(Math.random() * 1000)
    // contexte métier (userId, familyId) → filtrage puissant
    log.info({ userId, familyId }, 'Family created')
  } catch (e) {
    // error = opération échouée ; err via serializer → stack conservée
    log.error({ err: e, userId }, 'Family creation failed')
  }
}

// Deux requêtes entrelacées : requestId permet de les démêler
async function main(): Promise<void> {
  await Promise.all([
    handleCreateFamily({ headers: { 'x-request-id': 'req-AAA' }, body: {} }),
    handleCreateFamily({ headers: {}, body: {} }),
  ])
}
main()
```

**Sortie attendue (avec `NODE_ENV=production` pour voir le JSON brut) :**

```json
{"level":30,"time":"2026-07-06T09:12:03.114Z","name":"tribuzen-api","requestId":"req-AAA","msg":"Family creation started"}
{"level":30,"time":"2026-07-06T09:12:03.115Z","name":"tribuzen-api","requestId":"e7c1...","msg":"Family creation started"}
{"level":50,"time":"2026-07-06T09:12:03.402Z","name":"tribuzen-api","requestId":"req-AAA","userId":"u-42","err":{"type":"Error","message":"Card declined","stack":"Error: Card declined\n    at ..."},"msg":"Family creation failed"}
{"level":30,"time":"2026-07-06T09:12:03.403Z","name":"tribuzen-api","requestId":"e7c1...","userId":"u-42","familyId":"f-317","msg":"Family created"}
```

**Pourquoi ce corrigé est correct :**
- Un filtre `requestId="req-AAA"` reconstitue exactement UNE requête, malgré l'entrelacement.
- Les `debug` n'apparaissent pas par défaut (`level: 'info'`) mais surgissent avec `LOG_LEVEL=debug` — le niveau est un vrai bouton de granularité.
- L'erreur passe par `err` : la stack est présente et structurée, pas noyée dans une string.
- Aucune PII : `userId` est un identifiant technique, pas un email ; `redact` couvre le cas où un email fuirait.

---

## Grille de validation (le coach coche)

- [ ] La sortie est du **JSON** (un objet par ligne), plus aucun `console.log`.
- [ ] Chaque ligne d'une même requête porte le **même `requestId`** via `logger.child`.
- [ ] Les **niveaux** sont pertinents : `info` métier, `debug` flow, `error` échec.
- [ ] L'erreur est loggée via le **champ `err`** et la **stack** apparaît.
- [ ] `LOG_LEVEL=debug` fait apparaître les lignes `debug` ; sans lui, elles disparaissent.
- [ ] Un champ `email` injecté ressort en `[REDACTED]` (redact opérationnel).
- [ ] Objet **avant** message dans chaque appel (`log.info({ ... }, 'msg')`).

---

## Variante J+30 (fading)

**Même migration, contraintes ajoutées, sans rouvrir ce corrigé ni le module (25 min) :**

1. Ajoute un **`traceId`** au child logger : extrait-le du header `traceparent` (format `00-<32hex>-<16hex>-01`, tu prends le 2ᵉ segment) s'il est présent, sinon `undefined`.
2. Ajoute une **ligne de fin** qui logge la **durée** de traitement (`Date.now()` en entrée/sortie) au niveau adapté au résultat (`info` si succès, `error` si échec).
3. Passe le logger en **mode production** (`NODE_ENV=production`) et vérifie qu'il n'y a plus aucun rendu `pino-pretty` — seulement du JSON brut.

**Critère de réussite :** un filtre sur `traceId` (quand présent) OU `requestId` isole un parcours complet incluant sa durée, et la sortie prod est du JSON pur exploitable par un agrégateur.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce logging vit ici :

```text
tribuzen/
  apps/
    api/
      src/
        logger.ts                     ← instance Pino racine (level, redact, serializers)
        middleware/
          request-logger.ts           ← child logger par requête (requestId + traceId)
        modules/
          families/families.routes.ts ← logs métier via res.locals.log
```

**Différences par rapport au lab :**
- Le `requestId`/`traceId` sera géré une seule fois dans un **middleware Express** (`request-logger.ts`) et exposé via `res.locals.log`, plutôt que régénéré dans chaque handler.
- Le `traceId` sera fourni automatiquement par l'instrumentation OpenTelemetry (modules 04-05) au lieu d'être parsé à la main.
- Les logs partent sur **stdout** et sont collectés vers **Loki** (module 15) ; `pino-pretty` reste réservé au poste de dev.

**Commit cible :**
```text
feat(obs): logs API en Pino structuré + requestId de corrélation (remplace console.log)
```

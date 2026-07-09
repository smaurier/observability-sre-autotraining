# Lab 06 — Error tracking : intégrer Sentry dans l'API TribuZen

> **Outcome :** à la fin, tu sais initialiser `@sentry/node` (chargé en premier) dans une API Express, capturer une exception avec un contexte utilisateur **sans PII** + breadcrumb + fingerprint par route, définir une **release**, et configurer l'**upload des source maps** — puis lire l'issue groupée et désobfusquée dans l'UI Sentry.
> **Vrai outil :** SDK `@sentry/node` réel + un vrai projet Sentry (SaaS gratuit `sentry.io`, ou self-hosted). Aucun harnais simulé, aucun auto-correcteur.
> **Feedback :** le coach valide en session à partir de l'issue visible dans l'UI Sentry (grouping, contexte, absence de PII, tag `release`).

---

## Énoncé

La demo-app (`16-observability-sre/demo-app`) est une API Express (routes `/products`, `/orders`, `/health`). Elle logue (Pino, module 01) et trace (OTel, module 05), mais **aucune erreur n'est trackée** : quand `createOrder` plante, tu ne le vois que si tu lis les logs à la main.

Ta mission, en 4 blocs :

1. **Initialiser Sentry** dans un fichier `instrument.ts` séparé, chargé **avant** l'app via `--import`, avec `dsn` (env), `environment`, `release` et un `beforeSend` anti-PII.
2. **Brancher Express** : `Sentry.setupExpressErrorHandler(app)` après les routes, avant le middleware d'erreur applicatif.
3. **Capturer une exception métier** dans `order-service.ts` (ou le handler `/orders`) avec `setUser({ id })` pseudonyme, un breadcrumb métier, et un **fingerprint** par route.
4. **Définir une release + configurer l'upload des source maps** (via `@sentry/wizard` ou le plugin bundler), puis provoquer une erreur et vérifier dans l'UI Sentry : issue **groupée**, stack **désobfusquée**, tag `release`, **aucune PII**.

**Contraintes :**
- Le **DSN est un placeholder** : mets-le dans `SENTRY_DSN` (env), **jamais en dur**, jamais commité. Aucun vrai secret dans le dépôt.
- L'event **ne doit contenir aucune PII** : `setUser` avec `id` opaque uniquement, breadcrumbs sans nom/email, `beforeSend` qui coupe cookies + `authorization`.
- Pas de gap-fill : tu écris `instrument.ts` et l'instrumentation à partir des starters minimaux.
- N'envoie **rien en dev** (`beforeSend` renvoie `null` si `NODE_ENV === 'development'`) — pour tester l'envoi, lance en `NODE_ENV=production` avec un DSN de projet **de test**.

### Prérequis (à faire une fois)

```bash
# depuis 16-observability-sre/demo-app/
npm install @sentry/node
# un projet Sentry (sentry.io gratuit ou self-hosted) → récupère son DSN
export SENTRY_DSN='https://<placeholder-key>@o0.ingest.sentry.io/0'  # TON DSN de test, non commité
```

### Starter minimal — `instrument.ts`

Crée `demo-app/instrument.ts` :

```typescript
// instrument.ts — chargé AVANT l'app via `--import ./instrument.ts`
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // TODO: environment (NODE_ENV)
  // TODO: release (ex: `tribuzen-api@${process.env.RELEASE ?? 'dev'}`)
  // TODO: sampleRate 1.0 (erreurs) — tracesSampleRate 0.2 (perf)
  // TODO: beforeSend → null en dev ; sinon delete cookies + header authorization
});
```

### Starter minimal — instrumentation métier

Dans le handler/service qui peut planter (ex. `src/routes/orders.ts` ou `src/services/order-service.ts`) :

```typescript
import * as Sentry from '@sentry/node';

// dans le handler, avant l'appel risqué :
// TODO: Sentry.setUser({ id: <id pseudonyme, PAS d'email> })
// TODO: Sentry.addBreadcrumb({ category, message, level, data })  // data sans PII

try {
  // ... création de commande ...
} catch (err) {
  // TODO: Sentry.withScope(scope => { scope.setFingerprint(['{{ default }}', 'orders']); Sentry.captureException(err) })
  // TODO: next(err)  // NE PAS avaler l'erreur
}
```

---

## Étapes (en friction)

1. **Installe `@sentry/node`** dans `demo-app/` et crée un projet Sentry de test → récupère son DSN dans `SENTRY_DSN` (env, non commité).
2. **Complète `instrument.ts`** : `environment`, `release`, `sampleRate: 1.0`, `tracesSampleRate: 0.2`, et un `beforeSend` qui renvoie `null` en dev et coupe cookies + `authorization` sinon.
3. **Charge Sentry en premier** : lance l'app avec `NODE_ENV=production RELEASE=tribuzen-api@1.0.0 npx tsx --import ./instrument.ts src/index.ts`.
4. **Branche Express** : ajoute `Sentry.setupExpressErrorHandler(app)` **après** les routes et **avant** le middleware d'erreur applicatif. Vérifie l'ordre.
5. **Ajoute une route de test** `GET /debug-sentry` qui `throw new Error('Test Sentry TribuZen')`, appelle-la → l'event doit apparaître dans l'UI Sentry (auto-capture).
6. **Instrumente `/orders`** : `setUser({ id })` pseudonyme, breadcrumb métier `data: { itemCount }` (pas de nom/email), et dans le `catch` un `withScope` + <code v-pre>setFingerprint(['{{ default }}', 'orders'])</code> + `captureException` + `next(err)`.
7. **Provoque une vraie erreur métier** (ex. POST `/orders` avec un payload qui fait échouer `createOrder`) → vérifie l'issue : grouping, breadcrumbs, `user.id`, tag `route`.
8. **Vérifie l'absence de PII** : ouvre l'event dans l'UI → aucun email/nom, pas de cookie ni header `authorization`.
9. **Release + source maps** : configure l'upload via `npx @sentry/wizard@latest -i sourcemaps` (ou le plugin bundler), rebuild avec `SENTRY_AUTH_TOKEN` (env), et confirme que la stack est **désobfusquée** et l'issue taggée `release: tribuzen-api@1.0.0`.
10. **Régression** : marque l'issue *resolved*, change la release en `1.1.0`, reprovoque l'erreur → Sentry doit lever une **régression**.

---

## Corrigé complet commenté

### `instrument.ts`

```typescript
// instrument.ts — chargé AVANT l'app : `npx tsx --import ./instrument.ts src/index.ts`
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,                 // placeholder en env, JAMAIS en dur / commité
  environment: process.env.NODE_ENV,           // 'production' | 'staging' | 'development'
  release: `tribuzen-api@${process.env.RELEASE ?? 'dev'}`, // rattache events + source maps

  sampleRate: 1.0,        // ERREURS : 100%, on n'en manque aucune
  tracesSampleRate: 0.2,  // TRANSACTIONS perf : 20% (ne pas confondre les deux réglages)

  // Filet anti-PII + coupe-circuit dev
  beforeSend(event) {
    if (process.env.NODE_ENV === 'development') return null; // rien en dev
    delete event.request?.cookies;                            // pas de cookies
    if (event.request?.headers) {
      delete event.request.headers['authorization'];          // pas de token d'auth
    }
    return event;
  },
});
```

### `src/index.ts` — ordre de chargement et handler Express

```typescript
// src/index.ts
// 1. Sentry est chargé AVANT l'app via `--import ./instrument.ts` (voir étape 3) — PAS de `import './instrument'` ici.
//    Une seule voie d'init : un import en tête RÉ-exécuterait Sentry.init (double initialisation).
import express from 'express';
import * as Sentry from '@sentry/node';
import { ordersRouter } from './routes/orders';

const app = express();
app.use(express.json());

// route de test (étape 5)
app.get('/debug-sentry', () => {
  throw new Error('Test Sentry TribuZen'); // capturée automatiquement
});

// 2. routes métier
app.use('/orders', ordersRouter);

// 3. handler Sentry : APRÈS les routes, AVANT le middleware d'erreur applicatif
Sentry.setupExpressErrorHandler(app);

// 4. middleware d'erreur applicatif : réponse propre au client
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: 'internal_error' });
});

app.listen(3000, () => console.log('API TribuZen sur :3000'));
```

### `src/routes/orders.ts` — capture métier avec contexte sans PII

```typescript
// src/routes/orders.ts
import { Router } from 'express';
import * as Sentry from '@sentry/node';
import { createOrder } from '../services/order-service';

export const ordersRouter = Router();

ordersRouter.post('/', async (req, res, next) => {
  const memberId = req.header('x-member-id') ?? 'anonymous'; // pseudonyme, PAS d'email
  const items: string[] = req.body.items ?? [];

  // Contexte utilisateur SANS PII : id opaque uniquement
  Sentry.setUser({ id: memberId });

  // Breadcrumb métier : l'intention, sans donnée nominative
  Sentry.addBreadcrumb({
    category: 'orders',
    message: 'Création de commande',
    level: 'info',
    data: { itemCount: items.length }, // count, pas le contenu personnel
  });

  try {
    const order = await createOrder(memberId, items);
    res.json(order);
  } catch (err) {
    // Grouping : repartir du défaut, mais isoler la route 'orders'
    // → les erreurs de commande ne se noient pas dans un groupe fourre-tout
    Sentry.withScope((scope) => {
      scope.setTag('route', 'orders');
      scope.setFingerprint(['{{ default }}', 'orders']);
      Sentry.captureException(err);
    });
    // NE PAS avaler : on relaie → setupExpressErrorHandler + middleware applicatif
    next(err);
  }
});
```

**Pourquoi ce corrigé est correct :**
- `instrument` est le **tout premier import** de `src/index.ts` → l'auto-instrumentation patche `http`/Express avant leur chargement (piège #2 du module).
- `setupExpressErrorHandler` est **après les routes et avant** le middleware applicatif : Sentry voit l'exception avant qu'elle soit transformée en réponse 500 (piège #3).
- `setUser({ id })` + breadcrumb `data: { itemCount }` → **aucune PII** ; `beforeSend` coupe cookies/`authorization` en filet (piège #5).
- <code v-pre>setFingerprint(['{{ default }}', 'orders'])</code> affine le grouping natif sans tout remplacer (§2.6 du module).
- `next(err)` ne **avale pas** l'erreur : le client reçoit une 500 propre et l'event part.
- `sampleRate: 1.0` / `tracesSampleRate: 0.2` : erreurs complètes, perf échantillonnée (piège #7).

**Vérification finale (oracle visuel) :** dans l'UI Sentry, l'issue `POST /orders` montre → stack **désobfusquée** (release `tribuzen-api@1.0.0`), tag `route=orders`, `user.id` pseudonyme, breadcrumbs `Création de commande` → aucun email/cookie/token visible. Rejouer l'erreur incrémente le **compteur d'events de la même issue** (grouping), ne crée pas 10 issues. C'est le coach qui valide cet écran en session.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. **En 25 minutes**, instrumente une **deuxième** route (`/products`) avec son propre fingerprint (<code v-pre>['{{ default }}', 'products']</code>) et un breadcrumb `data: { query }` (sans PII) — prouve que les erreurs `/products` et `/orders` forment **deux issues distinctes**.
2. **Regroupe agressivement** toutes les erreurs de timeout (peu importe la route) en **une seule** issue : dans leur `catch`, `setFingerprint(['timeout'])` **sans** <code v-pre>{{ default }}</code>. Vérifie qu'un timeout sur `/orders` et un sur `/products` tombent dans la **même** issue.
3. **Filtre le bruit** : ajoute au `beforeSend` une règle qui **ne remonte pas** les erreurs de validation (`err.status === 400`) — vérifie qu'un POST invalide **n'apparaît plus** dans Sentry.

**Critère de réussite :** deux issues séparées pour les erreurs normales `/products` vs `/orders`, une issue unique pour les timeouts, et zéro event pour les 400 — tout vérifié dans l'UI Sentry.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette intégration vit ici :

```
tribuzen/
  apps/
    api/
      instrument.ts            ← Sentry.init (dsn env, release, environment, beforeSend anti-PII)
      src/index.ts             ← chargé après instrument.ts via `--import` (pas d'import en tête), setupExpressErrorHandler après routes
      src/routes/rsvp.ts        ← setUser(id) + breadcrumb + fingerprint + captureException
    web/
      sentry.client.ts          ← Sentry.init front, release = version du build
      bundler.config.ts         ← plugin Sentry : source maps uploadées, retirées du servi
```

**Différences par rapport au lab :**
- Le `SENTRY_DSN` et `SENTRY_AUTH_TOKEN` viendront des **secrets CI/infra**, jamais d'une valeur en dur (le lab utilise un DSN de test en env local).
- La `release` sera le **SHA du commit** ou le tag de version injecté au build (`tribuzen-api@$GIT_SHA`), pas un `1.0.0` manuel.
- Le front (Nuxt/Next) aura son propre `Sentry.init` avec source maps uploadées au build ; les events front et back partageront le contexte de trace (module 05) pour relier une erreur à sa requête.
- Le scrubbing PII sera durci (module 19) : champs sensibles côté serveur Sentry, rétention, base légale — le `beforeSend` du lab est le socle minimal.

**Commit cible :**
```
feat(obs): intègre Sentry sur l'API TribuZen (capture + release + source maps, contexte sans PII)
```

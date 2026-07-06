---
titre: Error tracking avec Sentry
cours: 16-observability-sre
notions: ["error tracking vs logging", "capture d'exceptions (captureException / captureMessage)", "\"@sentry/node\" & instrument first", "breadcrumbs (fil d'Ariane)", "releases & source maps (Debug IDs)", "fingerprint / grouping en issues", "contexte utilisateur sans PII", "beforeSend (filtrage)", "alerting (first seen / regression / spike)", "lien error tracking / traces"]
outcomes:
  - sait distinguer error tracking et logging, et dire quand chacun sert
  - sait capturer une exception avec contexte (user, tags, breadcrumbs) dans une API Node
  - sait lier une release à ses source maps pour désobfusquer une stack en prod
  - sait personnaliser le fingerprint pour contrôler le regroupement en issues
  - sait poser un beforeSend qui envoie les erreurs sans fuiter de PII
prerequis: [modules 00-05, dont 01-logging-structure et 04-distributed-tracing]
next: 07-grafana-dashboards
libs: []
tribuzen: API TribuZen (Express/Node) et front — capture d'exceptions Sentry avec release, source maps et contexte utilisateur pseudonymisé
last-reviewed: 2026-07
---

<!-- Vérif API 2026-07 via WebFetch docs.sentry.io (Context7 MORT) :
     - node/ (init instrument-first, captureException) ✓
     - express/ (setupExpressErrorHandler après routes) ✓
     - configuration/releases/ (release "name@version") ✓
     - node/sourcemaps/ (Debug IDs, wizard -i sourcemaps) ✓
     - node/usage/sdk-fingerprinting/ (setFingerprint, {{ default }}) ✓ -->

# Error tracking avec Sentry

> **Outcomes — tu sauras FAIRE :** distinguer error tracking et logging, capturer une exception avec contexte (user, tags, breadcrumbs), lier une release à ses source maps, contrôler le regroupement via le fingerprint, et filtrer la PII avec `beforeSend`.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **l'error tracking** (capture, grouping, releases, source maps, alerting) avec Sentry sur l'API TribuZen. Le **scrubbing PII approfondi** (minimisation, rétention, anonymisation, base légale RGPD) est le **module 19 (rgpd-observabilite)** : ici on pose seulement la règle « aucune PII dans un event » et le `beforeSend` de base. Les **métriques** (Prometheus) sont au module 02, les **traces** (OpenTelemetry) au module 05 — on montre juste le pont entre une erreur Sentry et sa trace. Les **dashboards** viennent au module 07.

## 1. Cas concret d'abord

Dimanche 22 h. Un parent TribuZen t'écrit : « quand je valide le repas partagé, la page devient blanche ». Tu ouvres tes logs structurés (module 01) : rien d'anormal côté API, la requête `POST /api/events/:id/rsvp` renvoie `200`. Le bug est **côté navigateur**, dans le bundle minifié — et tu n'as ni la stack, ni le navigateur, ni ce que le parent a cliqué juste avant.

Tu lui demandes une capture d'écran. Il t'envoie une photo floue de son salon. Tu ne reproduis pas. L'erreur reste invisible pendant trois jours, jusqu'à ce que d'autres parents abandonnent.

Ce qu'il te manque, ce n'est pas *plus de logs* — c'est de l'**error tracking** : un outil qui, au moment où l'exception est levée (front **ou** back), capture automatiquement la stack **désobfusquée**, le contexte (navigateur, release, utilisateur pseudonymisé) et le **fil des actions** qui ont précédé, puis **regroupe** les 400 occurrences identiques en **une seule issue** avec une alerte.

```
Log      → "POST /rsvp a répondu 200"                      (un évènement, côté serveur, aucune trace du crash front)
Erreur   → issue "TypeError: cannot read 'name' of null"   (1 groupe, 412 events, release web@1.4.2,
            + stack désobfusquée + breadcrumbs "clic Valider → GET /meal → render")
```

À la fin du module, une exception dans TribuZen — front ou API — arrive dans Sentry avec sa **stack lisible** (grâce aux source maps liées à la **release**), son **contexte utilisateur sans PII**, ses **breadcrumbs**, et déclenche une **alerte** à la première occurrence. On construit chaque brique, sans deviner une seule méthode du SDK.

---

## 2. Théorie complète, concise

### 2.1 Error tracking vs logging vs APM

Ces trois familles se recouvrent et on les confond souvent. Discrimine-les par leur **question** :

| | Logging (Pino/Loki, module 01) | Error tracking (Sentry) | APM / traces (OTel, module 05) |
|---|---|---|---|
| Question | « que s'est-il passé, ligne par ligne ? » | « **quelles erreurs**, combien, pour qui ? » | « **où passe le temps** dans la requête ? » |
| Unité | une ligne de log | une **issue** (erreurs regroupées) | une trace (spans) |
| Grouping | aucun (texte brut) | **automatique** par stack + type | par transaction/endpoint |
| Contexte | ce que tu ajoutes à la main | **automatique** : release, device, user, breadcrumbs | attributs de span |
| Stack front minifiée | illisible | **désobfusquée** (source maps) | non |
| Alerte typique | count/regex sur logs | *nouvelle* erreur, *régression*, *spike* | latence p95, error rate |

L'error tracking ne **remplace** pas le logging : il répond à une autre question. Un log te raconte le déroulé ; une issue Sentry te dit *qu'une classe d'erreur existe*, *son volume*, *si elle est nouvelle*, et te donne la stack + le contexte pour la corriger. Les deux se corrèlent (§2.9).

### 2.2 Le modèle : event, issue, capture

Un **event** est un signal envoyé au serveur Sentry — le plus souvent une **exception**, parfois un simple **message**. Sentry **regroupe** les events similaires en une **issue** (§2.6). Deux modes de capture :

- **automatique** : les exceptions non gérées (`uncaughtException`, rejets de promesse, erreurs remontées par le middleware d'erreur Express) sont capturées par le SDK sans une ligne de code métier ;
- **manuel** : dans un `catch`, tu appelles `Sentry.captureException(err)` (ou `captureMessage` pour un signal sans exception).

```typescript
// Capture manuelle dans un catch
try {
  await sendInvitationEmail(member);
} catch (err) {
  Sentry.captureException(err); // renvoie un eventId (string)
}

// Message sans exception (niveau: 'warning' | 'error' | 'info'...)
Sentry.captureMessage('Envoi email invitation retardé > 30s', 'warning');
```

### 2.3 Init : `@sentry/node`, chargé EN PREMIER

Vérifié docs Sentry (*Node.js / Getting Started*). Le SDK vit dans un fichier `instrument.(js|mjs|ts)` qui doit être chargé **avant tout autre module**, sinon l'auto-instrumentation (http, Express, requêtes DB) ne patche pas les libs déjà importées.

```typescript
// instrument.ts — chargé EN PREMIER
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,                 // JAMAIS en dur → variable d'env
  environment: process.env.NODE_ENV,           // 'production' | 'staging' | 'development'
  release: process.env.RELEASE,                // ex: 'tribuzen-api@1.4.2' (§2.5)
  tracesSampleRate: 0.2,                        // 20% des transactions perf (le tracing, pas les erreurs)
});
```

Chargement selon le format de module :

```bash
# CommonJS : require en tout premier
#   require('./instrument');  puis  const express = require('express');

# ESM : via le flag --import (le fichier s'exécute avant l'app)
node --import ./instrument.mjs src/index.mjs
```

> **Erreurs vs transactions — deux réglages distincts.** `sampleRate` (défaut `1.0`) échantillonne les **erreurs** : garde 100%, tu ne veux en manquer aucune. `tracesSampleRate` échantillonne les **transactions de performance** : là on sous-échantillonne (0.1–0.2) pour ne pas exploser le volume.

### 2.4 Express : `setupExpressErrorHandler` APRÈS les routes

Vérifié docs Sentry (*Express*). L'ordre est strict : `instrument` en premier, puis les routes, puis `Sentry.setupExpressErrorHandler(app)` **après toutes les routes** mais **avant** tes propres middlewares d'erreur.

```typescript
// src/index.ts
import './instrument';                 // 1. AVANT tout le reste
import express from 'express';
import * as Sentry from '@sentry/node';

const app = express();

// 2. routes métier TribuZen
app.post('/api/events/:id/rsvp', rsvpHandler);
// ...

// 3. handler d'erreur Sentry : APRÈS les routes, AVANT tes error middlewares
Sentry.setupExpressErrorHandler(app);

// 4. ton middleware d'erreur applicatif (réponse JSON propre au client)
app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'internal_error' });
});

app.listen(3000);
```

Si tu inverses (ton handler avant celui de Sentry, ou avant les routes), Sentry ne voit plus les exceptions : elles sont déjà avalées par ton middleware.

### 2.5 Releases & source maps : rendre la stack lisible

Une **release** est un identifiant de version déployée, par convention `nom@version` (ex. `tribuzen-api@1.4.2`). Elle sert deux choses : **rattacher chaque event à une version** (« ce bug est apparu en 1.4.2 ») et surtout **associer les source maps**.

En prod, le JS est **minifié** : sans source maps, la stack est `a.b is not a function` à `bundle.min.js:1:24187` — inexploitable. Les **source maps** retraduisent vers le code original. Sentry doit les recevoir **au build** et les lier à la release.

Vérifié docs (*Node / Source Maps*) : la méthode moderne repose sur les **Debug IDs** — un identifiant injecté dans le bundle **et** dans sa source map, qui les apparie sans dépendre d'un nom de release exact. Setup assisté :

```bash
# Assistant officiel : configure le plugin bundler + l'upload en CI
npx @sentry/wizard@latest -i sourcemaps
# → installe @sentry/<bundler>-plugin, active build.sourcemap, câble l'upload
```

Points vérifiés :
- les source maps sont **générées et uploadées au build de prod**, pas en dev ;
- l'upload s'authentifie via `SENTRY_AUTH_TOKEN` (secret CI, jamais commité) ;
- avec les Debug IDs, l'appariement bundle ↔ source map est automatique ; la release reste utile pour le **suivi de version** et les **régressions** (§2.6).

> Ne **déploie pas** les `.map` publiquement sur ton CDN : uploade-les à Sentry au build, puis retire-les de l'output servi. Une source map publique expose ton code source.

### 2.6 Fingerprint & grouping

Par défaut, Sentry regroupe les events par **stack trace + type d'erreur** en une **issue**. Ce regroupement automatique suffit dans 90% des cas. Deux situations le mettent en défaut, et on **personnalise** alors le **fingerprint** (tableau de chaînes).

Vérifié docs (*SDK Fingerprinting*). Le placeholder spécial `{{ default }}` (inline `` `{{ default }}` ``) représente le hash calculé par défaut :

- **regrouper trop peu** (une seule vraie cause éclatée en 50 issues, ex. un message contenant un ID variable) → on **remplace** par une clé stable :

```typescript
// Toutes les erreurs de timeout du service email = UNE issue
Sentry.withScope((scope) => {
  scope.setFingerprint(['email-timeout', emailProvider]);
  Sentry.captureException(err);
});
```

- **regrouper trop** (deux causes différentes fusionnées) → on **affine** en gardant le défaut + un discriminant :

```typescript
// Repartir du grouping par défaut, mais séparer par route + code HTTP
Sentry.withScope((scope) => {
  scope.setFingerprint(['{{ default }}', route, String(statusCode)]);
  Sentry.captureException(err);
});
```

Règle : **inclure `` `{{ default }}` ``** = affiner le grouping natif ; **l'omettre** = tout remplacer par ta clé (regroupement agressif). Une issue a un cycle de vie — *unresolved* → *resolved* → et si elle réapparaît dans une release ultérieure, Sentry lève une **régression** (l'alerte la plus précieuse).

### 2.7 Breadcrumbs : le fil d'Ariane avant le crash

Les **breadcrumbs** sont la trace des actions ayant **précédé** l'erreur. Le SDK en capture automatiquement (requêtes HTTP sortantes, logs console, navigation et clics côté front). Tu en ajoutes des **métier** :

```typescript
Sentry.addBreadcrumb({
  category: 'rsvp',
  message: `Membre a ouvert le formulaire RSVP de l'évènement`,
  level: 'info',
  data: { eventId, source: 'email-link' }, // pas de nom/email ici (§2.8)
});
```

Quand l'exception part, l'issue montre la séquence : `clic "Valider"` → `GET /api/events/42/meal → 500` → `TypeError`. C'est souvent ce qui donne la cause en 10 secondes, là où un log isolé ne dit rien.

### 2.8 Contexte utilisateur — sans PII

Attacher **qui** a rencontré l'erreur permet de mesurer l'impact (« 3 users » vs « 3000 users ») et de reproduire. Mais un event Sentry **ne doit pas contenir de PII** (nom, email, IP en clair). On identifie l'utilisateur par un **pseudonyme stable** (l'`id` interne), pas par ses données personnelles.

```typescript
// ✅ pseudonyme : id opaque, réversible seulement côté base
Sentry.setUser({ id: member.id });

// ❌ PII directe dans l'event — à éviter
Sentry.setUser({ id: member.id, email: member.email, username: member.fullName });
```

Distinguer deux porteurs de contexte :
- **tags** : indexés, **filtrables/cherchables** — dimensions à faible cardinalité (`environment`, `feature_flag`, `tenant`). `Sentry.setTag('feature_flag', 'rsvp_v2')`.
- **context** : non indexé, affiché dans le détail — données riches (`scope.setContext('rsvp', { eventId, step })`). Jamais d'ID direct type email en label indexé (même logique cardinalité qu'au module 02).

Le filet de sécurité global est **`beforeSend`** : un hook appelé avant chaque envoi, qui peut **modifier** l'event ou le **supprimer** (`return null`).

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    if (process.env.NODE_ENV === 'development') return null; // rien en dev
    delete event.request?.cookies;                            // pas de cookies
    if (event.request?.headers) delete event.request.headers['authorization'];
    return event;
  },
});
```

> Le scrubbing PII **complet** (minimisation, champs sensibles côté serveur, rétention, base légale) est traité au **module 19**. Ici : `id` pseudonyme + `beforeSend` qui coupe cookies/authorization/dev.

### 2.9 Lien avec les traces

Depuis la v8, le SDK Node de Sentry s'appuie sur **OpenTelemetry** (module 05) pour le tracing. Conséquence utile : un event d'erreur porte le **contexte de trace** courant, donc une issue peut renvoyer à **la trace de la requête** qui a échoué. Tu passes de « voici l'erreur » à « voici, dans la même requête, le span DB à 3 s qui l'a causée » sans changer d'outil. On garde ce pont léger ici ; l'instrumentation OTel elle-même est le module 05, la corrélation logs↔traces le module 01.

---

## 3. Worked examples

### Exemple 1 — capturer une exception métier avec contexte (API TribuZen)

Objectif : dans le handler RSVP, capturer proprement une erreur d'écriture DB avec breadcrumb, user pseudonyme et fingerprint par route — sans avaler l'erreur.

```typescript
// src/routes/rsvp.ts
import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

export async function rsvpHandler(req: Request, res: Response, next: NextFunction) {
  const memberId = req.auth.memberId;   // pseudonyme interne, pas d'email
  const eventId = req.params.id;

  // 1. contexte utilisateur SANS PII (impact mesurable, reproductible)
  Sentry.setUser({ id: memberId });

  // 2. breadcrumb métier : ce que l'utilisateur tentait
  Sentry.addBreadcrumb({
    category: 'rsvp',
    message: 'Confirmation de présence',
    level: 'info',
    data: { eventId, status: req.body.status }, // pas de nom/email
  });

  try {
    const rsvp = await saveRsvp(eventId, memberId, req.body.status);
    res.json(rsvp);
  } catch (err) {
    // 3. fingerprint : garder le grouping par défaut, mais séparer par route
    //    → les erreurs RSVP ne se mélangent pas avec les erreurs d'autres routes
    Sentry.withScope((scope) => {
      scope.setTag('route', 'rsvp');
      scope.setFingerprint(['{{ default }}', 'rsvp']);
      Sentry.captureException(err); // renvoie un eventId si tu veux le logguer
    });

    // 4. NE PAS avaler : on relaie au middleware d'erreur (réponse 500 propre)
    next(err);
  }
}
```

Pourquoi c'est correct : l'utilisateur est identifié par un **id opaque** (mesure d'impact sans PII), le breadcrumb raconte l'intention, le fingerprint évite que RSVP se noie dans un groupe fourre-tout, et `next(err)` laisse `setupExpressErrorHandler` + ton middleware faire leur travail. L'erreur n'est **pas** silencieusement absorbée.

### Exemple 2 — release + source maps de bout en bout (front TribuZen)

Objectif : qu'un `TypeError` du bundle minifié arrive dans Sentry avec une **stack lisible**, rattachée à la release `tribuzen-web@1.4.2`.

```bash
# 1. (une fois) configurer l'upload des source maps via le plugin bundler
npx @sentry/wizard@latest -i sourcemaps
#    → ajoute le plugin Sentry au bundler, active les source maps, câble l'upload CI
```

```typescript
// 2. init front — release identique à celle du build
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  release: `tribuzen-web@${import.meta.env.VITE_APP_VERSION}`, // ex: 1.4.2
  tracesSampleRate: 0.1,
});
```

```bash
# 3. build de PROD (le plugin génère + uploade les .map, injecte les Debug IDs)
#    SENTRY_AUTH_TOKEN vient du secret CI, jamais du dépôt
SENTRY_AUTH_TOKEN=$CI_SENTRY_TOKEN npm run build
```

Résultat : quand le composant plante en prod, l'issue Sentry montre `MealForm.vue:57 — cannot read 'name' of null`, taggée `release: tribuzen-web@1.4.2` — plus la photo floue du salon. Et si tu marques l'issue *resolved* puis qu'elle revient en `1.5.0`, Sentry lève une **régression**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — croire que l'error tracking remplace les logs

Sentry répond « quelles erreurs, combien, pour qui », **pas** « déroulé complet de la requête ». Tu gardes tes logs structurés (module 01) pour l'audit et le debug fin, et Sentry pour le **grouping + alerte + stack désobfusquée**. Envoyer *tous* tes logs à Sentry en events est un anti-pattern (volume, coût, bruit).

### PIÈGE #2 — `init` (ou l'import de `instrument`) pas en premier

Si `instrument` est importé **après** Express ou la lib DB, l'auto-instrumentation ne patche pas ces modules déjà chargés : plus de capture auto ni de contexte de requête. Réflexe : `instrument` est **le tout premier import** (CommonJS `require('./instrument')`) ou chargé via `--import` (ESM).

### PIÈGE #3 — `setupExpressErrorHandler` mal placé

```typescript
// ❌ ton middleware d'erreur AVANT celui de Sentry → Sentry ne voit rien
app.use(myErrorHandler);
Sentry.setupExpressErrorHandler(app);

// ✅ Sentry d'abord (après les routes), ton handler ensuite
Sentry.setupExpressErrorHandler(app);
app.use(myErrorHandler);
```

L'exception est capturée par le **premier** middleware d'erreur qui la traite. Si le tien répond avant, Sentry n'a jamais l'event.

### PIÈGE #4 — pas de source maps → stack illisible, ou `.map` exposées

Deux versants du même piège. Sans upload de source maps, la stack de prod est minifiée et inutile. Mais **servir** les `.map` sur ton CDN public expose ton code source : la bonne pratique est de les **uploader à Sentry au build** et de les **retirer** de l'output servi.

### PIÈGE #5 — de la PII dans l'event

`setUser({ email, username })`, un breadcrumb contenant le message privé d'un parent, un payload avec numéro de téléphone : tout ça part chez Sentry. Règle : **`id` pseudonyme uniquement**, `beforeSend` qui coupe cookies/authorization, et rien de nominatif dans les breadcrumbs/context. Le traitement RGPD complet est le **module 19**.

### PIÈGE #6 — capturer les erreurs *attendues*

Un `404`, une erreur de validation de formulaire, une 401 : ce ne sont **pas** des incidents. Les envoyer en events pollue les issues et noie les vraies régressions. Filtre-les (`beforeSend` ou ne les capture pas). Sentry est pour l'**inattendu**.

### PIÈGE #7 — confondre `sampleRate` et `tracesSampleRate`

`sampleRate` (erreurs) → laisse à `1.0`, tu veux **toutes** les erreurs. `tracesSampleRate` (transactions perf) → **0.1–0.2**, sinon le volume de spans explose le budget. Baisser `sampleRate` pour « réduire le coût » te fait rater des erreurs — mauvaise variable.

---

## 5. Ancrage TribuZen

Sentry devient le **filet d'erreurs** de TribuZen, back **et** front, posé sur les fondations logs (01) et traces (05).

| Où | Ce qu'on capture | Contexte attaché |
|---|---|---|
| API (`instrument.ts`) | exceptions non gérées + `captureException` dans les `catch` critiques (RSVP, paiement, envoi email) | `user.id` pseudonyme, `release=tribuzen-api@x.y.z`, fingerprint par route |
| Front (Nuxt/Next) | erreurs de rendu, promesses rejetées, erreurs réseau | `release=tribuzen-web@x.y.z`, source maps liées, breadcrumbs clics/navigation |
| Les deux | `beforeSend` coupe cookies/authorization, rien en dev | tags `environment`, `feature_flag` |

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  apps/
    api/
      instrument.ts        ← Sentry.init (dsn env, release, environment, beforeSend)
      src/routes/rsvp.ts    ← setUser(id) + breadcrumb + captureException (Exemple 1)
      src/index.ts          ← import './instrument' EN PREMIER, setupExpressErrorHandler après routes
    web/
      sentry.client.ts      ← Sentry.init front, release = version du build
      bundler.config.ts     ← plugin Sentry : source maps uploadées au build, retirées du servi
```

Le `feature_flag` en tag illustre le pont avec le module 05 : quand une régression frappe, filtrer les issues par `release` **et** `feature_flag` isole en secondes le déploiement fautif — et le contexte de trace attaché à l'event mène directement au span coupable.

> Les **dashboards** (visualiser le taux d'erreur), l'**alerting** avancé (burn-rate) et le **RGPD** complet viennent aux modules 07, 09 et 19. Ici, on garantit qu'une erreur TribuZen **arrive, lisible, groupée et sans PII**.

---

## 6. Points clés

1. **Error tracking ≠ logging** : Sentry répond « quelles erreurs, combien, pour qui », avec grouping + stack désobfusquée + alerte ; le log garde le déroulé fin.
2. Un **event** (exception ou message) est regroupé en **issue** ; capture **auto** (non gérées) ou **manuelle** (`captureException` / `captureMessage`).
3. `@sentry/node` s'initialise dans `instrument`, chargé **EN PREMIER** (CommonJS `require` d'abord, ESM `--import`), sinon l'auto-instrumentation ne patche rien.
4. Express : `Sentry.setupExpressErrorHandler(app)` **après les routes**, **avant** tes middlewares d'erreur.
5. Une **release** (`nom@version`) rattache les events à une version et **lie les source maps** (Debug IDs) pour désobfusquer la stack ; source maps uploadées au **build de prod** via `SENTRY_AUTH_TOKEN`, jamais servies publiquement.
6. Le **fingerprint** contrôle le grouping : `` `{{ default }}` `` + discriminant = affiner ; l'omettre = regrouper agressivement.
7. **Breadcrumbs** = fil des actions avant le crash (auto + métier) ; souvent la clé de la cause.
8. Contexte utilisateur = **`id` pseudonyme uniquement**, jamais email/nom ; `tags` filtrables, `context` riche non indexé ; `beforeSend` = filet anti-PII (RGPD complet → module 19).
9. `sampleRate` (erreurs) reste à `1.0` ; `tracesSampleRate` (perf) à 0.1–0.2 — deux réglages à ne pas confondre.
10. Depuis la v8, le SDK Node repose sur OpenTelemetry : une issue peut renvoyer à la **trace** de la requête fautive (module 05).

---

## 7. Seeds Anki

```
Error tracking vs logging : quelle est la différence de question ?|Le logging répond "que s'est-il passé, ligne par ligne" (déroulé, aucun grouping). L'error tracking (Sentry) répond "quelles erreurs, combien, pour qui" : events regroupés en issues, stack désobfusquée, contexte auto (release/user/breadcrumbs), alerte nouvelle erreur/régression. Complémentaires, pas substituables.
Pourquoi importer instrument (Sentry.init) EN PREMIER ?|L'auto-instrumentation patche http, Express, la lib DB au chargement. Si instrument est importé après ces modules, ils sont déjà chargés et non patchés : plus de capture auto ni de contexte de requête. CommonJS : require('./instrument') d'abord. ESM : node --import ./instrument.mjs.
Où placer Sentry.setupExpressErrorHandler dans Express ?|Après TOUTES les routes, mais AVANT tes propres middlewares d'erreur. Sinon ton handler traite l'exception en premier et Sentry ne voit jamais l'event.
À quoi sert une release et comment lie-t-elle les source maps ?|Une release (nom@version, ex tribuzen-web@1.4.2) rattache chaque event à une version et permet la détection de régression. Elle lie les source maps (via Debug IDs injectés au build) pour désobfusquer la stack minifiée de prod. Source maps uploadées au build via SENTRY_AUTH_TOKEN, jamais servies publiquement.
Que fait le fingerprint et le rôle de {{ default }} ?|Le fingerprint (tableau de chaînes) contrôle le regroupement en issues. Inclure {{ default }} = repartir du grouping natif et l'affiner avec un discriminant. L'omettre = remplacer entièrement le grouping par ta clé (regroupement agressif). Utilisé quand le grouping auto sépare trop ou fusionne trop.
Que sont les breadcrumbs ?|Le fil d'Ariane des actions ayant précédé l'erreur (requêtes HTTP, console, clics/navigation en auto + breadcrumbs métier ajoutés). L'issue affiche la séquence menant au crash, souvent la clé de la cause.
Comment attacher un utilisateur à une erreur sans fuiter de PII ?|Sentry.setUser({ id }) avec un id pseudonyme interne uniquement — jamais email/nom/username. beforeSend en filet : supprimer cookies, header authorization, ne rien envoyer en dev. Scrubbing RGPD complet = module 19.
Différence entre sampleRate et tracesSampleRate ?|sampleRate échantillonne les ERREURS : garder 1.0 (ne rien manquer). tracesSampleRate échantillonne les TRANSACTIONS de performance (tracing) : 0.1-0.2 pour ne pas exploser le volume/coût. Ne pas confondre : baisser sampleRate fait rater des erreurs.
Faut-il capturer les 404 et erreurs de validation dans Sentry ?|Non. Ce sont des erreurs attendues, pas des incidents. Les envoyer pollue les issues et noie les vraies régressions. Sentry sert l'inattendu ; filtre-les via beforeSend ou ne les capture pas.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-06-error-tracking-sentry/README.md`. Intégrer Sentry dans l'API TribuZen (demo-app) : init `instrument` en premier, capture d'exception avec user pseudonyme + breadcrumb + fingerprint, une release et l'upload des source maps — corrigé complet commenté, coach en session, variante J+30.

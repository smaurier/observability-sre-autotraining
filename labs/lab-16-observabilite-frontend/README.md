# Lab 16 — Observabilité frontend

> **Outcome :** à la fin, tu sais instrumenter un front réel pour collecter les **Core Web Vitals** des vrais utilisateurs avec `web-vitals`, capturer les **erreurs client** non gérées (`error` / `unhandledrejection`), tout envoyer au backend via `navigator.sendBeacon`, et relier chaque évènement à une **session** — le tout sans deviner une seule API navigateur.
> **Vrai outil :** la librairie **`web-vitals`** (Google) + les API navigateur natives (`PerformanceObserver`, `sendBeacon`) dans une vraie page servie par Vite, et un petit endpoint Node qui reçoit les beacons. Aucun harnais simulé.
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur. Tes oracles : l'onglet **Network** des DevTools (les beacons partent-ils ?), la **console** du serveur (les payloads arrivent-ils ?), et le panneau **Performance** / l'extension *Web Vitals*.

---

## Énoncé

Tu reprends le cas concret du module : le backend TribuZen est **vert**, mais des parents signalent une appli « qui rame sur mobile » et un bouton *Confirmer* « qui ne fait rien ». Tu vas rendre le **front** observable pour trancher.

Tu dois :

1. **Collecter les Core Web Vitals réels** (LCP, INP, CLS) avec `web-vitals` et les envoyer à `/api/rum/vitals`.
2. **Capturer les erreurs client** non gérées (`window` `'error'` **et** `'unhandledrejection'`) et les envoyer à `/api/rum/errors`.
3. **Utiliser `navigator.sendBeacon`** comme transport (survit à la fermeture d'onglet), pas un `fetch` nu.
4. **Attacher un `sessionId`** stable à chaque évènement pour corréler Vitals et erreurs d'une même visite.
5. **Éviter les pièges** : pas de code client au SSR (ici page statique, mais tu nommes correctement), route templatisée côté serveur (pas d'URL brute en clé), reconnaître `"Script error."`.

**Pas de gap-fill** — tu écris l'instrumentation complète à partir du starter minimal.

### Starter minimal

Un dossier de travail (hors du repo cours ou dans un scratch) :

```
tribuzen-rum-lab/
  index.html
  src/rum.ts
  server.mjs
  package.json
```

```jsonc
// package.json
{
  "type": "module",
  "dependencies": {
    "web-vitals": "^4",
    "express": "^4"
  },
  "devDependencies": {
    "vite": "^5"
  }
}
```

```html
<!-- index.html — page TribuZen minimale, avec de quoi provoquer Vitals et erreurs -->
<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><title>TribuZen — planning</title></head>
  <body>
    <!-- Élément LCP : une grosse image (mets une vraie image lourde pour voir bouger le LCP) -->
    <img src="/planning-hero.jpg" width="800" alt="planning familial" />
    <h1>Planning familial</h1>

    <!-- Bouton qui PLANTE volontairement : lève une erreur non gérée au clic -->
    <button id="confirm">Confirmer ma présence</button>

    <!-- Bouton qui rejette une promesse sans .catch -->
    <button id="rsvp">RSVP (fetch cassé)</button>

    <script type="module" src="/src/rum.ts"></script>
    <script type="module">
      // Bugs volontaires pour générer des erreurs client à observer
      document.getElementById('confirm').addEventListener('click', () => {
        const data = undefined
        // TypeError: Cannot read properties of undefined → window 'error'
        console.log(data.rsvp.status)
      })
      document.getElementById('rsvp').addEventListener('click', () => {
        // Promesse rejetée sans catch → 'unhandledrejection'
        fetch('/api/does-not-exist').then((r) => { if (!r.ok) throw new Error('RSVP 404') })
      })
    </script>
  </body>
</html>
```

```ts
// src/rum.ts — STARTER (à compléter)
// TODO: importer onLCP, onINP, onCLS depuis 'web-vitals'

// TODO: une fonction sessionId() — crypto.randomUUID() mémorisé en sessionStorage

// TODO: une fonction sendVital(metric) qui POST via navigator.sendBeacon('/api/rum/vitals', ...)
//        payload = { name, value, rating, id, sid, path }

// TODO: brancher onLCP / onINP / onCLS sur sendVital

// TODO: window.addEventListener('error', ...) → /api/rum/errors
//        (gérer le cas "Script error." cross-origin séparément)

// TODO: window.addEventListener('unhandledrejection', ...) → /api/rum/errors
```

```js
// server.mjs — endpoint qui reçoit et LOG les beacons (fourni, ne pas modifier au début)
import express from 'express'
const app = express()
// sendBeacon envoie du text/plain par défaut → on parse le corps brut
app.use(express.text({ type: '*/*' }))

app.post('/api/rum/vitals', (req, res) => {
  console.log('VITAL  ', req.body)
  res.status(204).end() // sendBeacon ne lit pas la réponse
})
app.post('/api/rum/errors', (req, res) => {
  console.log('ERROR  ', req.body)
  res.status(204).end()
})
app.listen(8787, () => console.log('RUM sink sur http://localhost:8787'))
```

> **Astuce dev :** lance Vite (`npx vite`) pour la page **et** `node server.mjs` pour le sink, avec un proxy Vite de `/api` vers `http://localhost:8787` (`server.proxy` dans `vite.config.js`). Ou sers tout depuis Express. L'important : voir les beacons **partir** (Network) et **arriver** (console serveur).

---

## Étapes (en friction)

1. **Installe et sers la page** (`npm i`, `npx vite`). Ouvre-la, ouvre les DevTools (Network + Console).
2. **Écris `sessionId()`** — lis `sessionStorage.getItem('tz_sid')` ; s'il est absent, `crypto.randomUUID()` puis `setItem`. Retourne l'id.
3. **Écris `sendVital(metric)`** — construis `{ name, value, rating, id, sid: sessionId(), path: location.pathname }` et `navigator.sendBeacon('/api/rum/vitals', JSON.stringify(payload))`.
4. **Branche `onLCP`, `onINP`, `onCLS`** sur `sendVital`. Recharge, **interagis** (clique, scrolle) puis **change d'onglet** (le LCP/CLS/INP se finalisent au `visibilitychange`) → observe les beacons partir.
5. **Écris le handler `window 'error'`** — d'abord le cas `event.message === 'Script error.' && !event.filename` (tag `cross-origin`, on sort), sinon envoie `{ kind, message, stack: event.error?.stack, line, col, sid, path }`.
6. **Écris le handler `unhandledrejection`** — envoie `{ kind: 'unhandledrejection', reason: String(event.reason), sid }`.
7. **Déclenche les bugs** — clique *Confirmer* (→ `error`) et *RSVP* (→ `unhandledrejection`). Vérifie côté serveur que les deux erreurs arrivent **avec le même `sid`** que les Vitals.
8. **Vérifie le transport** — dans Network, filtre par type *beacon*/ *fetch* : le POST doit partir même si tu fermes l'onglet juste après (teste avec `sendBeacon` vs un `fetch` nu pour voir la différence).
9. **Piège cardinalité** — côté serveur, imagine templatiser `path` (`/famille/:id/planning`) avant d'en faire une clé de métrique. Explique au coach pourquoi l'URL brute serait une bombe.

---

## Corrigé complet commenté

```ts
// src/rum.ts — CORRIGÉ
import { onLCP, onINP, onCLS, type Metric } from 'web-vitals'

// --- Session : un id stable pour toute la visite → regroupe Vitals + erreurs ---
function sessionId(): string {
  let id = sessionStorage.getItem('tz_sid')
  if (!id) {
    id = crypto.randomUUID()            // API navigateur native, pas de lib
    sessionStorage.setItem('tz_sid', id)
  }
  return id
}

// --- Transport : sendBeacon survit à la fermeture d'onglet (POST garanti) ---
function beacon(url: string, data: unknown): void {
  navigator.sendBeacon(url, JSON.stringify(data))
}

// --- Web Vitals : on N'implémente PAS la mesure, web-vitals s'en charge ---
function sendVital(metric: Metric): void {
  beacon('/api/rum/vitals', {
    name: metric.name,      // 'LCP' | 'INP' | 'CLS'
    value: metric.value,
    rating: metric.rating,  // good | needs-improvement | poor (seuils p75 Google)
    id: metric.id,          // unique par mesure → dédoublonnage côté backend
    sid: sessionId(),
    path: location.pathname, // le SERVEUR templatisera (cardinalité)
  })
}

// Chaque callback peut être rappelé (surtout CLS/INP) : web-vitals gère le "bon moment".
onLCP(sendVital)
onINP(sendVital)
onCLS(sendVital)

// --- Erreurs synchrones non capturées ---
window.addEventListener('error', (event: ErrorEvent) => {
  // Piège cross-origin : script tiers sans CORS → message masqué, pas de stack.
  // Ce n'est PAS un bug de notre code : on le compte à part, on ne pollue pas le flux.
  if (event.message === 'Script error.' && !event.filename) {
    beacon('/api/rum/errors', { kind: 'cross-origin-script', hidden: true, sid: sessionId() })
    return
  }
  beacon('/api/rum/errors', {
    kind: 'error',
    message: event.message,
    stack: event.error?.stack,   // event.error porte l'objet Error → stack (lisible avec source maps)
    line: event.lineno,
    col: event.colno,
    sid: sessionId(),
    path: location.pathname,
  })
})

// --- Promesses rejetées sans .catch (le fetch RSVP cassé) ---
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  beacon('/api/rum/errors', {
    kind: 'unhandledrejection',
    reason: String(event.reason),
    sid: sessionId(),
    path: location.pathname,
  })
})
```

**Pourquoi ce corrigé est correct :**
- **`web-vitals` fait la mesure** : le LCP se finalise à la 1re interaction, l'INP/CLS au `visibilitychange`. Coder ça à la main donnerait des valeurs fausses.
- **`sendBeacon`** garantit l'envoi même quand le parent ferme l'onglet ; un `fetch` nu serait annulé et la mesure perdue.
- **Le même `sid`** relie « LCP 4,8 s sur `/planning` » et « `TypeError` au clic *Confirmer* » à une seule visite : c'est le récit que le cas concret réclamait.
- **`"Script error."` traité à part** : sans `crossorigin` + CORS côté CDN, ces erreurs sont inexploitables — les mélanger fausserait le comptage.
- **`path` envoyé brut mais templatisé côté serveur** : `observe({ route: '/famille/:id/planning' })` et non `/famille/42/planning`, sinon une série de métrique par famille (bombe de cardinalité, module 02).

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Mesure CWV | via `web-vitals` (`onLCP/onINP/onCLS`) | `PerformanceObserver` maison qui donne un LCP faux |
| Transport | `sendBeacon` (ou `fetch keepalive`), envoi survit à l'unload | `fetch` nu → beacon annulé à la fermeture |
| Erreurs | `error` **et** `unhandledrejection` branchés | un seul des deux, promesses rejetées ignorées |
| Cross-origin | `"Script error."` détecté et compté à part | traité comme une erreur normale (stack vide trompeuse) |
| Corrélation | `sessionId` stable attaché à chaque évènement | pas de session, impossible de relier Vitals ↔ erreurs |
| Cardinalité | `path` templatisé avant clé de métrique | URL brute (`/famille/42/...`) en label |
| SSR-safety | code client isolé (`.client` / `instrumentation-client`) | `window` touché au SSR → crash |

### Coach — questions de vérification en session

- « Montre-moi un beacon Vitals dans Network. Pourquoi part-il **après** que tu changes d'onglet, pas au chargement ? » (attendu : LCP/INP/CLS se finalisent au `visibilitychange`)
- « Pourquoi `sendBeacon` et pas `fetch` ici ? » (attendu : survit à l'unload)
- « Tu cliques *RSVP* : quel handler se déclenche, `error` ou `unhandledrejection` ? Pourquoi ? »
- « Tu vois `"Script error."` sans stack : d'où ça vient, et est-ce ton code ? » (attendu : script tiers cross-origin, CORS)
- « Vitals et erreurs partagent le même `sid` : qu'est-ce que ça te permet de raconter sur cette visite ? »
- « Le backend fait `observe({ route: path })`. Que se passe-t-il si `path` est `/famille/42/planning` pour 5 000 familles ? » (attendu : cardinalité → OOM Prometheus)

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reproduis l'instrumentation **de mémoire, en 30 min**, mais cette fois dans un **plugin Nuxt `rum.client.ts`** (le vrai point d'entrée client) — pas une page statique.
2. Ajoute la **propagation de trace** : sur un `fetch('/api/events/:id/rsvp')` déclenché par un bouton, injecte un en-tête `traceparent` (`00-<traceId>-<spanId>-01`, `traceId` = 32 hex, `spanId` = 16 hex) et `keepalive: true`. Vérifie que le serveur le reçoit.
3. Ajoute `onTTFB` et `onFCP` au flux, et explique au coach pourquoi le TTFB relie le front au réseau/serveur.
4. **Piège volontaire à éviter :** ne mets **pas** `PerformanceObserver` côté serveur du plugin. Explique en une phrase pourquoi `.client.ts` est obligatoire.

**Critère de réussite :** les Web Vitals arrivent au sink, les deux types d'erreurs aussi, le `traceparent` est présent dans le `fetch` RSVP côté serveur, et zéro `window is not defined` au démarrage Nuxt.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette instrumentation vit ici :

```
tribuzen/
  plugins/
    rum.client.ts          ← web-vitals + sessionId (Corrigé)
    errors.client.ts       ← window 'error' / unhandledrejection
  server/
    api/rum/
      vitals.post.ts       ← beacon → histogram Prometheus (module 02)
      errors.post.ts       ← beacon → Sentry / log structuré (module 06)
```

**Différences avec le lab :**
- Le sink de démo (`console.log`) devient un vrai endpoint qui **transforme le beacon en histogramme Prometheus** (`tribuzen_web_vital{name, rating, route}`) exploité au **p75** par route en PromQL.
- Les erreurs sont **enrichies puis envoyées à Sentry** (release, source maps privées, breadcrumbs, session replay) — c'est le **module 06**.
- La propagation `traceparent` passe par **OpenTelemetry Web** (`@opentelemetry/instrumentation-fetch`) plutôt qu'un header manuel, pour relier automatiquement le clic à la trace backend (**modules 04-05**).
- L'**optimisation** des Vitals mesurés (planning mobile à 4,8 s) est un chantier **cours 11 (performance web)** — ici on ne fait que **constater** et **remonter**.

**Commit cible :**
```
feat(observability): instrumente le front — web-vitals + erreurs client → backend, session corrélée
```

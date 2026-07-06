---
titre: Observabilité frontend
cours: 16-observability-sre
notions: ["RUM (Real User Monitoring) vs monitoring synthétique", "Core Web Vitals côté observabilité (LCP / INP / CLS)", "web-vitals (onLCP / onINP / onCLS / onFCP / onTTFB)", "objet Metric (name, value, delta, id, rating, attribution)", "PerformanceObserver (type + buffered)", "erreurs client (window 'error' / unhandledrejection)", "Script error. cross-origin", "navigator.sendBeacon vs fetch keepalive", "instrumentation front Nuxt (plugin .client) / Next (instrumentation-client)", "session côté client & propagation W3C traceparent"]
outcomes:
  - sait expliquer ce que le RUM capture que le monitoring backend et synthétique ne voient pas
  - sait collecter les Core Web Vitals réels avec la librairie web-vitals et les envoyer au backend
  - sait capturer les erreurs client non gérées (window 'error', unhandledrejection) et reconnaître le piège cross-origin
  - sait instrumenter le front Nuxt et Next au bon point d'entrée et propager le traceparent client vers le backend
prerequis: ["modules 00-15 du cours (3 piliers, logs, métriques, tracing, OTel, Sentry, SLO)", "module 04 — distributed tracing & propagation W3C", "module 05 — OpenTelemetry SDK & OTLP", "module 06 — error tracking Sentry"]
next: 17-apm-et-profiling
libs: []
tribuzen: observer le front TribuZen chez les vrais parents — Web Vitals réels par appareil, erreurs client remontées, session tracée du clic jusqu'à l'API
last-reviewed: 2026-07
---

# Observabilité frontend

> **Outcomes — tu sauras FAIRE :** distinguer RUM et synthétique, collecter les Core Web Vitals réels avec `web-vitals`, capturer les erreurs client non gérées (`error` / `unhandledrejection`), instrumenter le front Nuxt/Next au bon point d'entrée et propager le `traceparent` du clic jusqu'à l'API.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre l'**observabilité côté client** — *collecter* ce qui se passe dans le navigateur des vrais utilisateurs et le *corréler* avec le backend. L'**optimisation** détaillée des Core Web Vitals (preload, `fetchpriority`, images AVIF, budgets Lighthouse en CI, waterfall de chargement) relève de la **performance web** et est traitée au **cours 11 (HTTP & performance)** — on y renvoie. Ici : d'où viennent les données, comment on les mesure sans les deviner, et comment elles rejoignent la stack d'observabilité (modules 04-06). Le backend Nuxt/Next (spans SSR, API routes, OTel Node) a été vu au **module 05** ; ce module regarde le **navigateur**.

## 1. Cas concret d'abord

Lundi matin, le tableau de bord backend de TribuZen est **vert** : API p99 à 90 ms, zéro 5xx, `up = 1` partout. Pourtant trois parents ont écrit ce week-end : « l'appli rame quand j'ouvre le planning familial sur mon téléphone » et « j'ai cliqué *Confirmer* et il ne s'est rien passé ».

Tu as toute l'observabilité **serveur** (logs module 01, métriques 02, traces 04-05). Mais le serveur répond vite à une requête… **qui n'arrive parfois jamais**, ou dont le résultat plante dans le navigateur avant d'être affiché. Le backend est aveugle sur :

```
Utilisateur → NAVIGATEUR  →  réseau  →  Serveur (déjà instrumenté)  → DB
              ^^^^^^^^^^^                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              angle mort :              logs / métriques / traces = OK
              rendu, interactions,
              erreurs JS, appareil réel
```

Ce qui manque, c'est l'**observabilité frontend** — le *Real User Monitoring* :

- le **LCP** du planning est à 4,8 s sur un Android d'entrée de gamme en 4G, alors qu'il est à 1,2 s sur ton MacBook ;
- le clic sur *Confirmer* lève une `TypeError` non gérée qui n'atteint jamais le serveur — donc aucun log backend ;
- l'**INP** (latence d'interaction) explose à 600 ms sur la page famille à cause d'un long task JS.

À la fin de ce module, le front TribuZen enverra ses **Web Vitals réels**, ses **erreurs client** et sa **session tracée** vers le backend, et tu pourras répondre : « le serveur va bien, c'est le rendu mobile qui souffre, et voici l'erreur exacte du bouton *Confirmer* ». On construit ça sans deviner une seule API navigateur.

---

## 2. Théorie complète, concise

### 2.1 RUM vs monitoring synthétique

Deux façons de mesurer l'expérience front, complémentaires :

| | **RUM** (Real User Monitoring) | **Synthétique** |
|---|---|---|
| Source | vrais utilisateurs, vrais appareils/réseaux | robot (Lighthouse, sonde) dans un environnement fixe |
| Couvre | la diversité réelle (mobile bas de gamme, 3G, extensions) | un scénario reproductible, en labo |
| Quand | en continu, en production | en CI / à intervalle régulier |
| Angle mort | pas de contrôle du scénario, données bruitées | ne voit pas la longue traîne des vrais appareils |

L'**observabilité** frontend, c'est d'abord le **RUM** : on instrumente le vrai code qui tourne chez le vrai parent. Le synthétique (Lighthouse CI, budgets de perf) est un outil de **prévention** en CI — il appartient au **cours 11**. Ici, on collecte le terrain.

### 2.2 Core Web Vitals — côté observabilité

Les trois *Core Web Vitals* de Google (source : web.dev, *Web Vitals*) résument l'expérience perçue :

| Métrique | Ce qu'elle mesure | « bon » |
|----------|-------------------|---------|
| **LCP** — Largest Contentful Paint | temps d'affichage du plus gros élément | ≤ 2,5 s |
| **INP** — Interaction to Next Paint | réactivité des interactions | ≤ 200 ms |
| **CLS** — Cumulative Layout Shift | stabilité visuelle (sauts de mise en page) | ≤ 0,1 |

> **Portée.** Ici on **mesure et collecte** ces valeurs telles que les vivent les utilisateurs. **Comment les améliorer** (preload de l'image LCP, `content-visibility`, réservation d'espace pour éviter le CLS, code-splitting pour l'INP) est de la **performance web → cours 11**. Le réflexe obs : un CWV n'est pas une note figée, c'est une **distribution** — on raisonne toujours au **p75** (le seuil Google), jamais à la moyenne, car un mauvais 10 % détruit l'expérience réelle.

### 2.3 Mesurer les CWV : la librairie `web-vitals`

La mesure exacte des CWV dans le navigateur est piégeuse (LCP change jusqu'à la première interaction, INP se finalise au `visibilitychange`…). On ne la code **pas à la main** : la librairie **`web-vitals`** de Google encapsule les subtilités (source : GitHub `GoogleChrome/web-vitals`).

```ts
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals'

function sendVital(metric: import('web-vitals').Metric): void {
  // 1 seul envoi par métrique, au bon moment — géré par la lib
  navigator.sendBeacon('/api/rum/vitals', JSON.stringify(metric))
}

onLCP(sendVital)
onINP(sendVital)
onCLS(sendVital)
onFCP(sendVital)   // diagnostic (pas un Core Web Vital, mais utile)
onTTFB(sendVital)  // relie le front au réseau/serveur
```

L'objet `Metric` passé au callback (vérifié, docs web-vitals) :

```ts
interface Metric {
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB'
  value: number                 // valeur courante
  delta: number                 // variation depuis le dernier report (à sommer côté backend)
  id: string                    // identifiant unique de CETTE instance de mesure
  rating: 'good' | 'needs-improvement' | 'poor'
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore'
  entries: PerformanceEntry[]   // les entrées brutes qui ont produit la valeur
}
```

Deux points qui font gagner des heures :
- **`delta` vs `value`** : chaque callback peut être appelé plusieurs fois (surtout CLS/INP). Envoie `delta` et agrège côté backend, ou dédoublonne sur `id`. Sinon tu comptes deux fois.
- **Build attribution** : `import { onLCP } from 'web-vitals/attribution'` ajoute un champ `attribution` (élément coupable, URL de la ressource LCP, `interactionTarget`…). Indispensable pour *savoir quoi corriger* — mais c'est le cours 11 qui corrige.

L'option `reportAllChanges: true` (`onCLS(cb, { reportAllChanges: true })`) reporte à chaque changement au lieu d'attendre la valeur finale — utile en debug, bruyant en prod.

### 2.4 `PerformanceObserver` — la source native

`web-vitals` s'appuie sous le capot sur `PerformanceObserver`, l'API navigateur qui écoute les entrées de performance. Tu l'utilises directement pour ce que la lib ne couvre pas (long tasks, ressources). Signature vérifiée (docs MDN) :

```ts
const observer = new PerformanceObserver((list, _obs) => {
  for (const entry of list.getEntries()) {
    // entry.entryType, entry.startTime, entry.duration…
    console.log(entry.entryType, entry.startTime)
  }
})

// Écouter UN type + rejouer les entrées déjà survenues (buffered)
observer.observe({ type: 'longtask', buffered: true })
```

Règle d'API à retenir : `observe({ type: 'x', buffered: true })` (un seul type, rejoue le passé) **ou** `observe({ entryTypes: ['a', 'b'] })` (plusieurs types, **mais `buffered` interdit**) — les deux formes ne se mélangent pas. Avant d'observer un type récent, on **teste le support** :

```ts
if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
  new PerformanceObserver(/* … */).observe({ type: 'longtask', buffered: true })
}
```

Types utiles côté obs : `largest-contentful-paint`, `layout-shift`, `event` (INP), `longtask`, `navigation`, `resource`. Le détail de `navigation`/`resource` (waterfall DNS→TTFB, scripts tiers lents) est un sujet **perf → cours 11** ; ici on retient juste que la source existe.

### 2.5 Erreurs client non gérées

Une erreur JS qui plante le bouton *Confirmer* n'atteint **jamais** le serveur. Il faut la capturer **dans le navigateur**. Deux canaux globaux (source : MDN) :

```ts
// 1. Erreurs synchrones non capturées (throw non attrapé, erreur de rendu)
window.addEventListener('error', (event: ErrorEvent) => {
  reportClientError({
    kind: 'error',
    message: event.message,
    stack: event.error?.stack,      // event.error porte l'objet Error (stack)
    source: event.filename,
    line: event.lineno,
    col: event.colno,
  })
})

// 2. Promesses rejetées sans .catch (await non try/catch, fetch qui rejette)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  reportClientError({ kind: 'unhandledrejection', reason: String(event.reason) })
})
```

**Le piège `"Script error."`** — quand une erreur vient d'un script chargé depuis une **autre origine** (CDN, tag analytics) sans en-tête CORS, le navigateur masque tout par sécurité : `event.message === "Script error."`, pas de stack, pas de ligne. La correction n'est pas dans ton handler : il faut charger le script tiers avec `crossorigin="anonymous"` **et** que ce tiers serve `Access-Control-Allow-Origin`. Sans ça, ces erreurs sont inexploitables — on les compte à part plutôt que de polluer le flux.

En pratique, on branche rarement ces handlers à la main pour tout : un SDK (Sentry, module 06 ; ou OTel, ou Grafana Faro) les installe et ajoute *breadcrumbs*, *release* et *source maps* (upload privé, jamais publiées). Mais **connaître les primitives** est ce qui te permet de déboguer quand le SDK laisse passer quelque chose.

### 2.6 Envoyer les données au backend : `sendBeacon` vs `fetch keepalive`

Le problème : l'utilisateur **ferme l'onglet** au moment où tu veux envoyer la mesure finale. Un `fetch()` classique est **annulé** quand la page se décharge. Deux transports survivent à l'unload (source : MDN) :

```ts
// sendBeacon : POST asynchrone garanti par le navigateur même après unload.
// Idéal pour la télémétrie. Contrainte : POST uniquement, pas de headers custom,
// payload limité (~64 Ko), pas de lecture de la réponse.
navigator.sendBeacon('/api/rum/vitals', JSON.stringify(metric))

// fetch keepalive : plus souple (headers, méthode), survit aussi à l'unload.
fetch('/api/rum/vitals', {
  method: 'POST',
  body: JSON.stringify(metric),
  headers: { 'content-type': 'application/json' },
  keepalive: true,           // le point clé
})
```

Réflexe : **`sendBeacon` par défaut** pour la télémétrie (Web Vitals, erreurs), `fetch keepalive` si tu as besoin d'en-têtes (auth, `traceparent`). Envoie sur `visibilitychange → hidden`, pas sur `unload` (déprécié, non fiable sur mobile).

### 2.7 Instrumenter le front d'un framework SSR (Nuxt / Next)

Tout le code ci-dessus est **client-only** : il touche `window`, `navigator`, `PerformanceObserver`, absents côté serveur. Le point d'entrée diffère selon le framework.

**Nuxt 3** — un plugin suffixé `.client.ts` ne s'exécute **que** dans le navigateur :

```ts
// plugins/rum.client.ts  → JAMAIS exécuté au SSR
import { onLCP, onINP, onCLS } from 'web-vitals'

export default defineNuxtPlugin(() => {
  const send = (m: unknown) => navigator.sendBeacon('/api/rum/vitals', JSON.stringify(m))
  onLCP(send); onINP(send); onCLS(send)

  window.addEventListener('error', (e) => {
    navigator.sendBeacon('/api/rum/errors', JSON.stringify({ message: e.message, stack: e.error?.stack }))
  })
})
```

Le hook global d'erreurs de rendu Vue reste `app.config.errorHandler` (via `nuxtApp.vueApp.config.errorHandler` dans un plugin) — il capture les erreurs de composant que `window 'error'` peut manquer.

**Next.js (App Router)** — le fichier conventionnel **`instrumentation-client.ts`** à la racine (ou `src/`) s'exécute côté client **avant** le code de l'app (vérifié, docs Next.js). Il peut aussi exporter `onRouterTransitionStart(url, navigationType)` pour tracer les navigations SPA :

```ts
// instrumentation-client.ts  (racine du projet)
import { onLCP, onINP, onCLS } from 'web-vitals'

const send = (m: unknown) => navigator.sendBeacon('/api/rum/vitals', JSON.stringify(m))
onLCP(send); onINP(send); onCLS(send)

// Navigations client (App Router) : chaque changement de route
export function onRouterTransitionStart(url: string, navigationType: 'push' | 'replace' | 'traverse') {
  performance.mark(`route-change:${navigationType}:${url}`)
}
```

(Alternative « maison » : un composant `'use client'` monté dans le layout racine avec un `useEffect(() => { … }, [])`.)

### 2.8 Session côté client & propagation vers le backend (corrélation)

La vraie valeur du RUM apparaît quand une **session client** se relie à une **trace backend**. Deux notions :

- **Session** : un identifiant stable par visite (`sessionId`, ex. `crypto.randomUUID()` stocké en `sessionStorage`) attaché à chaque évènement RUM. Il regroupe « ce parent, cette visite » — Web Vitals, erreurs, clics.
- **Propagation de trace** : pour relier le clic *Confirmer* à la trace serveur (module 04), le front injecte l'en-tête W3C **`traceparent`** (`00-<traceId>-<spanId>-01`) dans le `fetch` sortant. Le backend OTel (module 05) le lit et **continue la même trace**. Résultat : un seul `trace_id` du navigateur jusqu'à la DB.

Deux voies concrètes, dans l'ordre de simplicité :

1. **OpenTelemetry Web** (source : opentelemetry.io, *browser*). On enregistre un `WebTracerProvider` avec `@opentelemetry/sdk-trace-web` + `@opentelemetry/context-zone`, et l'instrumentation `@opentelemetry/instrumentation-fetch` injecte le `traceparent` automatiquement dans les `fetch` vers tes origines. Le serveur peut aussi passer le contexte initial via `<meta name="traceparent" content="00-…-01">` dans le HTML SSR.
2. **À la main**, quand un SDK est de trop : construire le `traceparent` et l'ajouter au `fetch` (`headers: { traceparent }`, `keepalive: true`). Suffisant pour un premier lien front/back.

> La corrélation ne « marche » que si les deux côtés parlent le **même standard W3C Trace Context** (module 04). C'est le tout l'intérêt d'avoir standardisé la propagation côté backend : le front s'y raccorde sans protocole maison.

---

## 3. Worked examples

### Exemple 1 — collecter les Web Vitals réels de TribuZen et les stocker en métriques

Objectif : du navigateur du parent jusqu'à une métrique Prometheus (module 02) exploitable au p75.

**Côté client** (`plugins/rum.client.ts` en Nuxt) :

```ts
import { onLCP, onINP, onCLS, type Metric } from 'web-vitals'

// sessionId stable pour toute la visite → regroupe les évènements d'un même parent
function sessionId(): string {
  let id = sessionStorage.getItem('tz_sid')
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('tz_sid', id) }
  return id
}

function sendVital(metric: Metric): void {
  const payload = {
    name: metric.name,          // 'LCP' | 'INP' | 'CLS'
    value: metric.value,
    rating: metric.rating,      // good | needs-improvement | poor
    id: metric.id,              // dédoublonnage côté backend
    sid: sessionId(),
    path: location.pathname,    // TEMPLATISE côté serveur (cardinalité, module 02)
  }
  // sendBeacon : survit à la fermeture d'onglet, POST garanti
  navigator.sendBeacon('/api/rum/vitals', JSON.stringify(payload))
}

onLCP(sendVital)
onINP(sendVital)
onCLS(sendVital)
```

**Côté backend** — un endpoint qui transforme le beacon en histogramme Prometheus (réutilise l'instrumentation du module 02) :

```ts
// server/api/rum/vitals.post.ts (Nitro) — ou une route Express équivalente
import { Histogram } from 'prom-client'

// Un histogram par Web Vital. Labels À FAIBLE CARDINALITÉ : name, rating, route templatisée.
const webVital = new Histogram({
  name: 'tribuzen_web_vital',
  help: 'Core Web Vitals réels (RUM)',
  labelNames: ['name', 'rating', 'route'],
  // buckets larges car LCP (s), INP (ms), CLS (0-1) partagent l'histogramme → adapter par name en prod
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 4, 6],
})

export default defineEventHandler(async (event) => {
  const b = await readBody(event)
  webVital.observe(
    { name: b.name, rating: b.rating, route: templatize(b.path) }, // pas l'URL brute !
    b.value,
  )
  // 204 : rien à renvoyer, sendBeacon ne lit pas la réponse
  return null
})
```

Ensuite, en PromQL (module 02), le **p75 du LCP** — le seuil qui compte :

```promql
histogram_quantile(
  0.75,
  sum by (le, route) (rate(tribuzen_web_vital_bucket{name="LCP"}[5m]))
)
```

Le p75 par `route` révèle exactement ce que le cas concret décrivait : le planning familial à 4,8 s sur mobile, invisible côté serveur.

### Exemple 2 — capturer l'erreur du bouton *Confirmer* et la corréler à la session

```ts
// plugins/errors.client.ts (Nuxt) — primitives natives, sans SDK
function sessionId(): string {
  return sessionStorage.getItem('tz_sid') ?? 'no-session'
}

function reportError(payload: Record<string, unknown>): void {
  navigator.sendBeacon('/api/rum/errors', JSON.stringify({ ...payload, sid: sessionId(), path: location.pathname }))
}

// Erreurs synchrones non capturées
window.addEventListener('error', (event: ErrorEvent) => {
  // Piège cross-origin : script tiers sans CORS → message masqué, on tag à part
  if (event.message === 'Script error.' && !event.filename) {
    reportError({ kind: 'cross-origin-script', hidden: true })
    return
  }
  reportError({
    kind: 'error',
    message: event.message,
    stack: event.error?.stack,     // objet Error → stack exploitable (avec source maps)
    line: event.lineno,
    col: event.colno,
  })
})

// Promesses rejetées non gérées (le cas typique du fetch RSVP qui échoue sans .catch)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  reportError({ kind: 'unhandledrejection', reason: String(event.reason) })
})
```

Comme chaque erreur porte le même `sid` que les Web Vitals, le backend peut afficher : « session `abc-123` : LCP 4,8 s sur `/famille/:id/planning`, puis `TypeError: cannot read 'rsvp' of undefined` au clic ». C'est le récit complet que le cas concret réclamait — et le pont vers le module 06 (Sentry enrichit ce flux avec release + source maps + session replay).

---

## 4. Pièges & misconceptions

### PIÈGE #1 — coder la mesure des Web Vitals à la main

Écrire son propre `PerformanceObserver` pour le LCP donne une valeur **fausse** : le LCP change jusqu'à la première interaction, l'INP se finalise au `visibilitychange`, le CLS s'accumule sur toute la session. `web-vitals` encapsule ces règles (validées par l'équipe Chrome). On l'utilise ; on ne réimplémente pas.

### PIÈGE #2 — raisonner en moyenne sur un CWV

La moyenne du LCP ment : une moyenne à 2 s peut cacher 25 % d'utilisateurs à 6 s. Google et le RUM raisonnent au **p75** (`rating` bascule à ce seuil). Toujours agréger en **quantile/histogramme**, jamais en `avg`.

### PIÈGE #3 — `fetch()` sans `keepalive` pour la télémétrie

Un `fetch` normal déclenché au départ de la page est **annulé** à l'unload → mesure perdue, silencieusement. Il faut `navigator.sendBeacon()` ou `fetch(..., { keepalive: true })`, et déclencher sur `visibilitychange → hidden`, pas sur `unload`.

### PIÈGE #4 — croire que `"Script error."` est un bug de ton code

`"Script error."` sans `filename` ni stack = erreur d'un **script tiers cross-origin** que le navigateur masque par sécurité (CORS). Ce n'est pas ton `try/catch` qui manque : il faut `crossorigin="anonymous"` sur le `<script>` tiers + `Access-Control-Allow-Origin` côté CDN. Sinon, inexploitable — on la compte séparément.

### PIÈGE #5 — mettre du code client dans un plugin/instrumentation exécuté au SSR

Toucher `window`, `navigator` ou `PerformanceObserver` côté serveur lève `window is not defined` et casse le rendu. En Nuxt, le suffixe **`.client.ts`** est obligatoire ; en Next, c'est **`instrumentation-client.ts`** (client) et non `instrumentation.ts` (serveur). Confondre les deux = crash SSR ou télémétrie jamais envoyée.

### PIÈGE #6 — `path` brut en label de métrique (bombe de cardinalité)

Envoyer `/famille/42/planning` tel quel comme label crée une série par famille → explosion de cardinalité (module 02). Le backend doit **templatiser** (`/famille/:id/planning`) avant `observe()`. L'ID de famille va dans un log/attribut de trace, pas dans un label.

### PIÈGE #7 — confondre RUM et Lighthouse/synthétique

Un score Lighthouse à 95 en CI **ne prouve pas** que les parents ont une bonne expérience : il mesure un robot en labo. Le RUM mesure le terrain (mobile bas de gamme, 3G). Les deux sont utiles, mais seul le RUM répond à « mes vrais utilisateurs souffrent-ils ? ». L'optimisation qui suit relève du **cours 11**.

---

## 5. Ancrage TribuZen

Le front TribuZen (Nuxt côté parents, cf. fil rouge) devient observable de bout en bout :

| Signal client | Outil | Où il atterrit |
|---------------|-------|----------------|
| Core Web Vitals réels (LCP/INP/CLS) | `web-vitals` → `sendBeacon` | histogramme `tribuzen_web_vital` (Prometheus, module 02) → p75 par route |
| Erreurs JS non gérées | `window 'error'` / `unhandledrejection` | `/api/rum/errors` puis Sentry (module 06) |
| Session parent | `sessionId` en `sessionStorage` | corrèle Vitals + erreurs d'une même visite |
| Clic → API | `traceparent` propagé (OTel Web / manuel) | même `trace_id` jusqu'à la DB (traces module 04-05) |

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  plugins/
    rum.client.ts          ← web-vitals + sessionId (Exemple 1)
    errors.client.ts       ← window 'error' / unhandledrejection (Exemple 2)
  server/
    api/rum/
      vitals.post.ts       ← beacon → histogram Prometheus
      errors.post.ts       ← beacon → Sentry / log structuré
  instrumentation-client.ts (si volet Next)  ← équivalent point d'entrée client
```

> Ce module **collecte et corrèle**. L'**optimisation** des Vitals mesurés (le planning mobile à 4,8 s) est un chantier **cours 11 (performance web)**. L'enrichissement des erreurs (release, source maps, session replay) est le **module 06 (Sentry)**. Le profiling de ce qui bloque le thread principal (long tasks, flamegraphs) est le **module 17 (APM & profiling)** — le prochain.

---

## 6. Points clés

1. Le backend vert ne dit **rien** de l'expérience réelle : le RUM observe le navigateur des vrais utilisateurs, là où le monitoring serveur et synthétique sont aveugles.
2. **RUM** = vrais users en continu ; **synthétique** (Lighthouse CI) = robot en labo, prévention CI (cours 11). Complémentaires.
3. Core Web Vitals : **LCP** (≤2,5 s), **INP** (≤200 ms), **CLS** (≤0,1) — on raisonne au **p75**, jamais en moyenne. L'optimisation détaillée = cours 11.
4. On mesure les CWV avec **`web-vitals`** (`onLCP/onINP/onCLS/onFCP/onTTFB`), pas à la main ; l'objet `Metric` porte `value`, `delta`, `id`, `rating`, `navigationType` ; build `web-vitals/attribution` pour la cause racine.
5. `PerformanceObserver` est la source native : `observe({ type, buffered: true })` **ou** `observe({ entryTypes: [...] })` (buffered interdit) ; tester `supportedEntryTypes`.
6. Erreurs client : `window` `'error'` (`ErrorEvent`, stack via `event.error`) et `'unhandledrejection'` (`PromiseRejectionEvent`) ; `"Script error."` = script tiers cross-origin masqué → `crossorigin` + CORS.
7. Transport qui survit à la fermeture d'onglet : **`navigator.sendBeacon`** par défaut, `fetch({ keepalive: true })` si en-têtes requis ; déclencher sur `visibilitychange → hidden`.
8. Code client-only : plugin **`.client.ts`** (Nuxt) / **`instrumentation-client.ts`** (Next) — jamais au SSR.
9. Corrélation front↔back : `sessionId` + en-tête **W3C `traceparent`** propagé (OTel Web ou manuel) → un seul `trace_id` du clic à la DB.

---

## 7. Seeds Anki

```
RUM vs monitoring synthétique : quelle différence et lequel pour l'observabilité ?|RUM (Real User Monitoring) = vrais utilisateurs, vrais appareils/réseaux, en continu en prod. Synthétique (Lighthouse CI) = robot en labo, reproductible, en CI pour la prévention. L'observabilité frontend = RUM ; le synthétique appartient à la perf web (cours 11).
Pourquoi ne pas mesurer les Core Web Vitals à la main avec PerformanceObserver ?|Les CWV ont des règles subtiles : le LCP change jusqu'à la 1re interaction, l'INP se finalise au visibilitychange, le CLS s'accumule sur toute la session. La librairie web-vitals (équipe Chrome) encapsule ça. On l'utilise ; on ne réimplémente pas.
Quels champs porte l'objet Metric de web-vitals ?|name ('CLS'|'FCP'|'INP'|'LCP'|'TTFB'), value (valeur courante), delta (variation depuis le dernier report), id (identifiant unique de la mesure, sert au dédoublonnage), rating ('good'|'needs-improvement'|'poor'), navigationType, entries[]. Le build web-vitals/attribution ajoute la cause racine.
Pourquoi raisonner au p75 sur un Core Web Vital, jamais en moyenne ?|La moyenne cache la longue traîne : un LCP moyen à 2 s peut masquer 25 % d'utilisateurs à 6 s. Google fixe le rating au p75. On agrège toujours en quantile/histogramme (histogram_quantile), jamais en avg.
Comment capturer les erreurs client non gérées, et quel est le piège cross-origin ?|window.addEventListener('error', …) pour les throw synchrones (stack via event.error) et 'unhandledrejection' pour les promesses rejetées. Piège : "Script error." sans filename = script tiers cross-origin masqué par CORS ; correction = crossorigin="anonymous" + Access-Control-Allow-Origin côté CDN, pas un try/catch.
Pourquoi sendBeacon (ou fetch keepalive) plutôt qu'un fetch normal pour la télémétrie ?|Un fetch classique est annulé quand la page se décharge → mesure perdue. navigator.sendBeacon() (POST garanti après unload) ou fetch({ keepalive: true }) survivent. On déclenche sur visibilitychange→hidden, pas sur unload (déprécié, non fiable mobile).
Où placer le code d'observabilité client en Nuxt et en Next ?|Nuxt : un plugin suffixé .client.ts (jamais exécuté au SSR). Next (App Router) : le fichier instrumentation-client.ts à la racine, exécuté côté client avant l'app (peut exporter onRouterTransitionStart). Confondre avec le point d'entrée serveur = crash 'window is not defined' ou télémétrie jamais envoyée.
Comment relier une session front à la trace backend ?|Un sessionId stable (crypto.randomUUID en sessionStorage) regroupe les évènements d'une visite ; et on propage l'en-tête W3C traceparent (00-traceId-spanId-01) dans les fetch sortants — via OTel Web (instrumentation-fetch) ou à la main. Le backend OTel le lit et continue la même trace : un seul trace_id du clic à la DB.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-16-observabilite-frontend/README.md`. Instrumenter le front TribuZen : collecter les Core Web Vitals réels avec `web-vitals` + capturer les erreurs client (`error` / `unhandledrejection`), tout envoyer au backend via `sendBeacon`, avec `sessionId` de corrélation — corrigé complet commenté, grille, coach en session, variante J+30.

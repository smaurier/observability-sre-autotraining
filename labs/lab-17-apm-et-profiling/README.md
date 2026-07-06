# Lab 17 — APM & profiling : lire un flamegraph et remonter à la fonction coupable

> **Outcome :** à la fin, tu sais brancher un **vrai Pyroscope** sur une API Express, profiler un endpoint TribuZen **CPU-bound**, lire le **flamegraph** pour désigner la fonction responsable (sans deviner), corriger, et **valider en diff** que le CPU a bien chuté.
> **Vrai outil :** `@pyroscope/nodejs` + serveur **Pyroscope** (image officielle `grafana/pyroscope`, UI sur `http://localhost:4040`). Aucun harnais simulé — ton oracle, c'est le flamegraph réel dans l'UI Pyroscope.
> **Feedback :** le coach valide en session (lecture du flamegraph + grille ci-dessous). Pas de test-runner auto-correcteur.

> **Pourquoi ce lab ?** Aux modules 04-05, la trace t'a mené jusqu'au span lent. Ici, tu franchis la porte : le span `renderFeed` est INTERNAL et CPU-bound — seul le **profil** dit *quelle fonction* brûle le CPU. Tu vas le vivre sur un endpoint TribuZen volontairement lent.

---

## Énoncé

On rejoue le cas concret du module : `GET /api/families/:id/feed` de TribuZen met **~1,5 s** et le pod est à **85 % de CPU**. Métriques + trace ont déjà dit *lent + CPU-bound + span `renderFeed`*. À toi de trouver **la fonction**.

Tu dois :

1. **Démarrer un vrai Pyroscope** (conteneur `grafana/pyroscope`).
2. **Instrumenter** l'API avec `@pyroscope/nodejs` : `init` (CPU + heap) + `start`, et un middleware `wrapWithLabels` qui **étiquette chaque requête par endpoint** (route templatisée, pas d'ID → faible cardinalité).
3. **Générer du trafic** sur `/feed` pour nourrir le profil.
4. **Lire le flamegraph** dans l'UI Pyroscope (filtré sur `/feed`, type CPU) et **désigner la fonction coupable** via la grille.
5. **Corriger** la fonction, re-profiler, et **comparer en diff** (rouge = régression, vert = amélioration).

**Pas de gap-fill** — tu écris l'instrumentation complète à partir du starter.

### Démarrer le vrai Pyroscope

Pyroscope n'est pas dans les `docker-compose` du cours : lance-le en standalone (image officielle Grafana).

```bash
docker run --rm -d --name pyroscope -p 4040:4040 grafana/pyroscope:latest
# UI : http://localhost:4040
```

### Starter minimal

```
tribuzen-profiling-lab/
  server.ts
  package.json
```

```jsonc
// package.json
{
  "type": "module",
  "dependencies": {
    "express": "^4",
    "@pyroscope/nodejs": "^0.4"
  }
}
```

```ts
// server.ts — STARTER (à compléter)
import express from 'express'
// TODO: import Pyroscope from '@pyroscope/nodejs'

// TODO: Pyroscope.init({ serverAddress, appName, tags, wall:{collectCpuTime:true}, heapSamplingIntervalBytes })
// TODO: Pyroscope.start()

const app = express()

// TODO: middleware qui wrappe next() avec Pyroscope.wrapWithLabels({ endpoint: <route TEMPLATISÉE>, method })

// --- endpoint CPU-bound de démo (fourni tel quel : NE PAS optimiser avant de l'avoir PROFILÉ) ---
function formatItemDate(ts: number): string {
  // Coupable volontaire : construit un formateur lourd À CHAQUE appel, dans la boucle.
  // (simule un moment()/new Intl.DateTimeFormat() recréé par item)
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'long' })
  // + un peu de CPU gratuit pour rendre la barre bien large dans le flamegraph
  let s = fmt.format(new Date(ts))
  for (let i = 0; i < 5_000; i++) s = s + i // concat inutile = CPU
  return s.slice(0, 40)
}

function renderFeed(familyId: string) {
  const items = Array.from({ length: 300 }, (_, i) => ({
    id: `${familyId}-${i}`,
    date: formatItemDate(Date.now() - i * 3_600_000), // appelé 300 fois
  }))
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

app.get('/api/families/:id/feed', (req, res) => {
  res.json(renderFeed(req.params.id))
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(3000, () => console.log('API sur http://localhost:3000'))
```

Génère du trafic (dans un autre terminal) une fois l'API instrumentée et lancée :

```bash
for i in $(seq 1 200); do curl -s "http://localhost:3000/api/families/f-42/feed" > /dev/null; done
```

---

## Étapes (en friction)

1. **Lance Pyroscope** (docker run ci-dessus) et l'API nue (`npm i` puis `npx tsx server.ts`). Vérifie `curl localhost:3000/api/health`.
2. **Instrumente** : `Pyroscope.init({ serverAddress: 'http://localhost:4040', appName: 'tribuzen-api', tags: { env: 'lab' }, wall: { collectCpuTime: true }, heapSamplingIntervalBytes: 524288 })` puis `Pyroscope.start()`. Place ces appels **tout en haut**, avant les routes.
3. **Étiquette par endpoint** : middleware qui appelle `Pyroscope.wrapWithLabels({ endpoint: req.route?.path ?? req.path, method: req.method }, () => next())`. Route **templatisée** (`/api/families/:id/feed`), jamais l'URL brute.
4. **Vérifie l'ingestion** : ouvre `http://localhost:4040`, sélectionne l'app `tribuzen-api`, type de profil **CPU** (`process_cpu`). Sans trafic, c'est vide — c'est normal.
5. **Génère du trafic** (boucle `curl` ci-dessus). Rafraîchis Pyroscope : un flamegraph apparaît.
6. **Filtre sur `/feed`** via le label `endpoint="/api/families/:id/feed"`. Tu ne dois voir QUE cette route.
7. **Lis le flamegraph** et remplis la grille d'analyse. Cherche la **feuille la plus large** en haut, puis descends la pile pour voir **qui l'appelle**.
8. **Corrige** : sors le formateur `Intl.DateTimeFormat` **hors de la boucle** (instancié une fois), supprime la concat inutile. Redéploie, régénère du trafic.
9. **Diff** : dans Pyroscope, compare la période AVANT et APRÈS le fix (onglet *Comparison* / *Diff*). La barre `formatItemDate` doit devenir **verte** (part CPU effondrée).

### Grille d'analyse (à remplir dans l'UI Pyroscope)

| Question | Ta réponse (lue dans Pyroscope) |
|---|---|
| Quel type de profil pour ce symptôme (CPU 85 %), et pourquoi pas wall-clock ? | |
| Quelle est la **feuille la plus large** du flamegraph `/feed` ? Sa part de CPU ? | |
| Quelle est sa **pile d'appels** (qui l'appelle, de la feuille à la racine) ? | |
| Pourquoi la barre est-elle si large — combien de fois la fonction est-elle appelée ? | |
| L'axe X représente-t-il le temps ? (piège) | |
| Après le fix : quelle couleur prend la fonction dans le **diff** ? | |

---

## Corrigé complet commenté

```ts
// server.ts — CORRIGÉ (instrumentation + fix de la coupable)
import express from 'express'
import Pyroscope from '@pyroscope/nodejs'
import type { Request, Response, NextFunction } from 'express'

// 1) Profiling continu — tout en haut, AVANT les routes.
Pyroscope.init({
  serverAddress: 'http://localhost:4040',
  appName: 'tribuzen-api',
  tags: { env: 'lab' },
  // wall est un OBJET (API v0.4+), pas `wall: true`. collectCpuTime → profil CPU.
  wall: { collectCpuTime: true, samplingDurationMs: 60_000, samplingIntervalMicros: 10_000 },
  heapSamplingIntervalBytes: 524_288, // 512 Ko — profil heap
})
Pyroscope.start()
process.on('SIGTERM', () => { void Pyroscope.stop() }) // flush propre

const app = express()

// 2) Étiquette CHAQUE requête par endpoint → on filtre le flamegraph par route.
app.use((req: Request, _res: Response, next: NextFunction) => {
  // route TEMPLATISÉE : req.route n'est peuplé qu'après le routing → fallback req.path.
  // Pour garantir /api/families/:id/feed dès le wrap, on peut brancher ce middleware
  // au niveau du routeur ; ici req.path suffit pour le lab (une seule route métier).
  const endpoint = req.route?.path ?? req.path
  // Les échantillons pris PENDANT next() héritent de ces labels → filtrables dans l'UI.
  Pyroscope.wrapWithLabels({ endpoint, method: req.method }, () => next())
})

// 3) FIX de la coupable : formateur instancié UNE fois, hors de la boucle.
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'long' })

function formatItemDate(ts: number): string {
  return dateFmt.format(new Date(ts)).slice(0, 40) // plus de new Intl... par item, plus de concat
}

function renderFeed(familyId: string) {
  const items = Array.from({ length: 300 }, (_, i) => ({
    id: `${familyId}-${i}`,
    date: formatItemDate(Date.now() - i * 3_600_000),
  }))
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

app.get('/api/families/:id/feed', (req, res) => {
  res.json(renderFeed(req.params.id))
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(3000, () => console.log('API sur http://localhost:3000'))
```

**Grille remplie (lecture attendue) :**

| Question | Réponse |
|---|---|
| Type de profil | **CPU** : le symptôme est un CPU à 85 %. Wall-clock servirait si c'était lent *sans* CPU (attente I/O) — ici il n'y a aucun appel DB/externe, tout est du calcul. |
| Feuille la plus large | La construction/format du `Intl.DateTimeFormat` (sous `formatItemDate`), ~40-50 % du CPU de `/feed`. |
| Pile d'appels | `formatItemDate` ← `renderFeed` ← handler `GET /api/families/:id/feed` ← racine. |
| Pourquoi si large | `new Intl.DateTimeFormat(...)` (objet lourd) est recréé **300 fois** par requête + concat inutile → le coût par item se multiplie par le nombre d'items. |
| Axe X = temps ? | **Non.** Largeur = proportion d'échantillons (part du CPU) ; l'ordre gauche-droite est alphabétique, non chronologique. La timeline, c'est la trace (module 04), pas le flamegraph. |
| Couleur après fix | **Verte** dans le diff : la part CPU de `formatItemDate` s'effondre (formateur instancié une seule fois). |

**Pourquoi ce corrigé est correct :**
- On a suivi l'ordre **métrique → trace → profil** : on n'a profilé qu'une fois le span isolé (§2.9 du module). Pas de profiling « au hasard ».
- Le label `endpoint` est **templatisé** (`:id`) → un profil filtrable par route sans exploser la cardinalité (même discipline qu'au module 02 pour les métriques).
- Le fix ne « devine » rien : le flamegraph **a désigné** `formatItemDate`. On sort l'objet lourd de la boucle, on re-profile, et le **diff** *prouve* le gain (vert). C'est la boucle profiler → optimiser → re-profiler.
- On a résisté au **piège #1** : on n'a jamais lu le flamegraph comme une timeline.

### Coach — questions de vérification en session

- « Montre-moi le flamegraph de `/feed`. Où est la feuille la plus large, et que signifie sa largeur ? » (attendu : part du CPU, pas le temps)
- « Descends la pile : qui appelle la fonction coupable, et combien de fois par requête ? »
- « Si le CPU était à 15 % mais `/feed` toujours à 1,5 s, quel type de profil, et pourquoi pas CPU ? » (attendu : wall-clock — le temps est en I/O, le CPU ne travaille pas)
- « Prouve-moi que ton fix marche : montre le diff. Quelle couleur, et pourquoi ? »
- « Pourquoi le label `endpoint` est-il `:id` et pas l'URL réelle ? » (attendu : cardinalité)
- « APM ou cette stack DIY pour TribuZen aujourd'hui ? Justifie en une phrase de TCO. »

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. **En 25 min**, instrumente **de mémoire** une nouvelle route `GET /api/families/:id/export` qui génère un « PDF » (simulé par une boucle CPU lourde + une regex volontairement coûteuse).
2. Cette fois, le symptôme est **la RAM qui grimpe** requête après requête (un tableau accumulé dans un cache module-level sans éviction). Utilise le **heap profile** de Pyroscope (pas le CPU) pour trouver l'allocation qui ne redescend jamais.
3. Filtre le profil sur `endpoint="/api/families/:id/export"` via `wrapWithLabels`.
4. **Piège volontaire à éviter :** ne lance **pas** un CPU profile pour une fuite mémoire — explique au coach en une phrase pourquoi le heap profile est le bon outil ici.

**Critère de réussite :** le heap flamegraph pointe l'allocation coupable (le `cache.push` sans éviction), le fix (éviction / `Map` bornée) fait redescendre les allocations, et le diff le prouve.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, le profiling vit à côté des métriques et des traces déjà en place :

```
tribuzen/
  src/
    observability/
      metrics.ts          ← module 02 (déjà là)
      tracing.ts          ← modules 04-05 (déjà là)
      profiling.ts        ← Pyroscope.init + start
      profiling-labels.ts ← middleware wrapWithLabels par endpoint
  ops/
    docker-compose.obs.yml ← + service grafana/pyroscope (port 4040)
```

**Différences avec le lab :**
- Le `wrapWithLabels` est branché au niveau du **routeur** (pas inline dans `server.ts`), pour que `req.route?.path` soit résolu → l'`endpoint` est vraiment templatisé.
- Pyroscope tourne comme **service Docker Compose** aux côtés de Grafana → le span lent dans Tempo peut ouvrir directement le flamegraph du moment (signal Profiles OTel, cf. §2.8 du module).
- En prod, on active surtout le **CPU/wall** en continu (overhead < 1-2 %) et on n'ajoute le **heap** que sur suspicion de fuite.

**Commit cible :**
```
feat(observability): continuous profiling de l'API (Pyroscope) — flamegraph par endpoint
```

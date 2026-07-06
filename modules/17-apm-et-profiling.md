---
titre: APM et continuous profiling
cours: 16-observability-sre
notions: ["APM (Application Performance Monitoring)", "APM vs stack DIY assemblée", "corrélation logs/traces/métriques", "vendors (Datadog / New Relic / Grafana Cloud) en survol neutre", "OTel comme assurance anti-lock-in", "continuous profiling vs profiling ponctuel", "CPU / heap / wall-clock profiling", "flamegraph (largeur = échantillons, PAS le temps)", "Pyroscope & Parca", "signal Profiles OpenTelemetry (4e signal)"]
outcomes:
  - sait expliquer ce qu'un APM apporte de plus qu'une stack observabilité assemblée à la main (corrélation + auto-instrumentation clé en main) et à quel prix
  - sait situer Datadog, New Relic et Grafana Cloud en survol neutre et comprend pourquoi OTel est l'assurance anti-lock-in
  - sait distinguer CPU, heap et wall-clock profiling et choisir le bon selon le symptôme
  - sait lire un flamegraph correctement (largeur = proportion d'échantillons, axe X non chronologique, profondeur = pile d'appels)
  - sait profiler un endpoint lent avec Pyroscope et remonter à la fonction coupable
prerequis: ["modules 00 à 16 du cours (3 piliers, métriques, RED/USE, tracing distribué, OTel, dashboards, SLO, alerting, obs frontend)", "module 04 — spans & traces", "module 05 — OpenTelemetry (SDK, OTLP, collector)"]
next: 18-finops-et-feature-flags-observabilite
libs: []
tribuzen: profiling de l'API TribuZen — remonter un endpoint CPU-bound (feed familial) jusqu'à la fonction coupable via flamegraph Pyroscope, en complément des traces
last-reviewed: 2026-07
---

# APM et continuous profiling

> **Outcomes — tu sauras FAIRE :** expliquer ce qu'un APM ajoute à une stack DIY (et à quel coût), situer Datadog/New Relic/Grafana Cloud sans militer, choisir CPU/heap/wall-clock profiling selon le symptôme, lire un flamegraph correctement, profiler un endpoint TribuZen lent avec Pyroscope pour trouver la fonction coupable.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module traite l'**APM en tant que produit** (ce qu'il empaquette vs ce que tu as assemblé aux modules 01-16) et le **continuous profiling** (le signal qui manquait). Il s'appuie sur les **traces** (modules 04 et 05) : le profiling répond à la question que la trace laisse ouverte. Le **coût** de l'observabilité (cardinalité, budget d'ingestion, sampling) est traité au **module 18 (finops)** — ici on nomme le sujet sans le creuser. Le **comparatif de pricing détaillé** n'est PAS l'objet : les vendors sont survolés **neutrement**, OTel reste le fil conducteur.

## 1. Cas concret d'abord

Un parent se plaint : le **fil d'actualité familial** de TribuZen (`GET /api/families/:id/feed`) met **1,8 s** à s'afficher. Tu as déjà les trois piliers en place (modules 01-16), tu enquêtes dans l'ordre appris :

- **Métriques** (module 02) : `histogram_quantile` te donne un p99 à 1,8 s sur cette route, et `process_cpu_seconds_total` montre le pod à **85 % de CPU**. → *symptôme* : c'est lent **et** CPU-bound.
- **Trace** (modules 04-05) : tu ouvres la requête dans Jaeger. Un seul span domine, `renderFeed` (1,6 s). Pas d'appel DB lent, pas d'appel externe — le span est **INTERNAL**, tout le temps est passé **dans ton propre code CPU**.

```
Métrique  → "le p99 de /feed est à 1,8 s, CPU à 85 %"     (QUOI : lent + CPU-bound)
Trace     → "le span renderFeed prend 1,6 s, il est INTERNAL" (OÙ : dans ce code, pas en I/O)
Profil    → "formatDate() via moment() consomme 47 % du CPU" (POURQUOI : cette fonction-là)
```

La trace t'a amené **jusqu'à la porte** de `renderFeed`, mais elle s'arrête là : un span est une boîte, il ne te dit pas **quelle ligne** brûle le CPU à l'intérieur. C'est exactement le trou que comble le **profiling** : il échantillonne les piles d'appels et te dessine un **flamegraph** où la fonction coupable est la barre la plus large.

À la fin de ce module, tu brancheras **Pyroscope** sur l'API TribuZen, tu liras le flamegraph de `/feed`, et tu désigneras la fonction responsable — sans deviner. On verra aussi *quand* dégainer un **APM** clé en main plutôt que d'assembler tout ça soi-même.

---

## 2. Théorie complète, concise

### 2.1 Le signal qui manquait : quoi / où / pourquoi

Tu as construit trois piliers. Chacun répond à une question, et **s'arrête** là où commence la suivante :

| Signal | Question | S'arrête à… |
|--------|----------|-------------|
| Métriques | **Quoi ?** (le p99 monte, le CPU sature) | ne dit pas *quelle route* |
| Traces | **Où ?** (le span `renderFeed` est lent) | ne dit pas *quelle fonction* |
| **Profils** | **Pourquoi ?** (`formatDate` = 47 % du CPU) | la cause racine, ligne près |

Le **profiling** est le 4e signal. Il ne remplace rien : il **prolonge** la trace. On y va quand la trace a isolé un span lent **sans appel externe** — le temps est brûlé dans du code à toi, et seul l'échantillonnage des piles le localise.

### 2.2 Qu'est-ce qu'un APM ?

Un **APM** (*Application Performance Monitoring*) est un **produit** qui empaquette, clé en main, ce que tu as monté brique par brique aux modules 01-16 :

- **auto-instrumentation** : un agent/SDK pose les spans, métriques et hooks d'erreur **sans que tu écrives** le middleware (contraste avec ton `metricsMiddleware` du module 02 et ton SDK OTel du module 05) ;
- **corrélation intégrée** logs ↔ traces ↔ métriques : un clic depuis une erreur ouvre la trace, puis le log, puis (souvent) le **profil** du moment exact — sans que tu câbles les `trace_id` à la main ;
- **service map** dérivée automatiquement des spans `CLIENT`/`SERVER` ;
- **error tracking**, **RUM** (module 16), **continuous profiling** (§2.5) réunis sous une seule UI et une seule facturation.

> La valeur d'un APM n'est PAS « avoir des métriques » — tu les as déjà. C'est la **corrélation turnkey** et l'**auto-instrumentation** : moins de câblage, un seul écran, une seule équipe à former. Le prix, c'est le **coût** et le **couplage** (§2.4, §2.6).

### 2.3 APM vs stack DIY assemblée

Aux modules 01-16 tu as bâti une stack **DIY** : Pino (logs) + Prometheus/Grafana (métriques) + OTel/Tempo/Jaeger (traces) + Sentry (erreurs). C'est une alternative parfaitement valable à un APM commercial. Le vrai arbitrage :

| Critère | Stack DIY (ce que tu as monté) | APM commercial |
|---------|-------------------------------|----------------|
| Coût direct | licences OSS = 0, mais **temps ops** réel | abonnement (par host / par Go ingéré / par user) |
| Corrélation | à câbler (IDs de trace dans les logs, datasources Grafana liées) | intégrée d'usine |
| Auto-instrumentation | tu écris le middleware / configures le SDK | agent qui s'attache tout seul |
| Contrôle des données | total (self-hosted, souveraineté) | dépend du vendor (résidence, rétention) |
| Lock-in | faible (OTel + OSS) | variable (agent propriétaire = fort) |
| Expertise requise | tu opères Prometheus, Tempo, ES… | quasi nulle côté infra obs |

Règle de décision honnête : **petite équipe sans SRE dédié → APM** (le temps ops coûte plus cher que l'abonnement au départ) ; **contrainte de souveraineté / très gros volume / expertise obs interne → DIY self-hosted**. Ce n'est pas un choix moral, c'est un TCO — le détail chiffré est au module 18.

### 2.4 Les vendors, en survol neutre — et OTel comme assurance

Trois noms reviennent. Survol **factuel**, sans recommander :

- **Datadog** — SaaS uniquement, très large (metrics, traces, logs, RUM, synthetics, **profiling** intégré), corrélation excellente. Historiquement **agent propriétaire** (support OTel présent mais l'agent maison reste la voie royale) → couplage plus fort. Facturation par host + par Go ingéré, réputée imprévisible à l'échelle.
- **New Relic** — SaaS, **OTLP natif** (endpoint OTel direct, pas d'agent maison obligatoire), palier gratuit généreux à l'ingestion, langage de requête NRQL. All-in-one.
- **Grafana Cloud** — la version SaaS de la stack **OSS que tu connais déjà** (Grafana + Mimir/Prometheus + Loki + Tempo + **Pyroscope**), **OTel-native**, self-hostable à l'identique → **lock-in le plus faible**.

Le point qui compte plus que le classement : **OpenTelemetry est ton assurance anti-lock-in.** Si ton code émet en **OTLP** (module 05) plutôt qu'avec un agent propriétaire, changer de backend = changer l'`exporter` du **collector**, pas ré-instrumenter l'application.

```yaml
# otel-collector — migrer de backend = éditer UNE ligne d'exporters, pas le code applicatif
exporters:
  otlphttp/grafana: { endpoint: "https://otlp-gateway.grafana.net/otlp" }
  # datadog:        { api: { key: "${env:DD_API_KEY}" } }   # bascule sans retoucher l'app
service:
  pipelines:
    traces: { receivers: [otlp], processors: [batch], exporters: [otlphttp/grafana] }
```

> Le comparatif de **pricing** détaillé (cardinalité, budget d'ingestion, sampling pour maîtriser la facture) est le **module 18**. Ici on retient : APM = corrélation clé en main ; OTel = liberté de backend.

### 2.5 Continuous profiling : le profiling qui vit en prod

Le profiling **ponctuel** (à la demande, en dev) existe depuis toujours : tu lances `--prof`, tu reproduis, tu lis un fichier local. Problème : le bug de prod est **intermittent**, dépend du **trafic réel**, et un profil de dev n'est pas représentatif.

Le **continuous profiling** tourne **en permanence en production** avec un **overhead faible** (typiquement < 1-2 % CPU pour le sampling CPU/wall — source : docs Pyroscope). Il échantillonne les piles d'appels ~100 fois/seconde, stocke l'historique, et te laisse **comparer avant/après un déploiement**.

| | Profiling ponctuel | Continuous profiling |
|--|--------------------|----------------------|
| Où | dev / staging | **production** |
| Quand | à la demande, on reproduit | 24/7, on a déjà l'historique |
| Overhead | élevé (peu importe, c'est du dev) | **faible** (< 1-2 % CPU, conçu pour ça) |
| Résultat | fichier local | service central, flamegraphs, **diff** |

### 2.6 Trois types de profil — choisir selon le symptôme

C'est le choix qui trompe les débutants. Le type de profil doit matcher le symptôme :

| Type | Mesure | Révèle | **Ignore** | On l'utilise quand… |
|------|--------|--------|-----------|---------------------|
| **CPU** | temps **sur le processeur** | fonctions gourmandes en calcul | l'attente I/O | le CPU sature (cas TribuZen §1) |
| **Heap** (mémoire) | **allocations** | fuites, allocations excessives, cache sans éviction | le temps d'exécution | la RAM grimpe, le GC mouline |
| **Wall-clock** | temps **réel écoulé** (I/O inclus) | attentes réseau/DB/disque | rien (voit tout) | c'est lent **sans** que le CPU monte |

Piège classique : lancer un **CPU profile** sur une requête lente **à cause de l'I/O**. Le CPU ne fait *rien* pendant l'attente DB → le profil CPU est vide au bon endroit. Requête lente + CPU bas ⇒ **wall-clock**, pas CPU.

### 2.7 Lire un flamegraph — sans le mythe de l'axe temporel

Le **flamegraph** est la visualisation du profiling. Deux règles, dont une contre-intuitive (source : Brendan Gregg, *Flame Graphs*) :

- **Axe Y = profondeur de la pile d'appels.** En bas, le point d'entrée (racine) ; en montant, les appelés ; **en haut, les feuilles** (les fonctions réellement en train de s'exécuter au moment de l'échantillon). Une barre du haut posée sur une barre du bas = « le bas **a appelé** le haut ».
- **Axe X = proportion d'échantillons, PAS le temps.** La **largeur** d'une barre = la part du temps CPU (nombre d'échantillons) passée dans cette fonction et ses enfants. **L'ordre gauche-droite n'a aucun sens chronologique** : les piles sont triées **alphabétiquement** pour fusionner les frames identiques. Ne lis jamais un flamegraph « de gauche à droite comme une timeline » — c'est une trace (module 04), pas un flamegraph.

```
Flamegraph — largeur = part du CPU, PAS le temps ; hauteur = pile d'appels

 [ formatDate  47% ]        <- feuille LARGE = la coupable : 47% du CPU
 [ moment()    47% ]        (largeur ~identique : tout le coût de renderFeed
 [ renderFeed  62% ][ serialize 30% ]   est dans formatDate, pas ailleurs)
 [ GET /api/families/:id/feed  100% ]   <- racine (point d'entrée), en bas
```

Méthode : repère la **barre la plus large en haut** (feuille gourmande) → c'est ta cible. Descends pour lire **qui l'appelle** (la pile). Ignore les barres fines. Un **flamegraph de diff** (Pyroscope) colore en **rouge** ce qui a régressé et en **vert** ce qui s'est amélioré entre deux versions — l'outil idéal pour valider une optimisation ou repérer une régression post-déploiement.

> Variante d'affichage : l'**icicle graph** (glaçon) est un flamegraph **inversé** — racine **en haut**, feuilles en bas. Même lecture, sens vertical opposé. Pyroscope et beaucoup d'UI l'utilisent par défaut.

### 2.8 Pyroscope, Parca, et le signal Profiles d'OTel

Deux outils OSS de continuous profiling dominent :

- **Pyroscope** (Grafana Labs) — serveur de profils + SDK par langage ; intégré à Grafana aux côtés de Tempo/Loki/Prometheus. C'est celui du lab.
- **Parca** (Polar Signals) — approche **eBPF** : profile **tout le système** au niveau kernel, sans SDK applicatif, overhead très bas.

Nouveauté structurante : **OpenTelemetry a un signal `Profiles`** (stabilisé en 2025) — le profiling rejoint logs/métriques/traces comme **4e signal** transporté en **OTLP**. Concrètement, le collector OTel sait recevoir/exporter des profils, et un span lent peut **pointer vers son flamegraph** du moment exact : tu cliques sur le span `renderFeed` dans Tempo → « View profile » → le flamegraph CPU de cette fenêtre. La boucle trace → profil est bouclée.

### 2.9 Quand profiler — l'arbre de décision

```
Mon endpoint est lent. Dans quel ordre ?

1. MÉTRIQUES (module 02) — le CPU sature-t-il ? la RAM grimpe-t-elle ?
   ├─ CPU haut ........... → profil CPU
   ├─ RAM qui monte ...... → profil heap
   └─ CPU/RAM normaux .... → 2. TRACE

2. TRACE (modules 04-05) — quel span est lent ?
   ├─ span avec appel DB/externe lent → c'est de l'I/O (pas de profil : optimise la requête/l'appel)
   └─ span INTERNAL lent, pas d'I/O ..→ profil (CPU si CPU-bound, wall-clock sinon)

3. PROFIL (Pyroscope) — quelle FONCTION ? → flamegraph → optimise → re-profile pour valider
```

On **ne profile pas d'abord**. Le profiling est ciblé : la métrique et la trace ont déjà réduit le champ à un endpoint et un span. Profiler « au cas où » noie le signal.

---

## 3. Worked examples

### Exemple 1 — brancher Pyroscope sur l'API TribuZen et cibler `/feed`

Objectif : instrumenter l'API avec `@pyroscope/nodejs` (API vérifiée sur grafana.com/docs/pyroscope), activer CPU + heap, et étiqueter le profil **par endpoint** pour isoler `/feed`.

```ts
// src/observability/profiling.ts
import Pyroscope from '@pyroscope/nodejs'

Pyroscope.init({
  serverAddress: process.env.PYROSCOPE_URL ?? 'http://localhost:4040',
  appName: 'tribuzen-api',
  tags: {
    env: process.env.NODE_ENV ?? 'development',
    version: process.env.APP_VERSION ?? '0.0.0',
  },
  // API v0.4+ : wall est un OBJET (pas `wall: true`). collectCpuTime active le profil CPU.
  wall: { collectCpuTime: true, samplingDurationMs: 60_000, samplingIntervalMicros: 10_000 },
  // heap : intervalle d'échantillonnage des allocations (octets entre 2 échantillons)
  heapSamplingIntervalBytes: 524_288, // 512 Ko
})

Pyroscope.start()

process.on('SIGTERM', () => { void Pyroscope.stop() }) // flush propre à l'arrêt
```

```ts
// middleware — étiquette CHAQUE requête avec son endpoint pour filtrer le flamegraph
import Pyroscope from '@pyroscope/nodejs'
import type { Request, Response, NextFunction } from 'express'

export function profilingLabels(req: Request, _res: Response, next: NextFunction): void {
  // route TEMPLATISÉE (comme les métriques, module 02) : pas d'ID → étiquette à faible cardinalité
  const route = req.route?.path ?? req.path
  // wrapWithLabels attache le label aux échantillons pris PENDANT ce handler
  Pyroscope.wrapWithLabels({ endpoint: route, method: req.method }, () => next())
}
```

Dans l'UI Pyroscope, tu filtres alors `endpoint="/api/families/:id/feed"` et tu ne vois **que** le flamegraph de cette route. C'est l'équivalent profiling du label `route` de tes métriques.

### Exemple 2 — lire le flamegraph et désigner la coupable

Tu filtres sur `/feed`, type **CPU**, sur les 30 dernières minutes. Le flamegraph (feuilles en haut) :

```
 [ format (moment)  47% ][ escape 6% ]
 [ formatDate       47% ][ sanitize 12% ]
 [ mapItems         59% ][ sortByDate 30% ]
 [ renderFeed       92% ]
 [ GET /api/families/:id/feed   100% ]     <- racine en bas
```

Lecture pas à pas :
1. **Barre la plus large en haut** : `format` (interne à `moment`) à **47 %**. C'est la feuille gourmande → la cible.
2. **Descends la pile** : `format` ← `formatDate` ← `mapItems` ← `renderFeed`. Traduction : **pour chaque item du feed**, on appelle `formatDate`, qui appelle `moment().format()`. Sur 200 items, `moment` (lourd) est recréé 200 fois.
3. **`sortByDate` à 30 %** est la 2e piste, mais moitié moins large → on traite `format` d'abord.
4. **Correctif** : remplacer `moment()` par une fonction de formatage native (`Intl.DateTimeFormat`, instancié **une seule fois** hors boucle). 
5. **Re-profile** après déploiement et ouvre un **diff flamegraph** : `format` doit passer **vert** (part CPU effondrée). Le p99 de `/feed` retombe sous 300 ms.

Ce qu'il faut retenir de la lecture : on n'a jamais lu l'axe X comme une chronologie. On a cherché la **feuille la plus large**, puis remonté **qui l'appelle**. La largeur = part du CPU, rien d'autre.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — lire un flamegraph comme une timeline (axe X = temps)

Le plus répandu. L'axe X d'un flamegraph n'est **PAS** le temps : les piles sont triées **alphabétiquement** pour fusionner les frames, et la **largeur** = proportion d'échantillons. La barre « à gauche » ne s'exécute pas « avant » celle « à droite ». Ce qui se lit chronologiquement, c'est une **trace** (module 04), pas un flamegraph. Confondre les deux fait chercher un « ordre » qui n'existe pas.

### PIÈGE #2 — profil CPU pour un problème d'I/O

Requête à 2 s mais CPU à 15 % : un **CPU profile** te montrera un flamegraph presque vide (le CPU ne travaille pas pendant l'attente DB). Le temps est en **I/O** → il faut un **wall-clock profile** (ou souvent : la **trace** suffit, elle a déjà le span DB lent). Règle : *lent + CPU bas ⇒ wall-clock ou trace, jamais CPU.*

### PIÈGE #3 — profiler seulement en dev

Le profil de dev ne voit ni le **trafic réel**, ni les **données réelles**, ni les bugs **intermittents**. Le `moment()` de l'Exemple 2 ne fait mal qu'à 200 items en prod — invisible sur un dataset de dev à 3 items. Le **continuous profiling** existe précisément pour tourner en **prod** (overhead < 1-2 %). Profiler seulement en local, c'est chercher ses clés sous le lampadaire.

### PIÈGE #4 — croire qu'un APM « remplace » de comprendre l'observabilité

Un APM auto-instrumente, mais il ne t'exempte pas de savoir lire une trace, choisir un type de métrique ou éviter une bombe de cardinalité. Il **empaquette** ce que tu as appris — il ne le **remplace** pas. Un APM mal réglé produit une facture énorme (cardinalité, ingestion) sans plus de signal. Le *quoi/où/pourquoi* reste ta grille de lecture, APM ou pas.

### PIÈGE #5 — s'enfermer avec un agent propriétaire

Instrumenter avec l'agent maison d'un vendor (au lieu d'**OTLP**) rend chaque migration = **ré-instrumentation** de toute l'application. Émets en OTel/OTLP (module 05) ; le choix du backend redevient une **ligne d'`exporters`** dans le collector. Le lock-in n'est pas dans le contrat, il est dans le **code d'instrumentation**.

### PIÈGE #6 — profiler « au cas où », avant métriques et traces

Le profiling est le **dernier** maillon, pas le premier. Sans la métrique (quel symptôme ?) ni la trace (quel span ?), tu profiles au hasard et tu te noies dans des flamegraphs sans hypothèse. L'ordre est : métrique → trace → **puis** profil ciblé (§2.9).

---

## 5. Ancrage TribuZen

Le profiling complète la stack observabilité de TribuZen déjà en place (métriques module 02, traces modules 04-05). Il n'ajoute **pas** un pilier concurrent : il **prolonge la trace** quand un span INTERNAL reste inexpliqué.

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    observability/
      metrics.ts        ← modules 02 (déjà là)
      tracing.ts        ← modules 04-05 (déjà là)
      profiling.ts      ← Pyroscope.init + start (Exemple 1)
      profiling-labels.ts ← middleware wrapWithLabels par endpoint
  ops/
    docker-compose.obs.yml ← + service grafana/pyroscope (port 4040)
```

Cas d'usage réels dans TribuZen où le profiling tranche là où la trace s'arrête :
- **`/feed` CPU-bound** (cas concret) : formatage de dates par item → `moment` dans une boucle. La trace dit « `renderFeed` lent » ; le flamegraph dit « `formatDate` = 47 % ».
- **Export PDF d'un événement** : génération synchrone lourde → CPU profile pour trouver la lib de rendu coûteuse.
- **Fuite mémoire du cache de familles** : la RAM du pod grimpe sur la journée → **heap profile** pour trouver le cache sans éviction (allocations qui ne redescendent jamais).

> **Quand basculer TribuZen sur un APM ?** Tant que Sylvain opère seul la stack DIY, elle suffit et n'a aucun lock-in (tout est OTLP + OSS). Le jour où une équipe sans SRE dédié reprend l'exploitation, un APM (ou Grafana Cloud, qui est la même stack en managé) devient un arbitrage de **TCO** — chiffré au module 18. L'instrumentation OTel déjà en place rend cette bascule quasi gratuite côté code.

---

## 6. Points clés

1. Le **profiling** est le 4e signal : il répond au **pourquoi** (quelle fonction) là où la trace s'arrête au **où** (quel span). On y va après métrique + trace, jamais d'abord.
2. Un **APM** empaquette clé en main ce que tu as monté DIY (modules 01-16) : auto-instrumentation + **corrélation** logs/traces/métriques/profils. Sa valeur = le câblage en moins, pas les métriques.
3. **DIY vs APM** = arbitrage de **TCO** (temps ops vs abonnement) et de contrôle des données, pas un choix moral. Petite équipe → APM ; souveraineté/gros volume/expertise → DIY.
4. **Datadog / New Relic / Grafana Cloud** en survol neutre ; **OTel/OTLP est l'assurance anti-lock-in** : changer de backend = éditer les `exporters` du collector, pas ré-instrumenter.
5. **Continuous profiling** tourne en **prod** (overhead < 1-2 %), garde l'historique, permet le **diff** avant/après déploiement — contrairement au profiling ponctuel de dev.
6. **CPU / heap / wall-clock** : choisir selon le symptôme. CPU saturé → CPU ; RAM qui monte → heap ; lent sans CPU (I/O) → wall-clock.
7. **Flamegraph** : largeur = **part d'échantillons** (PAS le temps, axe X non chronologique, tri alphabétique) ; hauteur = **pile d'appels** (bas = racine, haut = feuilles). Cible = feuille la plus large.
8. **Pyroscope** (SDK) et **Parca** (eBPF) sont les OSS de référence ; le signal **Profiles d'OTel** (stabilisé 2025) relie le span lent à son flamegraph.

---

## 7. Seeds Anki

```
Que répond le profiling que la trace ne répond pas ?|La trace dit OÙ (quel span est lent). Le profiling dit POURQUOI (quelle fonction brûle le CPU/la RAM à l'intérieur du span). On profile après métrique+trace, quand un span INTERNAL est lent sans appel externe.
Qu'apporte un APM de plus qu'une stack DIY (Prometheus+Grafana+Tempo+Sentry) ?|L'auto-instrumentation (agent qui s'attache sans écrire le middleware) et la corrélation clé en main logs↔traces↔métriques↔profils sous une UI. Il n'ajoute pas "des métriques" (tu les as) : il retire du câblage. Prix = coût d'abonnement + risque de lock-in.
DIY self-hosted ou APM commercial : sur quoi se décide le choix ?|Un TCO, pas une morale. Petite équipe sans SRE → APM (temps ops > abonnement). Souveraineté des données / très gros volume / expertise obs interne → DIY self-hosted. OTel rend la bascule quasi gratuite côté code.
Pourquoi OTel/OTLP est-il l'assurance anti-lock-in ?|Si l'app émet en OTLP (pas via l'agent propriétaire d'un vendor), changer de backend = éditer la ligne exporters du collector OTel, PAS ré-instrumenter l'application. Le lock-in vit dans le code d'instrumentation, pas dans le contrat.
CPU, heap ou wall-clock profiling : lequel selon le symptôme ?|CPU saturé → CPU profile (fonctions de calcul). RAM qui monte / GC qui mouline → heap profile (allocations, fuites). Lent mais CPU bas (attente I/O) → wall-clock. Erreur classique : CPU profile sur un problème d'I/O → flamegraph vide.
Comment lit-on l'axe X d'un flamegraph ?|L'axe X n'est PAS le temps. La largeur = proportion d'échantillons (part du CPU) de la fonction et ses enfants ; l'ordre gauche-droite est alphabétique (fusion des frames), sans sens chronologique. Ce qui se lit en timeline, c'est une trace, pas un flamegraph.
Comment lit-on l'axe Y d'un flamegraph, et où est la coupable ?|Axe Y = profondeur de la pile d'appels : bas = racine/point d'entrée, haut = feuilles (fonctions réellement exécutées). La cible d'optimisation = la feuille la plus LARGE en haut ; on descend ensuite pour voir qui l'appelle. (Un icicle graph = même chose inversé, racine en haut.)
Continuous profiling vs profiling ponctuel ?|Ponctuel : à la demande, en dev, fichier local, rate les bugs intermittents. Continuous : en PRODUCTION 24/7, overhead < 1-2% CPU, historique conservé, permet un diff flamegraph avant/après déploiement (rouge = régression, vert = amélioration).
Pyroscope, Parca et le signal Profiles d'OTel ?|Pyroscope (Grafana, via SDK par langage) et Parca (Polar Signals, via eBPF système) sont les OSS de continuous profiling. OTel a stabilisé un 4e signal "Profiles" (2025) transporté en OTLP → un span lent peut pointer vers son flamegraph du moment exact (trace → profil).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-17-apm-et-profiling/README.md`. Brancher un **vrai Pyroscope** (conteneur `grafana/pyroscope`) sur une API Express, profiler un endpoint TribuZen **CPU-bound**, lire le flamegraph pour désigner la fonction coupable, corriger, et **re-profiler en diff** — grille d'analyse, coach en session, variante J+30.

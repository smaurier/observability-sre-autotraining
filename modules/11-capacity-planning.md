---
titre: Capacity Planning & Load Testing (k6)
cours: 16-observability-sre
notions: ["charge / débit / saturation", "saturation (la S de USE, module 03)", "load testing k6 (test lifecycle, thresholds, checks)", "closed model (VUs) vs open model (arrival-rate)", "ramping-arrival-rate & coordinated omission", "headroom & dimensionnement", "loi de Little", "prévision de croissance & predict_linear()"]
outcomes:
  - sait distinguer charge (offerte), débit (servi) et saturation, et lire la saturation comme la S de la méthode USE
  - sait écrire un test de charge k6 réaliste (lifecycle, executor arrival-rate, thresholds, checks) sans deviner l'API
  - sait choisir entre modèle fermé (VUs) et modèle ouvert (arrival-rate) et pourquoi le second révèle la vraie capacité
  - sait déduire un headroom et une date de saturation à partir d'un test de charge et de predict_linear()
prerequis: ["modules 00-10 du cours 16 (piliers, métriques Prometheus, RED/USE, SLO, alerting, incidents)", "module 02 — histogram & histogram_quantile", "module 03 — méthode USE et saturation"]
next: 12-chaos-engineering
libs: []
tribuzen: dimensionnement de l'API TribuZen — test de charge k6 sur /rsvp le soir d'un grand évènement, lecture de la saturation (pool DB, event-loop lag) et calcul du headroom avant la prochaine montée en charge
last-reviewed: 2026-07
---

# Capacity Planning & Load Testing (k6)

> **Outcomes — tu sauras FAIRE :** distinguer charge/débit/saturation, écrire un test de charge k6 (lifecycle, `ramping-arrival-rate`, thresholds, checks), choisir modèle fermé vs ouvert, déduire un headroom et une date de saturation via `predict_linear()`.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module couvre le **capacity planning** (charge, saturation, dimensionnement, prévision) et le **load testing avec k6**. Il s'appuie directement sur la **méthode USE du module 03** (la *S* = saturation) et sur les **histogrammes du module 02**. Il ne (re)couvre PAS : les **SLO/error budget** (module 08 — ici on teste la tenue d'un SLO, on ne le définit pas), l'**alerting** `predict_linear` en production (module 09 — ici on l'utilise pour projeter), la **résilience aux pannes** (module 12, `next`), l'**autoscaling k8s** (module 14). On reste sur : *combien de charge le système tient, avec quelle marge, et quand la marge s'épuise*.

## 1. Cas concret d'abord

TribuZen organise sa première grosse soirée : un lycée envoie **1 800 invitations RSVP** pour la même fête, fenêtre de réponse de 19 h à 20 h. La question de la CTO, mardi en réunion : *« est-ce que l'API tient si 1 800 parents cliquent* Confirmer ma présence *dans la même heure, avec un pic à l'ouverture ? »*

Tu ne peux pas répondre « oui » à l'instinct. Tu ne peux pas non plus attendre 19 h et prier. Il te faut **produire la charge toi-même**, en amont, et **mesurer** où ça casse.

Tu traduis d'abord la question en trafic. 1 800 RSVP sur 1 h ≈ **0,5 req/s** en moyenne — ridicule. Mais un pic d'ouverture réaliste, c'est ~40 % des réponses dans les 5 premières minutes : `1800 * 0.4 / 300 ≈ 2,4 req/s` de moyenne sur le pic, avec des rafales à **10-15 req/s**. C'est *ça* qu'il faut injecter.

À la fin du module, tu lances ce test de charge k6 contre l'API TribuZen (docker-compose fourni), tu montes le débit **offert** de 5 à 30 req/s, et tu regardes deux courbes en parallèle :

```
Débit offert (k6, arrival-rate) ──►  5 → 15 → 30 req/s   (ce que tu DEMANDES)
Débit servi  (http_reqs Prometheus) ─►  5 → 15 → 22 req/s  (ce que l'API RÉUSSIT)
Saturation (pg pool, event-loop lag) ─►  20% → 60% → 98%   (la S de USE)
```

Le point où *offert* et *servi* **divergent** — ici vers 22 req/s pendant que la saturation du pool DB atteint 98 % — c'est la **capacité maximale** de l'API. Ton headroom par rapport au pic attendu (15 req/s) est `22 / 15 ≈ 1,45x`. Marge trop faible : tu documentes, tu proposes d'augmenter le pool ou d'ajouter une réplique **avant** la soirée. On construit chaque brique pour arriver à cette phrase.

---

## 2. Théorie complète, concise

### 2.1 Charge, débit, saturation — trois choses différentes

On confond sans arrêt trois grandeurs. Les séparer est la moitié du module.

- **Charge offerte** (*offered load*) : ce que les clients **demandent**, indépendamment de ta capacité. Mesurée en requêtes arrivant par seconde. C'est une *cause*.
- **Débit servi** (*throughput*) : ce que le système **réussit** à traiter par seconde. C'est un *effet*, plafonné par ta capacité.
- **Saturation** : à quel point une ressource est **remplie / en file d'attente**. C'est la *S* de la méthode **USE** (module 03) : Utilisation, **Saturation**, Erreurs.

Tant que le système n'est pas saturé, `débit servi ≈ charge offerte` et la latence est stable. Passé le **coude** (*knee*), la ressource goulot sature : le débit servi **plafonne** (voire s'effondre), la file grandit, la latence explose, les erreurs (timeouts, 503) apparaissent.

```
Latence
  │                                   ╱  ← s'envole (file d'attente)
  │                              ╱
  │________________________╱          ← coude (knee) = capacité max
  │  plat, stable
  └─────────────────────────────────► Charge offerte (req/s)
```

Le capacity planning, c'est trouver ce coude, mesurer la marge (**headroom**) entre le trafic actuel et ce coude, et prévoir **quand** la croissance va combler cette marge.

### 2.2 Loi de Little — le lien charge ↔ concurrence

La **loi de Little** relie trois grandeurs d'un système stable :

```
L = λ × W
L = nombre moyen de requêtes en cours (concurrence, "in flight")
λ = débit (req/s)
W = latence moyenne d'une requête (s)
```

Concrètement : si l'API TribuZen sert **λ = 20 req/s** avec une latence moyenne **W = 0,15 s**, alors `L = 20 × 0,15 = 3` requêtes en vol simultanément. Utilité directe : dimensionner un **pool de connexions DB** ou un nombre de workers. Si chaque requête RSVP tient une connexion DB pendant W et que tu veux servir λ, il te faut au moins `L = λ·W` connexions. Un pool de 10 sature à `10 / 0,15 ≈ 66 req/s` — au-delà, les requêtes font la queue pour une connexion. C'est *prévisible sans même lancer un test*.

Corollaire piège : si la latence **W monte** sous charge (contention), L monte plus vite que λ. C'est le cercle vicieux de la saturation.

### 2.3 Load testing : modèle fermé (VUs) vs modèle ouvert (arrival-rate)

C'est LE concept qui sépare un test de charge naïf d'un test de capacité correct.

**Modèle fermé** — un nombre fixe de **VUs** (*virtual users*) qui bouclent : chacun envoie une requête, **attend la réponse**, réfléchit (`sleep`), recommence. Le débit offert **dépend de la latence du serveur** : si le serveur ralentit, les VUs attendent, et… ils envoient **moins** de requêtes. Le test *se calme tout seul* quand le système souffre. On appelle ça le **coordinated omission** : tu masques exactement le problème que tu cherches. Utile pour simuler un nombre d'utilisateurs connectés (soak), pas pour trouver une capacité.

**Modèle ouvert** — tu fixes un **débit d'arrivée** (req/s) *indépendant* des réponses. Les nouvelles requêtes arrivent au rythme voulu même si les précédentes traînent — comme de vrais clients qui cliquent sans se coordonner avec ton serveur. La file grandit, la latence explose : tu **vois** la saturation. C'est le modèle correct pour répondre à « combien de req/s je tiens ». Dans k6, c'est la famille d'executors **`arrival-rate`**.

| | Modèle fermé (`ramping-vus`) | Modèle ouvert (`ramping-arrival-rate`) |
|---|---|---|
| On fixe | un nombre de VUs | un débit (iters/timeUnit) |
| Débit offert | dépend de la latence serveur | **indépendant** de la latence |
| Révèle la saturation | non (coordinated omission) | **oui** |
| Usage | # d'utilisateurs, soak | **capacity planning**, trouver le coude |

### 2.4 Anatomie d'un test k6 — le lifecycle

Source : docs k6, *Test lifecycle*. Un script k6 a **quatre étapes**, dans cet ordre.

```ts
// 1. INIT — hors de toute fonction. Imports, options, lecture de fichiers.
//    S'exécute une fois par VU. INTERDIT d'y faire des requêtes HTTP.
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = { /* vus/scenarios/thresholds — §2.5 */ }

// 2. SETUP — une seule fois, avant les VUs. Peut faire du HTTP.
//    Sa valeur de retour est passée à default() et teardown().
export function setup() {
  return { baseUrl: 'http://localhost:3000' }
}

// 3. DEFAULT (VU code) — bouclé en continu par chaque VU/itération.
//    Reçoit la donnée de setup(). C'est ici qu'on tape l'API.
export default function (data) {
  const res = http.post(`${data.baseUrl}/api/events/42/rsvp`, JSON.stringify({ status: 'yes' }), {
    headers: { 'Content-Type': 'application/json' },
  })
  check(res, { 'status 200/201': (r) => r.status === 200 || r.status === 201 })
}

// 4. TEARDOWN — une seule fois, après tous les VUs. Nettoyage/validation.
export function teardown(data) {
  // ex: purger les RSVP de test
}
```

Points vérifiés docs : l'**init** ne peut PAS faire de requête HTTP ; **setup** s'exécute une fois et doit finir sous `setupTimeout` (60 s par défaut) ; sa valeur de retour est **partagée** ; **teardown** est **sauté si setup jette**.

### 2.5 Executors — piloter le débit

Source : docs k6, *Executors*. Six executors ; deux comptent pour nous.

**`ramping-vus`** (modèle fermé) — fait varier le nombre de VUs par paliers (`stages`) :

```ts
export const options = {
  scenarios: {
    montee: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 },  // monte à 20 VUs
        { duration: '5m', target: 20 },  // tient 20 VUs
        { duration: '2m', target: 0 },   // redescend
      ],
    },
  },
}
```

**`ramping-arrival-rate`** (modèle ouvert — **celui du capacity planning**) — fait varier le **débit** d'itérations, k6 alloue les VUs qu'il faut :

```ts
export const options = {
  scenarios: {
    capacite: {
      executor: 'ramping-arrival-rate',
      startRate: 5,             // débit de départ
      timeUnit: '1s',           // ... par seconde → 5 iters/s
      preAllocatedVUs: 50,      // VUs réservés d'avance (obligatoire)
      maxVUs: 200,              // plafond si le serveur ralentit et qu'il faut + de VUs
      stages: [
        { target: 5,  duration: '1m' },   // palier 5 req/s
        { target: 15, duration: '3m' },   // monte à 15 req/s
        { target: 30, duration: '3m' },   // pousse à 30 req/s → cherche le coude
        { target: 0,  duration: '1m' },
      ],
    },
  },
}
```

`target` et `startRate` sont exprimés **par `timeUnit`**. Détail vérifié docs qui coûte cher : si le serveur ralentit, k6 a besoin de **plus** de VUs pour tenir le débit ; s'il atteint `maxVUs`, il **ne peut plus** injecter le débit demandé et loggue *"insufficient VUs"* — signe que tu es **déjà** au-delà de la capacité (à interpréter, pas à masquer en gonflant `maxVUs` à l'aveugle).

### 2.6 Thresholds & checks — critères pass/fail

Source : docs k6, *Thresholds* & *Checks*. Deux mécanismes distincts, souvent confondus.

- **check** = assertion **par requête**, booléenne. Un check faux **ne fait pas** échouer le test ; il alimente la métrique `checks` (taux de réussite).
- **threshold** = critère **global** sur une métrique agrégée. Un threshold non tenu fait **sortir k6 en code ≠ 0** — c'est lui qui casse la CI.

```ts
export const options = {
  thresholds: {
    // Trend : agrégations avg/min/max/med/p(N)
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    // Rate : proportion 0-1
    http_req_failed: ['rate<0.01'],   // < 1% d'échecs HTTP
    checks: ['rate>0.99'],            // > 99% des checks passent
    // threshold sur une métrique taguée (une sous-partie du trafic)
    'http_req_duration{endpoint:rsvp}': ['p(95)<300'],
  },
}
```

Format long, pour **abandonner** dès que ça part en vrille (utile en stress test) :

```ts
thresholds: {
  http_req_failed: [
    { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
  ],
}
```

`abortOnFail` stoppe le test si le seuil casse ; `delayAbortEval` laisse un délai de chauffe (30 s) avant d'évaluer, pour ne pas avorter sur le bruit du démarrage.

### 2.7 Lire la saturation pendant le test (le pont avec USE)

Un test k6 te donne le point de vue **client** (latence, erreurs, débit servi). Insuffisant seul : il te dit *que* ça casse, pas *où*. Pendant le test, tu regardes **en parallèle** les métriques serveur de la méthode USE (module 03), surtout la **saturation** :

| Ressource | Métrique de saturation | Ce qu'elle dit |
|---|---|---|
| Pool DB | connexions en attente / `pool_size` | requêtes en file pour une connexion |
| Event loop Node | `nodejs_eventloop_lag_seconds` | le CPU JS ne suit plus |
| CPU | run-queue length, `load` | plus de tâches prêtes que de cœurs |
| File / broker | profondeur de la file | messages qui s'accumulent |

Le diagnostic de capacité, c'est **corréler** : « le débit servi plafonne à 22 req/s **au moment où** le pool DB atteint 98 % de saturation » → le goulot est la **DB**, pas le CPU. Augmenter les répliques Node ne servirait à rien ; il faut agrandir le pool / la DB. C'est exactement le raisonnement USE, appliqué sous charge provoquée.

### 2.8 Headroom, dimensionnement et prévision de croissance

**Headroom** = marge = `capacité_max / charge_pic_actuelle`. Règle de métier courante : viser **2x-3x** de headroom. En dessous de ~1,5x, un pic imprévu ou une dégradation te met en incident.

Une fois la capacité connue par le test (ex. 22 req/s), la **prévision** répond à *quand* la croissance la comble. En PromQL, `predict_linear()` extrapole une tendance linéaire (vérifié docs Prometheus : `predict_linear(v range-vector, t scalar)` prédit la valeur `t` secondes plus tard) :

```promql
# débit de pointe projeté dans 30 jours, à partir de la tendance des 7 derniers jours
predict_linear(
  max_over_time( sum(rate(http_requests_total[5m]))[1d:1h] )[7d:1h],
  30 * 24 * 3600
)
```

Et la même logique pour une ressource brute — anticiper la saturation disque **avant** qu'elle arrive :

```promql
# le disque sera-t-il plein dans moins de 4 jours ? (alerte proactive, détaillée au module 09)
predict_linear(node_filesystem_avail_bytes{mountpoint="/"}[6h], 4 * 24 * 3600) < 0
```

`predict_linear` suppose une tendance **linéaire** : parfait pour un disque qui se remplit régulièrement, trompeur pour une croissance exponentielle ou saisonnière (une soirée d'école n'est pas une droite). Pour une croissance en %/mois, on projette en composé : `RPS_futur = RPS_actuel × (1 + g)^n`. Le test k6 donne le **numérateur** (capacité), la prévision donne le **dénominateur** dans le temps.

---

## 3. Worked examples

### Exemple 1 — test de capacité de `/rsvp`, de bout en bout

Objectif : répondre à la CTO. On monte le débit **offert** par paliers et on note où le débit servi diverge et où les thresholds cassent.

```ts
// k6/rsvp-capacity.ts — test de CAPACITÉ (modèle ouvert)
import http from 'k6/http'
import { check } from 'k6'
import { Trend } from 'k6/metrics'

// métrique custom : latence vue côté client, taguée pour l'analyse
const rsvpLatency = new Trend('rsvp_latency', true)

export const options = {
  scenarios: {
    capacite_rsvp: {
      executor: 'ramping-arrival-rate', // MODÈLE OUVERT : débit indépendant des réponses
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,           // si on atteint ce plafond → déjà au-delà de la capacité
      stages: [
        { target: 5,  duration: '1m' },  // échauffement
        { target: 15, duration: '3m' },  // pic attendu de la soirée
        { target: 30, duration: '3m' },  // au-delà : on CHERCHE le coude
        { target: 0,  duration: '30s' },
      ],
    },
  },
  thresholds: {
    // le SLO à tenir (défini au module 08) — ici on le VÉRIFIE sous charge
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  // une seule fois : on récupère un token de test (setup PEUT faire du HTTP)
  const res = http.post('http://localhost:3000/api/auth/login', JSON.stringify({
    email: 'loadtest@tribuzen.test', password: 'loadtest',
  }), { headers: { 'Content-Type': 'application/json' } })
  return { token: res.json('token'), baseUrl: 'http://localhost:3000' }
}

export default function (data) {
  const res = http.post(
    `${data.baseUrl}/api/events/42/rsvp`,
    JSON.stringify({ status: 'yes' }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` } },
  )
  rsvpLatency.add(res.timings.duration)
  check(res, {
    'rsvp accepté (2xx)': (r) => r.status >= 200 && r.status < 300,
    'pas de 5xx': (r) => r.status < 500,
  })
}
```

Lancement et lecture :

```bash
k6 run k6/rsvp-capacity.ts
```

```
     scenarios: (100.00%) 1 scenario, 300 max VUs, 7m30s max duration

     ✓ rsvp accepté (2xx)
     ✗ pas de 5xx
      ↳  3% — ✓ 8912 / ✗ 288

     checks.........................: 96.87%  ✓ 17824  ✗ 576
     http_req_duration..............: avg=210ms p(95)=740ms  ← p95 CASSE le seuil de 300ms
     http_req_failed................: 3.12%   ✓ 288   ✗ 8912
     http_reqs......................: 9200    22.3/s        ← plafonne à ~22 req/s
     ✗ http_req_duration..............: p(95)<300 ...... FAIL
     ✗ http_req_failed................: rate<0.01 ...... FAIL
```

Interprétation : le débit **servi** plafonne à **22,3 req/s** alors que k6 poussait vers 30 — divergence = **coude atteint**. Les 5xx et le p95 explosent au 3ᵉ palier. En regardant Grafana en parallèle, `pg_pool_waiting` grimpe pendant que CPU reste à 55 % → **goulot = pool DB**. Réponse à la CTO : *l'API tient le pic attendu de 15 req/s (headroom ≈ 1,5x, faible), casse vers 22 req/s ; goulot = connexions DB ; action = passer le pool de 10 à 25 et re-tester avant la soirée.*

### Exemple 2 — du test à la date de saturation

Le test donne **capacité = 22 req/s**. Le trafic de pointe actuel est **8 req/s** et croît de **12 %/mois**. Quand comble-t-on le headroom ?

```ts
// combien de mois avant que le pic atteigne la capacité testée ?
// capacité = pic_actuel × (1 + g)^n  →  n = ln(cap/pic) / ln(1+g)
function monthsUntilSaturation(peakRps: number, capacityRps: number, growthPctPerMonth: number): number {
  const g = growthPctPerMonth / 100
  return Math.floor(Math.log(capacityRps / peakRps) / Math.log(1 + g))
}

const n = monthsUntilSaturation(8, 22, 12)
console.log(`Saturation du pic dans ~${n} mois`) // Saturation du pic dans ~8 mois
```

Et la vérification côté Prometheus, sur la tendance réelle plutôt qu'un taux supposé :

```promql
# pic quotidien projeté à 60 jours d'après la tendance des 14 derniers jours
predict_linear(
  max_over_time( sum(rate(http_requests_total[5m]))[1d:5m] )[14d:1h],
  60 * 24 * 3600
)
```

Décision : ~8 mois de marge *si* la DB n'est pas déjà le goulot à 22 req/s. Comme elle l'est, on agrandit le pool **maintenant**, on re-teste, et on re-projette — le capacity plan est un document **vivant**, pas un one-shot.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — tester avec des VUs pour trouver une capacité (coordinated omission)

`ramping-vus` avec `sleep()` : quand le serveur ralentit, les VUs **attendent** et envoient moins de requêtes. Le débit offert s'auto-régule vers le bas → tu ne satures jamais → tu conclus faussement « ça tient ». Pour chercher un coude, il **faut** un executor `arrival-rate` (modèle ouvert) qui maintient le débit *quoi qu'il arrive*.

### PIÈGE #2 — confondre check et threshold

Un `check` faux **n'échoue pas** le test (il n'affecte que la métrique `checks`). Croire qu'un check protège la CI est une erreur classique : la CI passe au vert alors que 30 % des requêtes sont en 500. Seul un **threshold** fait sortir k6 en code ≠ 0. Règle : `check` pour observer, `threshold` pour décider pass/fail.

### PIÈGE #3 — lire le débit offert au lieu du débit servi

`http_reqs` = requêtes **complétées**. Si tu regardes seulement « k6 vise 30 req/s », tu crois tenir 30. Il faut lire ce qui est **réellement servi** (débit + erreurs). Offert ≠ servi dès que ça sature — c'est précisément la divergence qui révèle la capacité.

### PIÈGE #4 — tester contre une cible non représentative

Base vide, pas de latence réseau, cache tout chaud, une seule réplique alors que la prod en a trois : le chiffre obtenu ne veut rien dire. Un test de capacité doit tourner sur un environnement **iso-prod** (mêmes ressources, données réalistes, mêmes dépendances). Sinon tu mesures la capacité d'un système qui n'existe pas.

### PIÈGE #5 — extrapoler linéairement une croissance qui ne l'est pas

`predict_linear` **suppose une droite**. L'appliquer à une croissance exponentielle sous-estime la date de saturation ; l'appliquer à un signal saisonnier (soirées d'école groupées) donne n'importe quoi. Vérifie la forme de la tendance avant de faire confiance à la projection ; pour du %/mois, projette en composé.

### PIÈGE #6 — augmenter la mauvaise ressource

Le débit plafonne, réflexe : « ajoutons des répliques ». Mais si le goulot est le **pool DB** (saturation `pg_pool_waiting`), plus de répliques Node ne font qu'**aggraver** la contention DB. Sans lire la **saturation** (USE, §2.7), on dépense au mauvais endroit. Le bottleneck est rarement là où on croit — mesure, ne devine pas.

---

## 5. Ancrage TribuZen

Ce module donne à TribuZen sa **capacité chiffrée** et son **plan de dimensionnement**, avant les soirées à fort trafic.

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  k6/
    rsvp-capacity.ts     ← test de capacité arrival-rate (Exemple 1)
    smoke.ts             ← smoke test léger (5 req/s, 30s) joué en CI sur chaque PR
    lib/
      auth.ts            ← helper de login réutilisé par setup()
  ops/
    capacity-plan.md     ← doc vivant : capacité mesurée, headroom, date de saturation
    grafana/
      load-test.json     ← dashboard "offert vs servi vs saturation" regardé pendant le run
```

Chaîne complète du fil rouge :
- le test k6 **produit** la charge sur les métriques posées au **module 02** (`http_requests_total`, `http_request_duration_seconds`) ;
- on lit la **saturation** avec la méthode USE du **module 03** (`pg_pool_waiting`, `nodejs_eventloop_lag_seconds`) ;
- les **thresholds** vérifient le SLO défini au **module 08** *sous charge réelle* ;
- `predict_linear` alimentera plus tard une **alerte proactive** (module 09) « saturation disque dans < 4 j ».

Livrable concret : `ops/capacity-plan.md` contient la phrase *« l'API RSVP tient 22 req/s avant dégradation ; goulot = pool PG ; headroom 1,5x sur le pic actuel ; re-tester après passage du pool à 25 »*. C'est exactement l'info que réclamait la CTO au §1 — et le genre de doc qui évite un incident un vendredi soir.

---

## 6. Points clés

1. **Charge offerte** (demandée) ≠ **débit servi** (réussi) ≠ **saturation** (remplissage/file = la *S* de USE). Les séparer est le cœur du module.
2. La **capacité max** = le **coude** où débit servi et charge offerte **divergent** et où la latence s'envole ; c'est ce qu'un test de charge cherche.
3. **Loi de Little** `L = λ·W` : relie débit, latence et concurrence ; dimensionne pools/workers sans même lancer un test.
4. **Modèle fermé (VUs)** régule le débit selon la latence serveur → **coordinated omission**, masque la saturation. **Modèle ouvert (arrival-rate)** maintient le débit → révèle la capacité. Pour un capacity test, `ramping-arrival-rate`.
5. k6 **lifecycle** : init (pas de HTTP) → `setup()` (une fois, HTTP ok, valeur partagée) → `default()` (VU code bouclé) → `teardown()` (une fois, sauté si setup jette).
6. **check** = assertion par requête, n'échoue PAS le test ; **threshold** = critère global, sort en code ≠ 0 et casse la CI. `abortOnFail`/`delayAbortEval` pour stopper proprement.
7. Un test donne le point de vue **client** ; corréler avec la **saturation** serveur (USE) dit *où* est le goulot — augmenter la bonne ressource.
8. **Headroom** = `capacité / pic_actuel`, viser 2x-3x. **`predict_linear()`** projette une tendance **linéaire** pour la date de saturation ; croissance en %/mois → projection composée.

---

## 7. Seeds Anki

```
Charge offerte vs débit servi vs saturation ?|Charge offerte = ce que les clients DEMANDENT (req/s arrivant, une cause). Débit servi = ce que le système RÉUSSIT à traiter (un effet, plafonné). Saturation = à quel point une ressource est remplie/en file = la S de la méthode USE. Tant que non saturé, servi ≈ offert ; au coude, servi plafonne et la latence explose.
Pourquoi un test à VUs (modèle fermé) ne trouve-t-il pas la capacité ?|Coordinated omission : chaque VU attend la réponse avant de renvoyer. Quand le serveur ralentit, les VUs attendent et injectent MOINS de charge → le test s'auto-régule et ne sature jamais. Pour trouver le coude il faut un modèle ouvert (arrival-rate) qui maintient le débit indépendamment des réponses.
Quel executor k6 pour un test de capacité, et ses options clés ?|ramping-arrival-rate (modèle ouvert). Options : startRate + timeUnit (débit de départ par unité), preAllocatedVUs (obligatoire), maxVUs (plafond), stages [{target, duration}] où target = débit visé par timeUnit. Atteindre maxVUs = déjà au-delà de la capacité.
check vs threshold en k6 ?|check = assertion booléenne PAR requête ; un check faux N'échoue PAS le test, il alimente la métrique checks. threshold = critère GLOBAL sur une métrique agrégée (ex http_req_duration: ['p(95)<300']) ; non tenu → k6 sort en code ≠ 0 et casse la CI. check pour observer, threshold pour décider.
Les 4 étapes du lifecycle k6 ?|1) init (hors fonction, imports/options, PAS de HTTP, une fois par VU). 2) setup() (une fois, HTTP autorisé, retour partagé à default/teardown, timeout 60s). 3) default(data) (VU code, bouclé en continu). 4) teardown(data) (une fois à la fin, SAUTÉ si setup jette).
Loi de Little et son usage capacité ?|L = λ·W : concurrence moyenne = débit × latence. Sert à dimensionner un pool/workers : pour servir λ req/s avec latence W, il faut au moins L = λ·W connexions. Un pool de 10 à W=0,15s sature vers 66 req/s. Piège : si W monte sous charge, L monte plus vite que λ (cercle vicieux).
Headroom : définition et cible ?|Headroom = capacité_max / charge_pic_actuelle (marge). Cible métier courante 2x-3x ; sous ~1,5x, un pic ou une dégradation = incident. Mesuré par un test de charge (capacité) rapporté au trafic de pointe réel.
Que fait predict_linear() et quelle est sa limite ?|predict_linear(v range-vector, t scalar) extrapole LINÉAIREMENT la tendance de v et prédit la valeur t secondes plus tard (ex : disque plein dans 4 jours). Limite : suppose une droite → faux pour une croissance exponentielle ou saisonnière. Pour du %/mois, projeter en composé (1+g)^n.
Test de charge : pourquoi corréler avec la saturation serveur ?|Le test donne le point de vue CLIENT (latence/erreurs/débit servi) : il dit QUE ça casse, pas OÙ. En lisant la saturation serveur (USE : pool DB en attente, event-loop lag, run-queue), on identifie le goulot. Sinon on augmente la mauvaise ressource (ex : + de répliques Node alors que le goulot est le pool DB).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-11-capacity-planning/README.md`. Écrire un test de charge k6 `ramping-arrival-rate` contre l'API TribuZen (docker-compose fourni), pousser jusqu'au coude, lire la saturation dans Grafana, et rédiger la ligne de capacity plan (capacité, goulot, headroom). Corrigé commenté, coach en session, variante J+30.

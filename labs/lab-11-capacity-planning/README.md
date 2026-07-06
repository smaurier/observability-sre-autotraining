# Lab 11 — Capacity Planning & Load Testing (k6)

> **Outcome :** à la fin, tu sais écrire un test de charge k6 en **modèle ouvert** (`ramping-arrival-rate`) contre l'API TribuZen, pousser le débit jusqu'au **coude**, **lire la saturation** dans Grafana pour identifier le goulot, et rédiger la ligne de capacity plan (capacité, goulot, headroom).
> **Vrai outil :** k6 (Grafana) + le docker-compose `full` du cours (API TribuZen instrumentée + Prometheus + Grafana). Aucun harnais simulé.
> **Feedback :** le coach valide en session — la lecture des courbes et du diagnostic se fait à deux, il n'y a pas d'auto-correcteur.

---

## Prérequis

- Modules **02** (métriques Prometheus, `http_requests_total`, histogram), **03** (méthode USE, saturation) et **11** lus.
- k6 installé (`k6 version`) — voir docs officielles `grafana.com/docs/k6`.
- Le docker-compose `full` du cours lancé à la racine `16-observability-sre/` :

```bash
docker compose -f docker-compose.full.yml up -d   # demo-app (API TribuZen) + Prometheus + Grafana
curl localhost:3000/metrics                 # doit lister http_requests_total, http_request_duration_seconds_bucket
```

> Si le compose n'expose pas encore `/api/events/:id/rsvp`, utilise l'endpoint de démonstration équivalent fourni (`/api/rsvp-demo`) — l'exercice porte sur la **méthode**, pas sur la route exacte.

---

## Énoncé

La CTO de TribuZen te pose la question du module : *« l'API RSVP tient-elle le soir d'un grand évènement, avec un pic d'ouverture ? »* Le pic attendu est **~15 req/s**. Tu dois répondre par un **chiffre de capacité**, un **goulot identifié**, et un **headroom**.

Tu écris un script k6 `k6/rsvp-capacity.ts` qui :

1. utilise l'executor **`ramping-arrival-rate`** (modèle ouvert — c'est le point noté) ;
2. monte le débit offert par paliers : **5 → 15 → 30 req/s**, puis redescend ;
3. envoie un `POST` RSVP par itération, avec un **check** `2xx` et un **check** « pas de 5xx » ;
4. déclare des **thresholds** qui reflètent le SLO : `http_req_duration: ['p(95)<300']` et `http_req_failed: ['rate<0.01']` ;
5. récupère un token **une seule fois** dans `setup()` (pas à chaque itération).

Puis tu **lances** le test, tu ouvres **Grafana en parallèle**, et tu **rédiges** dans `ops/capacity-plan.md` une ligne du type : *« capacité ≈ N req/s ; goulot = X ; headroom = N/15 ; action = … »*.

**Pas de gap-fill** — tu écris le script complet à partir du starter.

### Starter minimal

```ts
// k6/rsvp-capacity.ts — starter
import http from 'k6/http'
import { check } from 'k6'

export const options = {
  scenarios: {
    // À toi : executor 'ramping-arrival-rate', startRate, timeUnit,
    //         preAllocatedVUs, maxVUs, stages 5 → 15 → 30 → 0
  },
  thresholds: {
    // À toi : http_req_duration p(95)<300, http_req_failed rate<0.01
  },
}

export function setup() {
  // À toi : login une seule fois, retourner { token, baseUrl }
}

export default function (data) {
  // À toi : POST RSVP + 2 checks
}
```

---

## Étapes (en friction)

1. **Choisis l'executor** — `ramping-arrival-rate`. Écris `startRate: 5`, `timeUnit: '1s'`, `preAllocatedVUs: 50`, `maxVUs: 300`. Demande-toi : *pourquoi pas `ramping-vus` ?* (réponse dans ta tête avant de continuer : coordinated omission).
2. **Écris les `stages`** — trois paliers montants `{ target, duration }` : 5 req/s (1m), 15 req/s (3m), 30 req/s (3m), puis 0 (30s).
3. **Écris `setup()`** — un `http.post` de login, `return { token: res.json('token'), baseUrl: 'http://localhost:3000' }`. Vérifie que setup a bien le droit de faire du HTTP (oui — contrairement à l'init).
4. **Écris `default(data)`** — `POST` sur la route RSVP avec le `Authorization: Bearer`, puis deux `check` : `2xx` et `status < 500`.
5. **Ajoute les `thresholds`** — `http_req_duration: ['p(95)<300']`, `http_req_failed: ['rate<0.01']`, `checks: ['rate>0.99']`.
6. **Lance** — `k6 run k6/rsvp-capacity.ts`. Note dans le résumé : `http_reqs` (débit **servi** réel), `http_req_duration p(95)`, `http_req_failed`.
7. **Ouvre Grafana en parallèle** — regarde `sum(rate(http_requests_total[1m]))` (servi) vs le débit offert par k6, ET une métrique de **saturation** (`nodejs_eventloop_lag_seconds` et/ou l'attente du pool DB). Repère **l'instant** où servi plafonne.
8. **Diagnostique** — au moment du plateau, **quelle** ressource sature ? C'est ton goulot. Note la capacité (le débit servi au plateau).
9. **Rédige la ligne de capacity plan** — capacité, goulot, `headroom = capacité / 15`, action recommandée.

---

## Corrigé complet commenté

```ts
// k6/rsvp-capacity.ts — corrigé
import http from 'k6/http'
import { check } from 'k6'
import { Trend } from 'k6/metrics'

// Métrique custom : latence RSVP vue client, en plus des métriques HTTP standard.
// 2e argument true = isTime → k6 la formate en durée dans le résumé.
const rsvpLatency = new Trend('rsvp_latency', true)

export const options = {
  scenarios: {
    capacite_rsvp: {
      // MODÈLE OUVERT : le débit est maintenu quoi que fasse le serveur.
      // C'est ce qui révèle le coude ; ramping-vus le masquerait (coordinated omission).
      executor: 'ramping-arrival-rate',
      startRate: 5,            // 5 itérations...
      timeUnit: '1s',          // ...par seconde → 5 req/s au départ
      preAllocatedVUs: 50,     // VUs réservés d'avance (obligatoire pour arrival-rate)
      maxVUs: 300,             // plafond : si k6 doit dépasser ça pour tenir le débit,
                               // c'est que le serveur est DÉJÀ au-delà de sa capacité
      stages: [
        { target: 5,  duration: '1m' },  // échauffement, cache chaud
        { target: 15, duration: '3m' },  // pic attendu de la soirée
        { target: 30, duration: '3m' },  // au-delà : on CHERCHE le coude
        { target: 0,  duration: '30s' }, // cooldown
      ],
    },
  },
  thresholds: {
    // On VÉRIFIE le SLO (défini au module 08) SOUS charge réelle.
    // Un threshold non tenu → k6 sort en code ≠ 0 → la CI échoue.
    http_req_duration: ['p(95)<300'],  // p95 < 300 ms
    http_req_failed: ['rate<0.01'],    // < 1% d'échecs HTTP
    checks: ['rate>0.99'],             // > 99% des checks passent
  },
}

// setup() : s'exécute UNE SEULE FOIS avant les VUs. A le droit de faire du HTTP
// (l'init n'a pas ce droit). Sa valeur de retour est partagée à toutes les itérations.
export function setup() {
  const res = http.post(
    'http://localhost:3000/api/auth/login',
    JSON.stringify({ email: 'loadtest@tribuzen.test', password: 'loadtest' }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  // On récupère le token une fois — surtout PAS un login par itération
  // (ça mesurerait la capacité du login, pas celle de /rsvp).
  return { token: res.json('token'), baseUrl: 'http://localhost:3000' }
}

// default() : le VU code, bouclé en continu. Reçoit la donnée de setup().
export default function (data) {
  const res = http.post(
    `${data.baseUrl}/api/events/42/rsvp`,
    JSON.stringify({ status: 'yes' }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` } },
  )

  rsvpLatency.add(res.timings.duration)

  // check = assertion PAR requête. Un check faux N'échoue PAS le test :
  // il alimente la métrique `checks`. C'est le threshold qui décide pass/fail.
  check(res, {
    'rsvp accepté (2xx)': (r) => r.status >= 200 && r.status < 300,
    'pas de 5xx': (r) => r.status < 500,
  })
}
```

**Comment lire le résultat (le vrai livrable du lab) :**

```
     checks.........................: 96.9%   ✓ 17824  ✗ 576
     http_req_duration..............: avg=210ms p(95)=740ms   ← casse le seuil 300ms
     http_req_failed................: 3.1%
     http_reqs......................: 9200    22.3/s          ← DÉBIT SERVI plafonne à ~22
     ✗ http_req_duration..............: p(95)<300 ...... FAIL
```

- **Capacité ≈ 22 req/s** : k6 poussait vers 30, l'API n'en sert que 22 → divergence = **coude**.
- **Goulot** : dans Grafana, au moment du plateau, `pg_pool_waiting` grimpe pendant que le CPU reste à ~55 % → goulot = **pool DB**, pas le CPU.
- **Headroom** = `22 / 15 ≈ 1,45x` → **trop faible** (cible 2x-3x).
- **Ligne de capacity plan** :
  > `RSVP : capacité ≈ 22 req/s ; goulot = pool PG (saturation à 30 req/s) ; headroom 1,45x sur le pic de 15 req/s ; action = pool 10 → 25 + re-tester avant la soirée.`

**Pourquoi ce corrigé est correct :**
- `ramping-arrival-rate` (et non `ramping-vus`) : sans ça, les VUs ralentiraient avec le serveur et tu ne verrais jamais le coude.
- Le login est dans `setup()`, une fois — sinon tu mesurerais surtout `/auth/login`.
- On distingue **débit offert** (ce que k6 vise) et **débit servi** (`http_reqs`) : c'est leur divergence qui donne la capacité.
- Le diagnostic vient de la **saturation** serveur (USE, module 03), pas des seules métriques client k6.

---

## Grille d'évaluation (le coach coche)

| Critère | Attendu | OK ? |
|---|---|---|
| Executor | `ramping-arrival-rate` (pas `ramping-vus`) et sait **pourquoi** | ☐ |
| Options arrival-rate | `startRate`, `timeUnit`, `preAllocatedVUs`, `maxVUs`, `stages` corrects | ☐ |
| Lifecycle | login dans `setup()` (une fois), pas dans `default()` | ☐ |
| check vs threshold | 2 checks + 2 thresholds, et sait lequel casse la CI | ☐ |
| Débit servi vs offert | lit `http_reqs` comme le **servi** et repère la divergence | ☐ |
| Saturation / goulot | identifie le goulot via une métrique USE dans Grafana | ☐ |
| Headroom | calcule `capacité / pic` et le compare à la cible 2x-3x | ☐ |
| Livrable | ligne de capacity plan rédigée (capacité + goulot + headroom + action) | ☐ |

---

## Notes coach (à dérouler en session)

- **Relance si silence** : « avant de lancer — pourquoi `arrival-rate` et pas `vus` ici ? » S'il hésite, faire décrire ce qui se passe côté VUs quand le serveur ralentit (coordinated omission).
- **Piège à provoquer** : demander « ton test est vert, donc l'API tient 30 req/s ? » — vérifier qu'il regarde `http_reqs` (servi) et pas seulement le débit visé par k6.
- **Ne pas se contenter du résumé k6** : forcer l'ouverture de Grafana. Le point pédagogique du module, c'est **corréler** client (k6) et serveur (USE). Sans saturation lue, le diagnostic « goulot = DB » n'est qu'une supposition.
- **Si tout passe (pas de coude à 30 req/s)** : faire **monter les paliers** (50, 80…) jusqu'à voir la divergence — un test qui ne sature jamais n'a pas trouvé la capacité.
- **Louange calibrée** : féliciter seulement si Sylvain a écrit le script *sans* recopier le corrigé ET a produit un diagnostic goulot argumenté. Un script qui tourne n'est pas l'objectif ; la **lecture** l'est.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées** (sans rouvrir ce corrigé ni le module 11), en **30 minutes** :

1. Ajoute un **second scénario** dans le même fichier : un **spike** (`ramping-arrival-rate` qui saute de 5 à 60 req/s en 20 s, tient 40 s, redescend) tournant *après* le test de montée — vérifie que l'API **récupère** après le pic (latence qui redescend).
2. Ajoute un **threshold tagué** : `'http_req_duration{scenario:spike}': ['p(95)<800']` (le pic a droit à une cible plus lâche que la montée).
3. Rédige **deux** lignes de capacity plan : une pour la montée, une pour le spike, et conclus si le headroom est suffisant pour la soirée.

**Critère de réussite :** les deux scénarios tournent, tu distingues débit offert / servi / saturation sur chacun, et ta conclusion headroom est chiffrée et argumentée par le goulot observé.

---

## Application TribuZen

Dans `smaurier/tribuzen`, le test vit ici :

```
tribuzen/
  k6/
    rsvp-capacity.ts     ← ce lab
    smoke.ts             ← version 5 req/s / 30s jouée en CI sur chaque PR (thresholds lâches)
    lib/auth.ts          ← helper de login partagé
  ops/
    capacity-plan.md     ← document VIVANT : capacité, goulot, headroom, date de saturation
```

**Différences avec le lab :**
- En CI (GitHub Actions), on ne joue que `smoke.ts` (léger, rapide) sur chaque PR ; le test de capacité complet tourne en **staging**, planifié, pas sur chaque commit.
- Le token de test viendra d'un **compte de charge dédié** (variable d'env / secret), jamais un compte réel.
- `capacity-plan.md` est **relu chaque mois** et après chaque changement d'infra (pool DB, répliques) — on re-teste et on re-projette avec `predict_linear` (module 09 pour l'alerte proactive).

**Commit cible :**
```
test(load): rsvp-capacity k6 — arrival-rate 5→30 req/s, thresholds SLO, capacity plan
```

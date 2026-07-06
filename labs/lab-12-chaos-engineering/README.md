# Lab 12 — Chaos Engineering : concevoir et mener un game day sur TribuZen

> **Outcome :** à la fin, tu sais transformer une inquiétude vague (« /rsvp gère-t-il une base lente ? ») en une **expérience de chaos rigoureuse** : hypothèse falsifiable, steady state mesuré, blast radius contenu, injection réelle, observation RED en direct, abort conditions et **rollback prouvé** — le tout sur le TribuZen instrumenté des modules 02-11.
> **Vrai outil :** le docker-compose `full` du cours (API TribuZen + Prometheus + Grafana) **+** Toxiproxy (proxy réseau devant PostgreSQL) OU l'API de chaos applicative. Aucun harnais simulé, aucun auto-correcteur.
> **Feedback :** le coach joue le **facilitateur** du game day en session (tient le kill switch, provoque les décisions). La lecture des courbes et la décision d'arrêt se font à deux.

---

## Prérequis

- Modules **02** (métriques, `http_requests_total`, histogram), **03** (RED), **08** (SLO → abort conditions), **09** (alerting), **10** (postmortem) et **12** lus.
- Le docker-compose `full` du cours lancé à la racine `16-observability-sre/`, **plus** Toxiproxy devant Postgres :

```bash
docker compose -f compose.full.yml up -d          # API TribuZen + Prometheus + Grafana
docker run -d --name toxiproxy -p 8474:8474 -p 25432:25432 \
  ghcr.io/shopify/toxiproxy                        # proxy admin :8474, tunnel :25432
curl localhost:3000/metrics                        # doit lister http_requests_total, *_duration_seconds_bucket
```

> Si ton compose branche déjà l'API sur PostgreSQL en direct, reconfigure l'API pour qu'elle passe par le proxy (`DATABASE_URL=postgres://...@toxiproxy:25432/tribuzen`), puis crée le proxy Toxiproxy `pg` (upstream `postgres:5432`, listen `0.0.0.0:25432`). C'est ce tunnel qu'on va dégrader **sans toucher au code applicatif**.
> Si tu n'as pas Toxiproxy sous la main, l'API TribuZen expose une **API de chaos applicative** équivalente (`POST /chaos/enable` protégée par `CHAOS_ALLOWED=true`) — l'exercice porte sur la **méthode**, pas sur l'outil d'injection exact.

---

## Énoncé

La CTO de TribuZen te demande : *« si la base ralentit pendant l'ouverture des inscriptions un samedi soir, est-ce que /rsvp tient, ou est-ce qu'on prend un mur ? »*. Tu **ne devines pas** : tu montes un **game day**.

Tu produis **deux livrables** :

1. **Une fiche d'expérience** `ops/chaos/gameday-01-rsvp-db-latency.md` — c'est le point noté n°1. Elle contient, écrits AVANT toute injection :
   - le **steady state** : les 3 SLI RED de `/rsvp` mesurés en baseline dans Grafana (débit, taux d'erreur, p99) ;
   - une **hypothèse falsifiable** au format `Si <injection> sur <cible> pendant <durée>, alors <SLI> reste <seuil>, PARCE QUE <mécanisme>` ;
   - le **blast radius** : périmètre + dose + durée, et le **niveau** (staging = niveau 1) ;
   - les **abort conditions** chiffrées (au moins 3, dont une « perte de données → abort immédiat ») ;
   - le **kill switch** et la procédure de **rollback**.

2. **Le déroulé + le verdict** `ops/chaos/gameday-report-01.md` — le point noté n°2 : tu **mènes** l'expérience, tu lis les 3 SLI en direct, tu décides (tenir ou abort), tu **coupes**, tu **prouves la récupération**, et tu écris le verdict (hypothèse confirmée/réfutée) + les actions de suivi.

L'injection concrète : **+800 ms de latence sur 30 % des connexions PostgreSQL pendant 5 min** (toxic Toxiproxy `latency`, `latency=800`, `jitter=100`, `toxicity=0.3`), OU l'équivalent applicatif (latence sur 30 % des `POST /api/events/:id/rsvp`).

**Pas de gap-fill** — tu écris les deux fiches et tu pilotes le game day. Le coach tient le kill switch et te pousse à décider.

### Starter — la fiche à compléter

```md
<!-- ops/chaos/gameday-01-rsvp-db-latency.md — starter -->
# Game day #1 — Résilience de /rsvp à une latence base de données

## Steady state (mesuré AVANT, capture Grafana)
- débit /rsvp ........... <à mesurer> req/s
- taux d'erreur /rsvp ... <à mesurer> %
- p99 latence /rsvp ..... <à mesurer> ms

## Hypothèse
Si <injection> sur <cible> pendant <durée>,
alors <SLI reste sous seuil>, PARCE QUE <mécanisme de résilience>.

## Blast radius
- périmètre : <route ? tout l'API ?>
- dose : <% de requêtes / ampleur>
- durée : <minutes>
- niveau : <staging = 1 ?>

## Abort conditions (arrêt immédiat si franchi > 30 s)
- <seuil 1>
- <seuil 2>
- <perte de données → abort IMMÉDIAT>

## Kill switch  : <comment couper en 1 action, TESTÉ à blanc avant>
## Rollback     : <couper + prouver le retour à la baseline + nettoyer>
```

### Injection Toxiproxy (référence de commandes)

```bash
# créer le proxy pg (une fois)
curl -X POST localhost:8474/proxies -d '{
  "name":"pg","listen":"0.0.0.0:25432","upstream":"postgres:5432"}'

# INJECTER : +800 ms sur 30 % des connexions
curl -X POST localhost:8474/proxies/pg/toxics -d '{
  "name":"pg_latency","type":"latency","toxicity":0.3,
  "attributes":{"latency":800,"jitter":100}}'

# KILL SWITCH : retirer le toxic (annule l'injection en 1 action)
curl -X DELETE localhost:8474/proxies/pg/toxics/pg_latency
```

---

## Étapes (en friction)

1. **Mesure le steady state D'ABORD.** Ouvre Grafana, génère un peu de trafic `/rsvp` (le générateur du lab 11 ou un `k6 run` léger), et **note les 3 SLI RED** en baseline. Interdit d'injecter quoi que ce soit tant que tu ne sais pas mesurer l'état normal — sinon tu ne verras pas l'écart.
2. **Écris l'hypothèse au format imposé**, avec le **« parce que »**. Demande-toi à voix haute : *quel mécanisme est censé absorber cette latence ?* Si tu ne peux pas nommer le mécanisme (timeout ? circuit breaker ?), c'est déjà un signal.
3. **Dimensionne le blast radius** — la plus petite dose qui peut encore réfuter l'hypothèse. Pourquoi 30 % et pas 100 % ? Pourquoi 5 min et pas 30 ? Pourquoi une seule route ?
4. **Écris les abort conditions chiffrées** (≥ 3). Réutilise tes SLO du module 08, en plus strict.
5. **TESTE le kill switch à blanc** — ajoute puis retire le toxic **sans charge**, vérifie que la commande DELETE fonctionne. Un kill switch découvert cassé pendant l'incident = échec du lab.
6. **Vérifie les garde-fous** — `/health` et `/metrics` ne passent PAS par le proxy dégradé. Confirme-le.
7. **Lance le game day** : démarre le trafic, **injecte** le toxic, et **regarde les 3 SLI en direct** dans Grafana. Ne quitte pas l'écran.
8. **Décide.** À chaque instant : les SLI sont-ils sous les seuils d'hypothèse ? Une abort condition est-elle franchie ? Si oui → **coupe immédiatement** (kill switch).
9. **Rollback complet** : retire le toxic, puis **prouve** que les 3 SLI redescendent à la baseline (ne te contente pas de « ça a l'air ok »). Nettoie (proxy, données de test).
10. **Écris le verdict** dans `gameday-report-01.md` : hypothèse confirmée ou réfutée ? Quel mécanisme manquait ? Quelles actions de suivi (avec « re-jouer LE MÊME game day après le fix ») ?

---

## Corrigé complet commenté

### 1. La fiche d'expérience (livrable 1)

```md
# Game day #1 — Résilience de /rsvp à une latence base de données

## Steady state (mesuré AVANT, capture Grafana, trafic ~6 req/s)
- débit /rsvp ........... 6 req/s
- taux d'erreur /rsvp ... 0,2 %
- p99 latence /rsvp ..... 280 ms

## Hypothèse
Si j'ajoute +800 ms (jitter 100) à 30 % des connexions PostgreSQL de /rsvp
pendant 5 min, alors le taux d'erreur /rsvp reste < 1 % ET le p99 < 1,5 s,
PARCE QUE l'écriture RSVP a un timeout de 2 s et renvoie une 503 propre
au lieu d'attendre la base indéfiniment.

## Blast radius
- périmètre : la route /rsvp uniquement (via le proxy pg, pas les autres services)
- dose : 30 % des connexions, +800 ms (≪ un timeout de 2 s, choisi exprès pour rester sous le seuil SI le timeout existe)
- durée : 5 min
- niveau : 1 (staging / local) — on n'ira en prod (niveau 2) que si ce cran passe

## Abort conditions (arrêt immédiat si franchi > 30 s)
- taux d'erreur /rsvp > 5 %
- p99 latence /rsvp > 2 s
- toute perte d'un RSVP confirmé (écrit puis introuvable) → ABORT IMMÉDIAT

## Kill switch
DELETE /proxies/pg/toxics/pg_latency  — testé à blanc à 13h55, OK.

## Rollback
1. retirer le toxic (kill switch)
2. prouver en Grafana que débit/erreur/p99 reviennent à la baseline (280 ms) en < 2 min
3. supprimer le proxy de test + purger les RSVP de charge (compte loadtest@tribuzen.test)

## Rôles
- Sylvain : opérateur + observateur Grafana (dashboard RED /rsvp)
- Coach : facilitateur, tient le kill switch, décide de l'abort avec Sylvain
```

### 2. Le déroulé et le verdict (livrable 2) — cas « hypothèse réfutée »

```md
# Game day report #1

## Timeline
13:55  kill switch testé à blanc → OK
14:00  trafic /rsvp lancé (~6 req/s), baseline confirmée (p99 281 ms, err 0,2 %)
14:02  INJECTION : toxic pg_latency +800ms toxicity 0.3
14:02  p99 grimpe : 280 → 900 ms (encore sous 1,5 s)
14:03  taux d'erreur : 0,2 % → 3 %, puis 9 %  ← 500, pas 503
14:03:40  p99 = 2 300 ms  → ABORT (seuil p99 > 2 s franchi > 30 s)
14:03:45  kill switch : toxic retiré
14:05  p99 redescend à 300 ms, erreurs à 0,2 %  → récupération OK

## Verdict : hypothèse RÉFUTÉE
Le « parce que » était faux : il n'y a PAS de timeout sur l'écriture RSVP.
La requête attend la base indéfiniment → le pool de connexions se vide →
les requêtes suivantes tombent en 500 (pas la 503 propre attendue).
C'est le bug qu'on cherchait, trouvé un mardi 14h et non un samedi 21h.

## Actions de suivi (postmortem blameless, module 10)
1. ajouter AbortSignal.timeout(2000) sur l'écriture RSVP → renvoyer 503
2. ajouter un circuit breaker devant PostgreSQL (open après 5 échecs)
3. RE-JOUER LE MÊME game day après le fix → l'hypothèse doit passer (p99 < 1,5 s, err < 1 %)

## Récupération : OK (retour baseline en < 2 min après kill switch)
```

**Pourquoi ce corrigé est correct :**
- Le steady state est **mesuré et chiffré** avant, pas supposé — sans baseline, impossible de juger l'écart.
- L'hypothèse est **falsifiable** et porte un **« parce que »** (timeout + 503) : c'est ce mécanisme précis qui s'avère manquant. Une hypothèse sans « parce que » n'aurait rien pointé.
- La dose (+800 ms) est choisie **sous** le timeout supposé (2 s) : si le timeout existait, l'hypothèse tiendrait. Le fait qu'elle casse **prouve** l'absence de timeout.
- L'**abort** se déclenche sur un seuil écrit à l'avance, pas au feeling — et le **kill switch avait été testé**.
- La **récupération est prouvée** (retour à 300 ms), pas juste « on a coupé ».
- Le game day n'est pas « fini » : il impose de **re-jouer** après le fix.

> Si ton game day tombe dans le **cas confirmé** (hypothèse tient), ce n'est pas un échec de lab : c'est un résultat valide. Le coach te fera alors **élargir le blast radius** (100 % des requêtes, ou +2 s) jusqu'à trouver le point de rupture — une expérience qui ne casse jamais n'a pas cherché la limite.

---

## Grille d'évaluation (le coach coche)

| Critère | Attendu | OK ? |
|---|---|---|
| Steady state | 3 SLI RED de /rsvp **mesurés** en baseline avant toute injection | ☐ |
| Hypothèse | falsifiable, format imposé, **avec un « parce que »** nommant un mécanisme | ☐ |
| Blast radius | périmètre + dose + durée + niveau, et sait **pourquoi** ne pas partir à 100 % | ☐ |
| Abort conditions | ≥ 3, chiffrées, dont « perte de données → abort immédiat » | ☐ |
| Kill switch | **testé à blanc AVANT** l'injection | ☐ |
| Garde-fous | /health et /metrics **exclus** de l'injection | ☐ |
| Conduite | lit les SLI en direct, **décide** (tenir/abort) sur un seuil écrit | ☐ |
| Rollback | injection coupée **ET** retour à la baseline **prouvé** en Grafana | ☐ |
| Verdict | hypothèse confirmée/réfutée + mécanisme manquant + action « re-jouer après fix » | ☐ |

---

## Notes coach (à dérouler en session)

- **Relance si silence** : « avant d'injecter — c'est quoi ton état stable, en chiffres ? » S'il n'a pas mesuré la baseline, arrêter là : pas de steady state, pas de chaos.
- **Forcer le « parce que »** : « pourquoi tu t'attends à ce que ça tienne ? » S'il ne sait pas nommer le mécanisme (timeout/circuit breaker), c'est **déjà** le résultat de l'expérience — le noter.
- **Provoquer la décision d'abort** : le facilitateur (toi) garde le kill switch. Quand le p99 approche du seuil, demander « on tient ou on coupe ? » et le laisser décider **sur le seuil écrit**, pas au feeling. C'est l'entraînement à la réponse d'incident (module 10).
- **Piège à tendre** : « ton hypothèse tient, donc /rsvp est robuste ? » — vérifier qu'il propose d'**élargir le blast radius** plutôt que de conclure trop vite.
- **Piège kill switch** : lui demander de couper **avant** d'avoir testé la commande DELETE. S'il n'a pas testé à blanc, le lui faire constater.
- **Récupération** : ne pas le laisser dire « fini » quand il a juste retiré le toxic — exiger la **preuve Grafana** du retour à 280 ms.
- **Louange calibrée** : féliciter seulement si la fiche est écrite AVANT l'injection, l'abort déclenché sur un seuil, et la récupération prouvée. Un toxic injecté et retiré n'est pas l'objectif ; la **rigueur expérimentale** l'est.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées** (sans rouvrir ce corrigé ni le module 12), en **40 minutes** :

1. **Change la famille de faute** : au lieu de la latence réseau, injecte une **panne d'infrastructure** — `docker kill` d'**un** des deux réplicas de l'API TribuZen (blast radius niveau 2, un seul réplica). Hypothèse à écrire : « l'app survit à la perte d'un réplica sans erreur visible, PARCE QUE le load balancer route vers le réplica sain via le health check ».
2. **Ajoute un groupe de contrôle** : garde une route **non affectée** (ex. `/api/events` en lecture) et compare son état stable pendant l'expérience — si elle bouge aussi, l'écart n'est pas dû à ton injection.
3. **Combine avec la charge** (game day avancé) : lance en parallèle le test k6 du lab 11 à ~15 req/s **pendant** le kill du réplica — « Black Friday + perte d'instance ». Nouvelle abort condition à écrire pour ce scénario combiné.
4. Rédige un **report** distinct avec verdict + récupération prouvée.

**Critère de réussite :** la fiche est écrite avant, le kill switch (`docker start` du réplica) est testé, tu distingues groupe contrôle / expérimental, et ta conclusion sur la résilience est **chiffrée** et argumentée par les SLI observés.

---

## Application TribuZen

Dans `smaurier/tribuzen`, le chaos vit ici :

```
tribuzen/
  src/
    chaos/
      chaos.middleware.ts   ← injection latence/erreur applicative (fallback si pas de Toxiproxy)
      chaos.routes.ts       ← POST /chaos/enable|disable, GET /chaos/status (403 sauf CHAOS_ALLOWED=true)
    resilience/
      circuit-breaker.ts    ← le mécanisme que l'action de suivi #2 ajoute
  ops/
    chaos/
      gameday-01-rsvp-db-latency.md   ← la fiche (livrable 1) — document VIVANT, re-joué après chaque fix
      gameday-report-01.md            ← le verdict (livrable 2)
  docker-compose.chaos.yml            ← ajoute toxiproxy devant postgres
```

**Différences avec le lab :**
- En équipe réelle, le game day est **annoncé** (calendrier partagé, astreinte prévenue « c'est un exercice ») ; ici, seul, tu joues les deux rôles mais tu écris quand même la checklist de sécurité.
- L'endpoint `/chaos/*` est **désactivé par défaut** (`CHAOS_ALLOWED` absent) et ne s'ouvre qu'en staging via variable d'env — jamais activable par défaut en prod.
- La fiche `gameday-01-*.md` est **relue et re-jouée** après chaque changement d'infra ou de code de résilience (nouveau timeout, circuit breaker) : une hypothèse validée une fois ne l'est pas pour toujours.
- Le report alimente un **postmortem blameless** (module 10) et les actions de suivi deviennent des tickets.

**Commit cible :**
```
chore(chaos): game day #1 /rsvp latence PG — fiche + report, action timeout+circuit breaker
```

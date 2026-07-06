---
titre: Chaos Engineering
cours: 16-observability-sre
notions:
  - "définition du chaos engineering (principlesofchaos.org)"
  - "steady state hypothesis (état stable mesurable)"
  - "hypothèse falsifiable (groupe contrôle vs expérimental)"
  - "blast radius (rayon d'impact)"
  - "fault injection (latence / erreurs / panne)"
  - "game day (exercice planifié en équipe)"
  - "abort conditions & kill switch"
  - "rollback de l'expérience"
  - "résilience (circuit breaker, fallback, timeout)"
outcomes:
  - sait rédiger une hypothèse d'état stable falsifiable avec des SLI mesurables et des abort conditions chiffrées
  - sait dimensionner un blast radius et choisir le plus petit périmètre qui révèle la faiblesse
  - sait concevoir et mener un game day sur TribuZen (injection latence/erreur/panne, observation, rollback)
  - sait distinguer chaos engineering (expérience scientifique) de sabotage ou de simple load test
prerequis:
  - "module 02 — métriques Prometheus (steady state = SLI mesurés)"
  - "module 03 — RED/USE (les signaux qu'on observe pendant l'expérience)"
  - "module 08 — SLI/SLO (seuils qui deviennent abort conditions)"
  - "module 09 — alerting (détecter l'écart pendant le game day)"
  - "module 10 — incidents & postmortems (le game day répète la réponse)"
  - "module 11 — capacity planning (charge = une des variables injectées)"
next: 13-observability-as-code
libs: []
tribuzen: game day sur l'API TribuZen — injection de latence/erreurs sur /rsvp et panne PostgreSQL, observation des SLI RED dans Grafana, rollback maîtrisé
last-reviewed: 2026-07
---

# Chaos Engineering

> **Outcomes — tu sauras FAIRE :** rédiger une hypothèse d'état stable falsifiable, dimensionner un blast radius, mener un game day sur TribuZen (injection latence/erreur/panne + observation + rollback), et distinguer une expérience de chaos d'un simple crash-test.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module traite la **méthode** du chaos engineering — hypothèse, blast radius, injection, observation, rollback. Il **réutilise** tout ce qui précède : les métriques (02), RED/USE (03), les SLO comme seuils d'arrêt (08), l'alerting pour détecter l'écart (09), la mécanique d'incident (10) et la charge (11). Les **patterns de résilience** (circuit breaker, bulkhead, retry) sont introduits ici comme *ce que le chaos valide* ; leur implémentation détaillée reste applicative. L'observabilité versionnée (dashboards/alertes en code) est le **module 13 (observability-as-code)**.

## 1. Cas concret d'abord

Samedi soir, TribuZen envoie la notification « les inscriptions au grand pique-nique de l'école sont ouvertes ». En 90 secondes, 400 parents ouvrent l'app et cliquent *Confirmer ma présence*. L'API `/api/events/:id/rsvp` écrit en base PostgreSQL. **Personne ne sait** ce qui se passe si, à cet instant précis, la base ralentit (backup nocturne, pic d'I/O) ou si un des deux réplicas de l'API tombe.

Deux attitudes possibles :

- **Attendre** que ça casse un vrai samedi soir, à 21 h, avec 400 familles frustrées et toi en pyjama devant les logs.
- **Provoquer la panne un mardi à 14 h**, en équipe, sur un trafic contrôlé, avec un bouton d'arrêt à portée de main — et **découvrir** avant les utilisateurs que le RSVP n'a ni timeout ni message d'erreur propre quand la base traîne.

Le chaos engineering, c'est la seconde attitude. Ce n'est **pas** casser au hasard : c'est une **expérience scientifique**. On écrit d'abord une phrase précise et *falsifiable* :

```
Hypothèse : "Si j'ajoute +800 ms de latence à 30 % des écritures PostgreSQL de /rsvp
pendant 5 min, le taux d'erreur de /rsvp reste < 1 % et le p99 reste < 1,5 s,
parce que l'endpoint a un timeout de 2 s et renvoie un message propre."
```

À la fin de ce module, tu sauras transformer cette phrase en un **game day** mené sur le TribuZen instrumenté des modules 02-11 : injection réelle (via l'API de chaos ou un proxy réseau), observation des SLI dans Grafana, **abort conditions** chiffrées, et **rollback** propre de l'injection. Si l'hypothèse est fausse, tu auras trouvé un bug de résilience *avant* qu'il ne devienne un incident.

---

## 2. Théorie complète, concise

### 2.1 La définition (à connaître mot pour mot)

Source : `principlesofchaos.org` (vérifiée). Définition officielle :

> « Chaos Engineering is the discipline of experimenting on a system in order to build confidence in the system's capability to withstand turbulent conditions in production. »

Trois mots portent tout le sens :

- **experimenting** — c'est une démarche *scientifique* (hypothèse → expérience → mesure), pas du sabotage ;
- **confidence** — le but n'est pas de casser, c'est de **gagner en confiance** (ou de découvrir qu'on n'aurait pas dû en avoir) ;
- **production** — l'idéal est d'expérimenter là où vivent le vrai trafic et les vraies données ; mais on **commence** ailleurs (§2.5).

### 2.2 La boucle expérimentale en 4 étapes

Toujours d'après `principlesofchaos.org`, verbatim reformulé :

1. **Définir l'état stable** (*steady state*) : une **sortie mesurable** du système qui traduit un comportement normal. On mesure l'**output** (débit, latence, taux d'erreur), pas l'intérieur du système.
2. **Poser l'hypothèse** que cet état stable **se maintiendra** dans le groupe de contrôle *et* le groupe expérimental.
3. **Introduire des variables** qui reflètent des **évènements réels** : serveurs qui crashent, disques qui lâchent, connexions réseau coupées.
4. **Tenter de RÉFUTER l'hypothèse** en cherchant une **différence d'état stable** entre contrôle et expérimental.

Le point le plus souvent raté : l'objectif est de **falsifier** (Popper), pas de « voir si ça tient ». Une expérience qui ne peut pas échouer n'apprend rien.

### 2.3 Steady state = SLI mesurable, pas « ça marche »

L'**état stable** doit être un nombre, issu des métriques du module 02, interprété avec les méthodes du module 03 (RED). « Le site répond » ne suffit pas. Pour `/rsvp` :

| Signal (RED) | SLI | État stable |
|---|---|---|
| **R**ate | débit RSVP servi | > 5 req/s pendant le pic |
| **E**rrors | taux 5xx de `/rsvp` | < 1 % |
| **D**uration | p99 latence `/rsvp` | < 800 ms |

Ces trois lignes **sont** ton steady state. On les mesure **avant** (baseline), **pendant** et **après** l'injection. Un état stable qui n'est pas déjà observable en Grafana = tu n'es pas prêt pour le chaos (il faut d'abord l'observabilité — d'où l'ordre du cours).

### 2.4 L'hypothèse falsifiable, contrôle vs expérimental

Une bonne hypothèse est une **phrase testable** qui contient : la **variable** injectée, la **cible/périmètre**, la **durée**, et le **résultat attendu chiffré** avec sa *raison*.

```
Si <injection> sur <cible limitée> pendant <durée>,
alors <SLI> reste dans <seuil>, PARCE QUE <mécanisme de résilience attendu>.
```

Le « parce que » est ce qui distingue une hypothèse d'un vœu : il nomme le mécanisme (timeout, circuit breaker, réplica de secours) censé absorber la panne. Si l'expérience réfute l'hypothèse, c'est **ce mécanisme-là** qui manque ou est cassé.

**Contrôle vs expérimental :** idéalement on compare un groupe **épargné** par l'injection (contrôle) et un groupe **soumis** (expérimental) au même instant — ça neutralise les variations de trafic. En pratique, sur une petite app, on compare souvent *avant/pendant* (baseline temporelle) faute de pouvoir router une fraction du trafic. Sache que la **comparaison** est le cœur de la méthode.

### 2.5 Blast radius — le rayon d'impact

Le **blast radius** est l'**impact maximal** que l'expérience peut causer si tout se passe mal. Le principe fondateur (`principlesofchaos.org`) : *« minimiser et contenir les retombées »*. La règle : **commencer au plus petit périmètre qui peut encore révéler la faiblesse**, puis élargir.

```
dev/staging  →  1 instance en prod  →  1 service  →  1 zone (AZ)  →  1 région
(impact ~0)     (~5 % du trafic)       (~20 %)        (~33 %)          (~50 %)
   │                  │                     │
   └── on ne monte d'un cran QUE si le cran précédent est passé sans surprise
```

Trois leviers pour contenir le blast radius :

- **Périmètre** : une route (`/rsvp`), pas toute l'API ; un réplica, pas les trois.
- **Dose** : 30 % des requêtes affectées, pas 100 % ; +800 ms, pas +30 s.
- **Durée** : 5 minutes, pas « jusqu'à ce qu'on remarque ».

Et surtout : un **kill switch** (§2.7) qui coupe l'injection instantanément.

### 2.6 Fault injection — les familles de pannes

On injecte des pannes qui **reflètent des évènements réels**. Quatre familles :

| Famille | Exemples de fautes | Comment on l'injecte |
|---|---|---|
| **Application** | erreurs HTTP 500/503, réponses lentes | middleware de chaos (dans l'app, toggleable) |
| **Réseau** | latence, jitter, perte de paquets, coupure | proxy type **Toxiproxy** entre l'app et la DB |
| **Ressource** | CPU 100 %, mémoire saturée, disque plein | `stress-ng`, cgroups |
| **Infrastructure** | kill d'un pod/conteneur, perte d'une zone | `docker kill`, `kubectl delete pod`, AWS FIS |

Pour TribuZen en local (docker-compose), les deux plus utiles et sûrs :
- **middleware applicatif** : latence/erreurs injectées *dans* l'API, activées par un endpoint protégé — précis, ciblé par route, facile à couper ;
- **Toxiproxy** : proxy TCP placé **devant PostgreSQL** pour simuler une base lente/injoignable sans toucher au code applicatif.

> Deux garde-fous non négociables : le **health check** (`/health`) et le **endpoint `/metrics`** ne sont **JAMAIS** touchés par l'injection — sinon tu es aveugle pendant ton propre chaos.

### 2.7 Abort conditions & kill switch — savoir s'arrêter

Avant de lancer, on écrit les **conditions d'arrêt** : les seuils au-delà desquels l'expérience devient un vrai incident et doit s'interrompre **immédiatement**. Ce sont souvent les SLO du module 08, en plus strict.

```
Abort si l'un de ces seuils est franchi > 30 s :
  - taux d'erreur /rsvp > 5 %
  - p99 latence /rsvp > 2 s
  - toute perte de données détectée (RSVP écrit puis disparu)  → abort IMMÉDIAT
```

Le **kill switch** est le mécanisme qui **annule l'injection en une action** : couper le middleware de chaos (`POST /chaos/disable`), retirer le toxic Toxiproxy, redémarrer le réplica tué. Il doit être **testé AVANT** de commencer — un kill switch qu'on découvre cassé pendant l'incident, c'est le pire scénario.

### 2.8 Rollback de l'expérience — revenir à l'état d'avant

Le chaos n'est pas fini quand tu coupes l'injection : il est fini quand le système est **prouvé revenu** à son état stable. Le **rollback** comprend :

1. **couper l'injection** (kill switch) ;
2. **vérifier le retour au steady state** : les 3 SLI RED redescendent à leur baseline dans Grafana (pas juste « ça a l'air ok ») ;
3. **restaurer l'état** si l'expérience a laissé des traces (réplica relancé, proxy nettoyé, données de test purgées) ;
4. **archiver les données** de l'expérience pour le postmortem/game day report.

Un rollback qui laisse le p99 à 1,2 s au lieu des 300 ms de départ **n'est pas** un rollback : c'est un incident latent. La **récupération** (le système revient tout seul ou non) est elle-même un résultat d'expérience.

### 2.9 Game day — l'expérience en équipe

Un **game day** est un exercice **planifié** où l'équipe mène une série d'expériences de chaos ensemble, avec des rôles définis, dans un créneau annoncé.

Rôles typiques : un **facilitateur** (déroule le plan, garde le kill switch), des **opérateurs** (injectent), des **observateurs** (lisent Grafana, jouent le rôle de l'astreinte). Un game day sert autant à tester le **système** qu'à **entraîner l'équipe** à la réponse d'incident (module 10) : détection, communication, décision d'arrêt.

Checklist de sécurité d'un game day :
- tout le monde **sait** que c'est un exercice (pas de fausse alerte à l'astreinte) ;
- **kill switch testé** avant de commencer ;
- **rollback documenté** pour chaque expérience ;
- **aucun déploiement** planifié pendant le créneau ;
- ordre des expériences **du moins au plus risqué** (warm-up d'abord).

### 2.10 Ce que le chaos VALIDE : les patterns de résilience

Le chaos ne rend pas un système résilient — il **révèle** s'il l'est. Les mécanismes qu'une hypothèse invoque dans son « parce que » :

- **Timeout** : ne jamais attendre une dépendance indéfiniment (`AbortSignal.timeout(2000)`).
- **Circuit breaker** : après N échecs d'une dépendance, on **coupe** les appels (état *open*), on sert un fallback, puis on re-teste (*half-open*) avant de refermer (*closed*). Empêche la panne d'une dépendance de se propager en cascade.
- **Fallback / graceful degradation** : servir une réponse dégradée (cache périmé, valeur par défaut) plutôt qu'une erreur.
- **Retry avec backoff + jitter** : réessayer, mais espacé et désynchronisé, pour ne pas achever une dépendance qui se relève.
- **Bulkhead** : cloisonner les ressources (pools séparés) pour qu'un type de requête lent n'assèche pas les autres.

Chaque game day devrait cibler **un** de ces mécanismes : « le circuit breaker s'ouvre-t-il vraiment ? », « le fallback se déclenche-t-il ? ».

---

## 3. Worked examples

### Exemple 1 — d'une inquiétude vague à une fiche d'expérience complète

Inquiétude de départ : *« je crois que /rsvp gère mal une base lente »*. On la transforme en fiche exécutable.

```
FICHE D'EXPÉRIENCE — TribuZen game day #1

Titre        : Résilience de /rsvp à une latence base de données

Steady state (baseline mesurée AVANT, en Grafana) :
  - débit /rsvp .......... ~6 req/s au pic de test
  - taux d'erreur /rsvp .. 0,2 %
  - p99 latence /rsvp .... 280 ms

Hypothèse    : Si j'ajoute +800 ms de latence à 30 % des connexions PostgreSQL
               pendant 5 min, le taux d'erreur /rsvp reste < 1 % et le p99 < 1,5 s,
               PARCE QUE l'écriture RSVP a un timeout de 2 s et renvoie une 503 propre.

Injection    : Toxiproxy — toxic 'latency' 800 ms, toxicity 0.3, sur le proxy pg
Cible        : connexions PostgreSQL de l'API (PAS le health check, PAS /metrics)
Blast radius : 1 route (/rsvp), 30 % des requêtes, 5 min, en local/staging (niveau 1)
Durée        : 5 minutes

Abort conditions (arrêt immédiat si franchi > 30 s) :
  - taux d'erreur /rsvp > 5 %
  - p99 latence /rsvp > 2 s
  - toute perte de RSVP confirmé  → abort IMMÉDIAT

Kill switch  : retirer le toxic  (testé à blanc avant de commencer)
Rollback     : retirer le toxic + vérifier les 3 SLI redescendus à la baseline
Observateurs : Sylvain (Grafana RED /rsvp), coach (facilitateur + kill switch)
```

Cette fiche **est** le livrable. Sans elle, ce n'est pas du chaos engineering, c'est casser un truc pour voir.

### Exemple 2 — dérouler le game day et lire le résultat

On lance l'injection et on regarde les trois SLI en direct. Deux issues possibles :

**Cas A — hypothèse confirmée :**
```
Pendant l'injection (Grafana) :
  p99 /rsvp .......... 280 ms → 1 100 ms   (sous le seuil 1,5 s ✔)
  taux d'erreur ...... 0,2 % → 0,6 %        (sous le seuil 1 % ✔)
  débit .............. stable
Après retrait du toxic :
  p99 revient à ~300 ms en < 1 min          → récupération OK
```
Verdict : l'hypothèse **tient**. Le timeout et la 503 propre fonctionnent. Confiance gagnée — on peut envisager d'élargir le blast radius (latence plus forte, ou 100 % des requêtes).

**Cas B — hypothèse réfutée (le cas qui a de la valeur) :**
```
Pendant l'injection :
  p99 /rsvp .......... 280 ms → 2 300 ms    (dépasse 2 s → ABORT à 00:47)
  taux d'erreur ...... 0,2 % → 14 %         (timeouts non gérés → 500, pas 503)
```
Le facilitateur **coupe** (kill switch) dès l'abort. Diagnostic : il n'y a **pas** de timeout sur l'écriture RSVP — la requête attend la base indéfiniment, épuise le pool de connexions, et les requêtes suivantes tombent en 500. **C'est exactement le bug qu'on cherchait**, trouvé un mardi 14 h et non un samedi 21 h.

Action de suivi (postmortem du game day, module 10) :
```
1. ajouter AbortSignal.timeout(2000) sur l'écriture RSVP + renvoyer 503
2. ajouter un circuit breaker devant PostgreSQL
3. re-jouer LE MÊME game day après le fix → l'hypothèse doit passer
```

Le game day n'est « réussi » que quand l'hypothèse réfutée est corrigée **et re-testée**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « chaos engineering = casser des trucs au hasard »

Sans hypothèse falsifiable ni steady state mesuré, tuer un pod n'est pas du chaos engineering : c'est du vandalisme. La discipline **exige** la phrase testable et la comparaison contrôle/expérimental. Réflexe : pas de fiche d'expérience → pas d'injection.

### PIÈGE #2 — faire du chaos sans observabilité

Injecter une panne alors que tu n'as pas de dashboard RED du service, c'est éteindre la lumière avant de chercher tes clés. L'observabilité (modules 00-11) est un **prérequis** : si tu ne peux pas mesurer le steady state en direct, tu ne peux ni détecter l'écart, ni décider d'arrêter. C'est pour ça que ce module est le 12e, pas le 1er.

### PIÈGE #3 — pas d'abort conditions / pas de kill switch testé

Lancer une expérience sans seuils d'arrêt chiffrés, c'est transformer ton game day en vrai incident. Pire : avoir un kill switch qu'on **découvre cassé** au moment de l'urgence. On **teste le kill switch à blanc AVANT** toute injection.

### PIÈGE #4 — blast radius maximal dès le premier essai

Commencer par « je coupe la base pour 100 % du trafic en prod » est la meilleure façon de se faire interdire le chaos engineering par sa direction. On commence **petit** (staging, une route, une dose faible, court) et on n'élargit que si le cran précédent passe. Le blast radius se **gagne**.

### PIÈGE #5 — confondre chaos engineering et load testing

Le **load test** (module 11) répond « à quelle charge ça casse ? » en *augmentant le trafic*. Le **chaos** répond « comment ça se comporte quand un composant *défaille* ? » en *injectant une panne*. Ils sont complémentaires (un game day *avancé* combine les deux : « Black Friday **+** cache down »), mais ce ne sont pas les mêmes variables ni les mêmes questions.

### PIÈGE #6 — toucher le health check ou /metrics avec l'injection

Si ton middleware de chaos ralentit *aussi* `/health` et `/metrics`, tu perds la visibilité pendant l'expérience et l'orchestrateur peut redémarrer tes instances en pleine mesure. Ces endpoints sont **exclus** de toute injection, toujours.

### PIÈGE #7 — oublier de vérifier la récupération

Couper l'injection ≠ expérience terminée. Si le p99 reste à 1,2 s après le rollback, le système **n'est pas revenu** à son état stable : tu as un incident latent. On **prouve** le retour à la baseline en Grafana avant de déclarer fini.

---

## 5. Ancrage TribuZen

Le game day de ce module s'appuie **exactement** sur la stack construite depuis le module 02 : API TribuZen instrumentée (`http_requests_total`, `http_request_duration_seconds`), Prometheus, Grafana, dashboards RED. C'est le premier module qui **exerce** toute la chaîne d'observabilité sous stress.

Ce qu'on ajoute au repo `smaurier/tribuzen` :

```
tribuzen/
  src/
    chaos/
      chaos.middleware.ts   ← injection latence/erreur, activée par endpoint protégé
      chaos.routes.ts       ← POST /chaos/enable, /chaos/disable, GET /chaos/status
                              (403 si process.env.CHAOS_ALLOWED !== 'true')
    resilience/
      circuit-breaker.ts    ← le mécanisme que les hypothèses invoquent
  ops/
    chaos/
      gameday-01-rsvp-db-latency.md   ← la fiche d'expérience (Exemple 1)
      gameday-report-01.md            ← résultat + actions (postmortem, module 10)
  docker-compose.chaos.yml            ← ajoute toxiproxy devant postgres
```

Trois expériences TribuZen pertinentes, du moins au plus risqué :

| # | Hypothèse (résumé) | Injection | Mécanisme validé |
|---|---|---|---|
| 1 | `/rsvp` survit à une base lente | Toxiproxy +800 ms sur PG | timeout + 503 propre |
| 2 | l'app tient la perte d'un réplica API | `docker kill` 1 des 2 réplicas | load balancing, health check |
| 3 | le front reste utilisable si les notifs WS tombent | erreurs 503 sur `/ws` | fallback / graceful degradation |

Chaque game day **répète** aussi la réponse d'incident (module 10) : détecter l'écart via l'alerting (module 09), décider d'arrêter, écrire le report blameless. Le chaos engineering est le point où **toute** la stack d'observabilité de TribuZen se prouve — ou révèle ses trous.

---

## 6. Points clés

1. Chaos engineering = **expérimenter** sur un système pour **gagner en confiance** dans sa capacité à résister aux conditions turbulentes de prod. Ce n'est **pas** casser au hasard.
2. Boucle en 4 étapes : définir le **steady state** (SLI mesurable) → **hypothèse** que l'état stable se maintient → **injecter** des variables réelles → tenter de **réfuter** l'hypothèse.
3. Le **steady state** est un nombre issu des métriques (RED du module 03), pas « ça marche ».
4. Une **hypothèse falsifiable** contient : variable, cible, durée, résultat chiffré, **et un « parce que »** nommant le mécanisme de résilience attendu.
5. **Blast radius** = impact maximal ; on **commence petit** (staging → 1 instance → service → zone → région) et on n'élargit qu'après succès. Leviers : périmètre, dose, durée.
6. **Fault injection** : application (erreurs/latence via middleware), réseau (Toxiproxy), ressource (`stress-ng`), infra (`docker kill`/FIS). **Jamais** `/health` ni `/metrics`.
7. **Abort conditions** chiffrées + **kill switch testé AVANT** = ce qui empêche un game day de devenir un incident.
8. Le **rollback** n'est fini que quand les SLI sont **prouvés revenus** à la baseline (vérifier la récupération).
9. Un **game day** = expérience planifiée en équipe, rôles définis, checklist de sécurité ; il entraîne aussi la **réponse d'incident**.
10. Le chaos **valide** les patterns de résilience (timeout, circuit breaker, fallback, retry+backoff, bulkhead) ; il ne les crée pas. Une hypothèse réfutée non corrigée-et-retestée = game day non terminé.

---

## 7. Seeds Anki

```
Définition officielle du chaos engineering (principlesofchaos.org) ?|La discipline consistant à EXPÉRIMENTER sur un système pour GAGNER EN CONFIANCE dans sa capacité à résister aux conditions turbulentes en PRODUCTION. Démarche scientifique (hypothèse/mesure), pas du sabotage.
Quelles sont les 4 étapes de la boucle expérimentale du chaos ?|1) définir le steady state (sortie mesurable = comportement normal), 2) poser l'hypothèse que cet état stable se maintiendra (contrôle ET expérimental), 3) injecter des variables reflétant des évènements réels, 4) tenter de RÉFUTER l'hypothèse en cherchant un écart d'état stable.
Qu'est-ce que le steady state et comment le mesure-t-on sur /rsvp ?|L'état stable = une sortie MESURABLE du système traduisant un comportement normal (on mesure l'output, pas l'interne). Sur /rsvp : débit RED, taux d'erreur < 1 %, p99 < 800 ms — les SLI Prometheus, mesurés avant/pendant/après.
Que doit contenir une hypothèse de chaos falsifiable ?|La variable injectée, la cible/périmètre, la durée, le résultat attendu CHIFFRÉ, et un « PARCE QUE » nommant le mécanisme de résilience attendu (timeout, circuit breaker, réplica). Le « parce que » distingue l'hypothèse du vœu.
Qu'est-ce que le blast radius et quelle est la règle d'or ?|Le rayon d'impact = l'impact maximal si tout se passe mal. Règle : commencer au plus PETIT périmètre qui révèle encore la faiblesse (staging → 1 instance → service → zone → région), n'élargir qu'après succès. Leviers : périmètre, dose, durée.
Cite les 4 familles de fault injection et un exemple de chacune.|Application (erreurs 500/latence via middleware), réseau (latence/perte via Toxiproxy), ressource (CPU/mémoire via stress-ng), infrastructure (kill de pod via docker kill/kubectl/AWS FIS). Jamais /health ni /metrics.
Abort conditions et kill switch : à quoi ça sert et quand les prépare-t-on ?|Abort conditions = seuils chiffrés (souvent SLO+) au-delà desquels on arrête IMMÉDIATEMENT (ex : erreur > 5 % > 30 s). Kill switch = annuler l'injection en une action. Les deux se définissent AVANT, et le kill switch se TESTE à blanc avant toute injection.
Quand une expérience de chaos est-elle vraiment terminée (rollback) ?|Pas quand on coupe l'injection, mais quand le système est PROUVÉ revenu à son steady state : les SLI redescendus à la baseline en Grafana, l'état restauré (réplica relancé, proxy nettoyé), données archivées. Un p99 qui reste haut = incident latent.
Différence entre un game day et une injection isolée ?|Le game day est un exercice PLANIFIÉ en ÉQUIPE (facilitateur, opérateurs, observateurs), dans un créneau annoncé, avec checklist de sécurité. Il teste le système ET entraîne la réponse d'incident (détection, décision d'arrêt, postmortem).
Chaos engineering vs load testing ?|Load test (mod. 11) : « à quelle CHARGE ça casse ? » en augmentant le trafic. Chaos : « comment ça se comporte quand un composant DÉFAILLE ? » en injectant une panne. Complémentaires (game day avancé = charge + panne), variables et questions différentes.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-12-chaos-engineering/README.md`. Concevoir puis mener un vrai game day sur TribuZen (hypothèse falsifiable, blast radius, injection latence/erreur via l'API de chaos ou Toxiproxy, observation RED dans Grafana, abort conditions et rollback) via le docker-compose du cours. Grille d'évaluation, coach en session, variante J+30. Zéro harnais simulé.

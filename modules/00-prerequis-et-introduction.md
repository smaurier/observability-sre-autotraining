---
titre: Prérequis & Introduction à l'observabilité
cours: 16-observability-sre
notions: [observabilité, monitoring vs observabilité, three pillars logs metrics traces, cardinalité, série temporelle, MTTD et MTTR, panorama de la stack observability]
outcomes:
  - sait expliquer la différence entre monitoring (questions connues) et observabilité (questions inconnues)
  - sait nommer les 3 piliers (logs, métriques, traces), leurs forces/faiblesses et quand utiliser chacun
  - sait définir la cardinalité et pourquoi elle fait exploser une base de métriques
  - sait situer les outils de la stack (Prometheus, Grafana, Loki, Tempo, OpenTelemetry, Sentry) sur les 3 piliers
prerequis: []
next: 01-logging-structure
libs: []
tribuzen: plateforme TribuZen (API NestJS, front Nuxt, workers) — établir le plan d'observabilité initial et cadrer les 3 piliers
last-reviewed: 2026-07
---

# Prérequis & Introduction à l'observabilité

> **Outcomes — tu sauras FAIRE :** distinguer monitoring et observabilité, nommer et positionner les 3 piliers (logs, métriques, traces), expliquer la cardinalité, situer les outils de la stack.
> **Difficulté :** :star:
>
> **Portée :** ce module est le socle conceptuel du cours. On y installe le vocabulaire (3 piliers, cardinalité, MTTD/MTTR) et la carte de la stack. On n'instrumente **rien** ici : le logging structuré démarre au module 01, les métriques Prometheus au module 02, le tracing au module 04. Les métriques DORA sont déférées au module 20, la charge/capacity planning au module 11.

## 1. Cas concret d'abord

Il est 22h47. Un parent t'écrit sur le Discord de TribuZen : « J'essaie d'ajouter mon fils à la tribu depuis ce matin, ça tourne dans le vide et rien ne se passe. » Tu es de garde.

TribuZen tourne avec trois composants : le front **Nuxt**, l'**API NestJS**, et des **workers** qui envoient les notifications (invitation d'un membre = un e-mail + une push). Voici tout ce dont tu disposes pour diagnostiquer :

```bash
# Les seuls logs de l'API, en production
$ docker logs tribuzen-api --tail 20
Server listening on :3000
POST /families/:id/members
POST /families/:id/members
Error: timeout
POST /families/:id/members
```

Réponds honnêtement à ces questions, avec **uniquement** ce que tu vois ci-dessus :

1. Quel utilisateur a été touché ? → *inconnu.*
2. Sur quelle famille ? → *inconnu (`:id` n'est même pas résolu).*
3. Combien de parents ont eu le problème, ou est-ce juste lui ? → *inconnu.*
4. Le `timeout`, c'est la base de données ? le worker e-mail ? un service tiers ? → *inconnu.*
5. Depuis quand ça dure, et est-ce que ça empire ? → *inconnu.*

Tu **vois** que quelque chose ne va pas. Tu ne **comprends** rien. Tu vas passer ta soirée à te connecter en SSH, à `grep` des fichiers, à rejouer la requête à la main en espérant reproduire. C'est exactement ce que ce cours élimine.

Un système **observable** aurait répondu aux 5 questions en 90 secondes : un log structuré t'aurait donné `userId` + `familyId`, une métrique t'aurait montré que le taux d'erreur de `POST /members` est passé de 0 % à 60 % depuis 21h30, et une trace t'aurait montré que le span `worker.sendInvitationEmail` prend 30 s avant de timeout parce que le fournisseur SMTP est en rade.

Ce module pose les fondations pour construire ce système. On commence par le vocabulaire.

---

## 2. Théorie complète, concise

### 2.1 Observabilité : une définition

Le mot vient de la théorie du contrôle (Kálmán, années 1960) : un système est **observable** si l'on peut déduire son **état interne** à partir de ses **sorties externes**. Transposé au logiciel :

> Un système est observable quand tu peux répondre à **n'importe quelle question** sur son comportement interne — y compris des questions que tu n'avais pas anticipées — sans avoir à déployer du nouveau code pour instrumenter.

Le mot-clé est **n'importe quelle question**. Ce n'est pas un outil qu'on installe, c'est une **propriété** du système, obtenue en l'instrumentant pour qu'il émette assez de signal.

### 2.2 Monitoring vs observabilité — le vrai clivage

Ce n'est pas « ancien vs moderne » ni « l'un remplace l'autre ». Le clivage est sur la **nature des questions**.

| | Monitoring | Observabilité |
|---|---|---|
| Questions | **connues à l'avance** (« le CPU dépasse-t-il 80 % ? ») | **inconnues, émergentes** (« pourquoi les invitations de la famille X échouent-elles ce soir ? ») |
| Modèle mental | dashboards et seuils prédéfinis | exploration ad hoc |
| Données | métriques agrégées | logs + métriques + traces **corrélés** |
| Répond à | « **Est-ce que** ça marche ? » | « **Pourquoi** ça ne marche pas ? » |

Le monitoring est un **sous-ensemble** de l'observabilité, pas son opposé :

```
┌─────────────────────────────────────────────┐
│                OBSERVABILITÉ                  │
│   ┌───────────────────────────────────────┐   │
│   │              MONITORING               │   │
│   │   dashboards · seuils · alertes       │   │
│   └───────────────────────────────────────┘   │
│   + exploration ad hoc                        │
│   + corrélation multi-signaux                 │
│   + debug de problèmes jamais anticipés       │
└─────────────────────────────────────────────┘
```

Tu **monitores** ce que tu sais déjà surveiller (« l'API est-elle up ? »). Tu as besoin d'**observabilité** pour les surprises — et en microservices, tout est surprise. C'est précisément le passage du monolithe (une seule boîte à inspecter) aux systèmes distribués (front + API + workers + base + tiers) qui a rendu le simple monitoring insuffisant : quand une invitation échoue, le problème peut se cacher dans n'importe lequel des maillons.

### 2.3 Les 3 piliers (three pillars)

L'observabilité s'appuie sur trois types de signal complémentaires. **Aucun ne suffit seul.**

**Pilier 1 — Logs.** Des événements horodatés, discrets, riches en contexte. « Ce qui s'est passé, précisément, à cet instant, pour cet objet. »

```jsonc
// Un log STRUCTURÉ (JSON) — exploitable par une machine
{ "level": "error", "event": "member_invite_failed",
  "userId": "u_42", "familyId": "f_17", "reason": "smtp_timeout" }
```
- **Forces :** contexte maximal, détail d'un événement individuel, audit trail.
- **Faiblesses :** volume énorme, coût de stockage élevé, mauvaise vue d'ensemble.

**Pilier 2 — Métriques (metrics).** Des valeurs numériques **agrégées** dans le temps. « Combien, à quel rythme, quelle tendance. »

```
member_invite_total{status="error"}  # un compteur qui monte
http_request_duration_seconds        # une distribution de latences
```
- **Forces :** peu coûteuses, vue d'ensemble instantanée, idéales pour **alerter** et suivre une tendance.
- **Faiblesses :** pas de détail individuel — l'agrégation efface le « qui » et le « pourquoi ».

**Pilier 3 — Traces (distributed tracing).** Le **parcours complet** d'une requête à travers les services, décomposé en **spans** (unités de travail) hiérarchiques. « Par où est passée cette requête, et où le temps a-t-il été perdu ? »

```
Trace abc-123 : POST /families/f_17/members           (30 120 ms)
├─ [API]    NestJS controller.addMember               (12 ms)
├─ [API]    DB INSERT family_members                  (8 ms)
└─ [worker] worker.sendInvitationEmail                (30 090 ms)  ← le coupable
   └─ [SMTP] connect provider                         (timeout)
```
- **Forces :** vision du flux distribué, identification immédiate du goulot d'étranglement.
- **Faiblesses :** mise en place plus complexe (propagation de contexte, sampling), volume.

**La puissance vient de la corrélation.** Le lien entre les trois est le **`traceId`** : on l'injecte dans les logs, on l'attache aux spans. Une métrique **détecte** (le taux d'erreur monte), une trace **localise** (le span `sendInvitationEmail` est lent), un log **explique** (`reason: smtp_timeout`).

| Pilier | Question type | Le bon outil quand... |
|---|---|---|
| Logs | « que s'est-il passé pour CET événement ? » | debug d'un cas précis, audit, stack trace |
| Métriques | « combien / à quel rythme / quelle tendance ? » | alerting, SLO, tendance, capacity |
| Traces | « par où est passée la requête, où est le goulot ? » | latence en cascade, système distribué |

### 2.4 Cardinalité — le concept qui piège tous les débutants

Une **métrique** peut porter des **labels** (dimensions). Chaque combinaison **unique** de valeurs de labels crée une **série temporelle** (time series) distincte — une courbe stockée à part.

La **cardinalité** = le nombre de combinaisons uniques.

```
# Cardinalité MAÎTRISÉE : method × route × status
# 4 méthodes × 8 routes × 5 codes = 160 séries.  OK.
http_requests_total{method, route, status}

# Cardinalité EXPLOSIVE : on ajoute userId comme label
# 4 × 8 × 5 × (nombre d'utilisateurs)  → des millions de séries.  DANGER.
http_requests_total{method, route, status, userId}
```

Règle d'or : **ne jamais mettre en label une valeur à haute cardinalité** (userId, email, orderId, adresse IP, timestamp). Ces valeurs vont dans les **logs** ou les **attributs de span** — pas dans les labels de métriques. Une cardinalité incontrôlée fait exploser la mémoire de Prometheus et est l'erreur numéro 1 en observabilité (on y revient en détail aux modules 02 et 18).

### 2.5 Pourquoi ça compte : MTTD, MTTR et le coût de l'aveuglement

Deux acronymes structurent tout le cours :

- **MTTD** — *Mean Time To Detect* : temps moyen pour **détecter** qu'un incident a lieu.
- **MTTR** — *Mean Time To Resolve* (ou *Recover*) : temps moyen pour le **résoudre**.

Sans observabilité, ce sont **tes utilisateurs** qui te préviennent (MTTD = heures) et le debug se fait à l'aveugle (MTTR = heures). Avec les 3 piliers corrélés, une alerte se déclenche avant la plainte (MTTD = minutes) et la corrélation métrique → trace → log te mène à la cause en minutes. Chaque sprint sans instrumentation accumule une **dette d'observabilité** : le jour de l'incident, elle se paie au prix fort.

### 2.6 Panorama de la stack

Voici la carte des outils du cours, rangés par pilier. Tu n'as rien à installer maintenant — juste à savoir « qui fait quoi ».

| Rôle | Pilier | Outils (vus dans le cours) |
|---|---|---|
| Émettre le signal (SDK / instrumentation) | tous | **OpenTelemetry** (traces + métriques), **Pino** (logs), **prom-client** |
| Collecter / router | tous | **OpenTelemetry Collector** |
| Stocker les métriques | métriques | **Prometheus** |
| Stocker les logs | logs | **Loki**, ou **Elasticsearch** (stack ELK) |
| Stocker les traces | traces | **Tempo** (ou Jaeger) |
| Visualiser / requêter | tous | **Grafana**, **Kibana** |
| Suivre les erreurs applicatives | (transverse) | **Sentry** |

Le langage de requête des métriques Prometheus s'appelle **PromQL** ; celui de Loki, **LogQL**. On les apprend à partir du module 02. Dans les labs, ces outils tournent **pour de vrai** via des `docker-compose` fournis à la racine du cours — jamais de simulation.

### 2.7 Prérequis techniques du cours

Pour suivre les labs, tu dois avoir :

- **Node.js 20+** et un gestionnaire de paquets (`npm`/`pnpm`). Le cours utilise les ES Modules et `AsyncLocalStorage`.
- **TypeScript** de base : types/interfaces, génériques simples (`Promise<T>`), `async/await`, `import`/`export`.
- **Docker** + **Docker Compose** : indispensable pour lancer Prometheus, Grafana, Tempo, etc. sans installation native. Vérifie avec `docker compose version`.
- Des bases **HTTP** et un framework serveur (le cours ancre sur **NestJS**, l'API de TribuZen).

Si Docker n'est pas prêt, installe Docker Desktop avant le module 02 (premier lab qui en dépend).

---

## 3. Worked examples

### Exemple 1 — Router chaque question de l'incident vers le bon pilier

Reprends l'incident du §1. Pour chaque question, **quel pilier** y répond ? C'est le réflexe fondamental du métier.

| Question pendant l'incident | Pilier | Pourquoi |
|---|---|---|
| « Le taux d'échec des invitations grimpe-t-il ? » | **Métrique** | On veut un **agrégat** dans le temps (rate), pas un cas isolé. C'est aussi ce qui doit **déclencher l'alerte**. |
| « Quelle étape du `POST /members` est lente ? » | **Trace** | On cherche le **span** goulot dans le parcours distribué (API → worker → SMTP). |
| « Pourquoi précisément ça échoue, pour qui ? » | **Log** | On veut le **contexte exact** : `userId`, `familyId`, `reason: smtp_timeout`. |

Enchaînement typique : la **métrique** sonne l'alarme → la **trace** localise le span coupable → le **log** (corrélé par `traceId`) donne la cause racine. Trois piliers, un seul fil rouge : le `traceId`.

### Exemple 2 — Cardinalité : compter les erreurs d'invitation, proprement

Le PO demande : « Je veux suivre les échecs d'invitation, et pouvoir distinguer les causes (SMTP, quota, base). » Deux designs :

```
# ❌ MAUVAIS — familyId et userId en labels
member_invite_failed_total{familyId, userId, reason}
# familyId : des milliers de valeurs · userId : des millions
# → explosion du nombre de séries, Prometheus sature
```

```
# ✅ BON — seul un label à cardinalité BORNÉE
member_invite_failed_total{reason}
# reason ∈ { smtp_timeout, quota_exceeded, db_error }  → 3 séries. Parfait.
```

Le besoin « distinguer les causes » est satisfait par le label `reason` (cardinalité = 3, bornée et connue). Le besoin « quel utilisateur exactement » ne relève **pas** de la métrique : il va dans le **log** corrélé (`{ event: "member_invite_failed", userId, familyId, reason }`). Chaque pilier à sa place : la métrique compte et alerte, le log identifie.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « Observabilité = les 3 piliers, point »

Les 3 piliers sont les **types de données**, pas la finalité. La finalité est de **répondre à des questions inconnues** en corrélant ces données. Empiler trois outils sans les relier (pas de `traceId` commun) ne rend pas ton système observable — juste bavard. Le correct : instrumenter **pour la corrélation**, avec un identifiant partagé.

### PIÈGE #2 — Confondre monitoring et observabilité (et croire qu'il faut choisir)

Le monitoring n'est pas « dépassé ». C'est le **noyau connu** (dashboards, seuils, alertes) inclus dans l'observabilité. On ne choisit pas l'un contre l'autre : on **monitore** les questions connues et on garde la capacité d'**explorer** les inconnues. Dire « on a Grafana donc on est observables » est faux si on ne sait répondre qu'aux questions déjà prévues.

### PIÈGE #3 — Mettre une valeur à haute cardinalité en label de métrique

`userId`, `email`, `orderId`, `traceId`, IP, timestamp **en label** = explosion de séries temporelles et Prometheus à genoux. Ces valeurs appartiennent aux **logs** et aux **attributs de span**. En label de métrique : uniquement des dimensions **bornées** (méthode HTTP, route, code de statut, `reason` d'une liste fermée).

### PIÈGE #4 — Croire que les logs suffisent (« je mettrai juste plus de logs »)

Les logs répondent à « que s'est-il passé pour cet événement ». Ils sont **inadaptés** à « le taux d'erreur global dépasse-t-il 1 % ? » (il faudrait tout scanner et agréger à chaque question — lent et cher) et à « où est le goulot dans un flux à 6 services ? ». Alerting et tendance = **métriques** ; flux distribué = **traces**. Ajouter des logs ne remplacera jamais ces deux piliers.

### PIÈGE #5 — Confondre `console.log` et logging structuré

`console.log('invite failed for user 42')` est du texte pour un humain, dans un terminal, à trois requêtes/seconde. En production (10 000 req/s, 3 services), il est illisible et non requêtable par machine. Le logging **structuré** (JSON avec des champs `userId`, `event`, `reason`) est requêtable, filtrable, corrélable. C'est le sujet du module 01 — et la première dette qu'on rembourse dans TribuZen.

---

## 5. Ancrage TribuZen

Ce module produit le **plan d'observabilité initial** de TribuZen. On cartographie les 3 piliers sur l'architecture réelle :

```
                          ┌───────────────────────────────┐
   Navigateur ──HTTP──▶   │  Front Nuxt (SSR)             │
                          └───────────────┬───────────────┘
                                          │ REST
                          ┌───────────────▼───────────────┐
                          │  API NestJS                    │
                          │  (auth, familles, membres)     │
                          └──────┬──────────────────┬──────┘
                                 │                  │ jobs
                       ┌─────────▼──────┐   ┌───────▼────────┐
                       │  PostgreSQL    │   │  Workers        │
                       │  (Prisma)      │   │  (e-mail, push) │
                       └────────────────┘   └───────┬────────┘
                                                    │
                                            ┌───────▼────────┐
                                            │ SMTP / push tiers│
                                            └──────────────────┘
```

Mapping des 3 piliers sur cette architecture :

| Pilier | Où, dans TribuZen | Exemple concret |
|---|---|---|
| **Logs** | API NestJS + workers, en JSON (Pino) | `{ event: "member_invite_failed", userId, familyId, reason, traceId }` |
| **Métriques** | API (Prometheus via prom-client) | `http_request_duration_seconds`, `member_invite_total{status}` |
| **Traces** | requête traversant front → API → worker → SMTP | span racine `POST /families/:id/members`, span enfant `worker.sendInvitationEmail` |

Priorités de remboursement de la dette (l'ordre du cours) :
1. **Logs structurés** dans l'API (module 01) — le socle, avec `traceId`.
2. **Métriques RED** sur l'API (modules 02–03) — pour alerter avant la plainte utilisateur.
3. **Traces** front → API → workers (modules 04–05) — pour localiser le goulot SMTP de l'incident du §1.

L'incident « invitation qui tourne dans le vide » est le fil rouge : à la fin du cours (capstone, module 21), TribuZen sera assez observable pour le diagnostiquer en 90 secondes.

---

## 6. Points clés

1. **Observabilité** = propriété d'un système qui permet de répondre à des questions **non anticipées** sur son état interne, à partir de ses sorties.
2. **Monitoring** (questions connues, seuils, dashboards) est un **sous-ensemble** de l'observabilité (qui ajoute l'exploration ad hoc et la corrélation).
3. Les **3 piliers** : logs (contexte d'un événement), métriques (agrégats/tendance/alerte), traces (flux distribué/goulot). Aucun ne suffit seul.
4. La **corrélation** via un **`traceId`** partagé transforme trois flux séparés en un outil de diagnostic.
5. **Cardinalité** = nombre de séries temporelles ; ne jamais mettre en label une valeur à haute cardinalité (userId, email, id, IP) — ça va dans les logs/spans.
6. **MTTD/MTTR** chutent quand l'observabilité monte ; l'inverse s'appelle la **dette d'observabilité**.
7. **Stack** : OpenTelemetry/Pino/prom-client émettent → Collector route → Prometheus (métriques) / Loki (logs) / Tempo (traces) stockent → Grafana visualise ; Sentry pour les erreurs.
8. **Prérequis** : Node 20+, TypeScript de base, Docker Compose, bases HTTP/NestJS.

---

## 7. Seeds Anki

```
Définis l'observabilité (au sens système).|Propriété d'un système permettant de déduire son état interne à partir de ses sorties externes — donc de répondre à n'importe quelle question sur son comportement, même non anticipée, sans redéployer.
Quelle est LA différence entre monitoring et observabilité ?|Le monitoring répond à des questions connues d'avance (seuils, dashboards) ; l'observabilité répond aussi aux questions inconnues/émergentes par exploration ad hoc et corrélation. Le monitoring est un sous-ensemble de l'observabilité.
Quels sont les 3 piliers et à quoi sert chacun ?|Logs = contexte détaillé d'un événement précis ; Métriques = valeurs agrégées pour tendance/alerte ; Traces = parcours distribué d'une requête pour trouver le goulot. Aucun ne suffit seul.
Qu'est-ce qui relie les 3 piliers pour permettre le diagnostic ?|Le traceId partagé : injecté dans les logs et attaché aux spans. La métrique détecte, la trace localise, le log explique — reliés par ce même identifiant.
Qu'est-ce que la cardinalité et pourquoi est-ce dangereux ?|Nombre de combinaisons uniques de labels = nombre de séries temporelles. Mettre une valeur à haute cardinalité (userId, email, IP) en label fait exploser le nombre de séries et sature Prometheus.
Où mettre le userId : label de métrique ou log ?|Dans le log (ou attribut de span), jamais en label de métrique — sa cardinalité est trop élevée. Les labels de métrique doivent être bornés (méthode, route, statut, reason d'une liste fermée).
Que signifient MTTD et MTTR ?|MTTD = Mean Time To Detect (temps pour détecter l'incident) ; MTTR = Mean Time To Resolve/Recover (temps pour le résoudre). L'observabilité fait chuter les deux.
Situe Prometheus, Loki et Tempo sur les 3 piliers.|Prometheus = stockage des métriques ; Loki = stockage des logs ; Tempo = stockage des traces. Grafana les visualise tous les trois ; OpenTelemetry/Pino/prom-client émettent le signal.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-00-prerequis-et-introduction/README.md`. Exercice de conception (pas de code) : dresser le plan d'observabilité de TribuZen et mapper les 3 piliers sur ses composants, avec grille d'auto-évaluation et variante J+30.

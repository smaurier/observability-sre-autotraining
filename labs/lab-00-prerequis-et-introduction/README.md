# Lab 00 — Plan d'observabilité de TribuZen

> **Outcome :** à la fin, tu sais **dresser le plan d'observabilité** d'un système distribué réel — mapper les 3 piliers (logs, métriques, traces) sur ses composants, choisir le bon pilier pour chaque question, et repérer les pièges de cardinalité — sans écrire une ligne d'instrumentation.
> **Vrai outil :** un document de conception (Markdown, dans le repo). C'est un livrable d'architecte, pas du code — exactement ce qu'on produit avant d'instrumenter en vrai.
> **Feedback :** le coach valide le plan en session — pas de test-runner. La grille ci-dessous sert d'auto-évaluation d'abord.

---

## Énoncé

Tu es la personne en charge de l'observabilité de **TribuZen**. Avant d'installer le moindre outil, ton lead te demande un **plan d'observabilité** : un document d'une page qui répond à « qu'est-ce qu'on observe, où, avec quel pilier, et pourquoi ».

L'architecture de TribuZen :

```
Navigateur → Front Nuxt (SSR) → API NestJS → PostgreSQL (Prisma)
                                     └──▶ Workers (e-mail, push) → SMTP / push tiers
```

Trois parcours utilisateur critiques à couvrir :
- **A. Connexion** : `POST /auth/login` (API + base).
- **B. Inviter un membre** : `POST /families/:id/members` (API + base + worker e-mail + SMTP tiers). *C'est le parcours de l'incident du module.*
- **C. Afficher le tableau de bord famille** : page Nuxt SSR qui appelle `GET /families/:id`.

**Tu produis un document**, pas du code. Crée le fichier `docs/observability-plan.md` dans ton copie de travail (ou une feuille à part si tu préfères). Le livrable a **quatre parties** (détaillées en Étapes).

---

## Étapes (en friction)

Écris chaque partie **de ta tête d'abord**, en t'appuyant sur le module. Ne regarde le corrigé qu'après avoir rempli les quatre parties.

1. **Table de mapping des piliers.** Pour chacun des 3 composants instrumentables (**API NestJS**, **Workers**, **Front Nuxt**), remplis une ligne : quel(s) pilier(s) on y branche, et **un** exemple concret de signal par pilier pertinent. (PostgreSQL et le SMTP tiers sont observés *à travers* l'API/les workers, pas directement — note-le.)

2. **Routage des questions.** Pour chacune de ces 5 questions d'incident, écris le **pilier qui répond** et **une phrase** de justification :
   - Q1. « Le taux d'échec de `POST /families/:id/members` grimpe-t-il depuis 21h ? »
   - Q2. « Pour l'invitation du parent u_42, quelle a été la cause exacte de l'échec ? »
   - Q3. « Dans le parcours B, quelle étape mange les 30 secondes ? »
   - Q4. « Combien de connexions par minute en ce moment ? »
   - Q5. « La requête de u_42 est-elle passée par le worker, ou a-t-elle échoué avant ? »

3. **Cardinalité — le tri.** On veut une métrique `member_invite_total`. Pour chacun de ces labels candidats, écris **GARDER** ou **REJETER** + la raison : `status`, `reason`, `familyId`, `userId`, `country`, `smtp_provider`. Pour chaque REJETER, indique **où** l'info doit aller à la place.

4. **Priorisation + fil rouge.** Classe les 3 piliers dans l'**ordre d'implémentation** pour TribuZen et justifie en une phrase chacun. Puis, en 3 lignes, explique **comment ton plan aurait résolu l'incident du module** (invitation qui « tourne dans le vide ») en 90 secondes au lieu d'une soirée.

---

## Corrigé complet commenté

> Un plan est correct s'il tient les **principes**, pas s'il est identique mot pour mot. Compare la logique, pas la formulation.

### Partie 1 — Table de mapping des piliers

| Composant | Logs | Métriques | Traces |
|---|---|---|---|
| **API NestJS** | ✅ JSON (Pino) : `{ event, userId, familyId, reason, traceId }` | ✅ RED : `http_request_duration_seconds`, `http_requests_total{route,status}` | ✅ span racine par requête HTTP (`POST /families/:id/members`) |
| **Workers** | ✅ JSON : `{ event: "invite_email_sent", jobId, reason, traceId }` | ✅ `job_duration_seconds`, `job_failures_total{reason}` | ✅ span enfant `worker.sendInvitationEmail` (propagé depuis l'API) |
| **Front Nuxt** | ⚠️ logs SSR côté serveur ; erreurs client → Sentry (module 06) | ✅ Core Web Vitals / RUM (module 16) | ✅ span racine navigateur → propagé à l'API |

- **PostgreSQL** : observé *via* l'API — span enfant `DB INSERT` dans la trace, et via des métriques d'infra plus tard. Pas de pilier « à la main » côté base dans ce plan initial.
- **SMTP / push tiers** : observés *via* le worker — c'est le span `connect provider` qui révèle le timeout. On n'instrumente pas le tiers, on instrumente **notre** appel vers lui.

**Pourquoi c'est correct :** on branche les 3 piliers là où **notre** code s'exécute (API, workers, front) et on observe les dépendances externes **à travers** les spans/logs de notre code. Le `traceId` apparaît partout : c'est le fil qui reliera tout.

### Partie 2 — Routage des questions

| Q | Pilier | Justification |
|---|---|---|
| Q1 — taux d'échec grimpe-t-il ? | **Métrique** | Besoin d'un **agrégat dans le temps** (rate) ; c'est aussi ce qui doit déclencher l'**alerte**. Impossible/coûteux avec des logs. |
| Q2 — cause exacte pour u_42 | **Log** | Besoin du **contexte d'un événement précis** : `userId`, `reason: smtp_timeout`. Une métrique a agrégé cette info away. |
| Q3 — quelle étape mange 30 s | **Trace** | On cherche le **span goulot** dans un parcours distribué (API → worker → SMTP). |
| Q4 — connexions/minute | **Métrique** | Compteur agrégé + rate. Vue d'ensemble, pas de cas individuel. |
| Q5 — passée par le worker ou échoué avant ? | **Trace** | Seule la trace montre **le chemin réel** de la requête et jusqu'où elle est allée. |

**Enchaînement à retenir :** métrique **détecte** (Q1) → trace **localise** (Q3, Q5) → log **explique** (Q2). Reliés par le `traceId`.

### Partie 3 — Cardinalité, le tri

| Label | Décision | Raison / redirection |
|---|---|---|
| `status` | **GARDER** | Borné : `success` / `error`. 2 valeurs. |
| `reason` | **GARDER** | Liste fermée connue : `smtp_timeout`, `quota_exceeded`, `db_error`. Cardinalité bornée. |
| `familyId` | **REJETER** | Milliers de valeurs → explosion de séries. → va dans le **log** et les **attributs de span**. |
| `userId` | **REJETER** | Cardinalité la plus dangereuse (millions). → **log** / **span**, jamais label. |
| `country` | **GARDER** (avec prudence) | Borné (~200 valeurs max), utile pour segmenter. Acceptable si le besoin métier existe. |
| `smtp_provider` | **GARDER** | Poignée de fournisseurs (liste fermée). Utile pour isoler une panne fournisseur. |

**Principe :** un label est acceptable si son ensemble de valeurs est **borné et connu**. `userId`/`familyId` sont bornés « en théorie » mais énormes en pratique → interdits en label. Leur place est le log corrélé.

### Partie 4 — Priorisation + fil rouge

**Ordre d'implémentation pour TribuZen :**
1. **Logs structurés** (module 01) — socle le moins coûteux, apporte immédiatement le contexte + introduit le `traceId` que tout le reste réutilisera.
2. **Métriques RED** (modules 02–03) — pour **alerter avant la plainte** de l'utilisateur (fait chuter le MTTD).
3. **Traces** (modules 04–05) — pour **localiser** dans le parcours distribué (le worker/SMTP de l'incident).

**Comment le plan résout l'incident du module (3 lignes) :**
> Une **alerte** sur la métrique `member_invite_total{status="error"}` sonne à 21h32 (MTTD = 2 min, pas « le lendemain via Discord »). La **trace** du parcours B montre le span `worker.sendInvitationEmail` à 30 s → SMTP. Le **log** corrélé par `traceId` confirme `reason: smtp_timeout`. Diagnostic en 90 secondes.

---

## Grille d'auto-évaluation

Coche honnêtement avant de montrer au coach. Objectif : 7/8.

- [ ] Partie 1 : les 3 piliers sont branchés sur API **et** workers **et** front (pas seulement l'API).
- [ ] Partie 1 : PostgreSQL et SMTP sont observés *via* notre code (spans/logs), pas « directement ».
- [ ] Partie 1 : le `traceId` apparaît comme fil reliant les piliers.
- [ ] Partie 2 : Q1 et Q4 → métrique ; Q2 → log ; Q3 et Q5 → trace, avec justification cohérente.
- [ ] Partie 3 : `userId` et `familyId` **rejetés** comme labels, redirigés vers logs/spans.
- [ ] Partie 3 : la raison invoquée est bien « cardinalité / nombre de séries temporelles ».
- [ ] Partie 4 : ordre logs → métriques → traces, avec une justification par pilier.
- [ ] Partie 4 : le scénario de résolution enchaîne détecter (métrique) → localiser (trace) → expliquer (log).

## Coach

Points sur lesquels le coach te pousse en session :
- **« Pourquoi PAS l'inverse ? »** — pourquoi ne pas commencer par les traces (les plus « impressionnantes ») ? Réponse attendue : coût/effort de mise en place vs valeur immédiate ; les logs posent le `traceId` dont les traces ont besoin.
- **Piège du réflexe log** — si tu réponds « log » à Q1 ou Q4, le coach te fait estimer le coût de scanner tous les logs pour calculer un taux à chaque question. Le pilier métrique existe précisément pour ça.
- **Cardinalité concrète** — le coach te demande d'**estimer le nombre de séries** avec `userId` en label sur une base de 50 000 utilisateurs. L'ordre de grandeur (des centaines de milliers de séries) doit te faire mal.
- **Défendre à froid** — reformule ton plan en 60 secondes comme si tu le présentais en entretien : « 3 piliers, corrélés par traceId, cardinalité maîtrisée, priorisés logs→métriques→traces ». C'est un livrable d'architecte vendable.

## Variante J+30 (fading)

**Même exercice, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. **Nouveau système, en 20 minutes.** Fais le plan d'observabilité d'un **service de paiement** (`payment-service` → Stripe) au lieu de TribuZen : 3 composants de ton choix, la table de mapping, 3 questions d'incident routées, et le tri de cardinalité pour une métrique `payment_attempt_total`.
2. **Contrainte cardinalité renforcée :** on te propose le label `amount_eur` (montant de la transaction). GARDER ou REJETER ? Justifie — et propose l'alternative correcte (indice : *buckets*).
3. **Critère de réussite :** un lecteur qui ne connaît pas le service comprend, en lisant ta page, quoi instrumenter et pourquoi — sans que tu sois là pour l'expliquer.

---

## Application TribuZen

Ce plan n'est pas jetable : c'est le **document fondateur** de tout le cours. Dans le repo `smaurier/tribuzen` :

```
tribuzen/
  docs/
    observability-plan.md   ← le livrable de ce lab
```

**Comment il évolue :** à chaque module, tu reviens cocher ce que tu as réellement instrumenté (logs au module 01, métriques RED au module 02, traces au module 04…). À la fin (capstone, module 21), le plan est intégralement « fait » et TribuZen diagnostique l'incident d'invitation en 90 secondes.

**Commit cible :**
```
docs(observability): plan initial — mapping 3 piliers sur API/workers/front, cardinalité, priorisation
```

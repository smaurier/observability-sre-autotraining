---
titre: Distributed tracing — traces, spans et propagation de contexte
cours: 16-observability-sre
notions: ["trace", "span", "contexte de trace (trace_id / span_id)", "root span vs child span", "propagation W3C traceparent", "tracestate", "trace flags (sampled)", "sampling head-based", "sampling tail-based", "attributs de span", "span events", "span status et span kind", "quand une trace éclaire ce que métriques et logs ne montrent pas"]
outcomes:
  - sait expliquer ce qu'est une trace, un span et le lien parent-enfant qui les relie
  - sait lire un header traceparent et décoder ses 4 champs (version, trace-id, parent-id, trace-flags)
  - sait décrire comment le contexte de trace se propage d'un service à l'autre
  - sait distinguer sampling head-based et tail-based et choisir selon le besoin
  - sait dire quand une trace répond à une question que ni les métriques ni les logs ne peuvent résoudre
prerequis: [modules 00-03 du cours (piliers logs/metrics/traces, logging structuré, corrélation, métriques Prometheus, RED/USE)]
next: 05-opentelemetry-instrumentation
libs: []
tribuzen: observabilité TribuZen — suivre une requête (ex. inviter un membre) à travers front, BFF, service famille, service notifications
last-reviewed: 2026-07
---

# Distributed tracing — traces, spans et propagation de contexte

> **Outcomes — tu sauras FAIRE :** expliquer trace/span/contexte de trace, lire un header `traceparent`, décrire la propagation de contexte entre services, distinguer sampling head-based et tail-based, et dire quand une trace éclaire ce que métriques et logs ne montrent pas.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est **conceptuel**. Il pose le modèle mental du tracing distribué (traces, spans, contexte, propagation, sampling). L'**instrumentation concrète avec OpenTelemetry** (SDK, auto/manual instrumentation, exporters) et le **collector** sont le sujet du **module 05**. Ici, zéro code d'instrumentation OTel : on apprend à *lire* et *raisonner* sur une trace avant d'en produire.

## 1. Cas concret d'abord

Un utilisateur TribuZen clique sur « Inviter un membre » dans sa famille. Côté produit, la requête traverse quatre services :

```
Navigateur (Nuxt)
   │  POST /api/families/f-123/invitations
   ▼
BFF (API TribuZen)  ──►  Service Famille (vérifie les droits, écrit en base)
   │                          └─► PostgreSQL (INSERT invitation)
   └──────────────────────►  Service Notifications  ──►  Provider Email
```

Ce matin, le support remonte : « l'invitation met **4 secondes** à partir ». Tu ouvres tes outils habituels.

**Les métriques** (module 02) te disent : la latence p95 de `POST /invitations` est montée à 4 s. Utile — mais *agrégé*. Elles ne disent pas **quelle étape** est lente, ni **pour quelle requête précise**.

**Les logs** (modules 01-03) te montrent des lignes isolées, une par service :

```
[BFF]            invitation received  family=f-123
[Service Famille] rights checked      family=f-123
[Service Notif]   email queued        family=f-123
```

Trois lignes, trois horloges, trois process. Rien ne prouve qu'elles appartiennent à **la même** requête, et rien ne mesure le temps **entre** elles. Tu peux corréler à la main via `family=f-123`… jusqu'à ce que deux invitations partent en même temps.

**Ce qu'il te manque**, c'est une vue qui suit *cette requête-là* de bout en bout, avec le temps passé à chaque étape :

```
POST /api/families/f-123/invitations ─────────────────────────────── 4 020 ms
  ├─ BFF: authz + routing ─── 12 ms
  ├─ Service Famille: createInvitation ──── 95 ms
  │    └─ PostgreSQL: INSERT invitation ── 40 ms
  └─ Service Notifications: sendInvite ──────────────────────── 3 900 ms  ◄── ici
       └─ HTTP POST email-provider/send ────────────────────── 3 880 ms
```

En un coup d'œil : le coupable est le **provider d'email** (3,88 s), pas la base, pas l'authz. C'est exactement ce que produit une **trace distribuée**. Ce module explique comment elle est construite, comment le contexte voyage d'un service à l'autre, et pourquoi elle répond à une question que les deux autres piliers laissent ouverte.

---

## 2. Théorie complète, concise

### 2.1 Trace et span : les deux briques

Selon la définition OpenTelemetry :

- Une **trace** est *« le chemin d'une requête à travers ton application »*. C'est l'ensemble des unités de travail déclenchées par une même requête, reliées entre elles.
- Un **span** est *« une unité de travail ou une opération »* — la brique de base des traces. Un appel HTTP entrant, une requête SQL, un envoi d'email, un bloc de code métier : chacun peut être un span.

Un span porte : un **nom**, un **timestamp de début** et de **fin** (donc une durée), un **contexte de span**, des **attributs**, des **events**, des **links**, un **status**. Une trace, c'est un **arbre de spans** partageant tous le même `trace_id`.

### 2.2 Le contexte de trace : `trace_id` et `span_id`

Le **span context** (contexte de span) est, selon OTel, *« un objet immuable présent sur chaque span »*. Il contient quatre choses :

| Champ | Rôle |
|-------|------|
| **Trace ID** | identifie **la trace entière** (16 octets / 32 hex) — partagé par tous les spans de la requête |
| **Span ID** | identifie **ce span précis** (8 octets / 16 hex) |
| **Trace Flags** | encodage binaire — le seul bit défini aujourd'hui est *sampled* |
| **Trace State** | paires clé-valeur spécifiques à un vendor (optionnel) |

Le `trace_id` est le fil rouge : c'est lui qu'on retrouve dans tous les spans, et idéalement aussi dans les **logs** (corrélation trace ↔ log, module 03). Le `span_id` distingue chaque nœud de l'arbre.

### 2.3 Root span, parent span, child span

L'arbre se construit via l'ID du span parent :

- Le **root span** *« n'a pas de parent »* — c'est le premier span de la trace, il marque le début et la fin de l'opération globale (dans notre cas : `POST /invitations`).
- Un **child span** représente une **sous-opération** ; sa présence est impliquée par le fait qu'il porte un `parent span ID`.
- Un **parent span** est simplement un span qui a des enfants.

```
trace_id = 4bf92f3577b34da6a3ce929d0e0e4736

[root]   POST /invitations        span_id=a1..  parent=∅
  ├─ [child] authz                span_id=b2..  parent=a1..
  ├─ [child] createInvitation     span_id=c3..  parent=a1..
  │    └─ [child] INSERT          span_id=d4..  parent=c3..
  └─ [child] sendInvite           span_id=e5..  parent=a1..
       └─ [child] HTTP POST email span_id=f6..  parent=e5..
```

Chaque flèche = une relation `parent → child`. C'est ce chaînage `span_id → parent span ID` qui reconstitue l'arbre côté backend de traces.

### 2.4 Span kind, status, attributs, events, links

Cinq notions enrichissent un span. Toutes viennent des specs OTel :

- **Span kind** — indice sur la nature du span : `SERVER` (appel entrant synchrone), `CLIENT` (appel sortant synchrone : HTTP, DB), `INTERNAL` (dans le process), `PRODUCER` / `CONSUMER` (jobs asynchrones : file de messages). Le backend s'en sert pour dessiner le graphe de services.
- **Span status** — trois valeurs : `Unset` (défaut, succès implicite), `Error` (une erreur est survenue), `Ok` (succès marqué explicitement par le dev).
- **Attributs** — *« paires clé-valeur qui annotent un span »*. Valeurs : string, booléen, nombre, ou tableau de ces types. Ex. `http.request.method`, `db.system`, ou métier : `family.id`, `invitation.channel`. Ils servent à **filtrer** les traces.
- **Span events** — *« un message de log structuré sur un span, pour marquer un instant précis »* dans sa durée. Nom + timestamp + attributs. Ex. `email_queued`.
- **Span links** — *« associent un span à un ou plusieurs autres spans »* avec une relation causale, **entre traces différentes**. Cas typique : une requête API qui pousse un job asynchrone repris plus tard — le span du worker *link* vers la trace d'origine.

> **Attributs vs events :** un attribut décrit le span **dans son ensemble** (comme une colonne). Un event marque un **instant** dans le span (comme un log horodaté). Filtre par attribut, lis le détail chronologique dans les events.

### 2.5 Propagation : le header W3C `traceparent`

Pour que le service B sache qu'il continue la trace démarrée par le service A, A doit **transmettre le contexte**. Le standard **W3C Trace Context** définit le header HTTP `traceparent`. Format (délimiteur = tiret) :

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ─┬ ────────────────┬─────────────── ───────┬──────── ─┬
   version ───┘                 │                        │          │
   trace-id (32 hex) ───────────┘                        │          │
   parent-id / span-id (16 hex) ─────────────────────────┘          │
   trace-flags (2 hex) ─────────────────────────────────────────────┘
```

Champs exacts (spec W3C) :

- **version** — 2 hex minuscules. Aujourd'hui `00`. La valeur `ff` est interdite.
- **trace-id** — 16 octets, **32 hex**. Doit être unique. **Tout à zéro est interdit.**
- **parent-id** — 8 octets, **16 hex** : l'ID du span **appelant** (le span de A). Tout à zéro (`0000000000000000`) est une valeur **invalide**.
- **trace-flags** — 8 bits, 2 hex. Seul le bit *sampled* est défini : c'est le **bit de poids faible** (le plus à droite). `01` = la trace est échantillonnée/enregistrée, `00` = non.

Quand A appelle B : A envoie `traceparent` avec **son** `span_id` comme `parent-id`. B lit le header, reprend le **même** `trace-id`, se crée un **nouveau** `span_id`, et devient enfant du span de A. Le `trace-id` ne change **jamais** au long de la requête ; le `parent-id` change à chaque saut.

### 2.6 `tracestate` : le complément vendor

À côté de `traceparent`, le header optionnel `tracestate` transporte des métadonnées **spécifiques à un vendor**, sous forme de liste de paires clé-valeur (max 32 membres, séparés par des virgules) :

```
tracestate: rojo=00f067aa0ba902b7,congo=t61rcWkgMzE
```

Chaque acteur peut ajouter/mettre à jour sa propre entrée sans casser la propagation des autres. `traceparent` porte l'identité de la trace ; `tracestate` porte des infos additionnelles par vendor.

### 2.7 Sampling : head-based vs tail-based

À grande échelle, stocker **100 %** des traces coûte trop cher (réseau, stockage). On **échantillonne**. Deux stratégies (specs OTel) :

**Head-based sampling** — *« décision le plus tôt possible »*, au **début** de la trace, sans examiner la trace entière. Forme la plus courante : le *consistent probability sampling*, décision prise à partir du `trace_id` et d'un pourcentage cible.

- Avantages OTel : *« facile à comprendre, facile à configurer, efficace »*.
- Limite majeure, citée telle quelle : *« il n'est pas possible de garantir que toutes les traces contenant une erreur soient échantillonnées avec le head sampling seul »* — la décision est prise **avant** de savoir si la requête échouera.
- Samplers OTel typiques (détail d'implémentation → module 05) : `AlwaysOn`, `AlwaysOff`, `TraceIdRatioBased` (ex. 10 %), `ParentBased` (respecte le bit *sampled* reçu dans `traceparent`, pour rester **cohérent** sur toute la trace).

**Tail-based sampling** — *« la décision est prise en considérant tous ou la plupart des spans de la trace »*, donc **après** que la trace est (quasi) complète. Réalisé dans un composant central (le collector, module 05).

- Permet des règles impossibles en head : *« toujours échantillonner les traces contenant une erreur »*, *« échantillonner selon la latence globale »*, appliquer des taux différents selon des critères.
- Contrepartie OTel : *« difficile à implémenter et à opérer »* — le composant doit être **stateful** et *« stocker une grande quantité de données »* (bufferiser les spans le temps de voir la trace entière → coût mémoire).

Règle de tête : **head** = simple et pas cher, mais on peut rater les erreurs rares ; **tail** = on garde ce qui compte (erreurs, lenteurs) au prix d'un buffer mémoire.

### 2.8 Le bit *sampled* relie propagation et sampling

Le champ `trace-flags` du `traceparent` porte la décision de sampling **head-based** de bout en bout : si le root span décide `sampled=1`, il transmet `-01`, et chaque service en aval (via `ParentBased`) prend la même décision. Sans cette propagation, un service échantillonnerait « oui » et le suivant « non » → trace **trouée**, inexploitable. C'est pourquoi la décision de sampling voyage **dans le contexte**, pas indépendamment par service.

---

## 3. Worked examples

### Exemple 1 — Décoder un `traceparent` reçu par le service Notifications

Le service Notifications de TribuZen reçoit cette requête HTTP entrante :

```
POST /internal/send-invite
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

Décodage champ par champ :

1. `00` → **version** du format Trace Context (la seule en usage).
2. `4bf92f3577b34da6a3ce929d0e0e4736` → **trace-id**, 32 hex = 16 octets. C'est l'identité de **toute** la requête « inviter un membre ». On la retrouvera dans le BFF, le service Famille, ici, et dans les logs corrélés.
3. `00f067aa0ba902b7` → **parent-id**, 16 hex = 8 octets. C'est le `span_id` du span **appelant** (le span `sendInvite` côté BFF/service Famille). Le span que Notifications va créer aura **ce** parent.
4. `01` → **trace-flags**. Bit de poids faible = 1 → *sampled* : cette trace **doit être enregistrée**. Le service Notifications, via un sampler `ParentBased`, respecte ce « oui » et enregistre son span.

Ce que le service fait ensuite (conceptuellement) : il crée un span `sendInvite` avec `kind=SERVER`, `trace_id` inchangé, un **nouveau** `span_id`, `parent span ID = 00f067aa0ba902b7`. S'il rappelle le provider d'email, il émet à son tour un `traceparent` où **son** `span_id` devient le `parent-id`, `trace-id` toujours identique.

> Aucune ligne d'OpenTelemetry ici : c'est le **modèle**. La production réelle de ces headers par le SDK est le module 05.

### Exemple 2 — Lire une trace pour trancher entre trois hypothèses

Reprenons l'incident du §1. Trois hypothèses circulent en réunion : « c'est la base », « c'est l'authz », « c'est l'email ». Voici la trace observée :

```
trace_id = 4bf92f3577b34da6a3ce929d0e0e4736     status global = Ok      durée = 4 020 ms

[root]  POST /api/families/f-123/invitations   SERVER   4 020 ms
  ├─ authz.check            INTERNAL     12 ms   status=Ok   attrs: user.id=u-9, family.id=f-123
  ├─ createInvitation       INTERNAL     95 ms   status=Ok
  │    └─ db INSERT invitation   CLIENT   40 ms  status=Ok   attrs: db.system=postgresql
  └─ sendInvite             CLIENT    3 900 ms   status=Ok   attrs: invitation.channel=email
       └─ HTTP POST email-provider/send  CLIENT  3 880 ms  status=Ok
          events: [email_queued @ +3 875 ms]
```

Lecture :

- `authz.check` = 12 ms → hypothèse « authz » **éliminée**.
- `db INSERT` = 40 ms → hypothèse « base » **éliminée**.
- `sendInvite` = 3 900 ms, dont 3 880 ms dans l'appel HTTP au provider → hypothèse « email » **confirmée**. Le goulot est **externe** à TribuZen.

Point crucial : **le status global est `Ok`** — il n'y a **pas d'erreur**, juste de la lenteur. Une alerte sur le taux d'erreur (module suivant sur l'alerting) n'aurait rien vu. Les métriques signalaient « p95 à 4 s » sans localiser. **Seule la trace** attribue les 3,88 s au bon span. Décision produit : mettre l'envoi d'email en **asynchrone** (répondre à l'utilisateur tout de suite, notifier en arrière-plan) — et le futur job asynchrone se reliera à cette trace via un **span link** (§2.4).

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « Corréler les logs par un ID métier = faire du tracing »

Mettre `family=f-123` dans chaque log **n'est pas** une trace. Deux différences : (1) un ID métier n'est **pas unique par requête** (deux invitations sur la même famille = collision) ; (2) les logs ne mesurent pas le **temps entre** les services ni la **structure parent-enfant**. Le `trace_id` est unique **par requête** et l'arbre de spans encode la hiérarchie et les durées. La corrélation par log est un pansement ; le tracing est l'outil.

### PIÈGE #2 — Croire que le `trace_id` change entre services

Le `trace_id` est **constant** sur toute la requête, du root span jusqu'au dernier appel. Ce qui change à chaque saut, c'est le **`parent-id`** du `traceparent` (le `span_id` de l'appelant). Confondre les deux, c'est ne plus comprendre comment l'arbre se reconstruit. Mnémo : *trace-id = le colis, span-id = chaque scan*.

### PIÈGE #3 — Confondre le `parent-id` du header avec le `trace-id`

Dans `00-<trace-id>-<parent-id>-01`, le **2ᵉ** champ (32 hex) est le trace-id, le **3ᵉ** (16 hex) est le parent-id = span de l'appelant. Ils n'ont **pas la même longueur** (32 vs 16 hex) : c'est le repère le plus fiable pour ne pas les inverser en lisant un header à la main.

### PIÈGE #4 — Penser que head sampling capture les erreurs rares

Le head sampling décide **au début**, avant de savoir si la requête échouera. À 10 % de sampling head, une erreur qui touche 0,1 % des requêtes n'est capturée qu'une fois sur mille échantillonnées → tu **rates** la panne rare, justement celle qu'il faut débugger. Pour garantir « toutes les traces en erreur sont gardées », il faut du **tail-based** (décision après coup, dans le collector). Ne pas vendre le head sampling comme filet de sécurité sur les erreurs.

### PIÈGE #5 — Décider le sampling indépendamment dans chaque service

Si chaque service tire sa propre décision aléatoire, un service enregistre son span et le suivant non → la trace est **trouée** et inexploitable. La décision doit être **cohérente** : elle est portée par le bit *sampled* de `trace-flags` et respectée en aval via un sampler `ParentBased`. Le sampling voyage **dans le contexte**, il n'est pas re-tiré à chaque hop.

### PIÈGE #6 — Confondre span **event** et span **link**

Un **event** est un instant **à l'intérieur** d'un span (même trace). Un **link** relie un span à un span d'une **autre** trace (relation causale asynchrone, ex. API → job worker). Utiliser un event là où il faut un link fait perdre le rattachement entre la requête d'origine et le traitement asynchrone.

---

## 5. Ancrage TribuZen

Le tracing distribué est la **couche « suivre une requête »** de l'observabilité TribuZen. Découpage en services de TribuZen (rappel fil-rouge) :

- **Front Nuxt** — déclenche la requête, porte le premier `traceparent` sortant (instrumenté au module 05).
- **BFF / API TribuZen** — reçoit la requête, crée le **root span** `POST /invitations` (kind `SERVER`).
- **Service Famille** — droits + persistance (spans `INTERNAL` + `CLIENT` vers PostgreSQL).
- **Service Notifications** — envoi email/push (span `CLIENT` vers le provider externe).

Parcours candidats à tracer en priorité dans TribuZen (là où plusieurs services collaborent) :

1. **Inviter un membre** (le cas de ce module) — front → BFF → Famille → Notifications → provider email.
2. **Créer un événement familial** — front → BFF → service Agenda → PostgreSQL → Notifications (rappels).
3. **Connexion** — front → BFF → service Auth → PostgreSQL.

Attributs métier à poser sur les spans TribuZen (pour filtrer les traces) :

```
family.id            = "f-123"
user.id              = "u-9"
invitation.channel   = "email"   // "email" | "push"
tribuzen.service     = "notifications"
```

Corrélation avec les autres piliers : le `trace_id` du root span est **injecté dans les logs** (module 03) — depuis une ligne de log en erreur, on saute à la trace complète, et inversement. C'est la promesse « logs + métriques + traces » du module 00, rendue concrète.

> Ce module reste **conceptuel** : on décrit *ce que* TribuZen trace et *pourquoi*. Le *comment* (installer le SDK OTel dans le BFF Nuxt et les services, propager réellement `traceparent`, exporter vers le collector) est le **module 05**.

---

## 6. Points clés

1. Une **trace** = le parcours d'une requête ; un **span** = une unité de travail. Une trace est un **arbre de spans** partageant le même `trace_id`.
2. Le **contexte de trace** = `trace_id` (32 hex, la trace entière) + `span_id` (16 hex, ce span) + `trace_flags` + `trace_state`.
3. Le **root span** n'a pas de parent ; un **child span** porte un `parent span ID` — c'est ce chaînage qui reconstruit l'arbre.
4. Le header **W3C `traceparent`** = `version-trace-id-parent-id-trace-flags` ; `trace-id` (32 hex) constant sur toute la requête, `parent-id` (16 hex) = span de l'appelant, change à chaque saut.
5. Le **bit *sampled*** (poids faible de `trace-flags`, `01`/`00`) propage la décision de sampling head-based pour garder la trace **cohérente**.
6. **Head sampling** : décision au début, simple et efficace, mais rate les erreurs rares. **Tail sampling** : décision après la trace complète (dans le collector), garde erreurs/lenteurs, coût mémoire (stateful).
7. **Attributs** = métadonnées du span (filtrage) ; **events** = instants dans le span ; **links** = lien causal entre traces différentes ; **kind**/**status** décrivent nature et issue.
8. Une trace répond à ce que métriques (agrégats) et logs (événements isolés) ne montrent pas : **quelle étape** d'**une requête précise** a ralenti ou échoué — même quand le status global est `Ok`.

---

## 7. Seeds Anki

```
Quelle est la différence entre une trace et un span ?|Une trace = le parcours complet d'une requête à travers l'app. Un span = une unité de travail (appel HTTP, requête SQL, bloc métier). Une trace est un arbre de spans partageant le même trace_id.
Que contient le contexte de trace (span context) ?|Trace ID (identifie la trace entière, 16 octets/32 hex), Span ID (identifie ce span, 8 octets/16 hex), Trace Flags (dont le bit sampled) et Trace State (métadonnées vendor).
Quels sont les 4 champs d'un header traceparent et leurs longueurs ?|version-trace_id-parent_id-trace_flags : version 2 hex, trace-id 32 hex, parent-id 16 hex (span de l'appelant), trace-flags 2 hex. Ex: 00-4bf9...4736-00f0...02b7-01.
Le trace_id change-t-il d'un service à l'autre ? Et le parent-id ?|Le trace_id reste constant sur toute la requête (le fil rouge). Le parent-id du traceparent change à chaque saut : c'est le span_id de l'appelant. Chaque service crée un nouveau span_id.
À quoi sert le bit sampled dans trace-flags ?|Bit de poids faible de trace-flags (01=oui, 00=non). Il propage la décision de sampling head-based à tous les services (via ParentBased) pour que la trace reste cohérente et non trouée.
Head-based vs tail-based sampling ?|Head : décision au début de la trace, simple/efficace mais rate les erreurs rares. Tail : décision après la trace complète (dans le collector, stateful), garde erreurs et lenteurs mais coûte de la mémoire.
Différence entre attribut, event et link d'un span ?|Attribut = métadonnée décrivant tout le span (filtrage). Event = instant précis dans le span (log horodaté). Link = relation causale vers un span d'une AUTRE trace (ex. API -> job async).
Quand une trace montre-t-elle ce que métriques et logs ne montrent pas ?|Quand il faut localiser quelle étape d'UNE requête précise a ralenti/échoué. Les métriques agrègent (p95 à 4s sans localiser), les logs sont isolés par service. La trace attribue le temps au bon span, même si le status global est Ok.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-04-distributed-tracing/README.md`. Tracer un flux TribuZen multi-services via le `docker-compose.tracing.yml` fourni (Jaeger + collector déjà réels), puis lire et analyser une trace pour localiser un goulot — grille d'analyse, coach en session, variante J+30. Zéro harnais simulé.

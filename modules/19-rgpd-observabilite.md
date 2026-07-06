---
titre: RGPD et observabilité — PII dans les logs, traces et métriques
cours: 16-observability-sre
notions: ["PII dans logs/traces/métriques", "minimisation (Art. 5 RGPD)", "limitation de conservation (rétention & purge)", "pseudonymisation vs anonymisation", "droit à l'effacement (Art. 17) appliqué à l'observabilité", "redaction Pino (option redact)", "bases légales (Art. 6)", "DPA et sous-traitants d'observabilité"]
outcomes:
  - sait repérer les PII qui fuient dans les logs, traces et attributs de spans d'une app
  - sait appliquer la minimisation et la redaction (Pino redact, sanitisation d'URL) au plus près de la source
  - sait distinguer pseudonymisation et anonymisation et en tirer les conséquences RGPD
  - sait poser une politique de rétention/purge et raisonner le droit à l'effacement sur des données d'observabilité
  - sait quelles questions poser à un DPO et quoi exiger dans un DPA avec un vendor SaaS d'obs
prerequis: ["modules 00-18 du cours (dont module 01 — logging structuré et réflexe redaction)", "notion de PII vue au module 01"]
next: 20-dora-et-production-readiness
libs: []
tribuzen: conformité de la stack d'observabilité TribuZen — pas de donnée de famille ni d'enfant en clair dans les logs/traces, rétention bornée, DPA avec les vendors
last-reviewed: 2026-07
---

<!-- FLAG-REVIEW: RGPD/JURIDIQUE — à valider par Sylvain -->
<!-- Ce module présente des PRINCIPES techniques de conformité, pas un avis juridique.
     Toute décision sur un cas réel (durée de conservation exacte, base légale d'un traitement,
     réponse à une demande d'effacement) doit être validée avec un DPO / juriste. -->

# RGPD et observabilité — PII dans les logs, traces et métriques

> **Outcomes — tu sauras FAIRE :** repérer les PII qui fuient dans logs/traces/métriques, les minimiser et les redacter au plus près de la source (Pino `redact`), distinguer pseudonymisation et anonymisation, poser une rétention/purge, et cadrer un DPA vendor.
> **Difficulté :** :star::star::star:
>
> **Avertissement.** Ce module donne des **principes techniques**, pas un conseil juridique. Le RGPD s'interprète au cas par cas : pour une durée de conservation précise, une base légale contestée ou une demande d'effacement réelle, la décision revient à un **DPO** (Délégué à la Protection des Données) ou à un juriste. L'ingénieur applique et documente ; il ne tranche pas seul le droit.
>
> **Portée.** On traite ici la **conformité des données d'observabilité** (les 3 piliers vus aux modules 01-05). Le consentement analytics/cookies, la DPIA formelle et la procédure de notification de violation sont mentionnés mais relèvent d'un travail conjoint avec le DPO — hors périmètre technique de ce module.

## 1. Cas concret d'abord

TribuZen organise la vie de familles : membres, enfants, événements, présences (RSVP). C'est un produit qui manipule, par nature, des données de **personnes**, dont des **mineurs** — une catégorie que le RGPD protège de façon renforcée.

Tu ouvres les logs de l'API en production (collectés par Loki) et tu tombes sur ça, émis à chaque création d'événement :

```json
{
  "level": "info",
  "msg": "event created",
  "req": {
    "headers": { "authorization": "Bearer eyJhbGciOiJIUzI1Ni...", "cookie": "sid=8f3a..." },
    "url": "/api/families/join?email=camille.durand@gmail.com&token=abc123"
  },
  "family": { "name": "Famille Durand", "children": [{ "firstName": "Léo", "birthDate": "2016-04-12" }] },
  "organizer": { "email": "camille.durand@gmail.com", "ip": "82.66.14.203" }
}
```

Compte les problèmes. Un **JWT** (contient l'`email`/`sub` de l'organisatrice), un **cookie de session**, une **URL** avec `email` et `token` en clair dans les query params, le **prénom et la date de naissance d'un enfant**, l'**e-mail** et l'**IP** de l'organisatrice. Presque tout ce log est de la donnée personnelle — et une partie concerne un **mineur**.

Ce log part ensuite chez un vendor SaaS, est indexé, dupliqué dans des backups, consultable par toute personne ayant accès à Grafana. Si ce dashboard fuit, c'est une **violation de données** (Art. 33) à notifier sous 72 h.

Le RGPD n'interdit pas d'observer son système. Il impose de le faire **sans collecter plus de personnes-données que nécessaire**, et de **borner** leur durée de vie. À la fin de ce module, ce même log ressort ainsi :

```json
{
  "level": "info",
  "msg": "event created",
  "req": { "headers": { "authorization": "[Redacted]", "cookie": "[Redacted]" }, "url": "/api/families/join?email=[Redacted]&token=[Redacted]" },
  "familyId": "fam_9f2c", "organizerId": "usr_5a1b", "childrenCount": 1, "ip": "82.66.14.0"
}
```

On garde de quoi **débugger** (des identifiants pseudonymes, un compte d'enfants, une IP tronquée), on jette ce qui **identifie directement** une personne. C'est de la **minimisation**, appliquée aux données d'observabilité.

---

## 2. Théorie complète, concise

### 2.1 Ce qu'est une donnée personnelle (et pourquoi l'obs en est pleine)

Définition CNIL/RGPD : **toute information se rapportant à une personne physique identifiée ou identifiable**, directement ou indirectement. Le piège en observabilité, c'est l'**indirect** : beaucoup de champs « techniques » identifient une personne.

| Évidemment personnel | Techniquement personnel (souvent oublié) |
|---|---|
| nom, prénom, e-mail, téléphone | adresse IP, cookie/session id, device id |
| date de naissance, adresse | JWT (contient souvent `sub`/`email`), `userId` réversible |
| photo | User-Agent très spécifique, empreinte |

Deux points de doctrine utiles (source CNIL) :
- une **adresse IP** est généralement considérée comme une donnée personnelle (elle rattache à un abonné) ;
- un **identifiant pseudonyme** (`usr_5a1b`) reste une donnée personnelle tant qu'un mapping permet de remonter à la personne (voir §2.4).

Pour TribuZen, ajoute la sur-couche **mineurs** : les données d'enfants appellent une vigilance renforcée. La règle pratique : **rien qui identifie un enfant ne doit atterrir dans un log de debug.**

### 2.2 Les principes de l'Article 5 qui pilotent l'observabilité

L'Article 5(1) du RGPD pose les principes. Trois structurent directement ta stack d'obs (formulations vérifiées, gdpr-info.eu) :

- **Limitation des finalités** — données « collectées pour des finalités déterminées, explicites et légitimes ». Tu observes pour *débugger / sécuriser / mesurer la perf*, pas pour profiler un utilisateur.
- **Minimisation des données** — données « adéquates, pertinentes et **limitées à ce qui est nécessaire** au regard des finalités ». C'est le principe n°1 de l'obs : tu n'as presque jamais besoin d'un e-mail pour diagnostiquer une latence.
- **Limitation de la conservation** — données conservées « sous une forme permettant l'identification des personnes pendant une durée **n'excédant pas celle nécessaire** ». D'où la rétention/purge (§2.6).

S'ajoute l'**Article 25 — Privacy by design & by default** : prévoir la protection *dès la conception* et *par défaut*. Traduit en obs : le scrubbing des PII est intégré au **pipeline de log dès le départ**, et par défaut on ne collecte **pas** de PII, sauf besoin documenté.

### 2.3 Bases légales (Article 6) — la version courte pour l'ingénieur

Tout traitement de donnée personnelle exige une **base légale** (Art. 6). L'ingénieur ne la choisit pas seul, mais doit savoir laquelle porte son traitement d'obs. Les trois qui reviennent :

| Base légale | Traitement d'obs typique |
|---|---|
| **Intérêt légitime** | monitoring applicatif, détection d'anomalie, sécurité (à mettre en balance avec les droits des personnes) |
| **Obligation légale** | conservation de certains journaux (ex. données de connexion) imposée par la loi |
| **Consentement** | analytics comportementale / traceurs (domaine du DPO + CMP, pas ce module) |

> Le monitoring technique de TribuZen repose usuellement sur l'**intérêt légitime**. Cette qualification, et son équilibre avec les droits des personnes, se valide avec le DPO — pas en commentaire de code.

### 2.4 Pseudonymisation vs anonymisation — LA distinction à ne pas rater

C'est le concept le plus mal compris, et il a des conséquences RGPD opposées.

- **Pseudonymisation** — on remplace l'identifiant direct par un pseudonyme, mais il **existe encore un moyen** (une table, une clé, un algorithme réversible) de remonter à la personne. Exemple : `usr_5a1b`, ou un hash **avec sel secret**. → La donnée **reste personnelle**, reste soumise au RGPD (droits, rétention, sécurité). C'est une *mesure de réduction du risque*, pas une sortie du RGPD.
- **Anonymisation** — le lien vers la personne est **irréversiblement** rompu ; **personne** ne peut ré-identifier, même en recoupant. → La donnée **n'est plus personnelle** et sort du champ du RGPD.

L'anonymisation est **exigeante** : une donnée « anonymisée » qui reste ré-identifiable par recoupement n'est en réalité que pseudonymisée. En pratique, les logs/traces sont au mieux **pseudonymisés** ; les **métriques agrégées** (un compteur, un histogramme sans label identifiant) sont généralement **anonymes** — c'est pour ça qu'elles échappent largement aux contraintes PII.

Conséquence directe : un `userId` pseudonyme dans un log **ne te dispense pas** de la rétention ni du droit à l'effacement (§2.7).

### 2.5 Où les PII se cachent dans les 3 piliers

**Logs.** Le message lui-même (`"Card declined for alice@..."`), les objets sérialisés (`user`, `family`), les **headers** (`authorization`, `cookie`, `x-forwarded-for`), les **stack traces** (un framework sérialise souvent l'objet fautif entier).

**Traces (spans).** Les attributs sémantiques OTel piègent : `http.url` / `http.target` (query params !), `db.statement` (valeurs de requête), `enduser.id`, headers de requête capturés. Sanitiser l'URL **avant** de la poser en attribut :

```ts
function sanitizeUrl(raw: string): string {
  const u = new URL(raw, 'http://local')
  for (const p of ['email', 'token', 'password', 'code']) {
    if (u.searchParams.has(p)) u.searchParams.set(p, '[Redacted]')
  }
  return u.pathname + u.search
}
// span.setAttribute('http.target', sanitizeUrl(req.url))
```

**Métriques.** Le corps d'une métrique est numérique, donc peu de PII *dans la valeur*. Le danger est dans les **labels** : un `email=` ou `userId=` en label est à la fois une **bombe de cardinalité** (module 02) **et** une fuite de PII. La règle « pas d'ID en label » sert les deux causes.

### 2.6 Minimisation active : la redaction Pino (`redact`)

Le premier rempart est de **ne pas produire** la PII. Le second, quand un objet risque d'en contenir, est la **redaction au niveau du logger**, au plus près de la source. Pino intègre l'option `redact` (moteur `fast-redact`, syntaxe vérifiée sur la doc Pino) :

```ts
import pino from 'pino'

const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-forwarded-for"]',   // notation crochets pour les clés à tiret
      'organizer.email',
      'organizer.ip',
      'family.children',                    // on ne loggue jamais l'objet enfants
      'family.children[*].firstName',       // wildcard tableau
      '*.password',                          // wildcard : password à n'importe quel niveau
    ],
    censor: '[Redacted]',                    // string par défaut ; peut être une fonction
    // remove: true,                         // alternative : supprimer la clé au lieu de la masquer
  },
})
```

Trois choses à retenir sur `redact` :
- `paths` accepte les **wildcards** `*` (ex. `a[*].b`, `*.secret`) et la **notation crochets** `path["with-hyphen"]` pour les clés spéciales ;
- `censor` remplace la valeur (string ou **fonction** de transformation) ; `remove: true` **supprime** carrément la clé de la sortie ;
- `redact` agit sur les **chemins connus** de l'objet loggué. Il ne scanne **pas** le texte libre d'un `msg`. Une PII interpolée dans un message (`` `échec pour ${email}` ``) **passe à travers** — d'où la règle : pas de PII dans les messages, on loggue des **codes** (`errorCode: 'CARD_DECLINED'`) et des **identifiants pseudonymes**, jamais des valeurs personnelles en clair.

Techniques de minimisation complémentaires : **masquage** partiel (`a***t@gmail.com`, carte `****-****-****-1111`), **troncature d'IP** (`82.66.14.203` → `82.66.14.0`), **hash avec sel secret** pour corréler sans stocker la valeur (un hash *sans* sel est cassable par dictionnaire — inutile sur un e-mail).

### 2.7 Rétention, purge et droit à l'effacement appliqués à l'obs

La **limitation de la conservation** (§2.2) impose de **borner la durée de vie** des données d'obs. Repères — **usuels, pas prescriptifs, à arbitrer avec le DPO** :

| Donnée d'obs | Durée usuellement pratiquée | Base fréquente |
|---|---|---|
| logs applicatifs (debug) | 30–90 jours | intérêt légitime |
| traces distribuées | quelques jours à ~30 j | intérêt légitime |
| métriques **agrégées** (anonymes) | mois à années | hors PII (agrégat) |
| journaux de sécurité / connexion | plus long, cadré par la loi | obligation légale |

Sur les **journaux de sécurité**, la CNIL recommande, dans sa **recommandation relative aux mesures de journalisation**, une conservation des événements sur une **fenêtre glissante de 6 mois à 1 an** (sauf obligation légale, contentieux ou besoin d'analyse post-incident spécifique). Retiens l'**ordre de grandeur** et le principe « fenêtre glissante » ; la durée exacte d'un journal donné se fixe avec le DPO.

La purge se **configure et s'automatise** dans les backends : rétention Prometheus (`--storage.tsdb.retention.time`), rétention Loki (`limits_config.retention_period` + compactor), ILM Elasticsearch (phases hot/warm/cold/**delete**). Une rétention courte est aussi une **mesure de sécurité** : ce qui n'existe plus ne fuit pas.

**Droit à l'effacement (Art. 17) appliqué à l'obs.** Un utilisateur demande l'effacement. Ses logs/traces sont souvent **append-only**, dupliqués, indexés — les supprimer chirurgicalement est coûteux, parfois impossible. Trois stratégies, par ordre de préférence :

1. **Pseudonymiser dès l'ingestion** pour qu'aucune PII directe ne soit stockée : il n'y a alors « rien à effacer » côté obs (l'identité vit dans la base métier, effaçable là).
2. **Tokenisation avec vault** : la donnée en clair vit dans un coffre séparé ; « effacer » = supprimer le mapping token→valeur, rendant les logs définitivement non ré-identifiables (bascule de pseudonyme vers anonyme *de fait*).
3. **Rétention courte** : la purge automatique fait office d'effacement *de facto* à échéance.

Point de nuance important : l'effacement **peut entrer en conflit** avec une **obligation légale de conservation** (certains journaux de sécurité). Ce conflit se tranche **avec le DPO**, pas par l'ingénieur.

### 2.8 Vendors d'observabilité : DPA et localisation des données

Envoyer tes logs/traces chez un SaaS (Grafana Cloud, Datadog, Sentry, Elastic Cloud…), c'est confier des données personnelles à un **sous-traitant** (Art. 28). Ce que l'ingénieur doit exiger/vérifier — la contractualisation est du ressort juridique, mais tu es souvent celui qui *repère* le manque :

- **DPA signé** (Data Processing Agreement / accord de sous-traitance) encadrant le traitement ;
- **localisation des données** : région **UE** de préférence (un transfert hors UE, ex. USA, nécessite un mécanisme dédié — SCCs, cadre de transfert — à valider juridiquement, contexte post-Schrems II) ;
- **chiffrement** au repos et en transit ; liste des **sous-traitants ultérieurs** ;
- engagement de **notification de violation** (< 72 h) dans le DPA ;
- procédure de **suppression** des données en fin de contrat.

Réflexe TribuZen : avant de brancher un nouvel outil d'obs SaaS, poser la question « **où atterrissent nos données de familles, et sous quel DPA ?** » — et router la réponse vers le DPO.

---

## 3. Worked examples

### Exemple 1 — Assainir le logger TribuZen de bout en bout

On part du log fuité du §1. Objectif : une config Pino qui minimise à la source, plus les helpers de masquage, réutilisables dans toute l'API.

```ts
// src/observability/logger.ts
import pino from 'pino'
import { createHash } from 'node:crypto'

// Hash AVEC sel secret : corréler les événements d'une même personne
// sans jamais stocker l'e-mail. Sans sel, un e-mail est cassable par dictionnaire.
export function pseudo(value: string): string {
  return 'usr_' + createHash('sha256')
    .update(process.env.PII_SALT + value)   // sel secret, hors du code, hors des logs
    .digest('hex')
    .slice(0, 8)
}

// Masquage d'IP : on garde le réseau (utile pour le debug géo/abus), on jette l'hôte.
export function maskIp(ip: string): string {
  const p = ip.split('.')
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0` : '::'
}

export const logger = pino({
  // Privacy by default : on masque les chemins connus à risque, dès la conception.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-forwarded-for"]',
      'req.body.password',
      'organizer.email',
      'family.children',              // jamais l'objet enfants en clair
      'family.children[*].firstName',
      'family.children[*].birthDate',
      '*.email',                      // wildcard : email à n'importe quel niveau
    ],
    censor: '[Redacted]',
  },
})

// Utilisation : on ne loggue QUE des identifiants pseudonymes + des agrégats.
export function logEventCreated(organizerEmail: string, familyId: string, childrenCount: number, ip: string) {
  logger.info(
    {
      organizerId: pseudo(organizerEmail),  // pseudonyme corrélable, non réversible sans le sel
      familyId,                              // id métier, pas un nom de famille
      childrenCount,                         // un COMPTE, pas la liste des enfants
      ip: maskIp(ip),                        // IP tronquée
    },
    'event created',
  )
}
```

Ce que ça donne : plus aucun e-mail, prénom d'enfant, date de naissance, header d'auth ni IP complète dans la sortie. On conserve exactement ce qu'il faut pour diagnostiquer (un organisateur pseudonyme, une famille, un nombre d'enfants, un réseau).

> Rappel §2.6 : `redact` ne nettoie **pas** le texte d'un `msg`. Écrire `logger.info(\`échec pour ${organizerEmail}\`)` **fuiterait** malgré la config. La discipline « pas de PII dans le message, on loggue des codes » reste obligatoire.

### Exemple 2 — Décider : effacement d'un utilisateur qui part

Camille supprime son compte TribuZen et demande l'effacement (Art. 17). Raisonnement d'ingénieur, à porter au DPO :

```text
Donnée d'obs                     Personnelle ? Stratégie appliquée
-------------------------------- ------------- ----------------------------------------------
Logs applicatifs (organizerId    OUI (pseudo)  Pseudonymisés dès l'ingestion (Exemple 1) →
= hash de l'e-mail)                            rien à supprimer côté logs ; l'e-mail vit dans
                                               la base métier, effacé LÀ. Le hash devient
                                               non-corrélable une fois le sel/compte parti.
Traces (spans) < 15 j            OUI (pseudo)  Rétention courte → purge de facto à échéance.
Métriques http_requests_total    NON           Agrégat anonyme (pas de label identifiant) →
                                               hors périmètre effacement.
Journal de sécurité (connexions) OUI           CONFLIT possible avec obligation légale de
                                               conservation → décision DPO, PAS l'ingénieur.
```

La bonne architecture (pseudonymisation à l'ingestion + rétention courte + agrégats anonymes) fait que l'essentiel du droit à l'effacement est **déjà satisfait par construction**. Le seul point ouvert — les journaux de sécurité — est précisément celui qui **remonte au DPO**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « C'est pseudonymisé, donc c'est hors RGPD »

Faux, et c'est l'erreur la plus fréquente. La **pseudonymisation** (hash avec sel, `usr_5a1b`) réduit le risque mais la donnée **reste personnelle** : rétention, sécurité et droits des personnes continuent de s'appliquer. Seule l'**anonymisation irréversible** sort du RGPD — et elle est difficile à atteindre pour des logs/traces.

### PIÈGE #2 — Croire que `redact` nettoie tout

Pino `redact` agit sur des **chemins d'objet connus**, pas sur le **texte libre** du `msg`. `logger.info(\`user ${email} failed\`)` fuite malgré une config `redact` parfaite. Corollaire : on ne met **jamais** de PII dans le message ; on loggue un code + un id pseudonyme.

### PIÈGE #3 — Oublier les query params dans les URLs de spans

`http.url` / `http.target` capturent souvent `?email=...&token=...`. Un span « propre » côté champs métier peut fuiter dans l'URL. Sanitiser l'URL **avant** de la poser en attribut (voir §2.5).

### PIÈGE #4 — Un ID ou un e-mail en label de métrique

`labelNames: ['email']` cumule deux fautes : **explosion de cardinalité** (module 02) **et** fuite de PII persistée dans la TSDB, souvent à longue rétention. Les identifiants vont dans un **log** (borné, redacté), jamais dans un **label**.

### PIÈGE #5 — Hash sans sel = fausse protection

`sha256(email)` sans sel est **réversible par dictionnaire** : l'espace des e-mails est fini, un attaquant pré-calcule les hashs. Un hash de PII n'est une pseudonymisation sérieuse qu'avec un **sel secret** stocké hors du code et hors des logs.

### PIÈGE #6 — Trancher le droit seul

« On garde les logs 2 ans, ça peut servir » ou « on efface tout, il l'a demandé » : ces décisions engagent la conformité et peuvent entrer en conflit avec une obligation légale. La durée exacte, la base légale, la réponse à une demande d'effacement se **valident avec le DPO**. L'ingénieur **implémente et documente**.

---

## 5. Ancrage TribuZen

TribuZen manipule des données de familles **et de mineurs** : c'est un produit à enjeu RGPD élevé, et l'observabilité est un point de fuite classique. Ce module pose la couche « obs conforme ».

**Ce qui change concrètement dans le repo :**

```
tribuzen/
  src/
    observability/
      logger.ts        ← Pino redact + pseudo() + maskIp()  (Exemple 1)
      sanitize.ts      ← sanitizeUrl() pour les attributs de spans OTel
  ops/
    loki-config.yaml       ← retention_period borné + compactor
    prometheus.args        ← --storage.tsdb.retention.time
  docs/
    obs-data-mapping.md    ← quel outil, quelles données, quelle base légale,
                             quelle rétention, quel hébergement (→ revu avec le DPO)
    obs-vendors-dpa.md     ← DPA + localisation UE de chaque vendor d'obs
```

**Décisions TribuZen prises dans ce module :**
- aucune donnée d'enfant (prénom, date de naissance) ni e-mail en clair dans logs/traces — redaction à la source ;
- corrélation par `organizerId = pseudo(email)` (hash salé), jamais par e-mail ;
- métriques : labels à faible cardinalité, **zéro** identifiant personnel ;
- rétention bornée (logs courts, traces très courtes, métriques agrégées longues) ;
- un `obs-data-mapping.md` maintenu, revu périodiquement **avec le DPO**.

> Le fil rouge « instrumenter TribuZen » (modules 01-18) rencontre ici sa contrainte de conformité : on n'observe pas *moins*, on observe *proprement*. La minimisation améliore souvent aussi la cardinalité et le coût (module 18).

---

## 6. Points clés

1. En observabilité, l'**indirect** est le piège : IP, cookie/session id, JWT, `userId` réversible sont des données personnelles.
2. Trois principes de l'Art. 5 pilotent l'obs : **finalité**, **minimisation**, **limitation de conservation** ; + **privacy by design/default** (Art. 25).
3. **Pseudonymisation ≠ anonymisation** : la première reste soumise au RGPD, seule la seconde (irréversible) en sort. Logs/traces = au mieux pseudonymisés ; métriques agrégées = généralement anonymes.
4. Minimiser d'abord (ne pas produire la PII), puis **redacter** : Pino `redact` (paths avec wildcards `*` et notation crochets, `censor`, `remove`) — mais il **ne nettoie pas le `msg`**.
5. Sanitiser les **URLs de spans** et bannir tout **ID/e-mail en label** de métrique (cardinalité + PII).
6. **Rétention/purge** = limitation de conservation appliquée : Prometheus/Loki/ES ILM ; repère CNIL journalisation sécurité = fenêtre glissante ~6 mois–1 an (à cadrer DPO).
7. **Droit à l'effacement** en obs : pseudonymiser à l'ingestion, tokeniser avec vault, ou rétention courte — attention au conflit avec les obligations légales.
8. Vendor SaaS = **sous-traitant** : exiger DPA, localisation UE, chiffrement, notification < 72 h.
9. L'ingénieur **applique et documente** ; le **DPO tranche** les durées, bases légales et cas d'effacement.

---

## 7. Seeds Anki

```
Pourquoi un userId pseudonyme dans un log reste-t-il soumis au RGPD ?|La pseudonymisation est réversible (un mapping/clé/algo permet de remonter à la personne) : la donnée reste personnelle. Seule l'anonymisation IRRÉVERSIBLE sort du RGPD.
Différence pseudonymisation vs anonymisation ?|Pseudonymisation = identifiant remplacé mais ré-identification encore possible → reste donnée personnelle (RGPD s'applique). Anonymisation = lien à la personne rompu irréversiblement, non ré-identifiable même par recoupement → sort du RGPD.
Que ne nettoie PAS l'option redact de Pino ?|Le texte libre du message (msg). redact agit sur des chemins d'objet connus (paths). logger.info(`échec ${email}`) fuite malgré la config → ne jamais mettre de PII dans le message, logguer des codes + ids pseudonymes.
Quels 3 principes de l'Article 5 RGPD pilotent l'observabilité ?|Limitation des finalités (observer pour debug/sécu/perf, pas profiler), minimisation (données limitées au nécessaire), limitation de la conservation (durée bornée → rétention/purge). + Art. 25 privacy by design/default.
Pourquoi un hash de PII sans sel est-il une fausse protection ?|L'espace des valeurs (ex. e-mails) est fini : un attaquant pré-calcule un dictionnaire de hashs et inverse. Il faut un sel secret stocké hors du code et hors des logs pour une pseudonymisation sérieuse.
Comment gérer le droit à l'effacement (Art. 17) sur des logs append-only ?|Pseudonymiser dès l'ingestion (rien à effacer côté obs), tokeniser avec un vault (supprimer le mapping), ou rétention courte (purge de facto). Attention au conflit avec une obligation légale de conservation → décision DPO.
Où se cachent les PII dans les 3 piliers ?|Logs : msg, objets sérialisés, headers (authorization/cookie), stack traces. Traces : attributs de spans (http.url/http.target query params, db.statement, enduser.id). Métriques : dans les LABELS (email/userId) — jamais dans la valeur.
Que doit exiger un ingénieur d'un vendor SaaS d'observabilité (sous-traitant) ?|DPA signé (Art. 28), localisation des données en UE (transfert hors UE → SCCs/cadre dédié), chiffrement au repos et en transit, liste des sous-traitants, notification de violation < 72 h, procédure de suppression en fin de contrat.
Qui tranche la durée de conservation exacte d'un journal et une demande d'effacement ?|Le DPO / juriste, pas l'ingénieur. Le RGPD s'interprète au cas par cas (base légale, obligation légale de conservation, contentieux). L'ingénieur implémente et documente la mesure technique.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-19-rgpd-observabilite/README.md`. Auditer les logs et traces de TribuZen pour repérer les PII, mettre en place la redaction Pino + la sanitisation d'URL de spans, et poser une politique de rétention — grille d'audit, coach en session, variante J+30.

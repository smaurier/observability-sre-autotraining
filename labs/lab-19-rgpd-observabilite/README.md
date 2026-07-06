# Lab 19 — RGPD et observabilité : auditer les PII, redacter, borner la rétention

<!-- FLAG-REVIEW: RGPD/JURIDIQUE — à valider par Sylvain -->
<!-- Ce lab entraîne un RÉFLEXE technique (repérer + minimiser + borner les PII d'obs).
     Il ne remplace pas l'avis d'un DPO sur les durées, bases légales et cas d'effacement. -->

> **Outcome :** à la fin, tu sais **auditer** les logs et traces d'une API pour repérer les PII, les **minimiser/redacter à la source** avec Pino `redact` + sanitisation d'URL de spans, et **poser une politique de rétention** défendable.
> **Vrai outil :** Node + Pino (option `redact` réelle) ; config de rétention Loki/Prometheus réelle (docker-compose du cours). Zéro harnais auto-correcteur.
> **Feedback :** le coach valide en session — l'audit et les arbitrages RGPD se discutent, ils ne se « testent » pas au vert/rouge.

> **Avertissement.** Cet exercice produit des **mesures techniques** et un **tableau d'arbitrage**. Les décisions finales (durée exacte, base légale, réponse à un effacement) reviennent à un **DPO**. Le livrable inclut donc une colonne « à valider DPO ».

---

## Énoncé

Tu reprends l'API TribuZen (familles, enfants, événements, RSVP). Un log réel de production sort ainsi aujourd'hui — c'est ta **matière première d'audit** :

```json
{
  "level": "info",
  "msg": "rsvp confirmed for camille.durand@gmail.com",
  "req": {
    "method": "POST",
    "url": "/api/events/42/rsvp?email=camille.durand@gmail.com&token=eyJra",
    "headers": {
      "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi",
      "cookie": "sid=8f3ac91b2e",
      "x-forwarded-for": "82.66.14.203"
    }
  },
  "family": { "name": "Famille Durand", "children": [{ "firstName": "Léo", "birthDate": "2016-04-12" }] },
  "organizer": { "email": "camille.durand@gmail.com", "phone": "+33 6 12 34 56 78", "ip": "82.66.14.203" },
  "eventId": 42
}
```

Et un attribut de span OTel émis sur la même requête :

```ts
span.setAttribute('http.target', '/api/events/42/rsvp?email=camille.durand@gmail.com&token=eyJra')
span.setAttribute('enduser.id', 'camille.durand@gmail.com')
```

Ta mission : produire trois livrables — **(A) une grille d'audit PII**, **(B) une config Pino + sanitisation d'URL** qui assainit ce log et ce span, **(C) un tableau de rétention/effacement** à faire valider par le DPO.

**Pas de gap-fill** : tu écris la config Pino complète et le tableau à partir du starter minimal.

### Starter minimal

Crée un projet Node (`npm init -y && npm i pino`) et un fichier `audit.ts` :

```ts
// audit.ts — starter
import pino from 'pino'

// Le log fuité ci-dessus, tel qu'un middleware le produirait
const leaked = {
  req: {
    method: 'POST',
    url: '/api/events/42/rsvp?email=camille.durand@gmail.com&token=eyJra',
    headers: {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi',
      cookie: 'sid=8f3ac91b2e',
      'x-forwarded-for': '82.66.14.203',
    },
  },
  family: { name: 'Famille Durand', children: [{ firstName: 'Léo', birthDate: '2016-04-12' }] },
  organizer: { email: 'camille.durand@gmail.com', phone: '+33 6 12 34 56 78', ip: '82.66.14.203' },
  eventId: 42,
}

// À toi : config redact, helpers maskIp/pseudo, sanitizeUrl, et un log PROPRE.
const logger = pino({ /* redact: { paths: [...], censor: '[Redacted]' } */ })

logger.info(leaked, 'rsvp confirmed')  // ← doit ressortir SANS PII, et SANS PII dans le msg
```

Lance avec `npx tsx audit.ts` (ou compile) et **lis la sortie JSON** : tant qu'un e-mail, un prénom d'enfant, un JWT ou une IP complète apparaît, ce n'est pas fini.

---

## Étapes (en friction)

1. **Grille d'audit (A)** — liste chaque champ du log et du span, et classe : *donnée personnelle ?* (directe / indirecte / non), *concerne un mineur ?*, *nécessaire au debug ?*, *action* (supprimer / redacter / masquer / pseudonymiser / garder).
2. **Repère les 3 fuites non évidentes** — au-delà de l'e-mail : l'URL avec query params, le JWT dans `authorization`, l'IP dans `x-forwarded-for`, et le **`msg`** lui-même (`rsvp confirmed for camille.durand@...`).
3. **Écris la config `redact`** — chemins connus, avec au moins un **wildcard tableau** (`family.children[*].firstName`) et un **wildcard de niveau** (`*.email`). Choisis `censor` vs `remove: true` selon le champ.
4. **Corrige le `msg`** — `redact` ne nettoie pas le message. Remplace le message interpolé par un message **sans PII** + un id pseudonyme.
5. **Écris `maskIp` et `pseudo`** — IP tronquée au /24, `pseudo(email)` = hash **salé** (sel via `process.env.PII_SALT`).
6. **Écris `sanitizeUrl`** — retire `email`/`token` des query params avant de poser `http.target` ; remplace `enduser.id` (e-mail) par le pseudonyme.
7. **Vérifie à l'œil** — relance, confirme qu'aucune des PII de la grille ne subsiste dans la sortie.
8. **Tableau rétention/effacement (C)** — pour logs / traces / métriques / journaux de sécurité : durée usuelle proposée, base légale supposée, stratégie d'effacement, et **colonne « à valider DPO »**.

---

## Corrigé complet commenté

```ts
// audit.ts — corrigé
import pino from 'pino'
import { createHash } from 'node:crypto'

// ── Helpers de minimisation ────────────────────────────────────────────
// Hash AVEC sel secret : corréler sans stocker la valeur. Sans sel, un e-mail
// est cassable par dictionnaire (espace fini) → fausse protection (PIÈGE #5 du module).
function pseudo(value: string): string {
  return 'usr_' + createHash('sha256')
    .update((process.env.PII_SALT ?? 'dev-only-salt') + value)
    .digest('hex')
    .slice(0, 8)
}

// IP : on garde le réseau /24 (utile debug abus/géo), on jette l'hôte identifiant.
function maskIp(ip: string): string {
  const p = ip.split('.')
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.0` : '::'
}

// URL de span : retirer les query params sensibles AVANT de poser l'attribut.
function sanitizeUrl(raw: string): string {
  const u = new URL(raw, 'http://local')
  for (const key of ['email', 'token', 'password', 'code']) {
    if (u.searchParams.has(key)) u.searchParams.set(key, '[Redacted]')
  }
  return u.pathname + u.search
}

// ── Logger : privacy by default (redaction dès la conception) ───────────
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',           // JWT
      'req.headers.cookie',                  // session
      'req.headers["x-forwarded-for"]',      // IP source — notation crochets (clé à tirets)
      'req.url',                             // URL brute (query params) — on logguera l'URL nettoyée à part
      'organizer.phone',
      'organizer.ip',
      'family.name',                         // nom de famille = donnée personnelle
      'family.children',                     // objet enfants : on ne le loggue jamais en clair
      'family.children[*].firstName',        // wildcard tableau (défense en profondeur)
      'family.children[*].birthDate',
      '*.email',                             // wildcard de niveau : email où qu'il soit
    ],
    censor: '[Redacted]',                    // string ; pourrait être une fonction de masquage
    // remove: true → utiliser si on veut SUPPRIMER la clé plutôt que la masquer
  },
})

// Objet reçu (le log fuité du starter). En vrai il vient d'un middleware.
const leaked = {
  req: {
    method: 'POST',
    url: '/api/events/42/rsvp?email=camille.durand@gmail.com&token=eyJra',
    headers: {
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIi',
      cookie: 'sid=8f3ac91b2e',
      'x-forwarded-for': '82.66.14.203',
    },
  },
  family: { name: 'Famille Durand', children: [{ firstName: 'Léo', birthDate: '2016-04-12' }] },
  organizer: { email: 'camille.durand@gmail.com', phone: '+33 6 12 34 56 78', ip: '82.66.14.203' },
  eventId: 42,
}

// On construit un enregistrement MINIMISÉ à la main, en plus de la redaction :
// on ne garde que ce qui sert au debug, en pseudonyme/agrégat.
logger.info(
  {
    organizerId: pseudo(leaked.organizer.email),      // pseudonyme corrélable, non réversible sans le sel
    familyId: 'fam_9f2c',                             // id métier, pas le nom de famille
    childrenCount: leaked.family.children.length,     // un COMPTE, pas la liste des enfants
    eventId: leaked.eventId,                          // id métier, non personnel
    ip: maskIp(leaked.organizer.ip),                  // IP tronquée
    reqUrl: sanitizeUrl(leaked.req.url),              // URL sans email/token
  },
  // ⚠️ msg SANS PII : redact ne nettoie PAS le message (PIÈGE #2 du module).
  'rsvp confirmed',
)

// ── Côté span OTel : même discipline ────────────────────────────────────
// span.setAttribute('http.target', sanitizeUrl('/api/events/42/rsvp?email=...&token=...'))
// span.setAttribute('enduser.id', pseudo('camille.durand@gmail.com'))  // jamais l'e-mail brut
```

**Sortie attendue (aucune PII) :**

```json
{ "level":30, "organizerId":"usr_1a2b3c4d", "familyId":"fam_9f2c", "childrenCount":1,
  "eventId":42, "ip":"82.66.14.0", "reqUrl":"/api/events/42/rsvp?email=[Redacted]&token=[Redacted]",
  "msg":"rsvp confirmed" }
```

**Pourquoi ce corrigé est correct :**
- Deux couches : **minimisation** (on ne construit qu'un objet propre) **+ redaction** (`redact` en filet de sécurité si un champ à risque passe quand même).
- Le `msg` est **fixe et sans PII** — la faute la plus courante, invisible pour `redact`.
- `pseudo()` est **salé** ; `maskIp` garde le réseau sans l'hôte ; `sanitizeUrl` neutralise les query params dans les logs **et** les spans.
- Les données d'**enfant** (prénom, date de naissance) sont couvertes en profondeur (chemin explicite + wildcard) — donnée de mineur, tolérance zéro.

**Grille d'audit (A) — extrait attendu :**

| Champ | Personnelle ? | Mineur ? | Utile debug ? | Action |
|---|---|---|---|---|
| `organizer.email` | directe | non | non | pseudonymiser (`pseudo()`) |
| `msg` (email interpolé) | directe | non | non | réécrire message fixe |
| `authorization` (JWT) | indirecte | non | non | redacter |
| `req.url` (query params) | directe | non | partiellement | `sanitizeUrl` |
| `family.children[].firstName` | directe | **oui** | non | supprimer/redacter |
| `family.children[].birthDate` | directe | **oui** | non | supprimer/redacter |
| `organizer.ip` | indirecte | non | oui (réseau) | masquer /24 |
| `eventId`, `childrenCount` | non | non | oui | garder |

**Tableau rétention/effacement (C) — extrait attendu :**

| Donnée d'obs | Durée proposée | Base légale supposée | Effacement | À valider DPO |
|---|---|---|---|---|
| logs applicatifs | 30–90 j | intérêt légitime | pseudonymisé à l'ingestion + purge | durée exacte |
| traces | ≤ 15 j | intérêt légitime | rétention courte (purge de facto) | oui |
| métriques agrégées | mois–années | hors PII (agrégat) | s/o (anonyme) | confirmer absence de label PII |
| journaux sécurité/connexion | ~6 mois–1 an (repère CNIL journalisation) | obligation légale | **conflit possible avec effacement** | **oui — arbitrage DPO** |

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — de mémoire, en 30 min, sans rouvrir le corrigé ni le module :**

1. Le log contient en plus un champ `payment: { cardNumber: "4111111111111111" }` et un `error.stack` qui **sérialise l'objet `user` complet** (e-mail + téléphone) dans le texte de la stack trace.
2. Traite les deux : `cardNumber` → **masquage** `****-****-****-1111` (garde les 4 derniers pour le support), et la **stack trace** — explique pourquoi `redact` ne suffit pas ici et quelle mesure prendre (ne pas sérialiser l'objet fautif, ou passer un `serializer` Pino qui nettoie l'erreur).
3. Ajoute un **argument de rétention Prometheus** et une **clé de rétention Loki** cohérents avec ton tableau (C).

**Critère de réussite :** aucune PII (carte, e-mail, téléphone) ne subsiste, y compris dans le texte de la stack trace ; tu sais expliquer à l'oral pourquoi la stack trace est un angle mort de `redact`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce lab devient la couche « obs conforme » :

```
tribuzen/
  src/observability/
    logger.ts     ← config redact + pseudo() + maskIp()
    sanitize.ts   ← sanitizeUrl() (logs + attributs de spans)
  ops/
    loki-config.yaml      ← retention_period borné
    prometheus.args       ← --storage.tsdb.retention.time
  docs/
    obs-data-mapping.md   ← grille (A) + tableau (C), revus AVEC le DPO
    obs-vendors-dpa.md    ← DPA + localisation UE des vendors d'obs
```

**Différences par rapport au lab :**
- la redaction se branche dans le **middleware de logging** réel (module 01), pas sur un objet en dur ;
- la sanitisation d'URL s'applique aux **spans OTel** réels (modules 04-05) via un span processor ;
- le tableau (C) est un **document vivant**, relu périodiquement et **co-signé par le DPO** — il ne se fige pas dans un commit.

**Commit cible :**
```
feat(observability): redaction PII (Pino redact + URL sanitize) + politique de rétention
```

> Rappel : ce lab bâtit la **mesure technique**. La conformité juridique (durées, bases légales, effacement) se **valide avec un DPO** — ce que matérialise la colonne « à valider DPO » du tableau (C).

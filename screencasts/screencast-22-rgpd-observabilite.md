# Screencast 27 — RGPD & Observabilite : Conformite, PII et Retention

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/27-rgpd-observabilite.md`
- **Lab associe** : `labs/lab-28-rgpd-observabilite/`
- **Prerequis** : Screencast 02 (Logging Structure), Screencast 07 (Distributed Tracing)

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] Module 27 ouvert en reference

## Script

### [00:00-03:30] Introduction — Pourquoi le RGPD concerne les devs

> On est developpeurs, pas juristes. Pourtant, le RGPD nous concerne directement. Chaque fois qu'on ecrit un logger.info, chaque fois qu'on ajoute un attribut a un span OpenTelemetry, chaque fois qu'on configure un dashboard Grafana, on manipule potentiellement des donnees personnelles. Et les amendes ne sont pas theoriques.

**Action** : Afficher les exemples d'amendes CNIL.

> Google : 150 millions d'euros pour cookies publicitaires sans consentement. Meta : 1.2 milliard d'euros pour transferts de donnees UE vers USA. Amazon : 746 millions pour ciblage publicitaire. Et la CNIL a mis en demeure des entreprises pour l'utilisation de Google Analytics, car les donnees etaient transferees aux USA.

> Alors, qu'est-ce qu'une donnee personnelle dans l'observabilite ? C'est plus large que ce qu'on croit.

**Action** : Afficher le tableau des PII evidentes vs techniques.

> Les donnees evidemment personnelles : nom, email, telephone. Mais aussi les donnees techniquement personnelles : l'adresse IP (arret Breyer, CJUE 2016), le User-Agent (qui peut creer un fingerprint unique), le cookie de session, le request ID lie a un user, les coordonnees GPS, le token JWT qui contient souvent un email dans le claim sub.

### [03:30-08:00] PII dans les logs — Ou se cachent-elles ?

> Regardons concretement ou les PII se glissent dans notre observabilite.

**Action** : Montrer des exemples de logs avec PII.

```typescript
// MAUVAIS — PII partout
logger.info('User login', {
  email: 'alice@example.com',        // PII evidente
  ip: '192.168.1.42',                // PII technique
  userAgent: 'Mozilla/5.0 (iPhone...', // Potentiellement identifiant
});

logger.error('Payment failed', {
  userId: 'usr_abc123',
  cardNumber: '4111111111111111',     // Donnee sensible !
  error: 'Card declined for user alice.dupont@gmail.com',
  // ^ PII dans le message d'erreur !
});
```

> Le deuxieme exemple est vicieux : l'email est dans le message d'erreur, pas dans un champ structure. Un scrubber qui ne scanne que les champs nommes le ratera. Et le numero de carte bancaire — c'est une donnee sensible, pas juste personnelle.

**Action** : Montrer la version corrigee.

```typescript
// BON — PII minimisees
logger.info('User login', {
  userId: hash('alice@example.com'),  // Hash irreversible
  ip: anonymizeIp('192.168.1.42'),    // 192.168.1.0
  country: 'FR',                      // Donnee agregee
});

logger.error('Payment failed', {
  userId: 'usr_abc123',
  cardLast4: '1111',                  // Suffisant pour le debug
  errorCode: 'CARD_DECLINED',        // Code sans PII
});
```

> Le hash irreversible permet de correler les evenements d'un meme utilisateur sans connaitre son email. L'IP est anonymisee en masquant le dernier octet. Le message d'erreur utilise un code, pas un message en clair contenant des PII.

**Action** : Montrer les PII dans les URLs et les headers.

```
GET /api/users?email=alice@example.com&token=eyJhbG...
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZUBleGFtcGxlLmNvbSJ9...
```

> Les URLs avec des query params sont souvent loggees tel quel par les reverse proxies et les spans OpenTelemetry. Le header Authorization contient un JWT qui decode en clair contient l'email de l'utilisateur. Il faut scrubber ces donnees AVANT qu'elles entrent dans le pipeline d'observabilite.

### [08:00-12:00] Anonymisation — Hashing, masking, tokenisation

> Trois techniques principales pour anonymiser les PII.

**Action** : Implementer les trois techniques.

```typescript
import { createHash } from 'crypto';

// 1. Hachage — irreversible, deterministe
function hashPII(value: string, salt: string): string {
  return createHash('sha256')
    .update(salt + value)
    .digest('hex')
    .substring(0, 16);
}
// 'alice@example.com' -> 'a3f2b8c1d4e5f6a7'
// Le meme email donne toujours le meme hash
// -> On peut correler les logs sans connaitre l'email

// 2. Masquage — garder une partie pour le debug
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}
// 'alice@example.com' -> 'a***@example.com'

// 3. Tokenisation — reversible via vault
const tokenizer = new PIITokenizer();
const token = tokenizer.tokenize('alice@example.com');
// -> 'tok_a3f2b8c1d4e5f6a7'
// Le DPO peut detokenizer pour repondre aux demandes d'acces
```

> Le hachage est la methode la plus courante pour les logs. Attention : sans sel, le hachage est reversible par attaque dictionnaire (il y a un nombre fini d'emails courants). Toujours utiliser un sel secret. La tokenisation est utile quand on a besoin de revenir a la donnee originale (droit d'acces) ou de la supprimer (droit a l'effacement — on supprime le mapping dans le vault).

**Action** : Montrer Pino redact.

```typescript
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'user.email',
      'user.phone',
      'payment.cardNumber',
    ],
    censor: '[REDACTED]',
  },
});
```

> Pino supporte la redaction native via le champ redact. C'est la premiere ligne de defense. Mais ca ne couvre que les champs nommes. Pour les PII dans les messages de texte libre, il faut un scrubber base sur des regex.

### [12:00-16:00] Retention — Combien de temps garder les donnees ?

> L'Article 5 du RGPD impose la limitation de la conservation. Les donnees ne doivent pas etre conservees plus longtemps que necessaire. Chaque type de donnee doit avoir une duree documentee.

**Action** : Afficher le tableau de retention.

```
Type de donnee              | Duree recommandee | Base legale
Logs applicatifs            | 30-90 jours       | Interet legitime (debug)
Logs de securite            | 1 an              | Obligation legale (LCEN)
Traces distribuees          | 7-30 jours        | Interet legitime
Metriques agregees          | 2-5 ans           | Interet legitime (tendances)
Donnees de consentement     | 3 ans apres retrait| Preuve de consentement
```

> Les metriques agregees (sans PII) peuvent etre conservees longtemps — elles sont utiles pour le capacity planning. Mais les logs applicatifs contenant des PII doivent etre supprimes rapidement. Les logs de securite sont une exception : la loi LCEN impose 1 an de conservation.

**Action** : Montrer la configuration de retention dans Elasticsearch et Loki.

```json
// Elasticsearch ILM
{
  "policy": {
    "phases": {
      "hot":    { "min_age": "0ms", "actions": { "rollover": { "max_age": "1d" } } },
      "warm":   { "min_age": "7d",  "actions": { "shrink": {}, "forcemerge": {} } },
      "cold":   { "min_age": "30d", "actions": { "freeze": {} } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}
```

```yaml
# Loki
limits_config:
  retention_period: 744h  # 31 jours

overrides:
  tenant-production:
    retention_period: 2160h  # 90 jours
  tenant-security:
    retention_period: 8760h  # 1 an
```

> Elasticsearch ILM (Index Lifecycle Management) deplace automatiquement les donnees du hot (SSD, rapide) vers le warm (HDD), puis cold (frozen), puis delete. Loki supporte la retention par tenant, ce qui permet d'avoir des durees differentes pour les logs applicatifs et les logs de securite.

### [16:00-20:00] Consentement et Matomo

> Le consentement est obligatoire pour l'analytics client-side, sauf exemption CNIL.

**Action** : Montrer la configuration Matomo conforme.

```javascript
// Matomo SANS cookies — exempte de consentement
var _paq = window._paq = window._paq || [];
_paq.push(['disableCookies']);
_paq.push(['setIpAnonymizationMode', 2]);  // 2 derniers octets
_paq.push(['setDoNotTrack', true]);
_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);
```

> Matomo auto-heberge et configure sans cookies, avec IP anonymisee, heberge dans l'UE, sans croisement de donnees — c'est l'un des rares outils a beneficier de l'exemption CNIL. Ca signifie pas de bandeau de consentement pour la mesure d'audience. Google Analytics n'est pas eligible a cette exemption.

**Action** : Montrer le CMP (bandeau de consentement).

> Pour les analytics avec cookies ou le marketing, le consentement est obligatoire. La CNIL impose que le refus soit aussi simple que l'acceptation : pas de dark patterns. L'utilisateur doit pouvoir changer d'avis facilement. Le consentement doit etre renouvele tous les 13 mois maximum.

```typescript
// 3 categories de consentement
interface ConsentState {
  analytics: boolean;       // Mesure d'audience avec cookies
  personalization: boolean; // Contenus personnalises
  marketing: boolean;       // Publicite ciblee
  timestamp: number;
  expiresAt: number;        // Max 13 mois
}
```

### [20:00-23:00] DPIA et breach notification

> La DPIA (Data Protection Impact Assessment) est obligatoire quand un traitement presente un risque eleve. Pour un systeme d'observabilite, c'est souvent le cas si on collecte des logs utilisateurs a grande echelle.

**Action** : Montrer la structure d'une DPIA.

> La DPIA comprend quatre sections. Un : description du traitement (quoi, pourquoi, qui, combien de temps). Deux : evaluation de la necessite et proportionnalite. Trois : evaluation des risques (matrice probabilite x impact). Quatre : mesures d'attenuation.

**Action** : Montrer la matrice de risques.

```
Risque                          | Probabilite | Impact   | Niveau
PII dans les stack traces       | Elevee      | Modere   | ELEVE
IP non anonymisee dans Loki     | Elevee      | Eleve    | CRITIQUE
JWT dans les span attributes    | Moyenne     | Eleve    | ELEVE
Transfert USA (Grafana Cloud)   | Moyenne     | Critique | CRITIQUE
```

> En cas de violation de donnees, l'Article 33 impose une notification a la CNIL dans les 72 heures. Pas 72 heures ouvrables — 72 heures calendaires. Meme si l'evaluation n'est pas terminee, il faut notifier avec une mention "evaluation en cours". La notification complementaire viendra ensuite.

### [23:00-25:00] Checklist pratique et transition vers le lab

> Resumons avec une checklist concrete pour votre systeme d'observabilite.

**Action** : Afficher la checklist.

> Architecture : les PII sont scrubbees AVANT d'entrer dans le pipeline. Le scrubbing est fait au plus pres de la source. Un fallback existe si le scrubbing echoue (drop le log plutot que de laisser passer une PII).

> Stockage : chiffrement au repos et en transit. Retention configuree et automatisee. Backups egalement chiffres.

> Acces : RBAC en place. Les dashboards sensibles sont proteges. Les acces aux logs bruts sont traces par un audit log.

> Droits des personnes : procedures documentees pour le droit d'acces, d'effacement et d'opposition. Delai de reponse de 30 jours respecte.

**Action** : Ouvrir le lab 28.

> Dans le lab 28, vous allez implementer un detecteur de PII avec des regex, un gestionnaire de retention, un manager de consentement, un evaluateur DPIA et un generateur de rapport de conformite. C'est concret et directement applicable dans vos projets. Lancez npx tsx exercise.ts et bon courage !

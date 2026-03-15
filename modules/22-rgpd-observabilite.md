# Module 27 — RGPD & Observabilite : Conformite, PII et Data Retention

## Objectifs pedagogiques

- Comprendre les principes fondamentaux du RGPD du point de vue developpeur
- Identifier et traiter les donnees personnelles (PII) dans les logs, traces et metriques
- Implementer des strategies d'anonymisation et de pseudonymisation des donnees d'observabilite
- Configurer des politiques de retention adaptees aux exigences legales
- Gerer le consentement utilisateur pour l'analytics (Matomo, CMP)
- Realiser une analyse d'impact (DPIA) pour un systeme d'observabilite
- Reagir a un incident de violation de donnees (breach notification)
- Appliquer une checklist de conformite RGPD operationnelle

---

## 1. RGPD : fondamentaux pour les developpeurs

### 1.1 Ce que le RGPD change pour les devs

Le Reglement General sur la Protection des Donnees (RGPD / GDPR) est un reglement europeen entre en vigueur le 25 mai 2018. Pour un developpeur, il impose des contraintes concretes sur la facon dont le code manipule les donnees personnelles.

**Donnee personnelle** : toute information se rapportant a une personne physique identifiee ou identifiable. Cela inclut des donnees evidentes (nom, email, telephone) mais aussi des donnees techniques souvent negligees :

```
Donnees evidemment personnelles :     Donnees techniquement personnelles :
- Nom, prenom                         - Adresse IP
- Email                               - Cookie identifiant
- Telephone                           - User-Agent (combinaison unique)
- Adresse postale                     - Device ID
- Numero de securite sociale          - Request ID lie a un user
- Photo de profil                     - Coordonnees GPS
                                      - Identifiant de session
                                      - Token JWT (contient souvent sub/email)
```

### 1.2 Les 6 bases legales

Avant de traiter une donnee personnelle, il faut avoir une **base legale**. Le RGPD en definit 6 (Article 6) :

| Base legale | Description | Exemple en observabilite |
|------------|-------------|-------------------------|
| **Consentement** | La personne a explicitement accepte | Analytics (Matomo avec cookies) |
| **Contrat** | Necessaire pour executer un contrat | Logs de commande e-commerce |
| **Obligation legale** | La loi l'impose | Conservation de logs de connexion (LCEN) |
| **Interet vital** | Proteger la vie de quelqu'un | Systeme d'alerte medicale |
| **Mission publique** | Exercice de l'autorite publique | Administration |
| **Interet legitime** | Interet de l'entreprise, balance avec les droits | Securite (logs de tentatives d'intrusion), monitoring applicatif |

Pour l'observabilite, les bases legales les plus courantes sont :
- **Interet legitime** : monitoring applicatif, detection d'anomalies, securite
- **Obligation legale** : conservation de logs d'acces (Article L34-1 du CPCE, 1 an pour les donnees de connexion)
- **Consentement** : analytics comportementale, tracking utilisateur

### 1.3 Droits des personnes concernees

Chaque utilisateur a des droits que votre code doit permettre d'exercer :

```
Droit                    | Impact sur l'observabilite
------------------------|------------------------------------------
Droit d'acces (Art 15)  | Extraire toutes les traces/logs d'un user
Droit de rectification  | Modifier les identifiants dans les logs
(Art 16)                |
Droit a l'effacement    | Supprimer/anonymiser les logs d'un user
(Art 17 - "droit a     | ATTENTION : conflit avec obligations legales
l'oubli")               | de conservation
Droit a la portabilite  | Exporter les donnees dans un format machine
(Art 20)                | readable (JSON, CSV)
Droit d'opposition      | Stopper la collecte pour un user specifique
(Art 21)                |
Droit a la limitation   | Garder les donnees mais ne plus les traiter
(Art 18)                |
```

### 1.4 Le role du DPO

Le Delegue a la Protection des Donnees (DPO) est **obligatoire** pour :
- Les autorites publiques
- Les entreprises dont l'activite principale implique un suivi regulier et systematique a grande echelle
- Les entreprises qui traitent des donnees sensibles a grande echelle

En pratique, le DPO est votre interlocuteur pour valider les choix techniques de conformite. Consultez-le **avant** de deployer un nouveau systeme d'observabilite.

### 1.5 Sanctions de la CNIL

La CNIL (Commission Nationale de l'Informatique et des Libertes) est l'autorite de controle francaise :

```
Amendes RGPD :
- Jusqu'a 20 millions d'euros
- Ou 4% du CA mondial annuel (le plus eleve)

Exemples reels :
- Google (2022) : 150M EUR — cookies publicitaires sans consentement
- Meta (2023) : 1.2Md EUR — transferts de donnees UE vers USA
- Criteo (2023) : 40M EUR — collecte sans consentement valide
- Amazon (2021) : 746M EUR — ciblage publicitaire sans consentement
- CNIL (2022) : mises en demeure pour Google Analytics (transfert USA)
```

---

## 2. PII dans les logs et traces

### 2.1 Ou se cachent les PII ?

Les donnees personnelles se glissent dans l'observabilite a des endroits souvent inattendus :

#### Dans les logs

```typescript
// MAUVAIS : PII partout dans les logs
logger.info('User login', {
  email: 'alice@example.com',         // PII evidente
  ip: '192.168.1.42',                 // PII technique
  userAgent: 'Mozilla/5.0 (iPhone...', // Potentiellement identifiant
});

logger.error('Payment failed', {
  userId: 'usr_abc123',               // Pseudonyme (mais lie a une personne)
  cardNumber: '4111111111111111',      // Donnee sensible !
  amount: 99.99,
  error: 'Card declined for user alice.dupont@gmail.com', // PII dans le message d'erreur !
});

// BON : PII minimisees
logger.info('User login', {
  userId: hash('alice@example.com'),   // Hash irreversible
  ip: anonymizeIp('192.168.1.42'),     // 192.168.1.0
  country: 'FR',                       // Donnee agregee suffisante
});

logger.error('Payment failed', {
  userId: 'usr_abc123',               // OK si pseudonyme non-reversible
  cardLast4: '1111',                   // Suffisant pour le debug
  amount: 99.99,
  errorCode: 'CARD_DECLINED',         // Code sans PII
});
```

#### Dans les stack traces

```typescript
// Une stack trace peut contenir des PII
// TypeError: Cannot read property 'name' of null
//     at processUser (/app/src/users.ts:42:15)
//     at /app/src/routes.ts:18:5
// Contexte: { user: { email: 'bob@test.com', ssn: '123-45-6789' } }

// Les frameworks serialisent souvent l'objet entier dans la stack trace
```

#### Dans les query params et URLs

```
GET /api/users?email=alice@example.com&token=eyJhbGciOi...
GET /api/search?q=docteur+dupont+paris  (recherche medicale = donnee sensible)
GET /api/reset-password?token=abc123&email=user@test.com
```

```typescript
// OTel span : l'URL complete est souvent enregistree
span.setAttribute('http.url', req.url);
// -> Contient potentiellement des PII dans les query params

// BON : nettoyer l'URL avant de l'enregistrer
function sanitizeUrl(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  const sensitiveParams = ['email', 'token', 'password', 'ssn', 'phone'];
  for (const param of sensitiveParams) {
    if (parsed.searchParams.has(param)) {
      parsed.searchParams.set(param, '[REDACTED]');
    }
  }
  return parsed.pathname + parsed.search;
}

span.setAttribute('http.url', sanitizeUrl(req.url));
```

#### Dans les headers HTTP

```typescript
// Headers potentiellement sensibles
const sensitiveHeaders = [
  'authorization',        // Token Bearer, Basic auth
  'cookie',              // Cookies de session
  'x-forwarded-for',    // IP d'origine
  'x-real-ip',          // IP reelle
  'set-cookie',         // Cookies envoyees au client
];

// Ne JAMAIS logger ces headers tel quel
logger.info('Request received', {
  method: req.method,
  path: req.path,
  // authorization: req.headers.authorization,  // NON !
  hasAuth: !!req.headers.authorization,          // OUI
});
```

### 2.2 Article 25 : Privacy by Design

L'Article 25 du RGPD impose la **protection des donnees des la conception** (privacy by design) et la **protection des donnees par defaut** (privacy by default).

Pour l'observabilite, cela signifie :

```
Privacy by Design :                     Privacy by Default :
- Prevoir l'anonymisation des            - Collecter le MINIMUM de PII
  le debut du projet                       par defaut
- Integrer le scrubbing dans le          - Les logs ne contiennent PAS
  pipeline d'observabilite                 de PII sauf besoin documente
- Documenter quelles PII sont            - Les dashboards n'affichent PAS
  collectees et pourquoi                   de PII sauf role specifique
- Prevoir les mecanismes de              - La retention est la plus courte
  suppression des le design                possible par defaut
```

---

## 3. Anonymisation des logs

### 3.1 Techniques d'anonymisation

#### Hachage (one-way)

```typescript
import { createHash } from 'crypto';

// Hachage simple : irreversible mais deterministe
// Le meme email donne toujours le meme hash
// -> Permet de correler les evenements sans connaitre l'email
function hashPII(value: string, salt: string): string {
  return createHash('sha256')
    .update(salt + value)
    .digest('hex')
    .substring(0, 16); // Tronquer pour eviter les collisions inverses
}

// Usage
const hashedEmail = hashPII('alice@example.com', process.env.PII_SALT!);
// -> "a3f2b8c1d4e5f6a7"

logger.info('User action', {
  userHash: hashedEmail,  // Correlable entre logs, mais irreversible
  action: 'purchase',
  amount: 99.99,
});
```

**Attention** : le hachage sans sel est reversible par attaque dictionnaire (il y a un nombre fini d'emails). Toujours utiliser un **sel secret**.

#### Tokenisation

```typescript
// Tokenisation : remplacer la PII par un token reversible (cote serveur)
// Le mapping token <-> PII est stocke dans un vault securise

class PIITokenizer {
  private vault: Map<string, string> = new Map();
  private reverseVault: Map<string, string> = new Map();

  tokenize(pii: string): string {
    if (this.reverseVault.has(pii)) {
      return this.reverseVault.get(pii)!;
    }
    const token = `tok_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    this.vault.set(token, pii);
    this.reverseVault.set(pii, token);
    return token;
  }

  // Detokenize : uniquement accessible aux personnes autorisees (DPO, support)
  detokenize(token: string): string | null {
    return this.vault.get(token) ?? null;
  }

  // Droit a l'effacement : supprimer le mapping
  forget(token: string): void {
    const pii = this.vault.get(token);
    if (pii) {
      this.reverseVault.delete(pii);
      this.vault.delete(token);
    }
  }
}
```

#### Masquage (masking)

```typescript
// Masquage : garder une partie de la donnee pour le debug
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  const maskedLocal = local[0] + '***' + (local.length > 1 ? local[local.length - 1] : '');
  return `${maskedLocal}@${domain}`;
}
// "alice.dupont@gmail.com" -> "a***t@gmail.com"

function maskIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;  // Masquer le dernier octet
  }
  return ip; // IPv6 : masquer les 64 derniers bits
}
// "192.168.1.42" -> "192.168.1.0"

function maskCard(card: string): string {
  return '****-****-****-' + card.slice(-4);
}
// "4111111111111111" -> "****-****-****-1111"
```

### 3.2 Pino transport pour la redaction PII

```typescript
import pino from 'pino';

// Patterns PII a detecter et redacter
const PII_PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  creditCard: /\b\d{13,19}\b/g,
  phone: /\b(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}\b/g,
  ssn: /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g, // NIR francais
  ip: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
};

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    let scrubbed = value;
    for (const [_name, pattern] of Object.entries(PII_PATTERNS)) {
      scrubbed = scrubbed.replace(pattern, '[REDACTED]');
    }
    return scrubbed;
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(scrubValue);
    }
    const scrubbed: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Champs sensibles connus : redacter la valeur entiere
      const sensitiveFields = ['email', 'password', 'token', 'authorization',
                               'cookie', 'ssn', 'creditCard', 'cardNumber',
                               'phone', 'address', 'ip', 'x-forwarded-for'];
      if (sensitiveFields.includes(key.toLowerCase())) {
        scrubbed[key] = '[REDACTED]';
      } else {
        scrubbed[key] = scrubValue(val);
      }
    }
    return scrubbed;
  }
  return value;
}

// Pino avec redaction integree
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-forwarded-for"]',
      'user.email',
      'user.phone',
      'user.ssn',
      'payment.cardNumber',
    ],
    censor: '[REDACTED]',
  },
});

// Pour une redaction plus complete (patterns dans les messages) :
// Utiliser un transport Pino personnalise
import { Transform } from 'stream';

const piiScrubTransport = new Transform({
  objectMode: true,
  transform(chunk, _encoding, callback) {
    try {
      const log = JSON.parse(chunk.toString());
      const scrubbed = scrubValue(log);
      callback(null, JSON.stringify(scrubbed) + '\n');
    } catch {
      callback(null, chunk);
    }
  },
});
```

### 3.3 OTel processor pour la sanitisation des spans

```typescript
import { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { Context } from '@opentelemetry/api';

class PIIScrubSpanProcessor implements SpanProcessor {
  private readonly sensitiveAttributes = [
    'http.url',
    'http.target',
    'db.statement',
    'messaging.body',
    'enduser.id',
    'http.request.header.authorization',
    'http.request.header.cookie',
  ];

  private readonly piiPatterns = {
    email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    creditCard: /\b\d{13,19}\b/g,
    jwt: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  };

  onStart(_span: ReadableSpan, _parentContext: Context): void {
    // Rien a faire au demarrage
  }

  onEnd(span: ReadableSpan): void {
    // Scrub les attributs sensibles
    const attributes = span.attributes;
    for (const key of Object.keys(attributes)) {
      const value = attributes[key];
      if (typeof value === 'string') {
        // Redacter les attributs sensibles connus
        if (this.sensitiveAttributes.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
          (attributes as Record<string, unknown>)[key] = this.scrubString(value);
        }
        // Scanner tous les attributs pour les patterns PII
        (attributes as Record<string, unknown>)[key] = this.scrubPatterns(value);
      }
    }
  }

  private scrubString(value: string): string {
    // Scrub les query params sensibles dans les URLs
    try {
      const url = new URL(value, 'http://localhost');
      const sensitiveParams = ['email', 'token', 'password', 'key', 'secret'];
      for (const param of sensitiveParams) {
        if (url.searchParams.has(param)) {
          url.searchParams.set(param, '[REDACTED]');
        }
      }
      return url.pathname + url.search;
    } catch {
      return this.scrubPatterns(value);
    }
  }

  private scrubPatterns(value: string): string {
    let result = value;
    for (const pattern of Object.values(this.piiPatterns)) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  forceFlush(): Promise<void> { return Promise.resolve(); }
  shutdown(): Promise<void> { return Promise.resolve(); }
}
```

---

## 4. Politiques de retention des donnees

### 4.1 Principes du RGPD sur la retention

L'Article 5(1)(e) du RGPD impose la **limitation de la conservation** : les donnees personnelles ne doivent pas etre conservees plus longtemps que necessaire pour les finalites du traitement.

```
Type de donnee              | Duree recommandee      | Base legale
---------------------------|----------------------|-----------------------------
Logs applicatifs           | 30-90 jours          | Interet legitime (debug)
Logs de securite           | 1 an                 | Obligation legale (LCEN)
Logs d'acces web           | 6-12 mois            | Obligation legale
Metriques agreges          | 2-5 ans              | Interet legitime (tendances)
Traces distribuees         | 7-30 jours           | Interet legitime (debug)
Logs de transaction        | 10 ans               | Obligation legale (fiscal)
Donnees de consentement    | 3 ans apres retrait  | Preuve de consentement
Logs d'incidents securite  | 5 ans                | Obligation legale / ANSSI
```

### 4.2 Elasticsearch ILM (Index Lifecycle Management)

```json
// PUT _ilm/policy/observability-logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "1d",
            "max_primary_shard_size": "50gb"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 },
          "allocate": {
            "require": { "data": "warm" }
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": { "priority": 0 },
          "freeze": {},
          "allocate": {
            "require": { "data": "cold" }
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}

// PUT _index_template/observability-logs
// {
//   "index_patterns": ["logs-*"],
//   "template": {
//     "settings": {
//       "index.lifecycle.name": "observability-logs-policy",
//       "index.lifecycle.rollover_alias": "logs"
//     }
//   }
// }
```

**Lifecycle** :
- **Hot** (0-7 jours) : donnees recentes, disques SSD, replicas multiples
- **Warm** (7-30 jours) : donnees consultees occasionnellement, compression, disques HDD
- **Cold** (30-90 jours) : donnees rarement consultees, frozen, stockage minimal
- **Delete** (90+ jours) : suppression automatique et irreversible

### 4.3 Loki retention

```yaml
# loki-config.yaml
limits_config:
  retention_period: 744h         # 31 jours par defaut

compactor:
  retention_enabled: true
  retention_delete_delay: 2h     # Delai avant suppression effective
  retention_delete_worker_count: 150

# Retention par tenant (multi-tenant)
overrides:
  tenant-production:
    retention_period: 2160h      # 90 jours pour la production
  tenant-development:
    retention_period: 168h       # 7 jours pour le dev
  tenant-security:
    retention_period: 8760h      # 1 an pour les logs de securite
```

### 4.4 Prometheus retention

```yaml
# prometheus.yml ou arguments de demarrage
# --storage.tsdb.retention.time=30d    # Retention par duree
# --storage.tsdb.retention.size=50GB   # Retention par taille

global:
  scrape_interval: 15s

# Pour les metriques a long terme : utiliser Thanos ou Cortex
# Prometheus local : retention courte (15-30 jours)
# Thanos/Cortex : retention longue (1-5 ans) avec downsampling

# Thanos compactor : downsampling automatique
# - Raw : 0-14 jours (resolution 15s)
# - 5m downsampled : 14 jours - 6 mois
# - 1h downsampled : 6 mois - 5 ans
```

### 4.5 Suppression automatisee et legal hold

```typescript
// Service de suppression automatisee des donnees
interface RetentionPolicy {
  dataType: string;
  maxAge: number; // jours
  legalHold: boolean;
}

class DataRetentionManager {
  private policies: RetentionPolicy[] = [
    { dataType: 'application-logs', maxAge: 90, legalHold: false },
    { dataType: 'security-logs', maxAge: 365, legalHold: false },
    { dataType: 'traces', maxAge: 30, legalHold: false },
    { dataType: 'metrics-raw', maxAge: 30, legalHold: false },
    { dataType: 'metrics-aggregated', maxAge: 730, legalHold: false },
  ];

  async enforceRetention(): Promise<void> {
    for (const policy of this.policies) {
      if (policy.legalHold) {
        console.log(`[SKIP] ${policy.dataType} is under legal hold`);
        continue;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.maxAge);

      console.log(`[DELETE] ${policy.dataType} older than ${cutoffDate.toISOString()}`);
      await this.deleteData(policy.dataType, cutoffDate);
    }
  }

  // Legal hold : empêche la suppression pendant une investigation
  setLegalHold(dataType: string, hold: boolean): void {
    const policy = this.policies.find(p => p.dataType === dataType);
    if (policy) {
      policy.legalHold = hold;
      console.log(`[LEGAL HOLD] ${dataType} set to ${hold}`);
    }
  }

  private async deleteData(_dataType: string, _before: Date): Promise<void> {
    // Implementation specifique par backend (ES, Loki, Prometheus, etc.)
  }
}
```

---

## 5. Consentement et analytics

### 5.1 Matomo vs Google Analytics : conformite RGPD

```
                     Matomo (self-hosted)          Google Analytics
Hebergement          Vos serveurs / UE             Serveurs Google (USA)
Donnees transferees  Aucun transfert hors UE       Transfert USA (probleme Schrems II)
Propriete donnees    Vous                          Google (sous-traitant mais aussi
                                                   responsable conjoint)
Consentement requis  Optionnel* (config specifique) Obligatoire (CNIL, 2022)
Exemption cookie     Possible (CNIL)               Non
IP anonymisation     Configurable                  Partielle (GA4)
Retention donnees    Vous decidez                  14 mois max (GA4)
```

*Matomo peut etre exempte de consentement si configure specifiquement (pas de cookies, pas de fingerprinting, pas de donnees croisees).

### 5.2 Configuration Matomo conforme CNIL

```javascript
// Configuration Matomo SANS cookies (exempte de consentement)
var _paq = window._paq = window._paq || [];

// Desactiver les cookies
_paq.push(['disableCookies']);

// Anonymiser l'IP (2 derniers octets)
_paq.push(['setIpAnonymizationMode', 2]);

// Respecter Do Not Track
_paq.push(['setDoNotTrack', true]);

// Limiter la retention a 13 mois (recommandation CNIL)
// Configuration cote serveur Matomo

// Desactiver le user ID
// Ne PAS utiliser _paq.push(['setUserId', userId]);

_paq.push(['trackPageView']);
_paq.push(['enableLinkTracking']);

(function() {
  var u = "https://matomo.mondomaine.fr/";
  _paq.push(['setTrackerUrl', u + 'matomo.php']);
  _paq.push(['setSiteId', '1']);
  var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
  g.async = true; g.src = u + 'matomo.js'; s.parentNode.insertBefore(g, s);
})();
```

### 5.3 CMP (Consent Management Platform)

```typescript
// Implementation d'un bandeau de consentement conforme CNIL

interface ConsentState {
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  timestamp: number;
  version: string;
}

class ConsentManager {
  private readonly COOKIE_NAME = 'consent-v1';
  private readonly COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 an (max CNIL : 13 mois)

  getConsent(): ConsentState | null {
    const cookie = this.getCookie(this.COOKIE_NAME);
    if (!cookie) return null;
    try {
      return JSON.parse(cookie);
    } catch {
      return null;
    }
  }

  setConsent(consent: Omit<ConsentState, 'timestamp' | 'version'>): void {
    const state: ConsentState = {
      ...consent,
      timestamp: Date.now(),
      version: '1.0',
    };

    this.setCookie(this.COOKIE_NAME, JSON.stringify(state), this.COOKIE_MAX_AGE);

    // Logger le consentement (preuve)
    this.logConsent(state);

    // Activer/desactiver les services selon le consentement
    if (state.analytics) {
      this.enableAnalytics();
    } else {
      this.disableAnalytics();
    }
  }

  // Exigences CNIL pour le bandeau :
  // 1. Le refus doit etre aussi simple que l'acceptation
  // 2. Les finalites doivent etre listees clairement
  // 3. Le choix doit etre conserve (pas redemander a chaque visite)
  // 4. L'utilisateur doit pouvoir changer d'avis facilement
  // 5. Le consentement doit etre renouvele tous les 13 mois max

  private logConsent(state: ConsentState): void {
    // Stocker la preuve de consentement
    // (conservee 3 ans apres le retrait - recommandation CNIL)
    console.log('[CMP] Consent recorded', {
      analytics: state.analytics,
      personalization: state.personalization,
      marketing: state.marketing,
      timestamp: new Date(state.timestamp).toISOString(),
    });
  }

  private enableAnalytics(): void { /* Charger Matomo */ }
  private disableAnalytics(): void { /* Supprimer cookies analytics */ }
  private getCookie(_name: string): string | null { return null; }
  private setCookie(_name: string, _value: string, _maxAge: number): void {}
}
```

### 5.4 Exemptions CNIL

La CNIL accorde une exemption de consentement pour certains traceurs si :

```
Conditions d'exemption (audience measurement) :
1. Finalite strictement limitee a la mesure d'audience
2. Donnees non recoupees avec d'autres traitements
3. Donnees non transmises a des tiers
4. Cookie limite a 13 mois
5. Donnees conservees max 25 mois
6. IP anonymisee
7. Informer l'utilisateur et lui permettre de s'opposer
8. L'outil est heberge dans l'UE (ou adequation)

Outils exemptables (liste CNIL) :
- Matomo (auto-heberge, configure specifiquement)
- AT Internet (Piano Analytics)
- Abla Analytics
- Beyable Analytics
```

### 5.5 Server-side tracking

Le server-side tracking est une approche plus conforme car il ne depose aucun traceur cote client :

```typescript
// Server-side tracking : pas de cookie, pas de JavaScript client
// L'analytics est collectee cote serveur

import { MatomoTracker } from '@jonkoops/matomo-tracker';

const tracker = new MatomoTracker({
  urlBase: 'https://matomo.mondomaine.fr',
  siteId: 1,
});

// Middleware Express
app.use((req, res, next) => {
  // Tracker la visite sans cookie
  tracker.track({
    url: `https://mondomaine.fr${req.path}`,
    // Pas d'IP reelle (anonymisee cote serveur)
    cip: anonymizeIp(req.ip),
    // Pas de user-agent complet
    ua: simplifyUserAgent(req.headers['user-agent']),
    // Action type
    action_name: req.path,
  });
  next();
});

function anonymizeIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.0.0`;
  return '0.0.0.0';
}

function simplifyUserAgent(ua?: string): string {
  if (!ua) return 'Unknown';
  // Garder uniquement le navigateur et l'OS, pas le modele de device
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return 'Other';
}
```

---

## 6. DPIA (Data Protection Impact Assessment)

### 6.1 Quand une DPIA est obligatoire

L'Article 35 du RGPD impose une analyse d'impact quand un traitement est "susceptible d'engendrer un risque eleve pour les droits et libertes des personnes". La CNIL a publie une liste de criteres :

```
Une DPIA est obligatoire si au moins 2 criteres sont remplis :

1. Evaluation/scoring (profiling)          7. Donnees sensibles
2. Decision automatisee avec effet juridique  8. Large echelle
3. Surveillance systematique               9. Croisement de donnees
4. Donnees sensibles ou hautement          10. Personnes vulnerables
   personnelles
5. Traitement a grande echelle
6. Croisement ou combinaison de donnees

Exemples necessitant une DPIA :
- Systeme d'observabilite qui collecte des logs utilisateurs a grande echelle
- Analytics comportementale avec profiling
- Systeme de detection de fraude base sur les comportements
- Monitoring de performance qui inclut des donnees utilisateur
```

### 6.2 Structure d'une DPIA

```
1. Description du traitement
   - Finalite : monitoring applicatif et detection d'anomalies
   - Donnees collectees : logs applicatifs, traces, metriques
   - Personnes concernees : utilisateurs de l'application, employes
   - Duree de conservation : 90 jours (logs), 30 jours (traces)
   - Sous-traitants : Grafana Cloud (UE), AWS (region eu-west-1)

2. Evaluation de la necessite et de la proportionnalite
   - Base legale : interet legitime (debug, performance, securite)
   - Minimisation : seules les donnees necessaires sont collectees
   - Limitation de la conservation : retention automatique
   - Droit des personnes : mecanisme de suppression sur demande

3. Evaluation des risques
   - Risque de fuite de PII dans les logs (probabilite: elevee, impact: modere)
   - Risque de profilage non desire (probabilite: faible, impact: eleve)
   - Risque de transfert hors UE (probabilite: moyenne, impact: eleve)

4. Mesures d'attenuation
   - Scrubbing automatique des PII en entree du pipeline
   - Chiffrement au repos et en transit
   - RBAC sur les dashboards (pas d'acces PII sans justification)
   - Hebergement exclusif dans l'UE
   - Audit trail des acces aux logs
```

### 6.3 Matrice de risques

```
                Impact
                Faible    Modere    Eleve     Critique
Probabilite
Elevee          Moyen     Eleve     Critique  Critique
Moyenne         Faible    Moyen     Eleve     Critique
Faible          Faible    Faible    Moyen     Eleve
Tres faible     Faible    Faible    Faible    Moyen

Risques identifies :
1. PII dans les stack traces      -> Probabilite: Elevee,  Impact: Modere   = ELEVE
2. IP non anonymisee dans Loki    -> Probabilite: Elevee,  Impact: Eleve    = CRITIQUE
3. JWT dans les span attributes   -> Probabilite: Moyenne, Impact: Eleve    = ELEVE
4. Transfert USA (Grafana Cloud)  -> Probabilite: Moyenne, Impact: Critique = CRITIQUE
5. Acces non autorise aux logs    -> Probabilite: Faible,  Impact: Critique = ELEVE
```

---

## 7. Incident response et breach notification

### 7.1 Article 33 : notification a l'autorite de controle

En cas de violation de donnees personnelles, le responsable du traitement doit notifier la CNIL **dans les 72 heures** apres en avoir eu connaissance.

```
Timeline de notification :

T+0h    Detection de la violation
        |
        v
T+0-2h  Qualification de la violation
        - S'agit-il de donnees personnelles ?
        - Combien de personnes sont concernees ?
        - Quels types de donnees sont concernes ?
        |
        v
T+2-24h Evaluation du risque
        - Risque pour les droits et libertes ?
        - Donnees chiffrees ou non ?
        - Donnees accessibles ou non ?
        |
        v
T+24-72h Notification a la CNIL (teleservice.cnil.fr)
         - Meme si l'evaluation n'est pas terminee
         - Notification complementaire possible
         |
         v
Si risque Notification aux personnes concernees (Art 34)
eleve     - Communication claire et simple
          - Description de la violation
          - Coordonnees du DPO
          - Consequences probables
          - Mesures prises
```

### 7.2 Ce qui constitue une violation (breach)

```
Trois types de violations :

1. Violation de confidentialite
   - Acces non autorise aux logs contenant des PII
   - Exposition d'un dashboard Grafana avec des donnees personnelles
   - Fuite d'un bucket S3 contenant des backups de logs

2. Violation d'integrite
   - Modification non autorisee des logs d'audit
   - Corruption des donnees de consentement

3. Violation de disponibilite
   - Perte irreversible des logs necessaires a l'exercice des droits
   - Ransomware chiffrant les donnees d'observabilite
```

### 7.3 Documentation obligatoire

```typescript
// Registre des violations (Article 33.5)
interface BreachRecord {
  id: string;
  detectedAt: Date;
  notifiedAt?: Date;
  description: string;
  categoriesOfData: string[];
  approximateNumberOfDataSubjects: number;
  approximateNumberOfRecords: number;
  consequencesDescription: string;
  measuresTaken: string[];
  dpoContacted: boolean;
  cnilNotified: boolean;
  dataSubjectsNotified: boolean;
  status: 'investigating' | 'contained' | 'resolved' | 'closed';
}

// Exemple
const breach: BreachRecord = {
  id: 'BREACH-2024-001',
  detectedAt: new Date('2024-03-15T14:30:00Z'),
  notifiedAt: new Date('2024-03-16T10:00:00Z'),
  description: 'Un dashboard Grafana expose publiquement contenait des logs avec des emails utilisateurs non anonymises',
  categoriesOfData: ['email', 'adresse IP', 'historique de navigation'],
  approximateNumberOfDataSubjects: 15000,
  approximateNumberOfRecords: 450000,
  consequencesDescription: 'Risque de phishing cible et atteinte a la vie privee',
  measuresTaken: [
    'Dashboard ferme immediatement',
    'Audit de tous les dashboards publics',
    'Mise en place de scrubbing PII dans le pipeline Loki',
    'Formation equipe DevOps sur la conformite RGPD',
  ],
  dpoContacted: true,
  cnilNotified: true,
  dataSubjectsNotified: true,
  status: 'resolved',
};
```

### 7.4 Playbook de reponse a incident RGPD

```
Phase 1 — Detection et qualification (0-2h)
  [ ] Identifier la nature de la violation
  [ ] Determiner si des donnees personnelles sont concernees
  [ ] Estimer le nombre de personnes impactees
  [ ] Contacter le DPO immediatement
  [ ] Creer un ticket d'incident avec les details

Phase 2 — Confinement (2-24h)
  [ ] Couper l'acces a la source de la fuite
  [ ] Preserver les preuves (logs, captures, timelines)
  [ ] Evaluer l'etendue de la fuite (quelles donnees, quelle periode)
  [ ] Documenter toutes les actions prises avec timestamp

Phase 3 — Notification (24-72h)
  [ ] Preparer le formulaire de notification CNIL
  [ ] Notifier la CNIL via teleservice.cnil.fr
  [ ] Si risque eleve : notifier les personnes concernees
  [ ] Informer la direction et le juridique

Phase 4 — Remediation (72h+)
  [ ] Corriger la vulnerabilite racine
  [ ] Implementer les mesures preventives
  [ ] Mettre a jour la DPIA si necessaire
  [ ] Completer la notification CNIL avec les mesures prises
  [ ] Redigier un postmortem interne
```

---

## 8. Checklist de conformite pratique

### 8.1 Data mapping

```
Pour chaque systeme d'observabilite, documenter :

Systeme          | Donnees collectees        | Base legale      | Retention | Hebergement
----------------|--------------------------|-----------------|-----------|------------
Loki            | Logs applicatifs          | Interet legitime | 90 jours  | EU (AWS)
Prometheus      | Metriques (pas de PII)    | Interet legitime | 30 jours  | EU (AWS)
Tempo/Jaeger    | Traces (spans)            | Interet legitime | 15 jours  | EU (AWS)
Sentry          | Erreurs + stack traces    | Interet legitime | 90 jours  | EU (Sentry)
Matomo          | Analytics (server-side)   | Exemption CNIL   | 25 mois   | EU (self)
Elasticsearch   | Logs de securite          | Obligation legale | 1 an     | EU (self)
```

### 8.2 Privacy by design checklist

```
Architecture :
[ ] Les PII sont scrubbes AVANT d'entrer dans le pipeline d'observabilite
[ ] Le scrubbing est fait au plus pres de la source (pas en post-traitement)
[ ] Les patterns de PII sont maintenus et mis a jour regulierement
[ ] Un mecanisme de fallback existe si le scrubbing echoue (drop le log)

Stockage :
[ ] Chiffrement au repos (encryption at rest) active sur tous les backends
[ ] Chiffrement en transit (TLS) entre tous les composants
[ ] Les backups sont egalement chiffres
[ ] La retention est configuree et automatisee

Acces :
[ ] RBAC en place (pas d'acces admin par defaut)
[ ] Les dashboards sensibles sont proteges par authentification
[ ] Les acces aux logs bruts sont traces (audit log)
[ ] Le principe du moindre privilege est applique

Droits des personnes :
[ ] Procedure documentee pour le droit d'acces
[ ] Procedure documentee pour le droit a l'effacement
[ ] Procedure documentee pour le droit d'opposition
[ ] Les demandes sont traitees dans les 30 jours (Art 12)
```

### 8.3 Vendor assessment

Avant d'adopter un outil d'observabilite SaaS, verifier :

```
Critere                           | Exigence
---------------------------------|------------------------------------------
Localisation des donnees          | UE obligatoire (ou adequation)
Clauses contractuelles            | DPA (Data Processing Agreement) signe
Sous-traitants ulterieurs         | Liste publique, notification de changement
Chiffrement                       | Au repos ET en transit
Certification                     | SOC 2 Type II minimum, ISO 27001 ideal
Suppression des donnees           | Procedure documentee post-resiliation
Transferts hors UE                | SCCs (Standard Contractual Clauses) si necessaire
Breach notification               | Engagement < 72h dans le DPA
Audit                             | Droit d'audit pour le responsable de traitement
```

### 8.4 EU Data Residency

Depuis l'arret Schrems II (2020), les transferts de donnees personnelles vers les USA sont problematiques. Le nouveau EU-US Data Privacy Framework (2023) retablit un mecanisme de transfert, mais il est conteste.

```
Options conformes :
1. Hebergement exclusif dans l'UE (recommande)
   - Grafana Cloud : region EU disponible
   - Elastic Cloud : region EU disponible
   - Datadog : region EU-1 (Francfort)
   - Sentry : region EU (Francfort, depuis 2023)

2. Standard Contractual Clauses (SCCs)
   - Contrat additionnel avec le sous-traitant
   - Evaluation de l'impact du transfert (TIA)
   - Mesures supplementaires si necessaire (chiffrement, pseudonymisation)

3. EU-US Data Privacy Framework (2023)
   - Le sous-traitant doit etre certifie
   - Mecanisme de recours pour les citoyens EU
   - Stabilite juridique incertaine (Schrems III possible)
```

### 8.5 SCCs (Standard Contractual Clauses)

Les SCCs sont des clauses contractuelles types adoptees par la Commission europeenne. Elles permettent le transfert de donnees vers un pays tiers en garantissant contractuellement un niveau de protection adequat.

```
Modules des SCCs (2021) :
- Module 1 : Responsable de traitement -> Responsable de traitement
- Module 2 : Responsable de traitement -> Sous-traitant (le plus courant)
- Module 3 : Sous-traitant -> Sous-traitant
- Module 4 : Sous-traitant -> Responsable de traitement

Pour un outil d'observabilite SaaS :
- Vous (responsable) -> Outil SaaS (sous-traitant) = Module 2
- Vous devez realiser un TIA (Transfer Impact Assessment)
- Vous devez documenter les mesures supplementaires si necessaire
```

---

## Resume

| Domaine | Action cle | Priorite |
|---------|-----------|----------|
| PII dans les logs | Scrubbing automatique (Pino redact, OTel processor) | Critique |
| Retention | ILM Elasticsearch, Loki retention, Prometheus retention | Haute |
| Consentement | CMP conforme CNIL, Matomo sans cookies pour l'exemption | Haute |
| Hebergement | EU-only pour tous les backends d'observabilite | Haute |
| DPIA | Obligatoire si scoring/grande echelle/surveillance | Moyenne |
| Breach response | Playbook pret, equipe formee, DPO identifie | Haute |
| Droits des personnes | Procedures documentees, delai 30 jours | Moyenne |
| Vendor assessment | DPA signe, SCCs si transfert hors UE | Haute |

---

## Exercices pratiques

Rendez-vous au [Lab 28 — RGPD & Observabilite](/labs/lab-28-rgpd-observabilite/README) pour mettre en pratique ces concepts.

## Quiz

Testez vos connaissances avec le [Quiz 27 — RGPD & Observabilite](/quizzes/quiz-27-rgpd).

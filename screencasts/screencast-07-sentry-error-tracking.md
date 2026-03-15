# Screencast 22 — Sentry Error Tracking

## Informations
- **Duree estimee** : 12-15 min
- **Module** : `modules/22-sentry-error-tracking.md`
- **Lab associe** : `labs/lab-23-sentry-error-tracking/`
- **Prerequis** : Screencast 11 (Alerting Strategies)

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] Compte Sentry (sentry.io) ou Sentry self-hosted
- [ ] Un projet Node.js/Express de demo

## Script

### [00:00-02:00] Introduction — Error Tracking vs Logging

> On a vu les logs structures, Prometheus, Grafana, les alertes. Mais il manque un outil essentiel : le error tracking. Les logs disent "une erreur s'est produite". Un error tracker comme Sentry dit "cette erreur affecte 2 400 utilisateurs, elle a commence il y a 3 heures apres le deploy v2.3.1, voici la stack trace complete avec le code source, et voici le parcours de l'utilisateur avant le crash".

**Action** : Ouvrir le dashboard Sentry.

> Sentry n'est pas un remplacement des logs — c'est un complement. Les logs sont pour le debugging detaille. Sentry est pour la detection, le triage et la resolution des erreurs en production.

### [02:00-05:00] Setup et premiere capture

**Action** : Installer et configurer le SDK Sentry.

```typescript
// src/instrument.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.APP_VERSION || '1.0.0',
  tracesSampleRate: 0.2,      // 20% des transactions pour le perf monitoring
  profilesSampleRate: 0.1,    // 10% des profils
});
```

> Le DSN (Data Source Name) est l'URL qui identifie votre projet Sentry. C'est comme une connection string de base de donnees. L'environment distingue dev/staging/production. La release permet de correler les erreurs avec les deployments.

**Action** : Capturer une exception manuellement.

```typescript
try {
  await processPayment(order);
} catch (error) {
  Sentry.captureException(error, {
    tags: { module: 'payments', orderId: order.id },
    extra: { amount: order.total, currency: 'EUR' },
  });
  throw error;
}
```

> Les tags sont indexes et recherchables — utilisez-les pour les dimensions importantes (module, environnement, region). Extra est pour le contexte additionnel non indexe.

### [05:00-08:00] Breadcrumbs et contexte

**Action** : Montrer les breadcrumbs dans l'interface Sentry.

> Les breadcrumbs sont le parcours de l'utilisateur avant l'erreur. Sentry les capture automatiquement pour les requetes HTTP, les logs console, les clics DOM (en frontend). Mais on peut en ajouter manuellement.

```typescript
Sentry.addBreadcrumb({
  category: 'payment',
  message: `Processing payment for order ${orderId}`,
  level: 'info',
  data: { amount, provider: 'stripe' },
});
```

> Imaginez un detaillant qui vous dit "le client a d'abord visite la page produit, puis ajoute au panier, puis clique sur payer, et ca a plante a la confirmation". C'est exactement ce que font les breadcrumbs. C'est inestimable pour le debugging.

### [08:00-11:00] Fingerprinting et groupement

> Par defaut, Sentry groupe les erreurs par stack trace. Mais parfois, deux stack traces differentes representent le meme probleme. Ou une stack trace generique regroupe des problemes differents.

**Action** : Montrer le fingerprinting personnalise.

```typescript
Sentry.captureException(error, {
  fingerprint: ['payment-failure', paymentProvider],
});
```

> Avec ce fingerprint, toutes les erreurs de paiement Stripe sont groupees ensemble, meme si les stack traces different. Et les erreurs PayPal sont dans un groupe separe. Le fingerprinting est l'art de grouper les erreurs de maniere pertinente pour votre equipe.

### [11:00-13:00] PII scrubbing et GDPR

> Attention critique : Sentry capture beaucoup de contexte. Si un utilisateur soumet un formulaire avec son email, son mot de passe ou son numero de carte, ca peut se retrouver dans Sentry.

**Action** : Montrer le beforeSend.

```typescript
Sentry.init({
  dsn: '...',
  beforeSend(event) {
    // Supprimer les donnees sensibles des headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }
    // Anonymiser les IPs
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },
});
```

> Le callback beforeSend est votre dernier rempart avant que les donnees quittent votre serveur. Utilisez-le pour scrubber les PII (Personally Identifiable Information). C'est non negociable en Europe avec le RGPD.

### [13:00-15:00] Recapitulatif

> Sentry est l'outil de error tracking qui transforme les erreurs en production d'evenements terrifiants en problemes gerable et traçables. Le DSN connecte votre app. Les breadcrumbs donnent le contexte. Le fingerprinting organise les erreurs. Et le PII scrubbing protege vos utilisateurs.

> La puissance de Sentry, c'est la correlation : cette erreur est apparue apres ce deploy, affecte ces navigateurs, sur ces pages, avec cette frequence. C'est des heures de debugging economisees.

> Faites le Lab 23 pour implementer un systeme de error tracking complet !

## Points d'attention pour l'enregistrement
- Montrer le dashboard Sentry reel si possible — les screenshots ne rendent pas la meme chose
- Le moment "aha" est quand on voit les breadcrumbs : le parcours complet de l'utilisateur avant le crash
- Le PII scrubbing est critique — insister sur les obligations RGPD
- Ne pas oublier de mentionner que Sentry s'integre avec OpenTelemetry

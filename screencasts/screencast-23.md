# Screencast 23 — Observabilité Frontend

> **Durée** : ~15 min
> **Module** : [Module 23 — Observabilité Frontend](/modules/23-observabilite-frontend)

## Informations

- **Format** : screencast (enregistrement d'écran + voix)
- **Outils** : VS Code, terminal, navigateur Chrome (DevTools), Sentry

## Script

### [00:00] Introduction

> Bienvenue dans ce screencast consacré à l'observabilité frontend. On parle souvent de monitoring côté serveur, mais la réalité c'est que l'expérience utilisateur se joue dans le navigateur. Aujourd'hui on va mesurer les Core Web Vitals avec la librairie web-vitals, envoyer ces métriques à un collecteur RUM, et explorer le regroupement d'erreurs dans Sentry.

### [01:30] Rappel des Core Web Vitals

> Avant de coder, rappelons les trois métriques clés de Google : LCP (Largest Contentful Paint) mesure le temps de chargement perçu, INP (Interaction to Next Paint) mesure la réactivité, et CLS (Cumulative Layout Shift) mesure la stabilité visuelle. Ces métriques impactent directement le SEO et l'expérience utilisateur.

### [03:00] Installation de web-vitals

> On va installer la librairie web-vitals dans notre projet. C'est la librairie officielle de Google, elle pèse moins de 2 Ko gzippée et fournit des callbacks pour chaque métrique.

**Action** : exécuter `npm install web-vitals` puis ouvrir le fichier `src/vitals.ts`

### [04:30] Implémentation de la collecte CWV

> On importe les fonctions onLCP, onINP et onCLS depuis web-vitals. Chaque fonction prend un callback qui reçoit un objet MetricPayload contenant le nom, la valeur, le rating (good, needs-improvement, poor), et le delta.

**Action** : créer le fichier `src/vitals.ts` avec les imports et un callback qui envoie les métriques via `navigator.sendBeacon`

### [06:30] Mise en place du collecteur RUM

> On va créer un endpoint côté serveur qui reçoit les métriques du navigateur. Ce collecteur RUM (Real User Monitoring) va stocker les données dans un format compatible Prometheus pour les visualiser dans Grafana.

**Action** : créer un endpoint Express `/api/rum` qui parse le JSON du beacon et expose les métriques en format Prometheus (histogram)

### [08:30] Visualisation des métriques dans le navigateur

> Naviguons sur notre application et observons les métriques qui remontent. Dans l'onglet Network de DevTools, on voit les appels sendBeacon vers notre endpoint. Chaque navigation de page produit un LCP et un CLS, et chaque interaction un INP.

**Action** : naviguer sur l'application, ouvrir DevTools > Network, filtrer sur `/api/rum`, montrer les payloads envoyés

### [10:00] Configuration de Sentry pour le error tracking frontend

> Maintenant, on va intégrer Sentry pour capturer les erreurs JavaScript et les regrouper intelligemment. Sentry utilise le fingerprinting : les erreurs avec la même stack trace sont regroupées dans un même "issue".

**Action** : installer `@sentry/browser`, initialiser Sentry avec le DSN, configurer les options `tracesSampleRate` et `replaysSessionSampleRate`

### [12:00] Regroupement d'erreurs et contexte

> On déclenche volontairement quelques erreurs pour voir le regroupement dans le dashboard Sentry. Remarquez que Sentry associe automatiquement le breadcrumb de navigation, les Core Web Vitals, et le contexte utilisateur à chaque erreur.

**Action** : déclencher une erreur `TypeError`, une erreur réseau `fetch`, et un `unhandledrejection` — montrer le regroupement dans Sentry

### [13:30] Alertes sur dégradation des CWV

> Pour boucler la boucle, on configure une alerte Sentry qui se déclenche quand le p75 du LCP dépasse 2.5 secondes. Cela permet de détecter une régression de performance avant que Google ne la sanctionne.

**Action** : dans Sentry > Alerts, créer une alerte sur la métrique `measurements.lcp` avec le seuil `p75 > 2500ms`

### [14:30] Récapitulatif

> En résumé : web-vitals nous donne les métriques de performance réelle, sendBeacon les envoie de manière non-bloquante à notre collecteur RUM, et Sentry regroupe intelligemment les erreurs frontend avec tout le contexte nécessaire. L'observabilité frontend n'est pas un luxe, c'est une nécessité pour garantir une bonne expérience utilisateur. Dans le prochain screencast, on instrumentera un framework SSR complet avec OpenTelemetry.

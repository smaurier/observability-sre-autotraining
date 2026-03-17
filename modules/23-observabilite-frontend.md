# Module 23 — Observabilité frontend

> **Durée estimée** : 3h00
> **Difficulté** : 3/5
> **Prérequis** : Module 06 (Distributed Tracing), Module 07 (Sentry)
> **Objectifs** :
> - Comprendre le Real User Monitoring (RUM) et ses métriques
> - Implémenter le suivi des Core Web Vitals (LCP, FID/INP, CLS)
> - Utiliser la Performance Observer API
> - Mettre en place le error tracking frontend avec Sentry
> - Connecter les traces frontend aux traces backend

---

## 1. Pourquoi l'observabilité frontend ?

Le backend est instrumenté — logs, métriques, traces. Mais **80% de l'expérience utilisateur se joue côté navigateur** : temps de rendu, interactivité, stabilité visuelle.

```
Utilisateur → Navigateur (frontend obs) → Réseau → Serveur (backend obs) → DB
              ^^^^^^^^^^^^^^^^^^^^^^^^                 ^^^^^^^^^^^^^^^^^^^^
              RUM, CWV, Error tracking                 Logs, Métriques, Traces
```

Sans observabilité frontend, on est aveugle sur :
- Le temps de chargement réel perçu par l'utilisateur (pas le TTFB)
- Les erreurs JavaScript non remontées
- Les performances sur mobile/connexions lentes
- L'impact des third-party scripts

---

## 2. Core Web Vitals

Les 3 métriques clés de Google pour la qualité d'expérience :

| Métrique | Mesure | Bon | Acceptable | Mauvais |
|----------|--------|-----|------------|---------|
| **LCP** (Largest Contentful Paint) | Temps d'affichage du plus gros élément | < 2.5s | < 4s | > 4s |
| **INP** (Interaction to Next Paint) | Latence des interactions | < 200ms | < 500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | Stabilité visuelle | < 0.1 | < 0.25 | > 0.25 |

### Mesurer avec web-vitals

```typescript
import { onLCP, onINP, onCLS } from 'web-vitals';

function sendToAnalytics(metric: { name: string; value: number; id: string }) {
  navigator.sendBeacon('/api/vitals', JSON.stringify(metric));
}

onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
```

### Performance Budgets

Un budget de performance définit les seuils à ne pas dépasser. Il permet de détecter les régressions en CI avant qu'elles n'atteignent la production.

**Seuils recommandés par profil :**

| Métrique | Mobile 4G | Desktop |
|----------|-----------|---------|
| LCP | < 2.5s | < 1.5s |
| INP | < 200ms | < 100ms |
| CLS | < 0.1 | < 0.05 |
| TBT (proxy INP en lab) | < 300ms | < 150ms |

#### Lighthouse CI — configuration

```bash
npm install -D @lhci/cli
```

```javascript
// lighthouserc.js
/** @type {import('@lhci/types').LhrConfig} */
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/', 'http://localhost:3000/articles'],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'uses-optimized-images': 'warn',
      },
    },
    upload: {
      target: 'lhci',
      serverBaseUrl: process.env.LHCI_SERVER_URL,
      token: process.env.LHCI_BUILD_TOKEN,
    },
  },
};
```

**Intégration GitHub Actions :**

```yaml
# .github/workflows/lhci.yml
- name: Run Lighthouse CI
  run: |
    npm run build
    npx lhci autorun
  env:
    LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

En cas d'échec des assertions, la CI échoue avec un rapport détaillé des régressions.

---

## 3. Performance Observer API

L'API native du navigateur pour observer les événements de performance.

```typescript
// Observer les Largest Contentful Paint
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log('LCP:', entry.startTime, 'ms', entry.toJSON());
  }
});
observer.observe({ type: 'largest-contentful-paint', buffered: true });

// Observer les Long Tasks (>50ms)
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.warn('Long task:', entry.duration, 'ms');
  }
});
longTaskObserver.observe({ type: 'longtask' });
```

### Types d'entrées disponibles

| Type | Contenu |
|------|---------|
| `navigation` | Timing de chargement complet de la page |
| `resource` | Timing de chaque ressource (JS, CSS, images) |
| `paint` | First Paint, First Contentful Paint |
| `largest-contentful-paint` | LCP |
| `layout-shift` | Changements de layout (CLS) |
| `longtask` | Tâches JS > 50ms |
| `event` | Latence des événements utilisateur (INP) |

---

## 4. Navigation Timing & Resource Timing

### PerformanceNavigationTiming — waterfall de chargement

`PerformanceNavigationTiming` expose le détail complet du cycle de vie d'une navigation, du DNS jusqu'au `loadEventEnd`.

```typescript
function getNavigationMetrics(): Record<string, number> | null {
  const [nav] = performance.getEntriesByType(
    'navigation',
  ) as PerformanceNavigationTiming[];

  if (!nav) return null;

  return {
    // Résolution DNS
    dnsLookup: nav.domainLookupEnd - nav.domainLookupStart,
    // Établissement de la connexion TCP + TLS
    tcpConnect: nav.connectEnd - nav.connectStart,
    tlsNegotiation: nav.secureConnectionStart > 0
      ? nav.connectEnd - nav.secureConnectionStart
      : 0,
    // Temps serveur (TTFB)
    ttfb: nav.responseStart - nav.requestStart,
    // Transfert de la réponse HTML
    responseDownload: nav.responseEnd - nav.responseStart,
    // Parsing et rendu
    domInteractive: nav.domInteractive - nav.responseEnd,
    domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
    // Chargement complet
    loadEvent: nav.loadEventEnd - nav.loadEventStart,
    // Durée totale
    total: nav.loadEventEnd - nav.startTime,
  };
}
```

### PerformanceResourceTiming — scripts tiers lents

Chaque ressource chargée (JS, CSS, image, XHR) expose un `PerformanceResourceTiming`. C'est le seul moyen fiable de détecter les scripts tiers qui pénalisent le chargement.

```typescript
interface SlowResource {
  name: string;
  duration: number;
  transferSize: number;
  initiatorType: string;
}

function detectSlowThirdPartyScripts(
  threshold: number = 500,
  ownOrigin: string = location.origin,
): SlowResource[] {
  const resources = performance.getEntriesByType(
    'resource',
  ) as PerformanceResourceTiming[];

  return resources
    .filter((entry) => {
      // Exclure les ressources first-party (comparaison par origin pour
      // gerer correctement les ports, protocols et sous-domaines)
      const isThirdParty = new URL(entry.name).origin !== ownOrigin;
      const isSlow = entry.duration > threshold;
      return isThirdParty && isSlow;
    })
    .map((entry) => ({
      name: new URL(entry.name).hostname,
      duration: Math.round(entry.duration),
      transferSize: entry.transferSize,
      initiatorType: entry.initiatorType,
    }))
    .sort((a, b) => b.duration - a.duration);
}

// À appeler après l'événement load
window.addEventListener('load', () => {
  const slowScripts = detectSlowThirdPartyScripts(500);
  if (slowScripts.length > 0) {
    console.table(slowScripts);
    navigator.sendBeacon('/api/rum/third-party', JSON.stringify(slowScripts));
  }
});
```

> **Limitation cross-origin** : pour les ressources d'autres origines, `transferSize`, `encodedBodySize` et `decodedBodySize` sont à `0` à moins que le serveur tiers n'envoie `Timing-Allow-Origin: *`.

---

## 5. Long Animation Frames (LoAF)

L'API `long-animation-frame` (Chrome 123+) remplace `longtask` pour détecter le jank. Contrairement à Long Tasks, LoAF couvre l'intégralité du cycle de rendu : script + style + layout + paint.

**Seuil** : toute frame > 50ms est considérée comme un LoAF.

```typescript
interface LoafEntry extends PerformanceEntry {
  readonly blockingDuration: number;
  readonly renderStart: number;
  readonly styleAndLayoutStart: number;
  readonly scripts: LoafScriptEntry[];
}

interface LoafScriptEntry {
  readonly name: string;
  readonly duration: number;
  readonly executionStart: number;
  readonly sourceURL: string;
  readonly sourceCharPosition: number;
  readonly sourceFunctionName: string;
  readonly invokerType: string;
  readonly invoker: string;
}

function observeLongAnimationFrames(sendFn: (data: unknown) => void): PerformanceObserver | null {
  if (!PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    console.warn('LoAF not supported — falling back to longtask');
    return null;
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LoafEntry[]) {
      // blockingDuration = durée qui a bloqué le rendu au-delà de 50ms
      if (entry.blockingDuration > 0) {
        const scripts = entry.scripts.map((s) => ({
          source: s.sourceURL ? `${s.sourceURL}:${s.sourceCharPosition}` : s.invoker,
          fn: s.sourceFunctionName || s.invokerType,
          duration: Math.round(s.duration),
        }));

        sendFn({
          type: 'loaf',
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(entry.blockingDuration),
          renderStart: Math.round(entry.renderStart - entry.startTime),
          scripts,
        });
      }
    }
  });

  observer.observe({ type: 'long-animation-frame', buffered: true });
  return observer;
}
```

**Différences clés avec Long Tasks :**

| Critère | Long Tasks | LoAF |
|---------|-----------|------|
| Couverture | Script seul | Script + style + layout + paint |
| Attributions | Limitées | URL source + numéro de ligne |
| Frames multiples | Non | Oui (une frame = un enregistrement) |
| Support navigateur | Tous (2016) | Chrome 123+ (2024) |
| Corrélation INP | Partielle | Directe (`blockingDuration`) |

---

## 6. Error tracking frontend

### Error boundaries (React)

```tsx
class ErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) return <FallbackUI />;
    return this.props.children;
  }
}
```

### Error boundaries (Vue 3)

```typescript
app.config.errorHandler = (err, instance, info) => {
  Sentry.captureException(err, {
    extra: { componentName: instance?.$options?.name, info },
  });
};
```

### Error handler (Angular)

Angular expose `ErrorHandler` comme point d'extension global pour toutes les erreurs non gérées.

```typescript
import { ErrorHandler, Injectable } from '@angular/core';
import * as Sentry from '@sentry/angular';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const extractedError = this.extractError(error);
    Sentry.captureException(extractedError);
    // Re-throw pour que la console Angular affiche l'erreur en dev
    if (typeof ngDevMode !== 'undefined' && ngDevMode) {
      console.error(extractedError);
    }
  }

  private extractError(error: unknown): Error | string {
    // Angular enveloppe parfois les erreurs dans un objet { rejection, ... }
    if (error && typeof error === 'object' && 'rejection' in error) {
      return (error as { rejection: Error }).rejection;
    }
    return error instanceof Error ? error : String(error);
  }
}
```

```typescript
// app.config.ts (standalone) ou AppModule
providers: [
  { provide: ErrorHandler, useClass: GlobalErrorHandler },
]
```

### Erreurs non capturées

```typescript
window.addEventListener('unhandledrejection', (event) => {
  Sentry.captureException(event.reason);
});
```

### Erreurs des scripts tiers (cross-origin)

Les scripts tiers chargés depuis une autre origine retournent `"Script error."` sans stack trace en raison de la politique CORS du navigateur.

```typescript
// Deux catégories d'erreurs à surveiller :

// 1. Erreur JS cross-origin (message tronqué sans CORS headers)
// Note SPA : dans une SPA (Vue Router, React Router), penser à retirer
// ces listeners lors du démontage du composant / changement de route pour
// éviter les doublons. Exemple : const controller = new AbortController();
// window.addEventListener('error', handler, { signal: controller.signal });
// puis controller.abort() au cleanup.
window.addEventListener('error', (event: ErrorEvent) => {
  if (event.message === 'Script error.' && !event.filename) {
    // Script tiers sans Timing-Allow-Origin / CORS
    Sentry.captureMessage('Cross-origin script error (details hidden)', {
      level: 'warning',
      extra: {
        colno: event.colno,
        lineno: event.lineno,
        filename: event.filename,
      },
    });
    return;
  }
  // Erreur first-party — stack disponible
  Sentry.captureException(event.error ?? event.message);
});

// 2. Échec de chargement d'un script tiers (<script src="..."> 404/timeout)
function monitorScriptLoadErrors(): void {
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => {
    script.addEventListener('error', () => {
      Sentry.captureMessage(`Failed to load script: ${script.src}`, {
        level: 'error',
        tags: { type: 'resource-load-failure' },
      });
    });
  });
}

// Pour les scripts injectés dynamiquement
const originalCreateElement = document.createElement.bind(document);
document.createElement = function <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementCreationOptions,
): HTMLElementTagNameMap[K] {
  const el = originalCreateElement(tagName, options);
  if (tagName.toLowerCase() === 'script') {
    el.addEventListener('error', (e: Event) => {
      const src = (e.target as HTMLScriptElement).src;
      Sentry.captureMessage(`Dynamic script load error: ${src}`, { level: 'error' });
    });
  }
  return el;
};
```

> **Solution recommandée** : demander aux CDN tiers d'ajouter `crossorigin="anonymous"` sur le tag `<script>` et de servir l'en-tête `Access-Control-Allow-Origin: *`. Cela restaure les stack traces complètes.

---

## 7. Source maps en production

Les erreurs JS en production sont minifiées → illisibles sans source maps.

**Ne pas publier les source maps publiquement** — les uploader à Sentry uniquement :

```bash
# Upload des source maps à Sentry
npx @sentry/cli sourcemaps upload --release=1.0.0 ./dist
```

Avec Vite/Nuxt :
```typescript
// vite.config.ts
export default {
  build: {
    sourcemap: 'hidden', // Génère les .map mais ne les référence pas dans le JS
  },
};
```

---

## 8. Comparatif des outils RUM

| Outil | Session Replay | CWV natifs | Alerting | Self-hosted | Prix indicatif |
|-------|---------------|------------|----------|-------------|----------------|
| **Sentry** | Oui (DOM snapshots) | Via web-vitals SDK | Oui | Oui (OSS) | Gratuit / ~$26+/mois |
| **Datadog RUM** | Oui | Oui (dashboards prêts) | Oui (monitors) | Non | ~$1.5/1000 sessions |
| **Grafana Faro** | Non | Oui | Via Grafana Alerting | Oui (OSS) | Gratuit (self-hosted) |
| **SpeedCurve** | Non | Oui (LUX RUM) | Oui | Non | ~$20+/mois |
| **web-vitals + backend custom** | Non | Oui | À construire | Oui | Coût infra uniquement |

### Sentry — Session Replay

Avantages clés : corrélation erreur ↔ replay, masquage RGPD granulaire, intégration traces distribuées.

```typescript
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.APP_VERSION,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,       // RGPD : masquer tout le texte
      blockAllMedia: true,     // RGPD : bloquer images/vidéos
      maskAllInputs: true,
    }),
    Sentry.browserTracingIntegration(),
  ],
});
```

### Grafana Faro — stack open-source

Faro s'intègre avec Grafana Loki (logs), Grafana Tempo (traces) et Grafana Mimir/Prometheus (métriques) pour une stack RUM entièrement self-hosted.

```typescript
import { initializeFaro, getWebInstrumentations } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

const faro = initializeFaro({
  url: 'https://faro-collector.internal/collect',
  app: { name: 'cms-fo', version: process.env.APP_VERSION },
  instrumentations: [
    ...getWebInstrumentations({ captureConsole: false }),
    new TracingInstrumentation(),
  ],
});

// Envoyer les CWV manuellement
import { onLCP, onINP, onCLS } from 'web-vitals';

function sendCwvToFaro(metric: { name: string; value: number }): void {
  faro.api.pushMeasurement({
    type: 'web-vitals',
    values: { [metric.name]: metric.value },
  });
}

onLCP(sendCwvToFaro);
onINP(sendCwvToFaro);
onCLS(sendCwvToFaro);
```

### Critères de choix

- **Budget limité + self-hosted** → Grafana Faro
- **Débogage de bugs complexes** → Sentry (Session Replay + breadcrumbs)
- **Équipe orientée Datadog** → Datadog RUM (corrélation APM native)
- **Suivi perf synthétique + RUM combiné** → SpeedCurve
- **Contrôle total + intégration existante** → web-vitals + backend custom

---

## 9. Session replay

Le session replay enregistre les interactions utilisateur pour reproduire les bugs :

- **Sentry Session Replay** : DOM snapshots, événements utilisateur, réseau
- **Privacy** : masquer les données sensibles (`maskAllText`, `blockAllMedia`)
- **Sampling** : enregistrer 1-10% des sessions normales, 100% des sessions avec erreurs

```typescript
Sentry.init({
  replaysSessionSampleRate: 0.1, // 10% des sessions
  replaysOnErrorSampleRate: 1.0, // 100% si erreur
  integrations: [Sentry.replayIntegration()],
});
```

---

## 10. Connecter frontend et backend

Le **W3C Trace Context** (`traceparent` header) permet de relier les traces frontend aux traces backend :

```typescript
// Frontend : ajouter le header traceparent aux fetch
const traceId = generateTraceId();
fetch('/api/data', {
  headers: {
    'traceparent': `00-${traceId}-${spanId}-01`,
  },
});

// Backend : extraire et propager le trace context
// OpenTelemetry le fait automatiquement si le header est présent
```

---

## 11. Recettes de débogage pratiques

### Scénario 1 — "Mon LCP est lent sur mobile"

**Symptôme** : LCP > 4s mesuré par le RUM sur mobile, < 2s en lab desktop.

```typescript
// Étape 1 : identifier la ressource LCP
const lcpObserver = new PerformanceObserver((list) => {
  const entries = list.getEntries() as LargestContentfulPaint[];
  const last = entries[entries.length - 1];

  console.log('LCP element:', last.element);
  console.log('LCP url:', last.url); // URL de l'image si c'est une image
  console.log('LCP startTime:', last.startTime);
});
lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

// Étape 2 : vérifier le timing de chargement de l'image hero
function checkHeroImageTiming(imageUrl: string): void {
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const hero = resources.find((r) => r.name === imageUrl);

  if (!hero) {
    console.warn('Hero image not found in Resource Timing');
    return;
  }

  console.table({
    'DNS': hero.domainLookupEnd - hero.domainLookupStart,
    'TCP': hero.connectEnd - hero.connectStart,
    'TTFB image': hero.responseStart - hero.requestStart,
    'Téléchargement': hero.responseEnd - hero.responseStart,
    'Total': hero.duration,
    'Taille (bytes)': hero.transferSize,
  });

  // Diagnostics courants
  if (hero.transferSize > 200_000) {
    console.warn('Image trop lourde — envisager WebP/AVIF + srcset');
  }
  if (hero.responseStart - hero.requestStart > 500) {
    console.warn('TTFB élevé sur l\'image — vérifier le CDN / cache headers');
  }
  if (!hero.name.startsWith(location.origin)) {
    console.info('Image sur CDN tiers — ajouter <link rel="preconnect">');
  }
}

// Étape 3 : vérifier les layout shifts autour du LCP
const clsObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries() as LayoutShift[]) {
    if (entry.value > 0.01) {
      console.log('Layout shift:', entry.value, 'sources:', entry.sources);
    }
  }
});
clsObserver.observe({ type: 'layout-shift', buffered: true });
```

**Actions correctives habituelles :**
- Ajouter `fetchpriority="high"` sur l'image hero
- Ajouter `<link rel="preload" as="image">` dans le `<head>`
- Servir l'image au format AVIF/WebP avec `srcset` adapté
- Vérifier que l'image n'est pas derrière un lazy-load accidentel

---

### Scénario 2 — "Les utilisateurs signalent du jank"

**Symptôme** : INP > 500ms sur certaines pages, animations saccadées.

```typescript
// Étape 1 : activer LoAF (Long Animation Frames) en production
const loafData: Array<{ duration: number; blockingDuration: number; scripts: string[] }> = [];

if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as LoafEntry[]) {
      if (entry.blockingDuration > 50) {
        loafData.push({
          duration: Math.round(entry.duration),
          blockingDuration: Math.round(entry.blockingDuration),
          scripts: entry.scripts.map(
            (s) => `${s.sourceFunctionName || s.invokerType} @ ${s.sourceURL}:${s.sourceCharPosition}`,
          ),
        });
      }
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
}

// Étape 2 : corréler avec les événements INP
import { onINP } from 'web-vitals';

onINP((metric) => {
  if (metric.value > 200) {
    // L'entrée attribution pointe vers l'élément et le type d'événement
    const attribution = metric.attribution;
    console.warn('INP dégradé:', {
      value: metric.value,
      element: attribution?.interactionTargetElement,
      eventType: attribution?.interactionType,
      // Frames LoAF accumulées au même moment
      loafSnapshot: loafData.slice(-5),
    });
    navigator.sendBeacon('/api/rum/inp', JSON.stringify({
      value: metric.value,
      attribution,
      loafSnapshot: loafData.slice(-5),
    }));
  }
});
```

**Actions correctives habituelles :**
- Déplacer le traitement lourd dans un `Web Worker`
- Utiliser `scheduler.yield()` (ou `setTimeout(fn, 0)`) pour céder le thread entre les tâches
- Éviter les `ResizeObserver` / `MutationObserver` sans debounce
- Vérifier les animations CSS utilisant `top`/`left` au lieu de `transform`

---

### Scénario 3 — "Erreurs JS aléatoires en production"

**Symptôme** : Sentry remonte des erreurs sans contexte clair, impossible à reproduire localement.

```typescript
// Étape 1 : enrichir le contexte Sentry dès l'initialisation
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event, hint) {
    const error = hint?.originalException;

    // Ignorer les erreurs de scripts tiers non critiques
    if (event.exception?.values?.[0]?.value === 'Script error.') {
      return null; // Supprimer — impossible à déboguer sans CORS
    }

    // Enrichir avec le contexte de navigation
    event.extra = {
      ...event.extra,
      navigationTiming: getNavigationMetrics(),
      connectionType: (navigator as unknown as { connection?: { effectiveType: string } })
        .connection?.effectiveType,
    };

    return event;
  },
});

// Étape 2 : ajouter des breadcrumbs manuels aux actions utilisateur
function trackUserAction(action: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'user-action',
    message: action,
    data,
    level: 'info',
  });
}

// Exemple dans un composant
function handleFormSubmit(formData: FormData): void {
  trackUserAction('form.submit', { formId: 'checkout', fields: [...formData.keys()] });
  // ... logique métier
}

// Étape 3 : workflow de débogage avec Session Replay
// Dans Sentry :
// 1. Aller dans Issues → sélectionner l'erreur
// 2. Onglet "Replays" → filtrer par sessions avec cette erreur
// 3. Observer les breadcrumbs (clics, navigations, requêtes réseau) avant l'erreur
// 4. La timeline du replay montre exactement ce que l'utilisateur faisait
// 5. Onglet "Traces" → relier à la requête backend si applicable

// Étape 4 : vérifier si l'erreur est liée à un script tiers
function auditThirdPartyErrors(): void {
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const failedScripts = resources.filter(
    (r) => r.initiatorType === 'script' && r.duration === 0 && r.transferSize === 0,
  );

  if (failedScripts.length > 0) {
    console.warn('Scripts potentiellement non chargés:', failedScripts.map((r) => r.name));
  }
}
```

**Actions correctives habituelles :**
- Activer `replaysOnErrorSampleRate: 1.0` pour 100% de replay sur erreur
- Augmenter la rétention des breadcrumbs (`maxBreadcrumbs: 100`)
- Vérifier les Content Security Policy violations (`report-uri` dans les logs serveur)
- Tester avec un profil réseau dégradé (DevTools → Network throttling)

---

## 12. Récapitulatif

- **Core Web Vitals** (LCP, INP, CLS) sont les métriques frontend essentielles — seuils : LCP < 2.5s, INP < 200ms, CLS < 0.1
- **Performance Budgets** : enforcer via Lighthouse CI en PR pour détecter les régressions avant production
- **Performance Observer API** donne accès aux événements de perf du navigateur en temps réel
- **Navigation Timing** : waterfall complet DNS → loadEvent pour diagnostiquer les TTFB élevés
- **Resource Timing** : détecter les scripts tiers lents (filter par origine + duration > seuil)
- **LoAF** (Long Animation Frames) : remplace Long Tasks, corrèle directement avec l'INP, fournit les URLs sources
- **Error boundaries** (React/Vue/Angular) capturent les erreurs de rendu par framework
- **Scripts cross-origin** : "Script error." = erreur tiers sans CORS — demander `Access-Control-Allow-Origin: *`
- **Source maps** : `sourcemap: 'hidden'` dans Vite, upload via `@sentry/cli`, ne jamais exposer publiquement
- **Comparatif RUM** : Sentry (Session Replay), Datadog RUM (APM natif), Grafana Faro (self-hosted), SpeedCurve (synthétique+RUM)
- **Session replay** : 5-10% normal, 100% sur erreur, masquer toutes les données personnelles
- Le **W3C Trace Context** (`traceparent`) relie les traces frontend aux traces backend

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 23 observabilite frontend](../screencasts/screencast-23.md)
2. **Lab** : [lab-23-observabilite-frontend](../labs/lab-23-observabilite-frontend/README)
3. **Quiz** : [quiz 23 observabilite frontend](../quizzes/quiz-23-observabilite-frontend.html)
:::

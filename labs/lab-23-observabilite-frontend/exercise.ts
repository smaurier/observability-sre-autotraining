// =============================================================================
// Lab 23 — Observabilite Frontend : RUM, Core Web Vitals, Error Tracking
// =============================================================================
// Objectifs :
//   - Implementer un collecteur RUM (Real User Monitoring)
//   - Calculer et classifier les Core Web Vitals (LCP, INP, CLS)
//   - Construire un systeme d'error tracking avec groupement
//   - Agreger les metriques par page et par session
// Executer avec : npx tsx exercise.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, summary } =
  createTestRunner('Lab 23 — Observabilite Frontend');

// =============================================================================
// Exercice 1 : Core Web Vitals — Classification
// Implementez les fonctions de classification des metriques CWV.
// =============================================================================

// Les seuils officiels Google (2024) :
// LCP : bon < 2500ms, ameliorer < 4000ms, mauvais >= 4000ms
// INP : bon < 200ms, ameliorer < 500ms, mauvais >= 500ms
// CLS : bon < 0.1, ameliorer < 0.25, mauvais >= 0.25

type CWVRating = 'good' | 'needs-improvement' | 'poor';

interface CoreWebVitals {
  lcp: number;   // millisecondes
  inp: number;   // millisecondes
  cls: number;   // score sans unite (ratio)
}

// TODO: Implementez cette fonction
// Retourne 'good', 'needs-improvement' ou 'poor' selon les seuils LCP
function rateLCP(value: number): CWVRating {
  // TODO: Implementez selon les seuils officiels
  return 'poor';
}

// TODO: Implementez cette fonction
// Retourne 'good', 'needs-improvement' ou 'poor' selon les seuils INP
function rateINP(value: number): CWVRating {
  // TODO: Implementez selon les seuils officiels
  return 'poor';
}

// TODO: Implementez cette fonction
// Retourne 'good', 'needs-improvement' ou 'poor' selon les seuils CLS
function rateCLS(value: number): CWVRating {
  // TODO: Implementez selon les seuils officiels
  return 'poor';
}

// TODO: Implementez cette fonction
// Retourne un objet avec le rating de chaque metrique et un score global
// Le score global est 'good' si les 3 sont 'good',
// 'poor' si au moins un est 'poor',
// 'needs-improvement' sinon
function rateCoreWebVitals(vitals: CoreWebVitals): {
  lcp: CWVRating;
  inp: CWVRating;
  cls: CWVRating;
  overall: CWVRating;
} {
  // TODO: Implementez
  return { lcp: 'poor', inp: 'poor', cls: 'poor', overall: 'poor' };
}

// =============================================================================
// Exercice 2 : Collecteur RUM
// Implementez un collecteur qui recoit des evenements RUM,
// les bufferise et les envoie par batch.
// =============================================================================

interface RUMEvent {
  sessionId: string;
  pageUrl: string;
  timestamp: number;
  type: 'page_view' | 'error' | 'vital' | 'resource';
  metrics?: Record<string, number>;
  error?: { message: string; stack?: string };
}

// TODO: Implementez la classe RUMCollector
// - Le constructeur prend un batchSize (nombre d'evenements avant envoi)
// - addEvent(event) : ajoute un evenement au buffer
// - flush() : envoie tous les evenements bufferises et retourne le batch
// - getBuffer() : retourne les evenements en attente
// - getBatches() : retourne tous les batchs envoyes
// Quand le buffer atteint batchSize, il est automatiquement flush
class RUMCollector {
  private buffer: RUMEvent[] = [];
  private batches: RUMEvent[][] = [];
  private batchSize: number;

  constructor(batchSize: number) {
    this.batchSize = batchSize;
    // TODO: Initialisez
  }

  addEvent(event: RUMEvent): void {
    // TODO: Ajoutez l'evenement au buffer
    // Si le buffer atteint batchSize, flush automatiquement
  }

  flush(): RUMEvent[] {
    // TODO: Videz le buffer, ajoutez-le aux batches, retournez le batch
    return [];
  }

  getBuffer(): RUMEvent[] {
    // TODO: Retournez une copie du buffer actuel
    return [];
  }

  getBatches(): RUMEvent[][] {
    // TODO: Retournez tous les batchs envoyes
    return [];
  }
}

// =============================================================================
// Exercice 3 : Error Tracker avec groupement
// Implementez un tracker d'erreurs qui groupe les erreurs similaires
// par message (fingerprint simplifie).
// =============================================================================

interface TrackedError {
  message: string;
  stack?: string;
  pageUrl: string;
  timestamp: number;
  sessionId: string;
}

interface ErrorGroup {
  fingerprint: string;    // Le message d'erreur (simplifie)
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  affectedSessions: Set<string>;
  affectedPages: Set<string>;
}

// TODO: Implementez la classe ErrorTracker
// - trackError(error) : enregistre une erreur
//   -> Normalise le fingerprint (message en lowercase, trim)
//   -> Si le fingerprint existe deja, incremente le compteur et met a jour lastSeen
//   -> Sinon, cree un nouveau groupe
//   -> Ajoute le sessionId et pageUrl aux sets
// - getGroups() : retourne tous les groupes d'erreurs
// - getTopErrors(n) : retourne les n groupes avec le plus d'occurrences
// - getErrorRate(totalPageViews) : retourne le taux d'erreur global (erreurs uniques / page views)
class ErrorTracker {
  private groups: Map<string, ErrorGroup> = new Map();
  private totalErrors: number = 0;

  trackError(error: TrackedError): void {
    // TODO: Implementez le groupement d'erreurs
  }

  getGroups(): ErrorGroup[] {
    // TODO: Retournez tous les groupes
    return [];
  }

  getTopErrors(n: number): ErrorGroup[] {
    // TODO: Retournez les n groupes les plus frequents
    return [];
  }

  getErrorRate(totalPageViews: number): number {
    // TODO: Retournez totalErrors / totalPageViews
    return 0;
  }
}

// =============================================================================
// Exercice 4 : Agregation de metriques par page
// Implementez un agregateur qui calcule les percentiles des CWV par page.
// =============================================================================

interface PageMetrics {
  pageUrl: string;
  vitals: CoreWebVitals;
  timestamp: number;
}

interface PageAggregation {
  pageUrl: string;
  sampleCount: number;
  lcp: { p50: number; p75: number; p95: number };
  inp: { p50: number; p75: number; p95: number };
  cls: { p50: number; p75: number; p95: number };
  overallRating: CWVRating;
}

// TODO: Implementez cette fonction utilitaire
// Calcule le percentile d'un tableau de nombres (methode interpolation lineaire)
function percentile(values: number[], p: number): number {
  // TODO: Triez les valeurs, calculez l'index, interpolez si necessaire
  // p est entre 0 et 100
  return 0;
}

// TODO: Implementez cette fonction
// Prend un tableau de PageMetrics et retourne une agregation par page
// Pour chaque page unique :
//   - Calculer p50, p75, p95 de LCP, INP, CLS
//   - Le overallRating est base sur les p75 (comme Google)
function aggregateByPage(metrics: PageMetrics[]): PageAggregation[] {
  // TODO: Implementez
  return [];
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n--- Lab 23 — Observabilite Frontend ---\n');

  // --- Exercice 1 : Core Web Vitals ---
  await test('Ex1 — rateLCP good', () => {
    assertEqual(rateLCP(1500), 'good');
    assertEqual(rateLCP(2499), 'good');
  });

  await test('Ex1 — rateLCP needs-improvement', () => {
    assertEqual(rateLCP(2500), 'needs-improvement');
    assertEqual(rateLCP(3999), 'needs-improvement');
  });

  await test('Ex1 — rateLCP poor', () => {
    assertEqual(rateLCP(4000), 'poor');
    assertEqual(rateLCP(8000), 'poor');
  });

  await test('Ex1 — rateINP good', () => {
    assertEqual(rateINP(100), 'good');
    assertEqual(rateINP(199), 'good');
  });

  await test('Ex1 — rateINP needs-improvement', () => {
    assertEqual(rateINP(200), 'needs-improvement');
    assertEqual(rateINP(499), 'needs-improvement');
  });

  await test('Ex1 — rateINP poor', () => {
    assertEqual(rateINP(500), 'poor');
    assertEqual(rateINP(1000), 'poor');
  });

  await test('Ex1 — rateCLS', () => {
    assertEqual(rateCLS(0.05), 'good');
    assertEqual(rateCLS(0.1), 'needs-improvement');
    assertEqual(rateCLS(0.25), 'poor');
    assertEqual(rateCLS(0.5), 'poor');
  });

  await test('Ex1 — rateCoreWebVitals overall good', () => {
    const result = rateCoreWebVitals({ lcp: 1000, inp: 50, cls: 0.01 });
    assertEqual(result.overall, 'good');
    assertEqual(result.lcp, 'good');
    assertEqual(result.inp, 'good');
    assertEqual(result.cls, 'good');
  });

  await test('Ex1 — rateCoreWebVitals overall poor', () => {
    const result = rateCoreWebVitals({ lcp: 5000, inp: 50, cls: 0.01 });
    assertEqual(result.overall, 'poor');
  });

  await test('Ex1 — rateCoreWebVitals overall needs-improvement', () => {
    const result = rateCoreWebVitals({ lcp: 3000, inp: 50, cls: 0.01 });
    assertEqual(result.overall, 'needs-improvement');
  });

  // --- Exercice 2 : RUM Collector ---
  await test('Ex2 — RUMCollector addEvent et getBuffer', () => {
    const collector = new RUMCollector(3);
    collector.addEvent({
      sessionId: 's1', pageUrl: '/', timestamp: Date.now(),
      type: 'page_view',
    });
    assertEqual(collector.getBuffer().length, 1);
  });

  await test('Ex2 — RUMCollector auto-flush au batchSize', () => {
    const collector = new RUMCollector(2);
    collector.addEvent({
      sessionId: 's1', pageUrl: '/', timestamp: Date.now(), type: 'page_view',
    });
    collector.addEvent({
      sessionId: 's1', pageUrl: '/about', timestamp: Date.now(), type: 'page_view',
    });
    assertEqual(collector.getBuffer().length, 0);
    assertEqual(collector.getBatches().length, 1);
    assertEqual(collector.getBatches()[0].length, 2);
  });

  await test('Ex2 — RUMCollector flush manuel', () => {
    const collector = new RUMCollector(10);
    collector.addEvent({
      sessionId: 's1', pageUrl: '/', timestamp: Date.now(), type: 'vital',
    });
    const batch = collector.flush();
    assertEqual(batch.length, 1);
    assertEqual(collector.getBuffer().length, 0);
    assertEqual(collector.getBatches().length, 1);
  });

  await test('Ex2 — RUMCollector flush vide retourne tableau vide', () => {
    const collector = new RUMCollector(10);
    const batch = collector.flush();
    assertEqual(batch.length, 0);
    assertEqual(collector.getBatches().length, 0);
  });

  // --- Exercice 3 : Error Tracker ---
  await test('Ex3 — ErrorTracker groupement par message', () => {
    const tracker = new ErrorTracker();
    tracker.trackError({
      message: 'TypeError: Cannot read properties of null',
      pageUrl: '/', timestamp: 1000, sessionId: 's1',
    });
    tracker.trackError({
      message: 'TypeError: Cannot read properties of null',
      pageUrl: '/about', timestamp: 2000, sessionId: 's2',
    });
    const groups = tracker.getGroups();
    assertEqual(groups.length, 1);
    assertEqual(groups[0].count, 2);
    assertEqual(groups[0].affectedSessions.size, 2);
    assertEqual(groups[0].affectedPages.size, 2);
  });

  await test('Ex3 — ErrorTracker normalisation du fingerprint', () => {
    const tracker = new ErrorTracker();
    tracker.trackError({
      message: '  ReferenceError: x is not defined  ',
      pageUrl: '/', timestamp: 1000, sessionId: 's1',
    });
    tracker.trackError({
      message: 'referenceerror: x is not defined',
      pageUrl: '/', timestamp: 2000, sessionId: 's2',
    });
    assertEqual(tracker.getGroups().length, 1);
    assertEqual(tracker.getGroups()[0].count, 2);
  });

  await test('Ex3 — ErrorTracker firstSeen et lastSeen', () => {
    const tracker = new ErrorTracker();
    tracker.trackError({
      message: 'Error A', pageUrl: '/', timestamp: 1000, sessionId: 's1',
    });
    tracker.trackError({
      message: 'Error A', pageUrl: '/', timestamp: 5000, sessionId: 's2',
    });
    const group = tracker.getGroups()[0];
    assertEqual(group.firstSeen, 1000);
    assertEqual(group.lastSeen, 5000);
  });

  await test('Ex3 — ErrorTracker getTopErrors', () => {
    const tracker = new ErrorTracker();
    for (let i = 0; i < 5; i++) {
      tracker.trackError({
        message: 'Error A', pageUrl: '/', timestamp: i, sessionId: `s${i}`,
      });
    }
    for (let i = 0; i < 3; i++) {
      tracker.trackError({
        message: 'Error B', pageUrl: '/', timestamp: i, sessionId: `s${i}`,
      });
    }
    tracker.trackError({
      message: 'Error C', pageUrl: '/', timestamp: 0, sessionId: 's0',
    });

    const top2 = tracker.getTopErrors(2);
    assertEqual(top2.length, 2);
    assertEqual(top2[0].count, 5);
    assertEqual(top2[1].count, 3);
  });

  await test('Ex3 — ErrorTracker error rate', () => {
    const tracker = new ErrorTracker();
    for (let i = 0; i < 10; i++) {
      tracker.trackError({
        message: `Error ${i}`, pageUrl: '/', timestamp: i, sessionId: 's1',
      });
    }
    const rate = tracker.getErrorRate(1000);
    assertEqual(rate, 0.01);
  });

  // --- Exercice 4 : Agregation par page ---
  await test('Ex4 — percentile basique', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assertEqual(percentile(values, 50), 55);
    assertEqual(percentile(values, 0), 10);
    assertEqual(percentile(values, 100), 100);
  });

  await test('Ex4 — percentile avec interpolation', () => {
    const values = [1, 2, 3, 4, 5];
    assertEqual(percentile(values, 50), 3);
    assertEqual(percentile(values, 25), 2);
    assertEqual(percentile(values, 75), 4);
  });

  await test('Ex4 — aggregateByPage basique', () => {
    const metrics: PageMetrics[] = [];
    for (let i = 0; i < 10; i++) {
      metrics.push({
        pageUrl: '/',
        vitals: { lcp: 1000 + i * 100, inp: 50 + i * 10, cls: 0.01 + i * 0.01 },
        timestamp: Date.now() + i,
      });
    }
    for (let i = 0; i < 5; i++) {
      metrics.push({
        pageUrl: '/about',
        vitals: { lcp: 3000 + i * 200, inp: 300 + i * 50, cls: 0.2 + i * 0.05 },
        timestamp: Date.now() + i,
      });
    }

    const result = aggregateByPage(metrics);
    assertEqual(result.length, 2);

    const homePage = result.find(r => r.pageUrl === '/')!;
    assert(homePage !== undefined, 'Page / doit etre presente');
    assertEqual(homePage.sampleCount, 10);
    assert(homePage.lcp.p50 > 0, 'LCP p50 doit etre > 0');
    assert(homePage.lcp.p75 > homePage.lcp.p50, 'LCP p75 > p50');
    assert(homePage.lcp.p95 > homePage.lcp.p75, 'LCP p95 > p75');

    const aboutPage = result.find(r => r.pageUrl === '/about')!;
    assert(aboutPage !== undefined, 'Page /about doit etre presente');
    assertEqual(aboutPage.sampleCount, 5);
  });

  await test('Ex4 — aggregateByPage overallRating', () => {
    const metrics: PageMetrics[] = [];
    for (let i = 0; i < 10; i++) {
      metrics.push({
        pageUrl: '/fast',
        vitals: { lcp: 1000, inp: 50, cls: 0.01 },
        timestamp: Date.now() + i,
      });
    }
    for (let i = 0; i < 10; i++) {
      metrics.push({
        pageUrl: '/slow',
        vitals: { lcp: 5000, inp: 600, cls: 0.3 },
        timestamp: Date.now() + i,
      });
    }

    const result = aggregateByPage(metrics);
    const fast = result.find(r => r.pageUrl === '/fast')!;
    const slow = result.find(r => r.pageUrl === '/slow')!;
    assertEqual(fast.overallRating, 'good');
    assertEqual(slow.overallRating, 'poor');
  });

  summary();
}

main();

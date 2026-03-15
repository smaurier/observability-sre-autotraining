// =============================================================================
// Lab 23 — Observabilite Frontend : RUM, Core Web Vitals, Error Tracking
// =============================================================================
// SOLUTION
// Executer avec : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, summary } =
  createTestRunner('Lab 23 — Observabilite Frontend');

// =============================================================================
// Exercice 1 : Core Web Vitals — Classification
// =============================================================================

type CWVRating = 'good' | 'needs-improvement' | 'poor';

interface CoreWebVitals {
  lcp: number;
  inp: number;
  cls: number;
}

// POURQUOI : Les seuils sont definis par Google dans le programme Core Web Vitals.
// Le p75 de chaque metrique determine le rating de la page dans le rapport CrUX.
function rateLCP(value: number): CWVRating {
  // POURQUOI : 2500ms est le seuil "bon" car au-dela, l'utilisateur percoit
  // un chargement lent. 4000ms est le seuil "mauvais" car l'abandon augmente.
  if (value < 2500) return 'good';
  if (value < 4000) return 'needs-improvement';
  return 'poor';
}

function rateINP(value: number): CWVRating {
  // POURQUOI : INP remplace FID depuis mars 2024 car il mesure TOUTES les
  // interactions, pas seulement la premiere. 200ms correspond au seuil
  // ou l'utilisateur percoit un delai.
  if (value < 200) return 'good';
  if (value < 500) return 'needs-improvement';
  return 'poor';
}

function rateCLS(value: number): CWVRating {
  // POURQUOI : CLS est un score sans unite. 0.1 signifie qu'un element
  // s'est deplace de 10% de la hauteur du viewport.
  if (value < 0.1) return 'good';
  if (value < 0.25) return 'needs-improvement';
  return 'poor';
}

function rateCoreWebVitals(vitals: CoreWebVitals): {
  lcp: CWVRating;
  inp: CWVRating;
  cls: CWVRating;
  overall: CWVRating;
} {
  const lcp = rateLCP(vitals.lcp);
  const inp = rateINP(vitals.inp);
  const cls = rateCLS(vitals.cls);

  // POURQUOI : Le score global est "good" uniquement si les 3 metriques
  // sont bonnes. Une seule metrique mauvaise suffit a degrader le score global.
  const ratings = [lcp, inp, cls];
  let overall: CWVRating;
  if (ratings.every(r => r === 'good')) {
    overall = 'good';
  } else if (ratings.some(r => r === 'poor')) {
    overall = 'poor';
  } else {
    overall = 'needs-improvement';
  }

  return { lcp, inp, cls, overall };
}

// =============================================================================
// Exercice 2 : Collecteur RUM
// =============================================================================

interface RUMEvent {
  sessionId: string;
  pageUrl: string;
  timestamp: number;
  type: 'page_view' | 'error' | 'vital' | 'resource';
  metrics?: Record<string, number>;
  error?: { message: string; stack?: string };
}

class RUMCollector {
  private buffer: RUMEvent[] = [];
  private batches: RUMEvent[][] = [];
  private batchSize: number;

  constructor(batchSize: number) {
    this.batchSize = batchSize;
  }

  addEvent(event: RUMEvent): void {
    this.buffer.push(event);
    // POURQUOI : Le batch automatique reduit le nombre de requetes reseau.
    // En production, on utilise navigator.sendBeacon() pour l'envoi fiable.
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): RUMEvent[] {
    // POURQUOI : On ne cree pas de batch vide pour eviter les requetes inutiles.
    if (this.buffer.length === 0) return [];

    const batch = [...this.buffer];
    this.batches.push(batch);
    this.buffer = [];
    return batch;
  }

  getBuffer(): RUMEvent[] {
    return [...this.buffer];
  }

  getBatches(): RUMEvent[][] {
    return this.batches;
  }
}

// =============================================================================
// Exercice 3 : Error Tracker avec groupement
// =============================================================================

interface TrackedError {
  message: string;
  stack?: string;
  pageUrl: string;
  timestamp: number;
  sessionId: string;
}

interface ErrorGroup {
  fingerprint: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  affectedSessions: Set<string>;
  affectedPages: Set<string>;
}

class ErrorTracker {
  private groups: Map<string, ErrorGroup> = new Map();
  private totalErrors: number = 0;

  trackError(error: TrackedError): void {
    this.totalErrors++;

    // POURQUOI : On normalise le fingerprint en lowercase + trim pour grouper
    // les erreurs essentiellement identiques. En production, Sentry utilise un
    // fingerprinting plus sophistique (stack trace, type d'erreur, etc.).
    const fingerprint = error.message.toLowerCase().trim();

    const existing = this.groups.get(fingerprint);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, error.timestamp);
      existing.firstSeen = Math.min(existing.firstSeen, error.timestamp);
      existing.affectedSessions.add(error.sessionId);
      existing.affectedPages.add(error.pageUrl);
    } else {
      // POURQUOI : Les Set garantissent des valeurs uniques pour sessions et pages.
      this.groups.set(fingerprint, {
        fingerprint,
        message: error.message,
        count: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        affectedSessions: new Set([error.sessionId]),
        affectedPages: new Set([error.pageUrl]),
      });
    }
  }

  getGroups(): ErrorGroup[] {
    return Array.from(this.groups.values());
  }

  getTopErrors(n: number): ErrorGroup[] {
    // POURQUOI : Trier par count decroissant priorise les erreurs les plus frequentes.
    return this.getGroups()
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  getErrorRate(totalPageViews: number): number {
    if (totalPageViews === 0) return 0;
    return this.totalErrors / totalPageViews;
  }
}

// =============================================================================
// Exercice 4 : Agregation de metriques par page
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

function percentile(values: number[], p: number): number {
  // POURQUOI : On trie une copie pour ne pas muter le tableau d'entree.
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  // POURQUOI : Interpolation lineaire pour un resultat plus precis.
  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function aggregateByPage(metrics: PageMetrics[]): PageAggregation[] {
  // POURQUOI : Grouper par page permet de voir quelles pages ont des
  // problemes de performance. C'est la vue "Page Summary" dans les outils RUM.
  const byPage = new Map<string, PageMetrics[]>();

  for (const m of metrics) {
    const existing = byPage.get(m.pageUrl) || [];
    existing.push(m);
    byPage.set(m.pageUrl, existing);
  }

  const results: PageAggregation[] = [];

  for (const [pageUrl, pageMetrics] of byPage) {
    const lcpValues = pageMetrics.map(m => m.vitals.lcp);
    const inpValues = pageMetrics.map(m => m.vitals.inp);
    const clsValues = pageMetrics.map(m => m.vitals.cls);

    const lcpAgg = {
      p50: percentile(lcpValues, 50),
      p75: percentile(lcpValues, 75),
      p95: percentile(lcpValues, 95),
    };
    const inpAgg = {
      p50: percentile(inpValues, 50),
      p75: percentile(inpValues, 75),
      p95: percentile(inpValues, 95),
    };
    const clsAgg = {
      p50: percentile(clsValues, 50),
      p75: percentile(clsValues, 75),
      p95: percentile(clsValues, 95),
    };

    // POURQUOI : Google utilise le p75 pour determiner le rating d'une page
    // dans le Chrome UX Report.
    const overallRating = rateCoreWebVitals({
      lcp: lcpAgg.p75,
      inp: inpAgg.p75,
      cls: clsAgg.p75,
    }).overall;

    results.push({
      pageUrl,
      sampleCount: pageMetrics.length,
      lcp: lcpAgg,
      inp: inpAgg,
      cls: clsAgg,
      overallRating,
    });
  }

  return results;
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n--- Lab 23 — Observabilite Frontend ---\n');

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

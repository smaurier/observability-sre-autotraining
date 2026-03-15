// =============================================================================
// Lab 24 — Instrumentation Nuxt / Next.js : Tracing SSR et API Routes
// =============================================================================
// SOLUTION
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertIncludes, summary } =
  createTestRunner('Lab 24 — Instrumentation Nuxt/Next.js');

// =============================================================================
// Exercice 1 : SDK OTel simplifie
// =============================================================================

type SpanKind = 'SERVER' | 'CLIENT' | 'INTERNAL';
type SpanStatus = 'UNSET' | 'OK' | 'ERROR';

interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

class OTelSpan {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  kind: SpanKind;
  status: SpanStatus = 'UNSET';
  attributes: Record<string, string | number | boolean> = {};
  startTime: number;
  endTime: number | null = null;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, string> }> = [];

  constructor(name: string, traceId: string, parentSpanId: string | null, options?: SpanOptions) {
    this.name = name;
    this.traceId = traceId;
    this.parentSpanId = parentSpanId;
    this.kind = options?.kind ?? 'INTERNAL';
    // POURQUOI : UUID tronque a 16 chars pour respecter le format OTel spanId
    // (8 octets = 16 caracteres hex). En production, OTel genere des IDs
    // cryptographiquement aleatoires.
    this.spanId = randomUUID().replace(/-/g, '').substring(0, 16);
    this.startTime = Date.now();
    // POURQUOI : Les attributs initiaux permettent de definir les attributs
    // au moment de la creation du span, comme le fait l'API OTel reelle.
    if (options?.attributes) {
      this.attributes = { ...options.attributes };
    }
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  addEvent(name: string, attributes?: Record<string, string>): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  end(): void {
    // POURQUOI : On ne permet pas de terminer un span deja termine.
    // En OTel reel, appeler end() deux fois est un no-op.
    if (this.endTime === null) {
      this.endTime = Date.now();
    }
  }

  isEnded(): boolean {
    return this.endTime !== null;
  }
}

class Tracer {
  private serviceName: string;
  private spans: OTelSpan[] = [];

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(name: string, options?: SpanOptions): OTelSpan {
    // POURQUOI : Un root span a un nouveau traceId et pas de parent.
    // C'est le point d'entree d'une trace distribuee.
    const traceId = randomUUID().replace(/-/g, '');
    const span = new OTelSpan(name, traceId, null, options);
    this.spans.push(span);
    return span;
  }

  startChildSpan(name: string, parent: OTelSpan, options?: SpanOptions): OTelSpan {
    // POURQUOI : Un child span herite du traceId du parent et reference
    // le spanId du parent. C'est ce qui construit l'arbre de la trace.
    const span = new OTelSpan(name, parent.traceId, parent.spanId, options);
    this.spans.push(span);
    return span;
  }

  async startActiveSpan<T>(name: string, fn: (span: OTelSpan) => T | Promise<T>, options?: SpanOptions): Promise<T> {
    // POURQUOI : startActiveSpan est le pattern le plus courant en OTel.
    // Il cree un span, l'active (context courant), execute la fonction,
    // et garantit que le span est toujours termine, meme en cas d'erreur.
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      span.setStatus('OK');
      return result;
    } catch (error) {
      span.setStatus('ERROR');
      span.addEvent('exception', {
        'exception.message': error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  getSpans(): OTelSpan[] {
    return [...this.spans];
  }
}

// =============================================================================
// Exercice 2 : Middleware SSR tracing
// =============================================================================

interface SSRRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
}

interface SSRResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

function traceSSRRequest(
  tracer: Tracer,
  serviceName: string,
  req: SSRRequest,
  handler: (req: SSRRequest) => SSRResponse
): { response: SSRResponse; span: OTelSpan } {
  // POURQUOI : On extrait le traceparent pour continuer une trace existante
  // (par exemple, initiee par le navigateur via Sentry/OTel browserTracingIntegration).
  // Sans cela, le backend creerait une trace independante, et on perdrait
  // la correlation frontend <-> backend.
  let span: OTelSpan;
  const traceparent = req.headers.traceparent;

  if (traceparent) {
    const parsed = parseTraceparent(traceparent);
    if (parsed) {
      // POURQUOI : On reutilise le traceId du frontend pour que tous les spans
      // (frontend + backend) apparaissent dans la meme trace dans Jaeger/Tempo.
      span = new OTelSpan(
        `${req.method} ${req.path}`,
        parsed.traceId,
        parsed.parentSpanId,
        { kind: 'SERVER' }
      );
    } else {
      span = tracer.startSpan(`${req.method} ${req.path}`, { kind: 'SERVER' });
    }
  } else {
    span = tracer.startSpan(`${req.method} ${req.path}`, { kind: 'SERVER' });
  }

  span.setAttribute('http.method', req.method);
  span.setAttribute('http.url', req.path);
  span.setAttribute('service.name', serviceName);

  // POURQUOI : On execute le handler pour obtenir la reponse.
  // En Nuxt, c'est le pipeline Nitro qui genere le HTML SSR.
  const response = handler(req);

  span.setAttribute('http.status_code', response.statusCode);

  // POURQUOI : Les codes >= 500 indiquent une erreur serveur. On marque
  // le span en ERROR pour qu'il apparaisse en rouge dans Jaeger/Tempo.
  if (response.statusCode >= 500) {
    span.setStatus('ERROR');
  } else {
    span.setStatus('OK');
  }

  span.end();

  // POURQUOI : Le header Server-Timing permet au navigateur de lire
  // les metriques de timing serveur via PerformanceResourceTiming.
  // C'est un standard W3C supporte par tous les navigateurs modernes.
  const duration = (span.endTime ?? Date.now()) - span.startTime;
  response.headers['server-timing'] = `total;dur=${duration}`;

  return { response, span };
}

// =============================================================================
// Exercice 3 : API Route tracing
// =============================================================================

interface APIRouteResult {
  data: unknown;
  trace: {
    rootSpan: OTelSpan;
    dbSpan: OTelSpan;
    cacheSpan: OTelSpan;
  };
}

function traceAPIRoute(tracer: Tracer): APIRouteResult {
  const products = [
    { id: 1, name: 'Widget A', price: 9.99 },
    { id: 2, name: 'Widget B', price: 19.99 },
  ];

  // POURQUOI : Le root span represente la requete HTTP entrante.
  // Kind SERVER indique que ce service recoit une requete (pas qu'il en emet une).
  const rootSpan = tracer.startSpan('GET /api/products', { kind: 'SERVER' });
  rootSpan.setAttribute('http.method', 'GET');
  rootSpan.setAttribute('http.url', '/api/products');
  rootSpan.setAttribute('service.name', 'api');

  // POURQUOI : Le cache lookup est fait AVANT la requete DB.
  // En cas de cache hit, on evite la requete DB (gain de latence).
  // Le span cache est un enfant du root car c'est une sous-operation.
  const cacheSpan = tracer.startChildSpan('cache.lookup', rootSpan, { kind: 'INTERNAL' });
  cacheSpan.setAttribute('cache.system', 'redis');
  cacheSpan.setAttribute('cache.hit', false);
  cacheSpan.addEvent('cache_miss');
  cacheSpan.end();

  // POURQUOI : Le span DB est kind CLIENT car notre service est client
  // de PostgreSQL. Les attributs semantiques db.* sont standardises par OTel.
  const dbSpan = tracer.startChildSpan('db.query', rootSpan, { kind: 'CLIENT' });
  dbSpan.setAttribute('db.system', 'postgresql');
  dbSpan.setAttribute('db.statement', 'SELECT * FROM products LIMIT 10');
  dbSpan.addEvent('query_executed', { rows: '10' });
  dbSpan.end();

  rootSpan.setAttribute('http.status_code', 200);
  rootSpan.setStatus('OK');
  rootSpan.end();

  return {
    data: products,
    trace: { rootSpan, dbSpan, cacheSpan },
  };
}

// =============================================================================
// Exercice 4 : Context propagation
// =============================================================================

function createTraceparent(span: OTelSpan): string {
  // POURQUOI : Le format W3C Trace Context est le standard pour propager
  // le contexte de trace entre services. Le "00" est la version,
  // le "01" signifie "sampled" (la trace est enregistree).
  return `00-${span.traceId}-${span.spanId}-01`;
}

function parseTraceparent(header: string): { traceId: string; parentSpanId: string } | null {
  if (!header) return null;
  const parts = header.split('-');
  // POURQUOI : Le format valide a exactement 4 parties : version-traceId-parentId-flags
  if (parts.length !== 4) return null;
  return { traceId: parts[1], parentSpanId: parts[2] };
}

function simulateFullTrace(tracer: Tracer): OTelSpan[] {
  // POURQUOI : Ce flow simule ce qui se passe quand un utilisateur clique
  // sur un bouton, le navigateur fait un fetch, le serveur SSR traite la
  // requete et interroge la base de donnees. Tous les spans partagent
  // le meme traceId pour la correlation complete.

  // 1. Frontend : le navigateur cree un span pour le fetch
  const frontendSpan = tracer.startSpan('fetch /api/products', { kind: 'CLIENT' });
  frontendSpan.setAttribute('service.name', 'frontend');

  // 2. Propagation : le header traceparent est injecte dans la requete
  const traceparent = createTraceparent(frontendSpan);
  const parsed = parseTraceparent(traceparent)!;

  // 3. Backend : le serveur extrait le traceparent et cree un child span
  const backendSpan = new OTelSpan(
    'GET /api/products',
    parsed.traceId,
    parsed.parentSpanId,
    { kind: 'SERVER' }
  );
  backendSpan.setAttribute('service.name', 'backend');

  // 4. DB : le backend interroge la base de donnees
  const dbSpan = new OTelSpan(
    'db.query',
    backendSpan.traceId,
    backendSpan.spanId,
    { kind: 'CLIENT' }
  );
  dbSpan.setAttribute('db.system', 'postgresql');

  // 5. End dans l'ordre inverse (profondeur d'abord)
  dbSpan.end();
  backendSpan.end();
  frontendSpan.end();

  return [frontendSpan, backendSpan, dbSpan];
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n--- Lab 24 — Instrumentation Nuxt/Next.js ---\n');

  // --- Exercice 1 ---
  await test('Ex1 — OTelSpan creation', () => {
    const span = new OTelSpan('test-op', 'trace-123', null, { kind: 'SERVER' });
    assert(span.spanId.length > 0, 'spanId doit etre genere');
    assertEqual(span.traceId, 'trace-123');
    assertEqual(span.parentSpanId, null);
    assertEqual(span.kind, 'SERVER');
    assertEqual(span.status, 'UNSET');
    assert(span.startTime > 0, 'startTime doit etre defini');
  });

  await test('Ex1 — OTelSpan attributes et events', () => {
    const span = new OTelSpan('test', 'trace-1', null);
    span.setAttribute('http.method', 'GET');
    span.setAttribute('http.status_code', 200);
    assertEqual(span.attributes['http.method'], 'GET');
    assertEqual(span.attributes['http.status_code'], 200);

    span.addEvent('request_received', { source: 'client' });
    assertEqual(span.events.length, 1);
    assertEqual(span.events[0].name, 'request_received');
    assert(span.events[0].timestamp > 0, 'Event doit avoir un timestamp');
  });

  await test('Ex1 — OTelSpan end et isEnded', () => {
    const span = new OTelSpan('test', 'trace-1', null);
    assertEqual(span.isEnded(), false);
    span.end();
    assertEqual(span.isEnded(), true);
    assert(span.endTime !== null, 'endTime doit etre defini');

    const firstEndTime = span.endTime;
    span.end();
    assertEqual(span.endTime, firstEndTime);
  });

  await test('Ex1 — OTelSpan options initiales', () => {
    const span = new OTelSpan('test', 'trace-1', null, {
      kind: 'CLIENT',
      attributes: { 'db.system': 'postgresql' },
    });
    assertEqual(span.kind, 'CLIENT');
    assertEqual(span.attributes['db.system'], 'postgresql');
  });

  await test('Ex1 — Tracer startSpan', () => {
    const tracer = new Tracer('test-service');
    const span = tracer.startSpan('root-op', { kind: 'SERVER' });
    assert(span.traceId.length > 0, 'traceId doit etre genere');
    assertEqual(span.parentSpanId, null);
    assertEqual(span.kind, 'SERVER');
    assertEqual(tracer.getSpans().length, 1);
  });

  await test('Ex1 — Tracer startChildSpan', () => {
    const tracer = new Tracer('test-service');
    const root = tracer.startSpan('root');
    const child = tracer.startChildSpan('child', root, { kind: 'CLIENT' });

    assertEqual(child.traceId, root.traceId);
    assertEqual(child.parentSpanId, root.spanId);
    assertEqual(child.kind, 'CLIENT');
    assertEqual(tracer.getSpans().length, 2);
  });

  await test('Ex1 — Tracer startActiveSpan succes', async () => {
    const tracer = new Tracer('test-service');
    const result = await tracer.startActiveSpan('compute', (span) => {
      span.setAttribute('result', 42);
      return 42;
    });
    assertEqual(result, 42);
    const spans = tracer.getSpans();
    assertEqual(spans.length, 1);
    assertEqual(spans[0].isEnded(), true);
    assertEqual(spans[0].status, 'OK');
  });

  await test('Ex1 — Tracer startActiveSpan erreur', async () => {
    const tracer = new Tracer('test-service');
    let caught = false;
    try {
      await tracer.startActiveSpan('failing', () => {
        throw new Error('boom');
      });
    } catch {
      caught = true;
    }
    assertEqual(caught, true);
    const spans = tracer.getSpans();
    assertEqual(spans[0].status, 'ERROR');
    assertEqual(spans[0].isEnded(), true);
    assert(spans[0].events.some(e => e.name === 'exception'), 'Doit avoir un event exception');
  });

  // --- Exercice 2 ---
  await test('Ex2 — traceSSRRequest basique', () => {
    const tracer = new Tracer('nuxt-app');
    const req: SSRRequest = { method: 'GET', path: '/about', headers: {} };
    const { response, span } = traceSSRRequest(tracer, 'nuxt-app', req, () => ({
      statusCode: 200, body: '<html>About</html>', headers: {},
    }));

    assertEqual(response.statusCode, 200);
    assertEqual(span.attributes['http.method'], 'GET');
    assertEqual(span.attributes['http.url'], '/about');
    assertEqual(span.attributes['http.status_code'], 200);
    assertEqual(span.attributes['service.name'], 'nuxt-app');
    assertEqual(span.status, 'OK');
    assertEqual(span.isEnded(), true);
    assertEqual(span.kind, 'SERVER');
  });

  await test('Ex2 — traceSSRRequest avec erreur 500', () => {
    const tracer = new Tracer('nuxt-app');
    const req: SSRRequest = { method: 'GET', path: '/error', headers: {} };
    const { response, span } = traceSSRRequest(tracer, 'nuxt-app', req, () => ({
      statusCode: 500, body: 'Internal Server Error', headers: {},
    }));

    assertEqual(span.status, 'ERROR');
    assertEqual(span.attributes['http.status_code'], 500);
  });

  await test('Ex2 — traceSSRRequest avec traceparent', () => {
    const tracer = new Tracer('nuxt-app');
    const req: SSRRequest = {
      method: 'GET', path: '/',
      headers: { traceparent: '00-abcdef1234567890abcdef1234567890-1234567890abcdef-01' },
    };
    const { span } = traceSSRRequest(tracer, 'nuxt-app', req, () => ({
      statusCode: 200, body: 'OK', headers: {},
    }));

    assertEqual(span.traceId, 'abcdef1234567890abcdef1234567890');
    assertEqual(span.parentSpanId, '1234567890abcdef');
  });

  await test('Ex2 — traceSSRRequest ajoute server-timing', () => {
    const tracer = new Tracer('nuxt-app');
    const req: SSRRequest = { method: 'GET', path: '/', headers: {} };
    const { response } = traceSSRRequest(tracer, 'nuxt-app', req, () => ({
      statusCode: 200, body: 'OK', headers: {},
    }));

    assert('server-timing' in response.headers, 'server-timing doit etre present');
    assertIncludes(response.headers['server-timing'], 'total;dur=');
  });

  // --- Exercice 3 ---
  await test('Ex3 — traceAPIRoute structure', () => {
    const tracer = new Tracer('api-service');
    const result = traceAPIRoute(tracer);

    assert(result.data !== undefined, 'data doit etre retournee');
    const { rootSpan, dbSpan, cacheSpan } = result.trace;

    assertEqual(rootSpan.name, 'GET /api/products');
    assertEqual(rootSpan.kind, 'SERVER');
    assertEqual(rootSpan.attributes['http.method'], 'GET');
    assertEqual(rootSpan.attributes['http.status_code'], 200);
    assertEqual(rootSpan.status, 'OK');
    assertEqual(rootSpan.isEnded(), true);

    assertEqual(cacheSpan.attributes['cache.system'], 'redis');
    assertEqual(cacheSpan.parentSpanId, rootSpan.spanId);
    assertEqual(cacheSpan.isEnded(), true);
    assert(cacheSpan.events.some(e => e.name === 'cache_miss'), 'Doit avoir event cache_miss');

    assertEqual(dbSpan.attributes['db.system'], 'postgresql');
    assertEqual(dbSpan.parentSpanId, rootSpan.spanId);
    assertEqual(dbSpan.kind, 'CLIENT');
    assertEqual(dbSpan.isEnded(), true);
    assert(dbSpan.events.some(e => e.name === 'query_executed'), 'Doit avoir event query_executed');
  });

  await test('Ex3 — traceAPIRoute meme traceId', () => {
    const tracer = new Tracer('api-service');
    const result = traceAPIRoute(tracer);
    const { rootSpan, dbSpan, cacheSpan } = result.trace;

    assertEqual(dbSpan.traceId, rootSpan.traceId);
    assertEqual(cacheSpan.traceId, rootSpan.traceId);
  });

  // --- Exercice 4 ---
  await test('Ex4 — createTraceparent format', () => {
    const span = new OTelSpan('test', 'aabbccdd11223344', null);
    const tp = createTraceparent(span);
    assert(tp.startsWith('00-aabbccdd11223344-'), 'Doit commencer par 00-traceId-');
    assert(tp.endsWith('-01'), 'Doit finir par -01');
    const parts = tp.split('-');
    assertEqual(parts.length, 4);
  });

  await test('Ex4 — parseTraceparent valide', () => {
    const result = parseTraceparent('00-abcdef12-span5678-01');
    assert(result !== null, 'Doit parser un traceparent valide');
    assertEqual(result!.traceId, 'abcdef12');
    assertEqual(result!.parentSpanId, 'span5678');
  });

  await test('Ex4 — parseTraceparent invalide', () => {
    assertEqual(parseTraceparent('invalid'), null);
    assertEqual(parseTraceparent(''), null);
    assertEqual(parseTraceparent('00-only-two'), null);
  });

  await test('Ex4 — simulateFullTrace', () => {
    const tracer = new Tracer('full-stack');
    const spans = simulateFullTrace(tracer);

    assert(spans.length >= 3, 'Au moins 3 spans (frontend, backend, db)');

    const traceId = spans[0].traceId;
    for (const span of spans) {
      assertEqual(span.traceId, traceId);
    }

    for (const span of spans) {
      assertEqual(span.isEnded(), true);
    }

    const frontendSpan = spans.find(s => s.attributes['service.name'] === 'frontend');
    assert(frontendSpan !== undefined, 'Frontend span doit exister');
    assertEqual(frontendSpan!.parentSpanId, null);

    const backendSpan = spans.find(s => s.attributes['service.name'] === 'backend');
    assert(backendSpan !== undefined, 'Backend span doit exister');
    assertEqual(backendSpan!.parentSpanId, frontendSpan!.spanId);
  });

  summary();
}

main();

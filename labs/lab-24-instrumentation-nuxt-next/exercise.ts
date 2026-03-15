// =============================================================================
// Lab 24 — Instrumentation Nuxt / Next.js : Tracing SSR et API Routes
// =============================================================================
// Objectifs :
//   - Implementer un SDK OTel simplifie (tracer, span, context)
//   - Simuler l'instrumentation de middleware SSR
//   - Tracer les API routes avec attributs semantiques
//   - Propager le trace context entre frontend et backend
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertIncludes, summary } =
  createTestRunner('Lab 24 — Instrumentation Nuxt/Next.js');

// =============================================================================
// Exercice 1 : SDK OTel simplifie — Tracer et Span
// Implementez un tracer qui cree des spans avec contexte parent automatique.
// =============================================================================

type SpanKind = 'SERVER' | 'CLIENT' | 'INTERNAL';
type SpanStatus = 'UNSET' | 'OK' | 'ERROR';

interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
}

// TODO: Implementez la classe OTelSpan
// Proprietes :
//   - spanId: string (UUID tronque a 16 chars)
//   - traceId: string
//   - parentSpanId: string | null
//   - name: string
//   - kind: SpanKind (defaut 'INTERNAL')
//   - status: SpanStatus (defaut 'UNSET')
//   - attributes: Record<string, string | number | boolean>
//   - startTime: number (Date.now())
//   - endTime: number | null
//   - events: Array<{ name: string; timestamp: number; attributes?: Record<string, string> }>
// Methodes :
//   - setAttribute(key, value)
//   - setStatus(status)
//   - addEvent(name, attributes?)
//   - end()
//   - isEnded(): boolean
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
    // TODO: Generez un spanId (UUID tronque)
    this.spanId = '';
    // TODO: Enregistrez startTime
    this.startTime = 0;
    // TODO: Copiez les attributs initiaux si fournis dans options
  }

  setAttribute(key: string, value: string | number | boolean): void {
    // TODO: Ajoutez l'attribut
  }

  setStatus(status: SpanStatus): void {
    // TODO: Mettez a jour le status
  }

  addEvent(name: string, attributes?: Record<string, string>): void {
    // TODO: Ajoutez un evenement avec timestamp
  }

  end(): void {
    // TODO: Enregistrez endTime (seulement si pas deja termine)
  }

  isEnded(): boolean {
    // TODO: Retournez true si endTime est defini
    return false;
  }
}

// TODO: Implementez la classe Tracer
// - Le constructeur prend un serviceName
// - startSpan(name, options?) : cree un root span (nouveau traceId)
// - startChildSpan(name, parent, options?) : cree un child span (meme traceId)
// - startActiveSpan(name, fn, options?) : cree un span, execute fn(span),
//   termine le span automatiquement, et retourne le resultat de fn
//   (gere aussi les erreurs : setStatus('ERROR') + re-throw)
// - getSpans() : retourne tous les spans crees
class Tracer {
  private serviceName: string;
  private spans: OTelSpan[] = [];

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  startSpan(name: string, options?: SpanOptions): OTelSpan {
    // TODO: Creez un root span avec un nouveau traceId
    return {} as OTelSpan;
  }

  startChildSpan(name: string, parent: OTelSpan, options?: SpanOptions): OTelSpan {
    // TODO: Creez un child span avec le meme traceId que le parent
    return {} as OTelSpan;
  }

  async startActiveSpan<T>(name: string, fn: (span: OTelSpan) => T | Promise<T>, options?: SpanOptions): Promise<T> {
    // TODO: Creez un span, executez fn(span), terminez le span, retournez le resultat
    // En cas d'erreur : setStatus('ERROR'), addEvent('exception'), end(), re-throw
    return {} as T;
  }

  getSpans(): OTelSpan[] {
    return [...this.spans];
  }
}

// =============================================================================
// Exercice 2 : Middleware SSR tracing
// Simulez un middleware de tracing pour les requetes SSR.
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

// TODO: Implementez cette fonction
// Simule un middleware de tracing SSR :
// 1. Extrait le traceparent du header si present (format "00-{traceId}-{spanId}-01")
// 2. Cree un span SERVER avec les attributs :
//    - 'http.method', 'http.url', 'http.status_code'
//    - 'service.name' = serviceName
//    - Si traceparent present : utilise le traceId et parentSpanId extraits
// 3. Execute le handler(req) pour obtenir la reponse
// 4. Ajoute 'http.status_code' au span
// 5. Si statusCode >= 500 : setStatus('ERROR')
// 6. Sinon : setStatus('OK')
// 7. End le span
// 8. Ajoute le header 'server-timing' a la reponse : "total;dur={duration}"
// 9. Retourne { response, span }
function traceSSRRequest(
  tracer: Tracer,
  serviceName: string,
  req: SSRRequest,
  handler: (req: SSRRequest) => SSRResponse
): { response: SSRResponse; span: OTelSpan } {
  // TODO: Implementez
  return { response: { statusCode: 200, body: '', headers: {} }, span: {} as OTelSpan };
}

// =============================================================================
// Exercice 3 : API Route tracing
// Tracez une API route avec des sous-spans pour DB et cache.
// =============================================================================

interface APIRouteResult {
  data: unknown;
  trace: {
    rootSpan: OTelSpan;
    dbSpan: OTelSpan;
    cacheSpan: OTelSpan;
  };
}

// TODO: Implementez cette fonction
// Simule le tracing d'une API route /api/products :
// 1. Creez un root span "GET /api/products" (kind: SERVER)
//    Attributs : http.method=GET, http.url=/api/products, service.name=api
// 2. Creez un child span "cache.lookup" (kind: INTERNAL)
//    Attributs : cache.system=redis, cache.hit=false
//    Ajoutez un event "cache_miss"
//    End ce span
// 3. Creez un child span "db.query" (kind: CLIENT)
//    Attributs : db.system=postgresql, db.statement="SELECT * FROM products LIMIT 10"
//    Ajoutez un event "query_executed" avec attributes { rows: "10" }
//    End ce span
// 4. Ajoutez l'attribut http.status_code=200 au root span
// 5. setStatus OK sur le root span et end
// 6. Retournez { data: products, trace: { rootSpan, dbSpan, cacheSpan } }
function traceAPIRoute(tracer: Tracer): APIRouteResult {
  const products = [
    { id: 1, name: 'Widget A', price: 9.99 },
    { id: 2, name: 'Widget B', price: 19.99 },
  ];

  // TODO: Implementez
  return { data: products, trace: {} as APIRouteResult['trace'] };
}

// =============================================================================
// Exercice 4 : Context propagation — Frontend to Backend
// Implementez l'injection et l'extraction du trace context W3C.
// =============================================================================

// TODO: Implementez cette fonction
// Cree un header traceparent au format W3C : "00-{traceId}-{spanId}-01"
function createTraceparent(span: OTelSpan): string {
  // TODO: Implementez
  return '';
}

// TODO: Implementez cette fonction
// Parse un header traceparent et retourne { traceId, parentSpanId } ou null
function parseTraceparent(header: string): { traceId: string; parentSpanId: string } | null {
  // TODO: Validez le format (4 parties separees par -), retournez traceId et parentSpanId
  return null;
}

// TODO: Implementez cette fonction
// Simule un flow complet frontend -> backend :
// 1. Cree un span frontend "fetch /api/products" (kind: CLIENT)
//    avec service.name = "frontend"
// 2. Genere le header traceparent depuis ce span
// 3. Cree un span backend "GET /api/products" (kind: SERVER)
//    avec le meme traceId et le spanId du frontend comme parentSpanId
//    service.name = "backend"
// 4. Cree un child span du backend "db.query" (kind: CLIENT)
// 5. End tous les spans (db, backend, frontend)
// 6. Retourne tous les spans
function simulateFullTrace(tracer: Tracer): OTelSpan[] {
  // TODO: Implementez
  return [];
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n--- Lab 24 — Instrumentation Nuxt/Next.js ---\n');

  // --- Exercice 1 : OTel SDK ---
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

    // Double end ne devrait pas changer endTime
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

  // --- Exercice 2 : Middleware SSR ---
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

  // --- Exercice 3 : API Route tracing ---
  await test('Ex3 — traceAPIRoute structure', () => {
    const tracer = new Tracer('api-service');
    const result = traceAPIRoute(tracer);

    assert(result.data !== undefined, 'data doit etre retournee');
    const { rootSpan, dbSpan, cacheSpan } = result.trace;

    // Root span
    assertEqual(rootSpan.name, 'GET /api/products');
    assertEqual(rootSpan.kind, 'SERVER');
    assertEqual(rootSpan.attributes['http.method'], 'GET');
    assertEqual(rootSpan.attributes['http.status_code'], 200);
    assertEqual(rootSpan.status, 'OK');
    assertEqual(rootSpan.isEnded(), true);

    // Cache span
    assertEqual(cacheSpan.attributes['cache.system'], 'redis');
    assertEqual(cacheSpan.parentSpanId, rootSpan.spanId);
    assertEqual(cacheSpan.isEnded(), true);
    assert(cacheSpan.events.some(e => e.name === 'cache_miss'), 'Doit avoir event cache_miss');

    // DB span
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

  // --- Exercice 4 : Context propagation ---
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

    // Tous les spans doivent partager le meme traceId
    const traceId = spans[0].traceId;
    for (const span of spans) {
      assertEqual(span.traceId, traceId);
    }

    // Tous les spans doivent etre termines
    for (const span of spans) {
      assertEqual(span.isEnded(), true);
    }

    // Le frontend span doit etre le root (pas de parent)
    const frontendSpan = spans.find(s => s.attributes['service.name'] === 'frontend');
    assert(frontendSpan !== undefined, 'Frontend span doit exister');
    assertEqual(frontendSpan!.parentSpanId, null);

    // Le backend span doit avoir le frontend comme parent
    const backendSpan = spans.find(s => s.attributes['service.name'] === 'backend');
    assert(backendSpan !== undefined, 'Backend span doit exister');
    assertEqual(backendSpan!.parentSpanId, frontendSpan!.spanId);
  });

  summary();
}

main();

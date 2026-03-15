// =============================================================================
// Lab 07 — Premiers traces OpenTelemetry
// =============================================================================
// Objectifs :
//   - Implementer Span, Trace, context propagation
//   - Construire une trace multi-services
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertIncludes, summary } =
  createTestRunner('Lab 07 — Premiers traces OpenTelemetry');

// =============================================================================
// Exercice 1 : Classe Span
// Un Span represente une unite de travail dans une trace distribuee.
// =============================================================================

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

// TODO: Implementez la classe Span
// Proprietes :
//   - spanId: string (genere automatiquement, 16 caracteres hex)
//   - traceId: string (passe en parametre)
//   - parentSpanId: string | undefined
//   - operationName: string
//   - startTime: number (Date.now() a la creation)
//   - endTime: number | undefined (defini quand on appelle end())
//   - attributes: Record<string, unknown>
//   - events: SpanEvent[]
//   - status: 'UNSET' | 'OK' | 'ERROR'
// Methodes :
//   - end() : enregistre endTime
//   - setAttribute(key, value) : ajoute un attribut
//   - addEvent(name, attributes?) : ajoute un evenement avec timestamp
//   - setStatus(status) : definit le status
//   - getDuration() : retourne endTime - startTime (ou -1 si pas termine)
class Span {
  spanId: string;
  traceId: string;
  parentSpanId: string | undefined;
  operationName: string;
  startTime: number;
  endTime: number | undefined;
  attributes: Record<string, unknown> = {};
  events: SpanEvent[] = [];
  status: 'UNSET' | 'OK' | 'ERROR' = 'UNSET';

  constructor(traceId: string, operationName: string, parentSpanId?: string) {
    this.traceId = traceId;
    this.operationName = operationName;
    this.parentSpanId = parentSpanId;
    // TODO: Generez un spanId (16 caracteres hex aleatoires)
    this.spanId = '';
    // TODO: Enregistrez le startTime
    this.startTime = 0;
  }

  end(): void {
    // TODO: Enregistrez endTime
  }

  setAttribute(key: string, value: unknown): void {
    // TODO: Ajoutez l'attribut
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    // TODO: Ajoutez un evenement avec le timestamp courant
  }

  setStatus(status: 'UNSET' | 'OK' | 'ERROR'): void {
    // TODO: Definissez le status
  }

  getDuration(): number {
    // TODO: Retournez la duree ou -1 si le span n'est pas termine
    return -1;
  }
}

// =============================================================================
// Exercice 2 : Classe Trace
// Une Trace est un ensemble de Spans relies par traceId et parent-enfant.
// =============================================================================

// TODO: Implementez la classe Trace
// - Le constructeur genere un traceId unique (UUID)
// - startSpan(operationName, parentSpan?) : cree un nouveau Span
//   avec le traceId de la trace et optionnellement un parentSpanId
// - getSpans() : retourne tous les spans
// - getRootSpan() : retourne le span sans parentSpanId
// - getChildSpans(spanId) : retourne les spans enfants d'un span donne
class Trace {
  traceId: string;
  private spans: Span[] = [];

  constructor() {
    // TODO: Generez un traceId unique
    this.traceId = '';
  }

  startSpan(operationName: string, parentSpan?: Span): Span {
    // TODO: Creez un Span avec le traceId et le parentSpanId
    return {} as Span;
  }

  getSpans(): Span[] {
    // TODO: Retournez tous les spans
    return [];
  }

  getRootSpan(): Span | undefined {
    // TODO: Retournez le span sans parentSpanId
    return undefined;
  }

  getChildSpans(spanId: string): Span[] {
    // TODO: Retournez les spans dont le parentSpanId === spanId
    return [];
  }
}

// =============================================================================
// Exercice 3 : Context Propagation
// Injectez et extrayez le contexte de trace dans/depuis des headers HTTP.
// =============================================================================

// Format W3C Trace Context : traceparent = "00-{traceId}-{spanId}-{flags}"

// TODO: Implementez cette fonction
// Injecte le traceId et spanId dans les headers au format W3C traceparent
function injectContext(
  span: Span,
  headers: Record<string, string>
): Record<string, string> {
  // TODO: Ajoutez le header 'traceparent' au format "00-{traceId}-{spanId}-01"
  return headers;
}

// TODO: Implementez cette fonction
// Extrait le traceId et spanId depuis le header traceparent
function extractContext(
  headers: Record<string, string>
): { traceId: string; parentSpanId: string } | undefined {
  // TODO: Parsez le header 'traceparent' et retournez traceId + parentSpanId
  return undefined;
}

// =============================================================================
// Exercice 4 : Attributs et evenements
// Deja teste via la classe Span. Pas de code supplementaire ici.
// =============================================================================

// =============================================================================
// Exercice 5 : Trace multi-services
// Construisez une trace complete simulant API -> Order -> Payment.
// =============================================================================

// TODO: Implementez cette fonction
// 1. Creez une Trace
// 2. Creez un root span "API Gateway" avec des attributs http.method, http.url
// 3. Creez un child span "Order Service" avec des attributs order.id
// 4. Creez un child span "Payment Service" (enfant de Order) avec payment.method
// 5. Terminez les spans dans l'ordre inverse (Payment -> Order -> API)
// 6. Retournez la Trace
function buildMultiServiceTrace(): Trace {
  // TODO: Implementez
  return new Trace();
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 07 — Premiers traces OpenTelemetry\n');

  // --- Exercice 1 ---
  await test('Ex1 — Span creation', () => {
    const span = new Span('trace-123', 'GET /api/users');
    assertEqual(span.traceId, 'trace-123');
    assertEqual(span.operationName, 'GET /api/users');
    assert(span.spanId.length > 0, 'spanId doit etre genere');
    assert(span.startTime > 0, 'startTime doit etre enregistre');
    assertEqual(span.endTime, undefined);
    assertEqual(span.status, 'UNSET');
  });

  await test('Ex1 — Span end et duration', () => {
    const span = new Span('trace-123', 'operation');
    assertEqual(span.getDuration(), -1);
    span.end();
    assert(span.endTime !== undefined, 'endTime doit etre defini');
    assert(span.getDuration() >= 0, 'La duree doit etre >= 0');
  });

  await test('Ex1 — Span setAttribute', () => {
    const span = new Span('trace-123', 'op');
    span.setAttribute('http.method', 'GET');
    span.setAttribute('http.status_code', 200);
    assertEqual(span.attributes['http.method'], 'GET');
    assertEqual(span.attributes['http.status_code'], 200);
  });

  await test('Ex1 — Span addEvent', () => {
    const span = new Span('trace-123', 'op');
    span.addEvent('cache.miss', { key: 'user:42' });
    assertEqual(span.events.length, 1);
    assertEqual(span.events[0].name, 'cache.miss');
    assert(span.events[0].timestamp > 0, 'Event timestamp doit exister');
  });

  await test('Ex1 — Span setStatus', () => {
    const span = new Span('trace-123', 'op');
    span.setStatus('OK');
    assertEqual(span.status, 'OK');
    span.setStatus('ERROR');
    assertEqual(span.status, 'ERROR');
  });

  // --- Exercice 2 ---
  await test('Ex2 — Trace creation', () => {
    const trace = new Trace();
    assert(trace.traceId.length > 0, 'traceId doit etre genere');
  });

  await test('Ex2 — Trace startSpan et relations', () => {
    const trace = new Trace();
    const root = trace.startSpan('API Gateway');
    const child = trace.startSpan('DB Query', root);

    assertEqual(trace.getSpans().length, 2);
    assertEqual(root.traceId, trace.traceId);
    assertEqual(child.traceId, trace.traceId);
    assertEqual(child.parentSpanId, root.spanId);
  });

  await test('Ex2 — Trace getRootSpan et getChildSpans', () => {
    const trace = new Trace();
    const root = trace.startSpan('root');
    const child1 = trace.startSpan('child1', root);
    const child2 = trace.startSpan('child2', root);

    const foundRoot = trace.getRootSpan();
    assertEqual(foundRoot?.spanId, root.spanId);

    const children = trace.getChildSpans(root.spanId);
    assertEqual(children.length, 2);
  });

  // --- Exercice 3 ---
  await test('Ex3 — injectContext ajoute traceparent', () => {
    const span = new Span('abc123', 'test');
    const headers: Record<string, string> = {};
    injectContext(span, headers);

    assert('traceparent' in headers, 'traceparent doit etre injecte');
    const parts = headers.traceparent.split('-');
    assertEqual(parts[0], '00');
    assertEqual(parts[1], 'abc123');
    assertEqual(parts[2], span.spanId);
    assertEqual(parts[3], '01');
  });

  await test('Ex3 — extractContext lit traceparent', () => {
    const headers = { traceparent: '00-trace999-span456-01' };
    const ctx = extractContext(headers);
    assert(ctx !== undefined, 'Le contexte doit etre extrait');
    assertEqual(ctx!.traceId, 'trace999');
    assertEqual(ctx!.parentSpanId, 'span456');
  });

  await test('Ex3 — extractContext sans header retourne undefined', () => {
    const ctx = extractContext({});
    assertEqual(ctx, undefined);
  });

  // --- Exercice 4 ---
  await test('Ex4 — Attributs et evenements via Span', () => {
    const span = new Span('t1', 'db.query');
    span.setAttribute('db.system', 'postgresql');
    span.setAttribute('db.statement', 'SELECT * FROM users');
    span.addEvent('query.start');
    span.addEvent('query.end', { rows: 42 });

    assertEqual(span.attributes['db.system'], 'postgresql');
    assertEqual(span.events.length, 2);
    assertEqual(span.events[1].attributes?.rows, 42);
  });

  // --- Exercice 5 ---
  await test('Ex5 — buildMultiServiceTrace', () => {
    const trace = buildMultiServiceTrace();
    const spans = trace.getSpans();

    assert(spans.length >= 3, 'Au moins 3 spans attendus');

    const root = trace.getRootSpan();
    assert(root !== undefined, 'Root span doit exister');
    assertIncludes(root!.operationName.toLowerCase(), 'api');

    // Tous les spans doivent avoir le meme traceId
    for (const span of spans) {
      assertEqual(span.traceId, trace.traceId);
    }

    // Tous les spans doivent etre termines
    for (const span of spans) {
      assert(span.endTime !== undefined, `Span "${span.operationName}" doit etre termine`);
    }

    // Verifier la hierarchie
    const rootChildren = trace.getChildSpans(root!.spanId);
    assert(rootChildren.length >= 1, 'Le root doit avoir au moins 1 enfant');
  });

  summary();
}

main();

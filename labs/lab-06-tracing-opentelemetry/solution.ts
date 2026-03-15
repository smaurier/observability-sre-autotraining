import { createTestRunner } from '../test-utils.ts';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertDeepEqual, summary } = createTestRunner('Lab 07 — Premiers traces OTel');

// ---------------------------------------------------------------------------
// Exercise 1: Span class
// ---------------------------------------------------------------------------
class Span {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  operationName: string;
  startTime: number;
  endTime: number | null = null;
  attributes: Map<string, string | number | boolean> = new Map();
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, string> }> = [];
  status: 'OK' | 'ERROR' | 'UNSET' = 'UNSET';

  constructor(operationName: string, traceId?: string, parentSpanId?: string | null) {
    this.spanId = randomUUID().slice(0, 16);
    this.traceId = traceId || randomUUID().replace(/-/g, '');
    this.parentSpanId = parentSpanId || null;
    this.operationName = operationName;
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  setAttribute(key: string, value: string | number | boolean) {
    this.attributes.set(key, value);
  }

  addEvent(name: string, attributes?: Record<string, string>) {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  setStatus(status: 'OK' | 'ERROR' | 'UNSET') {
    this.status = status;
  }

  get duration(): number {
    return (this.endTime || Date.now()) - this.startTime;
  }
}

// ---------------------------------------------------------------------------
// Exercise 2: Trace class
// ---------------------------------------------------------------------------
class Trace {
  traceId: string;
  spans: Span[] = [];

  constructor() {
    this.traceId = randomUUID().replace(/-/g, '');
  }

  createRootSpan(operationName: string): Span {
    const span = new Span(operationName, this.traceId, null);
    this.spans.push(span);
    return span;
  }

  createChildSpan(parentSpan: Span, operationName: string): Span {
    const span = new Span(operationName, this.traceId, parentSpan.spanId);
    this.spans.push(span);
    return span;
  }

  getSpansByParent(parentSpanId: string | null): Span[] {
    return this.spans.filter(s => s.parentSpanId === parentSpanId);
  }
}

// ---------------------------------------------------------------------------
// Exercise 3: Context propagation (W3C Trace Context)
// ---------------------------------------------------------------------------
function injectContext(span: Span): Record<string, string> {
  return { traceparent: `00-${span.traceId}-${span.spanId}-01` };
}

function extractContext(headers: Record<string, string>): { traceId: string; parentSpanId: string } | null {
  const tp = headers['traceparent'];
  if (!tp) return null;
  const parts = tp.split('-');
  if (parts.length !== 4) return null;
  return { traceId: parts[1], parentSpanId: parts[2] };
}

// ---------------------------------------------------------------------------
// Exercise 4 & 5: Build a complete multi-service trace
// ---------------------------------------------------------------------------
function buildMultiServiceTrace(): Trace {
  const trace = new Trace();

  // API Gateway span (root)
  const gateway = trace.createRootSpan('HTTP GET /api/orders');
  gateway.setAttribute('http.method', 'GET');
  gateway.setAttribute('http.url', '/api/orders');
  gateway.setAttribute('service.name', 'api-gateway');

  // Order Service span (child of gateway)
  const orderSpan = trace.createChildSpan(gateway, 'OrderService.getAll');
  orderSpan.setAttribute('service.name', 'order-service');
  orderSpan.addEvent('cache_miss');

  // Database span (child of order)
  const dbSpan = trace.createChildSpan(orderSpan, 'SELECT * FROM orders');
  dbSpan.setAttribute('db.system', 'postgresql');
  dbSpan.setAttribute('db.statement', 'SELECT * FROM orders LIMIT 100');
  dbSpan.setStatus('OK');
  dbSpan.end();

  // Payment Service span (child of order)
  const paymentSpan = trace.createChildSpan(orderSpan, 'PaymentService.validate');
  paymentSpan.setAttribute('service.name', 'payment-service');
  paymentSpan.setStatus('OK');
  paymentSpan.end();

  orderSpan.setStatus('OK');
  orderSpan.end();

  gateway.setStatus('OK');
  gateway.end();

  return trace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 07 — Premiers traces OTel ---\n');

  await test('Ex1 — Span creation', () => {
    const span = new Span('test-op');
    assert(span.spanId.length > 0, 'spanId should exist');
    assert(span.traceId.length > 0, 'traceId should exist');
    assertEqual(span.operationName, 'test-op');
    assertEqual(span.parentSpanId, null);
    assert(span.startTime > 0, 'startTime should be set');
  });

  await test('Ex1 — Span attributes and events', () => {
    const span = new Span('test');
    span.setAttribute('http.method', 'GET');
    span.addEvent('request_received');
    assertEqual(span.attributes.get('http.method'), 'GET');
    assertEqual(span.events.length, 1);
    assertEqual(span.events[0].name, 'request_received');
  });

  await test('Ex1 — Span end() and duration', () => {
    const span = new Span('test');
    span.end();
    assert(span.endTime !== null, 'endTime should be set after end()');
    assert(span.duration >= 0, 'duration should be >= 0');
  });

  await test('Ex1 — Span status', () => {
    const span = new Span('test');
    assertEqual(span.status, 'UNSET');
    span.setStatus('OK');
    assertEqual(span.status, 'OK');
    span.setStatus('ERROR');
    assertEqual(span.status, 'ERROR');
  });

  await test('Ex2 — Trace with parent-child', () => {
    const trace = new Trace();
    const root = trace.createRootSpan('root');
    const child = trace.createChildSpan(root, 'child');
    assertEqual(trace.spans.length, 2);
    assertEqual(child.parentSpanId, root.spanId);
    assertEqual(child.traceId, trace.traceId);
    assertEqual(root.traceId, trace.traceId);
  });

  await test('Ex2 — getSpansByParent', () => {
    const trace = new Trace();
    const root = trace.createRootSpan('root');
    trace.createChildSpan(root, 'child-a');
    trace.createChildSpan(root, 'child-b');
    const children = trace.getSpansByParent(root.spanId);
    assertEqual(children.length, 2);
    const roots = trace.getSpansByParent(null);
    assertEqual(roots.length, 1);
  });

  await test('Ex3 — Context injection', () => {
    const span = new Span('test', 'aabbccdd11223344aabbccdd11223344');
    const headers = injectContext(span);
    assert(headers.traceparent.startsWith('00-aabbccdd11223344aabbccdd11223344-'), 'traceparent format');
    assert(headers.traceparent.endsWith('-01'), 'traceparent flags');
  });

  await test('Ex3 — Context extraction', () => {
    const ctx = extractContext({ traceparent: '00-aabb1122-span1234-01' });
    assert(ctx !== null, 'should extract context');
    assertEqual(ctx!.traceId, 'aabb1122');
    assertEqual(ctx!.parentSpanId, 'span1234');
  });

  await test('Ex3 — Missing traceparent', () => {
    const ctx = extractContext({});
    assertEqual(ctx, null);
  });

  await test('Ex3 — Invalid traceparent', () => {
    const ctx = extractContext({ traceparent: 'invalid' });
    assertEqual(ctx, null);
  });

  await test('Ex5 — Multi-service trace', () => {
    const trace = buildMultiServiceTrace();
    assert(trace.spans.length >= 4, 'should have at least 4 spans');
    const roots = trace.getSpansByParent(null);
    assertEqual(roots.length, 1);
    assertEqual(roots[0].operationName, 'HTTP GET /api/orders');
  });

  await test('Ex5 — All spans share same traceId', () => {
    const trace = buildMultiServiceTrace();
    for (const span of trace.spans) {
      assertEqual(span.traceId, trace.traceId);
    }
  });

  await test('Ex5 — All spans are ended', () => {
    const trace = buildMultiServiceTrace();
    for (const span of trace.spans) {
      assert(span.endTime !== null, `Span "${span.operationName}" should be ended`);
    }
  });

  summary();
}

main();

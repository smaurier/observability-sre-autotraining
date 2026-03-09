// =============================================================================
// Lab 03 — Correlation IDs et contexte (SOLUTION)
// =============================================================================
// Ce fichier contient les solutions completes de tous les exercices.
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertIncludes, summary } =
  createTestRunner('Lab 03 — Correlation IDs et contexte');

// =============================================================================
// Exercice 1 : generateRequestId
// =============================================================================

function generateRequestId(): string {
  return randomUUID();
}

// =============================================================================
// Exercice 2 : Context store avec AsyncLocalStorage
// =============================================================================

interface RequestContext {
  requestId: string;
  startTime: number;
  [key: string]: unknown;
}

const contextStore = new AsyncLocalStorage<RequestContext>();

function runWithContext(context: RequestContext, fn: () => Promise<void> | void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    contextStore.run(context, async () => {
      try {
        await fn();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

function getCurrentContext(): RequestContext | undefined {
  return contextStore.getStore();
}

// =============================================================================
// Exercice 3 : Middleware de correlation
// =============================================================================

interface FakeRequest {
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface FakeResponse {
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
}

async function correlationMiddleware(
  req: FakeRequest,
  res: FakeResponse,
  next: () => Promise<void>
): Promise<void> {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('x-request-id', requestId);

  const context: RequestContext = {
    requestId,
    startTime: Date.now(),
  };

  await runWithContext(context, next);
}

// =============================================================================
// Exercice 4 : Logging avec requestId automatique
// =============================================================================

interface CorrelatedLog {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

const logBuffer: CorrelatedLog[] = [];

function correlatedLog(level: string, message: string, extra?: Record<string, unknown>): void {
  const ctx = getCurrentContext();
  const log: CorrelatedLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...extra,
  };

  if (ctx) {
    log.requestId = ctx.requestId;
  }

  logBuffer.push(log);
}

// =============================================================================
// Exercice 5 : Correlation multi-services
// =============================================================================

interface ServiceLog {
  service: string;
  requestId: string;
  action: string;
}

const serviceTraces: ServiceLog[] = [];

async function apiGateway(): Promise<void> {
  const ctx = getCurrentContext()!;
  serviceTraces.push({
    service: 'api-gateway',
    requestId: ctx.requestId,
    action: 'received request',
  });
  await orderService();
}

async function orderService(): Promise<void> {
  const ctx = getCurrentContext()!;
  serviceTraces.push({
    service: 'order-service',
    requestId: ctx.requestId,
    action: 'processing order',
  });
  await paymentService();
}

async function paymentService(): Promise<void> {
  const ctx = getCurrentContext()!;
  serviceTraces.push({
    service: 'payment-service',
    requestId: ctx.requestId,
    action: 'processing payment',
  });
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 03 — Correlation IDs et contexte\n');

  // --- Exercice 1 ---
  await test('Ex1 — generateRequestId retourne un UUID valide', () => {
    const id = generateRequestId();
    assert(typeof id === 'string', 'Doit etre une string');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert(uuidRegex.test(id), `Format UUID invalide: ${id}`);
  });

  await test('Ex1 — generateRequestId retourne des IDs uniques', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    assertEqual(ids.size, 100);
  });

  // --- Exercice 2 ---
  await test('Ex2 — contextStore est une instance AsyncLocalStorage', () => {
    assert(contextStore instanceof AsyncLocalStorage, 'contextStore doit etre AsyncLocalStorage');
  });

  await test('Ex2 — runWithContext + getCurrentContext', async () => {
    let capturedCtx: RequestContext | undefined;
    await runWithContext(
      { requestId: 'test-123', startTime: Date.now() },
      () => {
        capturedCtx = getCurrentContext();
      }
    );
    assert(capturedCtx !== undefined, 'Le contexte doit etre accessible');
    assertEqual(capturedCtx!.requestId, 'test-123');
  });

  await test('Ex2 — contexte isole entre les appels', async () => {
    let ctx1: string | undefined;
    let ctx2: string | undefined;

    await runWithContext({ requestId: 'req-A', startTime: Date.now() }, () => {
      ctx1 = getCurrentContext()?.requestId;
    });

    await runWithContext({ requestId: 'req-B', startTime: Date.now() }, () => {
      ctx2 = getCurrentContext()?.requestId;
    });

    assertEqual(ctx1, 'req-A');
    assertEqual(ctx2, 'req-B');
  });

  // --- Exercice 3 ---
  await test('Ex3 — middleware genere un requestId', async () => {
    const req: FakeRequest = { headers: {}, method: 'GET', url: '/api/test' };
    const res: FakeResponse = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    let insideRequestId: string | undefined;

    await correlationMiddleware(req, res, async () => {
      insideRequestId = getCurrentContext()?.requestId;
    });

    assert(insideRequestId !== undefined, 'requestId doit etre dans le contexte');
    assert(insideRequestId!.length > 0, 'requestId ne doit pas etre vide');
    assertEqual(res.headers['x-request-id'], insideRequestId!);
  });

  await test('Ex3 — middleware reutilise le requestId existant', async () => {
    const req: FakeRequest = {
      headers: { 'x-request-id': 'incoming-123' },
      method: 'GET',
      url: '/api/test',
    };
    const res: FakeResponse = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
    let insideRequestId: string | undefined;

    await correlationMiddleware(req, res, async () => {
      insideRequestId = getCurrentContext()?.requestId;
    });

    assertEqual(insideRequestId, 'incoming-123');
  });

  // --- Exercice 4 ---
  await test('Ex4 — correlatedLog ajoute le requestId', async () => {
    logBuffer.length = 0;
    await runWithContext({ requestId: 'log-test-456', startTime: Date.now() }, () => {
      correlatedLog('info', 'Test message', { extra: 'data' });
    });

    assertEqual(logBuffer.length, 1);
    assertEqual(logBuffer[0].requestId, 'log-test-456');
    assertEqual(logBuffer[0].message, 'Test message');
    assertEqual(logBuffer[0].level, 'info');
  });

  await test('Ex4 — correlatedLog sans contexte', () => {
    logBuffer.length = 0;
    correlatedLog('warn', 'No context');

    assertEqual(logBuffer.length, 1);
    assertEqual(logBuffer[0].requestId, undefined);
    assertEqual(logBuffer[0].message, 'No context');
  });

  // --- Exercice 5 ---
  await test('Ex5 — correlation multi-services', async () => {
    serviceTraces.length = 0;
    const requestId = 'multi-svc-789';

    await runWithContext({ requestId, startTime: Date.now() }, async () => {
      await apiGateway();
    });

    assertEqual(serviceTraces.length, 3);
    for (const trace of serviceTraces) {
      assertEqual(trace.requestId, requestId);
    }
    assertEqual(serviceTraces[0].service, 'api-gateway');
    assertEqual(serviceTraces[1].service, 'order-service');
    assertEqual(serviceTraces[2].service, 'payment-service');
  });

  summary();
}

main();

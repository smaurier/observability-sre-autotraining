// =============================================================================
// Lab 03 — Correlation IDs et contexte
// =============================================================================
// Objectifs :
//   - Generer des request IDs uniques
//   - Propager du contexte avec AsyncLocalStorage
//   - Maintenir la correlation a travers les appels asynchrones
// =============================================================================

import { createTestRunner } from '../test-utils.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const { test, assert, assertEqual, assertIncludes, summary } =
  createTestRunner('Lab 03 — Correlation IDs et contexte');

// =============================================================================
// Exercice 1 : generateRequestId
// Generez un identifiant unique pour chaque requete.
// =============================================================================

// TODO: Implementez cette fonction
// Elle doit retourner un UUID v4 en utilisant crypto.randomUUID()
// Format attendu : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
function generateRequestId(): string {
  // TODO: Utilisez randomUUID() (importe de node:crypto)
  return '';
}

// =============================================================================
// Exercice 2 : Context store avec AsyncLocalStorage
// Creez un store de contexte qui permet de stocker et recuperer
// un contexte a travers des appels asynchrones.
// =============================================================================

interface RequestContext {
  requestId: string;
  startTime: number;
  [key: string]: unknown;
}

// TODO: Creez une instance d'AsyncLocalStorage typee
// const contextStore = ???
const contextStore: AsyncLocalStorage<RequestContext> = undefined as any;

// TODO: Implementez cette fonction
// Elle execute une callback dans un contexte AsyncLocalStorage
// avec le RequestContext donne
function runWithContext(context: RequestContext, fn: () => Promise<void> | void): Promise<void> {
  // TODO: Utilisez contextStore.run(context, fn)
  return Promise.resolve();
}

// TODO: Implementez cette fonction
// Elle retourne le contexte courant ou undefined si aucun contexte n'est actif
function getCurrentContext(): RequestContext | undefined {
  // TODO: Utilisez contextStore.getStore()
  return undefined;
}

// =============================================================================
// Exercice 3 : Middleware de correlation
// Creez un middleware qui genere un requestId et l'injecte dans le contexte.
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

// TODO: Implementez ce middleware
// 1. Verifiez si le header 'x-request-id' existe dans la requete
// 2. Si oui, utilisez-le ; sinon, generez un nouveau requestId
// 3. Ajoutez le requestId dans les headers de la reponse ('x-request-id')
// 4. Executez la callback next() dans un contexte contenant le requestId
async function correlationMiddleware(
  req: FakeRequest,
  res: FakeResponse,
  next: () => Promise<void>
): Promise<void> {
  // TODO: Implementez
}

// =============================================================================
// Exercice 4 : Logging avec requestId automatique
// Creez une fonction de log qui inclut automatiquement le requestId du contexte.
// =============================================================================

interface CorrelatedLog {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  [key: string]: unknown;
}

const logBuffer: CorrelatedLog[] = [];

// TODO: Implementez cette fonction
// Elle doit :
// 1. Recuperer le contexte courant via getCurrentContext()
// 2. Si un contexte existe, ajouter le requestId au log
// 3. Stocker le log dans logBuffer
function correlatedLog(level: string, message: string, extra?: Record<string, unknown>): void {
  // TODO: Implementez
}

// =============================================================================
// Exercice 5 : Correlation multi-services
// Simulez le passage d'une requete a travers plusieurs services.
// Chaque service doit propager le meme requestId.
// =============================================================================

interface ServiceLog {
  service: string;
  requestId: string;
  action: string;
}

const serviceTraces: ServiceLog[] = [];

// TODO: Implementez ces fonctions simulant 3 services
// Chaque service doit :
// 1. Recuperer le requestId du contexte courant
// 2. Ajouter un ServiceLog dans serviceTraces
// 3. Appeler le service suivant dans la chaine

async function apiGateway(): Promise<void> {
  // TODO: Log "received request", puis appeler orderService()
}

async function orderService(): Promise<void> {
  // TODO: Log "processing order", puis appeler paymentService()
}

async function paymentService(): Promise<void> {
  // TODO: Log "processing payment"
}

// =============================================================================
// Tests — Ne modifiez pas cette section
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
    // Tous les services doivent avoir le meme requestId
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

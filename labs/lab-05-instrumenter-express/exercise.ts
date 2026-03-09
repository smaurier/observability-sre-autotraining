// =============================================================================
// Lab 05 — Instrumenter une API Express
// =============================================================================
// Objectifs :
//   - Instrumenter une API avec des metriques (Counter, Gauge, Histogram)
//   - Generer une sortie au format Prometheus
//   - Simuler des objets Express request/response
// =============================================================================

import { createTestRunner, assertPrometheusMetric } from '../test-utils.ts';
const { test, assert, assertEqual, assertIncludes, assertGreaterThan, summary } =
  createTestRunner('Lab 05 — Instrumenter une API Express');

// =============================================================================
// Types simules pour Express
// =============================================================================

interface FakeRequest {
  method: string;
  path: string;
  startTime?: number;
}

interface FakeResponse {
  statusCode: number;
  end: () => void;
}

type NextFunction = () => void;

// =============================================================================
// Exercice 1 : Middleware compteur de requetes
// Comptez chaque requete par methode, route et code de status.
// =============================================================================

interface RequestCount {
  method: string;
  path: string;
  status: number;
  count: number;
}

const requestCounts: Map<string, RequestCount> = new Map();

// TODO: Implementez ce middleware
// 1. Apres que next() a ete appelee (la response est prete) :
//    - Creez une cle unique : `${method}|${path}|${status}`
//    - Incrementez le compteur pour cette cle dans requestCounts
// 2. Appelez next() pour passer au handler suivant
function metricsCountMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  // TODO: Implementez
}

// =============================================================================
// Exercice 2 : Middleware duree de requete
// Mesurez la duree de chaque requete en millisecondes.
// =============================================================================

interface DurationRecord {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

const durationRecords: DurationRecord[] = [];

// TODO: Implementez ce middleware
// 1. Enregistrez le temps de debut (Date.now() ou performance.now())
// 2. Appelez next()
// 3. Calculez la duree et ajoutez un DurationRecord dans durationRecords
function metricsDurationMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  // TODO: Implementez
}

// =============================================================================
// Exercice 3 : Requetes en cours (in-flight)
// Suivez le nombre de requetes actuellement en traitement.
// =============================================================================

let inFlightGauge = 0;
let maxInFlight = 0;

// TODO: Implementez ce middleware
// 1. Incrementez inFlightGauge au debut
// 2. Mettez a jour maxInFlight si necessaire
// 3. Appelez next()
// 4. Decrementez inFlightGauge apres
function inFlightMiddleware(req: FakeRequest, res: FakeResponse, next: NextFunction): void {
  // TODO: Implementez
}

// =============================================================================
// Exercice 4 : Format Prometheus /metrics
// Generez le texte de sortie au format Prometheus exposition.
// =============================================================================

// TODO: Implementez cette fonction
// Le format Prometheus pour un counter est :
// # HELP http_requests_total Total HTTP requests
// # TYPE http_requests_total counter
// http_requests_total{method="GET",path="/api/users",status="200"} 42
//
// Pour chaque entree de requestCounts, generez une ligne au format ci-dessus
function generatePrometheusMetrics(): string {
  // TODO: Generez le texte au format Prometheus a partir de requestCounts
  return '';
}

// =============================================================================
// Exercice 5 : Taux d'erreur par route
// Calculez le taux d'erreur (status >= 400) pour chaque route.
// =============================================================================

interface RouteErrorRate {
  path: string;
  totalRequests: number;
  errorRequests: number;
  errorRate: number;
}

// TODO: Implementez cette fonction
// A partir de requestCounts, calculez pour chaque path unique :
// - totalRequests : somme de tous les counts pour ce path
// - errorRequests : somme des counts pour status >= 400
// - errorRate : errorRequests / totalRequests
function calculateErrorRatesByRoute(): RouteErrorRate[] {
  // TODO: Aggregez par path et calculez les taux d'erreur
  return [];
}

// =============================================================================
// Utilitaire de simulation
// =============================================================================

function simulateRequest(
  method: string,
  path: string,
  statusCode: number,
  handler?: () => void
): { req: FakeRequest; res: FakeResponse } {
  const req: FakeRequest = { method, path };
  const res: FakeResponse = {
    statusCode,
    end() {},
  };

  const next = () => {
    if (handler) handler();
  };

  metricsCountMiddleware(req, res, () => {
    metricsDurationMiddleware(req, res, () => {
      inFlightMiddleware(req, res, next);
    });
  });

  return { req, res };
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 05 — Instrumenter une API Express\n');

  // Reset state
  requestCounts.clear();
  durationRecords.length = 0;
  inFlightGauge = 0;
  maxInFlight = 0;

  // --- Exercice 1 ---
  await test('Ex1 — middleware compte les requetes', () => {
    requestCounts.clear();
    const req: FakeRequest = { method: 'GET', path: '/api/users' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    metricsCountMiddleware(req, res, () => {});
    metricsCountMiddleware(req, res, () => {});

    const key = 'GET|/api/users|200';
    assert(requestCounts.has(key), `Cle ${key} doit exister`);
    assertEqual(requestCounts.get(key)!.count, 2);
  });

  await test('Ex1 — middleware distingue les routes', () => {
    requestCounts.clear();
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 200, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'POST', path: '/api/orders' },
      { statusCode: 201, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 404, end() {} },
      () => {}
    );

    assertEqual(requestCounts.size, 3);
  });

  // --- Exercice 2 ---
  await test('Ex2 — middleware enregistre les durees', () => {
    durationRecords.length = 0;
    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    metricsDurationMiddleware(req, res, () => {
      // Simule un traitement tres rapide
    });

    assertEqual(durationRecords.length, 1);
    assertEqual(durationRecords[0].method, 'GET');
    assertEqual(durationRecords[0].path, '/api/test');
    assert(durationRecords[0].durationMs >= 0, 'La duree doit etre >= 0');
  });

  // --- Exercice 3 ---
  await test('Ex3 — in-flight gauge monte et descend', () => {
    inFlightGauge = 0;
    maxInFlight = 0;
    let capturedInFlight = 0;

    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    inFlightMiddleware(req, res, () => {
      capturedInFlight = inFlightGauge;
    });

    assertEqual(capturedInFlight, 1, 'In-flight doit etre 1 pendant le traitement');
    assertEqual(inFlightGauge, 0, 'In-flight doit revenir a 0 apres');
  });

  await test('Ex3 — maxInFlight est enregistre', () => {
    inFlightGauge = 0;
    maxInFlight = 0;

    const req: FakeRequest = { method: 'GET', path: '/api/test' };
    const res: FakeResponse = { statusCode: 200, end() {} };

    inFlightMiddleware(req, res, () => {});

    assertGreaterThan(maxInFlight, 0);
  });

  // --- Exercice 4 ---
  await test('Ex4 — generatePrometheusMetrics format correct', () => {
    requestCounts.clear();
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 200, end() {} },
      () => {}
    );
    metricsCountMiddleware(
      { method: 'POST', path: '/api/orders' },
      { statusCode: 201, end() {} },
      () => {}
    );

    const output = generatePrometheusMetrics();
    assertIncludes(output, 'http_requests_total');
    assertIncludes(output, 'method="GET"');
    assertIncludes(output, 'path="/api/users"');
    assertIncludes(output, 'status="200"');
    assertPrometheusMetric(output, 'http_requests_total', {
      method: 'GET',
      path: '/api/users',
      status: '200',
    });
  });

  // --- Exercice 5 ---
  await test('Ex5 — calculateErrorRatesByRoute', () => {
    requestCounts.clear();
    // 3 requetes OK sur /api/users
    for (let i = 0; i < 3; i++) {
      metricsCountMiddleware(
        { method: 'GET', path: '/api/users' },
        { statusCode: 200, end() {} },
        () => {}
      );
    }
    // 1 erreur sur /api/users
    metricsCountMiddleware(
      { method: 'GET', path: '/api/users' },
      { statusCode: 500, end() {} },
      () => {}
    );
    // 2 requetes sur /api/orders, toutes OK
    for (let i = 0; i < 2; i++) {
      metricsCountMiddleware(
        { method: 'POST', path: '/api/orders' },
        { statusCode: 201, end() {} },
        () => {}
      );
    }

    const rates = calculateErrorRatesByRoute();
    const usersRate = rates.find((r) => r.path === '/api/users');
    const ordersRate = rates.find((r) => r.path === '/api/orders');

    assert(usersRate !== undefined, '/api/users doit etre present');
    assertEqual(usersRate!.totalRequests, 4);
    assertEqual(usersRate!.errorRequests, 1);
    assertEqual(usersRate!.errorRate, 0.25);

    assert(ordersRate !== undefined, '/api/orders doit etre present');
    assertEqual(ordersRate!.totalRequests, 2);
    assertEqual(ordersRate!.errorRate, 0);
  });

  summary();
}

main();

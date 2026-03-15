import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertGreaterThan, summary } =
  createTestRunner('Lab 18 — Production Readiness Review');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CheckCategory = 'observability' | 'reliability' | 'security' | 'performance' | 'operations';
type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

interface PRRCheckItem {
  id: string;
  category: CheckCategory;
  name: string;
  description: string;
  required: boolean;
}

interface PRRChecklist {
  serviceName: string;
  items: PRRCheckItem[];
}

interface PRREvaluation {
  checkId: string;
  status: CheckStatus;
  notes: string;
}

interface PRRReport {
  serviceName: string;
  evaluatedAt: number;
  evaluations: PRREvaluation[];
  passCount: number;
  failCount: number;
  warnCount: number;
  skipCount: number;
  requiredPassRate: number; // % of required items that pass
}

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details?: string;
}

interface ServiceNode {
  name: string;
  dependencies: string[];
}

interface DependencyMap {
  services: ServiceNode[];
}

// ---------------------------------------------------------------------------
// Exercise 1: Define PRR checklist type
// Create a checklist with items across all categories.
// ---------------------------------------------------------------------------
function createDefaultChecklist(serviceName: string): PRRChecklist {
  // TODO: Return a PRRChecklist with at least 10 items covering all 5 categories:
  //   observability: structured logging, metrics, tracing, dashboards, alerts
  //   reliability: SLOs defined, error budgets, graceful degradation
  //   security: auth, secrets management
  //   performance: load tested, resource limits
  //   operations: runbook, on-call rotation
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: Evaluate a service against the checklist
// ---------------------------------------------------------------------------
function evaluateService(
  checklist: PRRChecklist,
  evaluations: PRREvaluation[]
): PRRReport {
  // TODO: Count pass/fail/warn/skip from evaluations
  // TODO: Calculate requiredPassRate = (required items that pass) / (total required items) * 100
  // TODO: Return a PRRReport
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 3: Health check functions
// ---------------------------------------------------------------------------
interface HealthCheckConfig {
  name: string;
  check: () => Promise<{ ok: boolean; latencyMs: number; details?: string }>;
  degradedThresholdMs: number;
}

async function runHealthChecks(checks: HealthCheckConfig[]): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheckResult[];
}> {
  // TODO: Run each check in parallel (Promise.allSettled)
  // TODO: For each check:
  //   - If check.ok is false => unhealthy
  //   - If latencyMs > degradedThresholdMs => degraded
  //   - Otherwise => healthy
  // TODO: Overall status:
  //   - If any check is 'unhealthy' => overall 'unhealthy'
  //   - Else if any check is 'degraded' => overall 'degraded'
  //   - Else => overall 'healthy'
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 4: Dependency map and SPOF detection
// ---------------------------------------------------------------------------
function buildDependencyMap(services: ServiceNode[]): DependencyMap {
  // TODO: Return a DependencyMap from the given service nodes
  throw new Error('Not implemented');
}

function findSinglePointsOfFailure(depMap: DependencyMap): string[] {
  // TODO: A service is a SPOF if:
  //   - More than one other service depends on it
  //   - AND it has no redundancy (only appears once as a dependency target)
  // Simplified: return services that are depended upon by 2+ other services
  throw new Error('Not implemented');
}

function findCriticalPath(depMap: DependencyMap, from: string, to: string): string[] | null {
  // TODO: BFS to find path from `from` to `to` through dependencies
  // TODO: Return array of service names in path order, or null if no path
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 5: Production readiness score
// ---------------------------------------------------------------------------
interface ReadinessScore {
  overall: number; // 0-100
  categories: Record<CheckCategory, number>; // 0-100 per category
  blockers: string[]; // names of required items that failed
  recommendation: 'ready' | 'conditional' | 'not-ready';
}

function calculateReadinessScore(report: PRRReport, checklist: PRRChecklist): ReadinessScore {
  // TODO: Overall score = passCount / (total - skipCount) * 100
  // TODO: Per-category score = (passes in category) / (items in category) * 100
  // TODO: Blockers = required items that are 'fail'
  // TODO: Recommendation:
  //   - 'ready' if overall >= 90 and no blockers
  //   - 'conditional' if overall >= 70 and <= 1 blocker
  //   - 'not-ready' otherwise
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeSampleEvaluations(checklist: PRRChecklist): PRREvaluation[] {
  return checklist.items.map((item, i) => ({
    checkId: item.id,
    status: i % 5 === 4 ? 'fail' : 'pass' as CheckStatus,
    notes: `Evaluation for ${item.name}`,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 18 — Production Readiness Review ---\n');

  // Ex 1
  await test('Ex1 — Default checklist has items', () => {
    const cl = createDefaultChecklist('order-service');
    assertEqual(cl.serviceName, 'order-service');
    assert(cl.items.length >= 10, `should have at least 10 items, got ${cl.items.length}`);
  });

  await test('Ex1 — Checklist covers all categories', () => {
    const cl = createDefaultChecklist('api');
    const categories = new Set(cl.items.map(i => i.category));
    assert(categories.has('observability'), 'should have observability');
    assert(categories.has('reliability'), 'should have reliability');
    assert(categories.has('security'), 'should have security');
    assert(categories.has('performance'), 'should have performance');
    assert(categories.has('operations'), 'should have operations');
  });

  await test('Ex1 — Checklist has required items', () => {
    const cl = createDefaultChecklist('api');
    const required = cl.items.filter(i => i.required);
    assert(required.length >= 5, 'should have at least 5 required items');
  });

  // Ex 2
  await test('Ex2 — Evaluate service', () => {
    const cl = createDefaultChecklist('order-service');
    const evals = makeSampleEvaluations(cl);
    const report = evaluateService(cl, evals);
    assertEqual(report.serviceName, 'order-service');
    assert(report.passCount > 0, 'should have passes');
    assertEqual(report.passCount + report.failCount + report.warnCount + report.skipCount, cl.items.length);
  });

  await test('Ex2 — Required pass rate', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: 'pass',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    assertEqual(report.requiredPassRate, 100);
  });

  // Ex 3
  await test('Ex3 — Health checks all healthy', async () => {
    const checks: HealthCheckConfig[] = [
      { name: 'db', check: async () => ({ ok: true, latencyMs: 5 }), degradedThresholdMs: 100 },
      { name: 'cache', check: async () => ({ ok: true, latencyMs: 2 }), degradedThresholdMs: 50 },
    ];
    const result = await runHealthChecks(checks);
    assertEqual(result.overall, 'healthy');
    assertEqual(result.checks.length, 2);
  });

  await test('Ex3 — Health check degraded', async () => {
    const checks: HealthCheckConfig[] = [
      { name: 'db', check: async () => ({ ok: true, latencyMs: 200 }), degradedThresholdMs: 100 },
      { name: 'cache', check: async () => ({ ok: true, latencyMs: 2 }), degradedThresholdMs: 50 },
    ];
    const result = await runHealthChecks(checks);
    assertEqual(result.overall, 'degraded');
  });

  await test('Ex3 — Health check unhealthy', async () => {
    const checks: HealthCheckConfig[] = [
      { name: 'db', check: async () => ({ ok: false, latencyMs: 5, details: 'Connection refused' }), degradedThresholdMs: 100 },
    ];
    const result = await runHealthChecks(checks);
    assertEqual(result.overall, 'unhealthy');
    assertEqual(result.checks[0].status, 'unhealthy');
  });

  // Ex 4
  await test('Ex4 — Build dependency map', () => {
    const services: ServiceNode[] = [
      { name: 'api-gateway', dependencies: ['order-service', 'user-service'] },
      { name: 'order-service', dependencies: ['db', 'cache'] },
      { name: 'user-service', dependencies: ['db'] },
      { name: 'db', dependencies: [] },
      { name: 'cache', dependencies: [] },
    ];
    const map = buildDependencyMap(services);
    assertEqual(map.services.length, 5);
  });

  await test('Ex4 — Find SPOF', () => {
    const services: ServiceNode[] = [
      { name: 'api-gateway', dependencies: ['order-service', 'user-service'] },
      { name: 'order-service', dependencies: ['db', 'cache'] },
      { name: 'user-service', dependencies: ['db'] },
      { name: 'db', dependencies: [] },
      { name: 'cache', dependencies: [] },
    ];
    const map = buildDependencyMap(services);
    const spofs = findSinglePointsOfFailure(map);
    assert(spofs.includes('db'), 'db should be a SPOF (depended on by 2 services)');
  });

  await test('Ex4 — Find critical path', () => {
    const services: ServiceNode[] = [
      { name: 'api-gateway', dependencies: ['order-service'] },
      { name: 'order-service', dependencies: ['db'] },
      { name: 'db', dependencies: [] },
    ];
    const map = buildDependencyMap(services);
    const path = findCriticalPath(map, 'api-gateway', 'db');
    assert(path !== null, 'path should exist');
    assertEqual(path![0], 'api-gateway');
    assertEqual(path![path!.length - 1], 'db');
  });

  await test('Ex4 — No path returns null', () => {
    const services: ServiceNode[] = [
      { name: 'a', dependencies: ['b'] },
      { name: 'b', dependencies: [] },
      { name: 'c', dependencies: [] },
    ];
    const map = buildDependencyMap(services);
    const path = findCriticalPath(map, 'a', 'c');
    assertEqual(path, null);
  });

  // Ex 5
  await test('Ex5 — Readiness score calculation', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: 'pass',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    const score = calculateReadinessScore(report, cl);
    assertEqual(score.overall, 100);
    assertEqual(score.blockers.length, 0);
    assertEqual(score.recommendation, 'ready');
  });

  await test('Ex5 — Not ready when blockers exist', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: item.required ? 'fail' : 'pass',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    const score = calculateReadinessScore(report, cl);
    assert(score.blockers.length > 0, 'should have blockers');
    assertEqual(score.recommendation, 'not-ready');
  });

  summary();
}

main();

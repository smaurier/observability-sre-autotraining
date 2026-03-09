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
  requiredPassRate: number;
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
// Exercise 1: Define PRR checklist
// ---------------------------------------------------------------------------
function createDefaultChecklist(serviceName: string): PRRChecklist {
  return {
    serviceName,
    items: [
      // Observability
      { id: 'obs-logging', category: 'observability', name: 'Structured Logging', description: 'Service emits structured JSON logs with correlation IDs', required: true },
      { id: 'obs-metrics', category: 'observability', name: 'Metrics Instrumented', description: 'RED/USE metrics are exposed via Prometheus endpoint', required: true },
      { id: 'obs-tracing', category: 'observability', name: 'Distributed Tracing', description: 'OpenTelemetry tracing is configured with context propagation', required: true },
      { id: 'obs-dashboards', category: 'observability', name: 'Dashboards', description: 'Grafana dashboards exist for key service metrics', required: false },
      { id: 'obs-alerts', category: 'observability', name: 'Alerting Rules', description: 'Prometheus alerting rules are defined for SLO burn rates', required: true },
      // Reliability
      { id: 'rel-slos', category: 'reliability', name: 'SLOs Defined', description: 'SLIs and SLOs are documented with error budgets', required: true },
      { id: 'rel-error-budget', category: 'reliability', name: 'Error Budget Policy', description: 'Error budget policy is defined and enforced', required: false },
      { id: 'rel-graceful', category: 'reliability', name: 'Graceful Degradation', description: 'Service degrades gracefully under failure conditions', required: true },
      // Security
      { id: 'sec-auth', category: 'security', name: 'Authentication', description: 'All endpoints require proper authentication', required: true },
      { id: 'sec-secrets', category: 'security', name: 'Secrets Management', description: 'Secrets are stored in vault, not in code or env vars', required: true },
      // Performance
      { id: 'perf-load', category: 'performance', name: 'Load Tested', description: 'Service has been load tested with expected traffic patterns', required: false },
      { id: 'perf-limits', category: 'performance', name: 'Resource Limits', description: 'CPU and memory limits are configured in deployment', required: true },
      // Operations
      { id: 'ops-runbook', category: 'operations', name: 'Runbook', description: 'Runbook exists for common operational tasks and incidents', required: false },
      { id: 'ops-oncall', category: 'operations', name: 'On-Call Rotation', description: 'On-call rotation is set up with escalation policy', required: false },
    ],
  };
}

// ---------------------------------------------------------------------------
// Exercise 2: Evaluate a service against the checklist
// ---------------------------------------------------------------------------
function evaluateService(
  checklist: PRRChecklist,
  evaluations: PRREvaluation[]
): PRRReport {
  const evalMap = new Map(evaluations.map(e => [e.checkId, e]));

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;
  let skipCount = 0;

  for (const item of checklist.items) {
    const ev = evalMap.get(item.id);
    if (!ev || ev.status === 'skip') { skipCount++; continue; }
    if (ev.status === 'pass') passCount++;
    else if (ev.status === 'fail') failCount++;
    else if (ev.status === 'warn') warnCount++;
  }

  // Required pass rate
  const requiredItems = checklist.items.filter(i => i.required);
  const requiredPasses = requiredItems.filter(item => {
    const ev = evalMap.get(item.id);
    return ev?.status === 'pass';
  }).length;
  const requiredPassRate = requiredItems.length > 0
    ? (requiredPasses / requiredItems.length) * 100
    : 100;

  return {
    serviceName: checklist.serviceName,
    evaluatedAt: Date.now(),
    evaluations,
    passCount,
    failCount,
    warnCount,
    skipCount,
    requiredPassRate,
  };
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
  const results = await Promise.allSettled(
    checks.map(async (cfg) => {
      try {
        const result = await cfg.check();
        let status: HealthCheckResult['status'];
        if (!result.ok) {
          status = 'unhealthy';
        } else if (result.latencyMs > cfg.degradedThresholdMs) {
          status = 'degraded';
        } else {
          status = 'healthy';
        }
        return {
          name: cfg.name,
          status,
          latencyMs: result.latencyMs,
          details: result.details,
        } as HealthCheckResult;
      } catch (err) {
        return {
          name: cfg.name,
          status: 'unhealthy' as const,
          latencyMs: 0,
          details: err instanceof Error ? err.message : String(err),
        } as HealthCheckResult;
      }
    })
  );

  const checkResults: HealthCheckResult[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      name: checks[i].name,
      status: 'unhealthy' as const,
      latencyMs: 0,
      details: String(r.reason),
    };
  });

  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  for (const c of checkResults) {
    if (c.status === 'unhealthy') { overall = 'unhealthy'; break; }
    if (c.status === 'degraded') overall = 'degraded';
  }

  return { overall, checks: checkResults };
}

// ---------------------------------------------------------------------------
// Exercise 4: Dependency map and SPOF detection
// ---------------------------------------------------------------------------
function buildDependencyMap(services: ServiceNode[]): DependencyMap {
  return { services };
}

function findSinglePointsOfFailure(depMap: DependencyMap): string[] {
  // Count how many services depend on each service
  const dependedOnBy = new Map<string, Set<string>>();

  for (const svc of depMap.services) {
    for (const dep of svc.dependencies) {
      if (!dependedOnBy.has(dep)) dependedOnBy.set(dep, new Set());
      dependedOnBy.get(dep)!.add(svc.name);
    }
  }

  // SPOF = depended on by 2+ services
  const spofs: string[] = [];
  for (const [service, dependents] of dependedOnBy) {
    if (dependents.size >= 2) {
      spofs.push(service);
    }
  }

  return spofs;
}

function findCriticalPath(depMap: DependencyMap, from: string, to: string): string[] | null {
  // BFS from `from` following dependencies
  const adjacency = new Map<string, string[]>();
  for (const svc of depMap.services) {
    adjacency.set(svc.name, svc.dependencies);
  }

  const visited = new Set<string>();
  const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
  visited.add(from);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    if (node === to) return path;

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ node: neighbor, path: [...path, neighbor] });
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Exercise 5: Production readiness score
// ---------------------------------------------------------------------------
interface ReadinessScore {
  overall: number;
  categories: Record<CheckCategory, number>;
  blockers: string[];
  recommendation: 'ready' | 'conditional' | 'not-ready';
}

function calculateReadinessScore(report: PRRReport, checklist: PRRChecklist): ReadinessScore {
  const evalMap = new Map(report.evaluations.map(e => [e.checkId, e]));
  const scoredCount = report.passCount + report.failCount + report.warnCount;
  const overall = scoredCount > 0 ? (report.passCount / scoredCount) * 100 : 0;

  // Per-category scores
  const allCategories: CheckCategory[] = ['observability', 'reliability', 'security', 'performance', 'operations'];
  const categories: Record<CheckCategory, number> = {} as Record<CheckCategory, number>;
  for (const cat of allCategories) {
    const catItems = checklist.items.filter(i => i.category === cat);
    const catPasses = catItems.filter(i => evalMap.get(i.id)?.status === 'pass').length;
    const catScored = catItems.filter(i => {
      const ev = evalMap.get(i.id);
      return ev && ev.status !== 'skip';
    }).length;
    categories[cat] = catScored > 0 ? (catPasses / catScored) * 100 : 0;
  }

  // Blockers = required items that failed
  const blockers: string[] = [];
  for (const item of checklist.items) {
    if (item.required) {
      const ev = evalMap.get(item.id);
      if (ev?.status === 'fail') {
        blockers.push(item.name);
      }
    }
  }

  // Recommendation
  let recommendation: 'ready' | 'conditional' | 'not-ready';
  if (overall >= 90 && blockers.length === 0) {
    recommendation = 'ready';
  } else if (overall >= 70 && blockers.length <= 1) {
    recommendation = 'conditional';
  } else {
    recommendation = 'not-ready';
  }

  return { overall, categories, blockers, recommendation };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeSampleEvaluations(checklist: PRRChecklist): PRREvaluation[] {
  return checklist.items.map((item, i) => ({
    checkId: item.id,
    status: (i % 5 === 4 ? 'fail' : 'pass') as CheckStatus,
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

  await test('Ex1 — Each item has description', () => {
    const cl = createDefaultChecklist('api');
    for (const item of cl.items) {
      assert(item.description.length > 0, `Item "${item.name}" should have a description`);
    }
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

  await test('Ex2 — Required pass rate 100%', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: 'pass',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    assertEqual(report.requiredPassRate, 100);
  });

  await test('Ex2 — Required pass rate 0%', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: 'fail',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    assertEqual(report.requiredPassRate, 0);
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

  await test('Ex3 — Health check exception handled', async () => {
    const checks: HealthCheckConfig[] = [
      { name: 'broken', check: async () => { throw new Error('timeout'); }, degradedThresholdMs: 100 },
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

  await test('Ex4 — No SPOF when single dependency', () => {
    const services: ServiceNode[] = [
      { name: 'a', dependencies: ['b'] },
      { name: 'b', dependencies: [] },
    ];
    const map = buildDependencyMap(services);
    const spofs = findSinglePointsOfFailure(map);
    assertEqual(spofs.length, 0);
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
    assertEqual(path!.length, 3);
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
  await test('Ex5 — Readiness score 100%', () => {
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

  await test('Ex5 — Category scores computed', () => {
    const cl = createDefaultChecklist('api');
    const evals: PRREvaluation[] = cl.items.map(item => ({
      checkId: item.id,
      status: 'pass',
      notes: '',
    }));
    const report = evaluateService(cl, evals);
    const score = calculateReadinessScore(report, cl);
    assertEqual(score.categories['observability'], 100);
    assertEqual(score.categories['reliability'], 100);
    assertEqual(score.categories['security'], 100);
  });

  summary();
}

main();

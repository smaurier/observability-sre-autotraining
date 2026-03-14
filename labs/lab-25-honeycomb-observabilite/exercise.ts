import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertGreaterThan, assertLessThan, summary } = createTestRunner('Lab 25 — Honeycomb & Observabilite Haute Cardinalite');

// Types
interface HoneycombEvent {
  timestamp: number;
  service: string;
  endpoint: string;
  method: string;
  status_code: number;
  duration_ms: number;
  user_id: string;
  region: string;
  build_id: string;
  cache_hit: boolean;
  db_query_count: number;
  error_message: string | null;
}

interface QueryResult { groups: Array<{ key: Record<string, string>; values: Record<string, number> }>; }

interface Correlation { field: string; value: string; deviation: number; baselineRatio: number; anomalyRatio: number; }

interface SLOResult { total: number; good: number; bad: number; sloTarget: number; currentSLI: number; errorBudgetRemaining: number; burnRate: number; }

// ============================================================
// TODO 1: generateEvents — create N realistic events with some patterns
// 10% should have status_code >= 500 (errors)
// 20% should have cache_hit = false
// duration_ms: normal ~100ms, errors ~2000ms, cache_miss adds ~500ms
// Distribute across 3 regions, 5 endpoints, 100 user_ids, 3 build_ids
// ============================================================

function generateEvents(count: number, seed?: number): HoneycombEvent[] {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 2: queryBuilder — execute a query on events
// Support VISUALIZE: COUNT, AVG(field), P99(field), MAX(field)
// Support WHERE: simple equality filters
// Support GROUP BY: one or more fields
// Return: QueryResult with groups
// ============================================================

function queryBuilder(events: HoneycombEvent[], query: {
  visualize: Array<{ fn: 'COUNT' | 'AVG' | 'P99' | 'MAX'; field?: string }>;
  where?: Record<string, string | number | boolean>;
  groupBy?: string[];
}): QueryResult {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 3: bubbleUp — find dimensions that correlate with anomaly
// Given baseline events and anomaly events, for each field:
// Calculate distribution in baseline and anomaly
// Find values where anomalyRatio - baselineRatio > threshold (0.1)
// Return sorted by deviation descending
// ============================================================

function bubbleUp(baseline: HoneycombEvent[], anomaly: HoneycombEvent[], fields: string[]): Correlation[] {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 4: calculateSLO — compute SLO metrics
// Good event: duration_ms < latencyThreshold AND status_code < 500
// Return: total, good, bad, currentSLI, errorBudgetRemaining (1 - bad/allowed), burnRate
// ============================================================

function calculateSLO(events: HoneycombEvent[], config: {
  sloTarget: number; // e.g., 0.995
  latencyThreshold: number; // e.g., 500
  windowDays: number; // e.g., 30
}): SLOResult {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 5: analyzeCardinality — compute cardinality of each field
// Return map of field -> unique value count, sorted by cardinality descending
// Flag as 'high' if cardinality > threshold (default: 100)
// ============================================================

function analyzeCardinality(events: HoneycombEvent[], fields: string[], threshold?: number): Array<{ field: string; cardinality: number; isHigh: boolean }> {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 6: derivedColumn — compute a derived field from an expression
// Expressions: 'IF(status_code >= 500, 1, 0)' -> is_error
// 'BUCKET(duration_ms, [100, 500, 2000])' -> 'fast'|'medium'|'slow'|'very_slow'
// Return array of computed values (one per event)
// ============================================================

function derivedColumn(events: HoneycombEvent[], expression: string): (string | number)[] {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// Tests
// ============================================================

await test('generateEvents creates correct count', () => {
  const events = generateEvents(1000, 42);
  assertEqual(events.length, 1000, 'Should generate 1000 events');
  assert(events.every(e => e.timestamp > 0), 'All should have timestamps');
  assert(events.every(e => e.user_id.length > 0), 'All should have user_id');
});

await test('generateEvents has ~10% errors', () => {
  const events = generateEvents(1000, 42);
  const errors = events.filter(e => e.status_code >= 500).length;
  assertGreaterThan(errors, 50, 'Should have > 5% errors');
  assertLessThan(errors, 200, 'Should have < 20% errors');
});

await test('generateEvents errors are slower', () => {
  const events = generateEvents(1000, 42);
  const errorDurations = events.filter(e => e.status_code >= 500).map(e => e.duration_ms);
  const okDurations = events.filter(e => e.status_code < 500).map(e => e.duration_ms);
  const avgError = errorDurations.reduce((a, b) => a + b, 0) / errorDurations.length;
  const avgOk = okDurations.reduce((a, b) => a + b, 0) / okDurations.length;
  assertGreaterThan(avgError, avgOk, 'Errors should be slower on average');
});

await test('queryBuilder COUNT', () => {
  const events = generateEvents(100, 1);
  const result = queryBuilder(events, { visualize: [{ fn: 'COUNT' }] });
  assertEqual(result.groups.length, 1, 'Should have 1 group');
  assertEqual(result.groups[0].values['COUNT'], 100, 'Should count 100');
});

await test('queryBuilder with GROUP BY', () => {
  const events: HoneycombEvent[] = [
    { timestamp: 1, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 100, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 2, service: 'api', endpoint: '/b', method: 'GET', status_code: 200, duration_ms: 200, user_id: 'u2', region: 'us', build_id: 'b1', cache_hit: false, db_query_count: 2, error_message: null },
    { timestamp: 3, service: 'api', endpoint: '/a', method: 'GET', status_code: 500, duration_ms: 300, user_id: 'u3', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: 'fail' },
  ];
  const result = queryBuilder(events, { visualize: [{ fn: 'COUNT' }], groupBy: ['region'] });
  assertEqual(result.groups.length, 2, 'Should have 2 groups (eu, us)');
});

await test('queryBuilder AVG with WHERE', () => {
  const events: HoneycombEvent[] = [
    { timestamp: 1, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 100, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 2, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 300, user_id: 'u2', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
  ];
  const result = queryBuilder(events, { visualize: [{ fn: 'AVG', field: 'duration_ms' }], where: { region: 'eu' } });
  assertEqual(result.groups[0].values['AVG(duration_ms)'], 200, 'Should average to 200');
});

await test('bubbleUp identifies correlated dimension', () => {
  const baseline: HoneycombEvent[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: i, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 100,
    user_id: `u${i}`, region: 'eu', build_id: 'v1', cache_hit: true, db_query_count: 1, error_message: null,
  }));
  const anomaly: HoneycombEvent[] = Array.from({ length: 50 }, (_, i) => ({
    timestamp: i, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 2000,
    user_id: `u${i}`, region: 'eu', build_id: 'v2', cache_hit: false, db_query_count: 5, error_message: null,
  }));
  const correlations = bubbleUp(baseline, anomaly, ['build_id', 'cache_hit', 'region']);
  assert(correlations.length > 0, 'Should find correlations');
  assertEqual(correlations[0].field, 'build_id', 'build_id should be most correlated');
});

await test('calculateSLO computes correctly', () => {
  const events: HoneycombEvent[] = [
    ...Array.from({ length: 990 }, (_, i) => ({
      timestamp: i, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 100,
      user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null,
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      timestamp: 990 + i, service: 'api', endpoint: '/a', method: 'GET', status_code: 500, duration_ms: 3000,
      user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: false, db_query_count: 1, error_message: 'error',
    })),
  ];
  const slo = calculateSLO(events, { sloTarget: 0.995, latencyThreshold: 500, windowDays: 30 });
  assertEqual(slo.total, 1000, 'Total should be 1000');
  assertEqual(slo.good, 990, 'Good should be 990');
  assertEqual(slo.bad, 10, 'Bad should be 10');
  assertEqual(slo.currentSLI, 0.99, 'SLI should be 0.99');
});

await test('analyzeCardinality identifies high cardinality fields', () => {
  const events = generateEvents(500, 42);
  const analysis = analyzeCardinality(events, ['user_id', 'region', 'status_code', 'build_id'], 10);
  const userField = analysis.find(a => a.field === 'user_id');
  assert(userField?.isHigh === true, 'user_id should be high cardinality');
  const regionField = analysis.find(a => a.field === 'region');
  assert(regionField?.isHigh === false, 'region should be low cardinality');
});

await test('derivedColumn IF expression', () => {
  const events: HoneycombEvent[] = [
    { timestamp: 1, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 100, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 2, service: 'api', endpoint: '/a', method: 'GET', status_code: 500, duration_ms: 100, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: 'err' },
  ];
  const result = derivedColumn(events, 'IF(status_code >= 500, 1, 0)');
  assertDeepEqual(result, [0, 1], 'Should compute is_error');
});

await test('derivedColumn BUCKET expression', () => {
  const events: HoneycombEvent[] = [
    { timestamp: 1, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 50, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 2, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 250, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 3, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 1500, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
    { timestamp: 4, service: 'api', endpoint: '/a', method: 'GET', status_code: 200, duration_ms: 5000, user_id: 'u1', region: 'eu', build_id: 'b1', cache_hit: true, db_query_count: 1, error_message: null },
  ];
  const result = derivedColumn(events, 'BUCKET(duration_ms, [100, 500, 2000])');
  assertDeepEqual(result, ['fast', 'medium', 'slow', 'very_slow'], 'Should bucket correctly');
});

summary();

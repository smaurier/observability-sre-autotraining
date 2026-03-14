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
// TODO 1: generateEvents
// ============================================================

function generateEvents(count: number, seed?: number): HoneycombEvent[] {
  // Simple seeded PRNG (mulberry32)
  let s = seed ?? Date.now();
  function random(): number {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const regions = ['eu-west-1', 'us-east-1', 'ap-southeast-1'];
  const endpoints = ['/api/users', '/api/products', '/api/orders', '/api/search', '/api/health'];
  const methods = ['GET', 'POST', 'PUT', 'DELETE'];
  const buildIds = ['build-100', 'build-101', 'build-102'];
  const now = Date.now();

  const events: HoneycombEvent[] = [];

  for (let i = 0; i < count; i++) {
    const isError = random() < 0.1;
    const cacheMiss = random() < 0.2;

    let durationMs = 50 + random() * 100; // base ~50-150ms
    if (isError) {
      durationMs = 1500 + random() * 1000; // errors ~1500-2500ms
    }
    if (cacheMiss && !isError) {
      durationMs += 300 + random() * 400; // cache miss adds ~300-700ms
    }

    const statusCode = isError
      ? (random() < 0.5 ? 500 : 503)
      : (random() < 0.9 ? 200 : (random() < 0.5 ? 201 : 204));

    events.push({
      timestamp: now - (count - i) * 1000,
      service: 'api-gateway',
      endpoint: endpoints[Math.floor(random() * endpoints.length)],
      method: methods[Math.floor(random() * methods.length)],
      status_code: statusCode,
      duration_ms: Math.round(durationMs * 100) / 100,
      user_id: `user-${Math.floor(random() * 100)}`,
      region: regions[Math.floor(random() * regions.length)],
      build_id: buildIds[Math.floor(random() * buildIds.length)],
      cache_hit: !cacheMiss,
      db_query_count: Math.floor(random() * 5) + 1,
      error_message: isError ? `Error on request ${i}` : null,
    });
  }

  return events;
}

// ============================================================
// TODO 2: queryBuilder
// ============================================================

function queryBuilder(events: HoneycombEvent[], query: {
  visualize: Array<{ fn: 'COUNT' | 'AVG' | 'P99' | 'MAX'; field?: string }>;
  where?: Record<string, string | number | boolean>;
  groupBy?: string[];
}): QueryResult {
  // Apply WHERE filters
  let filtered = events;
  if (query.where) {
    for (const [field, value] of Object.entries(query.where)) {
      filtered = filtered.filter((e) => (e as any)[field] === value);
    }
  }

  // Group events
  const groupMap = new Map<string, HoneycombEvent[]>();

  if (query.groupBy && query.groupBy.length > 0) {
    for (const event of filtered) {
      const keyObj: Record<string, string> = {};
      for (const field of query.groupBy) {
        keyObj[field] = String((event as any)[field]);
      }
      const keyStr = JSON.stringify(keyObj);
      if (!groupMap.has(keyStr)) {
        groupMap.set(keyStr, []);
      }
      groupMap.get(keyStr)!.push(event);
    }
  } else {
    groupMap.set('{}', filtered);
  }

  // Compute visualizations per group
  const groups: QueryResult['groups'] = [];

  for (const [keyStr, groupEvents] of groupMap) {
    const key = JSON.parse(keyStr) as Record<string, string>;
    const values: Record<string, number> = {};

    for (const viz of query.visualize) {
      switch (viz.fn) {
        case 'COUNT':
          values['COUNT'] = groupEvents.length;
          break;
        case 'AVG': {
          const fieldValues = groupEvents.map((e) => (e as any)[viz.field!] as number);
          values[`AVG(${viz.field})`] = fieldValues.reduce((a, b) => a + b, 0) / fieldValues.length;
          break;
        }
        case 'P99': {
          const sorted = groupEvents.map((e) => (e as any)[viz.field!] as number).sort((a, b) => a - b);
          const index = Math.ceil(0.99 * sorted.length) - 1;
          values[`P99(${viz.field})`] = sorted[Math.max(0, index)];
          break;
        }
        case 'MAX': {
          const maxVal = Math.max(...groupEvents.map((e) => (e as any)[viz.field!] as number));
          values[`MAX(${viz.field})`] = maxVal;
          break;
        }
      }
    }

    groups.push({ key, values });
  }

  return { groups };
}

// ============================================================
// TODO 3: bubbleUp
// ============================================================

function bubbleUp(baseline: HoneycombEvent[], anomaly: HoneycombEvent[], fields: string[]): Correlation[] {
  const correlations: Correlation[] = [];

  for (const field of fields) {
    // Calculate value distributions
    const baselineCounts = new Map<string, number>();
    for (const event of baseline) {
      const val = String((event as any)[field]);
      baselineCounts.set(val, (baselineCounts.get(val) ?? 0) + 1);
    }

    const anomalyCounts = new Map<string, number>();
    for (const event of anomaly) {
      const val = String((event as any)[field]);
      anomalyCounts.set(val, (anomalyCounts.get(val) ?? 0) + 1);
    }

    // Collect all unique values
    const allValues = new Set([...baselineCounts.keys(), ...anomalyCounts.keys()]);

    for (const value of allValues) {
      const baselineRatio = (baselineCounts.get(value) ?? 0) / baseline.length;
      const anomalyRatio = (anomalyCounts.get(value) ?? 0) / anomaly.length;
      const deviation = anomalyRatio - baselineRatio;

      if (deviation > 0.1) {
        correlations.push({ field, value, deviation, baselineRatio, anomalyRatio });
      }
    }
  }

  // Sort by deviation descending
  correlations.sort((a, b) => b.deviation - a.deviation);

  return correlations;
}

// ============================================================
// TODO 4: calculateSLO
// ============================================================

function calculateSLO(events: HoneycombEvent[], config: {
  sloTarget: number;
  latencyThreshold: number;
  windowDays: number;
}): SLOResult {
  const total = events.length;
  const good = events.filter((e) => e.duration_ms < config.latencyThreshold && e.status_code < 500).length;
  const bad = total - good;
  const currentSLI = good / total;

  // Error budget: how many bad events are allowed
  const allowedBad = Math.floor(total * (1 - config.sloTarget));
  const errorBudgetRemaining = allowedBad > 0 ? 1 - (bad / allowedBad) : (bad === 0 ? 1 : 0);

  // Burn rate: how fast we are consuming error budget
  // burn rate = (bad / total) / (1 - sloTarget)
  const errorBudgetRate = 1 - config.sloTarget;
  const burnRate = errorBudgetRate > 0 ? (bad / total) / errorBudgetRate : 0;

  return {
    total,
    good,
    bad,
    sloTarget: config.sloTarget,
    currentSLI,
    errorBudgetRemaining,
    burnRate,
  };
}

// ============================================================
// TODO 5: analyzeCardinality
// ============================================================

function analyzeCardinality(events: HoneycombEvent[], fields: string[], threshold: number = 100): Array<{ field: string; cardinality: number; isHigh: boolean }> {
  const result: Array<{ field: string; cardinality: number; isHigh: boolean }> = [];

  for (const field of fields) {
    const uniqueValues = new Set(events.map((e) => String((e as any)[field])));
    const cardinality = uniqueValues.size;
    result.push({ field, cardinality, isHigh: cardinality > threshold });
  }

  // Sort by cardinality descending
  result.sort((a, b) => b.cardinality - a.cardinality);

  return result;
}

// ============================================================
// TODO 6: derivedColumn
// ============================================================

function derivedColumn(events: HoneycombEvent[], expression: string): (string | number)[] {
  // Parse IF expression: IF(field >= value, trueVal, falseVal)
  const ifMatch = expression.match(/^IF\((\w+)\s*(>=|<=|>|<|==|!=)\s*(\d+),\s*(\d+),\s*(\d+)\)$/);
  if (ifMatch) {
    const [, field, operator, threshold, trueVal, falseVal] = ifMatch;
    const thresholdNum = Number(threshold);
    const trueNum = Number(trueVal);
    const falseNum = Number(falseVal);

    return events.map((event) => {
      const value = (event as any)[field] as number;
      let condition = false;
      switch (operator) {
        case '>=': condition = value >= thresholdNum; break;
        case '<=': condition = value <= thresholdNum; break;
        case '>': condition = value > thresholdNum; break;
        case '<': condition = value < thresholdNum; break;
        case '==': condition = value === thresholdNum; break;
        case '!=': condition = value !== thresholdNum; break;
      }
      return condition ? trueNum : falseNum;
    });
  }

  // Parse BUCKET expression: BUCKET(field, [b1, b2, b3])
  const bucketMatch = expression.match(/^BUCKET\((\w+),\s*\[([^\]]+)\]\)$/);
  if (bucketMatch) {
    const [, field, bucketsStr] = bucketMatch;
    const buckets = bucketsStr.split(',').map((s) => Number(s.trim()));
    const labels = ['fast', 'medium', 'slow', 'very_slow'];

    return events.map((event) => {
      const value = (event as any)[field] as number;
      for (let i = 0; i < buckets.length; i++) {
        if (value < buckets[i]) {
          return labels[i];
        }
      }
      return labels[buckets.length];
    });
  }

  throw new Error(`Unsupported expression: ${expression}`);
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

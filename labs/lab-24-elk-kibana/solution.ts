import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } = createTestRunner('Lab 24 — ELK Stack & Kibana');

// Types
interface ElasticsearchMapping { properties: Record<string, FieldMapping>; }
interface FieldMapping { type: string; analyzer?: string; fields?: Record<string, FieldMapping>; format?: string; }

interface GrokResult { matched: boolean; fields: Record<string, string | number>; }

interface KQLFilter { field: string; operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'wildcard'; value: string | number | boolean; }

interface ILMPolicy {
  phases: {
    hot?: { actions: Record<string, unknown>; min_age?: string };
    warm?: { actions: Record<string, unknown>; min_age: string };
    cold?: { actions: Record<string, unknown>; min_age: string };
    delete?: { actions: Record<string, unknown>; min_age: string };
  };
}

interface AggregationQuery { type: string; field?: string; interval?: string; size?: number; sub_aggs?: Record<string, AggregationQuery>; }

// ============================================================
// TODO 1: createLogMapping
// ============================================================

function createLogMapping(): ElasticsearchMapping {
  return {
    properties: {
      '@timestamp': { type: 'date' },
      level: { type: 'keyword' },
      message: {
        type: 'text',
        fields: {
          raw: { type: 'keyword' },
        },
      },
      service: { type: 'keyword' },
      host: { type: 'keyword' },
      duration_ms: { type: 'float' },
      status_code: { type: 'integer' },
      user_id: { type: 'keyword' },
      'request.method': { type: 'keyword' },
      'request.path': { type: 'keyword' },
    },
  };
}

// ============================================================
// TODO 2: parseGrokPattern
// ============================================================

function parseGrokPattern(logLine: string): GrokResult {
  // Apache combined log format regex
  const pattern = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d+) (\d+)/;
  const match = logLine.match(pattern);

  if (!match) {
    return { matched: false, fields: {} };
  }

  return {
    matched: true,
    fields: {
      client_ip: match[1],
      timestamp: match[2],
      method: match[3],
      path: match[4],
      http_version: match[5],
      status_code: parseInt(match[6], 10),
      bytes: parseInt(match[7], 10),
    },
  };
}

// ============================================================
// TODO 3: buildKQL
// ============================================================

function buildKQL(filters: KQLFilter[]): string {
  const parts = filters.map((filter) => {
    switch (filter.operator) {
      case 'eq':
        if (typeof filter.value === 'string') {
          return `${filter.field}: "${filter.value}"`;
        }
        return `${filter.field}: ${filter.value}`;
      case 'gt':
        return `${filter.field} > ${filter.value}`;
      case 'gte':
        return `${filter.field} >= ${filter.value}`;
      case 'lt':
        return `${filter.field} < ${filter.value}`;
      case 'lte':
        return `${filter.field} <= ${filter.value}`;
      case 'exists':
        return `${filter.field}: *`;
      case 'wildcard':
        return `${filter.field}: ${filter.value}`;
      default:
        return '';
    }
  });

  return parts.join(' AND ');
}

// ============================================================
// TODO 4: createILMPolicy
// ============================================================

function createILMPolicy(config: {
  maxAge: string; maxSize: string;
  warmAfterDays: number; coldAfterDays: number; deleteAfterDays: number;
}): ILMPolicy {
  return {
    phases: {
      hot: {
        actions: {
          rollover: {
            max_age: config.maxAge,
            max_size: config.maxSize,
          },
        },
      },
      warm: {
        min_age: `${config.warmAfterDays}d`,
        actions: {
          shrink: { number_of_shards: 1 },
          forcemerge: { max_num_segments: 1 },
        },
      },
      cold: {
        min_age: `${config.coldAfterDays}d`,
        actions: {
          freeze: {},
        },
      },
      delete: {
        min_age: `${config.deleteAfterDays}d`,
        actions: {
          delete: {},
        },
      },
    },
  };
}

// ============================================================
// TODO 5: buildAggregation
// ============================================================

function buildAggregation(name: string, config: { type: string; field?: string; interval?: string; size?: number; percentiles?: number[] }): Record<string, unknown> {
  const aggBody: Record<string, unknown> = {};

  switch (config.type) {
    case 'terms':
      aggBody[name] = {
        terms: {
          field: config.field,
          size: config.size ?? 10,
        },
      };
      break;
    case 'date_histogram':
      aggBody[name] = {
        date_histogram: {
          field: config.field,
          fixed_interval: config.interval,
        },
      };
      break;
    case 'avg':
      aggBody[name] = {
        avg: {
          field: config.field,
        },
      };
      break;
    case 'percentiles':
      aggBody[name] = {
        percentiles: {
          field: config.field,
          percents: config.percentiles ?? [50, 95, 99],
        },
      };
      break;
  }

  return aggBody;
}

// ============================================================
// TODO 6: calculateShards
// ============================================================

function calculateShards(config: { dailyDataGB: number; retentionDays: number; targetShardSizeGB: number; replicaCount: number }): { primaryShards: number; replicaShards: number; totalShards: number } {
  const totalDataGB = config.dailyDataGB * config.retentionDays;
  const primaryShards = Math.max(1, Math.ceil(totalDataGB / config.targetShardSizeGB));
  const replicaShards = primaryShards * config.replicaCount;
  const totalShards = primaryShards + replicaShards;

  return { primaryShards, replicaShards, totalShards };
}

// ============================================================
// TODO 7: enrichLogEntry
// ============================================================

function enrichLogEntry(entry: { ip: string; user_agent: string; timestamp: string; status_code: number }): Record<string, unknown> {
  // Geo from IP
  let geoCountry: string;
  if (entry.ip.startsWith('192.168.')) {
    geoCountry = 'Local';
  } else if (entry.ip.startsWith('10.')) {
    geoCountry = 'Private';
  } else {
    geoCountry = 'Unknown';
  }

  // Parse user-agent: first word before /
  const uaMatch = entry.user_agent.match(/^([^/]+)/);
  const browser = uaMatch ? uaMatch[1] : 'Unknown';

  // Normalize timestamp to ISO
  const normalizedTimestamp = new Date(entry.timestamp).toISOString();

  // is_error
  const isError = entry.status_code >= 400;

  return {
    ...entry,
    'geo.country': geoCountry,
    'parsed_ua.browser': browser,
    'normalized_timestamp': normalizedTimestamp,
    'is_error': isError,
  };
}

// ============================================================
// Tests
// ============================================================

await test('createLogMapping has correct field types', () => {
  const mapping = createLogMapping();
  assertEqual(mapping.properties['@timestamp'].type, 'date', 'timestamp should be date');
  assertEqual(mapping.properties['level'].type, 'keyword', 'level should be keyword');
  assertEqual(mapping.properties['message'].type, 'text', 'message should be text');
  assert(mapping.properties['message'].fields?.raw?.type === 'keyword', 'message should have keyword sub-field');
  assertEqual(mapping.properties['duration_ms'].type, 'float', 'duration should be float');
  assertEqual(mapping.properties['status_code'].type, 'integer', 'status should be integer');
});

await test('parseGrokPattern parses Apache log', () => {
  const result = parseGrokPattern('192.168.1.1 - - [15/Mar/2024:10:30:00 +0000] "GET /api/products HTTP/1.1" 200 1234');
  assert(result.matched, 'Should match');
  assertEqual(result.fields.client_ip, '192.168.1.1', 'IP should match');
  assertEqual(result.fields.method, 'GET', 'Method should match');
  assertEqual(result.fields.path, '/api/products', 'Path should match');
  assertEqual(result.fields.status_code, 200, 'Status should be number');
  assertEqual(result.fields.bytes, 1234, 'Bytes should be number');
});

await test('parseGrokPattern returns not matched for bad input', () => {
  const result = parseGrokPattern('not a valid log line');
  assert(!result.matched, 'Should not match');
});

await test('buildKQL with equality filters', () => {
  const kql = buildKQL([{ field: 'level', operator: 'eq', value: 'error' }]);
  assertEqual(kql, 'level: "error"', 'Should build equality KQL');
});

await test('buildKQL with multiple filters', () => {
  const kql = buildKQL([
    { field: 'status_code', operator: 'gte', value: 500 },
    { field: 'service', operator: 'eq', value: 'api' },
  ]);
  assertEqual(kql, 'status_code >= 500 AND service: "api"', 'Should join with AND');
});

await test('buildKQL with exists', () => {
  const kql = buildKQL([{ field: 'error_message', operator: 'exists', value: true }]);
  assertEqual(kql, 'error_message: *', 'Should build exists KQL');
});

await test('createILMPolicy generates correct phases', () => {
  const policy = createILMPolicy({ maxAge: '1d', maxSize: '50gb', warmAfterDays: 7, coldAfterDays: 30, deleteAfterDays: 90 });
  assert(policy.phases.hot !== undefined, 'Should have hot phase');
  assert(policy.phases.warm !== undefined, 'Should have warm phase');
  assertEqual(policy.phases.warm?.min_age, '7d', 'Warm should be 7d');
  assertEqual(policy.phases.cold?.min_age, '30d', 'Cold should be 30d');
  assertEqual(policy.phases.delete?.min_age, '90d', 'Delete should be 90d');
});

await test('buildAggregation terms', () => {
  const agg = buildAggregation('top_services', { type: 'terms', field: 'service', size: 10 });
  assert((agg as any).top_services?.terms?.field === 'service', 'Should have terms agg');
});

await test('buildAggregation date_histogram', () => {
  const agg = buildAggregation('over_time', { type: 'date_histogram', field: '@timestamp', interval: '1h' });
  assert((agg as any).over_time?.date_histogram?.field === '@timestamp', 'Should have date_histogram');
});

await test('calculateShards with typical config', () => {
  const result = calculateShards({ dailyDataGB: 100, retentionDays: 30, targetShardSizeGB: 30, replicaCount: 1 });
  assertEqual(result.primaryShards, 100, 'Should calculate 100 primary shards');
  assertEqual(result.replicaShards, 100, 'Should have 100 replica shards');
  assertEqual(result.totalShards, 200, 'Total should be 200');
});

await test('calculateShards minimum 1', () => {
  const result = calculateShards({ dailyDataGB: 0.1, retentionDays: 1, targetShardSizeGB: 30, replicaCount: 0 });
  assertEqual(result.primaryShards, 1, 'Minimum should be 1 primary shard');
});

await test('enrichLogEntry adds all fields', () => {
  const enriched = enrichLogEntry({ ip: '192.168.1.1', user_agent: 'Mozilla/5.0', timestamp: '2024-03-15T10:30:00Z', status_code: 500 });
  assertEqual(enriched['geo.country'], 'Local', 'Should detect local IP');
  assertEqual(enriched['parsed_ua.browser'], 'Mozilla', 'Should parse UA');
  assertEqual(enriched['is_error'], true, 'Should flag as error');
  assert(typeof enriched['normalized_timestamp'] === 'string', 'Should have normalized timestamp');
});

await test('enrichLogEntry private IP', () => {
  const enriched = enrichLogEntry({ ip: '10.0.0.1', user_agent: 'Chrome/120', timestamp: '2024-03-15', status_code: 200 });
  assertEqual(enriched['geo.country'], 'Private', 'Should detect private IP');
  assertEqual(enriched['parsed_ua.browser'], 'Chrome', 'Should parse Chrome');
  assertEqual(enriched['is_error'], false, 'Should not flag 200 as error');
});

summary();

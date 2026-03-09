import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, summary } = createTestRunner('Lab 08 — OTel Collector');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CollectorConfig {
  receivers: Record<string, { endpoint?: string; protocols?: Record<string, { endpoint: string }> }>;
  processors: Record<string, Record<string, unknown>>;
  exporters: Record<string, Record<string, unknown>>;
  service: {
    pipelines: Record<string, { receivers: string[]; processors: string[]; exporters: string[] }>;
  };
}

interface SpanData {
  traceId: string;
  spanId: string;
  operationName: string;
  attributes: Record<string, string | number | boolean>;
  status: 'OK' | 'ERROR' | 'UNSET';
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Exercise 1: Parse OTel Collector config
// Given a CollectorConfig, extract the list of receiver, processor, and
// exporter names, plus validate that every name referenced in a pipeline
// actually exists in the top-level keys.
// ---------------------------------------------------------------------------
function parseCollectorConfig(config: CollectorConfig): {
  receivers: string[];
  processors: string[];
  exporters: string[];
  pipelines: string[];
  valid: boolean;
  errors: string[];
} {
  // TODO: Extract names from config.receivers, config.processors, config.exporters
  // TODO: Iterate over config.service.pipelines and collect pipeline names
  // TODO: Validate that every receiver/processor/exporter referenced in a pipeline exists
  // TODO: Return { receivers, processors, exporters, pipelines, valid, errors }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: BatchProcessor
// Buffers incoming spans and flushes when batchSize is reached or when
// flush() is called manually. Each flush invokes the onFlush callback.
// ---------------------------------------------------------------------------
class BatchProcessor {
  private buffer: SpanData[] = [];
  private batchSize: number;
  private onFlush: (batch: SpanData[]) => void;
  public flushCount = 0;

  constructor(batchSize: number, onFlush: (batch: SpanData[]) => void) {
    this.batchSize = batchSize;
    this.onFlush = onFlush;
  }

  process(span: SpanData): void {
    // TODO: Add span to buffer
    // TODO: If buffer length >= batchSize, call this.flush()
    throw new Error('Not implemented');
  }

  flush(): SpanData[] {
    // TODO: If buffer is empty, return []
    // TODO: Copy buffer, clear it, call onFlush with the copy, increment flushCount, return copy
    throw new Error('Not implemented');
  }

  get pending(): number {
    // TODO: Return buffer length
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Exercise 3: FilterProcessor
// Filters spans based on attribute matching rules.
// ---------------------------------------------------------------------------
interface FilterRule {
  action: 'include' | 'exclude';
  attributeKey: string;
  pattern: string; // exact match or '*' wildcard
}

class FilterProcessor {
  private rules: FilterRule[];

  constructor(rules: FilterRule[]) {
    this.rules = rules;
  }

  process(spans: SpanData[]): SpanData[] {
    // TODO: For each span, apply rules in order:
    //   - If an 'include' rule matches, keep the span
    //   - If an 'exclude' rule matches, drop the span
    //   - pattern '*' matches any value; otherwise exact match on span.attributes[attributeKey]
    //   - If no rules match, keep the span by default
    // TODO: Return the filtered array
    throw new Error('Not implemented');
  }

  private matches(span: SpanData, rule: FilterRule): boolean {
    // TODO: Check if span.attributes[rule.attributeKey] matches rule.pattern
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Exercise 4: Pipeline
// Chains a receiver function, an array of processors, and an exporter function.
// ---------------------------------------------------------------------------
type ProcessorFn = (spans: SpanData[]) => SpanData[];

class Pipeline {
  private processors: ProcessorFn[];
  private exported: SpanData[][] = [];

  constructor(processors: ProcessorFn[]) {
    this.processors = processors;
  }

  receive(spans: SpanData[]): SpanData[] {
    // TODO: Pass spans through each processor in order
    // TODO: Store the final result in this.exported
    // TODO: Return the final result
    throw new Error('Not implemented');
  }

  getExported(): SpanData[][] {
    // TODO: Return all exported batches
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Exercise 5: TailSampler
// Keeps all error traces. For non-error traces, samples at the given rate.
// Uses traceId hash for deterministic sampling.
// ---------------------------------------------------------------------------
class TailSampler {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  shouldSample(span: SpanData): boolean {
    // TODO: Always keep ERROR spans
    // TODO: For non-error spans, use a hash of traceId to deterministically decide
    //       Hash: sum of charCodes of traceId characters, mod 100, compare to sampleRate * 100
    throw new Error('Not implemented');
  }

  process(spans: SpanData[]): SpanData[] {
    // TODO: Return only spans where shouldSample returns true
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeSpan(overrides: Partial<SpanData> = {}): SpanData {
  return {
    traceId: 'trace-' + Math.random().toString(36).slice(2, 10),
    spanId: 'span-' + Math.random().toString(36).slice(2, 10),
    operationName: 'test-op',
    attributes: {},
    status: 'OK',
    durationMs: 50,
    ...overrides,
  };
}

function makeSampleConfig(): CollectorConfig {
  return {
    receivers: {
      otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317' }, http: { endpoint: '0.0.0.0:4318' } } },
      prometheus: { endpoint: '0.0.0.0:8888' },
    },
    processors: {
      batch: { timeout: '5s', send_batch_size: 1024 },
      memory_limiter: { limit_mib: 512 },
    },
    exporters: {
      otlp: { endpoint: 'tempo:4317' },
      logging: { loglevel: 'debug' },
    },
    service: {
      pipelines: {
        traces: { receivers: ['otlp'], processors: ['batch', 'memory_limiter'], exporters: ['otlp', 'logging'] },
        metrics: { receivers: ['otlp', 'prometheus'], processors: ['batch'], exporters: ['logging'] },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 08 — OTel Collector ---\n');

  // Ex 1
  await test('Ex1 — Parse valid config', () => {
    const result = parseCollectorConfig(makeSampleConfig());
    assertEqual(result.receivers.length, 2);
    assertEqual(result.processors.length, 2);
    assertEqual(result.exporters.length, 2);
    assertEqual(result.pipelines.length, 2);
    assertEqual(result.valid, true);
    assertEqual(result.errors.length, 0);
  });

  await test('Ex1 — Detect invalid pipeline reference', () => {
    const config = makeSampleConfig();
    config.service.pipelines['bad'] = { receivers: ['nonexistent'], processors: [], exporters: ['otlp'] };
    const result = parseCollectorConfig(config);
    assertEqual(result.valid, false);
    assert(result.errors.length > 0, 'should have errors');
  });

  // Ex 2
  await test('Ex2 — BatchProcessor flushes at batchSize', () => {
    const flushed: SpanData[][] = [];
    const bp = new BatchProcessor(3, (batch) => flushed.push(batch));
    bp.process(makeSpan());
    bp.process(makeSpan());
    assertEqual(bp.pending, 2);
    bp.process(makeSpan());
    assertEqual(bp.flushCount, 1);
    assertEqual(flushed.length, 1);
    assertEqual(flushed[0].length, 3);
    assertEqual(bp.pending, 0);
  });

  await test('Ex2 — BatchProcessor manual flush', () => {
    const flushed: SpanData[][] = [];
    const bp = new BatchProcessor(10, (batch) => flushed.push(batch));
    bp.process(makeSpan());
    bp.process(makeSpan());
    const result = bp.flush();
    assertEqual(result.length, 2);
    assertEqual(bp.pending, 0);
  });

  await test('Ex2 — BatchProcessor flush empty buffer', () => {
    const bp = new BatchProcessor(5, () => {});
    const result = bp.flush();
    assertEqual(result.length, 0);
  });

  // Ex 3
  await test('Ex3 — FilterProcessor exclude rule', () => {
    const fp = new FilterProcessor([
      { action: 'exclude', attributeKey: 'http.route', pattern: '/health' },
    ]);
    const spans = [
      makeSpan({ attributes: { 'http.route': '/health' } }),
      makeSpan({ attributes: { 'http.route': '/api/users' } }),
    ];
    const result = fp.process(spans);
    assertEqual(result.length, 1);
    assertEqual(result[0].attributes['http.route'], '/api/users');
  });

  await test('Ex3 — FilterProcessor include rule with wildcard', () => {
    const fp = new FilterProcessor([
      { action: 'include', attributeKey: 'service.name', pattern: '*' },
    ]);
    const spans = [
      makeSpan({ attributes: { 'service.name': 'api' } }),
      makeSpan({ attributes: {} }),
    ];
    const result = fp.process(spans);
    assertEqual(result.length, 1);
  });

  // Ex 4
  await test('Ex4 — Pipeline chains processors', () => {
    const addAttr: ProcessorFn = (spans) =>
      spans.map(s => ({ ...s, attributes: { ...s.attributes, processed: 'true' } }));
    const filterOk: ProcessorFn = (spans) => spans.filter(s => s.status === 'OK');
    const pipeline = new Pipeline([addAttr, filterOk]);
    const spans = [makeSpan({ status: 'OK' }), makeSpan({ status: 'ERROR' })];
    const result = pipeline.receive(spans);
    assertEqual(result.length, 1);
    assertEqual(result[0].attributes['processed'], 'true');
    assertEqual(pipeline.getExported().length, 1);
  });

  // Ex 5
  await test('Ex5 — TailSampler keeps errors', () => {
    const sampler = new TailSampler(0.0); // 0% sample rate for non-errors
    const errorSpan = makeSpan({ status: 'ERROR' });
    assert(sampler.shouldSample(errorSpan), 'ERROR spans should always be kept');
  });

  await test('Ex5 — TailSampler deterministic', () => {
    const sampler = new TailSampler(0.5);
    const span = makeSpan({ traceId: 'deterministic-trace-id' });
    const result1 = sampler.shouldSample(span);
    const result2 = sampler.shouldSample(span);
    assertEqual(result1, result2);
  });

  await test('Ex5 — TailSampler process filters', () => {
    const sampler = new TailSampler(0.0);
    const spans = [
      makeSpan({ status: 'ERROR', traceId: 'err-1' }),
      makeSpan({ status: 'OK', traceId: 'ok-1' }),
      makeSpan({ status: 'OK', traceId: 'ok-2' }),
    ];
    const result = sampler.process(spans);
    assertEqual(result.length, 1);
    assertEqual(result[0].status, 'ERROR');
  });

  summary();
}

main();

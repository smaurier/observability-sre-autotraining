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
// ---------------------------------------------------------------------------
function parseCollectorConfig(config: CollectorConfig): {
  receivers: string[];
  processors: string[];
  exporters: string[];
  pipelines: string[];
  valid: boolean;
  errors: string[];
} {
  const receivers = Object.keys(config.receivers);
  const processors = Object.keys(config.processors);
  const exporters = Object.keys(config.exporters);
  const pipelines = Object.keys(config.service.pipelines);
  const errors: string[] = [];

  for (const [pipelineName, pipeline] of Object.entries(config.service.pipelines)) {
    for (const r of pipeline.receivers) {
      if (!receivers.includes(r)) {
        errors.push(`Pipeline "${pipelineName}" references unknown receiver "${r}"`);
      }
    }
    for (const p of pipeline.processors) {
      if (!processors.includes(p)) {
        errors.push(`Pipeline "${pipelineName}" references unknown processor "${p}"`);
      }
    }
    for (const e of pipeline.exporters) {
      if (!exporters.includes(e)) {
        errors.push(`Pipeline "${pipelineName}" references unknown exporter "${e}"`);
      }
    }
  }

  return {
    receivers,
    processors,
    exporters,
    pipelines,
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Exercise 2: BatchProcessor
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
    this.buffer.push(span);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): SpanData[] {
    if (this.buffer.length === 0) return [];
    const batch = [...this.buffer];
    this.buffer = [];
    this.onFlush(batch);
    this.flushCount++;
    return batch;
  }

  get pending(): number {
    return this.buffer.length;
  }
}

// ---------------------------------------------------------------------------
// Exercise 3: FilterProcessor
// ---------------------------------------------------------------------------
interface FilterRule {
  action: 'include' | 'exclude';
  attributeKey: string;
  pattern: string;
}

class FilterProcessor {
  private rules: FilterRule[];

  constructor(rules: FilterRule[]) {
    this.rules = rules;
  }

  process(spans: SpanData[]): SpanData[] {
    return spans.filter(span => {
      for (const rule of this.rules) {
        if (this.matches(span, rule)) {
          return rule.action === 'include';
        }
      }
      // No rule matched — keep by default
      return true;
    });
  }

  private matches(span: SpanData, rule: FilterRule): boolean {
    const value = span.attributes[rule.attributeKey];
    if (value === undefined) return false;
    if (rule.pattern === '*') return true;
    return String(value) === rule.pattern;
  }
}

// ---------------------------------------------------------------------------
// Exercise 4: Pipeline
// ---------------------------------------------------------------------------
type ProcessorFn = (spans: SpanData[]) => SpanData[];

class Pipeline {
  private processors: ProcessorFn[];
  private exported: SpanData[][] = [];

  constructor(processors: ProcessorFn[]) {
    this.processors = processors;
  }

  receive(spans: SpanData[]): SpanData[] {
    let result = spans;
    for (const processor of this.processors) {
      result = processor(result);
    }
    this.exported.push(result);
    return result;
  }

  getExported(): SpanData[][] {
    return this.exported;
  }
}

// ---------------------------------------------------------------------------
// Exercise 5: TailSampler
// ---------------------------------------------------------------------------
class TailSampler {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  shouldSample(span: SpanData): boolean {
    // Always keep ERROR spans
    if (span.status === 'ERROR') return true;

    // Deterministic sampling based on traceId hash
    let hash = 0;
    for (const ch of span.traceId) {
      hash += ch.charCodeAt(0);
    }
    return (hash % 100) < (this.sampleRate * 100);
  }

  process(spans: SpanData[]): SpanData[] {
    return spans.filter(span => this.shouldSample(span));
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

  await test('Ex1 — Receiver names extracted correctly', () => {
    const result = parseCollectorConfig(makeSampleConfig());
    assert(result.receivers.includes('otlp'), 'should include otlp');
    assert(result.receivers.includes('prometheus'), 'should include prometheus');
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

  await test('Ex2 — BatchProcessor multiple flushes', () => {
    const flushed: SpanData[][] = [];
    const bp = new BatchProcessor(2, (batch) => flushed.push(batch));
    for (let i = 0; i < 5; i++) bp.process(makeSpan());
    assertEqual(bp.flushCount, 2);
    assertEqual(bp.pending, 1);
    bp.flush();
    assertEqual(bp.flushCount, 3);
    assertEqual(bp.pending, 0);
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

  await test('Ex3 — FilterProcessor no rules — keep all', () => {
    const fp = new FilterProcessor([]);
    const spans = [makeSpan(), makeSpan(), makeSpan()];
    const result = fp.process(spans);
    assertEqual(result.length, 3);
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

  await test('Ex4 — Pipeline with no processors', () => {
    const pipeline = new Pipeline([]);
    const spans = [makeSpan(), makeSpan()];
    const result = pipeline.receive(spans);
    assertEqual(result.length, 2);
  });

  await test('Ex4 — Pipeline tracks multiple receive calls', () => {
    const pipeline = new Pipeline([]);
    pipeline.receive([makeSpan()]);
    pipeline.receive([makeSpan(), makeSpan()]);
    assertEqual(pipeline.getExported().length, 2);
    assertEqual(pipeline.getExported()[0].length, 1);
    assertEqual(pipeline.getExported()[1].length, 2);
  });

  // Ex 5
  await test('Ex5 — TailSampler keeps errors', () => {
    const sampler = new TailSampler(0.0);
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

  await test('Ex5 — TailSampler 100% keeps all', () => {
    const sampler = new TailSampler(1.0);
    const spans = Array.from({ length: 20 }, (_, i) =>
      makeSpan({ status: 'OK', traceId: `trace-${i}` })
    );
    const result = sampler.process(spans);
    assertEqual(result.length, 20);
  });

  summary();
}

main();

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, summary } = createTestRunner('Lab 09 — PromQL & Grafana');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

interface LabeledTimeSeries {
  labels: Record<string, string>;
  points: TimeSeriesPoint[];
}

interface GrafanaPanel {
  id: number;
  title: string;
  type: 'timeseries' | 'gauge' | 'stat' | 'table';
  datasource: string;
  targets: Array<{ expr: string; legendFormat?: string }>;
  gridPos: { h: number; w: number; x: number; y: number };
}

interface GrafanaDashboard {
  title: string;
  uid: string;
  panels: GrafanaPanel[];
  time: { from: string; to: string };
  refresh: string;
}

// ---------------------------------------------------------------------------
// Exercise 1: rate()
// ---------------------------------------------------------------------------
function rate(series: TimeSeriesPoint[], rangeSeconds: number): number {
  if (series.length < 2) return 0;

  const latestTimestamp = series[series.length - 1].timestamp;
  const rangeMs = rangeSeconds * 1000;
  const windowStart = latestTimestamp - rangeMs;

  const inRange = series.filter(p => p.timestamp >= windowStart);
  if (inRange.length < 2) return 0;

  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const timeDiffMs = last.timestamp - first.timestamp;

  if (timeDiffMs === 0) return 0;

  return ((last.value - first.value) / timeDiffMs) * 1000;
}

// ---------------------------------------------------------------------------
// Exercise 2: increase()
// ---------------------------------------------------------------------------
function increase(series: TimeSeriesPoint[], rangeSeconds: number): number {
  if (series.length < 2) return 0;

  const latestTimestamp = series[series.length - 1].timestamp;
  const rangeMs = rangeSeconds * 1000;
  const windowStart = latestTimestamp - rangeMs;

  const inRange = series.filter(p => p.timestamp >= windowStart);
  if (inRange.length < 2) return 0;

  const first = inRange[0];
  const last = inRange[inRange.length - 1];

  return last.value - first.value;
}

// ---------------------------------------------------------------------------
// Exercise 3: histogram_quantile()
// ---------------------------------------------------------------------------
interface HistogramBucket {
  le: number;
  count: number;
}

function histogramQuantile(quantile: number, buckets: HistogramBucket[]): number {
  // Sort buckets by le (ascending), Infinity goes last
  const sorted = [...buckets].sort((a, b) => {
    if (a.le === Infinity) return 1;
    if (b.le === Infinity) return -1;
    return a.le - b.le;
  });

  // Total count is the count in the +Infinity bucket
  const totalCount = sorted[sorted.length - 1].count;
  if (totalCount === 0) return 0;

  const target = quantile * totalCount;

  // Find the bucket where cumulative count first exceeds or equals target
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].count >= target) {
      const upperBound = sorted[i].le;
      if (upperBound === Infinity) {
        // If target is in the +Inf bucket, return the previous bucket boundary
        return i > 0 ? sorted[i - 1].le : 0;
      }

      const lowerBound = i > 0 ? sorted[i - 1].le : 0;
      const countBelow = i > 0 ? sorted[i - 1].count : 0;
      const countInBucket = sorted[i].count - countBelow;

      if (countInBucket === 0) return lowerBound;

      // Linear interpolation within the bucket
      return lowerBound + (upperBound - lowerBound) * ((target - countBelow) / countInBucket);
    }
  }

  return sorted[sorted.length - 2]?.le || 0;
}

// ---------------------------------------------------------------------------
// Exercise 4: sum_by()
// ---------------------------------------------------------------------------
function sumBy(series: LabeledTimeSeries[], labelKey: string): LabeledTimeSeries[] {
  const groups = new Map<string, LabeledTimeSeries>();

  for (const s of series) {
    const labelValue = s.labels[labelKey] || '';
    if (!groups.has(labelValue)) {
      groups.set(labelValue, {
        labels: { [labelKey]: labelValue },
        points: [],
      });
    }

    const group = groups.get(labelValue)!;
    for (const point of s.points) {
      const existing = group.points.find(p => p.timestamp === point.timestamp);
      if (existing) {
        existing.value += point.value;
      } else {
        group.points.push({ timestamp: point.timestamp, value: point.value });
      }
    }
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Exercise 5: Generate Grafana panel JSON
// ---------------------------------------------------------------------------
function createGrafanaPanel(opts: {
  id: number;
  title: string;
  type: GrafanaPanel['type'];
  expr: string;
  legendFormat?: string;
  datasource?: string;
  gridPos?: { h: number; w: number; x: number; y: number };
}): GrafanaPanel {
  return {
    id: opts.id,
    title: opts.title,
    type: opts.type,
    datasource: opts.datasource || 'Prometheus',
    targets: [{ expr: opts.expr, legendFormat: opts.legendFormat }],
    gridPos: opts.gridPos || { h: 8, w: 12, x: 0, y: 0 },
  };
}

// ---------------------------------------------------------------------------
// Exercise 6: Generate complete Grafana dashboard JSON
// ---------------------------------------------------------------------------
function createGrafanaDashboard(opts: {
  title: string;
  uid: string;
  panels: GrafanaPanel[];
  timeFrom?: string;
  timeTo?: string;
  refresh?: string;
}): GrafanaDashboard {
  return {
    title: opts.title,
    uid: opts.uid,
    panels: opts.panels,
    time: {
      from: opts.timeFrom || 'now-1h',
      to: opts.timeTo || 'now',
    },
    refresh: opts.refresh || '30s',
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function makeCounterSeries(count: number, intervalMs: number, ratePerSecond: number): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  const startTime = Date.now() - count * intervalMs;
  let value = 0;
  for (let i = 0; i < count; i++) {
    value += ratePerSecond * (intervalMs / 1000);
    points.push({ timestamp: startTime + i * intervalMs, value });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 09 — PromQL & Grafana ---\n');

  // Ex 1
  await test('Ex1 — rate() basic counter', () => {
    const series = makeCounterSeries(60, 1000, 10);
    const r = rate(series, 60);
    assert(Math.abs(r - 10) < 1, `rate should be ~10/s, got ${r}`);
  });

  await test('Ex1 — rate() empty series', () => {
    assertEqual(rate([], 60), 0);
  });

  await test('Ex1 — rate() single point', () => {
    assertEqual(rate([{ timestamp: Date.now(), value: 100 }], 60), 0);
  });

  await test('Ex1 — rate() known values', () => {
    const now = Date.now();
    const series: TimeSeriesPoint[] = [
      { timestamp: now - 10000, value: 0 },
      { timestamp: now, value: 100 },
    ];
    const r = rate(series, 15);
    assert(Math.abs(r - 10) < 0.1, `rate should be 10/s, got ${r}`);
  });

  // Ex 2
  await test('Ex2 — increase() over 60s', () => {
    const series = makeCounterSeries(60, 1000, 5);
    const inc = increase(series, 60);
    assert(Math.abs(inc - 295) < 10, `increase should be ~295, got ${inc}`);
  });

  await test('Ex2 — increase() empty series', () => {
    assertEqual(increase([], 60), 0);
  });

  await test('Ex2 — increase() known values', () => {
    const now = Date.now();
    const series: TimeSeriesPoint[] = [
      { timestamp: now - 5000, value: 100 },
      { timestamp: now, value: 250 },
    ];
    const inc = increase(series, 10);
    assertEqual(inc, 150);
  });

  // Ex 3
  await test('Ex3 — histogram_quantile p50', () => {
    const buckets: HistogramBucket[] = [
      { le: 0.05, count: 100 },
      { le: 0.1, count: 300 },
      { le: 0.25, count: 700 },
      { le: 0.5, count: 900 },
      { le: 1.0, count: 950 },
      { le: Infinity, count: 1000 },
    ];
    const p50 = histogramQuantile(0.5, buckets);
    assert(p50 >= 0.05 && p50 <= 0.25, `p50 should be between 0.05 and 0.25, got ${p50}`);
  });

  await test('Ex3 — histogram_quantile p99', () => {
    const buckets: HistogramBucket[] = [
      { le: 0.1, count: 900 },
      { le: 0.5, count: 980 },
      { le: 1.0, count: 995 },
      { le: Infinity, count: 1000 },
    ];
    const p99 = histogramQuantile(0.99, buckets);
    assert(p99 >= 0.5 && p99 <= 1.0, `p99 should be between 0.5 and 1.0, got ${p99}`);
  });

  await test('Ex3 — histogram_quantile p0', () => {
    const buckets: HistogramBucket[] = [
      { le: 0.1, count: 500 },
      { le: Infinity, count: 1000 },
    ];
    const p0 = histogramQuantile(0, buckets);
    assertEqual(p0, 0);
  });

  // Ex 4
  await test('Ex4 — sum_by groups correctly', () => {
    const ts = Date.now();
    const series: LabeledTimeSeries[] = [
      { labels: { method: 'GET', handler: '/a' }, points: [{ timestamp: ts, value: 10 }] },
      { labels: { method: 'GET', handler: '/b' }, points: [{ timestamp: ts, value: 20 }] },
      { labels: { method: 'POST', handler: '/a' }, points: [{ timestamp: ts, value: 5 }] },
    ];
    const result = sumBy(series, 'method');
    assertEqual(result.length, 2);
    const getGroup = result.find(r => r.labels['method'] === 'GET');
    assert(getGroup !== undefined, 'GET group should exist');
    assertEqual(getGroup!.points[0].value, 30);
  });

  await test('Ex4 — sum_by single group', () => {
    const ts = Date.now();
    const series: LabeledTimeSeries[] = [
      { labels: { env: 'prod' }, points: [{ timestamp: ts, value: 10 }] },
      { labels: { env: 'prod' }, points: [{ timestamp: ts, value: 7 }] },
    ];
    const result = sumBy(series, 'env');
    assertEqual(result.length, 1);
    assertEqual(result[0].points[0].value, 17);
  });

  // Ex 5
  await test('Ex5 — Create Grafana panel', () => {
    const panel = createGrafanaPanel({
      id: 1,
      title: 'Request Rate',
      type: 'timeseries',
      expr: 'rate(http_requests_total[5m])',
      legendFormat: '{{method}}',
    });
    assertEqual(panel.id, 1);
    assertEqual(panel.title, 'Request Rate');
    assertEqual(panel.type, 'timeseries');
    assertEqual(panel.datasource, 'Prometheus');
    assertEqual(panel.targets.length, 1);
    assertEqual(panel.targets[0].expr, 'rate(http_requests_total[5m])');
  });

  await test('Ex5 — Panel default gridPos', () => {
    const panel = createGrafanaPanel({
      id: 2,
      title: 'Test',
      type: 'gauge',
      expr: 'up',
    });
    assertEqual(panel.gridPos.h, 8);
    assertEqual(panel.gridPos.w, 12);
  });

  await test('Ex5 — Panel custom datasource', () => {
    const panel = createGrafanaPanel({
      id: 3,
      title: 'Loki',
      type: 'table',
      expr: '{app="api"}',
      datasource: 'Loki',
    });
    assertEqual(panel.datasource, 'Loki');
  });

  // Ex 6
  await test('Ex6 — Create Grafana dashboard', () => {
    const panel = createGrafanaPanel({ id: 1, title: 'P1', type: 'stat', expr: 'up' });
    const dashboard = createGrafanaDashboard({
      title: 'My Dashboard',
      uid: 'my-dash',
      panels: [panel],
    });
    assertEqual(dashboard.title, 'My Dashboard');
    assertEqual(dashboard.uid, 'my-dash');
    assertEqual(dashboard.panels.length, 1);
    assertEqual(dashboard.time.from, 'now-1h');
    assertEqual(dashboard.time.to, 'now');
    assertEqual(dashboard.refresh, '30s');
  });

  await test('Ex6 — Dashboard custom time range', () => {
    const dashboard = createGrafanaDashboard({
      title: 'Custom',
      uid: 'custom',
      panels: [],
      timeFrom: 'now-6h',
      timeTo: 'now',
      refresh: '1m',
    });
    assertEqual(dashboard.time.from, 'now-6h');
    assertEqual(dashboard.refresh, '1m');
  });

  await test('Ex6 — Dashboard with multiple panels', () => {
    const panels = [
      createGrafanaPanel({ id: 1, title: 'P1', type: 'stat', expr: 'up' }),
      createGrafanaPanel({ id: 2, title: 'P2', type: 'timeseries', expr: 'rate(http_requests_total[5m])' }),
      createGrafanaPanel({ id: 3, title: 'P3', type: 'gauge', expr: 'process_cpu_seconds_total' }),
    ];
    const dashboard = createGrafanaDashboard({ title: 'Multi', uid: 'multi', panels });
    assertEqual(dashboard.panels.length, 3);
  });

  summary();
}

main();

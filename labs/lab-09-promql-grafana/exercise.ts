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
// Calculates the per-second rate of a counter time series over a range.
// rate = (last_value - first_value) / (last_timestamp - first_timestamp) in seconds
// ---------------------------------------------------------------------------
function rate(series: TimeSeriesPoint[], rangeSeconds: number): number {
  // TODO: Take the last `rangeSeconds` worth of points from the series
  // TODO: Compute (lastValue - firstValue) / (lastTimestamp - firstTimestamp) * 1000
  //       (timestamps are in ms, we want per-second rate)
  // TODO: If fewer than 2 points or range is 0, return 0
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: increase()
// Calculates the total increase of a counter over a range.
// increase = last_value - first_value (over range window)
// ---------------------------------------------------------------------------
function increase(series: TimeSeriesPoint[], rangeSeconds: number): number {
  // TODO: Take the last `rangeSeconds` worth of points from the series
  // TODO: Return lastValue - firstValue
  // TODO: If fewer than 2 points, return 0
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 3: histogram_quantile()
// Given bucket boundaries and cumulative counts, compute the estimated quantile.
// Uses linear interpolation within the bucket that contains the target count.
// ---------------------------------------------------------------------------
interface HistogramBucket {
  le: number;       // upper boundary (le = "less than or equal")
  count: number;    // cumulative count
}

function histogramQuantile(quantile: number, buckets: HistogramBucket[]): number {
  // TODO: Sort buckets by le
  // TODO: Find total count from the +Infinity bucket (largest le)
  // TODO: Calculate target = quantile * totalCount
  // TODO: Find the bucket where cumulative count first exceeds target
  // TODO: Linearly interpolate within that bucket
  //       result = lowerBound + (upperBound - lowerBound) * (target - countBelow) / (countInBucket)
  // TODO: Return the estimated quantile value
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 4: sum_by()
// Groups labeled time series by a label key and sums their values point-wise.
// ---------------------------------------------------------------------------
function sumBy(series: LabeledTimeSeries[], labelKey: string): LabeledTimeSeries[] {
  // TODO: Group series by the value of labelKey
  // TODO: For each group, sum values at matching timestamps
  // TODO: Return one LabeledTimeSeries per group
  throw new Error('Not implemented');
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
  // TODO: Return a GrafanaPanel object with defaults:
  //   datasource: 'Prometheus'
  //   gridPos: { h: 8, w: 12, x: 0, y: 0 }
  throw new Error('Not implemented');
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
  // TODO: Return a GrafanaDashboard object with defaults:
  //   time: { from: 'now-1h', to: 'now' }
  //   refresh: '30s'
  throw new Error('Not implemented');
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
    const series = makeCounterSeries(60, 1000, 10); // 60 points, 1s apart, 10/s rate
    const r = rate(series, 60);
    assert(Math.abs(r - 10) < 1, `rate should be ~10/s, got ${r}`);
  });

  await test('Ex1 — rate() empty series', () => {
    assertEqual(rate([], 60), 0);
  });

  await test('Ex1 — rate() single point', () => {
    assertEqual(rate([{ timestamp: Date.now(), value: 100 }], 60), 0);
  });

  // Ex 2
  await test('Ex2 — increase() over 60s', () => {
    const series = makeCounterSeries(60, 1000, 5); // 5/s for 60s = 300 total
    const inc = increase(series, 60);
    assert(Math.abs(inc - 295) < 10, `increase should be ~295, got ${inc}`);
  });

  await test('Ex2 — increase() empty series', () => {
    assertEqual(increase([], 60), 0);
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

  summary();
}

main();

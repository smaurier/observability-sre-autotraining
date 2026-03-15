import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } =
  createTestRunner('Lab 17 — Observability as Code');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GrafanaPanel {
  id: number;
  title: string;
  type: 'timeseries' | 'gauge' | 'stat' | 'table' | 'heatmap';
  datasource: string;
  targets: Array<{ expr: string; legendFormat?: string; refId: string }>;
  gridPos: { h: number; w: number; x: number; y: number };
  fieldConfig?: Record<string, unknown>;
}

interface GrafanaDashboard {
  uid: string;
  title: string;
  tags: string[];
  panels: GrafanaPanel[];
  time: { from: string; to: string };
  refresh: string;
  templating?: { list: Array<{ name: string; type: string; query: string }> };
}

interface PrometheusAlertRule {
  alert: string;
  expr: string;
  for: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface PrometheusRuleGroup {
  name: string;
  interval?: string;
  rules: PrometheusAlertRule[];
}

interface RecordingRule {
  record: string;
  expr: string;
  labels?: Record<string, string>;
}

interface RecordingRuleGroup {
  name: string;
  interval?: string;
  rules: RecordingRule[];
}

// ---------------------------------------------------------------------------
// Exercise 1: Generate Grafana panel JSON
// ---------------------------------------------------------------------------
function generatePanel(opts: {
  id: number;
  title: string;
  type: GrafanaPanel['type'];
  queries: Array<{ expr: string; legend?: string }>;
  datasource?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}): GrafanaPanel {
  // TODO: Return a GrafanaPanel with:
  //   - datasource defaults to 'Prometheus'
  //   - gridPos defaults to { h: 8, w: 12, x: 0, y: 0 }
  //   - targets built from queries with refId = 'A', 'B', 'C', ...
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 2: Generate complete Grafana dashboard
// ---------------------------------------------------------------------------
function generateDashboard(opts: {
  uid: string;
  title: string;
  tags?: string[];
  panels: GrafanaPanel[];
  timeFrom?: string;
  timeTo?: string;
  refresh?: string;
  variables?: Array<{ name: string; type: string; query: string }>;
}): GrafanaDashboard {
  // TODO: Return a GrafanaDashboard with:
  //   - tags defaults to []
  //   - time defaults to { from: 'now-1h', to: 'now' }
  //   - refresh defaults to '30s'
  //   - templating.list built from variables (or empty)
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 3: Generate Prometheus alerting rules YAML string
// ---------------------------------------------------------------------------
function generateAlertRules(
  serviceName: string,
  sloTarget: number // e.g. 0.999
): PrometheusRuleGroup {
  // TODO: Generate a rule group with at least 3 alerting rules:
  //   1. High error rate alert (burn rate > 14.4 over 1h, for: '2m')
  //   2. Slow burn alert (burn rate > 6 over 6h, for: '15m')
  //   3. High latency alert (p99 > 1s, for: '5m')
  //
  // Formulas:
  //   burn rate expr: `(sum(rate(http_requests_total{service="${serviceName}",code=~"5.."}[1h])) / sum(rate(http_requests_total{service="${serviceName}"}[1h]))) / ${errorBudgetRate}`
  //   where errorBudgetRate = 1 - sloTarget
  //
  // Each rule should have labels: { severity, service } and annotations: { summary, description }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 4: Generate SLO recording rules
// ---------------------------------------------------------------------------
function generateSLORecordingRules(
  serviceName: string,
  sloTarget: number
): RecordingRuleGroup {
  // TODO: Generate recording rules:
  //   1. `slo:${serviceName}:errors:rate5m` = rate of 5xx errors over 5m
  //   2. `slo:${serviceName}:requests:rate5m` = total request rate over 5m
  //   3. `slo:${serviceName}:availability` = 1 - (errors / requests)
  //   4. `slo:${serviceName}:error_budget:remaining` = 1 - (error_rate / error_budget)
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Exercise 5: Validate generated configs
// ---------------------------------------------------------------------------
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateDashboard(dashboard: GrafanaDashboard): ValidationResult {
  // TODO: Check:
  //   - uid is non-empty
  //   - title is non-empty
  //   - panels have unique IDs
  //   - each panel has at least one target
  //   - each target has a non-empty expr
  // Return { valid, errors, warnings }
  throw new Error('Not implemented');
}

function validateAlertRules(group: PrometheusRuleGroup): ValidationResult {
  // TODO: Check:
  //   - group name is non-empty
  //   - each rule has alert, expr, for, labels.severity, annotations.summary
  //   - 'for' duration is valid format (e.g. '5m', '1h')
  // Return { valid, errors, warnings }
  throw new Error('Not implemented');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n--- Lab 17 — Observability as Code ---\n');

  // Ex 1
  await test('Ex1 — Generate panel with defaults', () => {
    const panel = generatePanel({
      id: 1,
      title: 'Request Rate',
      type: 'timeseries',
      queries: [{ expr: 'rate(http_requests_total[5m])', legend: '{{method}}' }],
    });
    assertEqual(panel.id, 1);
    assertEqual(panel.title, 'Request Rate');
    assertEqual(panel.datasource, 'Prometheus');
    assertEqual(panel.targets[0].refId, 'A');
    assertEqual(panel.gridPos.h, 8);
  });

  await test('Ex1 — Generate panel with multiple queries', () => {
    const panel = generatePanel({
      id: 2,
      title: 'Multi',
      type: 'timeseries',
      queries: [
        { expr: 'rate(http_requests_total{code="200"}[5m])' },
        { expr: 'rate(http_requests_total{code="500"}[5m])' },
      ],
    });
    assertEqual(panel.targets.length, 2);
    assertEqual(panel.targets[0].refId, 'A');
    assertEqual(panel.targets[1].refId, 'B');
  });

  await test('Ex1 — Generate panel with custom gridPos', () => {
    const panel = generatePanel({
      id: 3,
      title: 'Custom',
      type: 'gauge',
      queries: [{ expr: 'up' }],
      width: 6,
      height: 4,
      x: 12,
      y: 8,
    });
    assertEqual(panel.gridPos.w, 6);
    assertEqual(panel.gridPos.h, 4);
    assertEqual(panel.gridPos.x, 12);
    assertEqual(panel.gridPos.y, 8);
  });

  // Ex 2
  await test('Ex2 — Generate dashboard with defaults', () => {
    const panel = generatePanel({ id: 1, title: 'P', type: 'stat', queries: [{ expr: 'up' }] });
    const dash = generateDashboard({ uid: 'svc-dash', title: 'Service Dashboard', panels: [panel] });
    assertEqual(dash.uid, 'svc-dash');
    assertEqual(dash.title, 'Service Dashboard');
    assertEqual(dash.time.from, 'now-1h');
    assertEqual(dash.refresh, '30s');
    assertDeepEqual(dash.tags, []);
  });

  await test('Ex2 — Dashboard with variables', () => {
    const dash = generateDashboard({
      uid: 'var-dash',
      title: 'With Vars',
      panels: [],
      variables: [{ name: 'service', type: 'query', query: 'label_values(service)' }],
    });
    assert(dash.templating !== undefined, 'should have templating');
    assertEqual(dash.templating!.list.length, 1);
    assertEqual(dash.templating!.list[0].name, 'service');
  });

  // Ex 3
  await test('Ex3 — Generate alert rules', () => {
    const group = generateAlertRules('order-service', 0.999);
    assert(group.rules.length >= 3, 'should have at least 3 rules');
    assertEqual(group.name.length > 0, true);
    for (const rule of group.rules) {
      assert(rule.alert.length > 0, 'alert name should exist');
      assert(rule.expr.length > 0, 'expr should exist');
      assert(rule.labels.severity !== undefined, 'severity label should exist');
      assert(rule.annotations.summary !== undefined, 'summary annotation should exist');
    }
  });

  await test('Ex3 — Alert rules reference service name', () => {
    const group = generateAlertRules('payment-api', 0.999);
    for (const rule of group.rules) {
      assertIncludes(rule.expr, 'payment-api');
    }
  });

  // Ex 4
  await test('Ex4 — SLO recording rules', () => {
    const group = generateSLORecordingRules('api-gateway', 0.999);
    assert(group.rules.length >= 4, 'should have at least 4 recording rules');
    const recordNames = group.rules.map(r => r.record);
    assert(recordNames.some(n => n.includes('errors')), 'should have errors rule');
    assert(recordNames.some(n => n.includes('requests')), 'should have requests rule');
    assert(recordNames.some(n => n.includes('availability')), 'should have availability rule');
    assert(recordNames.some(n => n.includes('error_budget')), 'should have error_budget rule');
  });

  await test('Ex4 — Recording rules have valid expressions', () => {
    const group = generateSLORecordingRules('my-svc', 0.99);
    for (const rule of group.rules) {
      assert(rule.record.length > 0, 'record name should exist');
      assert(rule.expr.length > 0, 'expr should exist');
    }
  });

  // Ex 5
  await test('Ex5 — Validate valid dashboard', () => {
    const panel = generatePanel({ id: 1, title: 'P', type: 'stat', queries: [{ expr: 'up' }] });
    const dash = generateDashboard({ uid: 'valid', title: 'Valid', panels: [panel] });
    const result = validateDashboard(dash);
    assertEqual(result.valid, true);
    assertEqual(result.errors.length, 0);
  });

  await test('Ex5 — Validate dashboard with duplicate panel IDs', () => {
    const p1 = generatePanel({ id: 1, title: 'P1', type: 'stat', queries: [{ expr: 'up' }] });
    const p2 = generatePanel({ id: 1, title: 'P2', type: 'gauge', queries: [{ expr: 'up' }] });
    const dash = generateDashboard({ uid: 'dup', title: 'Dup', panels: [p1, p2] });
    const result = validateDashboard(dash);
    assertEqual(result.valid, false);
    assert(result.errors.length > 0, 'should have errors');
  });

  await test('Ex5 — Validate alert rules', () => {
    const group = generateAlertRules('test-svc', 0.999);
    const result = validateAlertRules(group);
    assertEqual(result.valid, true);
    assertEqual(result.errors.length, 0);
  });

  await test('Ex5 — Validate alert rules with missing fields', () => {
    const badGroup: PrometheusRuleGroup = {
      name: '',
      rules: [{ alert: '', expr: '', for: '', labels: {}, annotations: {} }],
    };
    const result = validateAlertRules(badGroup);
    assertEqual(result.valid, false);
    assert(result.errors.length > 0, 'should have errors');
  });

  summary();
}

main();

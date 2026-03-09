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
  const refIds = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return {
    id: opts.id,
    title: opts.title,
    type: opts.type,
    datasource: opts.datasource || 'Prometheus',
    targets: opts.queries.map((q, i) => ({
      expr: q.expr,
      legendFormat: q.legend,
      refId: refIds[i] || `ref-${i}`,
    })),
    gridPos: {
      h: opts.height || 8,
      w: opts.width || 12,
      x: opts.x || 0,
      y: opts.y || 0,
    },
  };
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
  const dashboard: GrafanaDashboard = {
    uid: opts.uid,
    title: opts.title,
    tags: opts.tags || [],
    panels: opts.panels,
    time: {
      from: opts.timeFrom || 'now-1h',
      to: opts.timeTo || 'now',
    },
    refresh: opts.refresh || '30s',
  };

  if (opts.variables && opts.variables.length > 0) {
    dashboard.templating = {
      list: opts.variables.map(v => ({ name: v.name, type: v.type, query: v.query })),
    };
  }

  return dashboard;
}

// ---------------------------------------------------------------------------
// Exercise 3: Generate Prometheus alerting rules
// ---------------------------------------------------------------------------
function generateAlertRules(
  serviceName: string,
  sloTarget: number
): PrometheusRuleGroup {
  const errorBudgetRate = 1 - sloTarget;

  return {
    name: `${serviceName}-slo-alerts`,
    rules: [
      {
        alert: `${serviceName}_HighErrorRate`,
        expr: `(sum(rate(http_requests_total{service="${serviceName}",code=~"5.."}[1h])) / sum(rate(http_requests_total{service="${serviceName}"}[1h]))) / ${errorBudgetRate} > 14.4`,
        for: '2m',
        labels: { severity: 'critical', service: serviceName },
        annotations: {
          summary: `High error rate burn on ${serviceName}`,
          description: `Error budget burn rate is above 14.4x for ${serviceName}. The 1h error rate significantly exceeds the SLO target of ${(sloTarget * 100).toFixed(1)}%.`,
        },
      },
      {
        alert: `${serviceName}_SlowBurnErrorRate`,
        expr: `(sum(rate(http_requests_total{service="${serviceName}",code=~"5.."}[6h])) / sum(rate(http_requests_total{service="${serviceName}"}[6h]))) / ${errorBudgetRate} > 6`,
        for: '15m',
        labels: { severity: 'warning', service: serviceName },
        annotations: {
          summary: `Slow burn error rate on ${serviceName}`,
          description: `Error budget burn rate is above 6x over 6h for ${serviceName}. The service is slowly consuming its error budget.`,
        },
      },
      {
        alert: `${serviceName}_HighLatency`,
        expr: `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m])) by (le)) > 1`,
        for: '5m',
        labels: { severity: 'warning', service: serviceName },
        annotations: {
          summary: `High p99 latency on ${serviceName}`,
          description: `The p99 latency for ${serviceName} exceeds 1 second over the last 5 minutes.`,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Exercise 4: Generate SLO recording rules
// ---------------------------------------------------------------------------
function generateSLORecordingRules(
  serviceName: string,
  sloTarget: number
): RecordingRuleGroup {
  const errorBudgetRate = 1 - sloTarget;

  return {
    name: `${serviceName}-slo-recording-rules`,
    interval: '30s',
    rules: [
      {
        record: `slo:${serviceName}:errors:rate5m`,
        expr: `sum(rate(http_requests_total{service="${serviceName}",code=~"5.."}[5m]))`,
        labels: { service: serviceName },
      },
      {
        record: `slo:${serviceName}:requests:rate5m`,
        expr: `sum(rate(http_requests_total{service="${serviceName}"}[5m]))`,
        labels: { service: serviceName },
      },
      {
        record: `slo:${serviceName}:availability`,
        expr: `1 - (slo:${serviceName}:errors:rate5m / slo:${serviceName}:requests:rate5m)`,
        labels: { service: serviceName },
      },
      {
        record: `slo:${serviceName}:error_budget:remaining`,
        expr: `1 - ((1 - slo:${serviceName}:availability) / ${errorBudgetRate})`,
        labels: { service: serviceName },
      },
    ],
  };
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
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!dashboard.uid || dashboard.uid.length === 0) {
    errors.push('Dashboard uid is required');
  }
  if (!dashboard.title || dashboard.title.length === 0) {
    errors.push('Dashboard title is required');
  }

  // Check for duplicate panel IDs
  const panelIds = new Set<number>();
  for (const panel of dashboard.panels) {
    if (panelIds.has(panel.id)) {
      errors.push(`Duplicate panel id: ${panel.id}`);
    }
    panelIds.add(panel.id);

    if (!panel.targets || panel.targets.length === 0) {
      errors.push(`Panel "${panel.title}" (id=${panel.id}) has no targets`);
    } else {
      for (const target of panel.targets) {
        if (!target.expr || target.expr.length === 0) {
          errors.push(`Panel "${panel.title}" (id=${panel.id}) has a target with empty expr`);
        }
      }
    }
  }

  if (dashboard.panels.length === 0) {
    warnings.push('Dashboard has no panels');
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAlertRules(group: PrometheusRuleGroup): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const durationPattern = /^\d+[smhd]$/;

  if (!group.name || group.name.length === 0) {
    errors.push('Rule group name is required');
  }

  for (const rule of group.rules) {
    if (!rule.alert || rule.alert.length === 0) {
      errors.push('Alert name is required');
    }
    if (!rule.expr || rule.expr.length === 0) {
      errors.push(`Alert "${rule.alert || '(unnamed)'}": expr is required`);
    }
    if (!rule.for || rule.for.length === 0) {
      errors.push(`Alert "${rule.alert || '(unnamed)'}": 'for' duration is required`);
    } else if (!durationPattern.test(rule.for)) {
      errors.push(`Alert "${rule.alert}": 'for' value "${rule.for}" is not a valid duration`);
    }
    if (!rule.labels?.severity) {
      errors.push(`Alert "${rule.alert || '(unnamed)'}": labels.severity is required`);
    }
    if (!rule.annotations?.summary) {
      errors.push(`Alert "${rule.alert || '(unnamed)'}": annotations.summary is required`);
    }
  }

  if (group.rules.length === 0) {
    warnings.push('Rule group has no rules');
  }

  return { valid: errors.length === 0, errors, warnings };
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

  await test('Ex2 — Dashboard with tags and custom time', () => {
    const dash = generateDashboard({
      uid: 'custom',
      title: 'Custom',
      tags: ['sre', 'production'],
      panels: [],
      timeFrom: 'now-24h',
      timeTo: 'now',
      refresh: '5m',
    });
    assertDeepEqual(dash.tags, ['sre', 'production']);
    assertEqual(dash.time.from, 'now-24h');
    assertEqual(dash.refresh, '5m');
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

  await test('Ex3 — Alert rules have correct severity levels', () => {
    const group = generateAlertRules('my-svc', 0.999);
    const severities = group.rules.map(r => r.labels.severity);
    assert(severities.includes('critical'), 'should have a critical alert');
    assert(severities.includes('warning'), 'should have a warning alert');
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

  await test('Ex4 — Recording rules reference service name', () => {
    const group = generateSLORecordingRules('checkout', 0.995);
    for (const rule of group.rules) {
      assertIncludes(rule.record, 'checkout');
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

  await test('Ex5 — Validate dashboard with empty uid', () => {
    const dash = generateDashboard({ uid: '', title: 'Test', panels: [] });
    const result = validateDashboard(dash);
    assertEqual(result.valid, false);
  });

  summary();
}

main();

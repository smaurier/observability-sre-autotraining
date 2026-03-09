// =============================================================================
// Lab 11 — Alertes Burn Rate (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, assertIncludes, summary } = createTestRunner('Lab 11 — Burn Rate Alerts');

// =============================================================================
// Types
// =============================================================================

type AlertSeverity = 'page' | 'ticket' | 'none';

interface BurnRateWindow {
  windowName: string;
  windowDurationMs: number;
  burnRate: number;
}

interface MultiWindowResult {
  longWindow: BurnRateWindow;
  shortWindow: BurnRateWindow;
  shouldAlert: boolean;
}

interface AlertRule {
  alert: string;
  expr: string;
  forDuration: string;
  severity: AlertSeverity;
  sloName: string;
  burnRateThreshold: number;
}

interface BurnRateAlertConfig {
  severity: AlertSeverity;
  longWindowDuration: string;
  shortWindowDuration: string;
  burnRateThreshold: number;
}

// =============================================================================
// Exercice 1 — Calculer le burn rate
// =============================================================================

function calculateBurnRate(errorRate: number, sloTarget: number): number {
  const errorBudgetRate = 1 - sloTarget;
  if (errorBudgetRate <= 0) return 0;
  return errorRate / errorBudgetRate;
}

// =============================================================================
// Exercice 2 — Multi-window burn rate
// =============================================================================

function multiWindowBurnRate(
  requests: Array<{ status: number; timestamp: number }>,
  sloTarget: number,
  longWindowMs: number,
  shortWindowMs: number,
  threshold: number
): MultiWindowResult {
  const now = Math.max(...requests.map(r => r.timestamp));
  const errorBudgetRate = 1 - sloTarget;

  const longWindowReqs = requests.filter(r => r.timestamp >= now - longWindowMs);
  const shortWindowReqs = requests.filter(r => r.timestamp >= now - shortWindowMs);

  const longErrorRate = longWindowReqs.length > 0
    ? longWindowReqs.filter(r => r.status >= 500).length / longWindowReqs.length
    : 0;
  const shortErrorRate = shortWindowReqs.length > 0
    ? shortWindowReqs.filter(r => r.status >= 500).length / shortWindowReqs.length
    : 0;

  const longBurnRate = errorBudgetRate > 0 ? longErrorRate / errorBudgetRate : 0;
  const shortBurnRate = errorBudgetRate > 0 ? shortErrorRate / errorBudgetRate : 0;

  return {
    longWindow: {
      windowName: 'long',
      windowDurationMs: longWindowMs,
      burnRate: longBurnRate,
    },
    shortWindow: {
      windowName: 'short',
      windowDurationMs: shortWindowMs,
      burnRate: shortBurnRate,
    },
    shouldAlert: longBurnRate >= threshold && shortBurnRate >= threshold,
  };
}

// =============================================================================
// Exercice 3 — Déterminer la sévérité d'une alerte
// =============================================================================

function determineAlertSeverity(burnRate: number): AlertSeverity {
  if (burnRate >= 6) return 'page';
  if (burnRate >= 1) return 'ticket';
  return 'none';
}

// =============================================================================
// Exercice 4 — Multi-window multi-burn-rate alerting (Google SRE)
// =============================================================================

const GOOGLE_ALERT_CONFIGS: BurnRateAlertConfig[] = [
  { severity: 'page', longWindowDuration: '1h', shortWindowDuration: '5m', burnRateThreshold: 14.4 },
  { severity: 'page', longWindowDuration: '6h', shortWindowDuration: '30m', burnRateThreshold: 6 },
  { severity: 'ticket', longWindowDuration: '1d', shortWindowDuration: '2h', burnRateThreshold: 3 },
  { severity: 'ticket', longWindowDuration: '3d', shortWindowDuration: '6h', burnRateThreshold: 1 },
];

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

interface GoogleAlertResult {
  configIndex: number;
  severity: AlertSeverity;
  longWindowBurnRate: number;
  shortWindowBurnRate: number;
  threshold: number;
  firing: boolean;
}

function multiWindowMultiBurnRateAlert(
  requests: Array<{ status: number; timestamp: number }>,
  sloTarget: number
): GoogleAlertResult[] {
  const now = Math.max(...requests.map(r => r.timestamp));
  const errorBudgetRate = 1 - sloTarget;

  return GOOGLE_ALERT_CONFIGS.map((config, index) => {
    const longWindowMs = parseDuration(config.longWindowDuration);
    const shortWindowMs = parseDuration(config.shortWindowDuration);

    const longWindowReqs = requests.filter(r => r.timestamp >= now - longWindowMs);
    const shortWindowReqs = requests.filter(r => r.timestamp >= now - shortWindowMs);

    const longErrorRate = longWindowReqs.length > 0
      ? longWindowReqs.filter(r => r.status >= 500).length / longWindowReqs.length
      : 0;
    const shortErrorRate = shortWindowReqs.length > 0
      ? shortWindowReqs.filter(r => r.status >= 500).length / shortWindowReqs.length
      : 0;

    const longBurnRate = errorBudgetRate > 0 ? longErrorRate / errorBudgetRate : 0;
    const shortBurnRate = errorBudgetRate > 0 ? shortErrorRate / errorBudgetRate : 0;

    return {
      configIndex: index,
      severity: config.severity,
      longWindowBurnRate: longBurnRate,
      shortWindowBurnRate: shortBurnRate,
      threshold: config.burnRateThreshold,
      firing: longBurnRate >= config.burnRateThreshold && shortBurnRate >= config.burnRateThreshold,
    };
  });
}

// =============================================================================
// Exercice 5 — Générer des règles d'alerte Prometheus
// =============================================================================

function generatePrometheusAlertRules(
  sloName: string,
  sloTarget: number,
  metricName: string,
  configs: BurnRateAlertConfig[]
): string {
  const errorBudget = 1 - sloTarget;
  const rules = configs.map(config => {
    return `      - alert: SLOBurnRate_${sloName}_${config.severity}_${config.longWindowDuration}
        expr: |
          (
            sum(rate(${metricName}_errors_total[${config.longWindowDuration}]))
            /
            sum(rate(${metricName}_requests_total[${config.longWindowDuration}]))
          ) / ${errorBudget} > ${config.burnRateThreshold}
          and
          (
            sum(rate(${metricName}_errors_total[${config.shortWindowDuration}]))
            /
            sum(rate(${metricName}_requests_total[${config.shortWindowDuration}]))
          ) / ${errorBudget} > ${config.burnRateThreshold}
        for: 1m
        labels:
          severity: ${config.severity}
          slo: ${sloName}
        annotations:
          summary: "High burn rate on ${sloName}"
          burn_rate_threshold: "${config.burnRateThreshold}"`;
  });

  return `groups:
  - name: slo-burn-rate-${sloName}
    rules:
${rules.join('\n')}`;
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🔥 Lab 11 — Burn Rate Alerts\n');

  // --- Exercice 1 ---
  await test('Ex1: burn rate = 1 quand error rate = error budget', () => {
    const br = calculateBurnRate(0.001, 0.999);
    assert(Math.abs(br - 1) < 0.01, `Expected burn rate ~1, got ${br}`);
  });

  await test('Ex1: burn rate = 14.4 pour consommation rapide', () => {
    const br = calculateBurnRate(0.0144, 0.999);
    assert(Math.abs(br - 14.4) < 0.1, `Expected burn rate ~14.4, got ${br}`);
  });

  await test('Ex1: burn rate = 0 quand pas d\'erreurs', () => {
    const br = calculateBurnRate(0, 0.999);
    assertEqual(br, 0);
  });

  // --- Exercice 2 ---
  await test('Ex2: multi-window alerte quand les deux fenêtres dépassent', () => {
    const now = Date.now();
    const requests = Array.from({ length: 1000 }, (_, i) => ({
      status: i < 200 ? 500 : 200,
      timestamp: now - (1000 - i) * 1000,
    }));
    const result = multiWindowBurnRate(requests, 0.999, 3600000, 300000, 14.4);
    assert(result.shouldAlert, 'Should alert when both windows exceed threshold');
    assertGreaterThan(result.longWindow.burnRate, 14.4);
    assertGreaterThan(result.shortWindow.burnRate, 14.4);
  });

  await test('Ex2: multi-window pas d\'alerte quand erreurs uniquement anciennes', () => {
    const now = Date.now();
    const requests: Array<{ status: number; timestamp: number }> = [];
    for (let i = 0; i < 500; i++) {
      requests.push({
        status: i < 100 ? 500 : 200,
        timestamp: now - 7200000 + i * 1000,
      });
    }
    for (let i = 0; i < 500; i++) {
      requests.push({
        status: 200,
        timestamp: now - 300000 + i * 100,
      });
    }
    const result = multiWindowBurnRate(requests, 0.999, 3600000 * 3, 300000, 14.4);
    assert(!result.shouldAlert, 'Should NOT alert when short window is clean');
  });

  // --- Exercice 3 ---
  await test('Ex3: sévérité page pour burn rate >= 14.4', () => {
    assertEqual(determineAlertSeverity(14.4), 'page');
    assertEqual(determineAlertSeverity(20), 'page');
  });

  await test('Ex3: sévérité page pour burn rate >= 6', () => {
    assertEqual(determineAlertSeverity(6), 'page');
    assertEqual(determineAlertSeverity(10), 'page');
  });

  await test('Ex3: sévérité ticket pour burn rate >= 1', () => {
    assertEqual(determineAlertSeverity(3), 'ticket');
    assertEqual(determineAlertSeverity(1), 'ticket');
    assertEqual(determineAlertSeverity(1.5), 'ticket');
  });

  await test('Ex3: pas d\'alerte pour burn rate < 1', () => {
    assertEqual(determineAlertSeverity(0.5), 'none');
    assertEqual(determineAlertSeverity(0), 'none');
  });

  // --- Exercice 4 ---
  await test('Ex4: Google multi-window multi-burn-rate avec erreurs élevées', () => {
    const now = Date.now();
    const requests = Array.from({ length: 5000 }, (_, i) => ({
      status: i % 3 === 0 ? 500 : 200,
      timestamp: now - (5000 - i) * 60000,
    }));
    const results = multiWindowMultiBurnRateAlert(requests, 0.999);
    assertEqual(results.length, 4);
    assert(results[0].firing, 'First config (14.4 threshold) should fire');
    assert(results[1].firing, 'Second config (6 threshold) should fire');
  });

  await test('Ex4: Google multi-window avec système sain', () => {
    const now = Date.now();
    const requests = Array.from({ length: 5000 }, (_, i) => ({
      status: i < 2 ? 500 : 200,
      timestamp: now - (5000 - i) * 60000,
    }));
    const results = multiWindowMultiBurnRateAlert(requests, 0.999);
    const anyFiring = results.some(r => r.firing);
    assert(!anyFiring, 'No alerts should fire with healthy system');
  });

  // --- Exercice 5 ---
  await test('Ex5: génération de règles Prometheus YAML', () => {
    const yaml = generatePrometheusAlertRules(
      'api-availability',
      0.999,
      'http',
      [GOOGLE_ALERT_CONFIGS[0]]
    );
    assertIncludes(yaml, 'slo-burn-rate-api-availability');
    assertIncludes(yaml, 'SLOBurnRate_api-availability');
    assertIncludes(yaml, 'http_errors_total');
    assertIncludes(yaml, 'http_requests_total');
    assertIncludes(yaml, 'severity: page');
    assertIncludes(yaml, '14.4');
  });

  await test('Ex5: YAML contient les deux fenêtres', () => {
    const yaml = generatePrometheusAlertRules(
      'web-slo',
      0.999,
      'http_server',
      GOOGLE_ALERT_CONFIGS
    );
    assertIncludes(yaml, '1h');
    assertIncludes(yaml, '5m');
    assertIncludes(yaml, '6h');
    assertIncludes(yaml, '30m');
    assertIncludes(yaml, '1d');
    assertIncludes(yaml, '3d');
  });

  summary();
}

main();

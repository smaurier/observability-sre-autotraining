// =============================================================================
// test-utils.ts — Utilitaires partages pour les labs Observabilite & SRE (01-19)
// =============================================================================

export function createTestRunner(labName: string) {
  let passed = 0;
  let failed = 0;
  const errors: { name: string; error: Error }[] = [];

  async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
      passed++;
      console.log(`  \u2705 ${name}`);
    } catch (err) {
      failed++;
      const error = err instanceof Error ? err : new Error(String(err));
      errors.push({ name, error });
      console.log(`  \u274C ${name}`);
      console.log(`     \u2192 ${error.message}`);
    }
  }

  function assert(condition: boolean, message: string = 'Assertion failed'): void {
    if (!condition) throw new Error(message);
  }

  function assertEqual<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(message || `Expected ${b}, got ${a}`);
    }
  }

  function assertThrows(fn: () => void, message?: string): void {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (err) {
      if (err instanceof Error && err.message === (message || 'Expected function to throw')) {
        throw err;
      }
      // OK — function threw as expected
    }
  }

  function assertIncludes(haystack: string | unknown[], needle: unknown, message?: string): void {
    if (typeof haystack === 'string' && typeof needle === 'string') {
      if (!haystack.includes(needle)) {
        throw new Error(message || `Expected string to include "${needle}"`);
      }
    } else if (Array.isArray(haystack)) {
      if (!haystack.includes(needle)) {
        throw new Error(message || `Expected array to include ${JSON.stringify(needle)}`);
      }
    }
  }

  function assertType<_T>(_message?: string): void {
    // Compile-time only check — if this compiles, the type is correct
  }

  function assertGreaterThan(actual: number, expected: number, message?: string): void {
    if (!(actual > expected)) {
      throw new Error(message || `Expected ${actual} > ${expected}`);
    }
  }

  function assertLessThan(actual: number, expected: number, message?: string): void {
    if (!(actual < expected)) {
      throw new Error(message || `Expected ${actual} < ${expected}`);
    }
  }

  function summary(): { passed: number; failed: number; total: number } {
    const total = passed + failed;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`\uD83D\uDCCA ${labName} — Resultats : ${passed}/${total} tests reussis`);
    if (failed > 0) {
      console.log(`\n\u274C ${failed} test(s) echoue(s) :`);
      errors.forEach(({ name, error }) => {
        console.log(`   \u2022 ${name} : ${error.message}`);
      });
    } else {
      console.log(`\n\uD83C\uDF89 Tous les tests passent !`);
    }
    console.log(`${'─'.repeat(50)}\n`);
    return { passed, failed, total };
  }

  return {
    test,
    assert,
    assertEqual,
    assertDeepEqual,
    assertThrows,
    assertIncludes,
    assertType,
    assertGreaterThan,
    assertLessThan,
    summary,
  };
}

// =============================================================================
// Helpers SRE — Utilitaires specifiques a l'observabilite
// =============================================================================

/** Verifie qu'un log structuré contient les champs requis */
export function assertStructuredLog(
  log: Record<string, unknown>,
  requiredFields: string[]
): void {
  for (const field of requiredFields) {
    if (!(field in log)) {
      throw new Error(`Missing required field "${field}" in structured log`);
    }
  }
}

/** Verifie qu'un log ne contient pas de PII */
export function assertNoPII(
  log: Record<string, unknown>,
  piiPatterns: RegExp[] = [
    /\b\d{16}\b/,                          // credit card
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // email
    /\b\d{3}-\d{2}-\d{4}\b/,              // SSN
    /password/i,
  ]
): void {
  const logStr = JSON.stringify(log);
  for (const pattern of piiPatterns) {
    if (pattern.test(logStr)) {
      throw new Error(`PII detected in log matching pattern: ${pattern}`);
    }
  }
}

/** Parse une ligne de log JSON */
export function parseLogLine(line: string): Record<string, unknown> {
  try {
    return JSON.parse(line.trim());
  } catch {
    throw new Error(`Failed to parse log line as JSON: ${line.slice(0, 100)}...`);
  }
}

/** Verifie qu'une sortie Prometheus contient une metrique donnee */
export function assertPrometheusMetric(
  output: string,
  metricName: string,
  labels?: Record<string, string>
): void {
  const lines = output.split('\n').filter((l) => !l.startsWith('#'));
  const pattern = labels
    ? `${metricName}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
    : metricName;

  const found = lines.some((line) => line.includes(pattern));
  if (!found) {
    throw new Error(`Prometheus metric not found: ${pattern}`);
  }
}

/** Simule des requetes HTTP avec latence et erreurs aleatoires */
export function simulateRequests(
  count: number,
  options: { errorRate?: number; minLatencyMs?: number; maxLatencyMs?: number } = {}
): Array<{ status: number; durationMs: number; timestamp: number }> {
  const { errorRate = 0.01, minLatencyMs = 10, maxLatencyMs = 500 } = options;
  const requests: Array<{ status: number; durationMs: number; timestamp: number }> = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const isError = Math.random() < errorRate;
    const durationMs = minLatencyMs + Math.random() * (maxLatencyMs - minLatencyMs);
    requests.push({
      status: isError ? (Math.random() < 0.5 ? 500 : 503) : 200,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: now + i * 100,
    });
  }

  return requests;
}

/** Calcule le taux d'erreur d'une serie de requetes */
export function calculateErrorRate(
  requests: Array<{ status: number }>
): number {
  if (requests.length === 0) return 0;
  const errors = requests.filter((r) => r.status >= 500).length;
  return errors / requests.length;
}

/** Calcule un percentile donne a partir d'un tableau de valeurs */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) throw new Error('Cannot calculate percentile of empty array');
  if (percentile < 0 || percentile > 100) throw new Error('Percentile must be between 0 and 100');

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/** Verifie la conformite d'un SLO */
export function assertSLOCompliance(
  requests: Array<{ status: number }>,
  slo: { target: number; type: 'availability' }
): { compliant: boolean; actual: number; target: number; errorBudgetRemaining: number } {
  const errorRate = calculateErrorRate(requests);
  const actual = 1 - errorRate;
  const target = slo.target;
  const errorBudgetTotal = 1 - target;
  const errorBudgetUsed = errorRate;
  const errorBudgetRemaining = Math.max(0, (errorBudgetTotal - errorBudgetUsed) / errorBudgetTotal);

  return {
    compliant: actual >= target,
    actual,
    target,
    errorBudgetRemaining,
  };
}

/** Calcule le burn rate sur une fenetre donnee */
export function calculateBurnRate(
  requests: Array<{ status: number; timestamp: number }>,
  sloTarget: number,
  windowMs: number
): number {
  const now = Math.max(...requests.map((r) => r.timestamp));
  const windowRequests = requests.filter((r) => r.timestamp >= now - windowMs);
  if (windowRequests.length === 0) return 0;

  const errorRate = calculateErrorRate(windowRequests);
  const errorBudgetRate = 1 - sloTarget;
  return errorBudgetRate > 0 ? errorRate / errorBudgetRate : 0;
}

/** Genere une serie temporelle de metriques */
export function generateMetricsSeries(
  durationMinutes: number,
  intervalMs: number,
  generator: (timestamp: number, index: number) => number
): Array<{ timestamp: number; value: number }> {
  const series: Array<{ timestamp: number; value: number }> = [];
  const totalPoints = Math.floor((durationMinutes * 60 * 1000) / intervalMs);
  const startTime = Date.now() - durationMinutes * 60 * 1000;

  for (let i = 0; i < totalPoints; i++) {
    const timestamp = startTime + i * intervalMs;
    series.push({ timestamp, value: generator(timestamp, i) });
  }

  return series;
}

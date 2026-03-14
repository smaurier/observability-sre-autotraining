import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } = createTestRunner('Lab 23 — Sentry Error Tracking');

// ============================================================
// Types
// ============================================================

interface SentryConfig {
  dsn: string;
  environment: string;
  release: string;
  sampleRate: number;
  tracesSampleRate: number;
}

interface SentryEvent {
  exception?: { type: string; value: string; stacktrace?: string };
  message?: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  tags: Record<string, string>;
  user?: { id: string; email?: string; username?: string };
  breadcrumbs: Breadcrumb[];
  contexts: Record<string, Record<string, unknown>>;
  fingerprint?: string[];
  extra?: Record<string, unknown>;
  timestamp: number;
}

interface Breadcrumb {
  category: string;
  message: string;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  timestamp: number;
  data?: Record<string, unknown>;
}

interface AlertRule {
  name: string;
  type: 'frequency' | 'new_issue' | 'regression';
  threshold?: number;
  timeWindow?: number; // minutes
}

// ============================================================
// TODO 1: Implement initSentry
// ============================================================

function initSentry(config: SentryConfig): { initialized: boolean; config: SentryConfig } {
  const dsnPattern = /^https:\/\/[^@]+@[^.]+\.ingest\.sentry\.io\/\d+$/;
  if (!dsnPattern.test(config.dsn)) {
    throw new Error(`Invalid DSN format: ${config.dsn}`);
  }
  if (config.sampleRate < 0 || config.sampleRate > 1) {
    throw new Error(`sampleRate must be between 0 and 1, got ${config.sampleRate}`);
  }
  if (config.tracesSampleRate < 0 || config.tracesSampleRate > 1) {
    throw new Error(`tracesSampleRate must be between 0 and 1, got ${config.tracesSampleRate}`);
  }
  return { initialized: true, config };
}

// ============================================================
// TODO 2: Implement captureException
// ============================================================

function captureException(
  error: Error,
  context?: { tags?: Record<string, string>; user?: SentryEvent['user']; extra?: Record<string, unknown> }
): SentryEvent {
  const event: SentryEvent = {
    exception: {
      type: error.constructor.name,
      value: error.message,
      stacktrace: error.stack,
    },
    level: 'error',
    tags: context?.tags ?? {},
    user: context?.user,
    breadcrumbs: [],
    contexts: {},
    extra: context?.extra,
    timestamp: Date.now(),
  };
  return event;
}

// ============================================================
// TODO 3: Implement BreadcrumbTrail
// ============================================================

class BreadcrumbTrail {
  private trail: Breadcrumb[] = [];
  private readonly maxSize = 100;

  add(bc: Omit<Breadcrumb, 'timestamp'>): void {
    const breadcrumb: Breadcrumb = {
      ...bc,
      timestamp: Date.now(),
    };
    this.trail.push(breadcrumb);
    if (this.trail.length > this.maxSize) {
      this.trail.shift();
    }
  }

  getTrail(): Breadcrumb[] {
    return [...this.trail];
  }

  clear(): void {
    this.trail = [];
  }
}

// ============================================================
// TODO 4: Implement scrubPII
// ============================================================

function scrubPII(event: SentryEvent): SentryEvent {
  const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const ccPattern = /\b\d{13,19}\b/g;

  function scrubString(str: string): string {
    return str.replace(emailPattern, '[Filtered]').replace(ccPattern, '[Filtered]');
  }

  const scrubbed: SentryEvent = JSON.parse(JSON.stringify(event));

  // Scrub exception value
  if (scrubbed.exception) {
    scrubbed.exception.value = scrubString(scrubbed.exception.value);
  }

  // Scrub tags
  for (const key of Object.keys(scrubbed.tags)) {
    scrubbed.tags[key] = scrubString(scrubbed.tags[key]);
  }

  // Scrub user email
  if (scrubbed.user?.email) {
    scrubbed.user.email = '[Filtered]';
  }

  // Scrub breadcrumb messages
  for (const bc of scrubbed.breadcrumbs) {
    bc.message = scrubString(bc.message);
  }

  // Scrub extra values
  if (scrubbed.extra) {
    for (const key of Object.keys(scrubbed.extra)) {
      const val = scrubbed.extra[key];
      if (typeof val === 'string') {
        scrubbed.extra[key] = scrubString(val);
      }
    }
  }

  return scrubbed;
}

// ============================================================
// TODO 5: Implement customFingerprint
// ============================================================

function customFingerprint(errorType: string, endpoint: string): string[] {
  if (errorType === 'TimeoutError') {
    return ['timeout', endpoint];
  }
  if (errorType === 'ValidationError') {
    return ['validation', endpoint];
  }
  return ['{{ default }}', endpoint];
}

// ============================================================
// TODO 6: Implement shouldSample
// ============================================================

function shouldSample(level: SentryEvent['level'], environment: string, sampleRate: number): boolean {
  if (level === 'fatal' || level === 'error') {
    return true;
  }
  if (environment === 'staging') {
    return true;
  }
  if (environment === 'development') {
    return false;
  }
  // production: probabilistic sampling
  return Math.random() < sampleRate;
}

// ============================================================
// TODO 7: Implement matchAlertRule
// ============================================================

function matchAlertRule(
  rule: AlertRule,
  context: { eventCount: number; isNewIssue: boolean; wasResolved: boolean; windowMinutes: number }
): boolean {
  switch (rule.type) {
    case 'frequency':
      return context.eventCount >= (rule.threshold ?? 0) && context.windowMinutes <= (rule.timeWindow ?? Infinity);
    case 'new_issue':
      return context.isNewIssue;
    case 'regression':
      return context.wasResolved && context.eventCount > 0;
    default:
      return false;
  }
}

// ============================================================
// Tests
// ============================================================

// Test TODO 1
await test('initSentry validates DSN format', () => {
  const config: SentryConfig = {
    dsn: 'https://abc123@o0.ingest.sentry.io/12345',
    environment: 'production',
    release: 'api@1.0.0',
    sampleRate: 1.0,
    tracesSampleRate: 0.2,
  };
  const result = initSentry(config);
  assert(result.initialized === true, 'Should be initialized');
  assertEqual(result.config.dsn, config.dsn, 'DSN should match');
});

await test('initSentry rejects invalid DSN', () => {
  let threw = false;
  try {
    initSentry({ dsn: 'not-a-valid-dsn', environment: 'dev', release: '1.0', sampleRate: 1, tracesSampleRate: 0.1 });
  } catch { threw = true; }
  assert(threw, 'Should throw on invalid DSN');
});

await test('initSentry rejects sampleRate > 1', () => {
  let threw = false;
  try {
    initSentry({ dsn: 'https://abc@o0.ingest.sentry.io/1', environment: 'dev', release: '1.0', sampleRate: 1.5, tracesSampleRate: 0.1 });
  } catch { threw = true; }
  assert(threw, 'Should throw on sampleRate > 1');
});

// Test TODO 2
await test('captureException creates event from Error', () => {
  const event = captureException(new TypeError('Cannot read property x'), {
    tags: { module: 'auth' },
    user: { id: '42', email: 'alice@example.com' },
  });
  assertEqual(event.exception?.type, 'TypeError', 'Type should match');
  assertEqual(event.exception?.value, 'Cannot read property x', 'Value should match');
  assertEqual(event.level, 'error', 'Level should be error');
  assertEqual(event.tags.module, 'auth', 'Tag should be set');
  assertEqual(event.user?.id, '42', 'User should be set');
  assert(event.timestamp > 0, 'Timestamp should be set');
});

await test('captureException works without context', () => {
  const event = captureException(new Error('Simple error'));
  assertEqual(event.exception?.type, 'Error', 'Type should be Error');
  assert(event.breadcrumbs.length === 0, 'No breadcrumbs without context');
});

// Test TODO 3
await test('BreadcrumbTrail adds and retrieves breadcrumbs', () => {
  const trail = new BreadcrumbTrail();
  trail.add({ category: 'navigation', message: 'Page /home', level: 'info' });
  trail.add({ category: 'click', message: 'Button "Submit"', level: 'info' });
  const crumbs = trail.getTrail();
  assertEqual(crumbs.length, 2, 'Should have 2 breadcrumbs');
  assert(crumbs[0].timestamp > 0, 'Should have timestamp');
  assertEqual(crumbs[0].category, 'navigation', 'Category should match');
});

await test('BreadcrumbTrail respects max 100 limit (FIFO)', () => {
  const trail = new BreadcrumbTrail();
  for (let i = 0; i < 110; i++) {
    trail.add({ category: 'test', message: `Event ${i}`, level: 'info' });
  }
  const crumbs = trail.getTrail();
  assertEqual(crumbs.length, 100, 'Should cap at 100');
  assertEqual(crumbs[0].message, 'Event 10', 'Oldest should be removed (FIFO)');
});

await test('BreadcrumbTrail clear removes all', () => {
  const trail = new BreadcrumbTrail();
  trail.add({ category: 'test', message: 'Hello', level: 'info' });
  trail.clear();
  assertEqual(trail.getTrail().length, 0, 'Should be empty after clear');
});

// Test TODO 4
await test('scrubPII removes emails', () => {
  const event = captureException(new Error('User alice@example.com failed'));
  const scrubbed = scrubPII(event);
  assert(!scrubbed.exception?.value.includes('alice@example.com'), 'Email should be scrubbed from exception');
  assertIncludes(scrubbed.exception?.value || '', '[Filtered]', 'Should contain [Filtered]');
});

await test('scrubPII removes credit card numbers', () => {
  const event = captureException(new Error('Card 4111111111111111 declined'));
  const scrubbed = scrubPII(event);
  assert(!scrubbed.exception?.value.includes('4111111111111111'), 'CC should be scrubbed');
});

await test('scrubPII removes email from user', () => {
  const event = captureException(new Error('fail'), { user: { id: '1', email: 'bob@test.com' } });
  const scrubbed = scrubPII(event);
  assertEqual(scrubbed.user?.email, '[Filtered]', 'User email should be filtered');
});

// Test TODO 5
await test('customFingerprint groups timeout errors', () => {
  const fp = customFingerprint('TimeoutError', '/api/search');
  assertDeepEqual(fp, ['timeout', '/api/search'], 'Should group by timeout + endpoint');
});

await test('customFingerprint groups validation errors', () => {
  const fp = customFingerprint('ValidationError', '/api/users');
  assertDeepEqual(fp, ['validation', '/api/users'], 'Should group by validation + endpoint');
});

await test('customFingerprint uses default for other errors', () => {
  const fp = customFingerprint('ReferenceError', '/api/products');
  assertDeepEqual(fp, ['{{ default }}', '/api/products'], 'Should use default + endpoint');
});

// Test TODO 6
await test('shouldSample always samples fatal/error', () => {
  assert(shouldSample('fatal', 'production', 0.0) === true, 'Fatal always sampled');
  assert(shouldSample('error', 'production', 0.0) === true, 'Error always sampled');
});

await test('shouldSample always samples staging', () => {
  assert(shouldSample('info', 'staging', 0.0) === true, 'Staging always sampled');
});

await test('shouldSample never samples development', () => {
  assert(shouldSample('info', 'development', 1.0) === false, 'Dev never sampled');
});

// Test TODO 7
await test('matchAlertRule frequency check', () => {
  const rule: AlertRule = { name: 'High Error Rate', type: 'frequency', threshold: 50, timeWindow: 5 };
  assert(matchAlertRule(rule, { eventCount: 60, isNewIssue: false, wasResolved: false, windowMinutes: 5 }) === true, 'Should trigger when count >= threshold');
  assert(matchAlertRule(rule, { eventCount: 30, isNewIssue: false, wasResolved: false, windowMinutes: 5 }) === false, 'Should not trigger when count < threshold');
});

await test('matchAlertRule new issue check', () => {
  const rule: AlertRule = { name: 'New Issue', type: 'new_issue' };
  assert(matchAlertRule(rule, { eventCount: 1, isNewIssue: true, wasResolved: false, windowMinutes: 5 }) === true, 'Should trigger on new issue');
  assert(matchAlertRule(rule, { eventCount: 1, isNewIssue: false, wasResolved: false, windowMinutes: 5 }) === false, 'Should not trigger on existing issue');
});

await test('matchAlertRule regression check', () => {
  const rule: AlertRule = { name: 'Regression', type: 'regression' };
  assert(matchAlertRule(rule, { eventCount: 5, isNewIssue: false, wasResolved: true, windowMinutes: 5 }) === true, 'Should trigger regression');
  assert(matchAlertRule(rule, { eventCount: 5, isNewIssue: false, wasResolved: false, windowMinutes: 5 }) === false, 'Should not trigger if not resolved');
});

summary();

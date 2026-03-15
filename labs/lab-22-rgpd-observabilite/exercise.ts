import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } = createTestRunner('Lab 28 — RGPD & Observabilite');

// ============================================================
// Types
// ============================================================

interface PIIDetection {
  type: 'email' | 'phone' | 'creditCard' | 'ip' | 'jwt';
  value: string;
  field: string; // which field it was found in
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  [key: string]: unknown;
}

interface ScrubResult {
  scrubbed: LogEntry;
  detections: PIIDetection[];
  piiCount: number;
}

interface RetentionPolicy {
  name: string;
  dataType: string;
  maxAgeDays: number;
  legalHold: boolean;
  legalBasis: 'legitimate_interest' | 'legal_obligation' | 'consent';
}

interface DataRecord {
  id: string;
  dataType: string;
  createdAt: number; // timestamp ms
  content: string;
}

interface RetentionResult {
  deleted: string[];   // IDs of deleted records
  retained: string[];  // IDs of retained records
  heldByLegal: string[]; // IDs retained due to legal hold
}

interface ConsentState {
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  timestamp: number;
  expiresAt: number;
}

interface ConsentValidation {
  valid: boolean;
  expired: boolean;
  issues: string[];
}

interface DPIARisk {
  name: string;
  description: string;
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  mitigations: string[];
}

interface DPIAReport {
  systemName: string;
  risks: DPIARisk[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  dpiaRequired: boolean;
  mitigationCount: number;
}

interface ObservabilitySystem {
  name: string;
  dataTypes: string[];
  containsPII: boolean;
  encrypted: boolean;
  retentionConfigured: boolean;
  retentionDays: number;
  hostedInEU: boolean;
  dpaSign: boolean;
  rbacEnabled: boolean;
  auditLog: boolean;
  piiScrubbing: boolean;
}

interface ComplianceReport {
  systemName: string;
  score: number; // 0-100
  compliant: boolean; // score >= 70
  issues: { severity: 'critical' | 'high' | 'medium' | 'low'; message: string }[];
  recommendations: string[];
  dataMapping: { dataType: string; containsPII: boolean; retentionDays: number; hostedInEU: boolean }[];
}

// ============================================================
// TODO 1: Implement detectAndScrubPII — find and redact PII in log entries
// Detect:
//   - emails: standard email pattern
//   - phones: French format (+33 or 0X XX XX XX XX)
//   - creditCards: 13-19 digit numbers
//   - IPs: IPv4 addresses (X.X.X.X)
//   - JWTs: eyJ... pattern (3 base64 segments separated by dots)
// Replace all detected PII with [REDACTED] in the scrubbed output
// Scan ALL string fields in the log entry (message + any additional string fields)
// Return detections with the field name where each PII was found
// ============================================================

function detectAndScrubPII(entry: LogEntry): ScrubResult {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 2: Implement enforceRetention — apply retention policies
// For each data record:
//   - Find the matching retention policy by dataType
//   - If no policy: retain the record (no deletion without policy)
//   - If legalHold: retain and add to heldByLegal
//   - If record age > maxAgeDays: delete
//   - Otherwise: retain
// Use `now` parameter as current timestamp for deterministic testing
// ============================================================

function enforceRetention(
  policies: RetentionPolicy[],
  records: DataRecord[],
  now: number
): RetentionResult {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 3: Implement ConsentManager — manage GDPR consent
// setConsent: store consent with timestamp and expiry (13 months max per CNIL)
// getConsent: retrieve current consent state
// validateConsent: check if consent is valid (not expired, has timestamp)
// hasConsent: check if a specific category is consented
// withdrawConsent: remove consent for all categories
// isExempt: return true if analytics is server-side only (no cookies, no tracking)
// ============================================================

class ConsentManager {
  private consent: ConsentState | null = null;
  private readonly MAX_AGE_MS = 13 * 30 * 24 * 60 * 60 * 1000; // ~13 months

  setConsent(categories: { analytics: boolean; personalization: boolean; marketing: boolean }, now: number): ConsentState {
    // TODO: implement
    throw new Error('Not implemented');
  }

  getConsent(): ConsentState | null {
    // TODO: implement
    throw new Error('Not implemented');
  }

  validateConsent(now: number): ConsentValidation {
    // TODO: implement
    throw new Error('Not implemented');
  }

  hasConsent(category: 'analytics' | 'personalization' | 'marketing'): boolean {
    // TODO: implement
    throw new Error('Not implemented');
  }

  withdrawConsent(): void {
    // TODO: implement
    throw new Error('Not implemented');
  }

  isExempt(config: { serverSideOnly: boolean; noCookies: boolean; noFingerprinting: boolean; hostedInEU: boolean }): boolean {
    // TODO: implement
    throw new Error('Not implemented');
  }
}

// ============================================================
// TODO 4: Implement evaluateDPIA — assess GDPR risks for an observability system
// Generate risks based on system properties:
//   - If containsPII && !piiScrubbing: HIGH probability, HIGH impact -> CRITICAL
//   - If !encrypted: MEDIUM probability, HIGH impact -> HIGH
//   - If !hostedInEU: MEDIUM probability, CRITICAL impact -> CRITICAL
//   - If !rbacEnabled: MEDIUM probability, MEDIUM impact -> HIGH
//   - If !retentionConfigured: HIGH probability, MEDIUM impact -> HIGH
//   - If !auditLog: LOW probability, MEDIUM impact -> MEDIUM
// Risk level matrix:
//   prob HIGH + impact CRITICAL/HIGH = CRITICAL
//   prob HIGH + impact MEDIUM = HIGH
//   prob MEDIUM + impact CRITICAL = CRITICAL
//   prob MEDIUM + impact HIGH = HIGH
//   prob MEDIUM + impact MEDIUM = HIGH
//   prob LOW + impact CRITICAL = HIGH
//   prob LOW + impact HIGH/MEDIUM = MEDIUM
//   prob LOW + impact LOW = LOW
// dpiaRequired = true if any risk is CRITICAL or HIGH, or if containsPII at large scale
// overallRiskLevel = highest risk level among all risks
// ============================================================

function evaluateDPIA(system: ObservabilitySystem): DPIAReport {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// TODO 5: Implement generateComplianceReport — audit an observability system
// Scoring (start at 100, subtract):
//   - containsPII && !piiScrubbing: -25 (critical)
//   - !encrypted: -15 (high)
//   - !hostedInEU: -20 (critical)
//   - !dpaSign && !hostedInEU: -10 (high)  — only if not in EU
//   - !rbacEnabled: -10 (high)
//   - !retentionConfigured: -10 (medium)
//   - !auditLog: -5 (low)
//   - retentionDays > 365 && containsPII: -5 (medium) — excessive retention
// compliant = score >= 70
// Generate recommendations for each issue
// Build dataMapping from system.dataTypes
// ============================================================

function generateComplianceReport(system: ObservabilitySystem): ComplianceReport {
  // TODO: implement
  throw new Error('Not implemented');
}

// ============================================================
// Tests
// ============================================================

// Test TODO 1 — detectAndScrubPII
await test('detectAndScrubPII finds emails', () => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'User alice@example.com logged in from 192.168.1.42',
  };

  const result = detectAndScrubPII(entry);
  assert(result.piiCount >= 2, 'Should find at least 2 PII (email + IP)');
  assert(result.detections.some(d => d.type === 'email'), 'Should detect email');
  assert(result.detections.some(d => d.type === 'ip'), 'Should detect IP');
  assert(!result.scrubbed.message.includes('alice@example.com'), 'Email should be scrubbed');
  assert(!result.scrubbed.message.includes('192.168.1.42'), 'IP should be scrubbed');
  assertIncludes(result.scrubbed.message, '[REDACTED]', 'Should contain [REDACTED]');
});

await test('detectAndScrubPII finds credit cards', () => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level: 'error',
    message: 'Payment failed for card 4111111111111111',
    userId: 'usr_123',
  };

  const result = detectAndScrubPII(entry);
  assert(result.detections.some(d => d.type === 'creditCard'), 'Should detect credit card');
  assert(!result.scrubbed.message.includes('4111111111111111'), 'Card should be scrubbed');
});

await test('detectAndScrubPII finds JWT in custom fields', () => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level: 'debug',
    message: 'Auth check',
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123signature',
  };

  const result = detectAndScrubPII(entry);
  assert(result.detections.some(d => d.type === 'jwt'), 'Should detect JWT');
  assertEqual(result.detections.find(d => d.type === 'jwt')?.field, 'token', 'Should report correct field');
});

await test('detectAndScrubPII finds French phone numbers', () => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'SMS sent to +33 6 12 34 56 78',
  };

  const result = detectAndScrubPII(entry);
  assert(result.detections.some(d => d.type === 'phone'), 'Should detect French phone');
  assert(!result.scrubbed.message.includes('+33 6 12 34 56 78'), 'Phone should be scrubbed');
});

await test('detectAndScrubPII returns 0 for clean entry', () => {
  const entry: LogEntry = {
    timestamp: Date.now(),
    level: 'info',
    message: 'Server started on port 3000',
    uptime: 42,
  };

  const result = detectAndScrubPII(entry);
  assertEqual(result.piiCount, 0, 'Should find no PII');
  assertEqual(result.scrubbed.message, entry.message, 'Message should be unchanged');
});

// Test TODO 2 — enforceRetention
await test('enforceRetention deletes expired records', () => {
  const now = Date.now();
  const policies: RetentionPolicy[] = [
    { name: 'App Logs', dataType: 'application-logs', maxAgeDays: 90, legalHold: false, legalBasis: 'legitimate_interest' },
  ];

  const records: DataRecord[] = [
    { id: 'r1', dataType: 'application-logs', createdAt: now - 100 * 24 * 60 * 60 * 1000, content: 'old log' },
    { id: 'r2', dataType: 'application-logs', createdAt: now - 10 * 24 * 60 * 60 * 1000, content: 'recent log' },
  ];

  const result = enforceRetention(policies, records, now);
  assertDeepEqual(result.deleted, ['r1'], 'Should delete record older than 90 days');
  assertDeepEqual(result.retained, ['r2'], 'Should retain recent record');
});

await test('enforceRetention respects legal hold', () => {
  const now = Date.now();
  const policies: RetentionPolicy[] = [
    { name: 'Security Logs', dataType: 'security-logs', maxAgeDays: 30, legalHold: true, legalBasis: 'legal_obligation' },
  ];

  const records: DataRecord[] = [
    { id: 'r1', dataType: 'security-logs', createdAt: now - 60 * 24 * 60 * 60 * 1000, content: 'old security log' },
  ];

  const result = enforceRetention(policies, records, now);
  assertEqual(result.deleted.length, 0, 'Should not delete under legal hold');
  assertDeepEqual(result.heldByLegal, ['r1'], 'Should report as held by legal');
});

await test('enforceRetention retains records without policy', () => {
  const now = Date.now();
  const policies: RetentionPolicy[] = [];

  const records: DataRecord[] = [
    { id: 'r1', dataType: 'unknown-type', createdAt: now - 999 * 24 * 60 * 60 * 1000, content: 'data' },
  ];

  const result = enforceRetention(policies, records, now);
  assertDeepEqual(result.retained, ['r1'], 'Should retain without policy');
  assertEqual(result.deleted.length, 0, 'Should not delete without policy');
});

// Test TODO 3 — ConsentManager
await test('ConsentManager stores and retrieves consent', () => {
  const cm = new ConsentManager();
  const now = Date.now();
  const consent = cm.setConsent({ analytics: true, personalization: false, marketing: false }, now);

  assert(consent.analytics === true, 'Analytics should be true');
  assert(consent.personalization === false, 'Personalization should be false');
  assert(consent.timestamp === now, 'Timestamp should match');
  assert(consent.expiresAt > now, 'Should have future expiry');
});

await test('ConsentManager validates expired consent', () => {
  const cm = new ConsentManager();
  const past = Date.now() - 14 * 30 * 24 * 60 * 60 * 1000; // 14 months ago
  cm.setConsent({ analytics: true, personalization: true, marketing: true }, past);

  const validation = cm.validateConsent(Date.now());
  assert(validation.expired === true, 'Should be expired (> 13 months)');
  assert(validation.valid === false, 'Should not be valid');
});

await test('ConsentManager withdraws consent', () => {
  const cm = new ConsentManager();
  cm.setConsent({ analytics: true, personalization: true, marketing: true }, Date.now());

  cm.withdrawConsent();
  assert(cm.getConsent() === null, 'Consent should be null after withdrawal');
  assert(cm.hasConsent('analytics') === false, 'Should not have analytics consent');
});

await test('ConsentManager checks CNIL exemption', () => {
  const cm = new ConsentManager();
  const exempt = cm.isExempt({
    serverSideOnly: true,
    noCookies: true,
    noFingerprinting: true,
    hostedInEU: true,
  });
  assert(exempt === true, 'Should be exempt with all conditions met');

  const notExempt = cm.isExempt({
    serverSideOnly: false,
    noCookies: true,
    noFingerprinting: true,
    hostedInEU: true,
  });
  assert(notExempt === false, 'Should not be exempt if client-side tracking');
});

// Test TODO 4 — evaluateDPIA
await test('evaluateDPIA identifies critical risks', () => {
  const report = evaluateDPIA({
    name: 'Production Loki',
    dataTypes: ['application-logs', 'access-logs'],
    containsPII: true,
    encrypted: false,
    retentionConfigured: false,
    retentionDays: 365,
    hostedInEU: false,
    dpaSign: false,
    rbacEnabled: false,
    auditLog: false,
    piiScrubbing: false,
  });

  assert(report.dpiaRequired === true, 'DPIA should be required');
  assert(report.risks.some(r => r.riskLevel === 'critical'), 'Should have critical risks');
  assert(report.overallRiskLevel === 'critical', 'Overall risk should be critical');
  assert(report.mitigationCount > 0, 'Should have mitigations');
});

await test('evaluateDPIA low risk for compliant system', () => {
  const report = evaluateDPIA({
    name: 'Prometheus Metrics',
    dataTypes: ['metrics'],
    containsPII: false,
    encrypted: true,
    retentionConfigured: true,
    retentionDays: 30,
    hostedInEU: true,
    dpaSign: true,
    rbacEnabled: true,
    auditLog: true,
    piiScrubbing: true,
  });

  assert(report.risks.length === 0 || report.risks.every(r => r.riskLevel === 'low' || r.riskLevel === 'medium'), 'Should have no critical/high risks');
});

// Test TODO 5 — generateComplianceReport
await test('generateComplianceReport flags non-compliant system', () => {
  const report = generateComplianceReport({
    name: 'Unmanaged ELK',
    dataTypes: ['application-logs', 'access-logs'],
    containsPII: true,
    encrypted: false,
    retentionConfigured: false,
    retentionDays: 0,
    hostedInEU: false,
    dpaSign: false,
    rbacEnabled: false,
    auditLog: false,
    piiScrubbing: false,
  });

  assert(report.score < 70, 'Score should be below compliance threshold');
  assert(report.compliant === false, 'Should not be compliant');
  assert(report.issues.some(i => i.severity === 'critical'), 'Should have critical issues');
  assert(report.recommendations.length > 0, 'Should have recommendations');
});

await test('generateComplianceReport passes compliant system', () => {
  const report = generateComplianceReport({
    name: 'Grafana Cloud EU',
    dataTypes: ['metrics', 'traces'],
    containsPII: false,
    encrypted: true,
    retentionConfigured: true,
    retentionDays: 30,
    hostedInEU: true,
    dpaSign: true,
    rbacEnabled: true,
    auditLog: true,
    piiScrubbing: true,
  });

  assert(report.score >= 70, 'Score should be above compliance threshold');
  assert(report.compliant === true, 'Should be compliant');
  assertEqual(report.dataMapping.length, 2, 'Should map 2 data types');
});

await test('generateComplianceReport flags excessive retention', () => {
  const report = generateComplianceReport({
    name: 'Long Retention Logs',
    dataTypes: ['application-logs'],
    containsPII: true,
    encrypted: true,
    retentionConfigured: true,
    retentionDays: 730,
    hostedInEU: true,
    dpaSign: true,
    rbacEnabled: true,
    auditLog: true,
    piiScrubbing: true,
  });

  assert(report.issues.some(i => i.message.toLowerCase().includes('retention')), 'Should flag excessive retention');
});

summary();

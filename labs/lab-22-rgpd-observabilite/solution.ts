import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } = createTestRunner('Lab 28 — RGPD & Observabilite');

// ============================================================
// Types
// ============================================================

interface PIIDetection {
  type: 'email' | 'phone' | 'creditCard' | 'ip' | 'jwt';
  value: string;
  field: string;
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
  createdAt: number;
  content: string;
}

interface RetentionResult {
  deleted: string[];
  retained: string[];
  heldByLegal: string[];
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
  score: number;
  compliant: boolean;
  issues: { severity: 'critical' | 'high' | 'medium' | 'low'; message: string }[];
  recommendations: string[];
  dataMapping: { dataType: string; containsPII: boolean; retentionDays: number; hostedInEU: boolean }[];
}

// ============================================================
// TODO 1: detectAndScrubPII
// ============================================================

function detectAndScrubPII(entry: LogEntry): ScrubResult {
  const patterns: { type: PIIDetection['type']; regex: RegExp }[] = [
    { type: 'email', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { type: 'phone', regex: /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g },
    { type: 'creditCard', regex: /\b\d{13,19}\b/g },
    { type: 'ip', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
    { type: 'jwt', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  ];

  const detections: PIIDetection[] = [];
  const scrubbed: LogEntry = { ...entry };

  // Scan all string fields
  const fieldsToScan = Object.keys(entry).filter(
    k => typeof entry[k] === 'string' && k !== 'timestamp' && k !== 'level'
  );

  for (const field of fieldsToScan) {
    let value = entry[field] as string;

    for (const { type, regex } of patterns) {
      // Reset regex state
      const re = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = re.exec(value)) !== null) {
        detections.push({ type, value: match[0], field });
      }
      value = value.replace(new RegExp(regex.source, regex.flags), '[REDACTED]');
    }

    (scrubbed as Record<string, unknown>)[field] = value;
  }

  return {
    scrubbed,
    detections,
    piiCount: detections.length,
  };
}

// ============================================================
// TODO 2: enforceRetention
// ============================================================

function enforceRetention(
  policies: RetentionPolicy[],
  records: DataRecord[],
  now: number
): RetentionResult {
  const deleted: string[] = [];
  const retained: string[] = [];
  const heldByLegal: string[] = [];

  for (const record of records) {
    const policy = policies.find(p => p.dataType === record.dataType);

    if (!policy) {
      // No policy: retain
      retained.push(record.id);
      continue;
    }

    if (policy.legalHold) {
      // Legal hold: retain and report
      retained.push(record.id);
      heldByLegal.push(record.id);
      continue;
    }

    const ageMs = now - record.createdAt;
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays > policy.maxAgeDays) {
      deleted.push(record.id);
    } else {
      retained.push(record.id);
    }
  }

  return { deleted, retained, heldByLegal };
}

// ============================================================
// TODO 3: ConsentManager
// ============================================================

class ConsentManager {
  private consent: ConsentState | null = null;
  private readonly MAX_AGE_MS = 13 * 30 * 24 * 60 * 60 * 1000; // ~13 months

  setConsent(categories: { analytics: boolean; personalization: boolean; marketing: boolean }, now: number): ConsentState {
    this.consent = {
      ...categories,
      timestamp: now,
      expiresAt: now + this.MAX_AGE_MS,
    };
    return this.consent;
  }

  getConsent(): ConsentState | null {
    return this.consent;
  }

  validateConsent(now: number): ConsentValidation {
    const issues: string[] = [];

    if (!this.consent) {
      return { valid: false, expired: false, issues: ['No consent recorded'] };
    }

    const expired = now > this.consent.expiresAt;
    if (expired) {
      issues.push('Consent has expired (> 13 months)');
    }

    if (!this.consent.timestamp) {
      issues.push('Consent missing timestamp');
    }

    return {
      valid: !expired && issues.length === 0,
      expired,
      issues,
    };
  }

  hasConsent(category: 'analytics' | 'personalization' | 'marketing'): boolean {
    if (!this.consent) return false;
    return this.consent[category] === true;
  }

  withdrawConsent(): void {
    this.consent = null;
  }

  isExempt(config: { serverSideOnly: boolean; noCookies: boolean; noFingerprinting: boolean; hostedInEU: boolean }): boolean {
    return config.serverSideOnly && config.noCookies && config.noFingerprinting && config.hostedInEU;
  }
}

// ============================================================
// TODO 4: evaluateDPIA
// ============================================================

function calculateRiskLevel(probability: 'low' | 'medium' | 'high', impact: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
  if (probability === 'high' && (impact === 'critical' || impact === 'high')) return 'critical';
  if (probability === 'high' && impact === 'medium') return 'high';
  if (probability === 'high' && impact === 'low') return 'medium';
  if (probability === 'medium' && impact === 'critical') return 'critical';
  if (probability === 'medium' && (impact === 'high' || impact === 'medium')) return 'high';
  if (probability === 'medium' && impact === 'low') return 'medium';
  if (probability === 'low' && impact === 'critical') return 'high';
  if (probability === 'low' && (impact === 'high' || impact === 'medium')) return 'medium';
  return 'low';
}

function evaluateDPIA(system: ObservabilitySystem): DPIAReport {
  const risks: DPIARisk[] = [];

  if (system.containsPII && !system.piiScrubbing) {
    risks.push({
      name: 'PII in logs without scrubbing',
      description: 'Personal data present in logs/traces without automatic redaction',
      probability: 'high',
      impact: 'high',
      riskLevel: calculateRiskLevel('high', 'high'),
      mitigations: ['Implement PII scrubbing in log pipeline', 'Use Pino redact or OTel span processor'],
    });
  }

  if (!system.encrypted) {
    risks.push({
      name: 'Data not encrypted',
      description: 'Observability data stored and/or transmitted without encryption',
      probability: 'medium',
      impact: 'high',
      riskLevel: calculateRiskLevel('medium', 'high'),
      mitigations: ['Enable encryption at rest', 'Enable TLS for all connections'],
    });
  }

  if (!system.hostedInEU) {
    risks.push({
      name: 'Data transfer outside EU',
      description: 'Data stored outside the EU, potential Schrems II violation',
      probability: 'medium',
      impact: 'critical',
      riskLevel: calculateRiskLevel('medium', 'critical'),
      mitigations: ['Migrate to EU-hosted infrastructure', 'Implement SCCs and TIA', 'Verify EU-US DPF certification'],
    });
  }

  if (!system.rbacEnabled) {
    risks.push({
      name: 'No access control',
      description: 'Observability data accessible without role-based access control',
      probability: 'medium',
      impact: 'medium',
      riskLevel: calculateRiskLevel('medium', 'medium'),
      mitigations: ['Enable RBAC on all dashboards and APIs', 'Apply principle of least privilege'],
    });
  }

  if (!system.retentionConfigured) {
    risks.push({
      name: 'No retention policy',
      description: 'Data kept indefinitely without automated deletion',
      probability: 'high',
      impact: 'medium',
      riskLevel: calculateRiskLevel('high', 'medium'),
      mitigations: ['Configure ILM in Elasticsearch or retention in Loki/Prometheus', 'Document retention periods per data type'],
    });
  }

  if (!system.auditLog) {
    risks.push({
      name: 'No audit logging',
      description: 'Access to observability data is not tracked',
      probability: 'low',
      impact: 'medium',
      riskLevel: calculateRiskLevel('low', 'medium'),
      mitigations: ['Enable audit logging on dashboards and API access', 'Review access logs periodically'],
    });
  }

  const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const overallRiskLevel = risks.reduce<'low' | 'medium' | 'high' | 'critical'>((max, r) => {
    return riskOrder[r.riskLevel] > riskOrder[max] ? r.riskLevel : max;
  }, 'low');

  const dpiaRequired = risks.some(r => r.riskLevel === 'critical' || r.riskLevel === 'high') || system.containsPII;
  const mitigationCount = risks.reduce((sum, r) => sum + r.mitigations.length, 0);

  return {
    systemName: system.name,
    risks,
    overallRiskLevel,
    dpiaRequired,
    mitigationCount,
  };
}

// ============================================================
// TODO 5: generateComplianceReport
// ============================================================

function generateComplianceReport(system: ObservabilitySystem): ComplianceReport {
  let score = 100;
  const issues: ComplianceReport['issues'] = [];
  const recommendations: string[] = [];

  if (system.containsPII && !system.piiScrubbing) {
    score -= 25;
    issues.push({ severity: 'critical', message: 'PII present in data without automatic scrubbing' });
    recommendations.push('Implement automatic PII scrubbing before data enters the observability pipeline');
  }

  if (!system.encrypted) {
    score -= 15;
    issues.push({ severity: 'high', message: 'Data is not encrypted at rest and/or in transit' });
    recommendations.push('Enable encryption at rest and TLS for all data transfers');
  }

  if (!system.hostedInEU) {
    score -= 20;
    issues.push({ severity: 'critical', message: 'Data hosted outside the EU without adequate safeguards' });
    recommendations.push('Migrate to EU-hosted infrastructure or implement SCCs with TIA');
  }

  if (!system.dpaSign && !system.hostedInEU) {
    score -= 10;
    issues.push({ severity: 'high', message: 'No DPA signed with non-EU data processor' });
    recommendations.push('Sign a Data Processing Agreement (DPA) with the service provider');
  }

  if (!system.rbacEnabled) {
    score -= 10;
    issues.push({ severity: 'high', message: 'No RBAC configured — all users have full access' });
    recommendations.push('Implement role-based access control with least-privilege principle');
  }

  if (!system.retentionConfigured) {
    score -= 10;
    issues.push({ severity: 'medium', message: 'No data retention policy configured' });
    recommendations.push('Configure automated retention policies with appropriate TTLs per data type');
  }

  if (!system.auditLog) {
    score -= 5;
    issues.push({ severity: 'low', message: 'No audit logging of data access' });
    recommendations.push('Enable audit logging to track who accesses observability data');
  }

  if (system.retentionDays > 365 && system.containsPII) {
    score -= 5;
    issues.push({ severity: 'medium', message: 'Excessive data retention (> 1 year) for PII-containing data' });
    recommendations.push('Reduce retention period or implement automatic anonymization after a shorter period');
  }

  score = Math.max(0, score);

  const dataMapping = system.dataTypes.map(dt => ({
    dataType: dt,
    containsPII: system.containsPII,
    retentionDays: system.retentionDays,
    hostedInEU: system.hostedInEU,
  }));

  return {
    systemName: system.name,
    score,
    compliant: score >= 70,
    issues,
    recommendations,
    dataMapping,
  };
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
  const past = Date.now() - 14 * 30 * 24 * 60 * 60 * 1000;
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

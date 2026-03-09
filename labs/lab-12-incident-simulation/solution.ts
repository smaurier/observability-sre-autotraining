// =============================================================================
// Lab 12 — Simulation d'incident (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertDeepEqual, assertThrows, assertIncludes, summary } = createTestRunner('Lab 12 — Incident Simulation');

// =============================================================================
// Types
// =============================================================================

type Severity = 'P1' | 'P2' | 'P3' | 'P4';
type IncidentStatus = 'detected' | 'triaged' | 'mitigating' | 'resolved';
type IncidentRole = 'incident_commander' | 'comms_lead' | 'ops_lead';

interface TimelineEntry {
  timestamp: number;
  status: IncidentStatus;
  message: string;
}

interface Incident {
  id: string;
  severity: Severity;
  title: string;
  status: IncidentStatus;
  timeline: TimelineEntry[];
  roles: Map<IncidentRole, string>;
  createdAt: number;
  resolvedAt?: number;
}

// =============================================================================
// Exercice 1 — Créer un incident
// =============================================================================

function createIncident(id: string, title: string, severity: Severity): Incident {
  const now = Date.now();
  return {
    id,
    severity,
    title,
    status: 'detected',
    timeline: [
      {
        timestamp: now,
        status: 'detected',
        message: `Incident detected: ${title}`,
      },
    ],
    roles: new Map(),
    createdAt: now,
  };
}

// =============================================================================
// Exercice 2 — Machine à états d'incident
// =============================================================================

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus | null> = {
  detected: 'triaged',
  triaged: 'mitigating',
  mitigating: 'resolved',
  resolved: null,
};

function transitionIncident(incident: Incident, newStatus: IncidentStatus, message: string): Incident {
  const expectedNext = VALID_TRANSITIONS[incident.status];
  if (expectedNext !== newStatus) {
    throw new Error(`Invalid transition: ${incident.status} → ${newStatus}`);
  }

  const now = Date.now();
  const newTimeline = [
    ...incident.timeline,
    { timestamp: now, status: newStatus, message },
  ];

  return {
    ...incident,
    status: newStatus,
    timeline: newTimeline,
    roles: new Map(incident.roles),
    ...(newStatus === 'resolved' ? { resolvedAt: now } : {}),
  };
}

// =============================================================================
// Exercice 3 — Assigner les rôles
// =============================================================================

function assignRole(incident: Incident, role: IncidentRole, person: string): Incident {
  const newRoles = new Map(incident.roles);
  newRoles.set(role, person);
  const now = Date.now();
  return {
    ...incident,
    roles: newRoles,
    timeline: [
      ...incident.timeline,
      { timestamp: now, status: incident.status, message: `Role ${role} assigned to ${person}` },
    ],
  };
}

function validateRoles(incident: Incident): { valid: boolean; missingRoles: IncidentRole[] } {
  const requiredRoles: IncidentRole[] = ['incident_commander', 'comms_lead', 'ops_lead'];
  const missingRoles = requiredRoles.filter(role => !incident.roles.has(role));
  return {
    valid: missingRoles.length === 0,
    missingRoles,
  };
}

// =============================================================================
// Exercice 4 — Communication timeline
// =============================================================================

interface StatusUpdate {
  timestamp: number;
  audience: 'internal' | 'external' | 'stakeholders';
  message: string;
  incidentStatus: IncidentStatus;
}

function createStatusUpdate(
  incident: Incident,
  audience: StatusUpdate['audience'],
  message: string
): StatusUpdate {
  return {
    timestamp: Date.now(),
    audience,
    message,
    incidentStatus: incident.status,
  };
}

function generateCommunicationTimeline(incident: Incident): StatusUpdate[] {
  return incident.timeline.map(entry => {
    let audience: StatusUpdate['audience'];
    switch (entry.status) {
      case 'detected':
      case 'triaged':
        audience = 'internal';
        break;
      case 'mitigating':
        audience = 'external';
        break;
      case 'resolved':
        audience = 'stakeholders';
        break;
      default:
        audience = 'internal';
    }
    return {
      timestamp: entry.timestamp,
      audience,
      message: entry.message,
      incidentStatus: entry.status,
    };
  });
}

// =============================================================================
// Exercice 5 — Simulation complète
// =============================================================================

interface SimulationResult {
  incident: Incident;
  communications: StatusUpdate[];
  duration: number;
  timeToMitigate: number;
}

function simulateIncident(
  id: string,
  title: string,
  severity: Severity,
  team: { ic: string; comms: string; ops: string }
): SimulationResult {
  // 1. Créer l'incident
  let incident = createIncident(id, title, severity);

  // 2. Assigner les rôles
  incident = assignRole(incident, 'incident_commander', team.ic);
  incident = assignRole(incident, 'comms_lead', team.comms);
  incident = assignRole(incident, 'ops_lead', team.ops);

  // 3. Transitions
  incident = transitionIncident(incident, 'triaged', 'Incident triaged and severity confirmed');
  incident = transitionIncident(incident, 'mitigating', 'Mitigation in progress');

  const mitigatingTimestamp = incident.timeline.find(e => e.status === 'mitigating')!.timestamp;

  incident = transitionIncident(incident, 'resolved', 'Incident resolved');

  // 4. Generate communications
  const communications = generateCommunicationTimeline(incident);

  // 5. Calculate durations
  const duration = (incident.resolvedAt || Date.now()) - incident.createdAt;
  const timeToMitigate = mitigatingTimestamp - incident.createdAt;

  return {
    incident,
    communications,
    duration,
    timeToMitigate,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n🚨 Lab 12 — Incident Simulation\n');

  // --- Exercice 1 ---
  await test('Ex1: créer un incident avec les bons champs', () => {
    const incident = createIncident('INC-001', 'API latency spike', 'P1');
    assertEqual(incident.id, 'INC-001');
    assertEqual(incident.severity, 'P1');
    assertEqual(incident.title, 'API latency spike');
    assertEqual(incident.status, 'detected');
    assertEqual(incident.timeline.length, 1);
    assertEqual(incident.timeline[0].status, 'detected');
    assert(incident.timeline[0].message.includes('API latency spike'), 'Timeline should mention title');
    assert(incident.roles.size === 0, 'Roles should be empty initially');
  });

  // --- Exercice 2 ---
  await test('Ex2: transition valide detected → triaged', () => {
    const incident = createIncident('INC-002', 'DB connection pool exhausted', 'P2');
    const triaged = transitionIncident(incident, 'triaged', 'Root cause identified: connection leak');
    assertEqual(triaged.status, 'triaged');
    assertEqual(triaged.timeline.length, 2);
    assertEqual(incident.status, 'detected');
  });

  await test('Ex2: transition invalide detected → resolved throws', () => {
    const incident = createIncident('INC-003', 'Memory leak', 'P3');
    assertThrows(() => {
      transitionIncident(incident, 'resolved', 'Trying to skip steps');
    });
  });

  await test('Ex2: transition complète jusqu\'à resolved', () => {
    let incident = createIncident('INC-004', 'Certificate expiry', 'P1');
    incident = transitionIncident(incident, 'triaged', 'Triaged');
    incident = transitionIncident(incident, 'mitigating', 'Renewing cert');
    incident = transitionIncident(incident, 'resolved', 'Cert renewed');
    assertEqual(incident.status, 'resolved');
    assert(incident.resolvedAt !== undefined, 'resolvedAt should be set');
    assertEqual(incident.timeline.length, 4);
  });

  // --- Exercice 3 ---
  await test('Ex3: assigner les rôles', () => {
    let incident = createIncident('INC-005', 'DDoS attack', 'P1');
    incident = assignRole(incident, 'incident_commander', 'Alice');
    incident = assignRole(incident, 'comms_lead', 'Bob');
    incident = assignRole(incident, 'ops_lead', 'Charlie');
    assertEqual(incident.roles.get('incident_commander'), 'Alice');
    assertEqual(incident.roles.get('comms_lead'), 'Bob');
    assertEqual(incident.roles.get('ops_lead'), 'Charlie');
  });

  await test('Ex3: valider les rôles — complets', () => {
    let incident = createIncident('INC-006', 'Test', 'P3');
    incident = assignRole(incident, 'incident_commander', 'Alice');
    incident = assignRole(incident, 'comms_lead', 'Bob');
    incident = assignRole(incident, 'ops_lead', 'Charlie');
    const result = validateRoles(incident);
    assert(result.valid, 'All roles should be valid');
    assertEqual(result.missingRoles.length, 0);
  });

  await test('Ex3: valider les rôles — manquants', () => {
    const incident = createIncident('INC-007', 'Test', 'P3');
    const result = validateRoles(incident);
    assert(!result.valid, 'Should not be valid with missing roles');
    assertEqual(result.missingRoles.length, 3);
  });

  // --- Exercice 4 ---
  await test('Ex4: créer une status update', () => {
    const incident = createIncident('INC-008', 'Outage', 'P1');
    const update = createStatusUpdate(incident, 'internal', 'Investigating the issue');
    assertEqual(update.audience, 'internal');
    assertEqual(update.incidentStatus, 'detected');
    assertIncludes(update.message, 'Investigating');
  });

  await test('Ex4: générer la communication timeline', () => {
    let incident = createIncident('INC-009', 'Service down', 'P1');
    incident = transitionIncident(incident, 'triaged', 'Triaged - DB issue');
    incident = transitionIncident(incident, 'mitigating', 'Failover in progress');
    incident = transitionIncident(incident, 'resolved', 'Service restored');
    const comms = generateCommunicationTimeline(incident);
    assertEqual(comms.length, 4);
    assertEqual(comms[0].audience, 'internal');
    assertEqual(comms[1].audience, 'internal');
    assertEqual(comms[2].audience, 'external');
    assertEqual(comms[3].audience, 'stakeholders');
  });

  // --- Exercice 5 ---
  await test('Ex5: simulation complète d\'un incident', () => {
    const result = simulateIncident(
      'INC-010',
      'Payment service degradation',
      'P1',
      { ic: 'Alice', comms: 'Bob', ops: 'Charlie' }
    );
    assertEqual(result.incident.status, 'resolved');
    assert(result.incident.resolvedAt !== undefined, 'Should be resolved');
    assertEqual(result.incident.roles.get('incident_commander'), 'Alice');
    assert(result.communications.length >= 4, 'Should have at least 4 communications');
    assert(result.duration >= 0, 'Duration should be >= 0');
    assert(result.timeToMitigate >= 0, 'Time to mitigate should be >= 0');
    assert(result.timeToMitigate <= result.duration, 'Time to mitigate <= total duration');
  });

  summary();
}

main();

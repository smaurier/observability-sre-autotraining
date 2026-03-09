// =============================================================================
// Lab 12 — Simulation d'incident (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
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
  // TODO: Créer un nouvel incident avec :
  // - id, title, severity donnés
  // - status initial: 'detected'
  // - timeline: un premier événement "Incident detected: {title}"
  // - roles: Map vide
  // - createdAt: Date.now()
  throw new Error('TODO: Implement createIncident');
}

// =============================================================================
// Exercice 2 — Machine à états d'incident
// =============================================================================
// Transitions valides :
//   detected → triaged
//   triaged → mitigating
//   mitigating → resolved
// =============================================================================

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus | null> = {
  detected: 'triaged',
  triaged: 'mitigating',
  mitigating: 'resolved',
  resolved: null,
};

function transitionIncident(incident: Incident, newStatus: IncidentStatus, message: string): Incident {
  // TODO: Implémenter la transition d'état
  // 1. Vérifier que la transition est valide (VALID_TRANSITIONS[incident.status] === newStatus)
  // 2. Si invalide, throw new Error(`Invalid transition: ${incident.status} → ${newStatus}`)
  // 3. Créer une copie de l'incident avec :
  //    - Le nouveau status
  //    - Un nouvel événement dans la timeline (timestamp: Date.now(), status: newStatus, message)
  //    - Si newStatus === 'resolved', ajouter resolvedAt: Date.now()
  // 4. Retourner la copie (ne pas muter l'original)
  throw new Error('TODO: Implement transitionIncident');
}

// =============================================================================
// Exercice 3 — Assigner les rôles
// =============================================================================

function assignRole(incident: Incident, role: IncidentRole, person: string): Incident {
  // TODO: Assigner un rôle à une personne
  // 1. Créer une copie de l'incident
  // 2. Ajouter le rôle dans la Map roles
  // 3. Ajouter un événement timeline: "Role {role} assigned to {person}"
  // 4. Retourner la copie
  throw new Error('TODO: Implement assignRole');
}

function validateRoles(incident: Incident): { valid: boolean; missingRoles: IncidentRole[] } {
  // TODO: Vérifier que tous les rôles sont assignés
  // - Les 3 rôles requis: incident_commander, comms_lead, ops_lead
  // - Retourner { valid: true, missingRoles: [] } si tous assignés
  // - Sinon { valid: false, missingRoles: [...rôles manquants] }
  throw new Error('TODO: Implement validateRoles');
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
  // TODO: Créer une mise à jour de statut
  // - timestamp: Date.now()
  // - audience: paramètre
  // - message: paramètre
  // - incidentStatus: incident.status actuel
  throw new Error('TODO: Implement createStatusUpdate');
}

function generateCommunicationTimeline(incident: Incident): StatusUpdate[] {
  // TODO: Générer une timeline de communication à partir de l'incident
  // Pour chaque entrée dans incident.timeline, créer une StatusUpdate :
  //   - audience: 'internal' pour 'detected' et 'triaged'
  //   - audience: 'external' pour 'mitigating'
  //   - audience: 'stakeholders' pour 'resolved'
  //   - message: l'entrée de timeline .message
  //   - timestamp et incidentStatus depuis l'entrée
  throw new Error('TODO: Implement generateCommunicationTimeline');
}

// =============================================================================
// Exercice 5 — Simulation complète
// =============================================================================

interface SimulationResult {
  incident: Incident;
  communications: StatusUpdate[];
  duration: number; // ms from creation to resolution
  timeToMitigate: number; // ms from creation to mitigating
}

function simulateIncident(
  id: string,
  title: string,
  severity: Severity,
  team: { ic: string; comms: string; ops: string }
): SimulationResult {
  // TODO: Simuler un incident complet
  // 1. Créer l'incident
  // 2. Assigner les rôles (ic → incident_commander, comms → comms_lead, ops → ops_lead)
  // 3. Transition detected → triaged (message: "Incident triaged and severity confirmed")
  // 4. Transition triaged → mitigating (message: "Mitigation in progress")
  // 5. Transition mitigating → resolved (message: "Incident resolved")
  // 6. Générer la communication timeline
  // 7. Calculer duration = resolvedAt - createdAt
  // 8. Trouver le timestamp de la transition vers 'mitigating' pour timeToMitigate
  // 9. Retourner SimulationResult
  throw new Error('TODO: Implement simulateIncident');
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
    assertEqual(incident.status, 'detected'); // original not mutated
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

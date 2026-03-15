// =============================================================================
// Lab 12 — Incidents et Postmortems (simulation en TypeScript)
// =============================================================================
// Executer avec : npx tsx exercise.ts
// =============================================================================

// =============================================================================
// Types
// =============================================================================

type Severity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

interface Incident {
  id: string;
  title: string;
  severity: Severity;
  detectedAt: number;    // timestamp ms
  acknowledgedAt?: number;
  mitigatedAt?: number;
  resolvedAt?: number;
  commander?: string;
  timeline: TimelineEntry[];
}

interface TimelineEntry {
  timestamp: number;
  actor: string;
  action: string;
}

interface SeverityRule {
  severity: Severity;
  condition: (context: IncidentContext) => boolean;
}

interface IncidentContext {
  errorRate: number;       // percentage (0-100)
  affectedUsers: number;
  revenueImpact: number;   // €/min
  serviceDown: boolean;
}

interface PostmortemReport {
  incidentId: string;
  title: string;
  severity: Severity;
  duration: { mttd: number; mtta: number; mttr: number }; // all in seconds
  timeline: TimelineEntry[];
  rootCause: string;
  actionItems: ActionItem[];
}

interface ActionItem {
  description: string;
  priority: 'P1' | 'P2' | 'P3';
  owner: string;
  dueDate: string;
}

// =============================================================================
// PARTIE 1 — Classification de sévérité
// =============================================================================
// Objectif : Classifier automatiquement la sévérité d'un incident.
//
// TODO: Implementez classifySeverity(context) qui retourne la sévérité :
//   - SEV1 : service down OU revenueImpact > 100 OU affectedUsers > 10000
//   - SEV2 : errorRate > 10 OU affectedUsers > 1000 OU revenueImpact > 10
//   - SEV3 : errorRate > 1 OU affectedUsers > 100
//   - SEV4 : tout le reste
//
// 💡 Indice : Évaluer du plus grave au moins grave (SEV1 d'abord)

function classifySeverity(_context: IncidentContext): Severity {
  // TODO
  console.log('  TODO: Implementer classifySeverity()');
  return 'SEV4';
}

// =============================================================================
// PARTIE 2 — Gestion du lifecycle d'un incident
// =============================================================================
// Objectif : Tracker les transitions d'état d'un incident.
//
// TODO: Implementez IncidentManager avec :
//   - create(title, context) : crée un incident, classifie la sévérité
//   - acknowledge(id, commander) : assigne un IC, enregistre le timestamp
//   - addTimelineEntry(id, actor, action) : ajoute une entrée au timeline
//   - mitigate(id) : marque l'incident comme mitigé
//   - resolve(id) : marque l'incident comme résolu
//   - getIncident(id) : retourne l'incident

class IncidentManager {
  private incidents = new Map<string, Incident>();
  private nextId = 1;

  create(_title: string, _context: IncidentContext): Incident {
    // TODO: Créer l'incident avec sévérité auto-classifiée
    console.log('  TODO: Implementer create()');
    return { id: 'INC-0', title: '', severity: 'SEV4', detectedAt: 0, timeline: [] };
  }

  acknowledge(_id: string, _commander: string): void {
    // TODO: Assigner le commander, enregistrer acknowledgedAt
    console.log('  TODO: Implementer acknowledge()');
  }

  addTimelineEntry(_id: string, _actor: string, _action: string): void {
    // TODO: Ajouter une entrée au timeline
    console.log('  TODO: Implementer addTimelineEntry()');
  }

  mitigate(_id: string): void {
    // TODO: Enregistrer mitigatedAt
    console.log('  TODO: Implementer mitigate()');
  }

  resolve(_id: string): void {
    // TODO: Enregistrer resolvedAt
    console.log('  TODO: Implementer resolve()');
  }

  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }
}

// =============================================================================
// PARTIE 3 — Calcul MTTD / MTTA / MTTR
// =============================================================================
// Objectif : Calculer les métriques clés d'un incident.
//
// TODO: Implementez computeIncidentMetrics(incident) qui retourne :
//   - mttd (Mean Time To Detect) : 0 (on suppose détection immédiate)
//   - mtta (Mean Time To Acknowledge) : acknowledgedAt - detectedAt (en secondes)
//   - mttr (Mean Time To Resolve) : resolvedAt - detectedAt (en secondes)
//   - Retourner null si l'incident n'est pas résolu

interface IncidentMetrics {
  mttd: number;
  mtta: number;
  mttr: number;
}

function computeIncidentMetrics(_incident: Incident): IncidentMetrics | null {
  // TODO
  console.log('  TODO: Implementer computeIncidentMetrics()');
  return null;
}

// =============================================================================
// PARTIE 4 — Générateur de postmortem
// =============================================================================
// Objectif : Générer un rapport postmortem structuré à partir d'un incident.
//
// TODO: Implementez generatePostmortem(incident, rootCause, actionItems) qui :
//   1. Vérifie que l'incident est résolu (sinon throw)
//   2. Calcule les métriques (MTTD/MTTA/MTTR)
//   3. Retourne un PostmortemReport complet
//
// 💡 Un bon postmortem est blameless — il se concentre sur les systèmes, pas les personnes

function generatePostmortem(
  _incident: Incident,
  _rootCause: string,
  _actionItems: ActionItem[],
): PostmortemReport {
  // TODO
  console.log('  TODO: Implementer generatePostmortem()');
  return {
    incidentId: '', title: '', severity: 'SEV4',
    duration: { mttd: 0, mtta: 0, mttr: 0 },
    timeline: [], rootCause: '', actionItems: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 12 — Incidents et Postmortems ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Severity classification
  const sev1 = classifySeverity({ errorRate: 5, affectedUsers: 500, revenueImpact: 200, serviceDown: false });
  const sev2 = classifySeverity({ errorRate: 15, affectedUsers: 500, revenueImpact: 5, serviceDown: false });
  const sev3 = classifySeverity({ errorRate: 3, affectedUsers: 50, revenueImpact: 0, serviceDown: false });
  const sev4 = classifySeverity({ errorRate: 0.5, affectedUsers: 10, revenueImpact: 0, serviceDown: false });
  if (sev1 === 'SEV1' && sev2 === 'SEV2' && sev3 === 'SEV3' && sev4 === 'SEV4') {
    console.log('  ✅ Test 1: Classification de sévérité correcte');
    passed++;
  } else {
    console.log(`  ❌ Test 1: Classification echoue (${sev1}, ${sev2}, ${sev3}, ${sev4})`);
    failed++;
  }

  // Test 2: Incident lifecycle
  const mgr = new IncidentManager();
  const inc = mgr.create('API latency spike', {
    errorRate: 25, affectedUsers: 5000, revenueImpact: 50, serviceDown: false,
  });
  mgr.acknowledge(inc.id, 'alice');
  mgr.addTimelineEntry(inc.id, 'alice', 'Investigating database connection pool');
  mgr.addTimelineEntry(inc.id, 'bob', 'Found: connection leak in auth service');
  mgr.mitigate(inc.id);
  mgr.resolve(inc.id);
  const resolved = mgr.getIncident(inc.id);
  if (
    resolved
    && resolved.severity === 'SEV2'
    && resolved.commander === 'alice'
    && resolved.resolvedAt
    && resolved.timeline.length >= 2
  ) {
    console.log('  ✅ Test 2: Lifecycle incident complet');
    passed++;
  } else {
    console.log(`  ❌ Test 2: Lifecycle echoue (sev=${resolved?.severity}, cmd=${resolved?.commander}, entries=${resolved?.timeline.length})`);
    failed++;
  }

  // Test 3: Metrics computation
  const fakeIncident: Incident = {
    id: 'INC-99', title: 'Test', severity: 'SEV2',
    detectedAt: 1000000,
    acknowledgedAt: 1000000 + 120_000,  // +2 min
    mitigatedAt: 1000000 + 600_000,     // +10 min
    resolvedAt: 1000000 + 1800_000,     // +30 min
    timeline: [],
  };
  const metrics = computeIncidentMetrics(fakeIncident);
  if (metrics && metrics.mtta === 120 && metrics.mttr === 1800) {
    console.log(`  ✅ Test 3: Métriques correctes (MTTA=${metrics.mtta}s, MTTR=${metrics.mttr}s)`);
    passed++;
  } else {
    console.log(`  ❌ Test 3: Métriques echouent (${JSON.stringify(metrics)})`);
    failed++;
  }

  // Test 4: Postmortem generation
  if (resolved) {
    const pm = generatePostmortem(resolved, 'Connection pool leak in auth service', [
      { description: 'Add connection pool monitoring', priority: 'P1', owner: 'bob', dueDate: '2026-04-01' },
      { description: 'Implement circuit breaker', priority: 'P2', owner: 'alice', dueDate: '2026-04-15' },
    ]);
    if (
      pm.incidentId === resolved.id
      && pm.rootCause.includes('Connection pool')
      && pm.actionItems.length === 2
      && pm.duration.mttr > 0
    ) {
      console.log('  ✅ Test 4: Postmortem généré correctement');
      passed++;
    } else {
      console.log(`  ❌ Test 4: Postmortem echoue (${pm.incidentId}, items=${pm.actionItems.length})`);
      failed++;
    }
  } else {
    console.log('  ❌ Test 4: Postmortem impossible (incident non résolu)');
    failed++;
  }

  console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);
}

setTimeout(runTests, 0);

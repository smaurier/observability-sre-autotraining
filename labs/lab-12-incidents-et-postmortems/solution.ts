// =============================================================================
// Lab 12 — Incidents et Postmortems (Solution)
// =============================================================================
// Executer avec : npx tsx solution.ts
// =============================================================================

type Severity = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

interface Incident {
  id: string;
  title: string;
  severity: Severity;
  detectedAt: number;
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

interface IncidentContext {
  errorRate: number;
  affectedUsers: number;
  revenueImpact: number;
  serviceDown: boolean;
}

interface PostmortemReport {
  incidentId: string;
  title: string;
  severity: Severity;
  duration: { mttd: number; mtta: number; mttr: number };
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

function classifySeverity(context: IncidentContext): Severity {
  // POURQUOI : On évalue du plus grave au moins grave. Un service down
  // est toujours SEV1, peu importe les autres métriques. Cette approche
  // "worst wins" évite de sous-estimer un incident.
  if (context.serviceDown || context.revenueImpact > 100 || context.affectedUsers > 10000) {
    return 'SEV1';
  }
  // POURQUOI : SEV2 = dégradation majeure. Le service fonctionne mais
  // les utilisateurs sont impactés significativement.
  if (context.errorRate > 10 || context.affectedUsers > 1000 || context.revenueImpact > 10) {
    return 'SEV2';
  }
  // POURQUOI : SEV3 = dégradation mineure. Quelques utilisateurs impactés
  // mais le service est globalement fonctionnel.
  if (context.errorRate > 1 || context.affectedUsers > 100) {
    return 'SEV3';
  }
  // POURQUOI : SEV4 = cosmétique ou investigation. Pas d'impact utilisateur
  // perceptible. Peut être traité pendant les heures de bureau.
  return 'SEV4';
}

// =============================================================================
// PARTIE 2 — Gestion du lifecycle d'un incident
// =============================================================================

class IncidentManager {
  private incidents = new Map<string, Incident>();
  private nextId = 1;

  create(title: string, context: IncidentContext): Incident {
    // POURQUOI : L'auto-classification évite le biais humain. En situation
    // de stress, les gens tendent à sous-estimer la sévérité. La classification
    // automatique peut toujours être override par l'IC si nécessaire.
    const id = `INC-${this.nextId++}`;
    const incident: Incident = {
      id,
      title,
      severity: classifySeverity(context),
      detectedAt: Date.now(),
      timeline: [],
    };
    this.incidents.set(id, incident);
    return incident;
  }

  acknowledge(id: string, commander: string): void {
    // POURQUOI : L'Incident Commander (IC) est le point unique de décision.
    // Sans IC désigné, les efforts se dispersent. Le timestamp d'acknowledge
    // sert à calculer le MTTA (Mean Time To Acknowledge).
    const inc = this.incidents.get(id);
    if (!inc) return;
    inc.commander = commander;
    inc.acknowledgedAt = Date.now();
    inc.timeline.push({
      timestamp: Date.now(),
      actor: commander,
      action: `Acknowledged as IC (${inc.severity})`,
    });
  }

  addTimelineEntry(id: string, actor: string, action: string): void {
    // POURQUOI : Le timeline est la matière première du postmortem.
    // Sans timeline précis, le postmortem sera basé sur la mémoire
    // (peu fiable sous stress). "If it's not in the timeline, it didn't happen."
    const inc = this.incidents.get(id);
    if (!inc) return;
    inc.timeline.push({ timestamp: Date.now(), actor, action });
  }

  mitigate(id: string): void {
    // POURQUOI : Mitigation ≠ résolution. Mitigé = les utilisateurs ne
    // sont plus impactés (ex: rollback). Résolu = la cause racine est fixée.
    // Cette distinction est importante pour le MTTR vs time-to-mitigate.
    const inc = this.incidents.get(id);
    if (!inc) return;
    inc.mitigatedAt = Date.now();
    inc.timeline.push({
      timestamp: Date.now(),
      actor: inc.commander ?? 'system',
      action: 'Incident mitigated',
    });
  }

  resolve(id: string): void {
    const inc = this.incidents.get(id);
    if (!inc) return;
    inc.resolvedAt = Date.now();
    inc.timeline.push({
      timestamp: Date.now(),
      actor: inc.commander ?? 'system',
      action: 'Incident resolved',
    });
  }

  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }
}

// =============================================================================
// PARTIE 3 — Calcul MTTD / MTTA / MTTR
// =============================================================================

interface IncidentMetrics {
  mttd: number;
  mtta: number;
  mttr: number;
}

function computeIncidentMetrics(incident: Incident): IncidentMetrics | null {
  // POURQUOI : Ces 3 métriques sont les KPIs fondamentaux de la fiabilité :
  //   - MTTD (Detect) : combien de temps pour détecter le problème ?
  //     → améliorer avec des alertes, SLO-based monitoring
  //   - MTTA (Acknowledge) : combien de temps pour qu'un humain prenne en charge ?
  //     → améliorer avec des rotations oncall, escalation automatique
  //   - MTTR (Resolve) : combien de temps total de l'incident ?
  //     → améliorer avec des runbooks, rollback automatique
  if (!incident.resolvedAt) return null;

  const mttd = 0; // On suppose détection immédiate (l'alerte a créé l'incident)
  const mtta = incident.acknowledgedAt
    ? (incident.acknowledgedAt - incident.detectedAt) / 1000
    : 0;
  const mttr = (incident.resolvedAt - incident.detectedAt) / 1000;

  return { mttd, mtta, mttr };
}

// =============================================================================
// PARTIE 4 — Générateur de postmortem
// =============================================================================

function generatePostmortem(
  incident: Incident,
  rootCause: string,
  actionItems: ActionItem[],
): PostmortemReport {
  // POURQUOI : Un postmortem blameless se concentre sur les systèmes.
  // "Bob a fait un mauvais deploy" → "Le pipeline de deploy n'avait pas
  // de smoke test automatique". L'objectif est de rendre le système
  // résilient aux erreurs humaines, pas de punir les humains.
  if (!incident.resolvedAt) {
    throw new Error('Cannot generate postmortem for unresolved incident');
  }

  const metrics = computeIncidentMetrics(incident)!;

  return {
    incidentId: incident.id,
    title: incident.title,
    severity: incident.severity,
    duration: metrics,
    timeline: incident.timeline,
    rootCause,
    actionItems,
  };
}

// =============================================================================
// Tests
// =============================================================================

async function runTests() {
  console.log('\n=== Lab 12 — Incidents et Postmortems (Solution) ===\n');

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
    console.log(`  ❌ Test 2: Lifecycle echoue`);
    failed++;
  }

  // Test 3: Metrics computation
  const fakeIncident: Incident = {
    id: 'INC-99', title: 'Test', severity: 'SEV2',
    detectedAt: 1000000,
    acknowledgedAt: 1000000 + 120_000,
    mitigatedAt: 1000000 + 600_000,
    resolvedAt: 1000000 + 1800_000,
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
      console.log(`  ❌ Test 4: Postmortem echoue`);
      failed++;
    }
  } else {
    console.log('  ❌ Test 4: Postmortem impossible (incident non résolu)');
    failed++;
  }

  console.log(`\n  Resultats: ${passed}/${passed + failed} tests passes\n`);
}

setTimeout(runTests, 0);

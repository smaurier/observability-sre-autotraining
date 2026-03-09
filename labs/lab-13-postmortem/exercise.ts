// =============================================================================
// Lab 13 — Ecrire un Postmortem (Exercise)
// =============================================================================
// Lancez les tests : npx tsx exercise.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertIncludes, assertGreaterThan, summary } = createTestRunner('Lab 13 — Postmortem');

// =============================================================================
// Types
// =============================================================================

type Severity = 'P1' | 'P2' | 'P3' | 'P4';

interface TimelineEntry {
  timestamp: string; // ISO 8601
  description: string;
}

interface ActionItem {
  id: string;
  description: string;
  owner: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string; // ISO 8601
  status: 'open' | 'in_progress' | 'done';
  // SMART fields
  specific: boolean;
  measurable: boolean;
  achievable: boolean;
  relevant: boolean;
  timeBound: boolean;
}

interface Postmortem {
  title: string;
  date: string;
  severity: Severity;
  summary: string;
  impact: string;
  timeline: TimelineEntry[];
  rootCause: string;
  actionItems: ActionItem[];
  lessonsLearned: string[];
}

interface FiveWhysChain {
  problem: string;
  whys: string[];
  rootCause: string;
}

type IshikawaCategory = 'People' | 'Process' | 'Technology' | 'Environment';

interface IshikawaDiagram {
  problem: string;
  categories: Record<IshikawaCategory, string[]>;
}

// =============================================================================
// Exercice 1 — Créer un postmortem
// =============================================================================

function createPostmortem(
  title: string,
  date: string,
  severity: Severity,
  summary: string,
  impact: string
): Postmortem {
  // TODO: Créer un postmortem avec :
  // - Les champs passés en paramètre
  // - timeline: tableau vide
  // - rootCause: chaîne vide
  // - actionItems: tableau vide
  // - lessonsLearned: tableau vide
  throw new Error('TODO: Implement createPostmortem');
}

function addTimelineEntry(postmortem: Postmortem, timestamp: string, description: string): Postmortem {
  // TODO: Ajouter une entrée à la timeline (retourner une copie)
  throw new Error('TODO: Implement addTimelineEntry');
}

function addLessonLearned(postmortem: Postmortem, lesson: string): Postmortem {
  // TODO: Ajouter une leçon apprise (retourner une copie)
  throw new Error('TODO: Implement addLessonLearned');
}

// =============================================================================
// Exercice 2 — Les 5 Whys
// =============================================================================

function buildFiveWhys(problem: string, whys: string[]): FiveWhysChain {
  // TODO: Construire une chaîne des 5 Whys
  // - problem: le problème initial
  // - whys: tableau des "pourquoi" (au moins 1, idéalement 5)
  // - rootCause: le dernier "why" de la chaîne
  // - Si whys est vide, throw new Error('At least one why is required')
  throw new Error('TODO: Implement buildFiveWhys');
}

// =============================================================================
// Exercice 3 — Diagramme d'Ishikawa
// =============================================================================

function createIshikawaDiagram(problem: string): IshikawaDiagram {
  // TODO: Créer un diagramme d'Ishikawa vide
  // - problem: le problème
  // - categories: { People: [], Process: [], Technology: [], Environment: [] }
  throw new Error('TODO: Implement createIshikawaDiagram');
}

function addCause(
  diagram: IshikawaDiagram,
  category: IshikawaCategory,
  cause: string
): IshikawaDiagram {
  // TODO: Ajouter une cause à une catégorie (retourner une copie)
  throw new Error('TODO: Implement addCause');
}

function analyzeDiagram(diagram: IshikawaDiagram): {
  totalCauses: number;
  dominantCategory: IshikawaCategory;
  summary: string;
} {
  // TODO: Analyser le diagramme
  // - totalCauses: nombre total de causes dans toutes les catégories
  // - dominantCategory: catégorie avec le plus de causes
  // - summary: "Problem '{problem}' has {totalCauses} causes. Dominant category: {dominantCategory}"
  // - Si aucune cause, dominantCategory = 'People' (par défaut)
  throw new Error('TODO: Implement analyzeDiagram');
}

// =============================================================================
// Exercice 4 — Action Items SMART
// =============================================================================

function createActionItem(
  id: string,
  description: string,
  owner: string,
  priority: ActionItem['priority'],
  dueDate: string
): ActionItem {
  // TODO: Créer un action item
  // - Tous les champs SMART à false par défaut
  // - status: 'open'
  throw new Error('TODO: Implement createActionItem');
}

function validateSMART(item: ActionItem): {
  valid: boolean;
  missing: string[];
} {
  // TODO: Valider qu'un action item est SMART
  // - Vérifier chaque champ SMART (specific, measurable, achievable, relevant, timeBound)
  // - Retourner { valid: true, missing: [] } si tous true
  // - Sinon { valid: false, missing: [...noms des champs false] }
  throw new Error('TODO: Implement validateSMART');
}

function markSMART(
  item: ActionItem,
  fields: Partial<Pick<ActionItem, 'specific' | 'measurable' | 'achievable' | 'relevant' | 'timeBound'>>
): ActionItem {
  // TODO: Marquer des champs SMART comme vrais
  // - Retourner une copie avec les champs mis à jour
  throw new Error('TODO: Implement markSMART');
}

// =============================================================================
// Exercice 5 — Générer un postmortem complet
// =============================================================================

function generatePostmortemDocument(postmortem: Postmortem): string {
  // TODO: Générer un document postmortem au format texte lisible
  // Le document doit contenir les sections suivantes :
  //
  // # POSTMORTEM: {title}
  // Date: {date}
  // Severity: {severity}
  //
  // ## Summary
  // {summary}
  //
  // ## Impact
  // {impact}
  //
  // ## Timeline
  // - [{timestamp}] {description}
  // ...
  //
  // ## Root Cause
  // {rootCause}
  //
  // ## Action Items
  // - [{priority}] {description} (Owner: {owner}, Due: {dueDate}, Status: {status})
  // ...
  //
  // ## Lessons Learned
  // - {lesson}
  // ...
  throw new Error('TODO: Implement generatePostmortemDocument');
}

// =============================================================================
// Tests
// =============================================================================

async function main() {
  console.log('\n📝 Lab 13 — Postmortem\n');

  // --- Exercice 1 ---
  await test('Ex1: créer un postmortem', () => {
    const pm = createPostmortem(
      'API Gateway Outage',
      '2024-01-15',
      'P1',
      'API Gateway became unresponsive for 45 minutes',
      '15,000 users affected, $50K revenue loss'
    );
    assertEqual(pm.title, 'API Gateway Outage');
    assertEqual(pm.severity, 'P1');
    assertEqual(pm.timeline.length, 0);
    assertEqual(pm.actionItems.length, 0);
    assertEqual(pm.lessonsLearned.length, 0);
  });

  await test('Ex1: ajouter des entrées timeline et leçons', () => {
    let pm = createPostmortem('Test', '2024-01-15', 'P2', 'Summary', 'Impact');
    pm = addTimelineEntry(pm, '2024-01-15T10:00:00Z', 'Alert fired');
    pm = addTimelineEntry(pm, '2024-01-15T10:05:00Z', 'IC assigned');
    pm = addLessonLearned(pm, 'Need better monitoring');
    assertEqual(pm.timeline.length, 2);
    assertEqual(pm.lessonsLearned.length, 1);
    assertEqual(pm.lessonsLearned[0], 'Need better monitoring');
  });

  // --- Exercice 2 ---
  await test('Ex2: construire une chaîne 5 Whys', () => {
    const chain = buildFiveWhys('Service went down', [
      'The server ran out of memory',
      'A memory leak in the connection pool',
      'Connections were not being properly closed',
      'Error handling did not close connections on failure',
      'No code review caught the missing cleanup',
    ]);
    assertEqual(chain.problem, 'Service went down');
    assertEqual(chain.whys.length, 5);
    assertEqual(chain.rootCause, 'No code review caught the missing cleanup');
  });

  await test('Ex2: 5 Whys avec chaîne vide lève une erreur', () => {
    let threw = false;
    try { buildFiveWhys('Problem', []); } catch { threw = true; }
    assert(threw, 'Should throw on empty whys');
  });

  // --- Exercice 3 ---
  await test('Ex3: créer et remplir un diagramme Ishikawa', () => {
    let diagram = createIshikawaDiagram('High latency');
    diagram = addCause(diagram, 'Technology', 'Slow database queries');
    diagram = addCause(diagram, 'Technology', 'No caching layer');
    diagram = addCause(diagram, 'Process', 'No load testing before deploy');
    diagram = addCause(diagram, 'People', 'Team unfamiliar with DB tuning');
    diagram = addCause(diagram, 'Environment', 'Cloud region at capacity');

    const analysis = analyzeDiagram(diagram);
    assertEqual(analysis.totalCauses, 5);
    assertEqual(analysis.dominantCategory, 'Technology');
    assertIncludes(analysis.summary, 'High latency');
    assertIncludes(analysis.summary, '5');
  });

  // --- Exercice 4 ---
  await test('Ex4: créer et valider un action item SMART', () => {
    let item = createActionItem(
      'AI-001',
      'Add connection pool monitoring dashboard',
      'Alice',
      'high',
      '2024-02-01'
    );
    const before = validateSMART(item);
    assert(!before.valid, 'Should not be SMART yet');
    assertEqual(before.missing.length, 5);

    item = markSMART(item, { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true });
    const after = validateSMART(item);
    assert(after.valid, 'Should now be SMART');
    assertEqual(after.missing.length, 0);
  });

  await test('Ex4: action item partiellement SMART', () => {
    let item = createActionItem('AI-002', 'Improve testing', 'Bob', 'medium', '2024-03-01');
    item = markSMART(item, { specific: true, timeBound: true });
    const result = validateSMART(item);
    assert(!result.valid, 'Should not be fully SMART');
    assertEqual(result.missing.length, 3);
    assertIncludes(result.missing, 'measurable');
    assertIncludes(result.missing, 'achievable');
    assertIncludes(result.missing, 'relevant');
  });

  // --- Exercice 5 ---
  await test('Ex5: générer un postmortem complet', () => {
    let pm = createPostmortem(
      'Database Failover Incident',
      '2024-01-20',
      'P1',
      'Primary database failed over causing 30min downtime',
      '10,000 requests failed, 5,000 users impacted'
    );
    pm = addTimelineEntry(pm, '2024-01-20T14:00:00Z', 'Alerts fired for DB connection errors');
    pm = addTimelineEntry(pm, '2024-01-20T14:05:00Z', 'IC assigned, team paged');
    pm = addTimelineEntry(pm, '2024-01-20T14:30:00Z', 'Failover completed, service restored');
    pm = { ...pm, rootCause: 'Primary DB disk reached 100% capacity' };
    const item = markSMART(
      createActionItem('AI-001', 'Add disk usage alerts at 80%', 'Ops Team', 'high', '2024-02-01'),
      { specific: true, measurable: true, achievable: true, relevant: true, timeBound: true }
    );
    pm = { ...pm, actionItems: [item] };
    pm = addLessonLearned(pm, 'Need proactive disk monitoring');
    pm = addLessonLearned(pm, 'Failover process was too slow');

    const doc = generatePostmortemDocument(pm);
    assertIncludes(doc, 'POSTMORTEM');
    assertIncludes(doc, 'Database Failover Incident');
    assertIncludes(doc, 'P1');
    assertIncludes(doc, 'Summary');
    assertIncludes(doc, 'Impact');
    assertIncludes(doc, 'Timeline');
    assertIncludes(doc, 'Root Cause');
    assertIncludes(doc, 'Action Items');
    assertIncludes(doc, 'Lessons Learned');
    assertIncludes(doc, 'disk usage alerts');
    assertIncludes(doc, 'proactive disk monitoring');
  });

  summary();
}

main();

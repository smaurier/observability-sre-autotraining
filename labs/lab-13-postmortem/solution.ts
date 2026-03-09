// =============================================================================
// Lab 13 — Ecrire un Postmortem (Solution)
// =============================================================================
// Lancez les tests : npx tsx solution.ts
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertIncludes, assertGreaterThan, summary } = createTestRunner('Lab 13 — Postmortem');

// =============================================================================
// Types
// =============================================================================

type Severity = 'P1' | 'P2' | 'P3' | 'P4';

interface TimelineEntry {
  timestamp: string;
  description: string;
}

interface ActionItem {
  id: string;
  description: string;
  owner: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  status: 'open' | 'in_progress' | 'done';
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
  return {
    title,
    date,
    severity,
    summary,
    impact,
    timeline: [],
    rootCause: '',
    actionItems: [],
    lessonsLearned: [],
  };
}

function addTimelineEntry(postmortem: Postmortem, timestamp: string, description: string): Postmortem {
  return {
    ...postmortem,
    timeline: [...postmortem.timeline, { timestamp, description }],
  };
}

function addLessonLearned(postmortem: Postmortem, lesson: string): Postmortem {
  return {
    ...postmortem,
    lessonsLearned: [...postmortem.lessonsLearned, lesson],
  };
}

// =============================================================================
// Exercice 2 — Les 5 Whys
// =============================================================================

function buildFiveWhys(problem: string, whys: string[]): FiveWhysChain {
  if (whys.length === 0) {
    throw new Error('At least one why is required');
  }
  return {
    problem,
    whys,
    rootCause: whys[whys.length - 1],
  };
}

// =============================================================================
// Exercice 3 — Diagramme d'Ishikawa
// =============================================================================

function createIshikawaDiagram(problem: string): IshikawaDiagram {
  return {
    problem,
    categories: {
      People: [],
      Process: [],
      Technology: [],
      Environment: [],
    },
  };
}

function addCause(
  diagram: IshikawaDiagram,
  category: IshikawaCategory,
  cause: string
): IshikawaDiagram {
  return {
    ...diagram,
    categories: {
      ...diagram.categories,
      [category]: [...diagram.categories[category], cause],
    },
  };
}

function analyzeDiagram(diagram: IshikawaDiagram): {
  totalCauses: number;
  dominantCategory: IshikawaCategory;
  summary: string;
} {
  const categories: IshikawaCategory[] = ['People', 'Process', 'Technology', 'Environment'];
  let totalCauses = 0;
  let dominantCategory: IshikawaCategory = 'People';
  let maxCount = 0;

  for (const cat of categories) {
    const count = diagram.categories[cat].length;
    totalCauses += count;
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = cat;
    }
  }

  return {
    totalCauses,
    dominantCategory,
    summary: `Problem '${diagram.problem}' has ${totalCauses} causes. Dominant category: ${dominantCategory}`,
  };
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
  return {
    id,
    description,
    owner,
    priority,
    dueDate,
    status: 'open',
    specific: false,
    measurable: false,
    achievable: false,
    relevant: false,
    timeBound: false,
  };
}

function validateSMART(item: ActionItem): {
  valid: boolean;
  missing: string[];
} {
  const fields: Array<{ key: keyof ActionItem; name: string }> = [
    { key: 'specific', name: 'specific' },
    { key: 'measurable', name: 'measurable' },
    { key: 'achievable', name: 'achievable' },
    { key: 'relevant', name: 'relevant' },
    { key: 'timeBound', name: 'timeBound' },
  ];

  const missing = fields.filter(f => !item[f.key]).map(f => f.name);
  return {
    valid: missing.length === 0,
    missing,
  };
}

function markSMART(
  item: ActionItem,
  fields: Partial<Pick<ActionItem, 'specific' | 'measurable' | 'achievable' | 'relevant' | 'timeBound'>>
): ActionItem {
  return { ...item, ...fields };
}

// =============================================================================
// Exercice 5 — Générer un postmortem complet
// =============================================================================

function generatePostmortemDocument(postmortem: Postmortem): string {
  const lines: string[] = [];

  lines.push(`# POSTMORTEM: ${postmortem.title}`);
  lines.push(`Date: ${postmortem.date}`);
  lines.push(`Severity: ${postmortem.severity}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(postmortem.summary);
  lines.push('');
  lines.push('## Impact');
  lines.push(postmortem.impact);
  lines.push('');
  lines.push('## Timeline');
  for (const entry of postmortem.timeline) {
    lines.push(`- [${entry.timestamp}] ${entry.description}`);
  }
  lines.push('');
  lines.push('## Root Cause');
  lines.push(postmortem.rootCause);
  lines.push('');
  lines.push('## Action Items');
  for (const item of postmortem.actionItems) {
    lines.push(`- [${item.priority}] ${item.description} (Owner: ${item.owner}, Due: ${item.dueDate}, Status: ${item.status})`);
  }
  lines.push('');
  lines.push('## Lessons Learned');
  for (const lesson of postmortem.lessonsLearned) {
    lines.push(`- ${lesson}`);
  }

  return lines.join('\n');
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

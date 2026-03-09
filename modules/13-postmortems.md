# Postmortems & Culture Blameless

## Objectifs pedagogiques

- Comprendre la structure et l'objectif d'un postmortem
- Maitriser les techniques d'analyse de cause racine (5 Whys, Ishikawa)
- Rediger des action items efficaces (SMART)
- Comprendre et promouvoir la culture blameless
- Mettre en place un processus de revue et de suivi des postmortems
- Savoir rediger un postmortem complet de A a Z

---

## Introduction : apprendre de ses echecs

Un pilote d'avion ne cache jamais un incident en vol. Chaque evenement est analyse, documente et partage avec toute l'industrie aeronautique. Resultat : l'avion est le moyen de transport le plus sur au monde. Les postmortems appliquent cette meme philosophie a l'ingenierie logicielle.

Un postmortem n'est **pas** un rapport disciplinaire. C'est un **outil d'apprentissage** qui permet a toute l'organisation de progresser apres un incident.

---

## Structure d'un postmortem

### Template complet

```typescript
interface Postmortem {
  // Metadonnees
  title: string;
  date: string;
  authors: string[];
  status: 'draft' | 'review' | 'approved' | 'published';
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  incidentId: string;

  // Resume
  summary: string;
  impact: IncidentImpact;

  // Analyse
  timeline: TimelineEntry[];
  rootCause: string;
  contributingFactors: string[];
  triggeringEvent: string;

  // Actions
  actionItems: ActionItem[];
  lessonsLearned: LessonLearned[];

  // Detection
  detectionMethod: string;
  detectionTimeMinutes: number;
  couldWeHaveDetectedFaster: string;
}

interface IncidentImpact {
  duration: string;
  usersAffected: number | string;
  revenueImpact: string;
  sloImpact: string;
  dataLoss: boolean;
  affectedServices: string[];
}

interface TimelineEntry {
  timestamp: string;
  event: string;
  actor?: string;
}

interface ActionItem {
  id: string;
  description: string;
  type: 'prevention' | 'detection' | 'mitigation' | 'process';
  priority: 'P0' | 'P1' | 'P2';
  owner: string;
  dueDate: string;
  status: 'open' | 'in-progress' | 'done';
  trackingLink: string;
}

interface LessonLearned {
  category: 'what-went-well' | 'what-went-wrong' | 'where-we-got-lucky';
  description: string;
}
```

### Les sections essentielles

| Section | Objectif | Audience |
|---------|----------|----------|
| **Summary** | Comprendre l'incident en 30 secondes | Tout le monde |
| **Impact** | Quantifier les degats | Management, produit |
| **Timeline** | Reconstruire les faits minute par minute | Equipe technique |
| **Root Cause** | Identifier la cause profonde | Equipe technique |
| **Action Items** | Prevenir la recidive | Equipe responsable |
| **Lessons Learned** | Partager les apprentissages | Toute l'organisation |

---

## Analyse de cause racine

### Technique des 5 Whys (5 Pourquoi)

La methode des **5 Whys** consiste a poser la question "pourquoi ?" de maniere iterative jusqu'a atteindre la cause racine, generalement en 5 iterations.

```typescript
interface FiveWhysAnalysis {
  incident: string;
  whys: Array<{
    question: string;
    answer: string;
  }>;
  rootCause: string;
}

const example5Whys: FiveWhysAnalysis = {
  incident: 'L\'API a retourne des erreurs 500 pendant 45 minutes',
  whys: [
    {
      question: 'Pourquoi l\'API a retourne des 500 ?',
      answer: 'Le service de paiement ne repondait pas.',
    },
    {
      question: 'Pourquoi le service de paiement ne repondait pas ?',
      answer: 'Le pool de connexions a la base de donnees etait sature.',
    },
    {
      question: 'Pourquoi le pool de connexions etait sature ?',
      answer: 'Une requete SQL non optimisee bloquait les connexions pendant 30s chacune.',
    },
    {
      question: 'Pourquoi cette requete non optimisee existait-elle en production ?',
      answer: 'Le code review n\'a pas detecte l\'absence d\'index sur la nouvelle table.',
    },
    {
      question: 'Pourquoi le code review n\'a pas detecte ce probleme ?',
      answer: 'Il n\'y a pas de check automatise des performances SQL dans la CI.',
    },
  ],
  rootCause:
    'Absence de validation automatisee des performances SQL dans le pipeline CI/CD, ' +
    'permettant a des requetes non optimisees d\'atteindre la production.',
};
```

::: warning Piege des 5 Whys
Ne vous arretez pas trop tot (a la cause technique immediate) ni trop tard (a "l'humain a fait une erreur"). La cause racine doit pointer vers un **processus ou systeme ameliorable**, jamais vers une personne.
:::

### Diagramme d'Ishikawa (Fishbone)

Le diagramme d'Ishikawa organise les causes potentielles en categories :

```typescript
interface IshikawaDiagram {
  incident: string;
  categories: Record<string, string[]>;
}

const ishikawa: IshikawaDiagram = {
  incident: 'Indisponibilite API pendant 45 minutes',
  categories: {
    'Code / Application': [
      'Requete SQL sans index',
      'Pas de timeout sur les connexions DB',
      'Pas de circuit breaker vers le service paiement',
    ],
    'Infrastructure': [
      'Pool de connexions trop petit pour le trafic',
      'Pas d\'auto-scaling configure',
      'Base de donnees sous-dimensionnee',
    ],
    'Processus': [
      'Pas de check SQL dans la CI',
      'Code review sans criteres de performance',
      'Pas de load test avant le deploiement',
    ],
    'Monitoring': [
      'Pas d\'alerte sur la saturation du pool de connexions',
      'Dashboard de latence SQL inexistant',
      'Alerte sur les 500 trop lente (seuil trop haut)',
    ],
    'Humain': [
      'Developpeur peu familier avec l\'optimisation SQL',
      'Reviewer surcharge (10 PRs a relire)',
      'Documentation sur les bonnes pratiques SQL absente',
    ],
    'Environnement': [
      'Pic de trafic non anticipe (campagne marketing)',
      'Donnees de test non representatives du volume reel',
    ],
  },
};

// Affichage du diagramme
function printIshikawa(diagram: IshikawaDiagram): void {
  console.log(`\nDiagramme d'Ishikawa : ${diagram.incident}\n`);
  console.log('='.repeat(60));

  for (const [category, causes] of Object.entries(diagram.categories)) {
    console.log(`\n[${category}]`);
    for (const cause of causes) {
      console.log(`  |-- ${cause}`);
    }
  }
}
```

Le diagramme Ishikawa est particulierement utile pour les incidents complexes ou la cause racine n'est pas evidente. Il permet d'explorer systematiquement toutes les dimensions du probleme.

---

## Rediger des action items efficaces

### Le framework SMART

Chaque action item doit etre **SMART** :
- **S**pecifique : exactement ce qui doit etre fait
- **M**esurable : comment savoir si c'est fait
- **A**ssignable : un proprietaire nomme
- **R**ealiste : faisable dans le temps imparti
- **T**emporel : une date d'echeance

### Exemples : mauvais vs bon

```typescript
interface ActionItemComparison {
  bad: string;
  good: ActionItem;
  whyBetter: string;
}

const comparisons: ActionItemComparison[] = [
  {
    bad: 'Ameliorer le monitoring',
    good: {
      id: 'AI-001',
      description:
        'Ajouter une alerte Prometheus sur pool_connections_active / pool_connections_max > 80% ' +
        'avec un seuil de 5 minutes',
      type: 'detection',
      priority: 'P0',
      owner: 'Alice',
      dueDate: '2025-04-01',
      status: 'open',
      trackingLink: 'https://jira.internal/INFRA-1234',
    },
    whyBetter: 'Specifique (quelle metrique, quel seuil), assigne (Alice), date (1er avril)',
  },
  {
    bad: 'Faire du load testing',
    good: {
      id: 'AI-002',
      description:
        'Integrer un test de charge k6 dans le pipeline CI qui simule 500 req/s ' +
        'pendant 5 min et echoue si p99 > 500ms sur l\'endpoint /api/payments',
      type: 'prevention',
      priority: 'P1',
      owner: 'Bob',
      dueDate: '2025-04-15',
      status: 'open',
      trackingLink: 'https://jira.internal/INFRA-1235',
    },
    whyBetter: 'Specifique (quel outil, quel scenario, quel critere de succes)',
  },
  {
    bad: 'Former les devs sur le SQL',
    good: {
      id: 'AI-003',
      description:
        'Creer un document de bonnes pratiques SQL (index, EXPLAIN, limites) ' +
        'et organiser un workshop de 2h pour les 3 equipes backend',
      type: 'process',
      priority: 'P2',
      owner: 'Charlie',
      dueDate: '2025-05-01',
      status: 'open',
      trackingLink: 'https://jira.internal/TEAM-567',
    },
    whyBetter: 'Action concrete (document + workshop), perimetre defini (3 equipes)',
  },
];
```

### Categories d'action items

```typescript
type ActionCategory = 'prevention' | 'detection' | 'mitigation' | 'process';

const categoryDescriptions: Record<ActionCategory, string> = {
  prevention: 'Empecher que le probleme ne se reproduise (fix code, tests, validation CI)',
  detection: 'Detecter plus vite si le probleme revient (alertes, monitoring, healthchecks)',
  mitigation: 'Reduire l\'impact si le probleme revient (circuit breaker, fallback, rollback auto)',
  process: 'Ameliorer les processus humains (documentation, formation, checklists)',
};
```

---

## Culture Blameless

### Qu'est-ce que la culture blameless ?

La culture blameless repose sur un principe fondamental : **les erreurs humaines sont un symptome de problemes systemiques, pas une cause racine**.

```typescript
interface BlamelessPrinciple {
  principle: string;
  description: string;
  example: {
    blameful: string;
    blameless: string;
  };
}

const principles: BlamelessPrinciple[] = [
  {
    principle: 'Personne ne se leve le matin pour casser la prod',
    description:
      'Les gens font des erreurs parce que les systemes le permettent, ' +
      'pas parce qu\'ils sont incompetents.',
    example: {
      blameful: 'Jean a oublie de verifier les index SQL avant de deployer.',
      blameless:
        'Notre pipeline CI ne detecte pas les requetes SQL sans index, ' +
        'ce qui a permis a un code non optimise d\'atteindre la production.',
    },
  },
  {
    principle: 'La transparence est plus precieuse que la punition',
    description:
      'Si les gens ont peur d\'etre punis, ils cacheront les erreurs. ' +
      'Les erreurs cachees sont bien plus dangereuses.',
    example: {
      blameful: 'Qui a approuve ce code review ? Montrez-moi le responsable.',
      blameless:
        'Notre processus de code review n\'incluait pas de criteres de performance. ' +
        'Comment pouvons-nous l\'ameliorer ?',
    },
  },
  {
    principle: 'Comprendre avant de corriger',
    description:
      'L\'objectif n\'est pas de trouver un coupable mais de comprendre ' +
      'pourquoi le systeme a permis l\'erreur.',
    example: {
      blameful: 'Le dev aurait du savoir que cette requete serait lente.',
      blameless:
        'Quelles informations manquaient au developpeur ? Comment rendre ' +
        'les bonnes pratiques plus accessibles ?',
    },
  },
];
```

### Comment favoriser la culture blameless

```typescript
interface BlamelessPractice {
  practice: string;
  howTo: string[];
}

const practices: BlamelessPractice[] = [
  {
    practice: 'Utiliser "nous" au lieu de "il/elle"',
    howTo: [
      'Remplacer "X a fait une erreur" par "notre systeme a permis que..."',
      'Le postmortem est un document d\'equipe, pas un rapport individuel',
    ],
  },
  {
    practice: 'Leadership par l\'exemple',
    howTo: [
      'Les managers partagent leurs propres erreurs ouvertement',
      'Celebrer les postmortems de qualite, pas les "zero incidents"',
      'Remercier les personnes qui signalent des problemes',
    ],
  },
  {
    practice: 'Separer le postmortem de l\'evaluation de performance',
    howTo: [
      'Les postmortems ne sont JAMAIS utilises dans les entretiens annuels',
      'Les action items sont assignes par competence, pas par responsabilite',
    ],
  },
  {
    practice: 'Revue collective',
    howTo: [
      'Le postmortem est redige collaborativement',
      'Toute l\'equipe participe a la revue',
      'Les corrections sont les bienvenues avant publication',
    ],
  },
];
```

::: warning Ce que blameless ne signifie PAS
Blameless ne veut pas dire "sans responsabilite". Les gens sont toujours responsables de leurs actions. Mais la reponse n'est pas la punition — c'est l'amelioration du systeme pour que l'erreur soit plus difficile a commettre ou moins impactante.
:::

---

## Processus de revue et de suivi

### Workflow du postmortem

```typescript
type PostmortemState =
  | 'draft'
  | 'internal_review'
  | 'stakeholder_review'
  | 'approved'
  | 'published'
  | 'action_items_tracked';

interface PostmortemWorkflow {
  steps: Array<{
    state: PostmortemState;
    description: string;
    deadline: string;
    responsible: string;
  }>;
}

const workflow: PostmortemWorkflow = {
  steps: [
    {
      state: 'draft',
      description: 'Redaction initiale par l\'IC et les participants',
      deadline: '48h apres resolution',
      responsible: 'Incident Commander',
    },
    {
      state: 'internal_review',
      description: 'Revue par l\'equipe technique impliquee',
      deadline: '72h apres resolution',
      responsible: 'Tech Lead',
    },
    {
      state: 'stakeholder_review',
      description: 'Revue par le management et les equipes impactees',
      deadline: '5 jours ouvrables',
      responsible: 'Engineering Manager',
    },
    {
      state: 'approved',
      description: 'Approbation finale et publication interne',
      deadline: '7 jours ouvrables',
      responsible: 'Engineering Manager',
    },
    {
      state: 'published',
      description: 'Partage a toute l\'organisation (Confluence, wiki, etc.)',
      deadline: '7 jours ouvrables',
      responsible: 'Communication Lead',
    },
    {
      state: 'action_items_tracked',
      description: 'Tous les action items ont un ticket Jira et un proprietaire',
      deadline: '10 jours ouvrables',
      responsible: 'Incident Commander',
    },
  ],
};
```

### Suivi des action items

```typescript
interface ActionItemTracker {
  postmortemId: string;
  items: ActionItem[];

  completionRate(): number;
  overdueItems(): ActionItem[];
  report(): string;
}

function createTracker(postmortemId: string, items: ActionItem[]): ActionItemTracker {
  return {
    postmortemId,
    items,

    completionRate() {
      const done = this.items.filter((i) => i.status === 'done').length;
      return done / this.items.length;
    },

    overdueItems() {
      const today = new Date().toISOString().split('T')[0];
      return this.items.filter(
        (i) => i.status !== 'done' && i.dueDate < today,
      );
    },

    report() {
      const total = this.items.length;
      const done = this.items.filter((i) => i.status === 'done').length;
      const inProgress = this.items.filter((i) => i.status === 'in-progress').length;
      const open = this.items.filter((i) => i.status === 'open').length;
      const overdue = this.overdueItems().length;

      return [
        `=== Postmortem ${this.postmortemId} — Action Items ===`,
        `Total: ${total} | Done: ${done} | In Progress: ${inProgress} | Open: ${open}`,
        `Completion: ${(this.completionRate() * 100).toFixed(0)}%`,
        `Overdue: ${overdue}`,
        overdue > 0
          ? `\nATTENTION: ${overdue} action(s) en retard !\n${this.overdueItems().map((i) => `  - [${i.id}] ${i.description} (due: ${i.dueDate})`).join('\n')}`
          : '',
      ].join('\n');
    },
  };
}
```

---

## Exemple complet de postmortem

```typescript
const completePostmortem: Postmortem = {
  title: 'Indisponibilite de l\'API de paiement — 15 mars 2025',
  date: '2025-03-15',
  authors: ['Alice Dupont (IC)', 'Bob Martin (Ops Lead)'],
  status: 'published',
  severity: 'SEV1',
  incidentId: 'INC-2025-0315-001',

  summary:
    'Le 15 mars 2025, l\'API de paiement a ete indisponible pendant 45 minutes ' +
    '(14h05 a 14h50 UTC) suite a la saturation du pool de connexions a la base ' +
    'de donnees, causee par une requete SQL non optimisee deployee le matin meme.',

  impact: {
    duration: '45 minutes',
    usersAffected: '~12 000 utilisateurs',
    revenueImpact: '~15 000 EUR de transactions echouees',
    sloImpact: 'Consommation de 35% de l\'error budget mensuel en 45 minutes',
    dataLoss: false,
    affectedServices: ['payment-service', 'checkout-web', 'mobile-app'],
  },

  timeline: [
    { timestamp: '09:30', event: 'Deploy v2.4.1 du payment-service (contient la requete problematique)' },
    { timestamp: '14:00', event: 'Pic de trafic debut d\'apres-midi' },
    { timestamp: '14:02', event: 'Pool de connexions DB atteint 90%' },
    { timestamp: '14:05', event: 'Alerte "HighErrorRate" declenchee (burn rate 36x)', actor: 'Prometheus' },
    { timestamp: '14:07', event: 'Alice (IC) acknowledge l\'alerte et ouvre #inc-20250315', actor: 'Alice' },
    { timestamp: '14:10', event: 'Severite declaree SEV1 — 80% des requetes paiement en 500' },
    { timestamp: '14:12', event: 'Status page mise a jour : "Investigating"', actor: 'Charlie (Comm)' },
    { timestamp: '14:15', event: 'Bob identifie la saturation du pool via Grafana', actor: 'Bob' },
    { timestamp: '14:20', event: 'Correlation avec le deploy v2.4.1 du matin', actor: 'Bob' },
    { timestamp: '14:22', event: 'Decision IC : rollback vers v2.4.0', actor: 'Alice' },
    { timestamp: '14:25', event: 'Rollback initie', actor: 'Bob' },
    { timestamp: '14:35', event: 'Rollback termine — pool de connexions revient a 40%' },
    { timestamp: '14:40', event: 'Taux d\'erreur normalise a 0.05%' },
    { timestamp: '14:45', event: 'Status page : "Monitoring"', actor: 'Charlie' },
    { timestamp: '14:50', event: 'IC declare l\'incident resolu', actor: 'Alice' },
    { timestamp: '15:00', event: 'Status page : "Resolved"', actor: 'Charlie' },
  ],

  rootCause:
    'La requete SQL ajoutee dans la v2.4.1 ne comportait pas d\'index sur la colonne ' +
    '"order_date" de la table "orders" (2.3M de lignes). Chaque requete prenait ~25s ' +
    'au lieu de <50ms, saturant les 20 connexions du pool en quelques minutes ' +
    'sous charge normale.',

  triggeringEvent: 'Pic de trafic a 14h00 combiné au deployment de la requete non optimisee le matin',

  contributingFactors: [
    'Pool de connexions dimensionne pour des requetes rapides (20 max)',
    'Pas de timeout sur les requetes SQL (connexions bloquees indefiniment)',
    'Pas de check de performance SQL dans le pipeline CI',
    'Donnees de staging non representatives (1000 lignes vs 2.3M en prod)',
    'Code review n\'a pas identifie l\'absence d\'index',
  ],

  actionItems: [
    {
      id: 'AI-001',
      description: 'Ajouter l\'index manquant sur orders.order_date et redeployer v2.4.1',
      type: 'prevention',
      priority: 'P0',
      owner: 'Bob',
      dueDate: '2025-03-17',
      status: 'done',
      trackingLink: 'JIRA-1001',
    },
    {
      id: 'AI-002',
      description: 'Configurer un timeout de 5s sur toutes les requetes SQL du payment-service',
      type: 'mitigation',
      priority: 'P0',
      owner: 'Bob',
      dueDate: '2025-03-20',
      status: 'in-progress',
      trackingLink: 'JIRA-1002',
    },
    {
      id: 'AI-003',
      description: 'Ajouter une alerte sur pool_active_connections/pool_max > 80%',
      type: 'detection',
      priority: 'P1',
      owner: 'Alice',
      dueDate: '2025-03-25',
      status: 'open',
      trackingLink: 'JIRA-1003',
    },
    {
      id: 'AI-004',
      description: 'Integrer pg_stat_statements analysis dans le pipeline CI',
      type: 'prevention',
      priority: 'P1',
      owner: 'DevOps team',
      dueDate: '2025-04-15',
      status: 'open',
      trackingLink: 'JIRA-1004',
    },
    {
      id: 'AI-005',
      description: 'Augmenter les donnees de staging a un volume representatif (>1M lignes)',
      type: 'prevention',
      priority: 'P2',
      owner: 'Platform team',
      dueDate: '2025-05-01',
      status: 'open',
      trackingLink: 'JIRA-1005',
    },
  ],

  lessonsLearned: [
    {
      category: 'what-went-well',
      description: 'Detection rapide grace aux alertes SLO-based (5 minutes)',
    },
    {
      category: 'what-went-well',
      description: 'Rollback execute en 10 minutes grace au pipeline de CD',
    },
    {
      category: 'what-went-well',
      description: 'Communication status page en < 10 minutes',
    },
    {
      category: 'what-went-wrong',
      description: 'Pas de detection des requetes SQL lentes dans la CI',
    },
    {
      category: 'what-went-wrong',
      description: 'Donnees de staging non representatives du volume reel',
    },
    {
      category: 'where-we-got-lucky',
      description: 'L\'incident s\'est produit a 14h et non a 3h du matin',
    },
    {
      category: 'where-we-got-lucky',
      description: 'Pas de perte de donnees malgre les erreurs (transactions atomiques)',
    },
  ],

  detectionMethod: 'Alerte automatique Prometheus sur burn rate',
  detectionTimeMinutes: 5,
  couldWeHaveDetectedFaster:
    'Oui — une alerte sur la saturation du pool de connexions aurait declenche ' +
    '2-3 minutes plus tot, avant meme les erreurs utilisateur.',
};
```

---

## Partage et apprentissage organisationnel

### Revue de postmortem en equipe

La revue de postmortem est une **reunion d'apprentissage**, pas un tribunal :

```typescript
interface PostmortemReviewMeeting {
  duration: string;
  participants: string[];
  agenda: Array<{
    topic: string;
    durationMinutes: number;
    facilitator: string;
  }>;
  groundRules: string[];
}

const reviewMeeting: PostmortemReviewMeeting = {
  duration: '60 minutes',
  participants: [
    'Equipe impliquee dans l\'incident',
    'Autres equipes interessees',
    'Management (en observateur)',
  ],
  agenda: [
    { topic: 'Rappel des regles blameless', durationMinutes: 5, facilitator: 'IC' },
    { topic: 'Presentation de la timeline', durationMinutes: 15, facilitator: 'IC' },
    { topic: 'Discussion sur la cause racine', durationMinutes: 15, facilitator: 'IC' },
    { topic: 'Revue des action items', durationMinutes: 15, facilitator: 'IC' },
    { topic: 'Lessons learned et Q&A', durationMinutes: 10, facilitator: 'IC' },
  ],
  groundRules: [
    'Pas de blame : on analyse le systeme, pas les individus',
    'Tout le monde peut poser des questions',
    'Les desaccords sont normaux et productifs',
    'On cherche des ameliorations, pas des coupables',
    'Les managers ecoutent plus qu\'ils ne parlent',
  ],
};
```

---

## Bonnes pratiques

1. **Redigez dans les 48h** : la memoire s'estompe vite, les details comptent
2. **Timeline factuelle** : pas d'interpretation, uniquement les faits avec timestamps
3. **Action items SMART** : chaque action doit etre specifique, mesurable, et assignee
4. **Blameless toujours** : le jour ou quelqu'un est blâme dans un postmortem, plus personne ne partagera
5. **Publiez largement** : les postmortems sont plus utiles quand toute l'organisation peut apprendre
6. **Suivez les action items** : un postmortem sans suivi est un exercice futile
7. **Revue trimestrielle** : analysez les tendances — les memes causes reviennent-elles ?
8. **Celebrez les bons postmortems** : recompensez la transparence et la qualite de l'analyse

---

::: tip A retenir
- Un postmortem est un **outil d'apprentissage**, pas un rapport disciplinaire
- Structure cle : **summary, impact, timeline, root cause, action items, lessons learned**
- Les **5 Whys** et **Ishikawa** sont les techniques d'analyse de cause racine les plus utilisees
- Les action items doivent etre **SMART** : Specifique, Mesurable, Assignable, Realiste, Temporel
- La culture **blameless** est non-negociable : on blame le systeme, jamais les individus
- Un postmortem non suivi (action items non completees) est pire qu'un postmortem non ecrit
- Partagez largement : les incidents d'une equipe sont les lecons de toute l'organisation
:::

---

## Pour aller plus loin

- [Lab 13 — Rediger un postmortem](/labs/lab-13-postmortem/README)
- [Quiz 13 — Postmortems & Culture Blameless](/quizzes/quiz-13-postmortems)
- Google SRE Book, Chapitre 15 : "Postmortem Culture: Learning from Failure"
- Etsy, "Debriefing Facilitation Guide"

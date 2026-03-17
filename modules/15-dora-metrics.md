# DORA Metrics & Toil Reduction

## Objectifs pedagogiques

- Comprendre les 4 metriques DORA et leur importance
- Savoir mesurer chaque metrique dans un pipeline CI/CD
- Identifier les bandes de performance (elite, high, medium, low)
- Définir le toil et savoir l'identifier dans le travail quotidien
- Appliquer la regle des 50% du SRE Book
- Implementer un DORA tracker en TypeScript
- Mettre en place des stratégies concretes d'elimination du toil

---

## Introduction : mesurer la performance d'une équipe

Comment savoir si votre équipe d'ingenierie est performante ? Le nombre de lignes de code ? Le nombre de features livrees ? Ces metriques sont trompeuses. L'équipe **DORA** (DevOps Research and Assessment), fondee par Dr. Nicole Forsgren, Gene Kim et Jez Humble, a identifie **4 metriques** qui predisent la performance organisationnelle. Ces metriques sont issues de 7 ans de recherche sur des milliers d'équipes.

L'analogie : mesurer une équipe de développement sans les metriques DORA, c'est comme gérer une usine sans mesurer le temps de production, le taux de defauts ou les delais de livraison.

---

## Les 4 metriques DORA

### Vue d'ensemble

```typescript
interface DORAMetric {
  name: string;
  shortName: string;
  question: string;
  description: string;
  unit: string;
  direction: 'lower-is-better' | 'higher-is-better';
}

const doraMetrics: DORAMetric[] = [
  {
    name: 'Deployment Frequency',
    shortName: 'DF',
    question: 'A quelle frequence deployez-vous en production ?',
    description:
      'Mesure la cadence a laquelle du nouveau code atteint la production. ' +
      'Un proxy pour la taille des batches et la vitesse de livraison.',
    unit: 'deployments / periode',
    direction: 'higher-is-better',
  },
  {
    name: 'Lead Time for Changes',
    shortName: 'LT',
    question: 'Combien de temps entre un commit et son deployment en production ?',
    description:
      'Mesure l\'efficacite du pipeline de livraison. ' +
      'Inclut le code review, la CI, les tests, le deployment.',
    unit: 'heures / jours',
    direction: 'lower-is-better',
  },
  {
    name: 'Change Failure Rate',
    shortName: 'CFR',
    question: 'Quel pourcentage de deployments cause un incident ?',
    description:
      'Mesure la qualite des changements livres. ' +
      'Inclut les rollbacks, les hotfixes, et les incidents post-deployment.',
    unit: '%',
    direction: 'lower-is-better',
  },
  {
    name: 'Mean Time to Restore (MTTR)',
    shortName: 'MTTR',
    question: 'Combien de temps pour restaurer le service apres un incident ?',
    description:
      'Mesure la capacite de recuperation de l\'equipe. ' +
      'Du debut de l\'incident a la restauration du service.',
    unit: 'heures',
    direction: 'lower-is-better',
  },
];
```

### Bandes de performance

```typescript
type PerformanceLevel = 'elite' | 'high' | 'medium' | 'low';

interface PerformanceBand {
  level: PerformanceLevel;
  deploymentFrequency: string;
  leadTime: string;
  changeFailureRate: string;
  mttr: string;
}

const performanceBands: PerformanceBand[] = [
  {
    level: 'elite',
    deploymentFrequency: 'Plusieurs fois par jour',
    leadTime: '< 1 heure',
    changeFailureRate: '< 5%',
    mttr: '< 1 heure',
  },
  {
    level: 'high',
    deploymentFrequency: '1 fois par jour a 1 fois par semaine',
    leadTime: '1 jour a 1 semaine',
    changeFailureRate: '5% - 10%',
    mttr: '< 1 jour',
  },
  {
    level: 'medium',
    deploymentFrequency: '1 fois par semaine a 1 fois par mois',
    leadTime: '1 semaine a 1 mois',
    changeFailureRate: '10% - 15%',
    mttr: '1 jour a 1 semaine',
  },
  {
    level: 'low',
    deploymentFrequency: '< 1 fois par mois',
    leadTime: '> 1 mois',
    changeFailureRate: '> 15%',
    mttr: '> 1 semaine',
  },
];

function classifyPerformance(
  deploysPerWeek: number,
  leadTimeHours: number,
  changeFailurePercent: number,
  mttrHours: number,
): Record<string, PerformanceLevel> {
  function classifyDF(deploysPerWeek: number): PerformanceLevel {
    if (deploysPerWeek >= 7) return 'elite';       // Plusieurs par jour
    if (deploysPerWeek >= 1) return 'high';         // Au moins 1 par semaine
    if (deploysPerWeek >= 0.25) return 'medium';    // Au moins 1 par mois
    return 'low';
  }

  function classifyLT(hours: number): PerformanceLevel {
    if (hours < 1) return 'elite';
    if (hours < 168) return 'high';    // < 1 semaine
    if (hours < 720) return 'medium';  // < 1 mois
    return 'low';
  }

  function classifyCFR(percent: number): PerformanceLevel {
    if (percent < 5) return 'elite';
    if (percent < 10) return 'high';
    if (percent < 15) return 'medium';
    return 'low';
  }

  function classifyMTTR(hours: number): PerformanceLevel {
    if (hours < 1) return 'elite';
    if (hours < 24) return 'high';
    if (hours < 168) return 'medium';
    return 'low';
  }

  return {
    deploymentFrequency: classifyDF(deploysPerWeek),
    leadTime: classifyLT(leadTimeHours),
    changeFailureRate: classifyCFR(changeFailurePercent),
    mttr: classifyMTTR(mttrHours),
  };
}

// Exemple : evaluer une equipe
const evaluation = classifyPerformance(
  3,      // 3 deploys par semaine
  48,     // 2 jours de lead time
  8,      // 8% de change failure rate
  4,      // 4 heures de MTTR
);

console.log('Evaluation DORA:', evaluation);
// {
//   deploymentFrequency: 'high',
//   leadTime: 'high',
//   changeFailureRate: 'high',
//   mttr: 'high'
// }
```

### Le paradoxe vitesse vs stabilite

::: tip Decouverte clé de DORA
Contrairement a l'intuition, les équipes **elite** sont à la fois les plus rapides ET les plus stables. Déployer souvent en petits batches reduit le risque par changement. Vitesse et stabilite ne sont pas en opposition — elles se renforcent mutuellement.
:::

---

## Mesurer les metriques DORA

### Deployment Frequency

```typescript
interface Deployment {
  id: string;
  service: string;
  timestamp: Date;
  commitSha: string;
  triggeredBy: string;
  status: 'success' | 'failed' | 'rolled-back';
}

function calculateDeploymentFrequency(
  deployments: Deployment[],
  periodDays: number,
): { deploymentsPerDay: number; deploymentsPerWeek: number } {
  const successfulDeploys = deployments.filter((d) => d.status === 'success');

  return {
    deploymentsPerDay: successfulDeploys.length / periodDays,
    deploymentsPerWeek: (successfulDeploys.length / periodDays) * 7,
  };
}
```

### Lead Time for Changes

```typescript
interface ChangeLeadTime {
  commitSha: string;
  commitTimestamp: Date;
  deployTimestamp: Date;
  leadTimeHours: number;
}

function calculateLeadTime(
  changes: ChangeLeadTime[],
): { mean: number; median: number; p90: number } {
  const leadTimes = changes
    .map((c) => c.leadTimeHours)
    .sort((a, b) => a - b);

  const mean = leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length;
  const median = leadTimes[Math.floor(leadTimes.length / 2)];
  const p90 = leadTimes[Math.floor(leadTimes.length * 0.9)];

  return { mean, median, p90 };
}
```

### Change Failure Rate

```typescript
function calculateChangeFailureRate(deployments: Deployment[]): number {
  const total = deployments.length;
  const failures = deployments.filter(
    (d) => d.status === 'failed' || d.status === 'rolled-back',
  ).length;

  return total > 0 ? (failures / total) * 100 : 0;
}
```

### Mean Time to Restore (MTTR)

```typescript
interface Incident {
  id: string;
  detectedAt: Date;
  resolvedAt: Date;
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  causedByDeployment?: string;
}

function calculateMTTR(incidents: Incident[]): {
  meanHours: number;
  medianHours: number;
} {
  const restoreTimes = incidents.map(
    (inc) =>
      (inc.resolvedAt.getTime() - inc.detectedAt.getTime()) / (1000 * 60 * 60),
  );

  restoreTimes.sort((a, b) => a - b);

  const mean = restoreTimes.reduce((sum, t) => sum + t, 0) / restoreTimes.length;
  const median = restoreTimes[Math.floor(restoreTimes.length / 2)];

  return { meanHours: mean, medianHours: median };
}
```

---

## Implementer un DORA Tracker complet

```typescript
interface DORATracker {
  deployments: Deployment[];
  incidents: Incident[];
  changes: ChangeLeadTime[];

  recordDeployment(deployment: Deployment): void;
  recordIncident(incident: Incident): void;
  recordChange(change: ChangeLeadTime): void;

  computeMetrics(periodDays: number): DORAReport;
}

interface DORAReport {
  period: string;
  deploymentFrequency: {
    value: number;
    unit: string;
    level: PerformanceLevel;
  };
  leadTime: {
    meanHours: number;
    medianHours: number;
    level: PerformanceLevel;
  };
  changeFailureRate: {
    percent: number;
    level: PerformanceLevel;
  };
  mttr: {
    meanHours: number;
    medianHours: number;
    level: PerformanceLevel;
  };
  overallLevel: PerformanceLevel;
}

function createDORATracker(): DORATracker {
  return {
    deployments: [],
    incidents: [],
    changes: [],

    recordDeployment(deployment) {
      this.deployments.push(deployment);
    },

    recordIncident(incident) {
      this.incidents.push(incident);
    },

    recordChange(change) {
      this.changes.push(change);
    },

    computeMetrics(periodDays: number): DORAReport {
      const now = new Date();
      const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

      // Filtrer par periode
      const recentDeploys = this.deployments.filter(
        (d) => d.timestamp >= periodStart,
      );
      const recentIncidents = this.incidents.filter(
        (i) => i.detectedAt >= periodStart,
      );
      const recentChanges = this.changes.filter(
        (c) => c.deployTimestamp >= periodStart,
      );

      // Calculs
      const df = calculateDeploymentFrequency(recentDeploys, periodDays);
      const lt = recentChanges.length > 0
        ? calculateLeadTime(recentChanges)
        : { mean: 0, median: 0, p90: 0 };
      const cfr = calculateChangeFailureRate(recentDeploys);
      const mttr = recentIncidents.length > 0
        ? calculateMTTR(recentIncidents)
        : { meanHours: 0, medianHours: 0 };

      // Classification
      const levels = classifyPerformance(
        df.deploymentsPerWeek,
        lt.median,
        cfr,
        mttr.medianHours,
      );

      // Niveau global = le plus bas des 4
      const levelOrder: PerformanceLevel[] = ['elite', 'high', 'medium', 'low'];
      const worstLevel = Object.values(levels).reduce((worst, current) => {
        return levelOrder.indexOf(current) > levelOrder.indexOf(worst)
          ? current
          : worst;
      }, 'elite' as PerformanceLevel);

      return {
        period: `${periodDays} derniers jours`,
        deploymentFrequency: {
          value: df.deploymentsPerWeek,
          unit: 'deploys/semaine',
          level: levels.deploymentFrequency,
        },
        leadTime: {
          meanHours: lt.mean,
          medianHours: lt.median,
          level: levels.leadTime,
        },
        changeFailureRate: {
          percent: cfr,
          level: levels.changeFailureRate,
        },
        mttr: {
          meanHours: mttr.meanHours,
          medianHours: mttr.medianHours,
          level: levels.mttr,
        },
        overallLevel: worstLevel,
      };
    },
  };
}

// Utilisation
const tracker = createDORATracker();

// Enregistrer des donnees simulees
const baseDate = new Date('2025-03-01');
for (let i = 0; i < 20; i++) {
  const deployDate = new Date(baseDate.getTime() + i * 12 * 60 * 60 * 1000);
  tracker.recordDeployment({
    id: `deploy-${i}`,
    service: 'api',
    timestamp: deployDate,
    commitSha: `abc${i}`,
    triggeredBy: 'CI/CD',
    status: Math.random() > 0.08 ? 'success' : 'rolled-back',
  });

  tracker.recordChange({
    commitSha: `abc${i}`,
    commitTimestamp: new Date(deployDate.getTime() - (2 + Math.random() * 46) * 60 * 60 * 1000),
    deployTimestamp: deployDate,
    leadTimeHours: 2 + Math.random() * 46,
  });
}

const report = tracker.computeMetrics(30);
console.log(JSON.stringify(report, null, 2));
```

### Exposer les metriques DORA en Prometheus

```typescript
import { Registry, Gauge, Counter, Histogram } from 'prom-client';

const registry = new Registry();

// Metriques DORA pour Prometheus
const deploymentCounter = new Counter({
  name: 'dora_deployments_total',
  help: 'Total number of deployments',
  labelNames: ['service', 'status'],
  registers: [registry],
});

const leadTimeHistogram = new Histogram({
  name: 'dora_lead_time_hours',
  help: 'Lead time from commit to production in hours',
  labelNames: ['service'],
  buckets: [0.5, 1, 2, 4, 8, 24, 48, 168, 720],
  registers: [registry],
});

const changeFailureGauge = new Gauge({
  name: 'dora_change_failure_rate',
  help: 'Percentage of deployments causing incidents (rolling 30 days)',
  labelNames: ['service'],
  registers: [registry],
});

const mttrHistogram = new Histogram({
  name: 'dora_mttr_hours',
  help: 'Mean time to restore service in hours',
  labelNames: ['service', 'severity'],
  buckets: [0.25, 0.5, 1, 2, 4, 8, 24, 48, 168],
  registers: [registry],
});

// Fonction pour enregistrer un deployment
function recordDeploymentMetric(
  service: string,
  status: 'success' | 'failed' | 'rolled-back',
  leadTimeHours: number,
): void {
  deploymentCounter.inc({ service, status });
  if (status === 'success') {
    leadTimeHistogram.observe({ service }, leadTimeHours);
  }
}

// Fonction pour enregistrer un incident
function recordIncidentMetric(
  service: string,
  severity: string,
  restoreTimeHours: number,
): void {
  mttrHistogram.observe({ service, severity }, restoreTimeHours);
}
```

---

## Toil — Le travail qui ne devrait pas exister

### Definition du toil

Le **toil** est un travail qui possede les caracteristiques suivantes (Google SRE Book, Chapitre 5) :

```typescript
interface ToilCharacteristic {
  name: string;
  description: string;
  example: string;
  counterExample: string;
}

const toilCharacteristics: ToilCharacteristic[] = [
  {
    name: 'Manuel',
    description: 'Necessite une intervention humaine',
    example: 'Redemarrer un service manuellement apres un crash',
    counterExample: 'Un orchestrateur (Kubernetes) qui restart automatiquement',
  },
  {
    name: 'Repetitif',
    description: 'Revient regulierement (pas un one-shot)',
    example: 'Augmenter la taille du disque chaque mois',
    counterExample: 'Configurer l\'auto-scaling du stockage une fois pour toutes',
  },
  {
    name: 'Automatisable',
    description: 'Pourrait etre fait par une machine',
    example: 'Copier des logs vers un bucket S3 chaque jour',
    counterExample: 'Concevoir l\'architecture d\'un nouveau systeme (requiert du jugement)',
  },
  {
    name: 'Tactique',
    description: 'Reactif, pas proactif — repond a un symptome',
    example: 'Augmenter les replicas a cause d\'un pic de trafic',
    counterExample: 'Mettre en place l\'auto-scaling (resolution definitive)',
  },
  {
    name: 'Sans valeur durable',
    description: 'L\'etat du service ne s\'ameliore pas durablement',
    example: 'Renouveler manuellement les certificats SSL',
    counterExample: 'Installer cert-manager pour le renouvellement automatique',
  },
  {
    name: 'Croissance lineaire',
    description: 'Le travail augmente proportionnellement a la charge',
    example: '1 nouveau client = 1 configuration manuelle',
    counterExample: 'Onboarding self-service automatise',
  },
];
```

### Identifier le toil

```typescript
interface ToilItem {
  task: string;
  frequencyPerMonth: number;
  timePerOccurrenceMinutes: number;
  totalHoursPerMonth: number;
  isToil: boolean;
  toilCharacteristics: string[];
  automationEffort: 'low' | 'medium' | 'high';
  automationROIMonths: number; // Mois pour rentabiliser l'automatisation
}

function calculateToilROI(
  monthlyHoursSaved: number,
  automationHours: number,
): number {
  // En combien de mois l'automatisation est-elle rentabilisee ?
  return automationHours / monthlyHoursSaved;
}

const toilInventory: ToilItem[] = [
  {
    task: 'Restart manuel des pods en erreur',
    frequencyPerMonth: 15,
    timePerOccurrenceMinutes: 10,
    totalHoursPerMonth: 2.5,
    isToil: true,
    toilCharacteristics: ['manuel', 'repetitif', 'automatisable', 'tactique'],
    automationEffort: 'low',
    automationROIMonths: calculateToilROI(2.5, 4), // 4h pour automatiser
  },
  {
    task: 'Renouvellement certificats SSL',
    frequencyPerMonth: 2,
    timePerOccurrenceMinutes: 30,
    totalHoursPerMonth: 1,
    isToil: true,
    toilCharacteristics: ['manuel', 'repetitif', 'automatisable'],
    automationEffort: 'medium',
    automationROIMonths: calculateToilROI(1, 8),
  },
  {
    task: 'Provisionning d\'un nouvel environnement de dev',
    frequencyPerMonth: 4,
    timePerOccurrenceMinutes: 120,
    totalHoursPerMonth: 8,
    isToil: true,
    toilCharacteristics: ['manuel', 'repetitif', 'automatisable', 'croissance lineaire'],
    automationEffort: 'high',
    automationROIMonths: calculateToilROI(8, 40),
  },
  {
    task: 'Architecture review d\'un nouveau service',
    frequencyPerMonth: 2,
    timePerOccurrenceMinutes: 180,
    totalHoursPerMonth: 6,
    isToil: false, // Pas du toil — requiert du jugement humain
    toilCharacteristics: [],
    automationEffort: 'high',
    automationROIMonths: Infinity,
  },
];

// Rapport de toil
function generateToilReport(items: ToilItem[]): void {
  const toilItems = items.filter((i) => i.isToil);
  const totalToilHours = toilItems.reduce((sum, i) => sum + i.totalHoursPerMonth, 0);
  const totalWorkHours = 160; // Heures de travail par mois

  console.log('=== RAPPORT DE TOIL ===');
  console.log(`Toil total: ${totalToilHours.toFixed(1)}h/mois`);
  console.log(`Pourcentage: ${((totalToilHours / totalWorkHours) * 100).toFixed(1)}%`);
  console.log(`Seuil SRE (50%): ${totalToilHours > totalWorkHours * 0.5 ? 'DEPASSE' : 'OK'}\n`);

  // Trier par ROI (les plus rentables a automatiser en premier)
  const sorted = [...toilItems].sort(
    (a, b) => a.automationROIMonths - b.automationROIMonths,
  );

  console.log('Priorites d\'automatisation (par ROI):');
  for (const item of sorted) {
    console.log(
      `  ${item.automationROIMonths.toFixed(1)} mois ROI — ${item.task} ` +
      `(${item.totalHoursPerMonth}h/mois, effort: ${item.automationEffort})`,
    );
  }
}
```

---

## La regle des 50%

Le SRE Book de Google etablit une regle claire : **un SRE ne doit pas passer plus de 50% de son temps en toil**. Les 50% restants doivent etre consacres au travail d'ingenierie (automatisation, amelioration des outils, projets).

```typescript
interface ToilBudget {
  teamSize: number;
  totalHoursPerMonth: number;
  maxToilPercent: number;
  currentToilHours: number;

  isWithinBudget(): boolean;
  availableToilHours(): number;
  report(): string;
}

function createToilBudget(teamSize: number, currentToilHours: number): ToilBudget {
  const totalHours = teamSize * 160; // 160h par personne par mois

  return {
    teamSize,
    totalHoursPerMonth: totalHours,
    maxToilPercent: 50,
    currentToilHours,

    isWithinBudget() {
      return this.currentToilHours <= this.totalHoursPerMonth * (this.maxToilPercent / 100);
    },

    availableToilHours() {
      const max = this.totalHoursPerMonth * (this.maxToilPercent / 100);
      return Math.max(0, max - this.currentToilHours);
    },

    report() {
      const maxHours = this.totalHoursPerMonth * (this.maxToilPercent / 100);
      const percent = (this.currentToilHours / this.totalHoursPerMonth) * 100;

      return [
        `Equipe: ${this.teamSize} SREs`,
        `Heures totales/mois: ${this.totalHoursPerMonth}h`,
        `Budget toil (50%): ${maxHours}h`,
        `Toil actuel: ${this.currentToilHours}h (${percent.toFixed(1)}%)`,
        `Marge restante: ${this.availableToilHours()}h`,
        `Status: ${this.isWithinBudget() ? 'DANS LE BUDGET' : 'BUDGET DEPASSE — action requise'}`,
      ].join('\n');
    },
  };
}

const budget = createToilBudget(4, 200);
console.log(budget.report());
```

---

## Stratégies d'elimination du toil

### Prioriser par impact

```typescript
interface ToilEliminationStrategy {
  strategy: string;
  description: string;
  examples: string[];
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

const strategies: ToilEliminationStrategy[] = [
  {
    strategy: 'Automatiser completement',
    description: 'Remplacer l\'intervention humaine par un script ou un service',
    examples: [
      'Auto-scaling au lieu de scaling manuel',
      'Renouvellement auto des certificats',
      'Rotation automatique des logs',
    ],
    effort: 'medium',
    impact: 'high',
  },
  {
    strategy: 'Self-service',
    description: 'Permettre aux equipes de faire elles-memes via une interface',
    examples: [
      'Portail de provisioning d\'environnement',
      'Interface de creation de base de donnees',
      'Formulaire de demande d\'acces',
    ],
    effort: 'high',
    impact: 'high',
  },
  {
    strategy: 'Eliminer le besoin',
    description: 'Repenser l\'architecture pour que la tache n\'existe plus',
    examples: [
      'Passer de VM a Kubernetes (plus de gestion de serveurs)',
      'Serverless (plus de capacity planning)',
      'Managed services (plus de maintenance DB)',
    ],
    effort: 'high',
    impact: 'high',
  },
  {
    strategy: 'Reduire la frequence',
    description: 'Diminuer le nombre d\'occurrences du toil',
    examples: [
      'Augmenter la retention des logs (moins de rotations)',
      'Augmenter la taille des disques (moins de scaling)',
      'Ameliorer la fiabilite (moins de restarts)',
    ],
    effort: 'low',
    impact: 'medium',
  },
];
```

---

## Bonnes pratiques

1. **Mesurez les DORA depuis le debut** : même si les chiffres ne sont pas bons, la tendance est ce qui compte
2. **Automatisez la collecte** : les metriques DORA doivent venir du pipeline CI/CD, pas de rapports manuels
3. **Partagez les metriques** : affichez-les sur un dashboard visible par toute l'équipe
4. **Ne punissez pas** : les metriques DORA sont un outil d'amelioration, pas de jugement
5. **Inventoriez le toil regulierement** : un audit trimestriel du toil est nécessaire
6. **Respectez la regle des 50%** : si le toil dépasse 50%, escaladez au management
7. **Automatisez par ROI** : commencez par les taches les plus frequentes et les plus couteuses
8. **Celebrez l'elimination du toil** : chaque automatisation reussie merite d'etre reconnue
9. **Mefiez-vous du "toil cache"** : le toil que font les devs sans le declarer (ex: "c'est rapide, je le fais à la main")
10. **Liez DORA aux SLOs** : un bon MTTR est directement lie à un bon error budget management

---

::: tip A retenir
- Les **4 metriques DORA** : Deployment Frequency, Lead Time, Change Failure Rate, MTTR
- Les équipes **elite** sont les plus rapides ET les plus stables — vitesse et qualite se renforcent
- Le **toil** est le travail manuel, repetitif, automatisable, sans valeur durable
- **Regle des 50%** : un SRE ne doit pas passer plus de 50% de son temps en toil
- Priorisez l'elimination du toil par **ROI** : temps sauve / effort d'automatisation
- Les metriques DORA doivent etre **collectees automatiquement** depuis le pipeline CI/CD
- Le niveau global d'une équipe est déterminé par sa **metrique la plus faible**
:::

---

## Pour aller plus loin

- [Lab 15 — Implementer un DORA Tracker](/labs/lab-15-dora-tracker/README)
- [Quiz 15 — DORA Metrics & Toil Reduction](/quizzes/quiz-15-dora-metrics)
- "Accelerate" par Nicole Forsgren, Jez Humble & Gene Kim
- Google SRE Book, Chapitre 5 : "Eliminating Toil"
- DORA State of DevOps Report (annuel)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 15 dora metrics](../screencasts/screencast-15-dora-metrics.md)
2. **Lab** : [lab-15-dora-tracker](../labs/lab-15-dora-tracker/README)
3. **Quiz** : [quiz 15 dora metrics](../quizzes/quiz-15-dora-metrics.html)
:::

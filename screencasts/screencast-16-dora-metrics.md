# Screencast 16 — DORA Metrics & Toil Reduction

## Informations
- **Duree estimee** : 22-28 min
- **Module** : `modules/16-dora-metrics.md`
- **Lab associe** : Lab 16
- **Prerequis** : Screencast 15

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Fichier `scripts/dora-tracker.ts` pret a etre cree
- [ ] Donnees d'exemple pour les deployments preparees

## Script

### [00:00-02:30] Introduction

> Nous avons couvert l'observabilite technique, les SLOs, l'alerting, la gestion d'incidents, le chaos engineering. Mais comment savoir si notre equipe s'ameliore dans son ensemble ? L'equipe DORA — DevOps Research and Assessment — fondee par Dr. Nicole Forsgren, Gene Kim et Jez Humble, a identifie 4 metriques qui predisent la performance organisationnelle. Ces metriques sont le fruit de 7 ans de recherche sur des milliers d'equipes.

> L'analogie : mesurer une equipe de developpement sans les metriques DORA, c'est comme gerer une usine sans mesurer le temps de production, le taux de defauts ou les delais de livraison. Vous ne savez pas si vous allez dans la bonne direction.

### [02:30-07:00] Les 4 metriques DORA expliquees

**Action** : Ecrire les 4 metriques avec des exemples concrets.

```typescript
// Les 4 metriques DORA
interface DORAMetrics {
  // 1. Deployment Frequency (DF)
  // "A quelle frequence deployons-nous en production ?"
  deploymentFrequency: {
    elite: 'Plusieurs fois par jour (a la demande)',
    high: 'Entre une fois par jour et une fois par semaine',
    medium: 'Entre une fois par semaine et une fois par mois',
    low: 'Moins d une fois par mois',
  };

  // 2. Lead Time for Changes (LT)
  // "Combien de temps entre le commit et la production ?"
  leadTimeForChanges: {
    elite: 'Moins d une heure',
    high: 'Entre un jour et une semaine',
    medium: 'Entre une semaine et un mois',
    low: 'Plus d un mois',
  };

  // 3. Change Failure Rate (CFR)
  // "Quel pourcentage de deployments cause un incident ?"
  changeFailureRate: {
    elite: '0-15%',
    high: '16-30%',
    medium: '16-30%',  // Note : meme fourchette que high
    low: '46-60%',
  };

  // 4. Mean Time to Recovery (MTTR)
  // "Combien de temps pour retablir le service apres un incident ?"
  meanTimeToRecovery: {
    elite: 'Moins d une heure',
    high: 'Moins d un jour',
    medium: 'Entre un jour et une semaine',
    low: 'Plus d une semaine',
  };
}
```

> Les deux premieres metriques (DF et LT) mesurent la velocite — a quelle vitesse livrez-vous de la valeur. Les deux dernieres (CFR et MTTR) mesurent la stabilite — quelle est la qualite de ce que vous livrez. L'insight cle de la recherche DORA : les equipes elite sont rapides ET stables. Velocite et stabilite ne sont pas en opposition.

**Action** : Donner des exemples concrets.

```typescript
// Exemples concrets
const examples = {
  elite: {
    team: 'Equipe Spotify (exemple)',
    df: '50 deployments par jour',
    lt: '15 minutes du commit a la production',
    cfr: '5% des deployments causent un rollback',
    mttr: '10 minutes pour rollback automatique',
  },
  low: {
    team: 'Equipe en difficulte (anti-pattern)',
    df: '1 deployment par trimestre (release big-bang)',
    lt: '3 mois entre le commit et la production',
    cfr: '50% des releases causent un incident',
    mttr: '3 jours pour identifier et corriger le probleme',
  },
};
```

> La difference est frappante. L'equipe elite deploie 50 fois par jour en 15 minutes, avec 5% d'echec et 10 minutes de recovery. L'equipe en difficulte deploie tous les 3 mois, met 3 mois a livrer, echoue une fois sur deux et met 3 jours a se retablir.

### [07:00-13:00] Construire un DORA tracker en TypeScript

**Action** : Creer le fichier `scripts/dora-tracker.ts`.

```typescript
// scripts/dora-tracker.ts

interface Deployment {
  id: string;
  commitSha: string;
  commitTimestamp: Date;      // Quand le code a ete commit
  deployTimestamp: Date;      // Quand il a atteint la production
  causedIncident: boolean;    // A-t-il cause un incident ?
  incidentResolvedAt?: Date;  // Si oui, quand l'incident a-t-il ete resolu ?
}

// Donnees d'exemple — 30 jours de deployments
const deployments: Deployment[] = [
  {
    id: 'deploy-001',
    commitSha: 'abc1234',
    commitTimestamp: new Date('2024-01-01T09:00:00'),
    deployTimestamp: new Date('2024-01-01T09:45:00'),
    causedIncident: false,
  },
  {
    id: 'deploy-002',
    commitSha: 'def5678',
    commitTimestamp: new Date('2024-01-01T14:00:00'),
    deployTimestamp: new Date('2024-01-01T14:30:00'),
    causedIncident: false,
  },
  {
    id: 'deploy-003',
    commitSha: 'ghi9012',
    commitTimestamp: new Date('2024-01-02T10:00:00'),
    deployTimestamp: new Date('2024-01-02T10:20:00'),
    causedIncident: true,
    incidentResolvedAt: new Date('2024-01-02T11:05:00'),
  },
  // ... plus de deployments
  {
    id: 'deploy-015',
    commitSha: 'xyz9999',
    commitTimestamp: new Date('2024-01-15T16:00:00'),
    deployTimestamp: new Date('2024-01-15T16:25:00'),
    causedIncident: false,
  },
];

// Calculer les metriques DORA
function calculateDORA(deployments: Deployment[], periodDays: number) {
  const totalDays = periodDays;
  const totalDeployments = deployments.length;

  // 1. Deployment Frequency
  const deploymentFrequency = totalDeployments / totalDays;

  // 2. Lead Time for Changes (mediane)
  const leadTimes = deployments.map(d =>
    (d.deployTimestamp.getTime() - d.commitTimestamp.getTime()) / (1000 * 60) // en minutes
  );
  leadTimes.sort((a, b) => a - b);
  const medianLeadTime = leadTimes[Math.floor(leadTimes.length / 2)];

  // 3. Change Failure Rate
  const failedDeployments = deployments.filter(d => d.causedIncident).length;
  const changeFailureRate = (failedDeployments / totalDeployments) * 100;

  // 4. Mean Time to Recovery
  const incidents = deployments.filter(d => d.causedIncident && d.incidentResolvedAt);
  const recoveryTimes = incidents.map(d =>
    (d.incidentResolvedAt!.getTime() - d.deployTimestamp.getTime()) / (1000 * 60) // en minutes
  );
  const mttr = recoveryTimes.length > 0
    ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
    : 0;

  return {
    deploymentFrequency: {
      value: deploymentFrequency.toFixed(1),
      unit: 'deployments/jour',
      band: classifyDF(deploymentFrequency),
    },
    leadTimeForChanges: {
      value: medianLeadTime.toFixed(0),
      unit: 'minutes (mediane)',
      band: classifyLT(medianLeadTime),
    },
    changeFailureRate: {
      value: changeFailureRate.toFixed(1),
      unit: '%',
      band: classifyCFR(changeFailureRate),
    },
    meanTimeToRecovery: {
      value: mttr.toFixed(0),
      unit: 'minutes',
      band: classifyMTTR(mttr),
    },
  };
}

function classifyDF(df: number): string {
  if (df >= 1) return 'Elite';
  if (df >= 1 / 7) return 'High';
  if (df >= 1 / 30) return 'Medium';
  return 'Low';
}

function classifyLT(minutes: number): string {
  if (minutes < 60) return 'Elite';
  if (minutes < 7 * 24 * 60) return 'High';
  if (minutes < 30 * 24 * 60) return 'Medium';
  return 'Low';
}

function classifyCFR(rate: number): string {
  if (rate <= 15) return 'Elite';
  if (rate <= 30) return 'High/Medium';
  return 'Low';
}

function classifyMTTR(minutes: number): string {
  if (minutes < 60) return 'Elite';
  if (minutes < 24 * 60) return 'High';
  if (minutes < 7 * 24 * 60) return 'Medium';
  return 'Low';
}
```

**Action** : Executer le tracker.

```bash
npx tsx scripts/dora-tracker.ts
```

> Regardons les resultats. Deployment Frequency : 1.0 deployment par jour — bande "Elite". Lead Time : 30 minutes (mediane) — bande "Elite". Change Failure Rate : 6.7% — bande "Elite". MTTR : 45 minutes — bande "Elite". Notre equipe (fictive) est dans la bande elite sur les 4 metriques.

### [13:00-18:00] Identifier et mesurer le toil

> Le toil est un concept central du SRE. C'est le travail manuel, repetitif, automatisable, reactif, sans valeur durable, et qui croit lineairement avec la taille du service.

**Action** : Definir le toil avec des exemples.

```typescript
// Definition du toil (SRE Book, chapitre 5)
interface ToilCharacteristics {
  manual: boolean;        // Fait par un humain, pas un script
  repetitive: boolean;    // Se repete regulierement
  automatable: boolean;   // Pourrait etre automatise
  tactical: boolean;      // Reactif, pas strategique
  noEnduringValue: boolean; // Ne rend pas le systeme meilleur durablement
  scalesLinearly: boolean;  // Plus de trafic = plus de toil
}

// Exemples de toil dans notre contexte
const toilExamples = [
  {
    task: 'Redemarrer manuellement la demo-app quand elle crashe',
    frequency: '2 fois par semaine',
    duration: '10 minutes',
    automatable: 'Oui — healthcheck + restart automatique Docker',
  },
  {
    task: 'Mettre a jour manuellement les dashboards Grafana apres chaque nouveau service',
    frequency: '1 fois par mois',
    duration: '2 heures',
    automatable: 'Oui — generation automatique (module 17)',
  },
  {
    task: 'Verifier manuellement les alertes chaque matin',
    frequency: 'Quotidien',
    duration: '15 minutes',
    automatable: 'Oui — rapport automatique par email/Slack',
  },
  {
    task: 'Copier-coller les metriques dans un spreadsheet pour le reporting',
    frequency: 'Hebdomadaire',
    duration: '1 heure',
    automatable: 'Oui — export automatique via API Prometheus',
  },
];
```

### [18:00-22:00] Calculer le pourcentage de toil

**Action** : Calculer le toil de l'equipe.

```typescript
// Calcul du pourcentage de toil
interface TimeAllocation {
  category: string;
  hoursPerWeek: number;
  isToil: boolean;
}

const weeklyAllocation: TimeAllocation[] = [
  { category: 'Developpement de features',       hoursPerWeek: 16, isToil: false },
  { category: 'Code reviews',                    hoursPerWeek: 4,  isToil: false },
  { category: 'Design et architecture',          hoursPerWeek: 4,  isToil: false },
  { category: 'Redemarrages manuels',            hoursPerWeek: 1,  isToil: true },
  { category: 'Mise a jour dashboards',          hoursPerWeek: 0.5,isToil: true },
  { category: 'Verification manuelle alertes',   hoursPerWeek: 1.25,isToil: true },
  { category: 'Reporting manuel metriques',      hoursPerWeek: 1,  isToil: true },
  { category: 'Reponse aux incidents',           hoursPerWeek: 2,  isToil: true },
  { category: 'Provisioning manuel serveurs',    hoursPerWeek: 1.5,isToil: true },
  { category: 'Reunions et communication',       hoursPerWeek: 5,  isToil: false },
  { category: 'Formation et apprentissage',      hoursPerWeek: 2,  isToil: false },
  { category: 'On-call (sans incident)',          hoursPerWeek: 1.75,isToil: true },
];

function calculateToil(allocation: TimeAllocation[]) {
  const totalHours = allocation.reduce((sum, a) => sum + a.hoursPerWeek, 0);
  const toilHours = allocation.filter(a => a.isToil).reduce((sum, a) => sum + a.hoursPerWeek, 0);
  const toilPercentage = (toilHours / totalHours) * 100;

  return {
    totalHours,     // 40h
    toilHours,      // 9h
    toilPercentage, // 22.5%
    engineeringHours: totalHours - toilHours, // 31h
  };
}

// Resultat : 22.5% de toil
// Regle du SRE Book : maximum 50% de toil
// Notre equipe est dans la zone verte, mais peut encore ameliorer
```

> La regle des 50% du livre Google SRE dit : un SRE ne doit pas passer plus de 50% de son temps en toil. Au-dela, l'equipe n'a plus le temps d'automatiser et le toil ne fait que croitre. Notre equipe fictive est a 22.5% — correct mais ameliorable.

**Action** : Prioriser les actions de reduction du toil.

```typescript
// Priorisation par impact (heures economisees par semaine)
const toilReductionPlan = [
  {
    action: 'Automatiser le redemarrage avec Docker healthcheck',
    toilSaved: '1h/semaine',
    effort: '2 heures de dev',
    roi: 'Rentabilise en 2 semaines',
    priority: 'P0',
  },
  {
    action: 'Automatiser le reporting via API Prometheus + Slack',
    toilSaved: '1h/semaine',
    effort: '4 heures de dev',
    roi: 'Rentabilise en 4 semaines',
    priority: 'P1',
  },
  {
    action: 'Generer les dashboards Grafana automatiquement (module 17)',
    toilSaved: '0.5h/semaine',
    effort: '8 heures de dev',
    roi: 'Rentabilise en 16 semaines',
    priority: 'P2',
  },
];
```

> Le ROI est simple : heures economisees par semaine vs heures de developpement. Le redemarrage automatique est rentabilise en 2 semaines — c'est un quick win evident.

### [22:00-25:00] Lier DORA et toil a l'observabilite

> Les metriques DORA et la reduction du toil sont directement liees a tout ce que nous avons appris. Le Lead Time depend de la qualite de votre pipeline CI/CD — que le module 17 abordera avec l'observability as code. Le MTTR depend de la qualite de vos dashboards, alertes et runbooks. Le Change Failure Rate depend de vos tests, y compris les tests de chaos. Le toil de monitoring est reduit par l'automatisation des dashboards et des alertes.

```typescript
// Boucle d'amelioration continue
const improvementLoop = {
  measure: 'Calculer les 4 metriques DORA chaque mois',
  identify: 'Identifier le toil qui impacte les metriques DORA',
  automate: 'Automatiser le toil par priorite de ROI',
  verify: 'Verifier l amelioration aux metriques DORA du mois suivant',
  repeat: 'Recommencer',
};
```

### [25:00-27:00] Recapitulatif

> Recapitulons. Les 4 metriques DORA mesurent la performance d'une equipe : Deployment Frequency, Lead Time, Change Failure Rate, MTTR. Les equipes elite sont rapides ET stables — ce n'est pas un compromis. Le toil est le travail manuel, repetitif et automatisable qui freine l'equipe. La regle des 50% fixe la limite. Priorisez les actions de reduction par ROI.

> Dans le prochain module, nous passons a l'observability as code — generer des dashboards et des alertes programmatiquement. C'est l'une des meilleures facons de reduire le toil d'observabilite. Faites le Lab 16 !

## Points d'attention pour l'enregistrement
- Les 4 metriques DORA doivent etre presentees avec des exemples concrets, pas juste des definitions
- La comparaison elite vs low performer est tres parlante — prendre le temps
- Le DORA tracker en TypeScript est un livrable concret — executer le code en live
- La classification en bandes (Elite, High, Medium, Low) est importante
- Le toil est souvent sous-estime — insister sur les exemples quotidiens
- Le calcul du pourcentage de toil est revelateur pour les participants
- La priorisation par ROI est une competence pratique applicable immediatement
- Lier DORA et toil a l'observabilite montre la coherence du cours

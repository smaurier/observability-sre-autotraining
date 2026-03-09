# Incident Management & On-call

## Objectifs pedagogiques

- Comprendre l'anatomie complete d'un incident (detection a resolution)
- Maitriser les niveaux de severite et savoir les attribuer
- Connaitre les roles cles pendant un incident (IC, Comm Lead, Ops Lead)
- Appliquer les bonnes pratiques de communication pendant un incident
- Mettre en place des rotations d'astreinte saines et durables
- Implementer un simulateur d'incident en TypeScript

---

## Introduction : quand tout va mal

Un incident, c'est comme un incendie dans un immeuble. Sans plan d'evacuation, c'est la panique. Avec un plan clair, des roles definis et des exercices reguliers, tout le monde sait exactement quoi faire. L'incident management, c'est ce plan d'evacuation pour vos systemes de production.

Meme les systemes les mieux concus tombent en panne. La difference entre une equipe mature et une equipe immature ne reside pas dans le nombre d'incidents, mais dans la **rapidite et la qualite de la reponse**.

---

## Anatomie d'un incident

### Les phases d'un incident

```typescript
type IncidentPhase =
  | 'detection'
  | 'triage'
  | 'mitigation'
  | 'resolution'
  | 'post-incident';

interface IncidentTimeline {
  phase: IncidentPhase;
  description: string;
  objective: string;
  typicalDuration: string;
}

const incidentPhases: IncidentTimeline[] = [
  {
    phase: 'detection',
    description: 'Le probleme est identifie (alerte, rapport utilisateur, monitoring)',
    objective: 'Detecter le plus vite possible que quelque chose ne va pas',
    typicalDuration: '0 - 15 minutes',
  },
  {
    phase: 'triage',
    description: 'Evaluer la severite, assigner les roles, ouvrir un canal de communication',
    objective: 'Comprendre l\'ampleur de l\'impact et mobiliser les bonnes personnes',
    typicalDuration: '5 - 15 minutes',
  },
  {
    phase: 'mitigation',
    description: 'Reduire ou supprimer l\'impact utilisateur (meme sans comprendre la cause)',
    objective: 'Restaurer le service, meme de maniere temporaire ou degradee',
    typicalDuration: '15 minutes - quelques heures',
  },
  {
    phase: 'resolution',
    description: 'Corriger la cause racine de maniere durable',
    objective: 'S\'assurer que le probleme ne se reproduira pas immediatement',
    typicalDuration: 'Heures - jours',
  },
  {
    phase: 'post-incident',
    description: 'Postmortem, action items, ameliorations',
    objective: 'Apprendre de l\'incident et renforcer le systeme',
    typicalDuration: '1 - 5 jours apres resolution',
  },
];
```

### Distinction cruciale : mitigation vs resolution

```
Mitigation : "Le patient saigne, on applique un garrot"
Resolution : "On opere pour reparer l'artere"
```

La mitigation est **toujours prioritaire**. Comprendre la cause racine peut attendre ; restaurer le service ne peut pas.

```typescript
// Exemples concrets de mitigation vs resolution

interface MitigationVsResolution {
  incident: string;
  mitigation: string;
  resolution: string;
}

const examples: MitigationVsResolution[] = [
  {
    incident: 'Deployement defectueux cause des 500',
    mitigation: 'Rollback vers la version precedente',
    resolution: 'Corriger le bug, ajouter un test, redeployer',
  },
  {
    incident: 'Base de donnees saturee (CPU 100%)',
    mitigation: 'Kill les requetes longues, augmenter la taille de l\'instance',
    resolution: 'Optimiser les requetes, ajouter des index, mettre en place du read-replica',
  },
  {
    incident: 'Fuite memoire dans le service de paiement',
    mitigation: 'Redemarrer les pods (rolling restart)',
    resolution: 'Identifier et corriger la fuite memoire dans le code',
  },
  {
    incident: 'Certificat SSL expire',
    mitigation: 'Renouveler manuellement le certificat',
    resolution: 'Mettre en place le renouvellement automatique (cert-manager)',
  },
];
```

---

## Niveaux de severite

### Classification standard

```typescript
type SeverityLevel = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

interface SeverityDefinition {
  level: SeverityLevel;
  name: string;
  description: string;
  impact: string;
  responseTime: string;
  exampleScenarios: string[];
  communication: string;
}

const severityLevels: SeverityDefinition[] = [
  {
    level: 'SEV1',
    name: 'Critique',
    description: 'Indisponibilite totale ou perte de donnees',
    impact: 'Tous les utilisateurs sont impactes',
    responseTime: '< 5 minutes',
    exampleScenarios: [
      'Site completement down',
      'Perte de donnees en cours',
      'Faille de securite exploitee activement',
      'Paiements impossibles',
    ],
    communication: 'Status page + notifications executives toutes les 30 min',
  },
  {
    level: 'SEV2',
    name: 'Majeur',
    description: 'Fonctionnalite critique degradee',
    impact: 'Un segment significatif d\'utilisateurs est impacte',
    responseTime: '< 15 minutes',
    exampleScenarios: [
      'Latence tres elevee (>10x normale)',
      'Une region geographique est down',
      'Fonctionnalite cle indisponible (recherche, checkout)',
    ],
    communication: 'Status page + mises a jour toutes les heures',
  },
  {
    level: 'SEV3',
    name: 'Mineur',
    description: 'Fonctionnalite non critique degradee',
    impact: 'Un petit nombre d\'utilisateurs est impacte',
    responseTime: '< 4 heures',
    exampleScenarios: [
      'Un endpoint secondaire retourne des erreurs',
      'Performance degradee sur une feature non critique',
      'Un job batch en retard',
    ],
    communication: 'Ticket + mise a jour quotidienne',
  },
  {
    level: 'SEV4',
    name: 'Cosmétique',
    description: 'Impact minimal, pas d\'urgence',
    impact: 'Impact negligeable sur l\'experience utilisateur',
    responseTime: '< 2 jours ouvrables',
    exampleScenarios: [
      'Bug d\'affichage mineur',
      'Warning dans les logs sans impact',
      'Dashboard de monitoring incomplet',
    ],
    communication: 'Ticket dans le backlog',
  },
];
```

### Arbre de decision pour la severite

```typescript
function determineSeverity(
  usersImpactedPercent: number,
  isRevenueImpacted: boolean,
  isDataLoss: boolean,
  isSecurityBreach: boolean,
): SeverityLevel {
  // Toujours SEV1 en cas de perte de donnees ou faille de securite
  if (isDataLoss || isSecurityBreach) return 'SEV1';

  // SEV1 si impact revenue et beaucoup d'utilisateurs
  if (isRevenueImpacted && usersImpactedPercent > 50) return 'SEV1';

  // SEV2 si impact significatif
  if (usersImpactedPercent > 20 || isRevenueImpacted) return 'SEV2';

  // SEV3 si impact modere
  if (usersImpactedPercent > 1) return 'SEV3';

  // SEV4 sinon
  return 'SEV4';
}
```

---

## Roles pendant un incident

### Les trois roles essentiels

```typescript
interface IncidentRole {
  title: string;
  alias: string;
  responsibilities: string[];
  doNot: string[];
}

const roles: IncidentRole[] = [
  {
    title: 'Incident Commander (IC)',
    alias: 'IC',
    responsibilities: [
      'Coordonne l\'ensemble de la reponse',
      'Assigne les taches aux participants',
      'Prend les decisions sur la strategie de mitigation',
      'Declare le debut et la fin de l\'incident',
      'S\'assure que la communication est faite',
      'Escalade si necessaire',
    ],
    doNot: [
      'Ne debuggue PAS lui-meme (delegue aux ops)',
      'Ne communique PAS directement aux clients (delegue au comm lead)',
    ],
  },
  {
    title: 'Communication Lead',
    alias: 'Comm Lead',
    responsibilities: [
      'Redige les mises a jour pour la status page',
      'Informe les stakeholders (management, equipes impactees)',
      'Gere la communication client (emails, tweets)',
      'Prend des notes chronologiques (timeline)',
      'Redige le resume initial pour le postmortem',
    ],
    doNot: [
      'Ne prend PAS de decisions techniques',
      'Ne fait PAS de promesses de delai sans validation IC',
    ],
  },
  {
    title: 'Operations Lead',
    alias: 'Ops Lead',
    responsibilities: [
      'Execute le diagnostic technique',
      'Propose des strategies de mitigation',
      'Implemente les correctifs',
      'Remonte les informations techniques a l\'IC',
      'Coordonne avec les autres ingenieurs si besoin',
    ],
    doNot: [
      'Ne communique PAS en externe',
      'Ne prend PAS de decisions unilaterales sans valider avec l\'IC',
    ],
  },
];
```

### Analogie militaire

L'Incident Commander est comme un **general** : il ne tire pas lui-meme, il coordonne les troupes. Le Communication Lead est l'**officier de liaison** avec le QG. L'Operations Lead est le **commandant de terrain** qui execute la strategie.

---

## Communication pendant un incident

### Structure d'une mise a jour de status page

```typescript
interface StatusUpdate {
  timestamp: Date;
  severity: SeverityLevel;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  message: string;
  affectedServices: string[];
}

const statusUpdates: StatusUpdate[] = [
  {
    timestamp: new Date('2025-03-15T14:05:00Z'),
    severity: 'SEV1',
    status: 'investigating',
    message:
      'Nous avons detecte un taux d\'erreurs eleve sur notre API principale. ' +
      'Nos equipes investiguent actuellement. Certaines requetes peuvent echouer.',
    affectedServices: ['API', 'Application Web'],
  },
  {
    timestamp: new Date('2025-03-15T14:20:00Z'),
    severity: 'SEV1',
    status: 'identified',
    message:
      'La cause a ete identifiee : un deplacement recent a introduit une regression. ' +
      'Un rollback est en cours. Nous estimons un retour a la normale dans ~15 minutes.',
    affectedServices: ['API', 'Application Web'],
  },
  {
    timestamp: new Date('2025-03-15T14:35:00Z'),
    severity: 'SEV1',
    status: 'monitoring',
    message:
      'Le rollback est termine. Les taux d\'erreur reviennent a la normale. ' +
      'Nous continuons de surveiller la situation.',
    affectedServices: ['API', 'Application Web'],
  },
  {
    timestamp: new Date('2025-03-15T15:05:00Z'),
    severity: 'SEV1',
    status: 'resolved',
    message:
      'L\'incident est resolu. Le service fonctionne normalement depuis 30 minutes. ' +
      'Un postmortem sera publie dans les 48h. Duree totale : 1h.',
    affectedServices: ['API', 'Application Web'],
  },
];
```

### Regles de communication

1. **Premiere mise a jour en < 10 minutes** : meme si c'est "on investigue"
2. **Frequence reguliere** : toutes les 30 min pour SEV1, toutes les heures pour SEV2
3. **Etre honnete** : ne pas minimiser, ne pas specifier de cause avant d'etre sur
4. **Donner un ETA** : meme approximatif, les clients veulent savoir quand ca ira mieux
5. **Pas de jargon** : les clients ne savent pas ce qu'est un "pod" ou un "rollback"

---

## On-call : pratiques saines

### Rotations

```typescript
interface OnCallRotation {
  teamSize: number;
  rotationLengthDays: number;
  overlapHours: number;
  maxPagesPerShift: number;
  compensation: string;
}

const healthyRotation: OnCallRotation = {
  teamSize: 6,              // Minimum recommande
  rotationLengthDays: 7,    // 1 semaine
  overlapHours: 2,          // Handoff de 2h entre rotations
  maxPagesPerShift: 2,      // Si plus, il faut ameliorer le systeme
  compensation: 'prime_astreinte + repos_compensatoire',
};
```

### Gestion de la fatigue

```typescript
interface OnCallHealthMetrics {
  pagesPerWeek: number;
  averageTTRMinutes: number;
  nightPagesPercent: number;
  falsePositiveRate: number;

  isHealthy(): boolean;
  recommendations(): string[];
}

function evaluateOnCallHealth(metrics: OnCallHealthMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.pagesPerWeek > 2) {
    recommendations.push(
      'Trop de pages par semaine. Augmentez les seuils ou ameliorez la fiabilite.',
    );
  }

  if (metrics.nightPagesPercent > 30) {
    recommendations.push(
      'Trop de pages de nuit. Envisagez un follow-the-sun ou des actions automatisees.',
    );
  }

  if (metrics.falsePositiveRate > 0.5) {
    recommendations.push(
      'Plus de 50% de faux positifs. Revoyez vos regles d\'alerting.',
    );
  }

  if (metrics.averageTTRMinutes > 60) {
    recommendations.push(
      'TTR moyen trop long. Ameliorez les runbooks et l\'outillage.',
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('L\'astreinte est saine. Continuez ainsi !');
  }

  return recommendations;
}
```

### Principes pour un on-call sain

| Principe | Description |
|----------|-------------|
| **Compensation equitable** | L'astreinte doit etre compensee (financierement ou en temps libre) |
| **Equipe de taille suffisante** | Minimum 6 personnes pour eviter les rotations trop frequentes |
| **Droit a la deconnexion** | Pas d'astreinte pendant les conges ou apres une nuit difficile |
| **Rotation equitable** | Tout le monde participe, y compris les seniors et les managers |
| **Amelioration continue** | Chaque page doit mener a une action pour reduire les pages futures |

---

## Procedures d'escalation

```typescript
interface EscalationPolicy {
  levels: Array<{
    level: number;
    contacts: string[];
    delayMinutes: number;
    condition: string;
  }>;
}

const escalationPolicy: EscalationPolicy = {
  levels: [
    {
      level: 1,
      contacts: ['on-call-engineer'],
      delayMinutes: 0,
      condition: 'Alerte declenchee',
    },
    {
      level: 2,
      contacts: ['on-call-engineer-backup', 'tech-lead'],
      delayMinutes: 15,
      condition: 'Pas d\'acknowledgement en 15 minutes',
    },
    {
      level: 3,
      contacts: ['engineering-manager', 'vp-engineering'],
      delayMinutes: 30,
      condition: 'SEV1 non mitige en 30 minutes',
    },
    {
      level: 4,
      contacts: ['cto', 'ceo'],
      delayMinutes: 60,
      condition: 'SEV1 avec impact business majeur > 1 heure',
    },
  ],
};
```

---

## Exercice : simulateur d'incident en TypeScript

```typescript
interface IncidentSimulation {
  id: string;
  title: string;
  severity: SeverityLevel;
  startTime: Date;
  phases: Array<{
    phase: IncidentPhase;
    startTime: Date;
    endTime?: Date;
    actions: string[];
  }>;
  currentPhase: IncidentPhase;
  isResolved: boolean;

  advancePhase(): void;
  addAction(action: string): void;
  getTimelineReport(): string;
}

function createIncident(
  title: string,
  severity: SeverityLevel,
): IncidentSimulation {
  const now = new Date();

  return {
    id: `INC-${Date.now()}`,
    title,
    severity,
    startTime: now,
    phases: [
      {
        phase: 'detection',
        startTime: now,
        actions: ['Alerte declenchee automatiquement'],
      },
    ],
    currentPhase: 'detection',
    isResolved: false,

    advancePhase() {
      const phaseOrder: IncidentPhase[] = [
        'detection', 'triage', 'mitigation', 'resolution', 'post-incident',
      ];
      const currentIndex = phaseOrder.indexOf(this.currentPhase);

      if (currentIndex < phaseOrder.length - 1) {
        // Fermer la phase actuelle
        const currentPhaseData = this.phases[this.phases.length - 1];
        currentPhaseData.endTime = new Date();

        // Ouvrir la phase suivante
        const nextPhase = phaseOrder[currentIndex + 1];
        this.currentPhase = nextPhase;
        this.phases.push({
          phase: nextPhase,
          startTime: new Date(),
          actions: [],
        });

        if (nextPhase === 'post-incident') {
          this.isResolved = true;
        }
      }
    },

    addAction(action: string) {
      const currentPhaseData = this.phases[this.phases.length - 1];
      currentPhaseData.actions.push(`[${new Date().toISOString()}] ${action}`);
    },

    getTimelineReport(): string {
      let report = `\n=== INCIDENT REPORT ===\n`;
      report += `ID: ${this.id}\n`;
      report += `Title: ${this.title}\n`;
      report += `Severity: ${this.severity}\n`;
      report += `Status: ${this.isResolved ? 'RESOLVED' : 'ACTIVE'}\n\n`;

      for (const phase of this.phases) {
        report += `--- ${phase.phase.toUpperCase()} ---\n`;
        report += `  Started: ${phase.startTime.toISOString()}\n`;
        if (phase.endTime) {
          report += `  Ended: ${phase.endTime.toISOString()}\n`;
        }
        for (const action of phase.actions) {
          report += `  > ${action}\n`;
        }
        report += '\n';
      }

      return report;
    },
  };
}

// Simulation d'un incident
const incident = createIncident('API Gateway returning 502', 'SEV1');

// Phase Detection -> Triage
incident.advancePhase();
incident.addAction('IC assigne : Alice');
incident.addAction('Severite confirmee SEV1 : 80% des requetes en erreur');
incident.addAction('Canal Slack #inc-20250315 cree');

// Phase Triage -> Mitigation
incident.advancePhase();
incident.addAction('Deployement recent identifie comme cause probable');
incident.addAction('Rollback initie par Ops Lead');
incident.addAction('Taux d\'erreur en baisse : 80% -> 5%');
incident.addAction('Taux d\'erreur normalise : 0.1%');

// Phase Mitigation -> Resolution
incident.advancePhase();
incident.addAction('Bug identifie dans le code du dernier deploy');
incident.addAction('Fix merge et deploye avec tests supplementaires');

// Phase Resolution -> Post-incident
incident.advancePhase();
incident.addAction('Postmortem programme pour demain 14h');

console.log(incident.getTimelineReport());
```

---

## Playbooks vs Runbooks

| Aspect | Runbook | Playbook |
|--------|---------|----------|
| **Scope** | Un probleme specifique | Un type de scenario |
| **Granularite** | Etape par etape (commandes exactes) | Principes et decisions |
| **Exemple** | "Si alerte X, executer Y" | "Processus de gestion d'un SEV1" |
| **Automatisable** | Oui (souvent) | Non (requiert du jugement) |
| **Public** | Ingenieur d'astreinte | Incident Commander |

---

## Bonnes pratiques

1. **Declarez les incidents tot** : il vaut mieux declarer un incident qui n'en est pas qu'ignorer un vrai
2. **Mitigation avant investigation** : restaurez le service d'abord, comprenez ensuite
3. **Un seul IC** : jamais de decision par comite pendant un incident
4. **Communiquez proactivement** : n'attendez pas qu'on vous demande des nouvelles
5. **Documentez en temps reel** : la timeline est precieuse pour le postmortem
6. **Pas de blame** : pendant l'incident, focus sur la resolution, pas sur la faute
7. **Exercez-vous** : les Game Days et les simulations sont essentiels
8. **Post-incident systematique** : chaque SEV1/SEV2 merite un postmortem

---

## On-call & Runbooks — Guide pratique

Cette section approfondit les aspects pratiques de l'astreinte et des runbooks, en allant au-dela des principes generaux vus precedemment.

### Rotation on-call

#### Modeles de rotation

Il existe plusieurs modeles de rotation, chacun adapte a des contextes differents :

| Modele | Description | Adapte a | Inconvenients |
|--------|-------------|----------|---------------|
| **Weekly** | Une personne par semaine | Equipes co-localisees (5-8 pers.) | Longues periodes d'astreinte |
| **Bi-weekly** | Deux semaines par rotation | Petites equipes (3-4 pers.) | Risque de fatigue accru |
| **Follow-the-sun** | Transfert entre fuseaux horaires | Equipes reparties globalement | Necessite >= 3 sites geographiques |
| **Split day/night** | Astreinte jour vs nuit separees | Equipes mixtes jour/nuit | Complexite de coordination |

Le modele **follow-the-sun** est le plus sain car personne n'est jamais reveille la nuit, mais il exige une equipe distribuee sur au moins 3 fuseaux horaires (ex: Europe, Asie, Amerique).

#### Primary + Secondary on-call

Toute rotation devrait inclure au minimum deux niveaux :

```typescript
interface OnCallSchedule {
  primary: string;       // Premiere personne alertee
  secondary: string;     // Backup si le primary ne repond pas en X minutes
  escalationDelay: number; // Delai en minutes avant d'alerter le secondary
  startDate: Date;
  endDate: Date;
}

const currentSchedule: OnCallSchedule = {
  primary: 'alice@team.com',
  secondary: 'bob@team.com',
  escalationDelay: 10,   // 10 minutes sans acknowledgement -> secondary
  startDate: new Date('2025-03-17T09:00:00Z'),
  endDate: new Date('2025-03-24T09:00:00Z'),
};
```

Le **secondary** n'est pas juste un backup passif : il peut etre sollicite pour aider sur un incident complexe meme si le primary a deja acknowledge.

#### Handoff procedures (journal d'astreinte)

Le moment le plus risque d'une rotation est le **handoff** (passage de relais). Un mauvais handoff = des alertes ignorees ou un contexte perdu.

Checklist de handoff :
- Incidents en cours ou recemment resolus
- Alertes connues a ignorer (maintenance planifiee, faux positifs identifies)
- Deployments prevus pendant la prochaine rotation
- Etat des action items des postmortems recents
- Contacts cles a jour (numeros de telephone, canaux Slack)

```typescript
interface OnCallHandoff {
  outgoing: string;
  incoming: string;
  timestamp: Date;
  activeIncidents: string[];
  knownIssues: string[];
  plannedChanges: string[];
  notes: string;
}

// Exemple de journal d'astreinte
const handoff: OnCallHandoff = {
  outgoing: 'alice',
  incoming: 'bob',
  timestamp: new Date('2025-03-24T09:00:00Z'),
  activeIncidents: [],
  knownIssues: [
    'Alerte "disk_usage_high" sur prometheus-01 : faux positif, ticket INFRA-456 ouvert',
    'Latence elevee sur le service payment entre 2h et 4h (cron de reconciliation)',
  ],
  plannedChanges: [
    'Deploiement v2.3.1 du service orders prevu mercredi 14h',
    'Migration base de donnees users prevue jeudi (fenetre de maintenance 22h-2h)',
  ],
  notes: 'Semaine calme, 0 pages. Le runbook RB-042 a ete mis a jour suite au postmortem PM-118.',
};
```

#### Compensation et equilibre

L'astreinte represente une contrainte reelle sur la vie personnelle. Sans compensation adequate, les equipes se desengagent :

- **Compensation financiere** : prime fixe par jour/semaine d'astreinte + prime par intervention effective
- **Repos compensatoire** : jour de repos apres une nuit avec intervention(s)
- **On-call load balancing** : les rotations doivent etre equitables — pas toujours les memes personnes les weekends ou jours feries
- **Opt-out temporaire** : possibilite de se retirer de la rotation pour raisons personnelles ou de sante

### Sante et fatigue de l'on-call

L'astreinte est un facteur de burnout majeur si elle est mal geree. Le Google SRE Book recommande un maximum de **2 events par shift de 12 heures** en moyenne. Au-dela, le probleme est le systeme, pas l'astreinte.

#### Metriques de sante de l'on-call

```typescript
interface OnCallWellbeingMetrics {
  interruptionsPerNight: number;    // Pages entre 22h et 7h
  meanTimeToAcknowledge: number;    // MTTA en minutes
  falsePositiveRate: number;        // % d'alertes sans action reelle necessaire
  pagesPerRotation: number;         // Nombre total de pages par rotation
  sleepDisruptionScore: number;     // Auto-evaluation 1-5 (5 = tres impacte)
  postRotationRecoveryDays: number; // Jours necessaires pour "recuperer"
}

function assessWellbeing(metrics: OnCallWellbeingMetrics): string[] {
  const actions: string[] = [];

  if (metrics.interruptionsPerNight > 1) {
    actions.push(
      'URGENT: Plus d\'1 interruption par nuit. Revoir les seuils d\'alerte nocturne ' +
      'ou envisager un modele follow-the-sun.'
    );
  }

  if (metrics.falsePositiveRate > 0.30) {
    actions.push(
      `Taux de faux positifs a ${(metrics.falsePositiveRate * 100).toFixed(0)}%. ` +
      'Chaque faux positif erode la confiance dans les alertes. Nettoyez les regles.'
    );
  }

  if (metrics.meanTimeToAcknowledge > 10) {
    actions.push(
      'MTTA > 10 minutes. Verifiez que les canaux de notification fonctionnent ' +
      '(sonnerie, volume, Do Not Disturb desactive).'
    );
  }

  if (metrics.sleepDisruptionScore >= 4) {
    actions.push(
      'Score de perturbation du sommeil eleve. Envisagez un repos compensatoire immediat ' +
      'et une revue de la politique d\'alerting nocturne.'
    );
  }

  return actions;
}
```

#### Principes de sante on-call

- **Droit de refuser** : un ingenieur doit pouvoir refuser une rotation pour raisons de sante (physique ou mentale) sans consequences negatives
- **Post-on-call review** : a la fin de chaque rotation, une retrospective rapide (10 min) permet d'identifier les alertes a supprimer ou ameliorer
- **Suivi du sommeil et du stress** : les equipes matures suivent le nombre d'interruptions nocturnes comme un KPI de sante d'equipe
- **Rotation immediate** : si une nuit est particulierement chargee (>= 3 pages), le primary peut demander a etre relaye le lendemain

### Ecrire un bon runbook

Un runbook est un document operationnel qui guide un ingenieur d'astreinte a travers le diagnostic et la resolution d'un probleme specifique. Un bon runbook est la difference entre un incident resolu en 5 minutes et un incident qui dure 2 heures.

#### Structure d'un runbook

Chaque runbook doit contenir les sections suivantes :

1. **Titre et description** : quel probleme ce runbook resout
2. **Alerte associee** : quelle alerte Prometheus/Alertmanager declenche ce runbook
3. **Symptomes observables** : ce que l'on voit dans les dashboards/logs
4. **Etapes de diagnostic** : commandes exactes a executer pour comprendre la situation
5. **Etapes de remediation** : actions correctives step by step
6. **Escalation** : quand et a qui escalader si la remediation ne fonctionne pas
7. **Verification** : comment confirmer que le probleme est resolu

#### Exemple de runbook complet

```markdown
# RB-042 : Latence p99 > 500ms sur le service orders

## Alerte associee
- Nom : `OrdersHighLatencyP99`
- Expression : `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="orders"}[5m])) > 0.5`
- Severite : warning (page si > 1s pendant 10 minutes)

## Symptomes
- Dashboard "Orders Service" : graphe de latence p99 au-dessus de la ligne rouge (500ms)
- Les utilisateurs peuvent rapporter des lenteurs sur la page de commande
- Pas necessairement d'erreurs HTTP (les requetes aboutissent, mais lentement)

## Diagnostic

### Etape 1 : Verifier l'ampleur
```
# Verifier la latence actuelle
curl -s http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,rate(http_request_duration_seconds_bucket\{service="orders"\}[5m]))

# Verifier si c'est un endpoint specifique ou global
curl -s http://localhost:9090/api/v1/query?query=histogram_quantile(0.99,rate(http_request_duration_seconds_bucket\{service="orders"\}[5m]))+by+(endpoint)
```

### Etape 2 : Verifier les ressources
```
# CPU et memoire du service
docker stats orders-service --no-stream

# Connexions actives a la base de donnees
curl -s http://localhost:9090/api/v1/query?query=db_connections_active\{service="orders"\}
```

### Etape 3 : Verifier les dependances
```
# Latence de la base de donnees
curl -s http://localhost:9090/api/v1/query?query=db_query_duration_seconds\{service="orders",quantile="0.99"\}

# Latence des appels externes (service inventory, service payment)
curl -s http://localhost:9090/api/v1/query?query=http_client_duration_seconds\{caller="orders",quantile="0.99"\}
```

## Remediation

### Si la base de donnees est lente :
1. Verifier les requetes longues : `docker exec -it postgres psql -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 5;"`
2. Killer les requetes de plus de 60s : `docker exec -it postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '60 seconds';"`
3. Si le probleme persiste, redemarrer le service : `docker-compose restart orders`

### Si une dependance externe est lente :
1. Verifier le circuit breaker : les logs doivent indiquer `circuit open` si le seuil est atteint
2. Si le circuit breaker n'est pas en place, redemarrer le service pour couper les connexions pendantes

### Si le service lui-meme est sature (CPU > 80%) :
1. Scaler horizontalement : `docker-compose up -d --scale orders=3`
2. Ou redemarrer pour liberer la memoire : `docker-compose restart orders`

## Escalation
- Si la remediation ne fonctionne pas apres 15 minutes : escalader au Tech Lead (@tech-lead)
- Si la latence depasse 2s (SEV2) : escalader a l'Engineering Manager et ouvrir un incident

## Verification
- La latence p99 doit repasser sous 500ms dans les 5 minutes suivant la remediation
- Verifier sur le dashboard "Orders Service" que le graphe redescend
- Surveiller pendant 30 minutes pour s'assurer que le probleme ne revient pas
```

#### Template markdown de runbook

Utilisez ce template pour creer vos propres runbooks :

```markdown
# RB-XXX : [Titre descriptif du probleme]

## Alerte associee
- Nom : `[NomDeLAlerte]`
- Expression : `[expression PromQL]`
- Severite : [info | warning | critical]

## Symptomes
- [Ce que l'on observe dans les dashboards]
- [Ce que les utilisateurs rapportent]

## Diagnostic
### Etape 1 : [Description]
\`\`\`
[commandes exactes]
\`\`\`

### Etape 2 : [Description]
\`\`\`
[commandes exactes]
\`\`\`

## Remediation
### Cas 1 : [Si condition X]
1. [Action 1]
2. [Action 2]

### Cas 2 : [Si condition Y]
1. [Action 1]
2. [Action 2]

## Escalation
- [Condition] : escalader a [qui] via [canal]

## Verification
- [Comment confirmer que c'est resolu]
- [Combien de temps surveiller]
```

#### Bonnes pratiques pour les runbooks

| Pratique | Pourquoi |
|----------|----------|
| **Testez regulierement** | Un runbook non teste est un faux sentiment de securite. Incluez les runbooks dans vos Game Days |
| **Maintenez a jour** | Apres chaque incident, verifiez si le runbook correspondant est toujours exact |
| **Commandes copy-paste** | L'ingenieur d'astreinte a 3h du matin ne doit pas deviner les commandes |
| **Un runbook par alerte** | Chaque alerte Prometheus devrait pointer vers un runbook via l'annotation `runbook_url` |
| **Automatisez quand possible** | Si un runbook est execute plus de 3 fois, automatisez-le (script, operator, auto-remediation) |
| **Versionnez dans Git** | Les runbooks sont du code operationnel, ils meritent la meme rigueur (review, historique) |

### Outils d'on-call

#### Comparaison rapide des plateformes

| Fonctionnalite | PagerDuty | OpsGenie (Atlassian) | Grafana OnCall |
|----------------|-----------|----------------------|----------------|
| **Scheduling** | Avance (layers, overrides) | Avance | Correct |
| **Escalation policies** | Tres flexible | Tres flexible | Basique |
| **Integration Alertmanager** | Native | Native | Native (meme ecosysteme) |
| **Prix** | Eleve (~$25/user/mois) | Modere (~$9/user/mois) | Gratuit (OSS) ou Grafana Cloud |
| **Analytics on-call** | Excellent | Bon | Basique |
| **Runbook linking** | Oui | Oui | Oui |
| **Mobile app** | Excellente | Bonne | Correcte |

Pour les equipes qui utilisent deja la stack Grafana (ce qui est notre cas dans ce cours), **Grafana OnCall** offre l'avantage de l'integration native avec Grafana et Alertmanager.

#### Integration avec Prometheus Alertmanager

L'Alertmanager est le composant qui recoit les alertes de Prometheus et les route vers les bonnes personnes. Voici comment le configurer pour envoyer les alertes vers PagerDuty :

```yaml
# alertmanager.yml — Exemple de routage vers PagerDuty
global:
  resolve_timeout: 5m
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'default-slack'
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Les alertes critical vont a PagerDuty (page immediate)
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      repeat_interval: 1h

    # Les alertes warning vont dans Slack
    - match:
        severity: warning
      receiver: 'slack-warning'
      repeat_interval: 4h

receivers:
  - name: 'default-slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - routing_key: 'VOTRE_INTEGRATION_KEY_PAGERDUTY'
        severity: critical
        description: '{{ .GroupLabels.alertname }} - {{ .CommonAnnotations.summary }}'
        details:
          service: '{{ .GroupLabels.service }}'
          runbook: '{{ .CommonAnnotations.runbook_url }}'

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/XXX/YYY/ZZZ'
        channel: '#alerts-warning'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

Points importants de cette configuration :
- **`group_by`** : regroupe les alertes similaires pour eviter le spam (ex: 50 pods en erreur = 1 notification, pas 50)
- **`repeat_interval`** : evite de repager pour la meme alerte non resolue (1h pour critical, 4h pour warning)
- **`routing_key`** : cle d'integration PagerDuty qui determine le service et la politique d'escalation
- **`runbook_url`** dans les details : permet a l'ingenieur d'astreinte d'acceder directement au runbook depuis la notification

Pour lier une alerte Prometheus a un runbook, utilisez l'annotation `runbook_url` dans vos regles d'alerte :

```yaml
# prometheus-rules.yml
groups:
  - name: orders-service
    rules:
      - alert: OrdersHighLatencyP99
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="orders"}[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
          service: orders
        annotations:
          summary: 'Latence p99 elevee sur le service orders ({{ $value | humanizeDuration }})'
          runbook_url: 'https://wiki.internal/runbooks/RB-042'
```

---

::: tip A retenir
- Un incident suit 5 phases : **detection, triage, mitigation, resolution, post-incident**
- La **mitigation** (restaurer le service) est toujours prioritaire sur la **resolution** (corriger la cause)
- Trois roles cles : **Incident Commander** (coordonne), **Communication Lead** (informe), **Operations Lead** (execute)
- Les niveaux de severite (**SEV1-SEV4**) determinent la reponse et la communication
- L'astreinte doit etre **saine** : compensee, equitable, avec maximum 2 pages par rotation
- Chaque incident SEV1/SEV2 doit deboucher sur un **postmortem** et des **action items**
:::

---

## Aller plus loin : concepts expert

### Le facteur humain — ce que le SRE Book ne dit pas assez

L'incident management technique est bien documente. Le facteur humain l'est beaucoup moins, et c'est pourtant la premiere cause d'incidents prolonges.

**La fatigue cognitive** : apres 4 heures d'incident, la capacite de decision se degrade de 40% (etude NASA sur les operateurs). Un Incident Commander fatigue prend de mauvaises decisions. La rotation de l'IC toutes les 2-4 heures n'est pas un luxe, c'est une necessite.

```typescript
// Politique de rotation IC basee sur la duree
interface ICRotationPolicy {
  maxDurationMinutes: number;
  warningAtMinutes: number;
  handoffChecklistItems: string[];
}

const icRotation: ICRotationPolicy = {
  maxDurationMinutes: 240,  // 4 heures max
  warningAtMinutes: 180,    // alerte a 3 heures
  handoffChecklistItems: [
    'Briefer le nouvel IC sur le contexte actuel',
    'Partager la timeline a jour',
    'Identifier les actions en cours et leurs proprietaires',
    'Confirmer les canaux de communication',
    'Transmettre les contacts externes (support client, management)',
  ],
};
```

**Le biais de confirmation** : pendant un incident, l'equipe se fixe souvent sur la premiere hypothese et ignore les signaux contradictoires. Le Google SRE Book (Chapitre 12) recommande la technique du "Devil's Advocate" — designer quelqu'un dont le role est de challenger l'hypothese dominante.

**Le silence toxique** : quand personne n'ose dire "je ne comprends pas" ou "cette approche ne marche pas", l'incident dure plus longtemps. La culture blameless commence PENDANT l'incident, pas seulement au postmortem.

### On-call sain : les metriques qui comptent

L'astreinte est le point de contact entre l'humain et le systeme. Une astreinte mal geree brule les equipes :

```typescript
interface OnCallHealthMetrics {
  pagesPerRotation: number;        // Objectif : < 2 par rotation de 7 jours
  falsePositiveRate: number;       // Objectif : < 5%
  timeToAcknowledge: number;       // Objectif : < 5 minutes (p95)
  afterHoursPages: number;         // Pages entre 22h et 7h
  escalationRate: number;          // % de pages escaladees
  meanTimeToMitigate: number;      // Temps moyen de mitigation
  oncallSatisfaction: number;      // Survey score 1-5
}

// Seuils d'alerte sur la sante de l'astreinte
function assessOnCallHealth(metrics: OnCallHealthMetrics): 'healthy' | 'warning' | 'critical' {
  if (metrics.pagesPerRotation > 5) return 'critical';
  if (metrics.falsePositiveRate > 0.20) return 'critical';
  if (metrics.afterHoursPages > 3) return 'warning';
  if (metrics.oncallSatisfaction < 3) return 'warning';
  return 'healthy';
}
```

::: warning
Si votre equipe recoit plus de 2 pages par semaine, le probleme n'est pas l'astreinte — c'est la fiabilite du systeme ou la qualite des alertes. Corrigez la source, pas le symptome. Le Google SRE Workbook (Chapitre 9, "On-Call") fixe un objectif de maximum 2 events par rotation de 12 heures.
:::

### Escalation : l'art de demander de l'aide

Savoir quand escalader est une competence sous-estimee. Escalader trop tard prolonge l'incident. Escalader trop tot surcharge les equipes seniors.

```typescript
interface EscalationCriteria {
  trigger: string;
  timeThreshold: string;
  escalateTo: string;
  communication: string;
}

const escalationMatrix: EscalationCriteria[] = [
  {
    trigger: 'SEV1 non mitige',
    timeThreshold: '15 minutes apres debut',
    escalateTo: 'Engineering Manager + VP Engineering',
    communication: 'Bridge call + Slack #incident',
  },
  {
    trigger: 'SEV1 non resolu',
    timeThreshold: '1 heure apres debut',
    escalateTo: 'CTO + equipes dependantes',
    communication: 'Status page publique + email stakeholders',
  },
  {
    trigger: 'SEV2 non mitige',
    timeThreshold: '30 minutes apres debut',
    escalateTo: 'Tech Lead de l\'equipe',
    communication: 'Slack #incident',
  },
  {
    trigger: 'IC incertain sur la cause',
    timeThreshold: 'A tout moment',
    escalateTo: 'Subject Matter Expert (SME)',
    communication: 'DM + ajout au bridge',
  },
];
```

::: tip Reference SRE
Le Google SRE Book (Chapitre 14, "Managing Incidents") et le Chapitre 29 ("Dealing with Interrupts") sont les references essentielles. Le Workbook (Chapitre 9, "Incident Response") fournit des templates et des exercices concrets. PagerDuty publie egalement un excellent guide open source : https://response.pagerduty.com
:::

---

## Pour aller plus loin

- [Lab 12 — Simulation d'incident](/labs/lab-12-incident-simulation/README)
- [Quiz 12 — Incident Management](/quizzes/quiz-12-incident-management)
- PagerDuty Incident Response Documentation
- Google SRE Book, Chapitre 14 : "Managing Incidents"

# Screencast 12 — Incident Management & On-call

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/12-incident-management.md`
- **Lab associe** : Lab 12
- **Prerequis** : Screencast 11

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Grafana ouvert avec le dashboard RED (`http://localhost:3001`)
- [ ] Prometheus ouvert avec l'onglet Alerts (`http://localhost:9090`)
- [ ] Jaeger ouvert (`http://localhost:16686`)
- [ ] Un document vide pour la timeline de l'incident

## Script

### [00:00-02:30] Introduction

> Les alertes sont configurees. Le burn rate est surveille. Et maintenant, 3h du matin, votre telephone sonne. Que faites-vous ? Un incident, c'est comme un incendie dans un immeuble. Sans plan d'evacuation, c'est la panique. Avec un plan clair, des roles definis et des exercices reguliers, tout le monde sait quoi faire.

> Aujourd'hui, nous allons simuler un incident de bout en bout : detection, triage, communication, mitigation, resolution. Pas de theorie abstraite — on pratique.

### [02:30-05:30] Les roles pendant un incident

**Action** : Ecrire les roles cles.

```typescript
// Les 3 roles essentiels pendant un incident
interface IncidentRoles {
  // Incident Commander (IC) — Le chef d'orchestre
  // - Coordonne les actions
  // - Prend les decisions de priorisation
  // - Declare le debut et la fin de l'incident
  // - N'est PAS necessairement la personne la plus technique
  incidentCommander: string;

  // Communications Lead — Le porte-parole
  // - Redige les communications internes (Slack, email)
  // - Met a jour la page de statut
  // - Communique avec les equipes affectees et les clients
  // - Protege le IC et les Ops du bruit
  communicationsLead: string;

  // Operations Lead — Le pompier technique
  // - Investigue la cause
  // - Execute les actions de mitigation
  // - Documente les actions techniques dans la timeline
  // - Peut demander de l'aide a d'autres ingenieurs
  operationsLead: string;
}

// Regle d'or : le IC ne debug pas.
// Le IC coordonne, l'Ops Lead investigue.
// Confondre les deux roles = chaos.
```

> Dans les petites equipes, une seule personne peut tenir plusieurs roles. Mais la separation mentale reste importante. Quand vous debuggez, vous ne coordonnez pas. Quand vous coordonnez, vous ne debuggez pas.

### [05:30-08:30] Les niveaux de severite

**Action** : Definir les niveaux de severite.

```typescript
type SeverityLevel = 'SEV1' | 'SEV2' | 'SEV3' | 'SEV4';

const severityLevels: Record<SeverityLevel, {
  description: string;
  impact: string;
  response: string;
  example: string;
}> = {
  SEV1: {
    description: 'Incident critique',
    impact: 'Service completement indisponible pour tous les utilisateurs',
    response: 'Toutes mains sur le pont, communication toutes les 15 minutes',
    example: 'La base de donnees principale est down, 100% des requetes echouent',
  },
  SEV2: {
    description: 'Incident majeur',
    impact: 'Fonctionnalite majeure degradee ou indisponible',
    response: 'Equipe d astreinte + escalade Tech Lead, communication toutes les 30 minutes',
    example: 'Le service de paiement est lent (p99 > 5s), 30% des paiements echouent',
  },
  SEV3: {
    description: 'Incident mineur',
    impact: 'Fonctionnalite secondaire affectee, contournement possible',
    response: 'Equipe d astreinte, a traiter en heures ouvrees',
    example: 'Les notifications email ne partent plus, les commandes fonctionnent',
  },
  SEV4: {
    description: 'Anomalie',
    impact: 'Impact minimal, aucune degradation visible pour l utilisateur',
    response: 'Ticket cree, a traiter dans le sprint courant',
    example: 'Un log d erreur intermittent, aucun impact utilisateur mesure',
  },
};
```

> La severite determine la reponse. Un SEV1 a 3h du matin reveille l'equipe. Un SEV4 est un ticket dans le backlog. Mal classifier un incident est un piege courant — un SEV2 traite comme un SEV4 degrade la confiance des utilisateurs.

### [08:30-13:00] Simulation d'incident — Injection de pannes

> Simulons un incident reel. Notre demo-app va commencer a retourner 50% d'erreurs 500.

**Action** : Injecter un taux d'erreur de 50% dans la demo-app.

```bash
# Activer le mode chaos — 50% des requetes retournent une erreur 500
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"errorRate": 0.5, "enabled": true}'
```

**Action** : Generer du trafic continu.

```bash
# Trafic continu pour declencher les alertes
while true; do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
  sleep 0.1
done
```

**Action** : Observer l'alerte se declencher dans Prometheus.

> Regardez le dashboard RED dans Grafana. Le taux d'erreur grimpe a 50%. Le burn rate explose. L'alerte `HighErrorBudgetBurn_Page_Fast` passe en firing. C'est le moment de la detection.

### [13:00-17:00] Workflow de reponse a l'incident

**Action** : Declarer l'incident et commencer la timeline.

```typescript
// Timeline de l'incident
const incidentTimeline = [
  { time: '03:00', action: 'Alerte recue : HighErrorBudgetBurn_Page_Fast firing', role: 'system' },
  { time: '03:02', action: 'IC declare l incident SEV2 dans #incidents', role: 'IC' },
  { time: '03:03', action: 'Comms Lead poste le premier message de statut', role: 'Comms' },
  { time: '03:05', action: 'Ops Lead ouvre le dashboard RED — error rate a 50%', role: 'Ops' },
  { time: '03:07', action: 'Ops Lead verifie les derniers deployments — aucun', role: 'Ops' },
  { time: '03:10', action: 'Ops Lead ouvre Jaeger — les erreurs viennent du service orders', role: 'Ops' },
  { time: '03:12', action: 'Ops Lead consulte les logs — erreur "connection refused" vers DB', role: 'Ops' },
  { time: '03:15', action: 'IC communique : "Cause identifiee, mitigation en cours"', role: 'IC' },
];
```

> Chaque action est horodatee et attribuee a un role. Cette timeline sera la base du postmortem.

**Action** : Pratiquer le triage dans Grafana, Jaeger et les logs.

> L'Ops Lead suit le workflow RED → USE → Traces → Logs. Le dashboard RED montre un error rate a 50%. Les traces dans Jaeger montrent que les spans en erreur viennent de la route `/api/orders`. Les logs revelent le message d'erreur precis.

### [17:00-20:00] Mitigation et decision d'escalade

**Action** : Mitiger l'incident en desactivant le chaos.

```bash
# Desactiver le mode chaos
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"errorRate": 0, "enabled": false}'
```

**Action** : Observer le retour a la normale dans Grafana.

> Le taux d'erreur redescend a 0%. Les alertes passent de "firing" a "resolved". Le service est retabli.

**Action** : Documenter la decision d'escalade.

```typescript
// Arbre de decision d'escalade
const escalationDecision = {
  // Quand escalader ?
  criteria: [
    'Pas de progres dans les 15 premieres minutes',
    'La cause racine est dans un systeme que l equipe ne maitrise pas',
    'L impact s etend a d autres services',
    'Le IC a besoin de plus de personnes pour investiguer en parallele',
  ],

  // A qui escalader ?
  levels: [
    { level: 1, who: 'Tech Lead d astreinte', when: 'Pas de progres apres 15 min' },
    { level: 2, who: 'Engineering Manager', when: 'Impact client majeur, communication C-level necessaire' },
    { level: 3, who: 'VP Engineering', when: 'SEV1 affectant les revenus ou la reputation' },
  ],
};
```

> Escalader n'est pas un echec. Ne pas escalader quand c'est necessaire, ca c'est un echec. L'IC doit avoir l'autorite et la confiance pour escalader sans hesitation.

### [20:00-22:30] Communication pendant l'incident

**Action** : Montrer les templates de communication.

```typescript
// Template de premier message (T+2 minutes)
const firstMessage = `
🔴 INCIDENT DECLARE — SEV2
Service: demo-app
Impact: 50% des requetes API retournent des erreurs 500
Detection: Alerte burn rate 14.4x
IC: @alice
Ops Lead: @bob
Comms Lead: @charlie
Prochain update: dans 15 minutes
`;

// Template de mise a jour (toutes les 15 minutes pour SEV2)
const updateMessage = `
🟡 UPDATE — SEV2 demo-app (T+15 min)
Statut: Cause identifiee, mitigation en cours
Detail: Erreur de connexion a la base de donnees
Action: Rollback du deployment en cours
ETA retablissement: 10 minutes
Prochain update: dans 15 minutes
`;

// Template de resolution
const resolutionMessage = `
🟢 RESOLU — SEV2 demo-app (Duree totale: 25 min)
Le service est retabli. Error rate revenu a 0%.
Cause: Mode chaos active par erreur
Mitigation: Desactivation du mode chaos
Postmortem prevu: demain 10h
`;
```

> Les communications suivent un rythme regulier : toutes les 15 minutes pour un SEV2, toutes les 30 minutes pour un SEV3. Le Comms Lead protege le IC et l'Ops Lead du bruit — les questions des stakeholders sont dirigees vers un seul canal.

### [22:30-24:00] Recapitulatif

> Recapitulons. Un incident suit cinq phases : detection, triage, mitigation, resolution, post-incident. Les trois roles cles sont le IC (coordonne), le Comms Lead (communique) et l'Ops Lead (investigue). La severite determine la reponse. Le workflow de triage suit la cascade RED → USE → Traces → Logs.

> La communication est aussi importante que la resolution technique. Un incident bien communique reduit le stress de toute l'organisation. L'escalade n'est pas un echec, c'est un outil.

> Dans le prochain module, nous ecrirons le postmortem de cet incident. Faites le Lab 12 pour pratiquer la simulation !

**Action** : Arreter le script de trafic avec Ctrl+C.

## Points d'attention pour l'enregistrement
- La simulation d'incident doit etre realiste — jouer les roles meme si on est seul
- Montrer l'alerte qui passe de inactive → pending → firing en temps reel
- Le workflow RED → USE → Traces → Logs doit etre montre en action, pas juste en theorie
- Les templates de communication sont des livrables concrets — les montrer complets
- L'arbre de decision d'escalade est un point cle — insister sur "escalader n'est pas un echec"
- La timeline de l'incident est la base du postmortem du module 13
- S'assurer que le mode chaos peut etre active/desactive facilement dans la demo-app
- Garder la timeline affichee pendant toute la simulation pour montrer le deroulement

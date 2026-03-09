# Screencast 13 — Postmortems & Culture Blameless

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/13-postmortems.md`
- **Lab associe** : Lab 13
- **Prerequis** : Screencast 12

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] La timeline de l'incident simule dans le screencast 12 ouverte
- [ ] Un fichier vide pret pour rediger le postmortem
- [ ] Un fichier ou tableau blanc pour dessiner le diagramme d'Ishikawa

## Script

### [00:00-02:30] Introduction

> Dans le module precedent, nous avons simule un incident et documente une timeline. Maintenant, c'est l'heure du postmortem. Un postmortem n'est pas un rapport disciplinaire — c'est un outil d'apprentissage. L'analogie : les pilotes d'avion ne cachent jamais un incident de vol. Chaque evenement est analyse, documente et partage avec toute l'industrie aeronautique. Resultat : l'avion est le moyen de transport le plus sur au monde.

> Nous allons rediger un postmortem complet de l'incident simule, appliquer la technique des 5 Whys, dessiner un diagramme d'Ishikawa, et ecrire des action items SMART.

### [02:30-06:00] Structure du postmortem

**Action** : Creer le document de postmortem.

```typescript
// Structure du postmortem
interface Postmortem {
  // --- En-tete ---
  title: string;
  date: string;
  authors: string[];
  severity: 'SEV1' | 'SEV2' | 'SEV3';
  status: 'draft' | 'review' | 'approved' | 'published';
  duration: string;

  // --- Resume executif ---
  summary: string;       // 2-3 phrases pour un VP qui a 30 secondes
  impact: {
    usersAffected: string;
    errorRate: string;
    duration: string;
    revenueImpact?: string;
  };

  // --- Timeline ---
  timeline: Array<{ time: string; event: string; role: string }>;

  // --- Analyse de cause racine ---
  rootCause: string;
  contributingFactors: string[];

  // --- Action items ---
  actionItems: Array<{
    description: string;
    owner: string;
    priority: 'P0' | 'P1' | 'P2';
    deadline: string;
    status: 'todo' | 'in-progress' | 'done';
  }>;

  // --- Lecons apprises ---
  lessonsLearned: {
    whatWentWell: string[];
    whatWentWrong: string[];
    whereWeGotLucky: string[];
  };
}
```

> La section "Resume executif" est cruciale. Votre VP d'engineering lira les 3 premieres lignes. S'il doit lire 5 pages pour comprendre l'impact, le postmortem est mal ecrit.

### [06:00-10:00] Rediger le postmortem de l'incident simule

**Action** : Remplir le postmortem a partir de la timeline du screencast 12.

```typescript
const postmortem: Postmortem = {
  title: 'SEV2 — 50% d erreurs 500 sur demo-app pendant 25 minutes',
  date: '2024-01-15',
  authors: ['Alice (IC)', 'Bob (Ops Lead)'],
  severity: 'SEV2',
  status: 'draft',
  duration: '25 minutes (03:00 - 03:25)',

  summary: `Le 15 janvier a 03:00, la demo-app a commence a retourner
    des erreurs 500 pour 50% des requetes. L'incident a ete detecte par
    l'alerte burn rate et resolu en 25 minutes par la desactivation du
    mode chaos active par erreur.`,

  impact: {
    usersAffected: 'Environ 50% des requetes API affectees',
    errorRate: '50% pendant 25 minutes',
    duration: '25 minutes',
    revenueImpact: 'Estimation : 15% des commandes echouees sur la periode',
  },

  timeline: [
    { time: '03:00', event: 'Alerte HighErrorBudgetBurn_Page_Fast firing', role: 'Systeme' },
    { time: '03:02', event: 'IC declare incident SEV2', role: 'IC' },
    { time: '03:05', event: 'Dashboard RED : error rate 50%', role: 'Ops Lead' },
    { time: '03:10', event: 'Traces Jaeger : erreurs sur /api/orders', role: 'Ops Lead' },
    { time: '03:15', event: 'Cause identifiee : mode chaos actif', role: 'Ops Lead' },
    { time: '03:20', event: 'Mitigation : mode chaos desactive', role: 'Ops Lead' },
    { time: '03:25', event: 'Error rate revenu a 0%, incident clos', role: 'IC' },
  ],

  rootCause: 'Le mode chaos a ete active manuellement sans etre desactive apres un test.',

  contributingFactors: [
    'Pas de protection sur l endpoint /admin/chaos (pas d authentification)',
    'Pas d expiration automatique du mode chaos',
    'Pas de monitoring specifique sur l etat du mode chaos',
  ],

  actionItems: [], // Rempli dans la section suivante

  lessonsLearned: {
    whatWentWell: [
      'L alerte burn rate a detecte le probleme en moins de 2 minutes',
      'Le workflow de triage RED → Traces → Logs a permis d identifier la cause en 10 minutes',
      'La communication a ete reguliere et claire',
    ],
    whatWentWrong: [
      'L endpoint chaos n a pas d authentification',
      'Le mode chaos n a pas d expiration automatique',
      'La personne qui a active le chaos n a pas prevenu l equipe',
    ],
    whereWeGotLucky: [
      'L incident s est produit avec peu de trafic utilisateur reel',
      'L Ops Lead connaissait le mode chaos et l a identifie rapidement',
    ],
  },
};
```

> La section "Where we got lucky" est souvent oubliee mais tres revelante. Elle montre les risques qui ne se sont pas concretises cette fois mais qui pourraient la prochaine.

### [10:00-14:00] Technique des 5 Whys

> Les 5 Whys est une technique d'analyse de cause racine inventee par Toyota. On pose la question "pourquoi ?" cinq fois de suite pour remonter a la cause profonde.

**Action** : Appliquer les 5 Whys a notre incident.

```typescript
// 5 Whys pour notre incident
const fiveWhys = [
  {
    why: 'Pourquoi le service retournait-il 50% d erreurs ?',
    answer: 'Parce que le mode chaos etait active avec un errorRate de 50%.',
  },
  {
    why: 'Pourquoi le mode chaos etait-il active ?',
    answer: 'Parce qu un ingenieur l avait active pour un test et a oublie de le desactiver.',
  },
  {
    why: 'Pourquoi l ingenieur a-t-il oublie de le desactiver ?',
    answer: 'Parce qu il n y a pas d expiration automatique ni de rappel.',
  },
  {
    why: 'Pourquoi n y a-t-il pas d expiration automatique ?',
    answer: 'Parce que le mode chaos a ete implemente comme un prototype sans garde-fous.',
  },
  {
    why: 'Pourquoi le prototype a-t-il ete deploye en production sans garde-fous ?',
    answer: 'Parce qu il n y a pas de checklist de revue pour les outils internes avant deploiement.',
  },
];

// Cause racine profonde : absence de processus de revue
// pour les outils internes avant deploiement en production.
```

> Remarquez comment chaque "pourquoi" nous eloigne du symptome (erreurs 500) et nous rapproche de la cause systemique (absence de processus). C'est la force des 5 Whys — on ne s'arrete pas a la premiere reponse evidente.

### [14:00-17:00] Diagramme d'Ishikawa (arete de poisson)

> Le diagramme d'Ishikawa organise les causes contributives en categories. C'est complementaire aux 5 Whys — les 5 Whys creusent en profondeur, Ishikawa explore en largeur.

**Action** : Dessiner le diagramme d'Ishikawa.

```
                                ┌───────────────────────┐
                                │  50% erreurs 500      │
                                │  pendant 25 min       │
                                └──────────┬────────────┘
                                           │
     ┌─────────────────────────────────────┼─────────────────────────────────────┐
     │                                     │                                     │
 Processus                             Technique                           Humain
     │                                     │                                     │
 - Pas de revue                    - Pas d'expiration              - Oubli de desactiver
   pour outils internes              automatique du chaos            le mode chaos
 - Pas de checklist                - Pas d'auth sur                - Pas de communication
   pre-deploiement                   /admin/chaos                    a l'equipe
 - Pas de documentation            - Pas de monitoring
   du mode chaos                     de l'etat chaos
```

> Les six categories classiques d'Ishikawa sont : Methode, Machine, Main-d'oeuvre, Materiau, Milieu, Mesure. Pour le logiciel, on utilise souvent : Processus, Technique, Humain, Monitoring, Communication, Outillage.

### [17:00-21:00] Action items SMART

> Les action items sont le delivrable le plus important du postmortem. Sans actions concretes, le postmortem est un exercice acadamique. Un bon action item est SMART : Specifique, Mesurable, Attribuable, Realiste, Temporel.

**Action** : Ecrire les action items.

```typescript
const actionItems = [
  {
    // SMART : Specifique + Mesurable + Attribuable + Realiste + Temporel
    description: 'Ajouter une expiration automatique de 30 minutes au mode chaos',
    owner: 'Bob',
    priority: 'P0' as const,
    deadline: '2024-01-22',    // 1 semaine
    status: 'todo' as const,
    // Test : verifier que le mode chaos se desactive apres 30 min
  },
  {
    description: 'Ajouter une authentification sur l endpoint /admin/chaos',
    owner: 'Alice',
    priority: 'P0' as const,
    deadline: '2024-01-22',
    status: 'todo' as const,
  },
  {
    description: 'Ajouter une metrique Prometheus pour l etat du mode chaos (gauge 0/1)',
    owner: 'Bob',
    priority: 'P1' as const,
    deadline: '2024-01-29',
    status: 'todo' as const,
  },
  {
    description: 'Creer une checklist de revue pour tout outil interne avant deploiement',
    owner: 'Charlie',
    priority: 'P1' as const,
    deadline: '2024-02-05',
    status: 'todo' as const,
  },
  {
    description: 'Documenter le mode chaos dans le wiki interne avec les precautions d usage',
    owner: 'Alice',
    priority: 'P2' as const,
    deadline: '2024-02-12',
    status: 'todo' as const,
  },
];

// MAUVAIS action items (a eviter)
const badActionItems = [
  'Faire attention la prochaine fois',        // Pas specifique, pas mesurable
  'Ameliorer la fiabilite',                    // Trop vague
  'Revoir le code',                            // Pas d owner, pas de deadline
  'Ne plus faire d erreurs',                   // Irrealiste
];
```

> Comparez les bons et les mauvais action items. "Faire attention la prochaine fois" n'est pas actionnable. "Ajouter une expiration automatique de 30 minutes au mode chaos, par Bob, avant le 22 janvier" — ca, c'est actionnable.

### [21:00-23:30] Culture blameless

> Le postmortem ne mentionne jamais de nom dans un contexte negatif. On dit "le mode chaos a ete active" pas "Jean a active le mode chaos et a oublie de le desactiver". Pourquoi ? Parce que blamer les individus empeche l'apprentissage. Si les gens ont peur d'etre punis, ils cachent les erreurs au lieu de les partager.

```typescript
// Principes de la culture blameless
const blamelessPrinciples = [
  // 1. Les humains font des erreurs — c'est normal
  'Si un humain peut faire une erreur, le systeme doit empecher cette erreur ou limiter son impact.',

  // 2. Chercher les causes systemiques, pas les coupables
  'Le "pourquoi" est toujours plus utile que le "qui".',

  // 3. Partager ouvertement
  'Publier les postmortems a toute l equipe/organisation pour que tout le monde apprenne.',

  // 4. Pas de consequences negatives pour le rapporteur
  'La personne qui detecte ou cause un incident et le rapporte rapidement rend service a l equipe.',

  // 5. Mesurer l amelioration
  'Suivre le taux de completion des action items et les recurrences d incidents similaires.',
];
```

> La culture blameless ne signifie pas l'absence de responsabilite. Les action items ont des owners et des deadlines. Mais la responsabilite est tournee vers l'avenir (que changeons-nous), pas vers le passe (a qui la faute).

### [23:30-24:30] Recapitulatif

> Recapitulons. Le postmortem est un outil d'apprentissage, pas de punition. Il comprend un resume executif, une timeline, une analyse de cause racine, des action items SMART et des lecons apprises. Les 5 Whys creusent en profondeur. L'Ishikawa explore en largeur. Les action items doivent etre SMART — pas de "faire attention la prochaine fois".

> La culture blameless est le fondement : chercher les causes systemiques, pas les coupables. Partager ouvertement pour que toute l'organisation apprenne.

> Dans le prochain module, nous abordons le capacity planning et les tests de charge avec k6. Faites le Lab 13 pour rediger votre propre postmortem !

## Points d'attention pour l'enregistrement
- Reutiliser la timeline reelle du screencast 12 pour ancrer le postmortem dans le concret
- La technique des 5 Whys doit etre deroulee lentement — chaque "pourquoi" merite une pause
- Le diagramme d'Ishikawa peut etre dessine sur un tableau blanc ou dans un outil de dessin
- Comparer les bons et les mauvais action items cote a cote est tres pedagogique
- La culture blameless est un sujet sensible — insister sur la distinction entre responsabilite et blame
- Le resume executif doit etre redige en dernier mais presente en premier
- Montrer que "where we got lucky" est une section revelante et souvent oubliee

# SLIs, SLOs, SLAs & Error Budgets

## Objectifs pedagogiques

- Comprendre la difference fondamentale entre SLI, SLO et SLA
- Savoir choisir les bons SLIs pour un service donne
- Definir des SLOs realistes et mesurables
- Calculer et exploiter un error budget
- Implementer des mesures de SLO en TypeScript et PromQL
- Comprendre le concept de rolling window et de composite SLO

---

## Introduction : pourquoi mesurer la fiabilite ?

Imaginez que vous gerez un restaurant. Vous ne dites pas simplement "la nourriture est bonne". Vous mesurez des indicateurs precis : temps d'attente moyen, taux de satisfaction client, nombre de plats renvoyes en cuisine. C'est exactement ce que font les SLIs, SLOs et SLAs pour vos services numeriques.

Sans ces concepts, les equipes tombent dans deux pieges :
1. **Sur-ingenierie** : viser 100% de disponibilite (impossible et ruineux)
2. **Sous-ingenierie** : ne pas savoir quand la qualite se degrade

Le framework SLI/SLO/SLA, popularise par le livre **Google SRE**, fournit un langage commun entre equipes produit, developpement et operations.

---

## SLI — Service Level Indicator

### Definition

Un **SLI** (Service Level Indicator) est une **mesure quantitative** d'un aspect du service tel que percu par l'utilisateur. C'est la reponse a la question : **"Que mesurons-nous ?"**

### Caracteristiques d'un bon SLI

- Mesure quelque chose que **l'utilisateur ressent directement**
- Exprime en **ratio** (entre 0 et 1, ou 0% et 100%)
- Formule generique :

```
SLI = (nombre d'evenements "bons") / (nombre total d'evenements)
```

### Les quatre types de SLI

#### 1. Disponibilite (Availability)

Proportion de requetes qui reussissent :

```
SLI_availability = requetes_succes / requetes_totales
```

```typescript
interface AvailabilitySLI {
  totalRequests: number;
  successfulRequests: number; // status < 500

  compute(): number {
    return this.successfulRequests / this.totalRequests;
  }
}

// Exemple concret
const sli: AvailabilitySLI = {
  totalRequests: 100_000,
  successfulRequests: 99_850,
  compute() {
    return this.successfulRequests / this.totalRequests;
  },
};

console.log(`Availability SLI: ${(sli.compute() * 100).toFixed(3)}%`);
// Availability SLI: 99.850%
```

#### 2. Latence (Latency)

Proportion de requetes plus rapides qu'un seuil :

```
SLI_latency = requetes_sous_seuil / requetes_totales
```

```typescript
interface LatencySLI {
  thresholdMs: number;
  totalRequests: number;
  requestsBelowThreshold: number;

  compute(): number {
    return this.requestsBelowThreshold / this.totalRequests;
  }
}

// 95% des requetes doivent repondre en moins de 300ms
const latencySli: LatencySLI = {
  thresholdMs: 300,
  totalRequests: 100_000,
  requestsBelowThreshold: 97_200,
  compute() {
    return this.requestsBelowThreshold / this.totalRequests;
  },
};

console.log(`Latency SLI (p300ms): ${(latencySli.compute() * 100).toFixed(2)}%`);
// Latency SLI (p300ms): 97.20%
```

#### 3. Throughput (Debit)

Proportion du debit traite par rapport a la capacite attendue :

```
SLI_throughput = requetes_traitees / requetes_attendues
```

#### 4. Correctness (Exactitude)

Proportion de reponses qui retournent le bon resultat :

```
SLI_correctness = reponses_correctes / reponses_totales
```

---

## SLO — Service Level Objective

### Definition

Un **SLO** (Service Level Objective) est un **objectif cible** pour un SLI. C'est la reponse a la question : **"Quel niveau visons-nous ?"**

```
SLO : SLI >= cible sur une fenetre de temps donnee
```

### Exemples de SLOs

| Service | SLI | SLO |
|---------|-----|-----|
| API REST | Disponibilite | 99.9% sur 30 jours |
| Page d'accueil | Latence (p99) < 200ms | 99.5% sur 30 jours |
| Pipeline de paiement | Exactitude | 99.99% sur 30 jours |
| API de recherche | Latence (p50) < 100ms | 99% sur 7 jours |

### Comment choisir un SLO ?

```typescript
interface SLODefinition {
  name: string;
  sliType: 'availability' | 'latency' | 'throughput' | 'correctness';
  target: number; // entre 0 et 1
  windowDays: number;
  description: string;
}

const slos: SLODefinition[] = [
  {
    name: 'api-availability',
    sliType: 'availability',
    target: 0.999, // 99.9%
    windowDays: 30,
    description: '99.9% des requetes API retournent un status < 500',
  },
  {
    name: 'api-latency-p99',
    sliType: 'latency',
    target: 0.995, // 99.5%
    windowDays: 30,
    description: '99.5% des requetes API repondent en moins de 300ms',
  },
];
```

::: warning Piege courant
Ne visez jamais 100%. Un SLO de 100% signifie que vous ne pouvez **jamais** deployer, car tout changement comporte un risque. Meme Google ne vise que 99.99% pour ses services les plus critiques.
:::

### Rolling Window (fenetre glissante)

Plutot qu'un mois calendaire, on utilise generalement une **fenetre glissante de 30 jours**. Avantage : pas de "remise a zero" le 1er du mois qui encouragerait des prises de risque.

```typescript
function computeRollingSLI(
  events: Array<{ timestamp: Date; success: boolean }>,
  windowDays: number,
): number {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const eventsInWindow = events.filter((e) => e.timestamp >= windowStart);
  const goodEvents = eventsInWindow.filter((e) => e.success);

  if (eventsInWindow.length === 0) return 1; // Pas de donnees = pas d'erreur

  return goodEvents.length / eventsInWindow.length;
}
```

---

## SLA — Service Level Agreement

### Definition

Un **SLA** (Service Level Agreement) est un **contrat** entre un fournisseur et un client. Il definit les **consequences** (financieres ou autres) si les SLOs ne sont pas respectes.

### SLA vs SLO

| Aspect | SLO | SLA |
|--------|-----|-----|
| Nature | Objectif interne | Contrat externe |
| Consequence | Declenchement d'actions internes | Penalites financieres |
| Cible | Generalement plus stricte | Generalement plus souple |
| Public | Equipes d'ingenierie | Clients, juridique |

::: tip Regle d'or
Le SLO interne doit **toujours** etre plus strict que le SLA externe. Si votre SLA promet 99.9%, votre SLO interne devrait etre a 99.95%. Cela vous donne une marge de manoeuvre avant de violer le contrat.
:::

### Exemple de structure SLA

```typescript
interface SLAContract {
  service: string;
  sloTarget: number;
  slaTarget: number;
  penalties: Array<{
    threshold: number;
    compensation: string;
  }>;
}

const sla: SLAContract = {
  service: 'API de paiement',
  sloTarget: 0.9995, // Objectif interne : 99.95%
  slaTarget: 0.999,  // Contrat client : 99.9%
  penalties: [
    { threshold: 0.999, compensation: '10% de credit' },
    { threshold: 0.995, compensation: '25% de credit' },
    { threshold: 0.990, compensation: '50% de credit' },
  ],
};
```

---

## Error Budget — Le concept cle

### Definition

L'**error budget** est la quantite d'erreurs que vous **pouvez vous permettre** avant de violer votre SLO. C'est la difference entre la perfection (100%) et votre SLO.

```
Error Budget = 1 - SLO target
```

### Calcul pratique

```typescript
interface ErrorBudget {
  sloTarget: number;
  windowDays: number;
  totalRequests: number;

  budgetRatio(): number;
  budgetRequests(): number;
  budgetMinutes(): number;
}

function createErrorBudget(
  sloTarget: number,
  windowDays: number,
  totalRequests: number,
): ErrorBudget {
  return {
    sloTarget,
    windowDays,
    totalRequests,

    // Budget en ratio
    budgetRatio() {
      return 1 - this.sloTarget;
    },

    // Budget en nombre de requetes echouees autorisees
    budgetRequests() {
      return Math.floor(this.totalRequests * this.budgetRatio());
    },

    // Budget en minutes d'indisponibilite
    budgetMinutes() {
      return this.windowDays * 24 * 60 * this.budgetRatio();
    },
  };
}

// SLO de 99.9% sur 30 jours, 1M de requetes
const budget = createErrorBudget(0.999, 30, 1_000_000);

console.log(`Error budget ratio: ${(budget.budgetRatio() * 100).toFixed(2)}%`);
// Error budget ratio: 0.10%

console.log(`Requetes echouees autorisees: ${budget.budgetRequests()}`);
// Requetes echouees autorisees: 1000

console.log(`Minutes d'indisponibilite autorisees: ${budget.budgetMinutes().toFixed(1)}`);
// Minutes d'indisponibilite autorisees: 43.2
```

### Tableau de reference

| SLO | Error Budget (30j) | Indisponibilite autorisee |
|-----|--------------------|-----------------------------|
| 99% | 1% | 7h 12min |
| 99.5% | 0.5% | 3h 36min |
| 99.9% | 0.1% | 43min 12s |
| 99.95% | 0.05% | 21min 36s |
| 99.99% | 0.01% | 4min 19s |

### Analogie du portefeuille

Pensez a l'error budget comme un portefeuille mensuel. Chaque incident "depense" une partie du budget. Quand le portefeuille est vide, vous devez arreter de depenser (geler les deployments, investir dans la fiabilite).

---

## Error Budget Policy

### Que faire quand le budget est epuise ?

Une **error budget policy** definit les actions a prendre selon le niveau de consommation du budget :

```typescript
type BudgetAction =
  | 'normal_operations'
  | 'increased_review'
  | 'feature_freeze'
  | 'reliability_sprint';

interface ErrorBudgetPolicy {
  evaluate(consumedPercent: number): BudgetAction;
}

const policy: ErrorBudgetPolicy = {
  evaluate(consumedPercent: number): BudgetAction {
    if (consumedPercent < 50) {
      return 'normal_operations';
    } else if (consumedPercent < 75) {
      return 'increased_review';
    } else if (consumedPercent < 100) {
      return 'feature_freeze';
    } else {
      return 'reliability_sprint';
    }
  },
};

// Exemples
console.log(policy.evaluate(30));  // 'normal_operations'
console.log(policy.evaluate(60));  // 'increased_review'
console.log(policy.evaluate(85));  // 'feature_freeze'
console.log(policy.evaluate(110)); // 'reliability_sprint'
```

### Actions par niveau

| Consommation | Action | Description |
|-------------|--------|-------------|
| 0-50% | Operations normales | Deploiements libres |
| 50-75% | Revue renforcee | Revue de code plus stricte, tests supplementaires |
| 75-100% | Gel des features | Seuls les correctifs et ameliorations de fiabilite |
| >100% | Sprint fiabilite | Toute l'equipe se concentre sur la stabilite |

---

## Composite SLOs

Quand un parcours utilisateur traverse **plusieurs services**, on utilise un composite SLO :

```typescript
interface CompositeSLO {
  name: string;
  components: Array<{
    service: string;
    sloTarget: number;
    weight: number; // importance relative
  }>;

  computeComposite(): number;
}

const checkoutSLO: CompositeSLO = {
  name: 'checkout-journey',
  components: [
    { service: 'api-gateway', sloTarget: 0.999, weight: 0.3 },
    { service: 'payment-service', sloTarget: 0.9999, weight: 0.5 },
    { service: 'notification-service', sloTarget: 0.995, weight: 0.2 },
  ],

  computeComposite(): number {
    // Methode pessimiste : produit des SLOs individuels
    // (si les services sont en serie)
    return this.components.reduce((acc, c) => acc * c.sloTarget, 1);
  },
};

console.log(
  `Composite SLO: ${(checkoutSLO.computeComposite() * 100).toFixed(4)}%`,
);
// Composite SLO: 99.8901% (le maillon faible tire le tout vers le bas)
```

::: warning Attention
En architecture distribuee, les SLOs individuels se **multiplient**. 3 services a 99.9% chacun donnent un SLO composite d'environ 99.7%. C'est pourquoi les micro-services critiques doivent avoir des SLOs tres eleves.
:::

---

## Implementer la mesure en PromQL

### SLI de disponibilite

```promql
# SLI : ratio de requetes reussies (status != 5xx) sur 30 jours
sum(rate(http_requests_total{status!~"5.."}[30d]))
/
sum(rate(http_requests_total[30d]))
```

### SLI de latence

```promql
# SLI : ratio de requetes sous 300ms sur 30 jours
sum(rate(http_request_duration_seconds_bucket{le="0.3"}[30d]))
/
sum(rate(http_request_duration_seconds_count[30d]))
```

### Consommation de l'error budget

```promql
# Error budget restant (1 = 100% restant, 0 = epuise)
1 - (
  (
    1 - (
      sum(rate(http_requests_total{status!~"5.."}[30d]))
      /
      sum(rate(http_requests_total[30d]))
    )
  )
  /
  (1 - 0.999)  # 0.999 = SLO target
)
```

### Implementation TypeScript d'un SLO tracker

```typescript
interface SLOTracker {
  name: string;
  target: number;
  windowMs: number;
  events: Array<{ timestamp: number; good: boolean }>;

  record(good: boolean): void;
  currentSLI(): number;
  errorBudgetRemaining(): number;
  isHealthy(): boolean;
}

function createSLOTracker(name: string, target: number, windowDays: number): SLOTracker {
  return {
    name,
    target,
    windowMs: windowDays * 24 * 60 * 60 * 1000,
    events: [],

    record(good: boolean) {
      this.events.push({ timestamp: Date.now(), good });
      // Nettoyer les evenements hors fenetre
      const cutoff = Date.now() - this.windowMs;
      this.events = this.events.filter((e) => e.timestamp >= cutoff);
    },

    currentSLI(): number {
      if (this.events.length === 0) return 1;
      const goodCount = this.events.filter((e) => e.good).length;
      return goodCount / this.events.length;
    },

    errorBudgetRemaining(): number {
      const budgetTotal = 1 - this.target;
      const consumed = 1 - this.currentSLI();
      return Math.max(0, 1 - consumed / budgetTotal);
    },

    isHealthy(): boolean {
      return this.currentSLI() >= this.target;
    },
  };
}

// Utilisation
const tracker = createSLOTracker('api-availability', 0.999, 30);

// Simuler du trafic
for (let i = 0; i < 10000; i++) {
  tracker.record(Math.random() > 0.0008); // ~0.08% d'erreurs
}

console.log(`SLI actuel: ${(tracker.currentSLI() * 100).toFixed(3)}%`);
console.log(`Budget restant: ${(tracker.errorBudgetRemaining() * 100).toFixed(1)}%`);
console.log(`SLO respecte: ${tracker.isHealthy()}`);
```

---

## Bonnes pratiques

1. **Commencez simple** : un SLO de disponibilite et un de latence suffisent pour debuter
2. **Mesurez du point de vue utilisateur** : les metriques internes ne sont pas des SLIs
3. **Revisez regulierement** : les SLOs doivent evoluer avec le produit (trimestriellement)
4. **Documentez les decisions** : pourquoi ce seuil ? pourquoi cette fenetre ?
5. **Impliquez le produit** : les SLOs sont une decision business, pas seulement technique
6. **Utilisez les error budgets** : ne les calculez pas juste pour les afficher, agissez dessus
7. **Evitez les vanity SLOs** : un SLO que vous n'avez jamais risque de violer est inutile
8. **Preferez les rolling windows** : evitez les fenetres calendaires qui encouragent les comportements risques en fin de periode

---

::: tip A retenir
- **SLI** = ce que vous mesurez (ratio d'evenements bons / total)
- **SLO** = l'objectif que vous visez pour ce SLI (ex: 99.9%)
- **SLA** = le contrat avec consequences si l'objectif n'est pas atteint
- **Error Budget** = 1 - SLO (la marge d'erreur autorisee)
- L'error budget est un **outil de negociation** entre vitesse et fiabilite
- Ne visez **jamais 100%** : c'est impossible, couteux, et contre-productif
- Les SLOs sont une **decision business** : impliquez produit et stakeholders
:::

---

## Pour aller plus loin

- [Lab 10 — Definir des SLOs pour la demo-app](/labs/lab-10-definir-slos/README)
- [Quiz 10 — SLI, SLO, SLA & Error Budgets](/quizzes/quiz-10-sli-slo-sla)
- Google SRE Book, Chapitre 4 : "Service Level Objectives"
- Google SRE Workbook, Chapitre 2 : "Implementing SLOs"

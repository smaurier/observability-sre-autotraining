# Chaos Engineering

## Objectifs pedagogiques

- Comprendre les principes fondamentaux du chaos engineering
- Connaître l'histoire et les origines (Netflix, Chaos Monkey)
- Formuler une hypothese d'état stable (steady state hypothesis)
- Concevoir et exécuter des experiences de chaos
- Implementer un chaos middleware en TypeScript/Express
- Appliquer le pattern circuit breaker
- Maîtriser le controle du blast radius
- Connaître le modèle de maturite en chaos engineering

---

<details>
<summary>Rappel du module précédent</summary>

1. **Qu'est-ce que le capacity planning et pourquoi est-il lie a l'observabilite ?**
   Le capacity planning consiste a prevoir les ressources necessaires (CPU, memoire, replicas) pour supporter la charge future. Il s'appuie sur les metriques collectees par Prometheus et les resultats de tests de charge pour dimensionner l'infrastructure avant que les limites ne soient atteintes.

2. **Comment un test de charge (load test) aide-t-il a planifier la capacite ?**
   Un test de charge (avec k6, par exemple) simule du trafic croissant pour identifier le point de rupture du service : a quel niveau de requetes par seconde la latence se degrade ou les erreurs apparaissent. Cela permet de definir les seuils de scaling et les limites de ressources Kubernetes.

3. **Quelle est la difference entre scaling vertical et horizontal ?**
   Le scaling vertical consiste a augmenter les ressources d'une instance (plus de CPU/RAM). Le scaling horizontal consiste a ajouter des instances (plus de replicas). Le scaling horizontal est prefere en cloud car il est plus resilient (pas de single point of failure) et peut etre automatise via un HPA Kubernetes.

</details>

---

## Introduction : casser pour mieux construire

Les pompiers allument des feux controles pour empecher les mega-incendies. Les pilotes s'entrainent aux pannes moteur dans des simulateurs. Le chaos engineering applique la même logique a vos systèmes : **provoquer des pannes controlees en production pour découvrir les faiblesses avant que vos utilisateurs ne les decouvrent pour vous**.

Le chaos engineering n'est pas du sabotage. C'est une discipline scientifique rigoureuse basee sur des hypotheses, des experiences controlees et une analyse methodique des résultats.

---

## Origines : Netflix et le Chaos Monkey

### L'histoire

En 2010, Netflix migre vers AWS. Le cloud apporte de la flexibilite mais aussi de l'incertitude : les instances peuvent disparaitre a tout moment. Plutot que d'esperer que ça n'arrive pas, Netflix decide de **provoquer** ces pannes deliberement.

Ainsi nait **Chaos Monkey** : un programme qui arrete aleatoirement des instances en production pendant les heures de bureau. L'objectif est simple : si un service ne survit pas à la perte d'une instance, il faut le corriger **maintenant**, pas a 3h du matin quand AWS decide de la recycler.

### La famille Simian Army

```typescript
interface ChaosExperiment {
  name: string;
  description: string;
  faultType: string;
  scope: 'instance' | 'service' | 'region' | 'global';
  risk: 'low' | 'medium' | 'high';
}

const simianArmy: ChaosExperiment[] = [
  {
    name: 'Chaos Monkey',
    description: 'Arrete aleatoirement des instances de VM',
    faultType: 'instance-termination',
    scope: 'instance',
    risk: 'low',
  },
  {
    name: 'Chaos Kong',
    description: 'Simule la perte d\'une region AWS entiere',
    faultType: 'region-outage',
    scope: 'region',
    risk: 'high',
  },
  {
    name: 'Latency Monkey',
    description: 'Injecte de la latence artificielle dans les communications',
    faultType: 'network-latency',
    scope: 'service',
    risk: 'medium',
  },
  {
    name: 'Conformity Monkey',
    description: 'Detecte les instances non conformes aux bonnes pratiques',
    faultType: 'compliance-check',
    scope: 'global',
    risk: 'low',
  },
];
```

---

## Les principes du chaos engineering

### Le manifeste

Les principes du chaos engineering, tels que decrits sur principlesofchaos.org :

```typescript
interface ChaosPrinciple {
  principle: string;
  description: string;
  example: string;
}

const principles: ChaosPrinciple[] = [
  {
    principle: '1. Definir l\'etat stable',
    description:
      'Commencez par definir le comportement normal et mesurable du systeme. ' +
      'C\'est votre baseline — vous devez pouvoir dire "le systeme est en bonne sante" objectivement.',
    example:
      'Etat stable : p99 latence < 200ms, taux d\'erreur < 0.1%, throughput > 500 req/s',
  },
  {
    principle: '2. Formuler une hypothese',
    description:
      'Formulez une hypothese sur ce qui se passera quand vous introduisez un perturbateur. ' +
      'L\'hypothese devrait etre que l\'etat stable sera maintenu.',
    example:
      'Hypothese : "Si nous arretons 1 des 3 replicas du service de paiement, ' +
      'le systeme continuera de fonctionner avec p99 < 300ms"',
  },
  {
    principle: '3. Varier les evenements du monde reel',
    description:
      'Injectez des perturbations qui refletent des pannes reelles : ' +
      'crash de serveur, partition reseau, saturation CPU, disque plein.',
    example: 'Tuer un pod Kubernetes, ajouter 500ms de latence reseau, saturer le CPU a 100%',
  },
  {
    principle: '4. Executer en production',
    description:
      'Les systemes se comportent differemment en production (trafic reel, donnees reelles, ' +
      'infrastructure reelle). Les experiments en staging ne revelent pas tous les problemes.',
    example: 'Executer Chaos Monkey pendant les heures de bureau en production',
  },
  {
    principle: '5. Automatiser les experiences',
    description:
      'Pour etre utile a grande echelle, le chaos engineering doit etre automatise et continu, ' +
      'pas un evenement ponctuel.',
    example: 'Pipeline CI/CD qui execute des experiments de chaos quotidiennement',
  },
  {
    principle: '6. Minimiser le blast radius',
    description:
      'Commencez petit et augmentez progressivement. Limitez l\'impact potentiel de chaque experience.',
    example: 'D\'abord 1 pod, puis 1 service, puis 1 zone, puis 1 region',
  },
];
```

---

## Steady State Hypothesis

### Formuler une hypothese

```typescript
interface SteadyStateHypothesis {
  title: string;
  description: string;
  steadyStateIndicators: Array<{
    metric: string;
    condition: string;
    threshold: number;
    unit: string;
  }>;
  faultInjection: {
    type: string;
    target: string;
    duration: string;
  };
  expectedOutcome: string;
  abortConditions: string[];
}

const hypothesis: SteadyStateHypothesis = {
  title: 'Resilience du service de commandes a la perte d\'un replica',
  description:
    'Le service de commandes (3 replicas) doit continuer de fonctionner ' +
    'normalement si l\'un des replicas est arrete brusquement.',
  steadyStateIndicators: [
    {
      metric: 'http_request_duration_seconds (p99)',
      condition: '<',
      threshold: 200,
      unit: 'ms',
    },
    {
      metric: 'http_requests_total (rate 5xx)',
      condition: '<',
      threshold: 0.1,
      unit: '%',
    },
    {
      metric: 'http_requests_total (rate)',
      condition: '>',
      threshold: 500,
      unit: 'req/s',
    },
  ],
  faultInjection: {
    type: 'pod-kill',
    target: 'order-service (1 of 3 replicas)',
    duration: '5 minutes',
  },
  expectedOutcome:
    'Le load balancer Kubernetes redirige le trafic vers les 2 replicas restants. ' +
    'La latence augmente legerement mais reste sous 300ms. Le taux d\'erreur reste sous 0.5%.',
  abortConditions: [
    'Taux d\'erreur > 5% pendant plus de 30 secondes',
    'p99 latence > 2 secondes',
    'Perte de donnees detectee',
  ],
};
```

---

## Types de fault injection

### Classification des pannes

```typescript
type FaultCategory = 'infrastructure' | 'network' | 'application' | 'data';

interface FaultType {
  category: FaultCategory;
  name: string;
  description: string;
  implementation: string;
  risk: 'low' | 'medium' | 'high';
}

const faultTypes: FaultType[] = [
  // Infrastructure
  {
    category: 'infrastructure',
    name: 'Pod/Instance Kill',
    description: 'Arret brutal d\'un pod ou d\'une instance',
    implementation: 'kubectl delete pod <name> --grace-period=0',
    risk: 'low',
  },
  {
    category: 'infrastructure',
    name: 'CPU Stress',
    description: 'Saturation du CPU a 100%',
    implementation: 'stress-ng --cpu 4 --timeout 60s',
    risk: 'medium',
  },
  {
    category: 'infrastructure',
    name: 'Memory Pressure',
    description: 'Consommation de toute la memoire disponible',
    implementation: 'stress-ng --vm 2 --vm-bytes 80% --timeout 60s',
    risk: 'medium',
  },
  {
    category: 'infrastructure',
    name: 'Disk Fill',
    description: 'Remplissage du disque a 100%',
    implementation: 'fallocate -l 10G /tmp/fill-disk',
    risk: 'high',
  },

  // Network
  {
    category: 'network',
    name: 'Latency Injection',
    description: 'Ajout de latence artificielle (ex: +500ms)',
    implementation: 'tc qdisc add dev eth0 root netem delay 500ms',
    risk: 'low',
  },
  {
    category: 'network',
    name: 'Packet Loss',
    description: 'Perte aleatoire de paquets (ex: 10%)',
    implementation: 'tc qdisc add dev eth0 root netem loss 10%',
    risk: 'medium',
  },
  {
    category: 'network',
    name: 'DNS Failure',
    description: 'Impossible de resoudre les noms DNS',
    implementation: 'iptables -A OUTPUT -p udp --dport 53 -j DROP',
    risk: 'high',
  },

  // Application
  {
    category: 'application',
    name: 'Error Injection',
    description: 'Retourner des erreurs HTTP 500 aleatoirement',
    implementation: 'Middleware applicatif (voir ci-dessous)',
    risk: 'low',
  },
  {
    category: 'application',
    name: 'Slow Response',
    description: 'Ajouter un delai artificiel aux reponses',
    implementation: 'Middleware applicatif (voir ci-dessous)',
    risk: 'low',
  },
];
```

---

## Implementing Chaos Middleware in TypeScript/Express

### Le chaos middleware de base

```typescript
import { Request, Response, NextFunction } from 'express';

interface ChaosConfig {
  enabled: boolean;
  latency: {
    enabled: boolean;
    minMs: number;
    maxMs: number;
    probability: number; // 0-1
  };
  errors: {
    enabled: boolean;
    statusCode: number;
    probability: number; // 0-1
    message: string;
  };
  slowdown: {
    enabled: boolean;
    factor: number; // multiplicateur de latence
    probability: number;
  };
}

// Configuration par defaut (tout desactive)
const defaultChaosConfig: ChaosConfig = {
  enabled: false,
  latency: { enabled: false, minMs: 100, maxMs: 2000, probability: 0.1 },
  errors: { enabled: false, statusCode: 500, probability: 0.05, message: 'Chaos: Internal Error' },
  slowdown: { enabled: false, factor: 5, probability: 0.1 },
};

let chaosConfig: ChaosConfig = { ...defaultChaosConfig };

// Middleware de chaos
function chaosMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!chaosConfig.enabled) {
    return next();
  }

  // Injection de latence aleatoire
  if (chaosConfig.latency.enabled && Math.random() < chaosConfig.latency.probability) {
    const delay =
      chaosConfig.latency.minMs +
      Math.random() * (chaosConfig.latency.maxMs - chaosConfig.latency.minMs);

    console.warn(`[CHAOS] Injecting ${delay.toFixed(0)}ms latency on ${req.method} ${req.path}`);

    setTimeout(() => next(), delay);
    return;
  }

  // Injection d'erreurs HTTP
  if (chaosConfig.errors.enabled && Math.random() < chaosConfig.errors.probability) {
    console.warn(
      `[CHAOS] Injecting ${chaosConfig.errors.statusCode} error on ${req.method} ${req.path}`,
    );

    res.status(chaosConfig.errors.statusCode).json({
      error: chaosConfig.errors.message,
      chaos: true,
    });
    return;
  }

  next();
}
```

### API de controle du chaos

```typescript
import express from 'express';

const app = express();
app.use(express.json());

// Appliquer le middleware de chaos a toutes les routes
app.use(chaosMiddleware);

// Endpoint pour activer/desactiver le chaos (protege en production)
app.post('/chaos/enable', (req: Request, res: Response) => {
  if (process.env.CHAOS_ALLOWED !== 'true') {
    return res.status(403).json({ error: 'Chaos not allowed in this environment' });
  }

  chaosConfig = {
    ...chaosConfig,
    ...req.body,
    enabled: true,
  };

  console.warn('[CHAOS] Chaos engineering ENABLED', chaosConfig);
  res.json({ status: 'chaos enabled', config: chaosConfig });
});

app.post('/chaos/disable', (_req: Request, res: Response) => {
  chaosConfig = { ...defaultChaosConfig };
  console.warn('[CHAOS] Chaos engineering DISABLED');
  res.json({ status: 'chaos disabled' });
});

app.get('/chaos/status', (_req: Request, res: Response) => {
  res.json({ enabled: chaosConfig.enabled, config: chaosConfig });
});

// Routes applicatives normales
app.get('/api/orders', (_req: Request, res: Response) => {
  res.json({ orders: [{ id: 1, product: 'Widget', price: 29.99 }] });
});

app.get('/health', (_req: Request, res: Response) => {
  // Le health check ne doit JAMAIS etre affecte par le chaos
  res.json({ status: 'healthy' });
});
```

### Chaos middleware avance : ciblage par endpoint

```typescript
interface ChaosRule {
  id: string;
  pathPattern: RegExp;
  method?: string;
  faultType: 'latency' | 'error' | 'timeout';
  config: Record<string, unknown>;
  probability: number;
  expiresAt?: Date;
}

class ChaosEngine {
  private rules: ChaosRule[] = [];

  addRule(rule: ChaosRule): void {
    this.rules.push(rule);
    console.warn(`[CHAOS ENGINE] Rule added: ${rule.id}`);
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id);
    console.warn(`[CHAOS ENGINE] Rule removed: ${id}`);
  }

  clearExpired(): void {
    const now = new Date();
    this.rules = this.rules.filter((r) => !r.expiresAt || r.expiresAt > now);
  }

  evaluate(method: string, path: string): ChaosRule | null {
    this.clearExpired();

    for (const rule of this.rules) {
      if (rule.method && rule.method !== method) continue;
      if (!rule.pathPattern.test(path)) continue;
      if (Math.random() > rule.probability) continue;
      return rule;
    }

    return null;
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const rule = this.evaluate(req.method, req.path);

      if (!rule) return next();

      switch (rule.faultType) {
        case 'latency': {
          const delayMs = rule.config['delayMs'] as number || 1000;
          console.warn(`[CHAOS] Rule ${rule.id}: ${delayMs}ms delay on ${req.path}`);
          setTimeout(next, delayMs);
          break;
        }
        case 'error': {
          const statusCode = rule.config['statusCode'] as number || 500;
          console.warn(`[CHAOS] Rule ${rule.id}: ${statusCode} on ${req.path}`);
          res.status(statusCode).json({ error: 'Chaos injection', ruleId: rule.id });
          break;
        }
        case 'timeout': {
          console.warn(`[CHAOS] Rule ${rule.id}: timeout on ${req.path}`);
          // Ne jamais repondre — simule un timeout
          break;
        }
      }
    };
  }
}

// Utilisation
const chaos = new ChaosEngine();

// Injecter 500ms de latence sur 20% des requetes vers /api/payments
chaos.addRule({
  id: 'slow-payments',
  pathPattern: /^\/api\/payments/,
  faultType: 'latency',
  config: { delayMs: 500 },
  probability: 0.2,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Expire dans 30 min
});

// Retourner des 503 sur 10% des requetes vers /api/orders
chaos.addRule({
  id: 'orders-unavailable',
  pathPattern: /^\/api\/orders/,
  faultType: 'error',
  config: { statusCode: 503 },
  probability: 0.1,
});

app.use(chaos.middleware());
```

---

## Circuit Breaker Pattern

Le **circuit breaker** est le complement naturel du chaos engineering : il protege votre service quand une dépendance est defaillante.

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;   // Nombre d'echecs avant ouverture
  successThreshold: number;   // Nombre de succes avant fermeture (en half-open)
  timeoutMs: number;          // Delai avant de passer en half-open
  monitorWindowMs: number;    // Fenetre de monitoring des echecs
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Verifier si on peut passer en half-open
      if (Date.now() - this.lastFailureTime > this.config.timeoutMs) {
        this.state = 'half-open';
        this.successes = 0;
        console.log('[CIRCUIT BREAKER] Transitioning to HALF-OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN — request blocked');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        console.log('[CIRCUIT BREAKER] Circuit CLOSED — service recovered');
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      console.log(
        `[CIRCUIT BREAKER] Circuit OPEN after ${this.failures} failures`,
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Utilisation avec un service externe
const paymentCircuit = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30_000,   // 30 secondes avant retry
  monitorWindowMs: 60_000,
});

async function processPayment(orderId: string): Promise<{ success: boolean }> {
  return paymentCircuit.execute(async () => {
    const response = await fetch('http://payment-service/api/charge', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
      signal: AbortSignal.timeout(5000), // timeout de 5s
    });

    if (!response.ok) {
      throw new Error(`Payment service error: ${response.status}`);
    }

    return response.json();
  });
}
```

---

## Blast Radius Control

Le **blast radius** est l'impact maximal d'une experience de chaos. Le controler est essentiel pour éviter de transformer une experience en vrai incident.

```typescript
interface BlastRadiusControl {
  level: number;
  scope: string;
  maxImpactPercent: number;
  examples: string[];
  prerequisite: string;
}

const maturityLevels: BlastRadiusControl[] = [
  {
    level: 1,
    scope: 'Environnement de dev/staging',
    maxImpactPercent: 0,
    examples: [
      'Arreter un conteneur en dev',
      'Injecter de la latence en staging',
      'Simuler une panne DB en test',
    ],
    prerequisite: 'Aucun — commencez ici',
  },
  {
    level: 2,
    scope: 'Un seul pod en production',
    maxImpactPercent: 5,
    examples: [
      'Kill 1 pod sur 20',
      'Latence sur 1 replica',
    ],
    prerequisite: 'Monitoring et alerting en place, rollback automatique',
  },
  {
    level: 3,
    scope: 'Un service entier',
    maxImpactPercent: 20,
    examples: [
      'Degrader un service non critique',
      'Simuler la panne d\'un cache',
    ],
    prerequisite: 'Circuit breakers et fallbacks en place',
  },
  {
    level: 4,
    scope: 'Une zone de disponibilite',
    maxImpactPercent: 33,
    examples: [
      'Simuler la perte d\'une AZ',
      'Couper le trafic vers une zone',
    ],
    prerequisite: 'Architecture multi-AZ validee, failover automatique',
  },
  {
    level: 5,
    scope: 'Une region entiere',
    maxImpactPercent: 50,
    examples: [
      'Simuler la perte de eu-west-1',
      'Failover vers une region secondaire',
    ],
    prerequisite: 'Architecture multi-region active-active, equipe chaos dediee',
  },
];
```

### Mecanismes d'arret d'urgence (kill switch)

```typescript
interface ChaosExperimentRunner {
  experimentId: string;
  hypothesis: SteadyStateHypothesis;
  abortController: AbortController;
  isRunning: boolean;

  start(): Promise<void>;
  abort(reason: string): void;
  checkAbortConditions(currentMetrics: Record<string, number>): boolean;
}

function createExperimentRunner(
  hypothesis: SteadyStateHypothesis,
): ChaosExperimentRunner {
  const abortController = new AbortController();

  return {
    experimentId: `exp-${Date.now()}`,
    hypothesis,
    abortController,
    isRunning: false,

    async start() {
      this.isRunning = true;
      console.log(`[CHAOS] Experiment ${this.experimentId} STARTED`);
      console.log(`[CHAOS] Hypothesis: ${this.hypothesis.title}`);
      console.log(`[CHAOS] Abort conditions: ${this.hypothesis.abortConditions.join(', ')}`);
    },

    abort(reason: string) {
      this.isRunning = false;
      this.abortController.abort();
      console.error(`[CHAOS] Experiment ${this.experimentId} ABORTED: ${reason}`);
      console.error('[CHAOS] Rolling back fault injection...');
    },

    checkAbortConditions(currentMetrics) {
      // Verifier chaque condition d'arret
      for (const condition of this.hypothesis.abortConditions) {
        if (condition.includes('erreur > 5%') && (currentMetrics['errorRate'] || 0) > 0.05) {
          this.abort(`Error rate ${(currentMetrics['errorRate']! * 100).toFixed(1)}% > 5%`);
          return true;
        }
        if (condition.includes('latence > 2') && (currentMetrics['p99Latency'] || 0) > 2000) {
          this.abort(`p99 latency ${currentMetrics['p99Latency']}ms > 2000ms`);
          return true;
        }
      }
      return false;
    },
  };
}
```

---

## Game Days

### Qu'est-ce qu'un Game Day ?

Un **Game Day** est un exercice planifie ou l'équipe exécuté des experiences de chaos en groupe, avec des roles définis et un objectif d'apprentissage.

```typescript
interface GameDayPlan {
  date: string;
  duration: string;
  participants: string[];
  objectives: string[];
  experiments: Array<{
    order: number;
    name: string;
    hypothesis: string;
    faultType: string;
    duration: string;
    abortCriteria: string;
  }>;
  safetyChecklist: string[];
}

const gameDayPlan: GameDayPlan = {
  date: '2025-04-15',
  duration: '3 heures (10h-13h)',
  participants: [
    'Equipe backend (observateurs et operateurs)',
    'SRE team (facilitateurs)',
    'Product manager (observateur)',
  ],
  objectives: [
    'Valider la resilience du checkout face a la perte du service de paiement',
    'Tester le circuit breaker et le fallback',
    'Exercer l\'equipe a la reponse aux incidents',
    'Identifier les lacunes dans le monitoring',
  ],
  experiments: [
    {
      order: 1,
      name: 'Warm-up : Kill 1 pod API',
      hypothesis: 'Kubernetes reschedule le pod en < 30s, pas d\'impact utilisateur',
      faultType: 'pod-kill',
      duration: '15 min',
      abortCriteria: 'Error rate > 1%',
    },
    {
      order: 2,
      name: 'Latence payment-service',
      hypothesis: 'Le circuit breaker s\'ouvre apres 5 echecs, fallback active',
      faultType: 'latency-injection (2000ms)',
      duration: '20 min',
      abortCriteria: 'Checkout completement indisponible > 2 min',
    },
    {
      order: 3,
      name: 'Panne totale payment-service',
      hypothesis: 'Le mode degrade permet de sauvegarder la commande et de retenter le paiement plus tard',
      faultType: 'service-kill',
      duration: '30 min',
      abortCriteria: 'Perte de donnees de commande',
    },
  ],
  safetyChecklist: [
    'Alerting equipe confirmee : l\'equipe sait que c\'est un exercice',
    'Kill switch teste et fonctionnel',
    'Rollback plan documente',
    'Status page prete a etre mise a jour si impact reel',
    'Pas de deploiements planifies pendant le Game Day',
    'Trafic reel surveille en temps reel',
  ],
};
```

---

## Modèle de maturite Chaos Engineering

```typescript
interface MaturityLevel {
  level: number;
  name: string;
  description: string;
  practices: string[];
  indicators: string[];
}

const maturityModel: MaturityLevel[] = [
  {
    level: 0,
    name: 'Aucun',
    description: 'Pas de pratique de chaos engineering',
    practices: [],
    indicators: ['Les pannes sont decouvertes par les utilisateurs'],
  },
  {
    level: 1,
    name: 'Initial',
    description: 'Experiments manuels en staging',
    practices: [
      'Game Days occasionnels en staging',
      'Tests de failover manuels',
      'Documentation des points de defaillance',
    ],
    indicators: ['L\'equipe a fait au moins un Game Day'],
  },
  {
    level: 2,
    name: 'Structure',
    description: 'Experiments reguliers en production (faible blast radius)',
    practices: [
      'Chaos Monkey en production (kill de pods)',
      'Circuit breakers systematiques',
      'Hypotheses formalisees et documentees',
      'Abort conditions definies',
    ],
    indicators: ['Experiments hebdomadaires automatises'],
  },
  {
    level: 3,
    name: 'Avance',
    description: 'Chaos engineering integre dans le cycle de developpement',
    practices: [
      'Chaos tests dans la CI/CD',
      'Experiments multi-services',
      'Simulation de pannes de zone (AZ)',
      'Metriques de resilience suivies',
    ],
    indicators: ['Chaque nouveau service passe un chaos test avant la mise en production'],
  },
  {
    level: 4,
    name: 'Expert',
    description: 'Chaos engineering continu, automatise, a l\'echelle',
    practices: [
      'Experiments continus en production (quotidiens)',
      'Simulation de pannes region',
      'Chaos engineering sur les processus (simulation d\'incident)',
      'Partage des resultats dans toute l\'organisation',
    ],
    indicators: ['Le systeme est plus fiable grace au chaos engineering mesurable (MTTR reduit, incidents evites)'],
  },
];
```

---

## Bonnes pratiques

1. **Commencez en staging** : validez vos experiments dans un environnement sans risque avant la production
2. **Formulez toujours une hypothese** : pas d'experience sans hypothese claire et mesurable
3. **Definissez des abort conditions** : savoir quand arreter est aussi important que savoir quand commencer
4. **Controlez le blast radius** : augmentez progressivement l'ampleur des experiences
5. **Impliquez toute l'équipe** : le chaos engineering n'est pas reserve aux SREs
6. **Automatisez** : les experiments manuels ne passent pas a l'echelle
7. **Mesurez les résultats** : chaque experience doit produire des donnees exploitables
8. **Corrigez avant de continuer** : ne passez pas au niveau suivant si les faiblesses du niveau actuel ne sont pas corrigees
9. **Ne faites jamais de chaos en secret** : toutes les parties prenantes doivent etre informees
10. **Le circuit breaker est votre meilleur ami** : implementez-le avant de faire du chaos en production

---

::: tip A retenir
- Le chaos engineering est une **discipline scientifique** : hypothese, experience, mesure, analyse
- Origine : **Netflix Chaos Monkey** (2010) — provoquer des pannes pour renforcer le système
- Toujours définir l'**état stable** (metriques de baseline) avant une experience
- Types de faults : **kill instance, latence, erreurs, timeout, saturation ressources**
- Le **blast radius** doit etre controle et augmente progressivement (staging -> pod -> service -> zone -> region)
- Le **circuit breaker** protege votre service quand une dépendance est defaillante
- Les **Game Days** sont des exercices planifies pour pratiquer en équipe
- L'objectif n'est pas de casser, mais de **découvrir les faiblesses et les corriger**
:::

---

## Aller plus loin : concepts expert

### Les outils de chaos engineering en production

Au-dela du middleware TypeScript, l'ecosysteme dispose d'outils matures pour le chaos en production :

| Outil | Specialite | Niveau |
|-------|-----------|--------|
| **Gremlin** | Plateforme SaaS, fault injection multi-cloud | Enterprise |
| **Litmus Chaos** | Chaos engineering natif Kubernetes (CNCF) | Cloud-native |
| **Chaos Toolkit** | Framework open source, extensible, CLI-based | Equipes devops |
| **Toxiproxy** | Proxy TCP pour simuler conditions réseau (latence, jitter, bandwidth) | Developpement/CI |
| **tc (traffic control)** | Outil Linux natif pour degrader le réseau | Infrastructure |

```typescript
// Exemple : Toxiproxy en TypeScript pour les tests d'integration
// Toxiproxy se place entre votre app et ses dependances
interface ToxiproxyConfig {
  name: string;
  listen: string;      // port expose a votre app
  upstream: string;     // vrai service en amont
  toxics: Toxic[];
}

interface Toxic {
  name: string;
  type: 'latency' | 'bandwidth' | 'slow_close' | 'timeout' | 'slicer';
  attributes: Record<string, number>;
  toxicity: number;    // 0.0 - 1.0 : probabilite d'application
}

// Simuler un reseau degrade vers PostgreSQL
const pgProxy: ToxiproxyConfig = {
  name: 'postgresql',
  listen: '0.0.0.0:25432',
  upstream: 'postgres:5432',
  toxics: [
    {
      name: 'pg_latency',
      type: 'latency',
      attributes: { latency: 200, jitter: 50 }, // +200ms ± 50ms
      toxicity: 0.3,  // 30% des paquets affectes
    },
  ],
};
```

### Le Game Day avance : au-dela du kill -9

Les Game Days débutants tuent des processus. Les Game Days experts testent des scenarios multi-facteurs realistes :

```typescript
interface AdvancedGameDay {
  scenario: string;
  faults: GameDayFault[];
  businessContext: string;
  expectedBehavior: string;
  abortCondition: string;
}

const advancedScenarios: AdvancedGameDay[] = [
  {
    scenario: 'Black Friday + panne de cache',
    faults: [
      { type: 'load', description: '3x le trafic normal' },
      { type: 'dependency', description: 'Redis indisponible (toutes les replicas)' },
    ],
    businessContext: 'Pic de ventes annuel — chaque minute de downtime = 50K€ de perdu',
    expectedBehavior: 'Graceful degradation : l\'app continue sans cache, latence augmentee mais pas d\'erreurs',
    abortCondition: 'Error rate > 5% OU latence p99 > 10s',
  },
  {
    scenario: 'Deploiement canary defectueux + rollback',
    faults: [
      { type: 'code', description: 'Nouvelle version avec memory leak (heap +10MB/min)' },
      { type: 'observability', description: 'Le dashboard principal est down (Grafana inaccessible)' },
    ],
    businessContext: 'Vendredi 17h, equipe reduite',
    expectedBehavior: 'Detection via alertes Prometheus (pas via dashboard), rollback automatique en < 5min',
    abortCondition: 'OOM kill du processus OU alertes non recues',
  },
];
```

### Résilience patterns : au-dela du circuit breaker

Le circuit breaker est le pattern le plus connu, mais il en existe d'autres tout aussi importants :

```typescript
// Pattern 1 : Bulkhead (cloison de navire)
// Isole les ressources par type de requete pour eviter qu'un type
// de requete lent ne bloque toutes les autres
interface BulkheadConfig {
  name: string;
  maxConcurrent: number;  // nombre max de requetes simultanees
  maxQueue: number;        // taille de la file d'attente
  queueTimeoutMs: number;
}

const bulkheads: Record<string, BulkheadConfig> = {
  'api-read':  { name: 'api-read',  maxConcurrent: 100, maxQueue: 50, queueTimeoutMs: 1000 },
  'api-write': { name: 'api-write', maxConcurrent: 20,  maxQueue: 10, queueTimeoutMs: 2000 },
  'payment':   { name: 'payment',   maxConcurrent: 5,   maxQueue: 5,  queueTimeoutMs: 5000 },
};

// Pattern 2 : Retry with exponential backoff + jitter
function calculateBackoff(attempt: number, baseMs: number = 100): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * exponential * 0.5;
  return Math.min(exponential + jitter, 30000); // cap a 30s
}

// Pattern 3 : Shed load (delestage)
// Quand le systeme est surcharge, rejeter les nouvelles requetes
// plutot que de degrader le service pour tous
function loadShedMiddleware(maxInFlight: number) {
  let inFlight = 0;
  return (req: any, res: any, next: any) => {
    if (inFlight >= maxInFlight) {
      res.status(503).json({ error: 'Service overloaded, try again later' });
      return;
    }
    inFlight++;
    res.on('finish', () => { inFlight--; });
    next();
  };
}
```

::: tip Référence SRE
Le Google SRE Book (Chapitre 22, "Addressing Cascading Failures") est la référence absolue pour les patterns de résilience. Il couvre le load shedding, le graceful degradation, les retries avec backoff, et les circuit breakers en profondeur. Le Chapitre 17 ("Testing for Reliability") explique comment structurer les Game Days. Pour aller encore plus loin, "Release It!" de Michael Nygard est le livre de référence sur les patterns de stabilite.
:::

---

## Si tu es perdu

- Le chaos engineering consiste a **provoquer des pannes controlees** pour decouvrir les faiblesses de ton systeme avant qu'elles ne causent de vrais incidents.
- Avant chaque experience, tu definis un **etat stable** (metriques normales) et une **hypothese** ("si je tue un pod, le service continue de fonctionner").
- Tu commences toujours **petit** (un seul pod en staging), puis tu augmentes progressivement le blast radius vers la production.
- Le **circuit breaker** est le pattern complementaire : il coupe automatiquement les appels vers un service defaillant pour eviter la propagation de la panne.
- Si les metriques depassent les **conditions d'arret** (ex: taux d'erreur > 5%), tu arretes immediatement l'experience et tu annules l'injection de faute.

---

## Pour aller plus loin

- [Lab 14 — Chaos Middleware dans la demo-app](/labs/lab-14-chaos-middleware/README)
- [Quiz 14 — Chaos Engineering](/quizzes/quiz-14-chaos-engineering)
- Principles of Chaos Engineering : https://principlesofchaos.org
- Netflix Tech Blog : "Chaos Engineering"
- Google SRE Book, Chapitre 17 : "Testing for Reliability"

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 14 chaos engineering](../screencasts/screencast-14-chaos-engineering.md)
2. **Lab** : [lab-14-chaos-middleware](../labs/lab-14-chaos-middleware/README)
3. **Quiz** : [quiz 14 chaos engineering](../quizzes/quiz-14-chaos-engineering.html)
:::

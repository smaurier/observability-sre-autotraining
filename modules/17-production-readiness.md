# Production Readiness Reviews & Checklists

## Objectifs pedagogiques

- Comprendre le concept de Production Readiness Review (PRR) issu du Google SRE Book
- Connaitre les categories d'une checklist PRR (observabilite, scaling, securite, recovery, dependances)
- Savoir cartographier les dependances d'un service (dependency mapping)
- Appliquer l'analyse des modes de defaillance (FMEA)
- Implementer des patterns de degradation gracieuse (graceful degradation)
- Configurer des health checks Express (liveness, readiness, startup)
- Comprendre les patterns de probes Kubernetes
- Evaluer la maturite d'observabilite d'une equipe (niveaux 0 a 4)
- Construire un template PRR pratique en TypeScript

---

## Introduction : le gardien de la production

Imaginez un pilote de ligne. Avant chaque vol, il parcourt une **checklist pre-vol** : instruments, carburant, surfaces de controle, meteo. Ce n'est pas optionnel. Peu importe son experience, la checklist est obligatoire. C'est exactement le role d'une **Production Readiness Review (PRR)** : une checklist systematique qui verifie qu'un service est pret a etre expose a de vrais utilisateurs.

Le concept vient du **Google SRE Book** (Chapitre 32). Chez Google, aucun service ne passe en production sans avoir ete evalue par l'equipe SRE via une PRR formelle. L'objectif n'est pas de bloquer les equipes, mais de s'assurer que les questions critiques ont ete posees **avant** le premier incident, pas apres.

---

## La checklist PRR : les categories

### Vue d'ensemble

```typescript
type PRRCategory =
  | 'observability'
  | 'scaling'
  | 'security'
  | 'recovery'
  | 'dependency-management'
  | 'operational-readiness'
  | 'testing';

interface PRRChecklistItem {
  id: string;
  category: PRRCategory;
  question: string;
  description: string;
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  evidence: string; // Comment prouver que c'est fait
}

interface PRRChecklist {
  serviceName: string;
  version: string;
  reviewDate: string;
  reviewers: string[];
  items: PRRChecklistItem[];
  overallStatus: 'approved' | 'conditionally-approved' | 'rejected';
  conditions?: string[];
  nextReviewDate: string;
}
```

### Categorie : Observabilite

```typescript
const observabilityChecklist: PRRChecklistItem[] = [
  {
    id: 'OBS-001',
    category: 'observability',
    question: 'Le service emet-il des logs structures (JSON) ?',
    description:
      'Les logs doivent etre en JSON avec des champs standards : ' +
      'timestamp, level, message, service, traceId, spanId.',
    priority: 'must-have',
    evidence: 'Montrer un extrait de log en production avec les champs requis',
  },
  {
    id: 'OBS-002',
    category: 'observability',
    question: 'Les metriques RED sont-elles exposees ?',
    description:
      'Rate (requetes/sec), Errors (taux d\'erreur), Duration (latence). ' +
      'Endpoint /metrics au format Prometheus.',
    priority: 'must-have',
    evidence: 'curl http://service:port/metrics | grep http_requests_total',
  },
  {
    id: 'OBS-003',
    category: 'observability',
    question: 'Le tracing distribue est-il implemente ?',
    description:
      'OpenTelemetry SDK configure, propagation du trace context (W3C), ' +
      'spans pour les operations critiques.',
    priority: 'must-have',
    evidence: 'Montrer une trace complete dans Jaeger/Tempo couvrant un flux utilisateur',
  },
  {
    id: 'OBS-004',
    category: 'observability',
    question: 'Un dashboard de service existe-t-il ?',
    description:
      'Dashboard Grafana avec les metriques RED, les ressources systeme, ' +
      'et les SLIs du service.',
    priority: 'must-have',
    evidence: 'Lien vers le dashboard Grafana provisionne (as code)',
  },
  {
    id: 'OBS-005',
    category: 'observability',
    question: 'Des SLOs sont-ils definis et mesures ?',
    description:
      'Au moins un SLO d\'availability et un SLO de latence avec des targets ' +
      'documentes et un error budget suivi.',
    priority: 'must-have',
    evidence: 'Fichier SLO definition + dashboard error budget',
  },
  {
    id: 'OBS-006',
    category: 'observability',
    question: 'Les alertes sont-elles configurees et testees ?',
    description:
      'Alertes basees sur les burn rates SLO, pas sur des seuils statiques. ' +
      'Chaque alerte a un runbook associe.',
    priority: 'must-have',
    evidence: 'Fichier alert-rules.yaml + tests promtool + liens runbooks',
  },
  {
    id: 'OBS-007',
    category: 'observability',
    question: 'Le correlation ID est-il propage de bout en bout ?',
    description:
      'Un identifiant unique (traceId) propage via les headers HTTP permet ' +
      'de correler logs, traces et metriques.',
    priority: 'should-have',
    evidence: 'Montrer une requete tracee de l\'entree a la sortie du systeme',
  },
];
```

### Categorie : Scaling

```typescript
const scalingChecklist: PRRChecklistItem[] = [
  {
    id: 'SCL-001',
    category: 'scaling',
    question: 'Le service est-il stateless ?',
    description:
      'Aucun etat en memoire entre les requetes. Sessions externalisees ' +
      '(Redis, DB). Permet le scaling horizontal.',
    priority: 'must-have',
    evidence: 'Architecture review confirmant l\'absence d\'etat local',
  },
  {
    id: 'SCL-002',
    category: 'scaling',
    question: 'Le horizontal pod autoscaler (HPA) est-il configure ?',
    description:
      'Scaling automatique base sur CPU, memoire ou metriques custom. ' +
      'Min/max replicas definis.',
    priority: 'should-have',
    evidence: 'Fichier HPA manifest + test de charge montrant le scaling',
  },
  {
    id: 'SCL-003',
    category: 'scaling',
    question: 'Les limites de ressources sont-elles definies ?',
    description:
      'Requests et limits CPU/memoire definis dans le manifest Kubernetes. ' +
      'Bases sur des tests de charge reels.',
    priority: 'must-have',
    evidence: 'Manifest K8s + resultats de test de charge k6',
  },
  {
    id: 'SCL-004',
    category: 'scaling',
    question: 'Le service gere-t-il le rate limiting ?',
    description:
      'Protection contre les pics de trafic excessifs. Rate limiting par ' +
      'client, par endpoint ou global.',
    priority: 'should-have',
    evidence: 'Configuration du rate limiter + test de depassement',
  },
  {
    id: 'SCL-005',
    category: 'scaling',
    question: 'Un test de charge a-t-il ete execute ?',
    description:
      'Test k6 avec ramp-up, steady state et spike. Resultats documentes : ' +
      'throughput max, latence sous charge, point de rupture.',
    priority: 'must-have',
    evidence: 'Script k6 + rapport de test de charge',
  },
];
```

### Categories supplementaires

```typescript
const securityChecklist: PRRChecklistItem[] = [
  {
    id: 'SEC-001',
    category: 'security',
    question: 'L\'authentification est-elle requise sur tous les endpoints non-publics ?',
    description: 'JWT validation, API key, ou OAuth2. Aucun endpoint sensible sans auth.',
    priority: 'must-have',
    evidence: 'Liste des endpoints avec leur politique d\'authentification',
  },
  {
    id: 'SEC-002',
    category: 'security',
    question: 'Les secrets sont-ils geres via un secret manager ?',
    description: 'Pas de secrets dans le code, les variables d\'environnement ou les images Docker.',
    priority: 'must-have',
    evidence: 'Configuration du secret manager (Vault, AWS Secrets Manager, K8s secrets)',
  },
  {
    id: 'SEC-003',
    category: 'security',
    question: 'Les donnees sensibles sont-elles exclues des logs ?',
    description: 'Pas de mots de passe, tokens, PII, ou numeros de carte dans les logs.',
    priority: 'must-have',
    evidence: 'Configuration de redaction des logs + audit',
  },
];

const recoveryChecklist: PRRChecklistItem[] = [
  {
    id: 'REC-001',
    category: 'recovery',
    question: 'Un rollback est-il possible en moins de 5 minutes ?',
    description: 'Procedure de rollback documentee et testee. Deployment blue-green ou canary.',
    priority: 'must-have',
    evidence: 'Procedure de rollback + derniere date de test',
  },
  {
    id: 'REC-002',
    category: 'recovery',
    question: 'Les donnees sont-elles sauvegardees et restaurables ?',
    description: 'Backups automatiques, teste de restauration recent, RPO et RTO definis.',
    priority: 'must-have',
    evidence: 'Politique de backup + dernier test de restauration',
  },
  {
    id: 'REC-003',
    category: 'recovery',
    question: 'Le circuit breaker est-il configure pour les dependances ?',
    description: 'Pattern circuit breaker sur chaque appel a une dependance externe.',
    priority: 'should-have',
    evidence: 'Configuration du circuit breaker + metriques associees',
  },
];
```

---

## Dependency Mapping

### Cartographier les dependances

```typescript
type DependencyType = 'hard' | 'soft';
type DependencyDirection = 'upstream' | 'downstream';
type CommunicationProtocol = 'http' | 'grpc' | 'kafka' | 'redis' | 'postgres' | 'amqp';

interface ServiceDependency {
  name: string;
  type: DependencyType;
  direction: DependencyDirection;
  protocol: CommunicationProtocol;
  description: string;
  sla?: string;
  fallback?: string;
  timeout: string;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'fixed' | 'exponential';
    initialDelayMs: number;
  };
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenRequests: number;
  };
}

interface DependencyMap {
  service: string;
  version: string;
  lastUpdated: string;
  dependencies: ServiceDependency[];
  totalHardDependencies: number;
  totalSoftDependencies: number;
  singlePointsOfFailure: string[];
}

function createDependencyMap(
  service: string,
  dependencies: ServiceDependency[],
): DependencyMap {
  const hardDeps = dependencies.filter((d) => d.type === 'hard');
  const softDeps = dependencies.filter((d) => d.type === 'soft');

  // Identifier les SPOF : dependances hard sans fallback
  const spofs = hardDeps
    .filter((d) => !d.fallback)
    .map((d) => d.name);

  return {
    service,
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    dependencies,
    totalHardDependencies: hardDeps.length,
    totalSoftDependencies: softDeps.length,
    singlePointsOfFailure: spofs,
  };
}

// Exemple : dependency map d'un service de commandes
const orderServiceDeps = createDependencyMap('order-service', [
  {
    name: 'PostgreSQL',
    type: 'hard',
    direction: 'downstream',
    protocol: 'postgres',
    description: 'Base de donnees principale pour les commandes',
    sla: '99.99%',
    timeout: '5s',
    retryPolicy: { maxRetries: 3, backoff: 'exponential', initialDelayMs: 100 },
  },
  {
    name: 'user-service',
    type: 'hard',
    direction: 'downstream',
    protocol: 'http',
    description: 'Validation de l\'identite utilisateur',
    sla: '99.9%',
    fallback: 'Cache local des informations utilisateur (TTL 5min)',
    timeout: '2s',
    retryPolicy: { maxRetries: 2, backoff: 'exponential', initialDelayMs: 200 },
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000, halfOpenRequests: 1 },
  },
  {
    name: 'payment-service',
    type: 'hard',
    direction: 'downstream',
    protocol: 'http',
    description: 'Traitement du paiement',
    sla: '99.95%',
    timeout: '10s',
    retryPolicy: { maxRetries: 1, backoff: 'fixed', initialDelayMs: 500 },
    circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 60000, halfOpenRequests: 1 },
  },
  {
    name: 'notification-service',
    type: 'soft',
    direction: 'downstream',
    protocol: 'kafka',
    description: 'Envoi de la confirmation de commande par email',
    fallback: 'File d\'attente locale — retry asynchrone',
    timeout: '1s',
  },
  {
    name: 'Redis',
    type: 'soft',
    direction: 'downstream',
    protocol: 'redis',
    description: 'Cache des prix produits',
    fallback: 'Lecture directe depuis PostgreSQL (plus lent)',
    timeout: '500ms',
  },
  {
    name: 'api-gateway',
    type: 'hard',
    direction: 'upstream',
    protocol: 'http',
    description: 'Point d\'entree des requetes clients',
    timeout: '30s',
  },
]);

console.log(`Service: ${orderServiceDeps.service}`);
console.log(`Hard dependencies: ${orderServiceDeps.totalHardDependencies}`);
console.log(`Soft dependencies: ${orderServiceDeps.totalSoftDependencies}`);
console.log(`SPOFs: ${orderServiceDeps.singlePointsOfFailure.join(', ') || 'Aucun'}`);
```

::: warning Dependance hard sans fallback = SPOF
Chaque dependance **hard** sans fallback est un **Single Point of Failure**. Si cette dependance tombe, votre service tombe. L'objectif est de minimiser les SPOFs en ajoutant des fallbacks (cache, file d'attente, valeurs par defaut) partout ou c'est possible.
:::

---

## Failure Mode and Effects Analysis (FMEA)

### Analyser les modes de defaillance

La FMEA est une methode structuree pour identifier les modes de defaillance possibles, evaluer leur impact et definir des mesures de mitigation.

```typescript
interface FMEAEntry {
  id: string;
  component: string;
  failureMode: string;
  cause: string;
  effect: string;
  severity: number;   // 1-10 (10 = catastrophique)
  occurrence: number;  // 1-10 (10 = tres frequent)
  detection: number;   // 1-10 (10 = tres difficile a detecter)
  rpn: number;         // Risk Priority Number = severity * occurrence * detection
  currentControls: string[];
  recommendedActions: string[];
  owner: string;
  status: 'open' | 'in-progress' | 'mitigated' | 'accepted';
}

function calculateRPN(severity: number, occurrence: number, detection: number): number {
  return severity * occurrence * detection;
}

function classifyRPN(rpn: number): { level: string; action: string } {
  if (rpn >= 200) return { level: 'CRITIQUE', action: 'Action immediate requise' };
  if (rpn >= 100) return { level: 'ELEVE', action: 'Plan d\'action dans les 30 jours' };
  if (rpn >= 50) return { level: 'MOYEN', action: 'Amelioration planifiee au prochain sprint' };
  return { level: 'FAIBLE', action: 'Surveiller et réévaluer trimestriellement' };
}

// Exemple : FMEA pour le order-service
const fmeaAnalysis: FMEAEntry[] = [
  {
    id: 'FMEA-001',
    component: 'PostgreSQL',
    failureMode: 'Base de donnees inaccessible',
    cause: 'Panne reseau, crash du serveur, ou saturation des connexions',
    effect: 'Impossible de creer ou lire des commandes — service completement down',
    severity: 9,
    occurrence: 3,
    detection: 2,
    rpn: calculateRPN(9, 3, 2), // 54
    currentControls: [
      'Replicas PostgreSQL (primary + read replicas)',
      'Health checks sur la connexion DB',
      'Alertes sur le nombre de connexions actives',
    ],
    recommendedActions: [
      'Ajouter un mode read-only avec les replicas en fallback',
      'Implementer un connection pool avec queuing',
    ],
    owner: 'team-platform',
    status: 'in-progress',
  },
  {
    id: 'FMEA-002',
    component: 'payment-service',
    failureMode: 'Service de paiement indisponible',
    cause: 'Deployment en cours, incident sur le provider de paiement, reseau',
    effect: 'Impossible de finaliser les commandes — perte de revenus directe',
    severity: 10,
    occurrence: 4,
    detection: 3,
    rpn: calculateRPN(10, 4, 3), // 120
    currentControls: [
      'Circuit breaker avec timeout de 10s',
      'Retries avec backoff exponentiel',
      'Alerte sur le taux d\'erreur du payment-service',
    ],
    recommendedActions: [
      'Implementer un pattern saga avec compensation',
      'Ajouter une file d\'attente pour les paiements en attente',
      'Notifier l\'utilisateur et permettre le retry depuis l\'UI',
    ],
    owner: 'team-commerce',
    status: 'open',
  },
  {
    id: 'FMEA-003',
    component: 'Redis cache',
    failureMode: 'Cache Redis indisponible',
    cause: 'Eviction memoire, crash du noeud Redis, reseau',
    effect: 'Degradation de performance (fallback vers PostgreSQL), latence augmentee',
    severity: 4,
    occurrence: 3,
    detection: 2,
    rpn: calculateRPN(4, 3, 2), // 24
    currentControls: [
      'Fallback automatique vers PostgreSQL',
      'Alerte sur le cache hit ratio',
      'Redis Sentinel pour le failover automatique',
    ],
    recommendedActions: [
      'Ajouter un cache L1 in-memory pour les donnees les plus chaudes',
    ],
    owner: 'team-platform',
    status: 'mitigated',
  },
];

// Rapport FMEA
function generateFMEAReport(entries: FMEAEntry[]): void {
  const sorted = [...entries].sort((a, b) => b.rpn - a.rpn);

  console.log('=== RAPPORT FMEA ===\n');

  for (const entry of sorted) {
    const classification = classifyRPN(entry.rpn);
    console.log(`[${entry.id}] ${entry.component} — ${entry.failureMode}`);
    console.log(`  RPN: ${entry.rpn} (${classification.level})`);
    console.log(`  Severite: ${entry.severity}/10 | Occurrence: ${entry.occurrence}/10 | Detection: ${entry.detection}/10`);
    console.log(`  Effet: ${entry.effect}`);
    console.log(`  Action: ${classification.action}`);
    console.log(`  Status: ${entry.status}`);
    console.log('');
  }
}

generateFMEAReport(fmeaAnalysis);
```

---

## Graceful Degradation Patterns

### Principes de degradation gracieuse

```typescript
interface DegradationLevel {
  level: number;
  name: string;
  description: string;
  userImpact: string;
  triggers: string[];
  actions: string[];
}

const degradationLevels: DegradationLevel[] = [
  {
    level: 0,
    name: 'Normal',
    description: 'Tous les systemes fonctionnent normalement',
    userImpact: 'Aucun',
    triggers: ['Tous les health checks passent'],
    actions: ['Aucune action speciale'],
  },
  {
    level: 1,
    name: 'Degradation legere',
    description: 'Fonctionnalites non-critiques desactivees',
    userImpact: 'Recommandations absentes, pas de personnalisation',
    triggers: ['Cache Redis down', 'Service de recommandations down'],
    actions: [
      'Desactiver les recommandations personnalisees',
      'Afficher des recommandations statiques/par defaut',
      'Augmenter les timeouts sur les caches',
    ],
  },
  {
    level: 2,
    name: 'Degradation moderee',
    description: 'Fonctionnalites secondaires desactivees',
    userImpact: 'Pas d\'envoi d\'email, pas de recherche avancee',
    triggers: ['Notification service down', 'Search service down'],
    actions: [
      'Mettre les notifications en file d\'attente pour envoi differe',
      'Basculer vers une recherche simplifiee (SQL LIKE)',
      'Afficher un message d\'avertissement aux utilisateurs',
    ],
  },
  {
    level: 3,
    name: 'Degradation severe',
    description: 'Mode read-only ou fonctionnalites minimales',
    userImpact: 'Impossible de creer des commandes, consultation seule',
    triggers: ['Payment service down', 'Write DB down'],
    actions: [
      'Passer le service en mode read-only',
      'Afficher un bandeau "Service en maintenance partielle"',
      'Rediriger les creations de commandes vers une file d\'attente',
    ],
  },
  {
    level: 4,
    name: 'Service indisponible',
    description: 'Le service ne peut plus fonctionner',
    userImpact: 'Page d\'erreur ou maintenance',
    triggers: ['Primary DB down', 'Plusieurs dependances hard down'],
    actions: [
      'Afficher une page de maintenance statique',
      'Alerter l\'equipe on-call immediatement',
      'Activer le disaster recovery si disponible',
    ],
  },
];
```

---

## Health Checks en Express

### Implementation complete

```typescript
import express, { Request, Response } from 'express';

// ===== Types pour les health checks =====

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthCheckResult {
  status: HealthStatus;
  checks: Record<string, ComponentHealth>;
  version: string;
  uptime: number;
  timestamp: string;
}

interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  lastChecked: string;
}

// ===== Fonctions de verification des dependances =====

async function checkPostgres(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // En production : await pool.query('SELECT 1');
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 1000 ? 'degraded' : 'healthy',
      message: latencyMs > 1000 ? 'Latence elevee' : 'OK',
      latencyMs,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Connexion echouee: ${(error as Error).message}`,
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // En production : await redisClient.ping();
    const latencyMs = Date.now() - start;
    return {
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      message: 'OK',
      latencyMs,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Redis inaccessible: ${(error as Error).message}`,
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

async function checkDownstreamService(
  name: string,
  url: string,
  timeoutMs: number,
): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    return {
      status: response.ok ? 'healthy' : 'degraded',
      message: `HTTP ${response.status}`,
      latencyMs,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `${name} inaccessible: ${(error as Error).message}`,
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
    };
  }
}

// ===== Application Express avec health checks =====

const app = express();
const startTime = Date.now();
let isReady = false;

// Simuler l'initialisation (chargement config, connexion DB, warmup cache)
setTimeout(() => {
  isReady = true;
  console.log('Service pret a recevoir du trafic');
}, 5000);

// --- Liveness probe ---
// Question : "Le process est-il vivant ?"
// Si NON -> Kubernetes tue et redemarre le pod
// NE PAS verifier les dependances ici
app.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

// --- Readiness probe ---
// Question : "Le service peut-il traiter des requetes ?"
// Si NON -> Kubernetes retire le pod du load balancer (mais ne le tue pas)
// Verifier les dependances critiques ici
app.get('/health/ready', async (_req: Request, res: Response) => {
  if (!isReady) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Service en cours d\'initialisation',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const postgresHealth = await checkPostgres();
  const redisHealth = await checkRedis();

  // Le service est ready seulement si les dependances hard sont OK
  const isHealthy = postgresHealth.status !== 'unhealthy';

  const result: HealthCheckResult = {
    status: isHealthy ? (redisHealth.status === 'unhealthy' ? 'degraded' : 'healthy') : 'unhealthy',
    checks: {
      postgres: postgresHealth,
      redis: redisHealth,
    },
    version: process.env.APP_VERSION || '0.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };

  res.status(isHealthy ? 200 : 503).json(result);
});

// --- Startup probe ---
// Question : "Le service a-t-il fini de demarrer ?"
// Kubernetes attend que cette probe reussisse avant de commencer
// les liveness/readiness probes
app.get('/health/startup', async (_req: Request, res: Response) => {
  if (!isReady) {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Demarrage en cours...',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Verifier que toutes les dependances sont accessibles au demarrage
  const postgresHealth = await checkPostgres();

  if (postgresHealth.status === 'unhealthy') {
    res.status(503).json({
      status: 'unhealthy',
      message: 'Dependance critique non disponible au demarrage',
      checks: { postgres: postgresHealth },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(200).json({
    status: 'healthy',
    message: 'Service demarre avec succes',
    timestamp: new Date().toISOString(),
  });
});

// --- Endpoint de sante detaille (pour debug, pas pour les probes K8s) ---
app.get('/health/detailed', async (_req: Request, res: Response) => {
  const [postgresHealth, redisHealth, paymentHealth] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkDownstreamService('payment-service', 'http://payment-service:3000/health/live', 2000),
  ]);

  const checks = { postgres: postgresHealth, redis: redisHealth, paymentService: paymentHealth };
  const statuses = Object.values(checks).map((c) => c.status);
  const overallStatus: HealthStatus = statuses.includes('unhealthy')
    ? 'unhealthy'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
    status: overallStatus,
    checks,
    version: process.env.APP_VERSION || '0.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});
```

::: tip Liveness vs Readiness vs Startup
- **Liveness** : "Es-tu vivant ?" — Echec = le pod est redemarre. **Ne jamais** verifier les dependances ici (sinon un PostgreSQL down entraine un restart en boucle de tous les pods).
- **Readiness** : "Peux-tu traiter des requetes ?" — Echec = retire du load balancer, mais le pod reste vivant.
- **Startup** : "As-tu fini de demarrer ?" — Protege les applications lentes au demarrage (warmup cache, migrations DB).
:::

### Configuration Kubernetes des probes

```typescript
// Representation TypeScript d'un manifest Kubernetes avec probes
interface KubernetesProbeConfig {
  livenessProbe: {
    httpGet: { path: string; port: number };
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
  };
  readinessProbe: {
    httpGet: { path: string; port: number };
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
    successThreshold: number;
  };
  startupProbe: {
    httpGet: { path: string; port: number };
    periodSeconds: number;
    failureThreshold: number;
    timeoutSeconds: number;
  };
}

const probeConfig: KubernetesProbeConfig = {
  livenessProbe: {
    httpGet: { path: '/health/live', port: 3000 },
    initialDelaySeconds: 0,   // Pas de delai, la startup probe protege
    periodSeconds: 10,         // Verifier toutes les 10 secondes
    timeoutSeconds: 3,         // Timeout de 3 secondes
    failureThreshold: 3,       // 3 echecs consecutifs = restart
  },
  readinessProbe: {
    httpGet: { path: '/health/ready', port: 3000 },
    initialDelaySeconds: 0,
    periodSeconds: 5,          // Verifier toutes les 5 secondes
    timeoutSeconds: 5,
    failureThreshold: 3,
    successThreshold: 1,       // 1 succes suffit pour redevenir ready
  },
  startupProbe: {
    httpGet: { path: '/health/startup', port: 3000 },
    periodSeconds: 5,
    failureThreshold: 30,      // 30 * 5s = 150s max de demarrage
    timeoutSeconds: 5,
  },
};
```

---

## Observability Maturity Model

### Les 5 niveaux de maturite

```typescript
interface MaturityLevel {
  level: number;
  name: string;
  description: string;
  capabilities: string[];
  antiPatterns: string[];
}

const maturityModel: MaturityLevel[] = [
  {
    level: 0,
    name: 'Reactive / Aveugle',
    description: 'L\'equipe decouvre les problemes quand les utilisateurs se plaignent',
    capabilities: [
      'Logs non structures sur stdout',
      'Pas de metriques',
      'Pas d\'alerting',
      'Debug en SSH sur les serveurs',
    ],
    antiPatterns: [
      '"Ca marche sur ma machine"',
      '"On a ete prevenu par un client"',
      '"On ne sait pas pourquoi c\'est tombe"',
    ],
  },
  {
    level: 1,
    name: 'Basique / Monitoring',
    description: 'Monitoring basique en place, alertes sur des seuils statiques',
    capabilities: [
      'Logs centralises (ELK ou similaire)',
      'Metriques systeme (CPU, memoire, disque)',
      'Alertes sur des seuils fixes (CPU > 80%)',
      'Un dashboard par service',
    ],
    antiPatterns: [
      'Alert fatigue (trop de faux positifs)',
      'Seuils arbitraires non revises',
      'Pas de correlation entre les signaux',
    ],
  },
  {
    level: 2,
    name: 'Proactif / Observability',
    description: 'Les 3 piliers (logs, metriques, traces) sont en place et correles',
    capabilities: [
      'Logs structures (JSON) avec correlation IDs',
      'Metriques RED/USE avec dashboards',
      'Tracing distribue (OpenTelemetry)',
      'SLIs definis et mesures',
      'Alertes basees sur les symptomes, pas les causes',
    ],
    antiPatterns: [
      'SLOs non formalises',
      'Pas d\'error budget tracking',
      'Dashboards non maintenus',
    ],
  },
  {
    level: 3,
    name: 'Avance / SRE',
    description: 'SLOs formels, error budgets, alerting sur burn rates, PRR',
    capabilities: [
      'SLOs definis avec targets et error budgets',
      'Alerting base sur les burn rates (multi-window)',
      'Production Readiness Reviews systematiques',
      'Incident management structure (SEV levels, runbooks)',
      'Postmortems blameless reguliers',
      'Chaos engineering basique',
      'Observability as Code',
    ],
    antiPatterns: [
      'Pas de DORA metrics',
      'Pas de toil tracking',
      'PRR non obligatoire',
    ],
  },
  {
    level: 4,
    name: 'Elite / Culture SRE',
    description: 'Observabilite integree dans la culture, amelioration continue mesuree',
    capabilities: [
      'DORA metrics suivies et ameliorees',
      'Toil < 50% avec reduction active',
      'Chaos engineering en production',
      'Observability as Code avec CI/CD',
      'Auto-remediation pour les incidents communs',
      'Correlation automatique logs/metriques/traces',
      'Capacity planning proactif',
      'Equipe SRE embedded ou consultative',
    ],
    antiPatterns: [],
  },
];
```

### Calculateur de score de maturite

```typescript
interface MaturityAssessmentQuestion {
  id: string;
  question: string;
  category: string;
  weight: number;
  levelRequired: number; // Niveau minimum pour lequel cette question est pertinente
}

interface MaturityAssessmentAnswer {
  questionId: string;
  answer: boolean;
}

interface MaturityAssessmentResult {
  score: number;
  maxScore: number;
  percentage: number;
  level: number;
  levelName: string;
  strengths: string[];
  gaps: string[];
  nextActions: string[];
}

const assessmentQuestions: MaturityAssessmentQuestion[] = [
  // Niveau 1
  { id: 'Q01', question: 'Les logs sont centralises dans un outil dedie', category: 'Logging', weight: 1, levelRequired: 1 },
  { id: 'Q02', question: 'Des metriques systeme (CPU, memoire) sont collectees', category: 'Metrics', weight: 1, levelRequired: 1 },
  { id: 'Q03', question: 'Au moins une alerte est configuree', category: 'Alerting', weight: 1, levelRequired: 1 },
  { id: 'Q04', question: 'Un dashboard basique existe pour chaque service', category: 'Dashboards', weight: 1, levelRequired: 1 },
  // Niveau 2
  { id: 'Q05', question: 'Les logs sont structures (JSON) avec traceId', category: 'Logging', weight: 2, levelRequired: 2 },
  { id: 'Q06', question: 'Les metriques RED sont exposees et visualisees', category: 'Metrics', weight: 2, levelRequired: 2 },
  { id: 'Q07', question: 'Le tracing distribue est en place (OpenTelemetry)', category: 'Tracing', weight: 2, levelRequired: 2 },
  { id: 'Q08', question: 'Les 3 piliers (logs, metriques, traces) sont correles', category: 'Correlation', weight: 2, levelRequired: 2 },
  // Niveau 3
  { id: 'Q09', question: 'Des SLOs formels sont definis avec des targets', category: 'SLOs', weight: 3, levelRequired: 3 },
  { id: 'Q10', question: 'L\'alerting est base sur les burn rates SLO', category: 'Alerting', weight: 3, levelRequired: 3 },
  { id: 'Q11', question: 'Une PRR est requise avant chaque mise en production', category: 'Process', weight: 3, levelRequired: 3 },
  { id: 'Q12', question: 'Des postmortems blameless sont rediges apres chaque incident', category: 'Process', weight: 3, levelRequired: 3 },
  { id: 'Q13', question: 'L\'observabilite est definie as code (dashboards, alertes)', category: 'OaC', weight: 3, levelRequired: 3 },
  // Niveau 4
  { id: 'Q14', question: 'Les DORA metrics sont suivies et ameliorees', category: 'DORA', weight: 4, levelRequired: 4 },
  { id: 'Q15', question: 'Le chaos engineering est pratique regulierement', category: 'Chaos', weight: 4, levelRequired: 4 },
  { id: 'Q16', question: 'Le toil est mesure et activement reduit (< 50%)', category: 'Toil', weight: 4, levelRequired: 4 },
  { id: 'Q17', question: 'L\'auto-remediation est en place pour les incidents courants', category: 'Automation', weight: 4, levelRequired: 4 },
];

function calculateMaturityScore(answers: MaturityAssessmentAnswer[]): MaturityAssessmentResult {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));

  let score = 0;
  let maxScore = 0;
  const strengths: string[] = [];
  const gaps: string[] = [];

  for (const question of assessmentQuestions) {
    maxScore += question.weight;
    const answered = answerMap.get(question.id);

    if (answered) {
      score += question.weight;
      strengths.push(question.question);
    } else {
      gaps.push(`[Niveau ${question.levelRequired}] ${question.question}`);
    }
  }

  const percentage = (score / maxScore) * 100;

  // Determiner le niveau : un niveau est atteint si toutes ses questions sont validees
  let level = 0;
  for (let l = 1; l <= 4; l++) {
    const levelQuestions = assessmentQuestions.filter((q) => q.levelRequired === l);
    const allPassed = levelQuestions.every((q) => answerMap.get(q.id) === true);
    if (allPassed) level = l;
    else break;
  }

  const levelName = maturityModel[level].name;

  // Recommandations : les gaps du prochain niveau
  const nextLevel = Math.min(level + 1, 4);
  const nextActions = assessmentQuestions
    .filter((q) => q.levelRequired === nextLevel && !answerMap.get(q.id))
    .map((q) => q.question);

  return {
    score,
    maxScore,
    percentage,
    level,
    levelName,
    strengths,
    gaps,
    nextActions,
  };
}

// Exemple d'evaluation
const myAnswers: MaturityAssessmentAnswer[] = [
  { questionId: 'Q01', answer: true },
  { questionId: 'Q02', answer: true },
  { questionId: 'Q03', answer: true },
  { questionId: 'Q04', answer: true },
  { questionId: 'Q05', answer: true },
  { questionId: 'Q06', answer: true },
  { questionId: 'Q07', answer: true },
  { questionId: 'Q08', answer: false },
  { questionId: 'Q09', answer: false },
  { questionId: 'Q10', answer: false },
  { questionId: 'Q11', answer: false },
  { questionId: 'Q12', answer: true },
  { questionId: 'Q13', answer: false },
  { questionId: 'Q14', answer: false },
  { questionId: 'Q15', answer: false },
  { questionId: 'Q16', answer: false },
  { questionId: 'Q17', answer: false },
];

const result = calculateMaturityScore(myAnswers);
console.log(`\n=== EVALUATION DE MATURITE OBSERVABILITE ===`);
console.log(`Score: ${result.score}/${result.maxScore} (${result.percentage.toFixed(0)}%)`);
console.log(`Niveau: ${result.level} — ${result.levelName}`);
console.log(`\nProchaines actions pour atteindre le niveau ${result.level + 1}:`);
for (const action of result.nextActions) {
  console.log(`  - ${action}`);
}
```

---

## Bonnes pratiques

1. **PRR obligatoire** : aucun service ne doit passer en production sans PRR, meme les "petits" services
2. **PRR iterative** : la PRR n'est pas un one-shot — refaites-la a chaque changement majeur
3. **Hard vs Soft** : classifiez clairement vos dependances. Les dependances soft doivent avoir un fallback
4. **FMEA proactive** : faites l'analyse FMEA avant le premier incident, pas apres
5. **Health checks granulaires** : liveness simple, readiness avec dependances, startup pour le warmup
6. **Evitez le restart loop** : ne verifiez JAMAIS les dependances dans la liveness probe
7. **Degradation planifiee** : definissez les niveaux de degradation a l'avance, pas pendant l'incident
8. **Evaluez la maturite** : utilisez le maturity model pour identifier les gaps et planifier les ameliorations
9. **Documentez les dependances** : chaque service doit avoir une dependency map a jour
10. **Automatisez la PRR** : integrez les verifications automatisables dans la CI/CD

::: warning Le piege de la liveness probe trop stricte
Si votre liveness probe verifie la connexion a la base de donnees et que PostgreSQL tombe, Kubernetes va **redemarrer tous vos pods en boucle**. Resultat : votre service est doublement down (DB + pods en restart). La liveness probe doit uniquement verifier que le process est sain, pas ses dependances.
:::

---

::: tip A retenir
- La **PRR** est une checklist systematique avant la mise en production (Google SRE Book, Chapitre 32)
- Les categories PRR : **observabilite, scaling, securite, recovery, dependances**
- Chaque dependance **hard** sans fallback est un **SPOF** (Single Point of Failure)
- La **FMEA** evalue le risque via le RPN = severite x occurrence x detection
- La **degradation gracieuse** est planifiee a l'avance avec des niveaux clairs
- Les health checks Kubernetes : **liveness** (process vivant), **readiness** (pret a servir), **startup** (demarrage termine)
- Le **maturity model** a 5 niveaux : de reactive (0) a elite (4)
- Evaluez regulierement votre maturite et planifiez les ameliorations
:::

---

## Pour aller plus loin

- [Lab 18 — Production Readiness Review](/labs/lab-18-production-readiness/README)
- [Quiz 18 — Production Readiness](/quizzes/quiz-18-production-readiness)
- Google SRE Book, Chapitre 32 : "The Evolving SRE Engagement Model"
- Google SRE Workbook, Chapitre 8 : "On-Call"
- "Release It!" par Michael Nygard (patterns de resilience)
- Kubernetes Documentation : Configure Liveness, Readiness and Startup Probes

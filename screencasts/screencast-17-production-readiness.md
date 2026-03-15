# Screencast 18 — Production Readiness Review (PRR)

## Informations
- **Duree estimee** : 22-28 min
- **Module** : `modules/18-production-readiness.md`
- **Lab associe** : Lab 18
- **Prerequis** : Screencast 17

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] demo-app accessible sur `http://localhost:3000`
- [ ] Fichier `demo-app/src/routes/health.ts` ouvert
- [ ] Un document vide pour la checklist PRR et la matrice FMEA

## Script

### [00:00-02:30] Introduction

> Nous avons instrumente notre application, construit des dashboards, defini des SLOs, configure des alertes et automatise les configurations. La question finale est : "Ce service est-il pret pour la production ?" La Production Readiness Review (PRR) est un processus formel qui repond a cette question.

> L'analogie : avant qu'un avion ne soit autorise a voler, il passe par une checklist de verification exhaustive. Chaque systeme est teste. Chaque procedure de secours est verifiee. La PRR est cette checklist pour vos services.

### [02:30-07:00] La checklist PRR — Categories

**Action** : Parcourir les categories de la checklist.

```typescript
// Production Readiness Review — Categories
interface PRRChecklist {
  categories: Array<{
    name: string;
    description: string;
    items: Array<{
      requirement: string;
      status: 'pass' | 'fail' | 'partial' | 'na';
      notes: string;
    }>;
  }>;
}

const prrChecklist: PRRChecklist = {
  categories: [
    {
      name: 'Observabilite',
      description: 'Le service est-il observable ?',
      items: [
        { requirement: 'Logging structure avec correlation IDs', status: 'pass', notes: 'Pino configure avec requestId' },
        { requirement: 'Metriques Prometheus exposees', status: 'pass', notes: 'Counter, Gauge, Histogram via prom-client' },
        { requirement: 'Traces OpenTelemetry configurees', status: 'pass', notes: 'Auto-instrumentation + spans manuels' },
        { requirement: 'Dashboard RED operationnel', status: 'pass', notes: 'Dashboard genere automatiquement' },
        { requirement: 'SLOs definis et mesures', status: 'pass', notes: '99.9% availability, 99% latency p99 < 500ms' },
        { requirement: 'Alertes burn rate configurees', status: 'pass', notes: '4 niveaux de burn rate' },
        { requirement: 'Runbooks ecrits pour chaque alerte', status: 'partial', notes: '2 alertes sur 4 ont un runbook' },
      ],
    },
    {
      name: 'Fiabilite',
      description: 'Le service est-il resilient ?',
      items: [
        { requirement: 'Health checks (liveness, readiness, startup)', status: 'fail', notes: 'A implementer' },
        { requirement: 'Graceful shutdown implemente', status: 'pass', notes: 'SIGTERM gere' },
        { requirement: 'Circuit breaker sur les dependances', status: 'pass', notes: 'Implemente module 15' },
        { requirement: 'Retries avec backoff exponentiel', status: 'partial', notes: 'Retries simples, pas de backoff' },
        { requirement: 'Timeouts configures sur tous les appels externes', status: 'fail', notes: 'Manquant' },
        { requirement: 'Tests de charge executes', status: 'pass', notes: 'k6 — 150 VUs avant degradation' },
        { requirement: 'Chaos testing effectue', status: 'pass', notes: 'Game Day module 15' },
      ],
    },
    {
      name: 'Securite',
      description: 'Le service est-il securise ?',
      items: [
        { requirement: 'Pas de secrets en dur dans le code', status: 'pass', notes: 'Variables d environnement' },
        { requirement: 'Endpoints admin proteges', status: 'partial', notes: '/admin/chaos non authentifie (action item PM)' },
        { requirement: 'Dependances a jour (pas de CVE critiques)', status: 'pass', notes: 'npm audit clean' },
        { requirement: 'Rate limiting configure', status: 'fail', notes: 'A implementer' },
      ],
    },
    {
      name: 'Operationnel',
      description: 'Le service est-il operable ?',
      items: [
        { requirement: 'Documentation d architecture a jour', status: 'partial', notes: 'Diagramme existant mais incomplet' },
        { requirement: 'Procedure de rollback documentee', status: 'pass', notes: 'Rollback Docker image tag' },
        { requirement: 'Rotation d astreinte en place', status: 'fail', notes: 'Pas encore definie' },
        { requirement: 'Capacite suffisante pour 2x le trafic actuel', status: 'pass', notes: 'k6 confirme' },
      ],
    },
  ],
};
```

> Quatre categories : Observabilite, Fiabilite, Securite, Operationnel. Chaque item est evalue : pass, fail, partial ou non applicable. Les "fail" sont des bloquants — le service ne peut pas aller en production tant qu'ils ne sont pas resolus.

### [07:00-12:00] Implementer les health checks

> Le health check est un "fail" dans notre checklist. Corrigeons-le. Il y a trois types de health checks, chacun avec un objectif different.

**Action** : Ouvrir `demo-app/src/routes/health.ts` et implementer les trois endpoints.

```typescript
// demo-app/src/routes/health.ts
import { Router } from 'express';

const router = Router();

// --- LIVENESS ---
// "Est-ce que le processus est vivant ?"
// Si non → Kubernetes redemarrage le pod
// Doit etre ultra-simple — pas de verification de dependances
router.get('/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// --- READINESS ---
// "Est-ce que le service peut traiter des requetes ?"
// Si non → Kubernetes arrete d'envoyer du trafic vers ce pod
// Verifie les dependances critiques (DB, cache, services essentiels)
router.get('/ready', async (_req, res) => {
  const checks = {
    database: await checkDatabase(),
    cache: await checkCache(),
  };

  const isReady = Object.values(checks).every(c => c.status === 'ok');

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

// --- STARTUP ---
// "Est-ce que le service a fini de demarrer ?"
// Si non → Kubernetes attend avant de commencer les checks liveness/readiness
// Utile pour les services avec un long temps de demarrage (cache warming, migrations)
let isStarted = false;

router.get('/startup', (_req, res) => {
  res.status(isStarted ? 200 : 503).json({
    status: isStarted ? 'started' : 'starting',
    timestamp: new Date().toISOString(),
  });
});

// Appele quand le serveur est pret
export function markAsStarted(): void {
  isStarted = true;
}

// Fonctions de verification des dependances
async function checkDatabase(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    // Simuler un ping a la base de donnees
    // En production : await db.query('SELECT 1')
    await new Promise(resolve => setTimeout(resolve, 5));
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error' };
  }
}

async function checkCache(): Promise<{ status: string; latency?: number }> {
  const start = Date.now();
  try {
    // Simuler un ping au cache Redis
    // En production : await redis.ping()
    await new Promise(resolve => setTimeout(resolve, 2));
    return { status: 'ok', latency: Date.now() - start };
  } catch {
    return { status: 'error' };
  }
}

export default router;
```

> Trois endpoints, trois objectifs. Le liveness dit "je suis vivant" — si le processus est bloque (deadlock, boucle infinie), il repond timeout et Kubernetes redemarrage le pod. Le readiness dit "je peux traiter du trafic" — si la base de donnees est down, le pod est retire du load balancer mais pas redemarrage. Le startup dit "j'ai fini de demarrer" — pour les services avec un long temps de demarrage.

**Action** : Tester les endpoints.

```bash
# Liveness
curl http://localhost:3000/health/live
# {"status":"ok","timestamp":"2024-01-15T10:00:00.000Z"}

# Readiness
curl http://localhost:3000/health/ready
# {"status":"ready","timestamp":"...","checks":{"database":{"status":"ok","latency":5},"cache":{"status":"ok","latency":2}}}

# Startup
curl http://localhost:3000/health/startup
# {"status":"started","timestamp":"..."}
```

> Tous les endpoints repondent correctement. Le health check passe de "fail" a "pass" dans notre checklist.

### [12:00-16:00] Cartographier les dependances

**Action** : Dessiner la carte des dependances du service.

```typescript
// Carte des dependances de la demo-app
interface ServiceDependency {
  name: string;
  type: 'synchronous' | 'asynchronous';
  criticality: 'critical' | 'degraded' | 'cosmetic';
  fallback: string;
  timeout: string;
  healthCheck: string;
}

const dependencies: ServiceDependency[] = [
  {
    name: 'Base de donnees (simulated)',
    type: 'synchronous',
    criticality: 'critical',
    fallback: 'Service indisponible (503)',
    timeout: '5s',
    healthCheck: '/health/ready verifie la connexion DB',
  },
  {
    name: 'Cache Redis (simulated)',
    type: 'synchronous',
    criticality: 'degraded',
    fallback: 'Bypass cache, requete directe DB (plus lent)',
    timeout: '1s',
    healthCheck: '/health/ready verifie le ping Redis',
  },
  {
    name: 'OpenTelemetry Collector',
    type: 'asynchronous',
    criticality: 'cosmetic',
    fallback: 'Traces perdues mais service fonctionnel',
    timeout: '10s',
    healthCheck: 'Pas de health check necessaire (fire-and-forget)',
  },
  {
    name: 'Prometheus (scrape)',
    type: 'synchronous',
    criticality: 'cosmetic',
    fallback: 'Metriques temporairement indisponibles',
    timeout: 'N/A (pull model)',
    healthCheck: 'Prometheus verifie lui-meme',
  },
];
```

> La cartographie des dependances est essentielle pour la PRR. Pour chaque dependance, on documente : le type (synchrone ou asynchrone), la criticite (critique, degradee, cosmetique), le fallback si elle est indisponible, et le timeout configure.

```
                    ┌───────────────────┐
                    │    Utilisateur     │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │    demo-app       │
                    │   :3000           │
                    └───┬──────┬───┬────┘
                        │      │   │
              ┌─────────▼┐  ┌──▼───▼─────────┐
              │  Database │  │  Cache Redis   │
              │ (critical)│  │  (degraded)    │
              └──────────┘  └────────────────┘
                        │
              ┌─────────▼────────────┐
              │  OTel Collector      │
              │  (cosmetic)          │
              └──────────────────────┘
```

### [16:00-20:00] Analyse FMEA — Failure Mode and Effects Analysis

**Action** : Realiser une analyse FMEA.

```typescript
// FMEA — Failure Mode and Effects Analysis
interface FMEAEntry {
  component: string;
  failureMode: string;
  effect: string;
  severity: number;     // 1-10 (10 = catastrophique)
  probability: number;  // 1-10 (10 = tres frequent)
  detection: number;    // 1-10 (10 = impossible a detecter)
  rpn: number;          // Risk Priority Number = S * P * D
  mitigation: string;
}

const fmeaAnalysis: FMEAEntry[] = [
  {
    component: 'Base de donnees',
    failureMode: 'Connexion refusee (DB down)',
    effect: 'Toutes les requetes echouent — 100% error rate',
    severity: 9,
    probability: 3,
    detection: 2,    // Detecte immediatement par /health/ready et alertes
    rpn: 54,         // 9 * 3 * 2
    mitigation: 'Health check readiness + alerte burn rate + runbook',
  },
  {
    component: 'Base de donnees',
    failureMode: 'Requetes lentes (DB surchargee)',
    effect: 'Latence p99 depasse le SLO, timeout pour certains utilisateurs',
    severity: 6,
    probability: 5,
    detection: 3,    // Detecte par les metriques de latence
    rpn: 90,         // 6 * 5 * 3 — RISQUE ELEVE
    mitigation: 'Timeout + circuit breaker + alerte latence + scaling DB',
  },
  {
    component: 'Cache Redis',
    failureMode: 'Cache indisponible',
    effect: 'Service degrade — latence plus elevee mais fonctionnel',
    severity: 4,
    probability: 3,
    detection: 2,
    rpn: 24,         // Risque faible
    mitigation: 'Fallback vers DB directe + alerte sur miss rate',
  },
  {
    component: 'OTel Collector',
    failureMode: 'Collector crash ou surcharge',
    effect: 'Perte de traces — pas d impact utilisateur',
    severity: 2,
    probability: 2,
    detection: 4,    // Detecte par absence de donnees dans Jaeger
    rpn: 16,         // Risque tres faible
    mitigation: 'SDK OTel non-bloquant + monitoring collector health',
  },
  {
    component: 'demo-app',
    failureMode: 'Memory leak (heap en croissance continue)',
    effect: 'OOM kill apres plusieurs heures/jours',
    severity: 8,
    probability: 4,
    detection: 3,    // Detecte par predict_linear sur heap
    rpn: 96,         // 8 * 4 * 3 — RISQUE ELEVE
    mitigation: 'Alerte predictive + restart automatique + profiling',
  },
];

// Trier par RPN decroissant (plus critique en premier)
fmeaAnalysis.sort((a, b) => b.rpn - a.rpn);

// Les risques les plus eleves
// 1. Memory leak (RPN 96) — Ajouter predict_linear + restart
// 2. DB surchargee (RPN 90) — Ajouter timeout + circuit breaker
// 3. DB down (RPN 54) — Deja couvert par health check + alertes
```

> Le RPN (Risk Priority Number) est le produit de trois scores : Severite, Probabilite et Detection. Plus le RPN est eleve, plus le risque est prioritaire. Les deux risques les plus eleves sont le memory leak (96) et la DB surchargee (90). Ce sont les actions a traiter en priorite avant la mise en production.

### [20:00-24:00] Scorer la production readiness

**Action** : Calculer le score global.

```typescript
// Scoring de la Production Readiness
function calculatePRRScore(checklist: PRRChecklist): {
  score: number;
  maxScore: number;
  percentage: number;
  blockers: string[];
  recommendation: 'go' | 'conditional' | 'no-go';
} {
  let score = 0;
  let maxScore = 0;
  const blockers: string[] = [];

  for (const category of checklist.categories) {
    for (const item of category.items) {
      if (item.status === 'na') continue;

      maxScore += 1;
      if (item.status === 'pass') score += 1;
      else if (item.status === 'partial') score += 0.5;
      else if (item.status === 'fail') {
        blockers.push(`[${category.name}] ${item.requirement}`);
      }
    }
  }

  const percentage = (score / maxScore) * 100;

  let recommendation: 'go' | 'conditional' | 'no-go';
  if (blockers.length === 0 && percentage >= 90) {
    recommendation = 'go';
  } else if (blockers.length <= 2 && percentage >= 75) {
    recommendation = 'conditional';
  } else {
    recommendation = 'no-go';
  }

  return { score, maxScore, percentage, blockers, recommendation };
}

// Resultat apres avoir implemente les health checks
// Score : 17.5 / 22 = 79.5%
// Blockers restants :
//   - [Fiabilite] Timeouts configures sur tous les appels externes
//   - [Securite] Rate limiting configure
//   - [Operationnel] Rotation d'astreinte en place
// Recommendation : CONDITIONAL
// → Le service peut aller en production avec un plan d'action
//   pour les blockers restants dans les 2 semaines suivantes
```

> Le score de 79.5% avec 3 blockers donne une recommandation "conditional". Le service peut aller en production si les blockers sont traites dans un delai convenu. Un "no-go" signifie qu'il faut resoudre les blockers avant. Un "go" signifie que tout est bon.

### [24:00-26:30] Recapitulatif

> Recapitulons. La Production Readiness Review est une checklist structuree en quatre categories : Observabilite, Fiabilite, Securite, Operationnel. Les health checks (liveness, readiness, startup) sont un element fondamental de la fiabilite. La cartographie des dependances identifie les points de defaillance et les fallbacks. L'analyse FMEA priorise les risques par RPN.

> Le score global donne une recommandation : go, conditional ou no-go. Ce n'est pas un exercice bureaucratique — c'est un filet de securite qui evite de deployer un service non prepare en production.

> Dans le prochain et dernier module, nous assemblerons tout dans le projet final. Faites le Lab 18 pour realiser votre propre PRR !

## Points d'attention pour l'enregistrement
- La checklist PRR doit etre parcourue methodiquement — ne pas survoler les items
- L'implementation des health checks est un livrable concret — montrer le code et les tests curl
- Bien distinguer liveness, readiness et startup — chaque endpoint a un role precis
- La carte des dependances est visuelle — prendre le temps de la dessiner
- L'analyse FMEA avec le RPN est une methode industrielle — expliquer le calcul
- Le scoring final avec la recommandation go/conditional/no-go est le point culminant
- Montrer que la PRR n'est pas bureaucratique mais protectrice
- Lier les items de la checklist aux modules precedents du cours

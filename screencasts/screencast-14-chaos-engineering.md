# Screencast 15 — Chaos Engineering

## Informations
- **Duree estimee** : 22-28 min
- **Module** : `modules/15-chaos-engineering.md`
- **Lab associe** : Lab 15
- **Prerequis** : Screencast 14

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (3 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Grafana ouvert avec le dashboard RED (`http://localhost:3001`)
- [ ] Prometheus ouvert (`http://localhost:9090`)
- [ ] Jaeger ouvert (`http://localhost:16686`)
- [ ] demo-app accessible sur `http://localhost:3000`
- [ ] Fichier `demo-app/src/middleware/chaos.ts` pret a etre cree

## Script

### [00:00-02:30] Introduction

> Nous savons mesurer la fiabilite, alerter sur les degradations, gerer les incidents et tester la capacite. Mais il y a une question fondamentale qu'aucun test unitaire ou test de charge ne peut poser : "Que se passe-t-il quand le systeme echoue partiellement ?"

> Le chaos engineering repond a cette question en provoquant des pannes controlees. L'analogie : les pompiers allument des feux controles pour empecher les mega-incendies. Les pilotes s'entrainent aux pannes moteur dans des simulateurs. Le chaos engineering, c'est l'equivalent pour vos systemes de production.

> C'est Netflix qui a popularise cette pratique avec Chaos Monkey — un programme qui eteint aleatoirement des instances en production pendant les heures de bureau. L'idee est simple : si votre service ne survit pas a la perte d'une instance, il faut le corriger maintenant, pas a 3h du matin.

### [02:30-06:00] Ajouter le middleware de chaos a la demo-app

**Action** : Creer le fichier `demo-app/src/middleware/chaos.ts`.

```typescript
// demo-app/src/middleware/chaos.ts
import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '../lib/logger.ts';

interface ChaosConfig {
  enabled: boolean;
  latencyMs: number;       // Latence ajoutee en millisecondes
  latencyJitter: number;   // Variation aleatoire de la latence
  errorRate: number;        // Pourcentage de requetes qui echouent (0.0 - 1.0)
  errorCode: number;        // Code d'erreur retourne (500, 503, etc.)
  expiresAt?: number;       // Timestamp d'expiration automatique
}

let chaosConfig: ChaosConfig = {
  enabled: false,
  latencyMs: 0,
  latencyJitter: 0,
  errorRate: 0,
  errorCode: 500,
};

// Middleware de chaos
export function chaosMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Verifier l'expiration
  if (chaosConfig.expiresAt && Date.now() > chaosConfig.expiresAt) {
    chaosConfig.enabled = false;
    logger.info('Chaos mode expired automatically');
  }

  if (!chaosConfig.enabled) {
    return next();
  }

  // Injection de latence
  if (chaosConfig.latencyMs > 0) {
    const jitter = Math.random() * chaosConfig.latencyJitter;
    const delay = chaosConfig.latencyMs + jitter;
    logger.warn({ delay }, 'Chaos: injecting latency');

    setTimeout(() => {
      injectError(req, res, next);
    }, delay);
    return;
  }

  injectError(req, res, next);
}

function injectError(req: Request, res: Response, next: NextFunction): void {
  // Injection d'erreur
  if (Math.random() < chaosConfig.errorRate) {
    logger.warn({ errorCode: chaosConfig.errorCode }, 'Chaos: injecting error');
    res.status(chaosConfig.errorCode).json({
      error: 'Chaos injection',
      message: 'This error was injected by chaos middleware',
    });
    return;
  }

  next();
}

// API pour activer/desactiver le chaos
export function getChaosConfig(): ChaosConfig {
  return { ...chaosConfig };
}

export function setChaosConfig(config: Partial<ChaosConfig>): ChaosConfig {
  chaosConfig = { ...chaosConfig, ...config };

  // Ajouter une expiration automatique de 30 minutes si non specifiee
  if (chaosConfig.enabled && !chaosConfig.expiresAt) {
    chaosConfig.expiresAt = Date.now() + 30 * 60 * 1000;
  }

  logger.info({ chaosConfig }, 'Chaos config updated');
  return { ...chaosConfig };
}
```

> Plusieurs garde-fous sont integres. L'expiration automatique de 30 minutes evite de laisser le chaos actif par erreur — c'est la lecon du postmortem du module 13. Chaque injection est loggee pour le diagnostic.

### [06:00-09:00] Definir l'hypothese d'etat stable (Steady State Hypothesis)

> Le chaos engineering est une discipline scientifique. Avant toute experience, on definit une hypothese : "Notre systeme maintiendra son etat stable malgre la perturbation."

**Action** : Ecrire l'hypothese d'etat stable.

```typescript
// Steady State Hypothesis
const steadyStateHypothesis = {
  // Etat stable = les SLOs sont respectes
  conditions: [
    {
      metric: 'Latence p99',
      threshold: '< 500ms',
      query: 'histogram_quantile(0.99, sum(rate(demo_app_http_request_duration_seconds_bucket[5m])) by (le))',
    },
    {
      metric: 'Taux d erreur',
      threshold: '< 0.1%',
      query: 'sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(demo_app_http_requests_total[5m])) * 100',
    },
    {
      metric: 'Debit',
      threshold: '> 10 req/s',
      query: 'sum(rate(demo_app_http_requests_total[5m]))',
    },
  ],

  hypothesis: `Avec une injection de latence de 200ms sur 10% des requetes,
    le systeme maintiendra un p99 < 500ms et un taux d erreur < 0.1%.`,
};
```

> L'hypothese est falsifiable — on peut la verifier ou la refuter avec des donnees. C'est la base de la methode scientifique appliquee a l'ingenierie.

### [09:00-14:00] Game Day — Executer l'experience de chaos

**Action** : D'abord, etablir la baseline en envoyant du trafic normal.

```bash
# Terminal 1 : trafic continu (baseline)
while true; do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
  sleep 0.1
done
```

**Action** : Observer les metriques baseline dans Grafana.

> L'etat stable est confirme : p99 autour de 50ms, error rate a 0%, debit stable a environ 10 req/s. Notons ces valeurs.

**Action** : Activer l'injection de latence.

```bash
# Terminal 2 : activer le chaos — 200ms de latence sur 20% des requetes
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "latencyMs": 200,
    "latencyJitter": 100,
    "errorRate": 0,
    "errorCode": 500
  }'
```

**Action** : Observer l'impact dans Grafana.

> La latence p99 monte. Elle passe de 50ms a environ 300ms. Le p50 bouge peu — seul 20% du trafic est ralenti. Le debit reste stable. Pas d'erreurs. L'hypothese tient : le p99 est a 300ms, en dessous du seuil de 500ms.

**Action** : Augmenter l'intensite — ajouter des erreurs.

```bash
# Augmenter le chaos — ajouter 10% d'erreurs
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "latencyMs": 200,
    "latencyJitter": 100,
    "errorRate": 0.1,
    "errorCode": 500
  }'
```

**Action** : Observer l'impact dans Grafana.

> Maintenant, le taux d'erreur monte a environ 10%. L'hypothese est refutee pour le taux d'erreur — 10% depasse largement notre seuil de 0.1%. Le p99 est aussi affecte car les erreurs sont rapides (pas de latence ajoutee). Le SLO est viole. Il nous faut un mecanisme de resilience.

### [14:00-18:00] Implementer le circuit breaker

**Action** : Ecrire un circuit breaker simple.

```typescript
// demo-app/src/lib/circuit-breaker.ts

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;    // Nombre d'echecs avant ouverture
  resetTimeout: number;        // Temps avant de tester a nouveau (ms)
  monitorWindow: number;       // Fenetre de comptage des erreurs (ms)
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = [];
  private lastFailureTime: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    // Nettoyer les vieux echecs
    const now = Date.now();
    this.failures = this.failures.filter(t => now - t < this.config.monitorWindow);

    // Si le circuit est ouvert
    if (this.state === 'open') {
      // Verifier si le timeout de reset est passe
      if (now - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
        // Tenter une requete test
      } else {
        // Retourner le fallback sans appeler la fonction
        return fallback();
      }
    }

    try {
      const result = await fn();
      // Succes : si half-open, revenir a closed
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = [];
      }
      return result;
    } catch (error) {
      this.failures.push(now);
      this.lastFailureTime = now;

      // Verifier le seuil
      if (this.failures.length >= this.config.failureThreshold) {
        this.state = 'open';
      }

      return fallback();
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Utilisation
const breaker = new CircuitBreaker({
  failureThreshold: 5,      // 5 echecs = circuit ouvert
  resetTimeout: 30_000,     // Reessayer apres 30 secondes
  monitorWindow: 60_000,    // Compter les echecs sur 1 minute
});
```

> Le circuit breaker a trois etats. Ferme (closed) : tout fonctionne, les requetes passent. Ouvert (open) : trop d'echecs, les requetes sont immediatement retournees avec un fallback. Semi-ouvert (half-open) : apres le timeout, on tente une requete pour voir si le service est retabli.

> C'est comme un disjoncteur electrique : quand trop de courant passe, il coupe le circuit pour proteger l'installation. Quand vous le rearmez, il teste et revient a la normale si tout va bien.

### [18:00-22:00] Rejouer l'experience avec le circuit breaker

**Action** : Reactiver le chaos et observer le comportement avec le circuit breaker.

```bash
# Reactiver le chaos — 30% d'erreurs
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "latencyMs": 0,
    "latencyJitter": 0,
    "errorRate": 0.3,
    "errorCode": 500
  }'
```

**Action** : Observer dans Grafana avec le circuit breaker actif.

> Avec le circuit breaker, le comportement change. Apres 5 erreurs consecutives, le circuit s'ouvre. Les requetes suivantes obtiennent immediatement le fallback — une reponse degradee mais rapide. Le taux d'erreur se stabilise. La latence ne s'effondre pas.

> Apres 30 secondes, le circuit passe en half-open. Si la requete test reussit, le circuit se referme. Si elle echoue, il reste ouvert pour 30 secondes de plus.

**Action** : Desactiver le chaos et montrer la recuperation.

```bash
# Desactiver le chaos
curl -X POST http://localhost:3000/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

> Le circuit breaker detecte le retour a la normale via la requete half-open. Le circuit se referme. Le service revient a 100% de fonctionnement. La recuperation est automatique.

### [22:00-25:00] Bonnes pratiques et modele de maturite

**Action** : Montrer le modele de maturite.

```typescript
// Modele de maturite en chaos engineering
const maturityLevels = [
  {
    level: 1,
    name: 'Exploration',
    practices: [
      'Chaos en environnement de test uniquement',
      'Injection manuelle (comme notre middleware)',
      'Observation manuelle des resultats',
    ],
  },
  {
    level: 2,
    name: 'Game Days',
    practices: [
      'Experiences planifiees avec hypotheses documentees',
      'Toute l equipe participe',
      'Resultats partages en postmortem',
    ],
  },
  {
    level: 3,
    name: 'Automatisation',
    practices: [
      'Chaos automatise en CI/CD',
      'Execution reguliere en production',
      'Rollback automatique si SLOs violes',
    ],
  },
  {
    level: 4,
    name: 'Culture',
    practices: [
      'Chaos continu en production',
      'Resilience testee a chaque deploiement',
      'Les pannes sont des non-evenements',
    ],
  },
];
```

> Commencez au niveau 1. Ne sautez pas directement au chaos en production. Maitrisez d'abord les experiences en environnement de test, puis planifiez des Game Days avec l'equipe, puis automatisez progressivement.

### [25:00-27:00] Recapitulatif

> Recapitulons. Le chaos engineering est une discipline scientifique : hypothese, experience, analyse. Le middleware de chaos injecte de la latence et des erreurs de maniere controlee. L'hypothese d'etat stable definit les conditions de succes avant l'experience.

> Le circuit breaker est un pattern de resilience essentiel : il protege le systeme en coupant les appels vers un service defaillant et en retournant un fallback. La recuperation est automatique via l'etat half-open.

> Commencez au niveau 1 de maturite et progressez graduellement. Le chaos engineering n'est pas du sabotage — c'est de la prevention.

> Dans le prochain module, nous decouvrons les metriques DORA et la reduction du toil. Faites le Lab 15 pour implementer votre propre chaos middleware et circuit breaker !

**Action** : Arreter le trafic continu avec Ctrl+C.

## Points d'attention pour l'enregistrement
- Le middleware de chaos doit etre explique ligne par ligne — c'est un livrable concret
- L'hypothese d'etat stable doit etre ecrite AVANT l'experience — c'est la methode scientifique
- Montrer la baseline (avant chaos) puis l'impact (pendant chaos) dans Grafana
- Le circuit breaker est le concept cle de ce module — prendre le temps de l'expliquer avec l'analogie du disjoncteur
- Montrer les trois etats du circuit breaker : closed → open → half-open → closed
- La recuperation automatique apres desactivation du chaos est un moment satisfaisant
- L'expiration automatique du chaos (lecon du postmortem) montre la continuite entre les modules
- Ne pas oublier de stopper le trafic continu a la fin

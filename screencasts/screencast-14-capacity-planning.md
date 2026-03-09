# Screencast 14 — Capacity Planning & Load Testing (k6)

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/14-capacity-planning.md`
- **Lab associe** : Lab 14
- **Prerequis** : Screencast 13

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (3 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Grafana ouvert avec le dashboard RED (`http://localhost:3001`)
- [ ] Prometheus ouvert (`http://localhost:9090`)
- [ ] k6 installe (`k6 version`)
- [ ] demo-app accessible sur `http://localhost:3000`

## Script

### [00:00-02:30] Introduction

> Nous savons mesurer la fiabilite (SLOs), alerter sur les degradations (burn rate), gerer les incidents et ecrire des postmortems. Mais comment anticiper les problemes avant qu'ils ne surviennent ? Le capacity planning repond a deux questions : quand nos ressources seront-elles insuffisantes ? Et combien de charge notre systeme peut-il supporter avant de degrader ?

> L'analogie du parking : vous gerez un parking de 100 places. Chaque jour, 10 nouvelles voitures s'inscrivent. Si vous ne faites rien, dans 10 jours le parking est plein. Le capacity planning, c'est regarder la tendance aujourd'hui pour agir avant la saturation.

### [02:30-06:00] predict_linear() — Anticiper avec PromQL

> Prometheus offre une fonction puissante : `predict_linear()`. Elle projette une serie temporelle dans le futur en utilisant une regression lineaire.

**Action** : Montrer predict_linear dans Prometheus.

```
# Quand la memoire heap atteindra-t-elle 500 Mo ?
# predict_linear projette la valeur dans 24h (86400 secondes) basee sur les 6 dernieres heures
predict_linear(demo_app_nodejs_heap_size_used_bytes[6h], 86400)
```

> Cette requete dit : "En regardant la tendance des 6 dernieres heures, quelle sera la memoire heap dans 24 heures ?" Si la valeur projetee depasse votre capacite, il est temps d'agir.

**Action** : Creer des alertes predictives.

```
# Alerte : le disque sera plein dans moins de 4 heures
predict_linear(node_filesystem_avail_bytes[6h], 4 * 3600) < 0

# Alerte : la memoire heap depassera 500 Mo dans 24h
predict_linear(demo_app_nodejs_heap_size_used_bytes[6h], 86400) > 500 * 1024 * 1024
```

> Les alertes predictives sont un game-changer. Au lieu de reagir quand le disque est plein a 95%, vous etes prevenu 4 heures avant. Ca vous laisse le temps d'agir pendant les heures de bureau, pas a 3h du matin.

**Action** : Montrer le graphique dans Prometheus avec la projection.

```
# Visualiser la tendance actuelle et la projection
demo_app_nodejs_heap_size_used_bytes
# vs
predict_linear(demo_app_nodejs_heap_size_used_bytes[6h], 86400)
```

> Le graphique montre la courbe actuelle et la ligne de projection. Si la ligne de projection croise un seuil critique, l'alerte se declenche.

### [06:00-10:00] Introduction a k6 — Tests de charge en TypeScript

> k6 est un outil de tests de charge open-source. Il utilise JavaScript/TypeScript pour definir les scenarios. Contrairement a JMeter ou Locust, k6 est concu pour les developpeurs — le script est du code, versionne dans Git, et executable en CI/CD.

**Action** : Ecrire un premier script k6.

```typescript
// scripts/k6/load-test.ts
import http from 'k6/http';
import { check, sleep } from 'k6';

// Scenarios de charge
export const options = {
  scenarios: {
    // Scenario 1 : Ramp-up progressif
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Montee a 10 VUs en 30s
        { duration: '1m',  target: 10 },   // Palier a 10 VUs pendant 1 min
        { duration: '30s', target: 50 },   // Montee a 50 VUs en 30s
        { duration: '1m',  target: 50 },   // Palier a 50 VUs pendant 1 min
        { duration: '30s', target: 0 },    // Descente a 0 VUs en 30s
      ],
    },
  },

  // Seuils de reussite
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // p95 < 500ms, p99 < 1s
    http_req_failed: ['rate<0.01'],                   // Moins de 1% d'erreurs
  },
};

export default function () {
  // Requetes simulant un utilisateur typique
  const productsRes = http.get('http://localhost:3000/api/products');
  check(productsRes, {
    'products status 200': (r) => r.status === 200,
    'products duration < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1); // Pause entre les actions (think time)

  const ordersRes = http.get('http://localhost:3000/api/orders');
  check(ordersRes, {
    'orders status 200': (r) => r.status === 200,
  });

  sleep(1);
}
```

> Les Virtual Users (VUs) simulent des utilisateurs concurrents. Chaque VU execute la fonction `default` en boucle. Le `sleep(1)` simule le temps de reflexion entre les actions — un vrai utilisateur ne clique pas 100 fois par seconde.

### [10:00-14:00] Executer le test et observer en temps reel

**Action** : Lancer le test k6.

```bash
k6 run scripts/k6/load-test.ts
```

**Action** : Observer en parallele dans Grafana le dashboard RED.

> Pendant que k6 envoie du trafic, observons le dashboard RED. Le Request Rate monte progressivement pendant le ramp-up. A 10 VUs, le debit est stable. A 50 VUs, le debit augmente encore — mais surveillez la latence et les erreurs.

**Action** : Commenter les resultats k6 en temps reel.

> k6 affiche les resultats en live : le nombre de VUs, les requetes par seconde, la latence p95 et p99. Si un threshold est viole, k6 le signale avec un indicateur rouge.

**Action** : Attendre la fin du test et analyser le resume.

```
# Sortie typique de k6
     checks.........................: 100.00% ✓ 1234  ✗ 0
     http_req_duration..............: avg=45ms  min=3ms  p(90)=120ms  p(95)=210ms  p(99)=450ms
     http_req_failed................: 0.00%   ✓ 0      ✗ 1234
     http_reqs......................: 1234    20.5/s
     vus............................: 50      min=0    max=50
```

> Analyse : p95 a 210ms, p99 a 450ms, 0% d'erreurs. Les thresholds sont respectes. Notre application supporte 50 VUs sans probleme.

### [14:00-18:00] Scenarios avances — Steady-state et Spike

**Action** : Ecrire un scenario de spike test.

```typescript
// scripts/k6/spike-test.ts
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },   // Trafic normal
        { duration: '1m',  target: 10 },   // Palier normal
        { duration: '10s', target: 200 },  // SPIKE — montee brutale a 200 VUs
        { duration: '30s', target: 200 },  // Maintenir le pic
        { duration: '10s', target: 10 },   // Retour a la normale
        { duration: '1m',  target: 10 },   // Palier de recuperation
        { duration: '30s', target: 0 },    // Descente
      ],
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],  // Jusqu'a 5% d'erreurs pendant le spike
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/products');
  check(res, {
    'status 200': (r) => r.status === 200,
    'duration < 1s': (r) => r.timings.duration < 1000,
  });
  sleep(0.5);
}
```

**Action** : Lancer le spike test.

```bash
k6 run scripts/k6/spike-test.ts
```

**Action** : Observer dans Grafana le comportement pendant le spike.

> Pendant le spike a 200 VUs, observez la latence qui augmente brutalement. L'event loop lag de Node.js monte. Le taux d'erreur peut apparaitre si l'application n'arrive plus a traiter toutes les requetes. C'est exactement ce qu'on cherche — le point de rupture.

### [18:00-21:00] Analyser les resultats — Trouver les limites

**Action** : Comparer les resultats avant et pendant le spike.

```typescript
// Analyse des resultats
const analysis = {
  normalLoad: {
    vus: 10,
    rps: 20,
    p95: '120ms',
    p99: '250ms',
    errorRate: '0%',
    verdict: 'Sain — bien en dessous des SLOs',
  },
  spikeLoad: {
    vus: 200,
    rps: 180,
    p95: '1200ms',     // Depassement du SLO de latence
    p99: '3500ms',     // Tres au-dessus du seuil de 500ms
    errorRate: '3.2%',
    verdict: 'Degrade — SLO de latence viole, error budget consomme',
  },
  breakingPoint: {
    vus: 150,         // Estimation du point de rupture
    observation: 'A partir de 150 VUs, la latence p99 depasse 1 seconde',
    action: 'Scaler horizontalement ou optimiser avant d atteindre ce trafic',
  },
};
```

> Le point de degradation est a environ 150 VUs. Au-dela, la latence explose et les erreurs apparaissent. Si votre trafic de production est a 50 VUs en temps normal et 120 VUs pendant les pics (Black Friday), vous avez une marge confortable. Mais si les projections montrent 200 VUs dans 3 mois, il faut agir maintenant.

### [21:00-23:00] Combiner predict_linear et k6

> Le capacity planning combine les deux approches : predict_linear dit "quand" et k6 dit "combien".

**Action** : Montrer la synthese.

```typescript
// Synthese capacity planning
const capacityPlan = {
  // predict_linear repond a : "Quand atteindrons-nous la limite ?"
  prediction: {
    currentTraffic: '50 VUs moyen, 120 VUs en pic',
    growthRate: '+10% par mois',
    breakingPoint: '150 VUs',
    timeToBreak: 'Dans 3-4 mois au rythme actuel',
  },

  // k6 repond a : "Que se passe-t-il quand on atteint la limite ?"
  loadTest: {
    at150VUs: 'Latence p99 depasse 1s, premieres erreurs',
    at200VUs: 'Latence p99 a 3.5s, 3% d erreurs, SLO viole',
  },

  // Decisions
  decisions: [
    'Court terme (1 mois) : optimiser les requetes DB lentes identifiees par les traces',
    'Moyen terme (3 mois) : ajouter un deuxieme replica de la demo-app',
    'Long terme (6 mois) : implementer du caching Redis pour les requetes frequentes',
  ],
};
```

> Le capacity planning n'est pas un exercice ponctuel. C'est un processus continu : tester regulierement, comparer avec les projections de trafic, et planifier les actions en avance.

### [23:00-24:30] Recapitulatif

> Recapitulons. Le capacity planning anticipe les problemes avant qu'ils ne surviennent. `predict_linear()` en PromQL projette les tendances dans le futur. k6 permet de tester les limites de votre systeme avec des scenarios realistes : ramp-up progressif, palier stable, spike brutal.

> L'analyse des resultats identifie le point de degradation et le point de rupture. Combiner les projections de trafic et les resultats de charge permet de planifier les actions : optimisation, scaling, caching.

> Dans le prochain module, nous passons au chaos engineering — casser volontairement pour mieux construire. Faites le Lab 14 pour ecrire et executer vos propres tests k6 !

## Points d'attention pour l'enregistrement
- Installer k6 AVANT le screencast et verifier qu'il fonctionne
- Avoir Grafana ouvert en parallele pendant l'execution de k6 pour montrer l'impact en temps reel
- Le ramp-up progressif est visuellement parlant dans Grafana — le montrer
- Le spike test est le moment "wow" — la latence qui explose est tres visuelle
- Expliquer les VUs (Virtual Users) clairement — ce n'est pas des requetes par seconde
- Le think time (sleep) est important pour la realisme des scenarios
- predict_linear est une fonction puissante mais simple — montrer le graphique
- La synthese finale (combiner prediction et load test) est le delivrable cle

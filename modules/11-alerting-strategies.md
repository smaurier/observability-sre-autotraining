# Stratégies d'alerting (Multi-window Burn Rate)

## Objectifs pedagogiques

- Comprendre le concept de burn rate et son lien avec l'error budget
- Maîtriser la stratégie multi-window multi-burn-rate
- Savoir distinguer les niveaux de severite d'alerte (page vs ticket)
- Combattre l'alert fatigue avec des alertes pertinentes
- Configurer des regles d'alerting Prometheus et Alertmanager
- Implementer des calculs de burn rate en TypeScript

---

## Introduction : le problème de l'alerting classique

Imaginez un detecteur de fumee qui sonne chaque fois que vous faites cuire un toast. Au bout de quelques semaines, vous le debranchez. C'est exactement ce qui se passe avec un alerting mal configure : les équipes finissent par **ignorer les alertes** (alert fatigue), y compris les vraies urgences.

L'alerting base sur les SLOs et le burn rate resout ce problème en repondant à une question simple : **"A quelle vitesse consommons-nous notre error budget ?"**

---

## Burn Rate — La vitesse de consommation

### Definition

Le **burn rate** mesure la vitesse a laquelle vous consommez votre error budget par rapport à un taux constant. Un burn rate de **1** signifie que vous consommez votre budget exactement au rythme prévu (vous l'epuiserez à la fin de la fenêtre).

```
burn_rate = taux_erreur_observe / taux_erreur_autorise
```

### Calcul en TypeScript

```typescript
interface BurnRateCalculator {
  sloTarget: number;
  windowDays: number;

  errorBudgetRate(): number;
  burnRate(observedErrorRate: number): number;
  timeToExhaustion(burnRate: number): { hours: number; days: number };
}

function createBurnRateCalculator(
  sloTarget: number,
  windowDays: number,
): BurnRateCalculator {
  return {
    sloTarget,
    windowDays,

    // Taux d'erreur autorise sur la fenetre
    errorBudgetRate() {
      return 1 - this.sloTarget;
    },

    // Burn rate = combien de fois plus vite que le taux autorise
    burnRate(observedErrorRate: number): number {
      return observedErrorRate / this.errorBudgetRate();
    },

    // Temps avant epuisement du budget
    timeToExhaustion(burnRate: number) {
      const totalHours = (this.windowDays * 24) / burnRate;
      return {
        hours: totalHours,
        days: totalHours / 24,
      };
    },
  };
}

const calc = createBurnRateCalculator(0.999, 30);

// SLO 99.9% => error budget = 0.1%
console.log(`Taux d'erreur autorise: ${(calc.errorBudgetRate() * 100).toFixed(2)}%`);
// 0.10%

// Si on observe 1% d'erreurs
const br = calc.burnRate(0.01);
console.log(`Burn rate: ${br}x`);
// Burn rate: 10x

const tte = calc.timeToExhaustion(br);
console.log(`Budget epuise en: ${tte.hours.toFixed(1)}h (${tte.days.toFixed(1)} jours)`);
// Budget epuise en: 72.0h (3.0 jours)
```

### Tableau des burn rates

Pour un SLO de 99.9% sur 30 jours :

| Burn Rate | Taux d'erreur | Budget epuise en | Severite |
|-----------|---------------|-------------------|----------|
| 1x | 0.1% | 30 jours | Normal |
| 2x | 0.2% | 15 jours | Attention |
| 10x | 1% | 3 jours | Ticket |
| 14.4x | 1.44% | 2 jours | Page (alerte critique) |
| 36x | 3.6% | 20 heures | Page urgente |
| 720x | 72% | 1 heure | Page immediate |

---

## Multi-window Multi-Burn-Rate Alerting

### Le problème des fenetres uniques

Une seule fenêtre de temps ne suffit pas :
- **Fenetre courte** (5 min) : trop de faux positifs (un pic de latence bref)
- **Fenetre longue** (24h) : detection trop lente pour les incidents graves

### La solution Google SRE Workbook

La stratégie **multi-window multi-burn-rate** utilise deux fenetres pour chaque alerte :
1. **Fenetre longue** : détecté la tendance
2. **Fenetre courte** : confirme que le problème est **toujours en cours**

```typescript
interface AlertWindow {
  longWindowMinutes: number;
  shortWindowMinutes: number;
  burnRateThreshold: number;
  severity: 'page' | 'ticket';
  consumptionPercent: number; // % du budget consomme si le taux persiste
}

// Configuration recommandee par Google SRE Workbook
const alertWindows: AlertWindow[] = [
  {
    // Detection rapide : 2% du budget en 1 heure
    longWindowMinutes: 60,      // 1 heure
    shortWindowMinutes: 5,      // 5 minutes
    burnRateThreshold: 14.4,
    severity: 'page',
    consumptionPercent: 2,
  },
  {
    // Detection moyenne : 5% du budget en 6 heures
    longWindowMinutes: 360,     // 6 heures
    shortWindowMinutes: 30,     // 30 minutes
    burnRateThreshold: 6,
    severity: 'page',
    consumptionPercent: 5,
  },
  {
    // Detection lente : 10% du budget en 3 jours
    longWindowMinutes: 4320,    // 3 jours (72h)
    shortWindowMinutes: 360,    // 6 heures
    burnRateThreshold: 1,
    severity: 'ticket',
    consumptionPercent: 10,
  },
];
```

### Pourquoi deux fenetres ?

```typescript
interface MultiWindowCheck {
  checkAlert(
    longWindowErrorRate: number,
    shortWindowErrorRate: number,
    window: AlertWindow,
    sloTarget: number,
  ): boolean;
}

const checker: MultiWindowCheck = {
  checkAlert(longWindowErrorRate, shortWindowErrorRate, window, sloTarget) {
    const errorBudgetRate = 1 - sloTarget;

    // Les DEUX fenetres doivent depasser le seuil
    const longBurnRate = longWindowErrorRate / errorBudgetRate;
    const shortBurnRate = shortWindowErrorRate / errorBudgetRate;

    return (
      longBurnRate >= window.burnRateThreshold &&
      shortBurnRate >= window.burnRateThreshold
    );
  },
};

// Scenario 1 : pic bref puis retour a la normale
// Long window : burn rate 14.4x  |  Short window : burn rate 0.5x
// => PAS d'alerte (le probleme s'est resolu)

// Scenario 2 : probleme persistant
// Long window : burn rate 14.4x  |  Short window : burn rate 15x
// => ALERTE (le probleme est toujours actif)
```

Cela elimine les **faux positifs** : un pic temporaire ne declenche pas d'alerte car la fenêtre courte retourne à la normale.

---

## Niveaux de severite

### Page vs Ticket

```typescript
type AlertSeverity = 'page' | 'ticket';

interface AlertConfig {
  severity: AlertSeverity;
  notificationChannels: string[];
  responseTime: string;
  description: string;
}

const alertConfigs: Record<AlertSeverity, AlertConfig> = {
  page: {
    severity: 'page',
    notificationChannels: ['pagerduty', 'sms', 'phone'],
    responseTime: '< 5 minutes',
    description:
      'Alerte critique necessitant une intervention humaine immediate. ' +
      'Reveille l\'ingenieur d\'astreinte si necessaire.',
  },
  ticket: {
    severity: 'ticket',
    notificationChannels: ['slack', 'email', 'jira'],
    responseTime: '< 1 jour ouvrable',
    description:
      'Alerte non urgente creant un ticket. ' +
      'A traiter pendant les heures de bureau.',
  },
};
```

### Regles d'or pour la severite

1. **Page** : l'utilisateur est impacte **maintenant** et ça ne se resoudra pas tout seul
2. **Ticket** : une degradation lente qui nécessité attention mais pas urgence
3. **Ni l'un ni l'autre** : observable sur un dashboard, pas besoin d'alerte

---

## Alert Fatigue

### Symptomes

- Les ingenieurs ignorent les notifications
- Le channel d'alertes Slack est mute
- Les incidents réels sont detectes par les clients, pas par les alertes
- Le nombre d'alertes par semaine dépasse 20

### Comment l'éviter

```typescript
interface AlertHygieneChecklist {
  rule: string;
  description: string;
  check: () => boolean;
}

const checklist: AlertHygieneChecklist[] = [
  {
    rule: 'Chaque alerte est actionnable',
    description: 'Si vous ne pouvez rien faire, ce n\'est pas une alerte',
    check: () => true,
  },
  {
    rule: 'Chaque page a un runbook',
    description: 'L\'ingenieur d\'astreinte doit savoir quoi faire',
    check: () => true,
  },
  {
    rule: 'Ratio signal/bruit > 50%',
    description: 'Plus de la moitie des alertes doivent etre de vrais problemes',
    check: () => true,
  },
  {
    rule: 'Revue trimestrielle des alertes',
    description: 'Supprimer les alertes obsoletes, ajuster les seuils',
    check: () => true,
  },
  {
    rule: 'Maximum 2 pages par rotation d\'astreinte',
    description: 'Si plus, les seuils sont trop agressifs ou le systeme instable',
    check: () => true,
  },
];
```

---

## Runbooks

Un **runbook** est un document qui guide l'ingenieur d'astreinte étape par étape pour diagnostiquer et résoudre un problème signale par une alerte.

```typescript
interface Runbook {
  alertName: string;
  summary: string;
  impact: string;
  diagnosticSteps: string[];
  mitigationSteps: string[];
  escalation: string;
  dashboardLink: string;
}

const runbookExample: Runbook = {
  alertName: 'HighErrorRate_API_Availability',
  summary: 'Le taux d\'erreurs 5xx depasse le seuil de burn rate 14.4x',
  impact: 'Les utilisateurs recoivent des erreurs sur l\'API principale',
  diagnosticSteps: [
    '1. Verifier le dashboard : <lien_grafana>',
    '2. Identifier quel endpoint genere les erreurs',
    '3. Consulter les logs : kubectl logs -l app=api --tail=100',
    '4. Verifier la sante des dependances (DB, cache, services amont)',
    '5. Verifier les deployments recents : kubectl rollout history',
  ],
  mitigationSteps: [
    '1. Si deployment recent : rollback avec kubectl rollout undo',
    '2. Si surcharge : augmenter les replicas',
    '3. Si dependance down : activer le circuit breaker / mode degrade',
    '4. Si cause inconnue : escalader',
  ],
  escalation: 'Contacter le tech lead via PagerDuty escalation policy',
  dashboardLink: 'https://grafana.internal/d/api-overview',
};
```

---

## Configuration Prometheus : regles d'alerting

### Regles d'alerte pour burn rate

```yaml
# prometheus-rules.yml
groups:
  - name: slo-burn-rate
    rules:
      # Burn rate rapide (page) : 14.4x sur 1h, confirme sur 5min
      - alert: HighBurnRate_API_Availability_Fast
        expr: |
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[1h]))
              /
              sum(rate(http_requests_total{job="api"}[1h]))
            )
          ) / (1 - 0.999) > 14.4
          and
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[5m]))
              /
              sum(rate(http_requests_total{job="api"}[5m]))
            )
          ) / (1 - 0.999) > 14.4
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn rate critique sur l'API (14.4x)"
          description: "Le budget d'erreur est consomme 14.4x plus vite que prevu"
          runbook_url: "https://wiki.internal/runbooks/high-burn-rate-api"

      # Burn rate moyen (page) : 6x sur 6h, confirme sur 30min
      - alert: HighBurnRate_API_Availability_Medium
        expr: |
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[6h]))
              /
              sum(rate(http_requests_total{job="api"}[6h]))
            )
          ) / (1 - 0.999) > 6
          and
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[30m]))
              /
              sum(rate(http_requests_total{job="api"}[30m]))
            )
          ) / (1 - 0.999) > 6
        labels:
          severity: page
          slo: api-availability
        annotations:
          summary: "Burn rate eleve sur l'API (6x)"

      # Burn rate lent (ticket) : 1x sur 3 jours, confirme sur 6h
      - alert: HighBurnRate_API_Availability_Slow
        expr: |
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[3d]))
              /
              sum(rate(http_requests_total{job="api"}[3d]))
            )
          ) / (1 - 0.999) > 1
          and
          (
            1 - (
              sum(rate(http_requests_total{status!~"5..", job="api"}[6h]))
              /
              sum(rate(http_requests_total{job="api"}[6h]))
            )
          ) / (1 - 0.999) > 1
        labels:
          severity: ticket
          slo: api-availability
        annotations:
          summary: "Burn rate soutenu sur l'API (1x) — budget en danger"
```

### Configuration Alertmanager

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname', 'slo']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Pages critiques -> PagerDuty
    - match:
        severity: page
      receiver: 'pagerduty-critical'
      repeat_interval: 1h

    # Tickets -> Slack + Jira
    - match:
        severity: ticket
      receiver: 'slack-tickets'
      repeat_interval: 24h

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts-default'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_KEY>'

  - name: 'slack-tickets'
    slack_configs:
      - channel: '#alerts-tickets'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
```

---

## Routing et Silencing

### Routing avance

Le **routing** permet de diriger les alertes vers les bonnes équipes :

```typescript
interface AlertRoute {
  match: Record<string, string>;
  receiver: string;
  repeatInterval: string;
}

const routes: AlertRoute[] = [
  {
    match: { severity: 'page', team: 'platform' },
    receiver: 'pagerduty-platform',
    repeatInterval: '1h',
  },
  {
    match: { severity: 'page', team: 'backend' },
    receiver: 'pagerduty-backend',
    repeatInterval: '1h',
  },
  {
    match: { severity: 'ticket' },
    receiver: 'slack-engineering',
    repeatInterval: '24h',
  },
];
```

### Silencing (mise en sourdine)

Les **silences** permettent de supprimer temporairement des alertes connues (ex: maintenance planifiee) :

```typescript
interface AlertSilence {
  matchers: Array<{ name: string; value: string; isRegex: boolean }>;
  startsAt: Date;
  endsAt: Date;
  createdBy: string;
  comment: string;
}

const maintenanceSilence: AlertSilence = {
  matchers: [
    { name: 'job', value: 'api', isRegex: false },
    { name: 'severity', value: 'page|ticket', isRegex: true },
  ],
  startsAt: new Date('2025-03-15T02:00:00Z'),
  endsAt: new Date('2025-03-15T04:00:00Z'),
  createdBy: 'ops-team',
  comment: 'Maintenance planifiee : migration base de donnees',
};
```

::: warning Attention
N'utilisez les silences que pour des maintenances **planifiees**. Silencer une alerte parce qu'elle est "bruyante" masque un vrai problème — corrigez plutot le seuil ou la cause racine.
:::

---

## Simulateur de burn rate complet

```typescript
interface BurnRateSimulation {
  sloTarget: number;
  windowDays: number;
  events: Array<{ minute: number; errorRate: number }>;

  simulate(): SimulationResult;
}

interface SimulationResult {
  alerts: Array<{
    minute: number;
    severity: 'page' | 'ticket';
    burnRate: number;
    budgetConsumedPercent: number;
  }>;
  finalBudgetPercent: number;
}

function simulateBurnRate(
  sloTarget: number,
  windowDays: number,
  errorRateTimeline: Array<{ minute: number; errorRate: number }>,
): SimulationResult {
  const errorBudget = 1 - sloTarget;
  const windowMinutes = windowDays * 24 * 60;
  const alerts: SimulationResult['alerts'] = [];

  let totalErrors = 0;
  let totalRequests = 0;

  for (const event of errorRateTimeline) {
    const requestsThisMinute = 1000; // 1000 req/min
    const errorsThisMinute = requestsThisMinute * event.errorRate;

    totalRequests += requestsThisMinute;
    totalErrors += errorsThisMinute;

    const currentErrorRate = totalErrors / totalRequests;
    const burnRate = currentErrorRate / errorBudget;
    const budgetConsumed = (currentErrorRate / errorBudget) * (totalRequests / (1000 * windowMinutes));

    if (burnRate > 14.4) {
      alerts.push({
        minute: event.minute,
        severity: 'page',
        burnRate,
        budgetConsumedPercent: budgetConsumed * 100,
      });
    } else if (burnRate > 1) {
      alerts.push({
        minute: event.minute,
        severity: 'ticket',
        burnRate,
        budgetConsumedPercent: budgetConsumed * 100,
      });
    }
  }

  const finalBudget = 1 - totalErrors / totalRequests / errorBudget;

  return {
    alerts,
    finalBudgetPercent: Math.max(0, finalBudget * 100),
  };
}

// Simulation : 60 minutes avec un pic d'erreurs a la minute 20
const timeline = Array.from({ length: 60 }, (_, i) => ({
  minute: i,
  errorRate: i >= 20 && i <= 30 ? 0.05 : 0.001, // 5% d'erreurs pendant 10 min
}));

const result = simulateBurnRate(0.999, 30, timeline);
console.log(`Alertes declenchees: ${result.alerts.length}`);
console.log(`Budget restant: ${result.finalBudgetPercent.toFixed(2)}%`);
```

---

## Bonnes pratiques

1. **Basez vos alertes sur les SLOs** : pas sur des metriques arbitraires
2. **Utilisez le multi-window** : toujours une fenêtre longue + une fenêtre courte
3. **Limitez les pages** : maximum 2 par rotation d'astreinte de 12h
4. **Chaque alerte = un runbook** : si l'ingenieur ne sait pas quoi faire, l'alerte est inutile
5. **Revue trimestrielle** : supprimez les alertes non actionnees, ajustez les seuils
6. **Evitez les alertes "a titre informatif"** : utilisez des dashboards pour ça
7. **Testez vos alertes** : injectez des erreurs pour vérifier que les alertes se declenchent correctement
8. **Documentez les escalations** : qui contacter si le premier intervenant ne peut pas résoudre

---

::: tip A retenir
- Le **burn rate** mesure la vitesse de consommation de l'error budget (1x = rythme normal)
- La stratégie **multi-window multi-burn-rate** utilise 2 fenetres pour reduire les faux positifs
- **Page** = intervention immediate, **Ticket** = traitement pendant les heures de bureau
- L'**alert fatigue** est le premier ennemi d'un bon alerting : moins d'alertes, mais meilleures
- Chaque alerte doit etre **actionnable** et accompagnee d'un **runbook**
- Configurez **Alertmanager** pour router les alertes vers les bons canaux selon la severite
:::

---

## Pour aller plus loin

- [Lab 11 — Configurer des alertes burn rate](/labs/lab-11-burn-rate-alerts/README)
- [Quiz 11 — Stratégies d'alerting](/quizzes/quiz-11-alerting-strategies)
- Google SRE Workbook, Chapitre 5 : "Alerting on SLOs"
- Prometheus documentation : "Alerting Rules"

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 11 alerting stratégies](../screencasts/screencast-11-alerting-strategies.md)
2. **Lab** : [lab-11-burn-rate-alerts](../labs/lab-11-burn-rate-alerts/README)
3. **Visualisation** : [SLO Error Budget](../visualizations/slo-error-budget.html)
4. **Quiz** : [quiz 11 alerting stratégies](../quizzes/quiz-11-alerting-strategies.html)
:::

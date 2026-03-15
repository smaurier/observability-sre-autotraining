# Screencast 11 — Stratégies d'alerting (Multi-window Burn Rate)

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/11-alerting-strategies.md`
- **Lab associe** : Lab 11
- **Prérequis** : Screencast 10

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal intégré ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Prometheus accessible sur `http://localhost:9090` avec l'onglet Alerts ouvert
- [ ] Grafana accessible sur `http://localhost:3001`
- [ ] Fichier `config/prometheus/rules/slo-alerts.yml` ouvert
- [ ] demo-app accessible sur `http://localhost:3000`

## Script

### [00:00-02:30] Introduction

> Dans le module précédent, nous avons défini nos SLOs et calcule l'error budget. Maintenant, il faut etre alerte quand le budget est consomme trop vite. Mais attention — un detecteur de fumee qui sonne pour un toast, ça se debranche. C'est exactement ce qui arrive avec un alerting mal configure : alert fatigue. Les équipes finissent par ignorer les alertes, y compris les vraies urgences.

> L'alerting base sur le burn rate resout ce problème. Au lieu de demander "est-ce que le taux d'erreur dépasse 1% ?", on demandé "a quelle vitesse consommons-nous notre error budget ?". C'est une question bien plus pertinente.

### [02:30-06:00] Comprendre le burn rate

> Le burn rate mesure la vitesse de consommation de l'error budget par rapport à un rythme constant. Un burn rate de 1 signifie que vous consommez le budget au rythme exact pour l'epuiser à la fin de la fenêtre de 30 jours. Un burn rate de 2 signifie que vous le consommerez en 15 jours.

**Action** : Écrire les calculs de burn rate.

```typescript
// Burn Rate = taux d'erreur observe / taux d'erreur autorise
//
// Avec SLO = 99.9% sur 30 jours :
// Taux d'erreur autorise = 1 - 0.999 = 0.001 (0.1%)
//
// Si taux d'erreur observe = 0.1%  → burn rate = 0.001 / 0.001 = 1   (normal)
// Si taux d'erreur observe = 0.2%  → burn rate = 0.002 / 0.001 = 2   (x2 plus vite)
// Si taux d'erreur observe = 1%    → burn rate = 0.01  / 0.001 = 10  (x10 !)
// Si taux d'erreur observe = 10%   → burn rate = 0.1   / 0.001 = 100 (catastrophe)

// A quel rythme le budget est epuise ?
// Burn rate 1   → budget epuise en 30 jours  (normal)
// Burn rate 2   → budget epuise en 15 jours  (attention)
// Burn rate 10  → budget epuise en 3 jours   (urgent)
// Burn rate 100 → budget epuise en 7.2 heures (critique)
```

**Action** : Dessiner un graphique simple du burn rate.

```
Error Budget (%)
100 |─────────────────────────────────────
    |  ╲ burn rate = 1 (normal)
 75 |    ╲
    |      ╲
 50 |        ╲
    |    ╲╲╲   ╲   burn rate = 2
 25 |        ╲╲  ╲
    |  ╲╲╲╲     ╲╲ ╲
  0 |─────╲──────────╲─────────────────
    0    15d        30d          Temps
         burn rate = 10
         (epuise en 3j)
```

> Visuellement, le burn rate est la pente de la courbe de consommation du budget. Plus la pente est raide, plus le budget est consomme vite.

### [06:00-10:00] Multi-window burn rate alerts

> Le problème avec un seul seuil de burn rate, c'est les faux positifs. Un pic de 2 minutes a burn rate 50, suivi d'un retour à la normale, ne devrait pas declencher une alerte page. C'est la que la stratégie multi-window entre en jeu.

**Action** : Expliquer la stratégie multi-window.

```typescript
// Multi-window : combiner une fenetre longue et une fenetre courte
//
// Fenetre longue : "est-ce que la tendance est mauvaise ?"
// Fenetre courte : "est-ce que ca se passe maintenant ?"
//
// Alerte = fenetre longue depasse le seuil ET fenetre courte depasse le seuil
//
// Cela elimine :
// - Les alertes pour des pics brefs (fenetre longue pas depassee)
// - Les alertes pour des problemes deja resolus (fenetre courte revenue a la normale)

// Configuration recommandee (Google SRE Workbook)
const alertConfigs = [
  // Severite PAGE (reveil a 3h du matin)
  { severity: 'page',   burnRate: 14.4, longWindow: '1h',  shortWindow: '5m'  },
  { severity: 'page',   burnRate: 6,    longWindow: '6h',  shortWindow: '30m' },

  // Severite TICKET (a traiter dans les heures ouvrees)
  { severity: 'ticket', burnRate: 3,    longWindow: '24h', shortWindow: '2h'  },
  { severity: 'ticket', burnRate: 1,    longWindow: '72h', shortWindow: '6h'  },
];
```

> La première regle page dit : "Si le burn rate est 14.4 sur la dernière heure ET sur les 5 dernières minutes, c'est une urgence — reveillez quelqu'un." Un burn rate de 14.4 sur 1 heure consomme 2% du budget mensuel en une heure. La deuxieme regle page est moins urgente mais plus longue : burn rate 6 sur 6 heures.

> Les regles ticket detectent des problèmes plus lents mais persistants. Pas besoin de reveiller quelqu'un, mais il faut agir pendant les heures de bureau.

### [10:00-15:00] Configurer les alertes dans Prometheus

**Action** : Ouvrir `config/prometheus/rules/slo-alerts.yml`.

```yaml
# config/prometheus/rules/slo-alerts.yml
groups:
  - name: slo-burn-rate-alerts
    rules:
      # --- PAGE : burn rate 14.4x sur 1h / 5m ---
      - alert: HighErrorBudgetBurn_Page_Fast
        expr: |
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[1h]))
            /
            sum(rate(demo_app_http_requests_total[1h]))
          ) > (14.4 * 0.001)
          and
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[5m]))
            /
            sum(rate(demo_app_http_requests_total[5m]))
          ) > (14.4 * 0.001)
        for: 1m
        labels:
          severity: page
          slo: availability
        annotations:
          summary: "Burn rate critique (14.4x) — error budget epuise en ~2 jours"
          description: "Le taux d'erreur sur 1h et 5m depasse 1.44%. Budget mensuel consomme a 14.4x la vitesse normale."
          runbook: "https://wiki.internal/runbooks/high-error-rate"

      # --- PAGE : burn rate 6x sur 6h / 30m ---
      - alert: HighErrorBudgetBurn_Page_Slow
        expr: |
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[6h]))
            /
            sum(rate(demo_app_http_requests_total[6h]))
          ) > (6 * 0.001)
          and
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[30m]))
            /
            sum(rate(demo_app_http_requests_total[30m]))
          ) > (6 * 0.001)
        for: 5m
        labels:
          severity: page
          slo: availability
        annotations:
          summary: "Burn rate eleve (6x) — error budget epuise en ~5 jours"
          runbook: "https://wiki.internal/runbooks/elevated-error-rate"

      # --- TICKET : burn rate 3x sur 24h / 2h ---
      - alert: HighErrorBudgetBurn_Ticket
        expr: |
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[24h]))
            /
            sum(rate(demo_app_http_requests_total[24h]))
          ) > (3 * 0.001)
          and
          (
            sum(rate(demo_app_http_requests_total{status_code=~"5.."}[2h]))
            /
            sum(rate(demo_app_http_requests_total[2h]))
          ) > (3 * 0.001)
        for: 10m
        labels:
          severity: ticket
          slo: availability
        annotations:
          summary: "Burn rate modere (3x) — error budget epuise en ~10 jours"
          runbook: "https://wiki.internal/runbooks/slow-error-budget-drain"
```

> Chaque regle suit le même schema : fenêtre longue depassee ET fenêtre courte depassee. Le seuil est `burn_rate * (1 - SLO)`. Pour un SLO de 99.9%, `(1 - 0.999) = 0.001`. Un burn rate de 14.4 donne un seuil de `14.4 * 0.001 = 0.0144`, soit 1.44% de taux d'erreur.

**Action** : Recharger la configuration Prometheus.

```bash
curl -X POST http://localhost:9090/-/reload
```

**Action** : Vérifier les alertes dans Prometheus UI > Alerts.

> Les alertes sont en état "inactive" — aucune condition n'est remplie. Declenchons-les.

### [15:00-19:00] Injecter des erreurs et observer les alertes

**Action** : Injecter des erreurs dans la demo-app.

```bash
# Generer un taux d'erreur eleve (environ 15-20%)
for i in $(seq 1 500); do
  curl -s http://localhost:3000/api/products > /dev/null
  # Une requete sur 5 est une erreur
  if [ $((i % 5)) -eq 0 ]; then
    curl -s http://localhost:3000/api/orders/trigger-error > /dev/null
  fi
done
```

**Action** : Observer les alertes dans Prometheus UI > Alerts.

> Après quelques minutes, l'alerte `HighErrorBudgetBurn_Page_Fast` passe de "inactive" a "pending", puis a "firing". Le `for: 1m` signifie que la condition doit etre vraie pendant au moins 1 minute avant le declenchement. Cela evite les alertes pour des micro-pics.

**Action** : Montrer les details de l'alerte dans Prometheus.

> Regardez les annotations : le summary dit "Burn rate critique (14.4x)", la description donne le contexte, et le runbook pointe vers la documentation de résolution. Chaque alerte doit avoir un runbook — sinon la personne d'astreinte ne sait pas quoi faire.

### [19:00-22:00] Créer un template de runbook

**Action** : Montrer le template de runbook.

```typescript
// Template de runbook pour une alerte de burn rate eleve
const runbookTemplate = {
  alert: 'HighErrorBudgetBurn_Page_Fast',
  lastUpdated: '2024-01-15',

  // 1. Comprendre l'alerte
  whatItMeans: `
    Le taux d'erreur 5xx depasse 1.44% sur les dernieres 1h et 5m.
    Le burn rate est 14.4x — l'error budget sera epuise en ~2 jours
    a ce rythme.
  `,

  // 2. Actions immediates (< 5 minutes)
  immediateActions: [
    'Verifier le dashboard RED : quel service/route a le plus d erreurs ?',
    'Verifier les derniers deployments : un rollback est-il necessaire ?',
    'Verifier les dependances externes : une API tierce est-elle down ?',
  ],

  // 3. Investigation
  investigationSteps: [
    'Ouvrir Jaeger et filtrer les traces avec error=true',
    'Identifier le span en erreur — quel service, quelle operation ?',
    'Consulter les logs du service en erreur pour le detail de l exception',
    'Verifier les metriques USE : saturation de l event loop, memoire ?',
  ],

  // 4. Mitigation
  mitigationOptions: [
    'Rollback du dernier deployment si correle',
    'Activer un feature flag pour desactiver la fonctionnalite en erreur',
    'Augmenter le nombre de replicas si saturation',
    'Basculer vers le service de fallback si dependance down',
  ],

  // 5. Escalation
  escalation: 'Si non resolu en 30 minutes, escalader au Tech Lead d astreinte',
};
```

> Un bon runbook repond a quatre questions : qu'est-ce qui se passe ? Que faire immediatement ? Comment investiguer ? Quand escalader ? Sans runbook, la personne d'astreinte perd du temps à comprendre l'alerte au lieu de résoudre le problème.

### [22:00-24:00] Récapitulatif

> Recapitulons. Le burn rate mesure la vitesse de consommation de l'error budget. La stratégie multi-window combine une fenêtre longue et une fenêtre courte pour eliminer les faux positifs. Quatre niveaux d'alerte couvrent les scenarios : de l'urgence critique au ticket a traiter en heures ouvrees.

> Chaque alerte doit avoir : un severity level clair (page vs ticket), des annotations descriptives, et un lien vers un runbook. Le runbook est aussi important que l'alerte elle-même.

> Dans le prochain module, nous verrons comment gérer un incident de bout en bout — de la detection à la résolution. Faites le Lab 11 pour configurer vos propres alertes !

## Points d'attention pour l'enregistrement
- Le concept de burn rate est abstrait — prendre le temps avec le graphique visuel
- La stratégie multi-window est le coeur du module — bien expliquer pourquoi les deux fenetres
- Montrer l'alerte passer de inactive → pending → firing en temps réel
- Le calcul du seuil (burn_rate * (1 - SLO)) doit etre détaillé pas a pas
- Le template de runbook est une delivrable concrete — insister sur son importance
- S'assurer que la configuration Prometheus est rechargee après modification des rules
- Générer suffisamment d'erreurs pour declencher les alertes en quelques minutes
- Ne pas oublier de montrer les annotations (summary, description, runbook) dans Prometheus UI

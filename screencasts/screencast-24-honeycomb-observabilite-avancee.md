# Screencast 24 — Honeycomb & Observabilite Avancee

## Informations
- **Duree estimee** : 12-15 min
- **Module** : `modules/24-honeycomb-observabilite-avancee.md`
- **Lab associe** : `labs/lab-25-honeycomb-observabilite/`
- **Prerequis** : Screencast 07 (Distributed Tracing), Screencast 10 (SLI/SLO/SLA)

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Compte Honeycomb (honeycomb.io — free tier disponible)
- [ ] Terminal integre ouvert
- [ ] Application instrumentee avec OpenTelemetry

## Script

### [00:00-02:30] Introduction — L'Observabilite 2.0

> On a vu Prometheus pour les metriques, Grafana pour les dashboards, Loki pour les logs, OpenTelemetry pour le tracing. Tous ces outils suivent le modele classique des "three pillars" : metriques, logs, traces. Honeycomb propose une approche differente.

**Action** : Afficher le slide "Observability 1.0 vs 2.0".

> L'Observabilite 1.0 dit : "collectez des metriques, des logs et des traces, puis correlez-les manuellement". L'Observabilite 2.0 de Honeycomb dit : "envoyez des evenements riches avec toutes les dimensions, et explorez-les interactivement pour trouver ce que vous ne saviez meme pas que vous cherchiez".

> La difference fondamentale : avec Prometheus, vous devez savoir A L'AVANCE quelles questions vous allez poser (vous definissez les metriques). Avec Honeycomb, vous stockez des evenements bruts et vous posez les questions APRES, quand vous avez un probleme.

### [02:30-05:30] Haute Cardinalite — Le super-pouvoir

> La haute cardinalite, c'est la capacite a stocker et requeter des dimensions avec beaucoup de valeurs uniques. Un user_id avec 1 million de valeurs ? Avec Prometheus, c'est une explosion de cardinalite qui fait crasher votre cluster. Avec Honeycomb, c'est une dimension comme une autre.

**Action** : Montrer l'instrumentation.

```typescript
// Avec OpenTelemetry, on envoie des evenements riches
const span = tracer.startSpan('process-order');
span.setAttributes({
  'user.id': user.id,              // 1M+ valeurs uniques
  'order.id': order.id,            // Millions de valeurs
  'order.total': order.total,
  'payment.provider': 'stripe',
  'user.plan': user.plan,
  'user.country': user.country,
  'cart.item_count': cart.items.length,
  'feature_flag.new_checkout': isEnabled('new_checkout'),
});
```

> Chaque span est un evenement riche avec 10, 20, 50 attributs. Honeycomb les ingere tous et permet de requeter sur n'importe lequel. C'est fondamentalement different de Prometheus ou vous devez choisir 4-5 labels maximum.

### [05:30-09:00] BubbleUp — Trouver l'inconnu

> BubbleUp est la fonctionnalite killer de Honeycomb. Vous selectionnez une zone d'anomalie dans un graphique (par exemple, un pic de latence) et Honeycomb vous dit automatiquement en quoi ce trafic est different du trafic normal.

**Action** : Montrer BubbleUp (si possible avec un demo ou des screenshots).

> Imaginez : la latence du checkout a triple entre 14h et 15h. Vous selectionnez cette zone. BubbleUp analyse toutes les dimensions et vous dit : "dans cette zone, 92% du trafic vient de user.country=BR et utilise payment.provider=paypal". Vous n'aviez pas pense a regarder le pays ou le provider — BubbleUp l'a trouve pour vous.

> C'est exactement ce que l'Observabilite 2.0 promet : repondre aux questions que vous ne saviez pas que vous deviez poser. Avec les dashboards classiques, vous ne voyez que ce que vous avez prevu de monitorer.

### [09:00-11:30] SLOs dans Honeycomb

> Honeycomb integre les SLOs nativement. Vous definissez un SLI (par exemple, "latence du checkout < 2s"), un objectif (99.9%), et Honeycomb calcule le burn rate en temps reel.

**Action** : Montrer la configuration d'un SLO.

```
SLI: duration_ms < 2000 WHERE name = "process-order"
Objective: 99.9% over 30 days
Budget: 43.2 minutes of errors allowed per month
```

> La difference avec un SLO Prometheus : Honeycomb peut decomposer le SLO par n'importe quelle dimension. Quel pays consomme le plus d'error budget ? Quel feature flag degrade le SLO ? Quel payment provider est le plus lent ? Tout ca sans avoir predefini les dashboards.

### [11:30-13:30] Honeycomb vs Grafana Stack — Quand choisir quoi ?

**Action** : Afficher le tableau comparatif.

> Grafana Stack (Prometheus + Loki + Tempo + Grafana) : open source, cout maitrise, communaute enorme, ideal si vous avez des SRE qui construisent et maintiennent la stack.

> Honeycomb : SaaS managee, haute cardinalite native, BubbleUp pour l'exploration, ideal pour les equipes qui veulent deboguer rapidement sans maintenir l'infra d'observabilite.

> Le sweet spot de Honeycomb : les equipes de 10-100 developpeurs qui deploient souvent et qui n'ont pas de SRE dedie pour maintenir Prometheus/Grafana. Le sweet spot de Grafana : les organisations qui veulent le controle total et qui ont l'expertise pour operer la stack.

### [13:30-15:00] Recapitulatif

> Honeycomb represente l'Observabilite 2.0 : des evenements riches a haute cardinalite, l'exploration interactive avec BubbleUp, et des SLOs integres. C'est un paradigme different des three pillars classiques.

> La haute cardinalite est la cle : stockez le user_id, l'order_id, les feature flags, le pays — toutes les dimensions que Prometheus ne peut pas gerer. Et BubbleUp trouve les correlations que vous n'auriez pas cherchees.

> Faites le Lab 25 pour implementer un systeme d'evenements haute cardinalite, un query builder et une analyse BubbleUp !

## Points d'attention pour l'enregistrement
- Honeycomb est probablement nouveau pour les etudiants — prendre le temps d'expliquer le paradigme
- BubbleUp est le moment "aha" — si possible, montrer un demo reel
- Comparer systematiquement avec Prometheus/Grafana pour ancrer les concepts
- La haute cardinalite est le concept cle — utiliser l'exemple du user_id pour l'illustrer
- Ne pas presenter Honeycomb comme superieur — insister sur les tradeoffs (cout SaaS, vendor lock-in)

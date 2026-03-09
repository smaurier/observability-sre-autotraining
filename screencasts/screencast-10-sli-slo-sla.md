# Screencast 10 — SLI, SLO, SLA & Error Budgets

## Informations
- **Duree estimee** : 20-25 min
- **Module** : `modules/10-sli-slo-sla.md`
- **Lab associe** : Lab 10
- **Prerequis** : Screencast 09

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert (2 terminaux)
- [ ] Docker Compose lance (`docker compose -f docker-compose.full.yml up -d`)
- [ ] Prometheus accessible sur `http://localhost:9090`
- [ ] Grafana accessible sur `http://localhost:3001`
- [ ] demo-app accessible sur `http://localhost:3000`
- [ ] Script de generation de trafic pret pour simuler des erreurs

## Script

### [00:00-02:30] Introduction

> Nous avons des dashboards, des metriques et des traces. Mais comment savoir si notre service est "assez fiable" ? Viser 100% de disponibilite est impossible et ruineux. Ne rien mesurer, c'est naviguer a l'aveugle. Aujourd'hui, nous decouvrons le framework SLI/SLO/SLA, popularise par Google dans le livre Site Reliability Engineering. C'est le langage commun entre equipes produit, developpement et operations.

> L'analogie du restaurant : vous ne dites pas "la nourriture est bonne". Vous mesurez le temps d'attente moyen, le taux de satisfaction client, le nombre de plats renvoyes. Les SLIs, SLOs et SLAs font exactement la meme chose pour vos services numeriques.

### [02:30-06:00] Definir les SLIs — Que mesurons-nous ?

> Un SLI — Service Level Indicator — est une mesure quantitative d'un aspect du service tel que percu par l'utilisateur. La formule generique est simple : nombre d'evenements "bons" divise par nombre total d'evenements.

**Action** : Ecrire les SLIs pour la demo-app.

```typescript
// SLIs pour la demo-app

// SLI Disponibilite — % de requetes reussies
// Formule : requetes avec status < 500 / total des requetes
interface AvailabilitySLI {
  good: number;   // requetes avec status 2xx, 3xx, 4xx
  total: number;  // toutes les requetes
  value: number;  // good / total = ex: 0.999 (99.9%)
}

// SLI Latence — % de requetes sous un seuil de temps
// Formule : requetes avec latence < 500ms / total des requetes
interface LatencySLI {
  good: number;   // requetes completees en moins de 500ms
  total: number;  // toutes les requetes
  value: number;  // good / total = ex: 0.995 (99.5%)
}
```

> Deux points importants. Premierement, le SLI est toujours un ratio entre 0 et 1 (ou 0% et 100%). Deuxiemement, il mesure ce que l'utilisateur ressent — pas la CPU du serveur, pas la memoire, mais le resultat de la requete tel que l'utilisateur le voit.

**Action** : Montrer les requetes PromQL pour calculer chaque SLI.

```
# SLI Disponibilite en PromQL
# "Quel pourcentage de requetes ne sont PAS des erreurs serveur ?"
sum(rate(demo_app_http_requests_total{status_code!~"5.."}[30m]))
/
sum(rate(demo_app_http_requests_total[30m]))
```

```
# SLI Latence en PromQL
# "Quel pourcentage de requetes sont servies en moins de 500ms ?"
sum(rate(demo_app_http_request_duration_seconds_bucket{le="0.5"}[30m]))
/
sum(rate(demo_app_http_request_duration_seconds_count[30m]))
```

> Pour la latence, on utilise le bucket `le="0.5"` de l'histogram. Ce bucket contient le nombre de requetes dont la duree est inferieure ou egale a 0.5 seconde (500ms). Divise par le nombre total, ca donne le pourcentage de requetes rapides.

### [06:00-09:00] Fixer les SLOs — Quel niveau visons-nous ?

> Un SLO — Service Level Objective — est la cible que vous fixez pour un SLI. C'est la reponse a : "Quel niveau de fiabilite est acceptable ?"

**Action** : Definir les SLOs pour la demo-app.

```typescript
// SLOs pour la demo-app
const slos = {
  availability: {
    sli: 'Pourcentage de requetes HTTP reussies (non-5xx)',
    target: 0.999,       // 99.9%
    window: '30d',       // Fenetre glissante de 30 jours
  },
  latency: {
    sli: 'Pourcentage de requetes HTTP avec latence < 500ms',
    target: 0.99,        // 99%
    window: '30d',
  },
};

// Que signifie 99.9% de disponibilite sur 30 jours ?
// Total minutes sur 30 jours : 30 * 24 * 60 = 43 200 minutes
// Budget d'erreur : 0.1% * 43 200 = 43.2 minutes d'indisponibilite autorisees
// Soit environ 1 minute et 26 secondes par jour

// Que signifie 99% de latence ?
// Sur 1 000 000 de requetes, 10 000 peuvent depasser 500ms
```

> 99.9% semble eleve, mais ca autorise 43 minutes de downtime par mois. 99.99% ne laisse que 4.3 minutes. Chaque "9" supplementaire coute exponentiellement plus cher a atteindre.

### [09:00-13:00] Calculer l'error budget

> L'error budget est le complement du SLO. Si votre SLO est 99.9%, votre error budget est 0.1%. C'est le budget de "droit a l'erreur" — la quantite de fiabilite que vous pouvez sacrifier pour innover.

**Action** : Ecrire le calcul d'error budget.

```typescript
interface ErrorBudget {
  sloTarget: number;
  windowDays: number;

  // Budget total
  totalBudget(): number;

  // Budget restant
  remainingBudget(currentSLI: number): number;

  // Temps restant en minutes
  remainingMinutes(currentSLI: number): number;
}

// Exemple concret
const budget = {
  sloTarget: 0.999,      // 99.9%
  windowDays: 30,

  totalBudget() {
    return 1 - this.sloTarget; // 0.001 = 0.1%
  },

  remainingBudget(currentSLI: number) {
    const consumed = 1 - currentSLI;       // ex: 1 - 0.9995 = 0.0005
    return this.totalBudget() - consumed;  // 0.001 - 0.0005 = 0.0005
  },

  remainingMinutes(currentSLI: number) {
    const totalMinutes = this.windowDays * 24 * 60;          // 43200
    return this.remainingBudget(currentSLI) * totalMinutes;  // 0.0005 * 43200 = 21.6 min
  },
};

// Avec un SLI actuel de 99.95% :
// Budget total     : 43.2 minutes
// Budget consomme  : 21.6 minutes (50%)
// Budget restant   : 21.6 minutes
```

> L'error budget est un outil de decision. S'il reste beaucoup de budget, l'equipe peut deployer plus rapidement, prendre plus de risques. Si le budget est presque epuise, on ralentit les deployments et on investit dans la fiabilite.

**Action** : Montrer le calcul en PromQL sur une fenetre glissante.

```
# Error budget consomme (en pourcentage du budget total)
(
  1 - (
    sum(rate(demo_app_http_requests_total{status_code!~"5.."}[30m]))
    /
    sum(rate(demo_app_http_requests_total[30m]))
  )
)
/
(1 - 0.999)
* 100
```

> Cette requete calcule le pourcentage du budget consomme. Si le resultat est 50, vous avez utilise la moitie de votre budget. Si c'est 100 ou plus, le SLO est viole.

### [13:00-17:00] Observer la consommation d'error budget en temps reel

**Action** : Envoyer du trafic normal d'abord.

```bash
# Trafic normal — toutes les requetes reussissent
for i in $(seq 1 500); do
  curl -s http://localhost:3000/api/products > /dev/null
  curl -s http://localhost:3000/api/orders > /dev/null
done
```

**Action** : Ouvrir Grafana et afficher le SLI de disponibilite.

> Le SLI est a 100%. L'error budget est intact. Maintenant, injectons des erreurs.

**Action** : Envoyer du trafic qui genere des erreurs 5xx.

```bash
# Trafic mixte — incluant des requetes qui echouent
for i in $(seq 1 100); do
  curl -s http://localhost:3000/api/products > /dev/null
  # Requete qui genere une erreur 500
  curl -s http://localhost:3000/api/orders/trigger-error > /dev/null
done
```

**Action** : Observer en temps reel dans Grafana.

> Regardez le graphique. Le SLI de disponibilite commence a descendre. L'error budget se consomme. Si on continue a ce rythme, le SLO sera viole dans quelques minutes.

**Action** : Montrer dans Prometheus la consommation du budget.

```
# SLI en temps reel
sum(rate(demo_app_http_requests_total{status_code!~"5.."}[5m]))
/
sum(rate(demo_app_http_requests_total[5m]))
```

> On voit le SLI passer de 1.0 a 0.98, puis 0.95. Chaque point de pourcentage perdu consomme une portion du budget. C'est exactement ce mecanisme qui permet aux equipes de prendre des decisions basees sur des donnees, pas sur des impressions.

### [17:00-20:00] Rolling window et composite SLO

> En production, le SLO est calcule sur une fenetre glissante de 30 jours — pas un mois calendaire. Chaque minute, la fenetre avance : les vieilles erreurs sortent, les nouvelles entrent.

**Action** : Montrer le concept de rolling window.

```typescript
// Rolling window de 30 jours
// A l'instant T, on regarde les 30 derniers jours
// A l'instant T+1 minute, la fenetre avance d'1 minute
//
// Jour 1 : grosse panne (SLI = 95%)
// Jour 2-30 : parfait (SLI = 100%)
// SLI sur 30 jours : ~99.83%
//
// Jour 31 : la panne du jour 1 sort de la fenetre
// SLI sur 30 jours : 100% — le budget se regenere !
```

> Un composite SLO combine plusieurs SLIs. Par exemple : "99.9% des requetes reussissent ET 99% des requetes sont servies en moins de 500ms". Si l'un ou l'autre est viole, le SLO global est viole.

### [20:00-23:00] SLA — l'engagement contractuel

> Le SLA — Service Level Agreement — est l'engagement contractuel entre vous et vos clients. Il est base sur les SLOs mais inclut des consequences en cas de violation : credits, penalites financieres, resiliation.

```typescript
// Hierarchie : SLI → SLO → SLA
//
// SLI : "99.95% des requetes reussissent ce mois-ci" (mesure)
// SLO : "Nous visons 99.9% de disponibilite" (objectif interne)
// SLA : "Si la disponibilite descend sous 99.5%, le client recoit un credit de 10%" (contrat)
//
// Regle d'or : le SLA doit etre MOINS strict que le SLO
// SLO = 99.9% → SLA = 99.5%
// Marge de securite : 0.4% entre les deux
```

> Si votre SLA est au meme niveau que votre SLO, vous n'avez aucune marge. La moindre violation du SLO declenchera des penalites financieres.

### [23:00-24:30] Recapitulatif

> Recapitulons. Le SLI mesure ce que l'utilisateur ressent — c'est un ratio. Le SLO fixe la cible de fiabilite — 99.9%, 99.99%. L'error budget est le complement — 0.1% de droit a l'erreur. Le SLA est le contrat — avec des consequences financieres.

> L'error budget est un outil de decision : beaucoup de budget restant = plus de risques autorises. Budget epuise = on freine et on investit dans la fiabilite. La fenetre glissante de 30 jours permet au budget de se regenerer naturellement.

> Dans le prochain module, nous apprendrons a creer des alertes basees sur le burn rate — la vitesse a laquelle l'error budget est consomme. Faites le Lab 10 !

## Points d'attention pour l'enregistrement
- Prendre le temps sur les definitions SLI/SLO/SLA — c'est le vocabulaire fondamental du SRE
- L'analogie du restaurant est parlante — l'utiliser en introduction
- Le calcul d'error budget en minutes est tres concret — bien detailler l'arithmetique
- Montrer en temps reel la consommation de l'error budget en injectant des erreurs
- Le bucket `le="0.5"` pour le SLI de latence est un point technique important
- La fenetre glissante (rolling window) est un concept subtil — prendre le temps
- La hierarchie SLI → SLO → SLA → error budget doit etre claire a la fin du screencast
- Ne pas oublier de montrer la marge entre SLO et SLA

# Screencast 01 — Pourquoi l'Observabilite ?

## Informations
- **Duree estimee** : 12-15 min
- **Module** : `modules/01-pourquoi-observabilite.md`
- **Lab associe** : Lab 01
- **Prerequis** : Screencast 00

## Setup
- [ ] VS Code ouvert dans `observability-sre-course/`
- [ ] Terminal integre ouvert
- [ ] demo-app prete a etre lancee (`npx tsx demo-app/src/index.ts`)
- [ ] Navigateur ouvert sur un onglet vide
- [ ] Fichier `modules/01-pourquoi-observabilite.md` ouvert dans un onglet

## Script

### [00:00-01:30] Introduction : le probleme

> Dans le module precedent, nous avons lance la demo-app et observe ses sorties. Aujourd'hui, nous allons comprendre pourquoi l'observabilite est devenue indispensable en ingenierie logicielle moderne, et decouvrir les 3 piliers qui la composent.

**Action** : Afficher un schema simple dans le navigateur ou en commentaire — un monolithe vs une architecture microservices.

```typescript
// Avant : 1 monolithe
// requete → [App Monolithique] → reponse

// Maintenant : 15+ services
// requete → [API Gateway] → [Auth Service] → [Order Service]
//                                              ↓
//                                          [Payment Service] → [Notification Service]
//                                              ↓
//                                          [Inventory Service]
```

> Quand vous aviez un seul serveur, surveiller le CPU et le disque suffisait. Avec des dizaines de services, le monitoring traditionnel ne repond plus aux bonnes questions.

### [01:30-04:00] Debugging SANS observabilite

> Simulons un scenario realiste : un utilisateur signale que "ca ne marche pas".

**Action** : Lancer la demo-app.

```bash
npx tsx demo-app/src/index.ts
```

**Action** : Envoyer quelques requetes normales et une requete qui echoue.

```bash
# Requetes normales
curl http://localhost:3000/api/orders
curl http://localhost:3000/api/products

# Simuler une requete problematique
curl http://localhost:3000/api/orders/nonexistent-id
```

> Imaginez que vous n'avez que du console.log. Vous recevez un ticket : "La commande ne passe pas". Que faites-vous ? Vous ouvrez les logs, vous voyez des milliers de lignes, vous cherchez avec grep... sans savoir quel moment, quel utilisateur, quel service.

**Action** : Montrer un exemple de logs non structures (ecrire dans un fichier temporaire).

```typescript
// Sans observabilite — le processus de debugging
// 1. Un utilisateur signale : "Ca ne marche pas"
// 2. Vous regardez les logs : des milliers de lignes non structurees
// 3. Vous cherchez manuellement : grep "error" | tail -100
// 4. Vous trouvez un message cryptique : "Connection refused"
// 5. Vous ne savez pas quel service, quel moment, quel utilisateur
// 6. Temps de resolution : heures, voire jours
```

### [04:00-06:30] Debugging AVEC observabilite

> Maintenant, voyons la meme situation avec une application instrumentee.

**Action** : Montrer la sortie structuree de la demo-app dans le terminal.

> Regardez les logs structures. Chaque ligne est du JSON avec un timestamp, un niveau, un requestId, la methode HTTP, l'URL. Si un utilisateur me dit que sa commande ne passe pas et me donne son requestId, je peux filtrer tous les logs de cette requete en une seconde.

**Action** : Ouvrir `/metrics` dans le navigateur.

```bash
curl http://localhost:3000/metrics
```

> Les metriques me donnent une vue d'ensemble. Je vois le nombre de requetes par seconde, le taux d'erreur, la distribution des latences. Si le taux d'erreur monte, je le vois immediatement — avant meme que les utilisateurs ne se plaignent.

```typescript
// Avec observabilite — le processus de debugging
// 1. Une alerte SLO se declenche : "99e percentile de latence > 2s"
// 2. Dashboard Grafana : le service Order est lent depuis 14h02
// 3. Traces Jaeger : le span "database.query" prend 1.8s
// 4. Logs correles (meme traceId) : "Connection pool exhausted"
// 5. Metriques : db_connections_active = db_connections_max
// 6. Temps de resolution : minutes
```

> La difference est dramatique : des heures ou des jours deviennent des minutes.

### [06:30-09:30] Les 3 piliers de l'observabilite

> L'observabilite repose sur 3 piliers complementaires. Aucun ne suffit seul.

**Action** : Ouvrir `demo-app/src/lib/logger.ts` pour montrer le pilier Logs.

> Premier pilier : les Logs. Ce sont des evenements horodates et structures. Ils donnent le detail de chaque evenement individuel. Notre demo-app utilise Pino pour generer des logs JSON exploitables.

**Action** : Ouvrir `demo-app/src/lib/metrics.ts` pour montrer le pilier Metriques.

```typescript
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total des requetes HTTP',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree des requetes HTTP en secondes',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
});
```

> Deuxieme pilier : les Metriques. Des valeurs numeriques agregees dans le temps. Peu couteuses, ideales pour les alertes et les dashboards. On voit ici un Counter pour compter les requetes et un Histogram pour mesurer leur duree.

**Action** : Ouvrir `demo-app/src/lib/tracing.ts` pour montrer le pilier Traces.

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function createOrder(userId: string, items: string[]) {
  return tracer.startActiveSpan('createOrder', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('order.items_count', items.length);
    // Chaque appel interne cree un sous-span
    await validateInventory(items);
    await processPayment(userId);
    span.end();
  });
}
```

> Troisieme pilier : les Traces distribuees. Elles suivent le parcours d'une requete a travers tous les services. Quand une requete traverse 5 services, la trace montre exactement ou le temps est passe.

### [09:30-11:30] Comment les 3 piliers fonctionnent ensemble

> La puissance de l'observabilite vient de la correlation entre les 3 piliers.

**Action** : Dessiner ou montrer un schema du flux.

```
[Alerte metrique]    →    "Taux d'erreur > 1% depuis 5 min"
      ↓
[Dashboard Grafana]  →    "Service Order lent depuis 14h02"
      ↓
[Trace Jaeger]       →    "Le span database.query prend 1.8s"
      ↓
[Log correle]        →    "Connection pool exhausted (requestId: abc-123)"
```

> Les metriques detectent le probleme. Les traces localisent le goulot d'etranglement. Les logs fournissent le detail pour comprendre la cause racine. Le lien entre les trois ? Le traceId, present dans chaque log, chaque metrique, chaque trace.

**Action** : Montrer les logs de la demo-app avec les requestId.

> Regardez : chaque log porte un requestId. C'est le meme identifiant qui apparait dans la trace. Cela permet de passer d'un log dans Grafana Loki a la trace correspondante dans Jaeger en un seul clic.

### [11:30-13:00] Le concept de cardinalite

> Un piege courant quand on debute avec les metriques : la cardinalite explosive.

**Action** : Montrer un exemple dans le code.

```typescript
// Cardinalite faible (OK) : ~100 combinaisons
const goodMetric = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'status_code']
  // method: 4 valeurs x route: 5 valeurs x status: 5 valeurs = 100 series
});

// Cardinalite explosive (DANGER) : millions de combinaisons
const badMetric = new Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'route', 'user_id']
  // user_id: potentiellement des millions de valeurs !
});
```

> Chaque combinaison unique de labels cree une serie temporelle en memoire dans Prometheus. 100 series, pas de probleme. 1 million de series, votre Prometheus s'ecroule. Regle d'or : ne mettez en label que des valeurs a cardinalite bornee et faible.

### [13:00-14:30] Recapitulatif

> Recapitulons. Le monitoring repond a "Est-ce que ca marche ?". L'observabilite repond a "Pourquoi est-ce que ca ne marche pas ?" — meme pour des problemes que vous n'aviez jamais envisages.

> Les 3 piliers — Logs, Metriques, Traces — sont complementaires. Les metriques pour la vue d'ensemble et les alertes. Les logs pour le detail des evenements. Les traces pour le parcours a travers les services.

> Attention a la cardinalite : chaque label dans vos metriques est un multiplicateur de series temporelles.

> Dans le prochain module, nous plongerons dans le premier pilier : le logging structure avec Pino. A bientot !

**Action** : Arreter la demo-app.

## Points d'attention pour l'enregistrement
- Prendre le temps de bien montrer la difference entre debugging avec et sans observabilite
- Utiliser des exemples concrets de pannes (le "mardi lent", le memory leak)
- Insister sur la correlation entre les 3 piliers — c'est le point le plus important
- Ne pas survoler le concept de cardinalite — c'est l'erreur numero 1 des debutants
- Montrer les fichiers reels de la demo-app plutot que des exemples abstraits
- L'analogie medicale est tres parlante : monitoring = prise de temperature, observabilite = IRM

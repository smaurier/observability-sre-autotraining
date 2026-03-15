# Prérequis & Introduction a l'Observabilité

<!-- nav-cours-précédent -->
> **Cours précédent** : [Systèmes Distribues](../../11-distributed-systems/modules/24-projet-final.md). Si tu arrives ici sans avoir fait les cours précédents, consulte le [guide de démarrage](../../GUIDE-DEMARRAGE.md).


## Objectifs pedagogiques

- Vérifier que votre environnement de développement est pret pour le cours
- Comprendre la structure du projet `demo-app` que nous instrumenterons tout au long du parcours
- Installer les dépendances essentielles (tsx, pino, prom-client)
- Lancer l'application pour la première fois et observer sa sortie brute
- Saisir la différence fondamentale entre **voir** et **comprendre** un système
- Avoir une vision d'ensemble des 20 modules du cours

---

## Prérequis techniques

Avant de commencer, assurez-vous de disposer des outils suivants installes sur votre machine.

### Node.js 20+ et npm

Le cours utilise des fonctionnalites modernes de Node.js, notamment `AsyncLocalStorage` et le support natif des ES Modules.

```typescript
// Verifiez votre version dans un terminal
// $ node --version
// v20.11.0  (ou superieur)

// $ npm --version
// 10.x
```

Si vous n'avez pas Node.js 20+, rendez-vous sur [nodejs.org](https://nodejs.org) ou utilisez un gestionnaire de versions comme `nvm` ou `fnm`.

### TypeScript — les bases

Vous devez etre a l'aise avec les concepts suivants :

- Typage statique (`string`, `number`, `boolean`, interfaces, types)
- Les génériques de base (`Array<T>`, `Promise<T>`)
- `async` / `await`
- Les modules ES (`import` / `export`)

```typescript
// Exemple : le niveau de TypeScript attendu
interface User {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json() as Promise<User>;
}
```

### Express.js — les bases

Nous utiliserons Express comme framework HTTP. Connaître les concepts de routes, middleware et `Request`/`Response` suffit.

### Docker (optionnel mais recommande)

Docker nous permettra de lancer Prometheus, Grafana et Jaeger sans installation locale. Si vous ne souhaitez pas utiliser Docker, des alternatives seront proposees.

---

## Docker & Docker Compose — L'essentiel pour ce cours

Tout au long de ce parcours, nous utiliserons Docker pour déployer notre stack d'observabilité : **Prometheus** (metriques), **Grafana** (dashboards), **Jaeger** (traces), et l'**OpenTelemetry Collector** (pipeline de telemetrie). Plutot que d'installer chaque outil nativement, Docker nous permet de lancer l'ensemble en une seule commande, de manière reproductible et isolee.

### Pourquoi Docker dans ce cours

- **Reproductibilite** : tout le monde obtient le même environnement, quel que soit l'OS
- **Isolation** : les outils tournent dans leurs propres containers sans polluer votre machine
- **Simplicite** : une commande `docker-compose up -d` remplace des dizaines d'étapes d'installation
- **Proximite avec la production** : en entreprise, ces outils tournent quasi-systematiquement dans des containers

### Vérification de l'installation

Avant d'aller plus loin, verifiez que Docker et Docker Compose sont disponibles :

```bash
# Docker Engine
docker --version
# Docker version 24.x ou superieur

# Docker Compose (plugin integre dans les versions recentes)
docker compose version
# Docker Compose version v2.x

# Version legacy (encore courante)
docker-compose --version
# docker-compose version 1.29.x
```

Si ces commandes echouent, installez Docker Desktop depuis [docker.com](https://www.docker.com/products/docker-desktop/) (Windows/macOS) ou le Docker Engine via votre gestionnaire de paquets (Linux).

### Concepts clés

#### Image vs Container

Une **image** est un template en lecture seule (comme un ISO). Un **container** est une instance en cours d'exécution de cette image (comme une VM legere).

```bash
# Telecharger une image
docker pull prom/prometheus:latest

# Creer et lancer un container a partir de cette image
docker run -d --name mon-prometheus prom/prometheus:latest

# L'image existe une seule fois sur le disque,
# mais vous pouvez lancer plusieurs containers a partir d'elle
```

#### Port mapping (`-p hote:container`)

Les containers sont isoles du réseau de votre machine. Le port mapping créé un pont :

```bash
# Rendre Prometheus accessible sur http://localhost:9090
docker run -d -p 9090:9090 prom/prometheus

# Rendre Grafana accessible sur http://localhost:3001 (au lieu du 3000 par defaut)
docker run -d -p 3001:3000 grafana/grafana
```

Le format est `-p PORT_HOTE:PORT_CONTAINER`. Si le port hote est déjà utilise, changez-le (ex: `-p 9091:9090`).

#### Volumes (persistance des donnees)

Par defaut, les donnees d'un container sont **ephemeres** : elles disparaissent quand le container est supprime. Les volumes permettent de persister les donnees.

```bash
# Persister les donnees Prometheus
docker run -d -p 9090:9090 -v prometheus-data:/prometheus prom/prometheus

# Persister les dashboards et la configuration Grafana
docker run -d -p 3000:3000 -v grafana-data:/var/lib/grafana grafana/grafana

# Lister les volumes existants
docker volume ls
```

#### Networks (communication inter-containers)

Les containers sur le même réseau Docker peuvent communiquer entre eux **par nom de service**, sans utiliser `localhost`.

```bash
# Creer un reseau dedie a la stack d'observabilite
docker network create observability

# Les containers sur ce reseau se voient par leur nom
# Prometheus pourra scraper l'app via http://demo-app:3000/metrics
docker network ls
```

### Commandes essentielles

#### Commandes Docker de base

```bash
# Lancer un container en arriere-plan (-d = detached)
docker run -d --name mon-container mon-image

# Lister les containers en cours d'execution
docker ps

# Lister TOUS les containers (y compris arretes)
docker ps -a

# Consulter les logs d'un container
docker logs mon-container
docker logs -f mon-container   # -f = follow (temps reel)

# Executer une commande dans un container en cours d'execution
docker exec -it mon-container /bin/sh

# Arreter et supprimer un container
docker stop mon-container
docker rm mon-container
```

#### Commandes Docker Compose

Docker Compose orchestre plusieurs containers définis dans un fichier `docker-compose.yml` :

```bash
# Lancer toute la stack en arriere-plan
docker-compose up -d

# Arreter et supprimer tous les containers de la stack
docker-compose down

# Arreter et supprimer les containers ET les volumes (reset complet)
docker-compose down -v

# Voir les logs de tous les services (en temps reel)
docker-compose logs -f

# Voir les logs d'un seul service
docker-compose logs -f prometheus

# Voir l'etat des services
docker-compose ps

# Redemarrer un seul service
docker-compose restart grafana
```

### Structure basique d'un docker-compose.yml

Voici la structure que nous utiliserons dans les labs :

```yaml
# docker-compose.yml — Stack minimale : app + Prometheus
services:
  demo-app:
    build: ./demo-app              # Construit l'image a partir du Dockerfile local
    ports:
      - '3000:3000'                # Expose l'app sur le port 3000
    networks:
      - observability

  prometheus:
    image: prom/prometheus:latest   # Utilise une image officielle
    ports:
      - '9090:9090'                # UI Prometheus sur http://localhost:9090
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml  # Config personnalisee
      - prometheus-data:/prometheus                      # Persistance des donnees
    networks:
      - observability

networks:
  observability:
    driver: bridge                 # Reseau interne pour la communication inter-services

volumes:
  prometheus-data:                 # Volume nomme pour la persistance
```

Points importants :
- Chaque service est un container
- Les services sur le même `network` se voient par leur nom (ex: `demo-app:3000`)
- Les `volumes` nommes persistent les donnees entre les redemarrages
- `build` construit une image locale, `image` utilise une image du registry

### Troubleshooting courant

| Problème | Cause probable | Solution |
|----------|---------------|----------|
| `port is already allocated` | Un autre processus utilise le port | Changez le port hote (`-p 9091:9090`) ou arretez le processus conflictuel (`lsof -i :9090`) |
| `Cannot connect to the Docker daemon` | Docker Desktop n'est pas demarre | Lancez Docker Desktop, ou sur Linux : `sudo systemctl start docker` |
| `no space left on device` | Disque sature par les images/volumes | Nettoyez avec `docker system prune -a` (attention : supprime les images non utilisees) |
| Container qui redémarre en boucle | Erreur de configuration ou mémoire insuffisante | Consultez les logs : `docker logs <container>` et verifiez les limites mémoire dans Docker Desktop (>= 4 Go recommande) |
| `network XXX not found` | Le réseau n'a pas ete créé | Lancez `docker-compose up -d` (il créé les réseaux automatiquement) ou `docker network create XXX` |

::: tip Astuce
Quand quelque chose ne fonctionne pas, la première commande a lancer est toujours `docker logs <nom-du-container>`. 90% des problèmes s'expliquent dans les logs.
:::

---

## Installation des dépendances du cours

Clonez le depot du cours puis installez les paquets :

```typescript
// Structure du package.json du cours
// Les dependances principales que nous utiliserons :
// - tsx          : execute directement du TypeScript (remplace ts-node)
// - pino         : logger structure ultra-rapide
// - prom-client  : client Prometheus pour Node.js
// - express      : framework HTTP
// - @types/express : types TypeScript pour Express
```

Dans votre terminal :

```bash
cd observability-sre-course
npm install
```

Verifiez que tout fonctionne :

```bash
npx tsx demo-app/index.ts
```

---

## Structure du projet demo-app

Le projet `demo-app` est une API REST simplifiee simulant un service de gestion de commandes. C'est sur cette application que nous appliquerons chaque concept du cours.

```typescript
// demo-app/index.ts — Point d'entree simplifie
import express from 'express';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  console.log('Health check called');
  res.json({ status: 'ok' });
});

app.get('/api/orders', (_req, res) => {
  console.log('Fetching orders...');
  // Simulation d'un delai variable
  const delay = Math.random() * 200;
  setTimeout(() => {
    res.json({ orders: [], count: 0 });
  }, delay);
});

app.post('/api/orders', (req, res) => {
  console.log('Creating order:', req.body);
  res.status(201).json({ id: 'order-001', ...req.body });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Remarquez : a ce stade, toute notre "observabilité" repose sur `console.log`. Nous allons voir pourquoi c'est insuffisant.

---

## Premier contact : observer la sortie brute

Lancez l'application et envoyez quelques requêtes :

```bash
# Terminal 1 — lancer l'app
npx tsx demo-app/index.ts

# Terminal 2 — envoyer des requetes
curl http://localhost:3000/health
curl http://localhost:3000/api/orders
curl -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d '{"item":"laptop"}'
```

Vous verrez dans le terminal :

```
Server running on port 3000
Health check called
Fetching orders...
Creating order: { item: 'laptop' }
```

C'est lisible... pour un humain, dans un terminal, avec 3 requêtes. Mais imaginez 10 000 requêtes par seconde, 15 services, et un bug en production a 3h du matin.

---

## Voir vs Comprendre un système

L'analogie du tableau de bord d'une voiture est parlante :

- **Voir** = regarder par la fenêtre et constater que la voiture roule
- **Comprendre** = lire le compteur de vitesse, la jauge d'essence, la temperature moteur, le temoin d'huile

`console.log` vous permet de **voir**. L'observabilité vous permet de **comprendre**.

Avec `console.log`, vous ne savez pas :
- Combien de temps a pris chaque requête
- Quel pourcentage de requêtes echoue
- Si la mémoire augmente de façon anormale
- Quel parcours a suivi une requête a travers vos services

::: tip A retenir
L'observabilité n'est pas un outil — c'est une **propriété** de votre système. Un système est observable quand vous pouvez comprendre son état interne en examinant ses sorties (logs, metriques, traces).
:::

---

## Vue d'ensemble du cours

Le cours est structure en 20 modules progressifs :

| Module | Sujet | Difficulte |
|--------|-------|------------|
| 00 | Prérequis & Introduction | 1 |
| 01 | Pourquoi l'Observabilité | 1 |
| 02 | Logging structure avec Pino | 2 |
| 03 | Niveaux de log et contexte | 2 |
| 04 | Introduction aux metriques | 2 |
| 05 | prom-client & Prometheus | 3 |
| 06 | Méthodes RED & USE | 3 |
| 07 | Distributed Tracing & OpenTelemetry | 3 |
| 08 | OTel Collector & Pipeline | 3 |
| 09 | Grafana Dashboards & PromQL | 3 |
| 10–19 | SLIs/SLOs, Alerting, Incident Response... | 2–3 |

Chaque module comprend :
- Un **cours** (ce que vous lisez maintenant)
- Un **lab** pratique (exercices guides)
- Un **quiz** d'auto-évaluation

---

## Bonnes pratiques pour suivre ce cours

- **Tapez le code vous-même** plutot que de copier-coller. La mémoire musculaire aide à retenir.
- **Experimentez** : modifiez les exemples, cassez des choses, observez les résultats.
- **Faites les labs** : la théorie sans pratique ne sert a rien en observabilité.
- **Prenez des notes** sur les patterns que vous reconnaissez dans vos propres projets.

::: warning Attention
Ne sautez pas les premiers modules même si vous connaissez déjà les bases. Chaque module construit sur le précédent et introduit des conventions que nous reutiliserons jusqu'à la fin.
:::

---

## Prochaines étapes

- [Quiz 00 — Prérequis & Introduction](/quizzes/quiz-00-prerequis)
- [Module suivant — Pourquoi l'Observabilité](/modules/01-pourquoi-observabilite)

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 00 prérequis et introduction](../screencasts/screencast-00-prerequis-et-introduction.md)
2. **Quiz** : [quiz 00 prérequis](../quizzes/quiz-00-prerequis.html)
:::

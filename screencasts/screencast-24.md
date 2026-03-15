# Screencast 24 — Instrumentation Nuxt/Next

> **Durée** : ~15 min
> **Module** : [Module 24 — Instrumentation Nuxt/Next](/modules/24-instrumentation-nuxt-next)

## Informations

- **Format** : screencast (enregistrement d'écran + voix)
- **Outils** : VS Code, terminal, navigateur, Jaeger UI

## Script

### [00:00] Introduction

> Bienvenue dans ce screencast sur l'instrumentation OpenTelemetry dans un framework SSR. On va partir d'un projet Nuxt 3 existant, y ajouter le SDK OpenTelemetry pour Node.js, instrumenter automatiquement les requêtes SSR, et visualiser les traces dans Jaeger. L'objectif : voir chaque requête traverser le serveur Nitro, les appels API, et le rendu Vue.

### [02:00] Architecture de tracing dans Nuxt 3

> Nuxt 3 utilise Nitro comme serveur. Quand une requête arrive, Nitro la route, appelle potentiellement des API, exécute le rendu SSR de Vue, puis renvoie le HTML. Avec OpenTelemetry, chaque étape devient un span dans une trace. On va configurer le SDK pour capturer tout ça automatiquement.

### [03:30] Installation des dépendances OTel

> On installe le SDK OpenTelemetry pour Node.js et les instrumentations automatiques. Le package `@opentelemetry/sdk-node` fournit le setup, et `@opentelemetry/auto-instrumentations-node` détecte automatiquement les librairies utilisées (http, fetch, express).

**Action** : exécuter `npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions`

### [05:00] Création du fichier d'instrumentation

> On crée un fichier `instrumentation.ts` à la racine du projet. Ce fichier doit être chargé avant Nuxt via le flag `--require` de Node.js. Il initialise le SDK avec l'exporter OTLP qui envoie les traces à notre collecteur.

**Action** : créer `instrumentation.ts` avec la configuration du NodeSDK, le `OTLPTraceExporter` pointant vers `http://localhost:4318/v1/traces`, et le `Resource` avec le nom de service `nuxt-app`

### [07:00] Configuration du démarrage Nuxt

> Pour que l'instrumentation se charge avant tout le code applicatif, on modifie le script de démarrage dans package.json. On utilise `--require ./instrumentation.ts` avec `tsx` pour le support TypeScript. C'est le pattern recommandé par OpenTelemetry : l'instrumentation doit monkey-patcher les modules avant leur premier import.

**Action** : modifier `package.json` pour ajouter le flag `--require` au script `dev` et `start`

### [08:30] Lancement de Jaeger

> On lance Jaeger en mode all-in-one avec Docker. Ce conteneur unique inclut le collecteur, le stockage en mémoire et l'UI. Il accepte les traces OTLP sur le port 4318.

**Action** : exécuter `docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest`

### [09:30] Première trace SSR

> On démarre le serveur Nuxt et on navigue sur la page d'accueil. Dans Jaeger UI, on recherche le service `nuxt-app` et on voit notre première trace. On observe le span racine HTTP GET, les spans enfants pour les appels API internes, et le temps de rendu SSR.

**Action** : ouvrir `http://localhost:3000`, puis `http://localhost:16686`, sélectionner le service `nuxt-app`, cliquer sur la trace

### [11:00] Ajout de spans personnalisés

> L'instrumentation automatique capture les appels HTTP, mais on veut aussi tracer la logique métier. On va ajouter un span personnalisé dans un composable pour mesurer le temps de fetch des données et le temps de transformation.

**Action** : dans un composable `useFetchProducts.ts`, ajouter un span `fetch-products` avec des attributs personnalisés (`product.count`, `cache.hit`)

### [12:30] Propagation du contexte client-serveur

> Pour les applications avec un BFF (Backend For Frontend), la propagation du contexte de trace est cruciale. On configure le header `traceparent` pour que la trace traverse le navigateur, Nuxt SSR, et l'API backend. Cela donne une trace end-to-end complète.

**Action** : montrer dans Jaeger une trace qui traverse trois services : `browser` → `nuxt-ssr` → `api-backend`

### [14:00] Récapitulatif

> En résumé : OpenTelemetry s'intègre dans Nuxt 3 via un fichier d'instrumentation chargé au démarrage. L'auto-instrumentation capture les appels HTTP et fetch. On ajoute des spans personnalisés pour la logique métier, et Jaeger visualise le tout. Ce pattern fonctionne aussi avec Next.js via le fichier `instrumentation.ts` natif introduit dans Next 13.2. Dans le prochain screencast, on comparera les solutions APM du marché.

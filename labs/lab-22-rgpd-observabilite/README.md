# Lab 28 — RGPD & Observabilite

## Objectifs

- Detecter et redacter les donnees personnelles (PII) dans les logs et traces
- Implementer des politiques de retention avec suppression automatisee
- Gerer le consentement utilisateur pour l'analytics
- Realiser une evaluation de risque RGPD pour un systeme d'observabilite
- Generer un rapport de conformite et une checklist actionnable

## Pre-requis

- Avoir lu le Module 27 — RGPD & Observabilite
- Comprendre les principes de base du RGPD (bases legales, droits des personnes)

## Exercices

### Exercice 1 — PII Detector & Scrubber

Implementez un detecteur et redacteur de PII qui identifie les emails, numeros de telephone, numeros de carte bancaire, adresses IP et JWT dans les logs structures.

### Exercice 2 — Retention Policy Manager

Implementez un gestionnaire de politiques de retention qui supprime automatiquement les donnees expirees et respecte les legal holds.

### Exercice 3 — Consent Manager

Implementez un gestionnaire de consentement conforme CNIL avec support des categories (analytics, personnalisation, marketing) et validation du consentement.

### Exercice 4 — DPIA Risk Evaluator

Evaluez les risques RGPD d'un systeme d'observabilite et generez une matrice de risques avec des mesures d'attenuation.

### Exercice 5 — Compliance Reporter

Generez un rapport de conformite RGPD complet pour un systeme d'observabilite, incluant le data mapping, les manquements et les recommandations.

## Lancer les tests

```bash
npx tsx exercise.ts
```

## Criteres de reussite

- Tous les tests passent (5 exercices)
- Le scrubber detecte tous les types de PII (email, telephone, carte bancaire, IP, JWT)
- Le retention manager respecte les legal holds et supprime les donnees expirees
- Le consent manager valide les regles CNIL (refus aussi simple que acceptation)
- Le risk evaluator produit une matrice de risques coherente
- Le compliance reporter identifie les manquements et propose des recommandations

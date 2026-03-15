// =============================================================================
// Lab 25 — Panorama APM : Comparatif et choix d'outils
// =============================================================================
// Objectifs :
//   - Modeliser les criteres de choix d'un APM
//   - Calculer le TCO (Total Cost of Ownership) SaaS vs Self-hosted
//   - Implementer un evaluateur de conformite vendeur
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 25 — Panorama APM');

// =============================================================================
// Exercice 1 : Modele de scoring APM
// Implementez un systeme de scoring pour comparer des solutions APM.
// =============================================================================

interface APMVendor {
  name: string;
  selfHosted: boolean;
  openTelemetrySupport: 'native' | 'partial' | 'none';
  features: {
    traces: boolean;
    metrics: boolean;
    logs: boolean;
    rum: boolean;
    profiling: boolean;
    sessionReplay: boolean;
    alerting: boolean;
  };
  euDataResidency: boolean;
  freeTier: boolean;
  pricing: {
    model: 'per-host' | 'per-user' | 'per-usage' | 'free';
    estimatedMonthlyCostEur: number; // Pour 50 hosts, 500GB logs/mois
  };
}

interface ScoringWeights {
  features: number;         // 0-1, poids des fonctionnalites
  openTelemetry: number;    // 0-1, poids du support OTel
  cost: number;             // 0-1, poids du cout
  dataResidency: number;    // 0-1, poids de la conformite EU
  selfHosted: number;       // 0-1, poids du self-hosted
}

// TODO: Implementez cette fonction
// Calcule un score entre 0 et 100 pour un vendeur APM selon les poids donnes.
//
// Regles de scoring :
// - features : (nombre de features true / 7) * 100 * poids
// - openTelemetry : native=100, partial=50, none=0 * poids
// - cost : ((maxCost - vendorCost) / maxCost) * 100 * poids
//   ou maxCost = 10000 EUR (normalisation)
// - dataResidency : 100 si true, 0 si false * poids
// - selfHosted : 100 si true, 0 si false * poids
//
// Le score final est la somme des scores ponderes, normalise pour que
// la somme des poids = 1 (diviser par la somme des poids)
function scoreVendor(vendor: APMVendor, weights: ScoringWeights): number {
  // TODO: Implementez
  return 0;
}

// TODO: Implementez cette fonction
// Prend un tableau de vendeurs et des poids, retourne les vendeurs
// tries par score decroissant avec leur score
function rankVendors(
  vendors: APMVendor[],
  weights: ScoringWeights
): Array<{ vendor: APMVendor; score: number }> {
  // TODO: Implementez
  return [];
}

// =============================================================================
// Exercice 2 : Calculateur TCO (Total Cost of Ownership)
// Comparez le cout SaaS vs Self-hosted sur 1 an.
// =============================================================================

interface SaaSCostParams {
  hostCount: number;
  costPerHostPerMonth: number;
  logVolumeGBPerMonth: number;
  logIngestionCostPerGB: number;
  logRetentionCostPerGBPerMonth: number;
  retentionMonths: number;
  additionalMonthlyCosts: number; // RUM, synthetics, etc.
}

interface SelfHostedCostParams {
  infraMonthlyCost: number;       // VMs, stockage, reseau
  storageMonthlyCost: number;     // S3, disques
  sfteFraction: number;           // Fraction de FTE SRE dedie (0.2 = 20%)
  sfteMonthlySalary: number;      // Cout mensuel d'un SRE
  licenseMonthlyCost: number;     // Licence enterprise si applicable
}

interface TCOResult {
  saasMonthly: number;
  saasYearly: number;
  selfHostedMonthly: number;
  selfHostedYearly: number;
  savings: number;                // Positif = self-hosted moins cher
  savingsPercent: number;
  recommendation: 'saas' | 'self-hosted';
}

// TODO: Implementez cette fonction
// Calcule le TCO sur 1 an pour SaaS et Self-hosted.
//
// SaaS mensuel =
//   hostCount * costPerHostPerMonth
//   + logVolumeGBPerMonth * logIngestionCostPerGB
//   + logVolumeGBPerMonth * logRetentionCostPerGBPerMonth * retentionMonths
//   + additionalMonthlyCosts
//
// Self-hosted mensuel =
//   infraMonthlyCost + storageMonthlyCost
//   + sfteFraction * sfteMonthlySalary
//   + licenseMonthlyCost
//
// savings = saasYearly - selfHostedYearly
// savingsPercent = savings / saasYearly * 100
// recommendation : 'self-hosted' si savings > 0, sinon 'saas'
function calculateTCO(saas: SaaSCostParams, selfHosted: SelfHostedCostParams): TCOResult {
  // TODO: Implementez
  return {
    saasMonthly: 0, saasYearly: 0,
    selfHostedMonthly: 0, selfHostedYearly: 0,
    savings: 0, savingsPercent: 0,
    recommendation: 'saas',
  };
}

// =============================================================================
// Exercice 3 : Evaluateur de conformite vendeur
// Verifiez qu'un vendeur respecte les exigences RGPD et securite.
// =============================================================================

interface VendorCompliance {
  name: string;
  dpaAvailable: boolean;           // Data Processing Agreement
  euHosting: boolean;              // Hebergement dans l'UE
  soc2Certified: boolean;          // SOC 2 Type II
  iso27001: boolean;               // ISO 27001
  encryptionAtRest: boolean;       // Chiffrement au repos
  encryptionInTransit: boolean;    // Chiffrement en transit (TLS)
  breachNotificationHours: number; // Delai de notification en heures
  dataRetentionConfigurable: boolean;
  auditLogAvailable: boolean;
  subProcessorListPublic: boolean; // Liste des sous-traitants publique
}

type ComplianceLevel = 'compliant' | 'partial' | 'non-compliant';

interface ComplianceReport {
  vendor: string;
  level: ComplianceLevel;
  score: number;                   // 0-100
  passed: string[];                // Criteres passes
  failed: string[];                // Criteres echoues
  warnings: string[];              // Avertissements
}

// TODO: Implementez cette fonction
// Evalue la conformite d'un vendeur selon les criteres suivants :
//
// Criteres obligatoires (echec = non-compliant) :
//   - dpaAvailable (DPA est obligatoire pour tout sous-traitant RGPD)
//   - euHosting (hebergement UE requis)
//   - encryptionInTransit (TLS obligatoire)
//
// Criteres importants (10 points chacun) :
//   - soc2Certified
//   - iso27001
//   - encryptionAtRest
//   - dataRetentionConfigurable
//   - auditLogAvailable
//   - subProcessorListPublic
//
// Critere d'avertissement :
//   - breachNotificationHours > 72 -> warning "Notification de breach > 72h (exigence RGPD)"
//   - breachNotificationHours <= 72 -> 10 points
//
// Score : (criteres importants passes * 10) + (breach OK * 10)
// Level :
//   - Si un critere obligatoire echoue : 'non-compliant'
//   - Si score >= 70 : 'compliant'
//   - Sinon : 'partial'
function evaluateCompliance(vendor: VendorCompliance): ComplianceReport {
  // TODO: Implementez
  return {
    vendor: vendor.name,
    level: 'non-compliant',
    score: 0,
    passed: [],
    failed: [],
    warnings: [],
  };
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

// Vendeurs de test
const datadog: APMVendor = {
  name: 'Datadog',
  selfHosted: false,
  openTelemetrySupport: 'partial',
  features: {
    traces: true, metrics: true, logs: true, rum: true,
    profiling: true, sessionReplay: true, alerting: true,
  },
  euDataResidency: true,
  freeTier: false,
  pricing: { model: 'per-host', estimatedMonthlyCostEur: 3750 },
};

const grafana: APMVendor = {
  name: 'Grafana Cloud',
  selfHosted: true,
  openTelemetrySupport: 'native',
  features: {
    traces: true, metrics: true, logs: true, rum: true,
    profiling: false, sessionReplay: false, alerting: true,
  },
  euDataResidency: true,
  freeTier: true,
  pricing: { model: 'per-usage', estimatedMonthlyCostEur: 800 },
};

const newRelic: APMVendor = {
  name: 'New Relic',
  selfHosted: false,
  openTelemetrySupport: 'native',
  features: {
    traces: true, metrics: true, logs: true, rum: true,
    profiling: true, sessionReplay: false, alerting: true,
  },
  euDataResidency: true,
  freeTier: true,
  pricing: { model: 'per-user', estimatedMonthlyCostEur: 1500 },
};

async function main() {
  console.log('\n--- Lab 25 — Panorama APM ---\n');

  // --- Exercice 1 : Scoring ---
  await test('Ex1 — scoreVendor Datadog avec poids features', () => {
    const score = scoreVendor(datadog, {
      features: 1, openTelemetry: 0, cost: 0, dataResidency: 0, selfHosted: 0,
    });
    // Datadog a 7/7 features = 100
    assertEqual(score, 100);
  });

  await test('Ex1 — scoreVendor Grafana avec poids features', () => {
    const score = scoreVendor(grafana, {
      features: 1, openTelemetry: 0, cost: 0, dataResidency: 0, selfHosted: 0,
    });
    // Grafana a 5/7 features
    const expected = Math.round((5 / 7) * 100 * 100) / 100;
    assertEqual(Math.round(score * 100) / 100, expected);
  });

  await test('Ex1 — scoreVendor avec poids OTel', () => {
    const ddScore = scoreVendor(datadog, {
      features: 0, openTelemetry: 1, cost: 0, dataResidency: 0, selfHosted: 0,
    });
    const grafScore = scoreVendor(grafana, {
      features: 0, openTelemetry: 1, cost: 0, dataResidency: 0, selfHosted: 0,
    });
    // Datadog = partial = 50, Grafana = native = 100
    assertEqual(ddScore, 50);
    assertEqual(grafScore, 100);
  });

  await test('Ex1 — scoreVendor avec poids cout', () => {
    const ddScore = scoreVendor(datadog, {
      features: 0, openTelemetry: 0, cost: 1, dataResidency: 0, selfHosted: 0,
    });
    const grafScore = scoreVendor(grafana, {
      features: 0, openTelemetry: 0, cost: 1, dataResidency: 0, selfHosted: 0,
    });
    // Grafana devrait scorer plus haut (moins cher)
    assertGreaterThan(grafScore, ddScore);
  });

  await test('Ex1 — rankVendors', () => {
    const weights: ScoringWeights = {
      features: 0.3, openTelemetry: 0.25, cost: 0.25,
      dataResidency: 0.1, selfHosted: 0.1,
    };
    const ranked = rankVendors([datadog, grafana, newRelic], weights);
    assertEqual(ranked.length, 3);
    // Le premier doit avoir le score le plus haut
    assertGreaterThan(ranked[0].score, ranked[2].score);
    // Tous les scores doivent etre entre 0 et 100
    for (const r of ranked) {
      assertGreaterThan(r.score, -1);
      assertLessThan(r.score, 101);
    }
  });

  // --- Exercice 2 : TCO ---
  await test('Ex2 — calculateTCO basique', () => {
    const result = calculateTCO(
      {
        hostCount: 50, costPerHostPerMonth: 40,
        logVolumeGBPerMonth: 500, logIngestionCostPerGB: 1.70,
        logRetentionCostPerGBPerMonth: 0.06, retentionMonths: 3,
        additionalMonthlyCosts: 200,
      },
      {
        infraMonthlyCost: 1500, storageMonthlyCost: 200,
        sfteFraction: 0.2, sfteMonthlySalary: 7500,
        licenseMonthlyCost: 0,
      }
    );

    assertGreaterThan(result.saasMonthly, 0);
    assertGreaterThan(result.selfHostedMonthly, 0);
    assertEqual(result.saasYearly, result.saasMonthly * 12);
    assertEqual(result.selfHostedYearly, result.selfHostedMonthly * 12);
  });

  await test('Ex2 — calculateTCO SaaS plus cher', () => {
    const result = calculateTCO(
      {
        hostCount: 100, costPerHostPerMonth: 60,
        logVolumeGBPerMonth: 1000, logIngestionCostPerGB: 1.70,
        logRetentionCostPerGBPerMonth: 0.06, retentionMonths: 3,
        additionalMonthlyCosts: 500,
      },
      {
        infraMonthlyCost: 2000, storageMonthlyCost: 300,
        sfteFraction: 0.3, sfteMonthlySalary: 7500,
        licenseMonthlyCost: 0,
      }
    );

    // A grande echelle, le self-hosted est souvent moins cher
    assertGreaterThan(result.savings, 0);
    assertEqual(result.recommendation, 'self-hosted');
  });

  await test('Ex2 — calculateTCO SaaS moins cher pour petite equipe', () => {
    const result = calculateTCO(
      {
        hostCount: 5, costPerHostPerMonth: 40,
        logVolumeGBPerMonth: 50, logIngestionCostPerGB: 1.70,
        logRetentionCostPerGBPerMonth: 0.06, retentionMonths: 1,
        additionalMonthlyCosts: 0,
      },
      {
        infraMonthlyCost: 500, storageMonthlyCost: 100,
        sfteFraction: 0.2, sfteMonthlySalary: 7500,
        licenseMonthlyCost: 0,
      }
    );

    assertEqual(result.recommendation, 'saas');
  });

  // --- Exercice 3 : Conformite ---
  await test('Ex3 — evaluateCompliance compliant', () => {
    const report = evaluateCompliance({
      name: 'Good Vendor',
      dpaAvailable: true, euHosting: true, soc2Certified: true,
      iso27001: true, encryptionAtRest: true, encryptionInTransit: true,
      breachNotificationHours: 48, dataRetentionConfigurable: true,
      auditLogAvailable: true, subProcessorListPublic: true,
    });

    assertEqual(report.level, 'compliant');
    assertEqual(report.score, 70);
    assertEqual(report.failed.length, 0);
  });

  await test('Ex3 — evaluateCompliance non-compliant (pas de DPA)', () => {
    const report = evaluateCompliance({
      name: 'Bad Vendor',
      dpaAvailable: false, euHosting: true, soc2Certified: true,
      iso27001: true, encryptionAtRest: true, encryptionInTransit: true,
      breachNotificationHours: 48, dataRetentionConfigurable: true,
      auditLogAvailable: true, subProcessorListPublic: true,
    });

    assertEqual(report.level, 'non-compliant');
    assert(report.failed.includes('dpaAvailable'), 'DPA doit etre dans les echecs');
  });

  await test('Ex3 — evaluateCompliance non-compliant (pas de EU hosting)', () => {
    const report = evaluateCompliance({
      name: 'US Vendor',
      dpaAvailable: true, euHosting: false, soc2Certified: true,
      iso27001: true, encryptionAtRest: true, encryptionInTransit: true,
      breachNotificationHours: 48, dataRetentionConfigurable: true,
      auditLogAvailable: true, subProcessorListPublic: true,
    });

    assertEqual(report.level, 'non-compliant');
  });

  await test('Ex3 — evaluateCompliance partial', () => {
    const report = evaluateCompliance({
      name: 'Partial Vendor',
      dpaAvailable: true, euHosting: true, soc2Certified: false,
      iso27001: false, encryptionAtRest: false, encryptionInTransit: true,
      breachNotificationHours: 96, dataRetentionConfigurable: true,
      auditLogAvailable: false, subProcessorListPublic: false,
    });

    assertEqual(report.level, 'partial');
    assertLessThan(report.score, 70);
    assert(report.warnings.length > 0, 'Doit avoir un warning pour breach > 72h');
  });

  await test('Ex3 — evaluateCompliance breach warning', () => {
    const report = evaluateCompliance({
      name: 'Slow Vendor',
      dpaAvailable: true, euHosting: true, soc2Certified: true,
      iso27001: true, encryptionAtRest: true, encryptionInTransit: true,
      breachNotificationHours: 120, dataRetentionConfigurable: true,
      auditLogAvailable: true, subProcessorListPublic: true,
    });

    assert(report.warnings.length > 0, 'Doit avoir un warning');
    assertLessThan(report.score, 70); // Perd 10 points pour breach
  });

  summary();
}

main();

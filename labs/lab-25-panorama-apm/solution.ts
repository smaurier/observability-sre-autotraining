// =============================================================================
// Lab 25 — Panorama APM : Comparatif et choix d'outils
// =============================================================================
// SOLUTION
// =============================================================================

import { createTestRunner } from '../test-utils.ts';

const { test, assert, assertEqual, assertGreaterThan, assertLessThan, summary } =
  createTestRunner('Lab 25 — Panorama APM');

// =============================================================================
// Exercice 1 : Modele de scoring APM
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
    estimatedMonthlyCostEur: number;
  };
}

interface ScoringWeights {
  features: number;
  openTelemetry: number;
  cost: number;
  dataResidency: number;
  selfHosted: number;
}

function scoreVendor(vendor: APMVendor, weights: ScoringWeights): number {
  // POURQUOI : On normalise chaque critere sur 0-100 puis on applique les poids.
  // C'est une methode de scoring multi-criteres classique (MCDA) qui permet
  // de comparer des vendeurs avec des dimensions tres differentes.

  const featureCount = Object.values(vendor.features).filter(Boolean).length;
  const featureScore = (featureCount / 7) * 100;

  // POURQUOI : Le support OTel est strategique car il determine le niveau
  // de vendor lock-in. "native" signifie OTLP direct, "partial" signifie
  // agent proprietaire avec support OTel, "none" signifie lock-in total.
  const otelMap = { native: 100, partial: 50, none: 0 };
  const otelScore = otelMap[vendor.openTelemetrySupport];

  // POURQUOI : On normalise le cout par rapport a un max de 10000 EUR/mois.
  // Plus le cout est bas, plus le score est eleve.
  const maxCost = 10000;
  const costScore = ((maxCost - vendor.pricing.estimatedMonthlyCostEur) / maxCost) * 100;

  const residencyScore = vendor.euDataResidency ? 100 : 0;
  const selfHostedScore = vendor.selfHosted ? 100 : 0;

  // POURQUOI : On divise par la somme des poids pour normaliser le resultat
  // entre 0 et 100, quel que soit le nombre de criteres utilises.
  const totalWeight =
    weights.features + weights.openTelemetry + weights.cost +
    weights.dataResidency + weights.selfHosted;

  if (totalWeight === 0) return 0;

  const weightedScore =
    featureScore * weights.features +
    otelScore * weights.openTelemetry +
    costScore * weights.cost +
    residencyScore * weights.dataResidency +
    selfHostedScore * weights.selfHosted;

  return weightedScore / totalWeight;
}

function rankVendors(
  vendors: APMVendor[],
  weights: ScoringWeights
): Array<{ vendor: APMVendor; score: number }> {
  // POURQUOI : Le classement permet de presenter les vendeurs du plus
  // adapte au moins adapte selon les criteres de l'entreprise.
  return vendors
    .map(vendor => ({ vendor, score: scoreVendor(vendor, weights) }))
    .sort((a, b) => b.score - a.score);
}

// =============================================================================
// Exercice 2 : Calculateur TCO
// =============================================================================

interface SaaSCostParams {
  hostCount: number;
  costPerHostPerMonth: number;
  logVolumeGBPerMonth: number;
  logIngestionCostPerGB: number;
  logRetentionCostPerGBPerMonth: number;
  retentionMonths: number;
  additionalMonthlyCosts: number;
}

interface SelfHostedCostParams {
  infraMonthlyCost: number;
  storageMonthlyCost: number;
  sfteFraction: number;
  sfteMonthlySalary: number;
  licenseMonthlyCost: number;
}

interface TCOResult {
  saasMonthly: number;
  saasYearly: number;
  selfHostedMonthly: number;
  selfHostedYearly: number;
  savings: number;
  savingsPercent: number;
  recommendation: 'saas' | 'self-hosted';
}

function calculateTCO(saas: SaaSCostParams, selfHosted: SelfHostedCostParams): TCOResult {
  // POURQUOI : Le TCO inclut TOUS les couts, pas seulement la licence.
  // Pour le SaaS, on oublie souvent les couts d'ingestion et de retention
  // qui peuvent depasser le cout de base.
  const saasMonthly =
    saas.hostCount * saas.costPerHostPerMonth +
    saas.logVolumeGBPerMonth * saas.logIngestionCostPerGB +
    saas.logVolumeGBPerMonth * saas.logRetentionCostPerGBPerMonth * saas.retentionMonths +
    saas.additionalMonthlyCosts;

  // POURQUOI : Pour le self-hosted, le cout SRE est souvent le poste le plus
  // important et le plus sous-estime. Un SRE a 20% de son temps sur l'observabilite
  // represente un cout significatif.
  const selfHostedMonthly =
    selfHosted.infraMonthlyCost +
    selfHosted.storageMonthlyCost +
    selfHosted.sfteFraction * selfHosted.sfteMonthlySalary +
    selfHosted.licenseMonthlyCost;

  const saasYearly = saasMonthly * 12;
  const selfHostedYearly = selfHostedMonthly * 12;

  const savings = saasYearly - selfHostedYearly;
  const savingsPercent = saasYearly > 0 ? (savings / saasYearly) * 100 : 0;

  return {
    saasMonthly,
    saasYearly,
    selfHostedMonthly,
    selfHostedYearly,
    savings,
    savingsPercent,
    // POURQUOI : La recommandation est simplifiee ici. En realite, il faut
    // aussi considerer le time-to-value, l'expertise de l'equipe, et
    // les risques operationnels.
    recommendation: savings > 0 ? 'self-hosted' : 'saas',
  };
}

// =============================================================================
// Exercice 3 : Evaluateur de conformite vendeur
// =============================================================================

interface VendorCompliance {
  name: string;
  dpaAvailable: boolean;
  euHosting: boolean;
  soc2Certified: boolean;
  iso27001: boolean;
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  breachNotificationHours: number;
  dataRetentionConfigurable: boolean;
  auditLogAvailable: boolean;
  subProcessorListPublic: boolean;
}

type ComplianceLevel = 'compliant' | 'partial' | 'non-compliant';

interface ComplianceReport {
  vendor: string;
  level: ComplianceLevel;
  score: number;
  passed: string[];
  failed: string[];
  warnings: string[];
}

function evaluateCompliance(vendor: VendorCompliance): ComplianceReport {
  const passed: string[] = [];
  const failed: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  let hasObligatoryFailure = false;

  // POURQUOI : Le DPA (Data Processing Agreement) est OBLIGATOIRE pour tout
  // sous-traitant au sens du RGPD (Article 28). Sans DPA, le traitement
  // est illegal et expose a des sanctions.
  if (vendor.dpaAvailable) {
    passed.push('dpaAvailable');
  } else {
    failed.push('dpaAvailable');
    hasObligatoryFailure = true;
  }

  // POURQUOI : Depuis l'arret Schrems II, l'hebergement dans l'UE est
  // la solution la plus sure juridiquement. Les transferts hors UE
  // necessitent des SCCs et un TIA (Transfer Impact Assessment).
  if (vendor.euHosting) {
    passed.push('euHosting');
  } else {
    failed.push('euHosting');
    hasObligatoryFailure = true;
  }

  // POURQUOI : Le chiffrement en transit (TLS) est un minimum absolu.
  // Sans TLS, les donnees d'observabilite (qui peuvent contenir des PII)
  // transitent en clair sur le reseau.
  if (vendor.encryptionInTransit) {
    passed.push('encryptionInTransit');
  } else {
    failed.push('encryptionInTransit');
    hasObligatoryFailure = true;
  }

  // Criteres importants (10 points chacun)
  const importantCriteria: Array<{ key: keyof VendorCompliance; name: string }> = [
    { key: 'soc2Certified', name: 'soc2Certified' },
    { key: 'iso27001', name: 'iso27001' },
    { key: 'encryptionAtRest', name: 'encryptionAtRest' },
    { key: 'dataRetentionConfigurable', name: 'dataRetentionConfigurable' },
    { key: 'auditLogAvailable', name: 'auditLogAvailable' },
    { key: 'subProcessorListPublic', name: 'subProcessorListPublic' },
  ];

  for (const criterion of importantCriteria) {
    if (vendor[criterion.key]) {
      passed.push(criterion.name);
      score += 10;
    } else {
      failed.push(criterion.name);
    }
  }

  // POURQUOI : L'Article 33 du RGPD impose une notification a l'autorite
  // de controle dans les 72 heures. Si le vendeur ne s'engage pas sur
  // ce delai, on risque de ne pas pouvoir respecter notre propre obligation.
  if (vendor.breachNotificationHours <= 72) {
    passed.push('breachNotificationHours');
    score += 10;
  } else {
    warnings.push('Notification de breach > 72h (exigence RGPD)');
  }

  let level: ComplianceLevel;
  if (hasObligatoryFailure) {
    level = 'non-compliant';
  } else if (score >= 70) {
    level = 'compliant';
  } else {
    level = 'partial';
  }

  return { vendor: vendor.name, level, score, passed, failed, warnings };
}

// =============================================================================
// Tests
// =============================================================================

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

  // --- Exercice 1 ---
  await test('Ex1 — scoreVendor Datadog avec poids features', () => {
    const score = scoreVendor(datadog, {
      features: 1, openTelemetry: 0, cost: 0, dataResidency: 0, selfHosted: 0,
    });
    assertEqual(score, 100);
  });

  await test('Ex1 — scoreVendor Grafana avec poids features', () => {
    const score = scoreVendor(grafana, {
      features: 1, openTelemetry: 0, cost: 0, dataResidency: 0, selfHosted: 0,
    });
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
    assertGreaterThan(grafScore, ddScore);
  });

  await test('Ex1 — rankVendors', () => {
    const weights: ScoringWeights = {
      features: 0.3, openTelemetry: 0.25, cost: 0.25,
      dataResidency: 0.1, selfHosted: 0.1,
    };
    const ranked = rankVendors([datadog, grafana, newRelic], weights);
    assertEqual(ranked.length, 3);
    assertGreaterThan(ranked[0].score, ranked[2].score);
    for (const r of ranked) {
      assertGreaterThan(r.score, -1);
      assertLessThan(r.score, 101);
    }
  });

  // --- Exercice 2 ---
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

  // --- Exercice 3 ---
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
    assertLessThan(report.score, 70);
  });

  summary();
}

main();

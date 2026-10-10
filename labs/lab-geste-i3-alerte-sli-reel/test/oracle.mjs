#!/usr/bin/env node
// Oracle réel : monte la stack Docker (app + Prometheus), injecte un vrai taux d'erreur,
// et vérifie via l'API Prometheus que l'alerte SLI passe bien à "firing" — ou pas, selon
// la version des règles testée. Pas de mock : si Prometheus ne déclenche pas, le test échoue.
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, stdio: "pipe", ...opts }).toString();
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(500);
  }
  return false;
}

async function generateLoad(durationMs, failureRateHint) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    try {
      await fetch("http://localhost:3100/sorties", { method: "POST" });
    } catch {}
    await sleep(200);
  }
}

async function alertIsFiring(alertName) {
  const res = await fetch("http://localhost:9091/api/v1/alerts");
  const json = await res.json();
  return json.data.alerts.some((a) => a.labels.alertname === alertName && a.state === "firing");
}

async function waitForFiring(alertName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await alertIsFiring(alertName)) return true;
    await sleep(2000);
  }
  return false;
}

async function runScenario(label, rulesDir) {
  console.log(`\n=== Scénario: ${label} (rules=${rulesDir}) ===`);
  const env = { ...process.env, RULES_DIR: rulesDir, FAILURE_RATE: "0.6" };
  try {
    run("docker compose down -v --remove-orphans", { env, stdio: "ignore" });
  } catch {}
  run("docker compose up -d --build", { env });

  const appUp = await waitFor("http://localhost:3100/metrics", 30000);
  const promUp = await waitFor("http://localhost:9091/-/ready", 30000);
  if (!appUp || !promUp) {
    console.log("FAIL: la stack n'a pas démarré à temps (app ou prometheus down)");
    run("docker compose down -v", { env });
    return false;
  }

  // Génère du trafic en erreur à 60% pendant 25s pour laisser Prometheus évaluer plusieurs fenêtres de 15s.
  await generateLoad(25000);

  const fired = await waitForFiring("TauxErreurSortiesEleve", 40000);
  console.log(fired ? "Alerte FIRING observée." : "Alerte jamais passée à FIRING.");

  run("docker compose down -v", { env });
  return fired;
}

const starterDir = path.join(root, "prometheus", "starter-rules");
const solutionDir = path.join(root, "prometheus", "solution-rules");

const starterFired = await runScenario("starter (page blanche, censé échouer)", starterDir);
const solutionFired = await runScenario("solution (doit déclencher)", solutionDir);

console.log("\n=== Résultat ===");
const starterOk = starterFired === false; // le starter NE DOIT PAS déclencher (bug attendu)
const solutionOk = solutionFired === true; // la solution DOIT déclencher
console.log(`starter  : ${starterOk ? "RED attendu, confirmé" : "ÉCHEC INATTENDU"} (fired=${starterFired})`);
console.log(`solution : ${solutionOk ? "GREEN confirmé" : "ÉCHEC"} (fired=${solutionFired})`);

process.exit(starterOk && solutionOk ? 0 : 1);

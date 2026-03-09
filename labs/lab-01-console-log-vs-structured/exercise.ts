// =============================================================================
// Lab 01 — Console.log vs Logging structure
// =============================================================================
// Objectifs :
//   - Comprendre pourquoi console.log n'est pas adapte a la production
//   - Creer des logs structures avec timestamp, level, message, context
//   - Parser et filtrer des logs JSON
// =============================================================================

import { createTestRunner, assertStructuredLog, parseLogLine } from '../test-utils.ts';
const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } =
  createTestRunner('Lab 01 — Console.log vs Logging structure');

// =============================================================================
// Exercice 1 : Console.log non parseable
// Ecrivez une fonction qui capture la sortie de console.log.
// Observez que le resultat est une simple chaine, pas exploitable.
// =============================================================================

// TODO: Implementez cette fonction
// Elle doit appeler console.log avec le message donne
// et retourner ce qui a ete logue (capturez la sortie via un remplacement
// temporaire de console.log).
// Retournez un tableau de toutes les valeurs passees a console.log.
function captureConsoleLog(fn: () => void): string[] {
  // TODO: Remplacez console.log temporairement pour capturer les sorties
  // 1. Sauvegardez l'original console.log
  // 2. Remplacez-le par une fonction qui stocke les arguments
  // 3. Executez fn()
  // 4. Restaurez console.log
  // 5. Retournez les messages captures (convertis en string)
  return [];
}

// =============================================================================
// Exercice 2 : Objet log structure
// Creez une fonction qui genere un objet log structure.
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

// TODO: Implementez cette fonction
// Elle doit retourner un objet StructuredLog avec :
// - timestamp : la date courante au format ISO (new Date().toISOString())
// - level : le niveau passe en parametre
// - message : le message passe en parametre
// - context : le contexte optionnel passe en parametre
function createStructuredLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): StructuredLog {
  // TODO: Implementez
  return {} as StructuredLog;
}

// =============================================================================
// Exercice 3 : Parser un log JSON
// Utilisez parseLogLine pour extraire les champs d'un log JSON.
// =============================================================================

// TODO: Implementez cette fonction
// Utilisez parseLogLine (importe de test-utils) pour parser la ligne JSON
// et retournez un objet avec les champs extraits : level, message, timestamp
function extractLogFields(jsonLine: string): { level: string; message: string; timestamp: string } {
  // TODO: Parsez la ligne avec parseLogLine et extrayez les champs
  return { level: '', message: '', timestamp: '' };
}

// =============================================================================
// Exercice 4 : Detecter le format
// Determinez si une ligne de log est structuree (JSON) ou non.
// =============================================================================

// TODO: Implementez cette fonction
// Retournez 'structured' si la ligne est du JSON valide contenant au moins
// un champ "level" ou "message", sinon 'unstructured'
function detectLogFormat(line: string): 'structured' | 'unstructured' {
  // TODO: Essayez de parser avec JSON.parse dans un try/catch
  // Verifiez la presence de champs typiques d'un log structure
  return 'unstructured';
}

// =============================================================================
// Exercice 5 : Formater en JSON
// Creez une fonction qui transforme un log structure en chaine JSON.
// =============================================================================

// TODO: Implementez cette fonction
// Elle doit prendre un StructuredLog et retourner une chaine JSON
// qui, une fois parsee, redonne le meme objet.
function formatLogAsJson(log: StructuredLog): string {
  // TODO: Utilisez JSON.stringify
  return '';
}

// =============================================================================
// Exercice 6 : Filtrer par niveau
// Filtrez un tableau de logs par niveau de severite minimum.
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// TODO: Implementez cette fonction
// Retournez uniquement les logs dont le niveau est >= au niveau minimum
// Utilisez LOG_LEVELS pour comparer les niveaux numeriquement
function filterLogsByLevel(logs: StructuredLog[], minLevel: LogLevel): StructuredLog[] {
  // TODO: Filtrez en comparant les niveaux via LOG_LEVELS
  return [];
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 01 — Console.log vs Logging structure\n');

  // --- Exercice 1 ---
  await test('Ex1 — captureConsoleLog capture la sortie', () => {
    const captured = captureConsoleLog(() => {
      console.log('Hello World');
      console.log('Error occurred:', 500);
    });
    assertEqual(captured.length, 2);
    assertIncludes(captured[0], 'Hello World');
    assertIncludes(captured[1], '500');
  });

  await test('Ex1 — console.log produit du texte non parseable', () => {
    const captured = captureConsoleLog(() => {
      console.log('User logged in', { userId: 42, ip: '192.168.1.1' });
    });
    // Le resultat est une chaine, pas facilement exploitable
    assert(typeof captured[0] === 'string', 'La sortie doit etre une chaine');
    // Pas facilement parseable comme JSON
    let parsed = false;
    try {
      JSON.parse(captured[0]);
      parsed = true;
    } catch {
      parsed = false;
    }
    assertEqual(parsed, false, 'console.log ne produit pas du JSON valide');
  });

  // --- Exercice 2 ---
  await test('Ex2 — createStructuredLog retourne un objet valide', () => {
    const log = createStructuredLog('info', 'User logged in', { userId: 42 });
    assertStructuredLog(log, ['timestamp', 'level', 'message']);
    assertEqual(log.level, 'info');
    assertEqual(log.message, 'User logged in');
    assert(log.timestamp.length > 0, 'timestamp ne doit pas etre vide');
  });

  await test('Ex2 — createStructuredLog avec context', () => {
    const log = createStructuredLog('error', 'DB connection failed', {
      host: 'db.local',
      port: 5432,
    });
    assertEqual(log.level, 'error');
    assert(log.context !== undefined, 'context doit etre present');
    assertEqual((log.context as Record<string, unknown>).host, 'db.local');
  });

  await test('Ex2 — createStructuredLog sans context', () => {
    const log = createStructuredLog('debug', 'Starting');
    assertEqual(log.level, 'debug');
    assertEqual(log.message, 'Starting');
  });

  // --- Exercice 3 ---
  await test('Ex3 — extractLogFields parse correctement', () => {
    const line = '{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"Request received"}';
    const fields = extractLogFields(line);
    assertEqual(fields.level, 'info');
    assertEqual(fields.message, 'Request received');
    assertEqual(fields.timestamp, '2024-01-15T10:30:00.000Z');
  });

  // --- Exercice 4 ---
  await test('Ex4 — detectLogFormat identifie un log structure', () => {
    const structured = '{"level":"info","message":"ok","timestamp":"2024-01-01T00:00:00Z"}';
    assertEqual(detectLogFormat(structured), 'structured');
  });

  await test('Ex4 — detectLogFormat identifie un log non structure', () => {
    assertEqual(detectLogFormat('2024-01-01 INFO User logged in'), 'unstructured');
    assertEqual(detectLogFormat('Error: something went wrong'), 'unstructured');
  });

  await test('Ex4 — detectLogFormat avec JSON sans champs log', () => {
    // JSON valide mais pas un log structure (pas de level/message)
    assertEqual(detectLogFormat('{"name":"Alice","age":30}'), 'unstructured');
  });

  // --- Exercice 5 ---
  await test('Ex5 — formatLogAsJson produit du JSON valide', () => {
    const log = createStructuredLog('warn', 'High memory usage', { percent: 95 });
    const json = formatLogAsJson(log);
    const parsed = JSON.parse(json);
    assertEqual(parsed.level, 'warn');
    assertEqual(parsed.message, 'High memory usage');
  });

  // --- Exercice 6 ---
  await test('Ex6 — filterLogsByLevel filtre correctement', () => {
    const logs: StructuredLog[] = [
      createStructuredLog('debug', 'Verbose'),
      createStructuredLog('info', 'Normal'),
      createStructuredLog('warn', 'Attention'),
      createStructuredLog('error', 'Failure'),
    ];
    const warnings = filterLogsByLevel(logs, 'warn');
    assertEqual(warnings.length, 2);
    assertEqual(warnings[0].level, 'warn');
    assertEqual(warnings[1].level, 'error');
  });

  await test('Ex6 — filterLogsByLevel avec debug retourne tout', () => {
    const logs: StructuredLog[] = [
      createStructuredLog('debug', 'A'),
      createStructuredLog('info', 'B'),
      createStructuredLog('error', 'C'),
    ];
    const all = filterLogsByLevel(logs, 'debug');
    assertEqual(all.length, 3);
  });

  await test('Ex6 — filterLogsByLevel avec error retourne seulement les erreurs', () => {
    const logs: StructuredLog[] = [
      createStructuredLog('info', 'A'),
      createStructuredLog('warn', 'B'),
      createStructuredLog('error', 'C'),
    ];
    const errors = filterLogsByLevel(logs, 'error');
    assertEqual(errors.length, 1);
    assertEqual(errors[0].message, 'C');
  });

  summary();
}

main();

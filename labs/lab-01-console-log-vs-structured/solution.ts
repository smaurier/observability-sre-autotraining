// =============================================================================
// Lab 01 — Console.log vs Logging structure (SOLUTION)
// =============================================================================
// Ce fichier contient les solutions completes de tous les exercices.
// =============================================================================

import { createTestRunner, assertStructuredLog, parseLogLine } from '../test-utils.ts';
const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } =
  createTestRunner('Lab 01 — Console.log vs Logging structure');

// =============================================================================
// Exercice 1 : Console.log non parseable
// =============================================================================

function captureConsoleLog(fn: () => void): string[] {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    captured.push(args.map(String).join(' '));
  };
  fn();
  console.log = originalLog;
  return captured;
}

// =============================================================================
// Exercice 2 : Objet log structure
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function createStructuredLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): StructuredLog {
  const log: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (context !== undefined) {
    log.context = context;
  }
  return log;
}

// =============================================================================
// Exercice 3 : Parser un log JSON
// =============================================================================

function extractLogFields(jsonLine: string): { level: string; message: string; timestamp: string } {
  const parsed = parseLogLine(jsonLine);
  return {
    level: String(parsed.level),
    message: String(parsed.message),
    timestamp: String(parsed.timestamp),
  };
}

// =============================================================================
// Exercice 4 : Detecter le format
// =============================================================================

function detectLogFormat(line: string): 'structured' | 'unstructured' {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed === 'object' && parsed !== null && ('level' in parsed || 'message' in parsed)) {
      // Must have at least level AND message to be considered structured
      if ('level' in parsed && 'message' in parsed) {
        return 'structured';
      }
    }
    return 'unstructured';
  } catch {
    return 'unstructured';
  }
}

// =============================================================================
// Exercice 5 : Formater en JSON
// =============================================================================

function formatLogAsJson(log: StructuredLog): string {
  return JSON.stringify(log);
}

// =============================================================================
// Exercice 6 : Filtrer par niveau
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function filterLogsByLevel(logs: StructuredLog[], minLevel: LogLevel): StructuredLog[] {
  const minValue = LOG_LEVELS[minLevel];
  return logs.filter((log) => LOG_LEVELS[log.level] >= minValue);
}

// =============================================================================
// Tests
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
    assert(typeof captured[0] === 'string', 'La sortie doit etre une chaine');
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

// =============================================================================
// Lab 02 — Logger production-ready Pino
// =============================================================================
// Objectifs :
//   - Simuler l'API de Pino pour comprendre les concepts
//   - Creer des child loggers, serializers, redactors
//   - Logger des erreurs avec stack trace
// =============================================================================

import { createTestRunner, assertStructuredLog } from '../test-utils.ts';
const { test, assert, assertEqual, assertDeepEqual, assertIncludes, summary } =
  createTestRunner('Lab 02 — Logger production-ready Pino');

// =============================================================================
// Types partages
// =============================================================================

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  level: LogLevel;
  time: number;
  msg: string;
  [key: string]: unknown;
}

interface FakePinoLogger {
  trace: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  debug: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  info: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  warn: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  error: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  fatal: (msgOrObj: string | Record<string, unknown>, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => FakePinoLogger;
  logs: LogEntry[];
}

// =============================================================================
// Exercice 1 : Logger basique
// Creez une fonction fakePino qui retourne un logger simulant l'API Pino.
// Chaque methode de log (info, warn, error, etc.) doit ajouter un LogEntry
// dans le tableau logs.
// =============================================================================

// TODO: Implementez cette fonction
// Le logger doit :
// - Accepter des options optionnelles (level minimum, bindings)
// - Avoir des methodes trace, debug, info, warn, error, fatal
// - Chaque methode accepte soit (string) soit (object, string)
// - Stocker chaque log dans logger.logs[] sous forme de LogEntry
// - Le LogEntry contient : level, time (Date.now()), msg, + tout objet merge
function fakePino(options?: {
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  serializers?: Record<string, (value: unknown) => unknown>;
  redact?: string[];
}): FakePinoLogger {
  // TODO: Implementez le logger
  return {} as FakePinoLogger;
}

// =============================================================================
// Exercice 2 : Child logger
// Le child logger herite des bindings du parent et y ajoute les siens.
// =============================================================================

// TODO: Pas de code supplementaire a ecrire ici — la methode child()
// doit etre implementee dans fakePino ci-dessus.
// Un child logger :
// - Herite des bindings du parent
// - Ajoute ses propres bindings
// - Partage le meme tableau logs que le parent

// =============================================================================
// Exercice 3 : Custom serializer
// Implementez un serializer qui supprime le champ 'password' des objets user.
// =============================================================================

// TODO: Implementez ce serializer
// Il recoit un objet user et retourne une copie sans le champ 'password'
function userSerializer(user: unknown): unknown {
  // TODO: Si user est un objet avec un champ password, retournez une copie sans password
  return user;
}

// =============================================================================
// Exercice 4 : Redactor
// Implementez une fonction qui masque les numeros de carte de credit dans un objet.
// =============================================================================

// TODO: Implementez cette fonction
// Elle prend un objet et une liste de chemins (paths) a masquer
// Pour chaque chemin, remplacez la valeur par '[REDACTED]'
// Les chemins sont de la forme 'payment.cardNumber' (notation pointee)
function redact(obj: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  // TODO: Parcourez chaque chemin, naviguez dans l'objet, masquez la valeur
  return obj;
}

// =============================================================================
// Exercice 5 : Transports
// Creez un logger avec deux transports simules : stdout et fichier.
// =============================================================================

interface Transport {
  name: string;
  entries: LogEntry[];
  write: (entry: LogEntry) => void;
}

// TODO: Implementez cette fonction
// Elle cree un transport qui stocke les LogEntry dans son tableau entries
function createTransport(name: string): Transport {
  // TODO: Retournez un objet Transport
  return {} as Transport;
}

// TODO: Implementez cette fonction
// Creez un logger qui ecrit chaque log dans tous les transports fournis
function createLoggerWithTransports(transports: Transport[]): FakePinoLogger {
  // TODO: Quand le logger ecrit un log, il doit le distribuer a tous les transports
  return {} as FakePinoLogger;
}

// =============================================================================
// Exercice 6 : Erreur avec stack trace
// Creez une fonction qui serialise une Error en objet loggable.
// =============================================================================

// TODO: Implementez ce serializer d'erreur
// Il doit retourner un objet avec : type, message, stack
function errorSerializer(err: unknown): { type: string; message: string; stack?: string } {
  // TODO: Si err est une instance d'Error, extrayez type (err.constructor.name),
  // message et stack. Sinon retournez un objet generique.
  return { type: 'Unknown', message: '' };
}

// =============================================================================
// Tests — Ne modifiez pas cette section
// =============================================================================

async function main() {
  console.log('\n🧪 Lab 02 — Logger production-ready Pino\n');

  // --- Exercice 1 ---
  await test('Ex1 — fakePino log avec string', () => {
    const logger = fakePino();
    logger.info('Server started');
    assertEqual(logger.logs.length, 1);
    assertEqual(logger.logs[0].level, 'info');
    assertEqual(logger.logs[0].msg, 'Server started');
    assert(typeof logger.logs[0].time === 'number', 'time doit etre un timestamp');
  });

  await test('Ex1 — fakePino log avec objet + string', () => {
    const logger = fakePino();
    logger.info({ port: 3000 }, 'Server started');
    assertEqual(logger.logs[0].msg, 'Server started');
    assertEqual(logger.logs[0].port, 3000);
  });

  await test('Ex1 — fakePino differents niveaux', () => {
    const logger = fakePino();
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    logger.fatal('f');
    assertEqual(logger.logs.length, 6);
    assertEqual(logger.logs[0].level, 'trace');
    assertEqual(logger.logs[5].level, 'fatal');
  });

  // --- Exercice 2 ---
  await test('Ex2 — child logger herite des bindings', () => {
    const logger = fakePino();
    const child = logger.child({ service: 'api', version: '1.0.0' });
    child.info('Request received');
    const lastLog = child.logs[child.logs.length - 1];
    assertEqual(lastLog.service, 'api');
    assertEqual(lastLog.version, '1.0.0');
    assertEqual(lastLog.msg, 'Request received');
  });

  await test('Ex2 — child logger partage les logs du parent', () => {
    const logger = fakePino();
    logger.info('parent log');
    const child = logger.child({ module: 'auth' });
    child.info('child log');
    assertEqual(logger.logs.length, 2);
    assertEqual(child.logs.length, 2);
  });

  await test('Ex2 — child de child cumule les bindings', () => {
    const logger = fakePino();
    const child1 = logger.child({ service: 'api' });
    const child2 = child1.child({ module: 'auth' });
    child2.info('nested');
    const lastLog = logger.logs[logger.logs.length - 1];
    assertEqual(lastLog.service, 'api');
    assertEqual(lastLog.module, 'auth');
  });

  // --- Exercice 3 ---
  await test('Ex3 — userSerializer supprime le password', () => {
    const user = { id: 1, name: 'Alice', password: 'secret123' };
    const sanitized = userSerializer(user) as Record<string, unknown>;
    assertEqual(sanitized.id, 1);
    assertEqual(sanitized.name, 'Alice');
    assertEqual('password' in sanitized, false);
  });

  await test('Ex3 — userSerializer preserve les autres champs', () => {
    const user = { id: 2, email: 'bob@test.com', role: 'admin' };
    const sanitized = userSerializer(user) as Record<string, unknown>;
    assertEqual(sanitized.email, 'bob@test.com');
    assertEqual(sanitized.role, 'admin');
  });

  // --- Exercice 4 ---
  await test('Ex4 — redact masque les chemins specifies', () => {
    const obj: Record<string, unknown> = {
      user: 'Alice',
      payment: { cardNumber: '4111111111111111', amount: 99.99 },
    };
    const result = redact(obj, ['payment.cardNumber']);
    assertEqual(
      (result.payment as Record<string, unknown>).cardNumber,
      '[REDACTED]'
    );
    assertEqual((result.payment as Record<string, unknown>).amount, 99.99);
  });

  await test('Ex4 — redact avec plusieurs chemins', () => {
    const obj: Record<string, unknown> = {
      user: { password: 'secret', name: 'Bob' },
      token: 'abc123',
    };
    const result = redact(obj, ['user.password', 'token']);
    assertEqual((result.user as Record<string, unknown>).password, '[REDACTED]');
    assertEqual(result.token, '[REDACTED]');
  });

  // --- Exercice 5 ---
  await test('Ex5 — transport capture les logs', () => {
    const stdout = createTransport('stdout');
    const fileTransport = createTransport('file');
    const logger = createLoggerWithTransports([stdout, fileTransport]);

    logger.info('Hello');
    logger.error('Oops');

    assertEqual(stdout.entries.length, 2);
    assertEqual(fileTransport.entries.length, 2);
    assertEqual(stdout.entries[0].msg, 'Hello');
    assertEqual(fileTransport.entries[1].msg, 'Oops');
  });

  // --- Exercice 6 ---
  await test('Ex6 — errorSerializer avec Error', () => {
    const err = new TypeError('Cannot read property x');
    const serialized = errorSerializer(err);
    assertEqual(serialized.type, 'TypeError');
    assertEqual(serialized.message, 'Cannot read property x');
    assert(typeof serialized.stack === 'string', 'stack doit etre une string');
    assert(serialized.stack!.length > 0, 'stack ne doit pas etre vide');
  });

  await test('Ex6 — errorSerializer avec non-Error', () => {
    const serialized = errorSerializer('something went wrong');
    assertEqual(serialized.type, 'Unknown');
    assertEqual(serialized.message, 'something went wrong');
  });

  summary();
}

main();

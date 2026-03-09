// =============================================================================
// Lab 02 — Logger production-ready Pino (SOLUTION)
// =============================================================================
// Ce fichier contient les solutions completes de tous les exercices.
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
// =============================================================================

function fakePino(options?: {
  level?: LogLevel;
  bindings?: Record<string, unknown>;
  serializers?: Record<string, (value: unknown) => unknown>;
  redact?: string[];
  _sharedLogs?: LogEntry[];
}): FakePinoLogger {
  const logs: LogEntry[] = options?._sharedLogs ?? [];
  const bindings = options?.bindings ?? {};

  function createLogMethod(level: LogLevel) {
    return (msgOrObj: string | Record<string, unknown>, msg?: string): void => {
      const entry: LogEntry = {
        level,
        time: Date.now(),
        msg: '',
        ...bindings,
      };

      if (typeof msgOrObj === 'string') {
        entry.msg = msgOrObj;
      } else {
        Object.assign(entry, msgOrObj);
        entry.msg = msg ?? '';
      }

      logs.push(entry);
    };
  }

  const logger: FakePinoLogger = {
    trace: createLogMethod('trace'),
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
    fatal: createLogMethod('fatal'),
    child(childBindings: Record<string, unknown>): FakePinoLogger {
      return fakePino({
        ...options,
        bindings: { ...bindings, ...childBindings },
        _sharedLogs: logs,
      });
    },
    logs,
  };

  return logger;
}

// =============================================================================
// Exercice 3 : Custom serializer
// =============================================================================

function userSerializer(user: unknown): unknown {
  if (typeof user === 'object' && user !== null) {
    const copy = { ...(user as Record<string, unknown>) };
    delete copy.password;
    return copy;
  }
  return user;
}

// =============================================================================
// Exercice 4 : Redactor
// =============================================================================

function redact(obj: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const result = JSON.parse(JSON.stringify(obj));

  for (const path of paths) {
    const parts = path.split('.');
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] && typeof current[parts[i]] === 'object') {
        current = current[parts[i]] as Record<string, unknown>;
      } else {
        break;
      }
    }

    const lastKey = parts[parts.length - 1];
    if (lastKey in current) {
      current[lastKey] = '[REDACTED]';
    }
  }

  return result;
}

// =============================================================================
// Exercice 5 : Transports
// =============================================================================

interface Transport {
  name: string;
  entries: LogEntry[];
  write: (entry: LogEntry) => void;
}

function createTransport(name: string): Transport {
  const entries: LogEntry[] = [];
  return {
    name,
    entries,
    write(entry: LogEntry) {
      entries.push(entry);
    },
  };
}

function createLoggerWithTransports(transports: Transport[]): FakePinoLogger {
  const logs: LogEntry[] = [];

  function createLogMethod(level: LogLevel) {
    return (msgOrObj: string | Record<string, unknown>, msg?: string): void => {
      const entry: LogEntry = {
        level,
        time: Date.now(),
        msg: '',
      };

      if (typeof msgOrObj === 'string') {
        entry.msg = msgOrObj;
      } else {
        Object.assign(entry, msgOrObj);
        entry.msg = msg ?? '';
      }

      logs.push(entry);
      for (const transport of transports) {
        transport.write(entry);
      }
    };
  }

  return {
    trace: createLogMethod('trace'),
    debug: createLogMethod('debug'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
    fatal: createLogMethod('fatal'),
    child(_bindings: Record<string, unknown>) {
      return this;
    },
    logs,
  };
}

// =============================================================================
// Exercice 6 : Erreur avec stack trace
// =============================================================================

function errorSerializer(err: unknown): { type: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return {
    type: 'Unknown',
    message: String(err),
  };
}

// =============================================================================
// Tests
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

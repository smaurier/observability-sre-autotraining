import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '../types/index.ts';

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

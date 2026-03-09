import { logger } from '../lib/logger.ts';

// Simulated payment service with random latency and occasional failures
export async function processPayment(orderId: string, amount: number): Promise<{ success: boolean; transactionId?: string }> {
  const latency = 50 + Math.random() * 200;
  await new Promise((resolve) => setTimeout(resolve, latency));

  // 5% failure rate
  if (Math.random() < 0.05) {
    logger.error({ orderId, amount }, 'payment processing failed');
    return { success: false };
  }

  const transactionId = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logger.info({ orderId, amount, transactionId, latencyMs: Math.round(latency) }, 'payment processed');
  return { success: true, transactionId };
}

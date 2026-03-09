import { randomUUID } from 'node:crypto';
import type { Order } from '../types/index.ts';
import { getProductById } from './product-service.ts';
import { logger } from '../lib/logger.ts';
import { ordersCreatedTotal } from '../lib/metrics.ts';

const orders: Order[] = [];

export function createOrder(productId: string, quantity: number): Order {
  const product = getProductById(productId);
  if (!product) {
    ordersCreatedTotal.inc({ status: 'error' });
    throw new Error(`Product ${productId} not found`);
  }
  if (product.stock < quantity) {
    ordersCreatedTotal.inc({ status: 'error' });
    throw new Error(`Insufficient stock for ${productId}`);
  }

  const order: Order = {
    id: randomUUID(),
    productId,
    quantity,
    total: product.price * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  product.stock -= quantity;
  ordersCreatedTotal.inc({ status: 'success' });
  logger.info({ orderId: order.id, productId, quantity, total: order.total }, 'order created');
  return order;
}

export function getOrderById(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function getAllOrders(): Order[] {
  return orders;
}

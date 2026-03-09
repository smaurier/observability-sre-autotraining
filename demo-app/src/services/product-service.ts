import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Product } from '../types/index.ts';
import { logger } from '../lib/logger.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const products: Product[] = JSON.parse(
  readFileSync(join(__dirname, '../data/products.json'), 'utf-8')
);

export function getAllProducts(): Product[] {
  logger.debug({ count: products.length }, 'fetching all products');
  return products;
}

export function getProductById(id: string): Product | undefined {
  const product = products.find((p) => p.id === id);
  if (!product) {
    logger.warn({ productId: id }, 'product not found');
  }
  return product;
}

import { Router } from 'express';
import { getAllProducts, getProductById } from '../services/product-service.ts';

const router = Router();

router.get('/', (_req, res) => {
  const products = getAllProducts();
  res.json(products);
});

router.get('/:id', (req, res) => {
  const product = getProductById(req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});

export default router;

import { Router } from 'express';
import { createOrder, getOrderById, getAllOrders } from '../services/order-service.ts';
import { processPayment } from '../services/payment-service.ts';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getAllOrders());
});

router.get('/:id', (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json(order);
});

router.post('/', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
      res.status(400).json({ error: 'productId and quantity are required' });
      return;
    }
    const order = createOrder(productId, quantity);
    const payment = await processPayment(order.id, order.total);
    res.status(201).json({ order, payment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

export default router;

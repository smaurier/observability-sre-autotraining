import express from 'express';
import { logger } from './lib/logger.ts';
import { register } from './lib/metrics.ts';
import { requestIdMiddleware } from './middleware/request-id.ts';
import { requestLoggerMiddleware } from './middleware/request-logger.ts';
import { metricsMiddleware } from './middleware/metrics.ts';
import { errorHandlerMiddleware } from './middleware/error-handler.ts';
import productsRouter from './routes/products.ts';
import ordersRouter from './routes/orders.ts';
import healthRouter from './routes/health.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(express.json());
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);

// Routes
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/health', healthRouter);

// Metrics endpoint for Prometheus
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Error handler (must be last)
app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'demo-app started');
});

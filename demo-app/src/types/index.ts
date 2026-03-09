export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  stock: number;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  total: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: Record<string, { status: string; latencyMs: number }>;
}

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
}

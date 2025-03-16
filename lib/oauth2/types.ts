export interface GraphError extends Error {
  statusCode?: number;
  code?: string;
  requestId?: string;
  body?: unknown;
} 
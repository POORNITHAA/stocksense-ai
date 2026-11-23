import { HttpError } from '../middleware/errorHandler.ts';

export type ForecastAlgorithm =
  | 'MOVING_AVERAGE'
  | 'WEIGHTED_MOVING_AVERAGE'
  | 'LINEAR_REGRESSION';

export type ForecastAggregation = 'daily' | 'weekly' | 'monthly';

export interface RunForecastInput {
  productId: string;
  algorithm: ForecastAlgorithm;
  aggregation: ForecastAggregation;
  horizonDays: 7 | 30 | 90;
  windowSize?: number;
  dataSourceFilter?: 'all' | 'sample' | 'real';
}

const VALID_ALGORITHMS = new Set<ForecastAlgorithm>([
  'MOVING_AVERAGE',
  'WEIGHTED_MOVING_AVERAGE',
  'LINEAR_REGRESSION',
]);

const VALID_AGGREGATIONS = new Set<ForecastAggregation>([
  'daily',
  'weekly',
  'monthly',
]);

export function validateForecastInput(body: unknown): RunForecastInput {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.productId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(b.productId)) {
    throw new HttpError(400, 'Valid productId is required.');
  }

  if (typeof b.algorithm !== 'string' || !VALID_ALGORITHMS.has(b.algorithm as ForecastAlgorithm)) {
    throw new HttpError(400, 'Algorithm must be MOVING_AVERAGE, WEIGHTED_MOVING_AVERAGE, or LINEAR_REGRESSION.');
  }

  if (typeof b.aggregation !== 'string' || !VALID_AGGREGATIONS.has(b.aggregation as ForecastAggregation)) {
    throw new HttpError(400, 'Aggregation must be daily, weekly, or monthly.');
  }

  const horizon = Number(b.horizonDays);
  if (horizon !== 7 && horizon !== 30 && horizon !== 90) {
    throw new HttpError(400, 'horizonDays must be 7, 30, or 90.');
  }

  let windowSize = 7;
  if (b.windowSize !== undefined) {
    const parsedWindow = Number(b.windowSize);
    if (!Number.isInteger(parsedWindow) || parsedWindow < 2 || parsedWindow > 30) {
      throw new HttpError(400, 'windowSize must be an integer between 2 and 30.');
    }
    windowSize = parsedWindow;
  }

  const dataSourceFilter =
    b.dataSourceFilter === 'sample' || b.dataSourceFilter === 'real'
      ? b.dataSourceFilter
      : 'all';

  return {
    productId: b.productId,
    algorithm: b.algorithm as ForecastAlgorithm,
    aggregation: b.aggregation as ForecastAggregation,
    horizonDays: horizon as 7 | 30 | 90,
    windowSize,
    dataSourceFilter,
  };
}

export interface AssistantChatInput {
  question: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  dataSourceFilter: 'all' | 'sample' | 'real';
}

export function validateAssistantChatInput(body: unknown): AssistantChatInput {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.question !== 'string') {
    throw new HttpError(400, 'Question must be a string.');
  }
  const question = b.question.trim();
  if (question.length < 2 || question.length > 1000) {
    throw new HttpError(400, 'Question must be between 2 and 1000 characters.');
  }

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(b.history)) {
    for (const item of b.history.slice(-10)) {
      if (
        item &&
        typeof item === 'object' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string'
      ) {
        history.push({
          role: item.role,
          content: item.content.slice(0, 2000),
        });
      }
    }
  }

  const dataSourceFilter =
    b.dataSourceFilter === 'sample' || b.dataSourceFilter === 'real'
      ? b.dataSourceFilter
      : 'all';

  return { question, history, dataSourceFilter };
}

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { validateForecastInput } from '../validation/schemas.ts';
import { queryOwnerCollection } from '../lib/firebaseAuth.ts';
import { runDemandForecast, type SaleRecord } from '../forecasting/engine.ts';

const router = Router();

router.post('/run', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = validateForecastInput(req.body);
    const { uid, idToken } = req.user!;

    const rawSales = await queryOwnerCollection(idToken, uid, 'sales', 2000);
    const filteredSales = (
      input.dataSourceFilter === 'all'
        ? rawSales
        : rawSales.filter((s) => s.dataSource === input.dataSourceFilter)
    ) as unknown as SaleRecord[];

    const result = runDemandForecast({
      productId: input.productId,
      sales: filteredSales,
      algorithm: input.algorithm,
      aggregation: input.aggregation,
      horizonDays: input.horizonDays,
      windowSize: input.windowSize,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

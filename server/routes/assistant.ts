import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.ts';
import { validateAssistantChatInput } from '../validation/schemas.ts';
import { buildBusinessSnapshot } from '../services/businessAnalytics.ts';
import {
  generateAssistantReply,
  generateExecutiveDashboardSummary,
} from '../services/geminiAssistant.ts';

const router = Router();

const REORDER_INTENT_REGEX =
  /\b(reorder|restock|purchase order|po\b|replenish|low[- ]?stock|out[- ]?of[- ]?stock|order more|buy stock|shortage)\b/i;

router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = validateAssistantChatInput(req.body);
    const { uid, idToken } = req.user!;

    const snapshot = await buildBusinessSnapshot(
      idToken,
      uid,
      input.dataSourceFilter
    );

    const reply = await generateAssistantReply({
      question: input.question,
      history: input.history,
      snapshot,
    });

    // Only surface confirmation-gated reorder proposals when relevant to the user's question
    const reorderProposals = REORDER_INTENT_REGEX.test(input.question)
      ? snapshot.reorderAlerts
          .filter((a) => a.suggestedReorderQty > 0)
          .slice(0, 3)
      : [];

    res.json({
      reply,
      metricsTimestamp: snapshot.generatedAtIso,
      dataSourceFilter: snapshot.dataSourceFilter,
      reorderProposals,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/dashboard-summary', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const rawFilter = req.body?.dataSourceFilter;
    const dataSourceFilter =
      rawFilter === 'sample' || rawFilter === 'real' ? rawFilter : 'all';

    const { uid, idToken } = req.user!;
    const snapshot = await buildBusinessSnapshot(idToken, uid, dataSourceFilter);
    const summary = await generateExecutiveDashboardSummary(snapshot);

    res.json({
      summary,
      metricsTimestamp: snapshot.generatedAtIso,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

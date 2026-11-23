import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import {
  askAssistant,
  clearAssistantConversation,
  saveAssistantMessage,
  subscribeAssistantMessages,
} from '../services/assistantService';
import { createPurchaseOrder } from '../services/purchaseOrderService';
import { formatDateTime, formatINR } from '../utils/format';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Modal } from '../components/common/Modal';
import type {
  AssistantMessageRecord,
  AssistantReorderProposal,
} from '../types';

const SUGGESTED_QUESTIONS = [
  'Which products have low stock or are out of stock?',
  'What is my total inventory valuation at cost and retail value?',
  'Summarize my sales performance and gross profit this month vs last month.',
  'What is the predicted 30-day demand for my fastest-moving products?',
  'Which purchase orders are currently pending or partially received?',
  'How are my suppliers performing on lead times and order fulfillment?',
  'Which product categories drive the most revenue and margin?',
  'What are my recent daily and monthly business trends?',
];

export function AssistantPage() {
  const { firebaseUser, isVerified } = useAuth();
  const { dataSourceFilter, suppliers, settings } = useData();

  const [messages, setMessages] = useState<AssistantMessageRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [proposals, setProposals] = useState<AssistantReorderProposal[]>([]);
  const [confirmPoTarget, setConfirmPoTarget] = useState<AssistantReorderProposal | null>(null);
  const [poQty, setPoQty] = useState(1);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [creatingPo, setCreatingPo] = useState(false);

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firebaseUser || !isVerified) {
      setMessages([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    const unsub = subscribeAssistantMessages(firebaseUser.uid, (docs) => {
      setMessages(docs);
      setHistoryLoading(false);
    });
    return () => unsub();
  }, [firebaseUser, isVerified]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  const sendQuestion = async (questionText: string, skipSavingUser = false) => {
    const q = questionText.trim();
    if (!q || loading || !firebaseUser) return;

    if (!skipSavingUser) {
      setInput('');
    }
    setError(null);
    setBanner(null);
    setLastFailedQuestion(null);
    setLoading(true);

    try {
      const historyForApi = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      if (!skipSavingUser) {
        await saveAssistantMessage({
          ownerId: firebaseUser.uid,
          role: 'user',
          content: q,
          dataSourceFilter,
        });
      }

      const res = await askAssistant({
        question: q,
        history: [...historyForApi, { role: 'user', content: q }],
        dataSourceFilter,
      });

      await saveAssistantMessage({
        ownerId: firebaseUser.uid,
        role: 'assistant',
        content: res.reply,
        dataSourceFilter: res.dataSourceFilter,
        metricsTimestamp: res.metricsTimestamp,
      });

      setProposals(res.reorderProposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
      setLastFailedQuestion(q);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  const openPoConfirmation = (proposal: AssistantReorderProposal) => {
    setConfirmPoTarget(proposal);
    setPoQty(Math.max(1, proposal.suggestedReorderQty));
    setPoSupplierId(proposal.supplierId || suppliers[0]?.supplierId || '');
    setError(null);
  };

  const handleConfirmCreatePo = async () => {
    if (!firebaseUser || !confirmPoTarget) return;
    const chosenSup = suppliers.find((s) => s.supplierId === poSupplierId);
    if (!chosenSup) {
      setError('Please select a valid supplier before confirming the purchase order.');
      return;
    }

    setCreatingPo(true);
    setError(null);
    try {
      const eta = new Date(
        Date.now() + (chosenSup.leadTimeDays || confirmPoTarget.leadTimeDays) * 24 * 60 * 60 * 1000
      );
      const res = await createPurchaseOrder(firebaseUser.uid, {
        supplierId: chosenSup.supplierId,
        supplierName: chosenSup.company,
        expectedDeliveryDate: eta,
        initialStatus: 'Pending',
        items: [
          {
            productId: confirmPoTarget.productId,
            productName: confirmPoTarget.productName,
            orderedQty: Math.max(1, Math.round(poQty)),
            unitCost: confirmPoTarget.unitCostInr,
          },
        ],
      });
      setBanner(
        `Confirmed & created Purchase Order ${res.poNumber} for ${Math.max(1, Math.round(poQty))} ${confirmPoTarget.unit} of ${confirmPoTarget.productName} with ${chosenSup.company}.`
      );
      setProposals((prev) => prev.filter((p) => p.productId !== confirmPoTarget.productId));
      setConfirmPoTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order.');
    } finally {
      setCreatingPo(false);
    }
  };

  const handleClearHistory = async () => {
    if (messages.length === 0) return;
    setClearing(true);
    setError(null);
    try {
      await clearAssistantConversation(messages.map((m) => m.messageId));
      setProposals([]);
      setClearDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear conversation history.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-4 min-h-[580px] lg:h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            AI Business Assistant
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>
              Server-side Gemini analyst grounded in verified Firestore metrics (Filter:{' '}
              <span className="font-semibold uppercase">{dataSourceFilter}</span>) · Read-only unless you explicitly confirm a PO
            </span>
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            disabled={loading}
            onClick={() => setClearDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:text-red-600 hover:border-red-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear History ({messages.length})
          </button>
        )}
      </div>

      {/* Suggested Questions */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={loading}
            onClick={() => void sendQuestion(q)}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 transition-colors disabled:opacity-60 text-left"
          >
            {q}
          </button>
        ))}
      </div>

      {banner && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {/* Confirmation-Gated Reorder Proposals */}
      {proposals.length > 0 && (
        <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-amber-900 dark:text-amber-300">
              Suggested Reorder Actions (Explicit Confirmation Required — Nothing Created Automatically)
            </span>
            <button
              type="button"
              onClick={() => setProposals([])}
              className="text-amber-700 dark:text-amber-400 hover:underline"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {proposals.map((p) => (
              <div
                key={p.productId}
                className="bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-slate-800 rounded-lg p-3 flex flex-col justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {p.productName}
                  </div>
                  <div className="text-slate-500 font-mono mt-0.5">
                    Stock: {p.currentStock} {p.unit} · ROP: {p.reorderPoint}
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 mt-1">
                    Suggested: <span className="font-mono font-semibold">{p.suggestedReorderQty} {p.unit}</span> ({formatINR(p.estimatedOrderCostInr, 0)})
                  </div>
                </div>
                <button
                  type="button"
                  disabled={suppliers.length === 0}
                  onClick={() => openPoConfirmation(p)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Review &amp; Confirm PO
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Thread */}
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {historyLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading saved conversation history...
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-2 py-8">
              <div className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-semibold">Ask about your store performance</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Questions are answered using server-computed metrics from your Firestore inventory,
                sales, forecasts, suppliers, and purchase orders. Verified business data is separated
                from advisory suggestions, and no stock edits or purchase orders occur without your
                explicit confirmation.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.messageId}
                className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}
              >
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-slate-900 text-white dark:bg-teal-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {m.content}
                  <div className="text-[10px] opacity-60 mt-1.5 flex items-center justify-end gap-2">
                    <span>{m.dataSourceFilter} data</span>
                    <span>·</span>
                    <span>{formatDateTime(m.createdAt, settings?.timezone)}</span>
                  </div>
                </div>

                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <span>Querying verified Firestore metrics and generating Gemini analysis...</span>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {lastFailedQuestion && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(lastFailedQuestion, true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100 shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder="Ask about inventory valuation, low stock, predicted demand, POs, or suppliers..."
            className="flex-1 w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            Ask AI
          </button>
        </form>
      </div>

      {/* Explicit Confirmation Modal for Creating Purchase Order */}
      <Modal
        open={Boolean(confirmPoTarget)}
        onClose={() => !creatingPo && setConfirmPoTarget(null)}
        title="Confirm Purchase Order Creation"
        subtitle="Explicit user confirmation is required before writing a Purchase Order to Firestore."
        maxWidth="max-w-lg"
      >
        {confirmPoTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 space-y-1">
              <div className="font-semibold text-sm text-slate-900 dark:text-white">
                {confirmPoTarget.productName} ({confirmPoTarget.sku})
              </div>
              <div className="text-slate-500">
                Current Stock: {confirmPoTarget.currentStock} {confirmPoTarget.unit} · Reorder Point:{' '}
                {confirmPoTarget.reorderPoint} · Target Stock: {confirmPoTarget.targetStock}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Supplier</label>
                <select
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {suppliers.map((s) => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.company} ({s.leadTimeDays}d lead)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">
                  Order Quantity ({confirmPoTarget.unit})
                </label>
                <input
                  type="number"
                  min={1}
                  value={poQty}
                  onChange={(e) => setPoQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500">Estimated Total Cost</span>
              <span className="font-mono font-bold text-sm">
                {formatINR(Math.max(1, Math.round(poQty)) * confirmPoTarget.unitCostInr, 0)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={creatingPo}
                onClick={() => setConfirmPoTarget(null)}
                className="px-4 py-2 font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingPo || !poSupplierId}
                onClick={handleConfirmCreatePo}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {creatingPo ? 'Creating PO...' : 'Confirm & Create Purchase Order'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={clearDialogOpen}
        title="Clear Conversation History"
        description={`Delete all ${messages.length} saved AI assistant messages from your Firestore account?`}
        confirmLabel="Clear History"
        destructive
        loading={clearing}
        onConfirm={handleClearHistory}
        onCancel={() => setClearDialogOpen(false)}
      />
    </div>
  );
}

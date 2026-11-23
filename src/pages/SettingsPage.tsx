import React, { useEffect, useState } from 'react';
import { CheckCircle2, Database, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { updateStoreSettings } from '../services/settingsService';
import { updateUserProfileName } from '../services/userService';
import { clearSampleData, seedDemoDataIfNeeded } from '../services/demoSeeder';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export function SettingsPage() {
  const { firebaseUser, profile, refreshProfile } = useAuth();
  const { settings, allProducts, allSuppliers, allSales } = useData();
  const { theme, setTheme } = useTheme();

  const [storeName, setStoreName] = useState('FreshMart Superstore');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [defaultSafetyStock, setDefaultSafetyStock] = useState(15);
  const [defaultLeadTimeDays, setDefaultLeadTimeDays] = useState(5);
  const [lowStockThreshold, setLowStockThreshold] = useState(20);
  const [displayName, setDisplayName] = useState('');

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [reseeding, setReseeding] = useState(false);

  useEffect(() => {
    if (settings) {
      setStoreName(settings.storeName);
      setCurrency(settings.currency);
      setTimezone(settings.timezone);
      setDefaultSafetyStock(settings.defaultSafetyStock);
      setDefaultLeadTimeDays(settings.defaultLeadTimeDays);
      setLowStockThreshold(settings.lowStockThreshold);
    }
    if (profile) {
      setDisplayName(profile.name);
    }
  }, [settings, profile]);

  const sampleCount =
    allProducts.filter((p) => p.dataSource === 'sample').length +
    allSuppliers.filter((s) => s.dataSource === 'sample').length +
    allSales.filter((s) => s.dataSource === 'sample').length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setStatusMsg(null);
    setErrorMsg(null);

    const safety = Number(defaultSafetyStock);
    const leadTime = Number(defaultLeadTimeDays);
    const threshold = Number(lowStockThreshold);

    if (!Number.isFinite(safety) || safety < 0) {
      setErrorMsg('Default safety stock must be zero or greater.');
      return;
    }
    if (!Number.isFinite(leadTime) || leadTime < 1) {
      setErrorMsg('Default supplier lead time must be at least 1 day.');
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      setErrorMsg('Default low-stock threshold must be zero or greater.');
      return;
    }

    setSaving(true);
    try {
      await updateStoreSettings(firebaseUser.uid, {
        storeName: storeName.trim() || 'FreshMart Superstore',
        currency,
        timezone,
        defaultSafetyStock: Math.round(safety),
        defaultLeadTimeDays: Math.round(leadTime),
        lowStockThreshold: Math.round(threshold),
        theme,
      });
      if (displayName.trim() && displayName.trim() !== profile?.name) {
        await updateUserProfileName(firebaseUser.uid, displayName);
        await refreshProfile();
      }
      setStatusMsg('Store and profile settings saved to Firestore.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearSample = async () => {
    if (!firebaseUser) return;
    setClearing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const removed = await clearSampleData(firebaseUser.uid);
      setConfirmClearOpen(false);
      setStatusMsg(
        `Removed ${removed} sample dataset entries. All user-created real records remain intact.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to clear sample data.');
    } finally {
      setClearing(false);
    }
  };

  const handleReseedDemo = async () => {
    if (!firebaseUser) return;
    setReseeding(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await seedDemoDataIfNeeded(firebaseUser.uid, true);
      setStatusMsg('Sample supermarket dataset restored cleanly.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to seed demo data.');
    } finally {
      setReseeding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          Store &amp; Account Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Configure store defaults, theme preferences, profile details, and demo data lifecycle
        </p>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
      >
        <h2 className="text-sm font-semibold border-b border-slate-100 dark:border-slate-800 pb-2">
          Store Configuration &amp; Defaults
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Store Name</label>
            <input
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Profile Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="INR">INR (₹ Indian Rupee)</option>
              <option value="USD">USD ($ US Dollar)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Default Safety Stock</label>
            <input
              type="number"
              min={0}
              value={defaultSafetyStock}
              onChange={(e) => setDefaultSafetyStock(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Default Supplier Lead Time (Days)</label>
            <input
              type="number"
              min={1}
              value={defaultLeadTimeDays}
              onChange={(e) => setDefaultLeadTimeDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Default Low-Stock Threshold</label>
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Math.max(0, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Interface Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex-1 py-2 text-xs font-medium rounded-lg border capitalize ${
                    theme === t
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-teal-600 dark:border-teal-600'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {t} Mode
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Demo Data Management */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="w-4 h-4 text-teal-600" />
          <span>Sample Dataset Management</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Sample supermarket records (<span className="font-mono">dataSource = &quot;sample&quot;</span>) can be cleared safely at any time without affecting real products, sales, or purchase orders you created (<span className="font-mono">dataSource = &quot;real&quot;</span>).
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={clearing || sampleCount === 0}
            onClick={() => setConfirmClearOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Sample Records
          </button>
          <button
            type="button"
            disabled={reseeding}
            onClick={handleReseedDemo}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reseeding ? 'animate-spin' : ''}`} />
            {reseeding ? 'Seeding...' : 'Restore Sample Dataset'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear Sample Supermarket Records"
        description="This permanently removes all sample products, sample suppliers, sample 90-day sales, and sample purchase orders. All real user-created records remain untouched."
        confirmLabel="Clear Sample Data"
        destructive
        loading={clearing}
        onConfirm={handleClearSample}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}

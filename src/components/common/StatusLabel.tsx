import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';

type Tone = 'success' | 'warning' | 'critical' | 'neutral' | 'info';

interface StatusLabelProps {
  label: string;
  tone: Tone;
}

const TONE_MAP: Record<Tone, string> = {
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-red-600 dark:text-red-400',
  info: 'text-sky-700 dark:text-sky-400',
  neutral: 'text-slate-600 dark:text-slate-400',
};

export function StatusLabel({ label, tone }: StatusLabelProps) {
  const Icon =
    tone === 'success'
      ? CheckCircle2
      : tone === 'warning'
      ? AlertCircle
      : tone === 'critical'
      ? XCircle
      : Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TONE_MAP[tone]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

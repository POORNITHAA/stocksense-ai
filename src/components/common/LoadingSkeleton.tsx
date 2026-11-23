export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading data">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-3.5 w-72 rounded bg-slate-200/80 dark:bg-slate-800/80" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="h-9 w-full rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="py-3.5 flex items-center justify-between gap-4">
              <div className="h-4 w-1/3 rounded bg-slate-200/70 dark:bg-slate-800" />
              <div className="h-4 w-1/4 rounded bg-slate-100 dark:bg-slate-800/70" />
              <div className="h-4 w-16 rounded bg-slate-200/70 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

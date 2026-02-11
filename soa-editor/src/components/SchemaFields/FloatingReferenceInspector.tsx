import { useEffect, useState, type ReactNode } from 'react';

interface FloatingReferenceInspectorProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  controls?: ReactNode;
  children: ReactNode;
}

export default function FloatingReferenceInspector({
  open,
  title,
  subtitle,
  onClose,
  controls,
  children,
}: FloatingReferenceInspectorProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCollapsed(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed z-[80] left-2 right-2 bottom-2 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[24rem] pointer-events-none">
      <div className="pointer-events-auto rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur shadow-2xl overflow-hidden">
        <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/90">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Reference Inspector</div>
            <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
            {subtitle && <div className="text-[11px] text-slate-600 truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
            {controls}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

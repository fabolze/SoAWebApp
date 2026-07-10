export const BUTTON_CLASSES = {
  primary:
    "inline-flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition-colors disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-blue-800 disabled:opacity-100",
  secondary:
    "inline-flex items-center justify-center rounded-md bg-slate-200 text-slate-900 hover:bg-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 dark:disabled:bg-slate-800 dark:disabled:text-slate-500",
  neutral:
    "inline-flex items-center justify-center rounded-md bg-slate-700 text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 disabled:opacity-100",
  success:
    "inline-flex items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300 transition-colors disabled:cursor-not-allowed disabled:bg-green-200 disabled:text-green-800 disabled:opacity-100",
  danger:
    "inline-flex items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 transition-colors disabled:cursor-not-allowed disabled:bg-red-200 disabled:text-red-800 disabled:opacity-100",
  indigo:
    "inline-flex items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition-colors disabled:cursor-not-allowed disabled:bg-indigo-200 disabled:text-indigo-800 disabled:opacity-100",
  violet:
    "inline-flex items-center justify-center rounded-md bg-violet-600 text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 transition-colors disabled:cursor-not-allowed disabled:bg-violet-200 disabled:text-violet-800 disabled:opacity-100",
  outline:
    "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:disabled:bg-slate-800 dark:disabled:text-slate-500",
  link:
    "inline-flex items-center justify-center rounded-md text-blue-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300",
  icon:
    "inline-flex items-center justify-center rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-200",
} as const;

export const ISSUE_CLASSES = {
  blocker: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
} as const;

export const BUTTON_SIZES = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2 text-base",
} as const;

export const TEXT_CLASSES = {
  heading: "text-slate-900 dark:text-slate-100",
  body: "text-slate-800 dark:text-slate-200",
  muted: "text-slate-600 dark:text-slate-400",
  subtle: "text-slate-500 dark:text-slate-500",
  onDark: "text-slate-100",
} as const;

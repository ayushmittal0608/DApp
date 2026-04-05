import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type AlertType = 'error' | 'info' | 'success';

export interface AlertMessage {
  message: string;
  type: AlertType;
}

export function AlertBox({ alert, onClose }: { alert: AlertMessage | null; onClose: () => void }) {
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[90] w-full max-w-2xl px-6 pointer-events-none">
      <AnimatePresence>
        {alert && (
          <motion.div
            key={alert.message}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur',
              alert.type === 'error' && 'bg-red-500/10 border-red-500/30 text-red-200',
              alert.type === 'info' && 'bg-blue-500/10 border-blue-500/30 text-blue-200',
              alert.type === 'success' && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            )}
          >
            {alert.type === 'error' && <AlertTriangle className="mt-0.5 h-5 w-5" />}
            {alert.type === 'info' && <Info className="mt-0.5 h-5 w-5" />}
            {alert.type === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5" />}
            <div className="flex-1">
              <div className="text-[11px] font-black tracking-[0.2em] uppercase opacity-70">
                {alert.type === 'error' ? 'Action Required' : alert.type === 'info' ? 'Notice' : 'Success'}
              </div>
              <div className="text-sm font-medium mt-1">{alert.message}</div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

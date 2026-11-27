import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

const ICONS = { success: CheckCircle2, warn: AlertTriangle, error: XCircle, info: Info };
const COLORS = { success: 'text-emerald-300', warn: 'text-amber-300', error: 'text-rose-300', info: 'text-cyan-300' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] space-y-2 w-[340px] max-w-[90vw]">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] || Info;
          return (
            <div key={t.id} className="anim-toast card px-4 py-3 flex gap-3 items-start shadow-soft">
              <Icon size={18} className={`${COLORS[t.kind]} shrink-0 mt-0.5`} />
              <div className="text-sm leading-snug">{t.message}</div>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

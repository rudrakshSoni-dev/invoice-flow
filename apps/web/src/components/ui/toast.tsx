import { CircleAlert, CircleCheck } from 'lucide-react';
import { Toast as RadixToast } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { cn } from '../../lib/cn';

type ToastMessage = { id: number; title: string; description?: string; tone: 'success' | 'error' };
type ToastInput = Omit<ToastMessage, 'id'>;

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const show = useCallback((toast: ToastInput) => {
    setToasts((prev) => [...prev, { ...toast, id: Date.now() + Math.random() }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider swipeDirection="right" duration={4000}>
        {children}
        {toasts.map((toast) => {
          const Icon = toast.tone === 'success' ? CircleCheck : CircleAlert;
          return (
            <RadixToast.Root
              key={toast.id}
              onOpenChange={(open) =>
                !open && setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className="flex items-start gap-3 rounded-card border border-border bg-surface p-3 shadow-lg data-[state=open]:animate-[fade-in_150ms]"
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  toast.tone === 'success' ? 'text-approved' : 'text-failed',
                )}
              />
              <div>
                <RadixToast.Title className="text-sm font-medium">{toast.title}</RadixToast.Title>
                {toast.description && (
                  <RadixToast.Description className="mt-0.5 text-xs text-text-muted">
                    {toast.description}
                  </RadixToast.Description>
                )}
              </div>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_BASE, type InvoiceStatus, type PipelineStage } from './api';

type LiveState = {
  stageOf: (invoiceId: string) => PipelineStage | undefined;
  isFlashing: (invoiceId: string) => boolean;
};

const LiveContext = createContext<LiveState>({ stageOf: () => undefined, isFlashing: () => false });

const FLASH_MS = 1500;

/** One EventSource for the app: refreshes queries on status changes and tracks pipeline stages. */
export function InvoiceEventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [stages, setStages] = useState<Record<string, PipelineStage>>({});
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API_BASE}/events`);
    const activeTimers = timers.current;

    const flash = (id: string) => {
      setFlashing((prev) => new Set(prev).add(id));
      clearTimeout(activeTimers.get(id));
      activeTimers.set(
        id,
        setTimeout(() => {
          setFlashing((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, FLASH_MS),
      );
    };

    source.addEventListener('invoice.stage', (e) => {
      const { invoiceId, stage } = JSON.parse((e as MessageEvent<string>).data) as {
        invoiceId: string;
        stage: PipelineStage;
      };
      setStages((prev) => ({ ...prev, [invoiceId]: stage }));
    });

    source.addEventListener('invoice.status', (e) => {
      const { invoiceId } = JSON.parse((e as MessageEvent<string>).data) as {
        invoiceId: string;
        status: InvoiceStatus;
      };
      flash(invoiceId);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    });

    // Another tab (or this one) reset the demo: everything cached is stale.
    source.addEventListener('demo.reset', () => {
      setStages({});
      void queryClient.invalidateQueries();
    });

    return () => {
      source.close();
      activeTimers.forEach(clearTimeout);
    };
  }, [queryClient]);

  const value = useMemo<LiveState>(
    () => ({ stageOf: (id) => stages[id], isFlashing: (id) => flashing.has(id) }),
    [stages, flashing],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveInvoices(): LiveState {
  return useContext(LiveContext);
}

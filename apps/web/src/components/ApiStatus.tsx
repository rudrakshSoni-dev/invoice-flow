import { useEffect, useState } from 'react';
import { fetchHealth } from '../lib/api';

type State = 'checking' | 'healthy' | 'unreachable';

const LABELS: Record<State, { icon: string; text: string; className: string }> = {
  checking: { icon: '…', text: 'Checking API', className: 'text-text-muted' },
  healthy: { icon: '●', text: 'API healthy', className: 'text-approved' },
  unreachable: { icon: '✕', text: 'API unreachable', className: 'text-failed' },
};

export function ApiStatus() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setState('healthy'))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn(error);
          setState('unreachable');
        }
      });
    return () => controller.abort();
  }, []);

  const { icon, text, className } = LABELS[state];
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-xs ${className}`}>
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

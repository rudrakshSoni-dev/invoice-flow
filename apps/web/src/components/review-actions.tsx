import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { api, type InvoiceDetail, type InvoiceUpdate } from '../lib/api';
import { cn } from '../lib/cn';
import { Button, focusRing } from './ui/button';
import { Dialog } from './ui/dialog';
import { useToast } from './ui/toast';

const textareaClass = cn('w-full rounded-lg border border-border bg-bg p-3 text-sm', focusRing);

export function ReviewActions({
  invoice,
  changes,
  dirty,
  onDiscard,
}: {
  invoice: InvoiceDetail;
  changes: InvoiceUpdate;
  dirty: boolean;
  onDiscard: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const done = (updated: InvoiceDetail) => {
    queryClient.setQueryData(['invoice', invoice.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['ledger'] });
    setDialog(null);
  };
  const onError = (error: Error) =>
    toast({ tone: 'error', title: 'Action failed', description: error.message });

  const save = useMutation({
    mutationFn: () => api.update(invoice.id, changes),
    onSuccess: (updated) => {
      done(updated);
      toast({ tone: 'success', title: 'Changes saved' });
    },
    onError,
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (dirty) await api.update(invoice.id, changes);
      return api.approve(invoice.id, note.trim() || undefined);
    },
    onSuccess: (updated) => {
      done(updated);
      toast({ tone: 'success', title: 'Invoice approved', description: 'Posted to the ledger.' });
    },
    onError,
  });
  const reject = useMutation({
    mutationFn: () => api.reject(invoice.id, reason.trim()),
    onSuccess: (updated) => {
      done(updated);
      toast({ tone: 'success', title: 'Invoice rejected' });
    },
    onError,
  });

  const busy = save.isPending || approve.isPending || reject.isPending;
  const reasonValid = reason.trim().length >= 3;

  return (
    <>
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-end gap-2">
          {dirty && (
            <>
              <span className="mr-auto text-xs text-review">You have unsaved edits.</span>
              <Button variant="ghost" onClick={onDiscard} disabled={busy}>
                Discard
              </Button>
              <Button variant="secondary" onClick={() => save.mutate()} disabled={busy}>
                Save edits
              </Button>
            </>
          )}
          <Button variant="danger" onClick={() => setDialog('reject')} disabled={busy}>
            <X aria-hidden="true" className="size-4" />
            Reject
          </Button>
          <Button onClick={() => setDialog('approve')} disabled={busy}>
            <Check aria-hidden="true" className="size-4" />
            Approve
          </Button>
        </div>
      </div>

      <Dialog
        open={dialog === 'approve'}
        onOpenChange={(open) => setDialog(open ? 'approve' : null)}
        title="Approve and post to ledger"
        description={
          dirty
            ? 'Your edits will be saved first. The invoice is then posted to the ledger.'
            : 'The invoice will be posted to the ledger.'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            approve.mutate();
          }}
          className="space-y-3"
        >
          <label htmlFor="approve-note" className="block text-xs text-text-muted">
            Note (optional)
          </label>
          <textarea
            id="approve-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={textareaClass}
            placeholder="e.g. Fuel surcharge agreed with the vendor"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={approve.isPending}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={dialog === 'reject'}
        onOpenChange={(open) => setDialog(open ? 'reject' : null)}
        title="Reject invoice"
        description="The vendor will need to send a corrected invoice. Nothing is posted."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonValid) reject.mutate();
          }}
          className="space-y-3"
        >
          <label htmlFor="reject-reason" className="block text-xs text-text-muted">
            Reason (required)
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={textareaClass}
            placeholder="e.g. Billed in USD; PO is in EUR"
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!reasonValid || reject.isPending}>
              {reject.isPending ? 'Rejecting…' : 'Reject invoice'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

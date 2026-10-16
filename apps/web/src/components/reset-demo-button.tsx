import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { useToast } from './ui/toast';

export function ResetDemoButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const reset = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries();
      navigate('/');
      toast({ tone: 'success', title: 'Demo data reset' });
    },
    onError: (error: Error) =>
      toast({ tone: 'error', title: 'Reset failed', description: error.message }),
  });

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <RotateCcw aria-hidden="true" className="size-3.5" />
        Reset demo data
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Reset demo data?"
        description="Deletes every uploaded invoice and restores the sample vendors, purchase orders and invoice history."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {reset.isPending ? 'Resetting…' : 'Reset'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

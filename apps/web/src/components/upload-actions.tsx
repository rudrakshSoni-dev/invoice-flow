import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileText, Upload } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef } from 'react';
import { api } from '../lib/api';
import { Button, focusRing } from './ui/button';
import { useToast } from './ui/toast';
import { cn } from '../lib/cn';

export function UploadActions({ samplesOnly = false }: { samplesOnly?: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const samples = useQuery({ queryKey: ['samples'], queryFn: api.samples, staleTime: Infinity });

  const onQueued = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };
  const onError = (error: Error) =>
    toast({ tone: 'error', title: 'Upload failed', description: error.message });

  const upload = useMutation({
    mutationFn: api.upload,
    onSuccess: (_, file) => {
      onQueued();
      toast({
        tone: 'success',
        title: 'Invoice received',
        description: `${file.name} is being processed.`,
      });
    },
    onError,
  });
  const uploadSample = useMutation({
    mutationFn: api.uploadSample,
    onSuccess: () => {
      onQueued();
      toast({
        tone: 'success',
        title: 'Sample invoice received',
        description: 'The agent is processing it now.',
      });
    },
    onError,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!samplesOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Upload invoice PDF"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            <Upload aria-hidden="true" className="size-4" />
            {upload.isPending ? 'Uploading…' : 'Upload invoice'}
          </Button>
        </>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant={samplesOnly ? 'primary' : 'secondary'} disabled={uploadSample.isPending}>
            <FileText aria-hidden="true" className="size-4" />
            Try a sample invoice
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 max-h-96 w-80 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-xl"
          >
            {samples.isLoading && <p className="p-3 text-xs text-text-muted">Loading samples…</p>}
            {samples.isError && <p className="p-3 text-xs text-failed">Could not load samples.</p>}
            {samples.data?.map((sample) => (
              <DropdownMenu.Item
                key={sample.id}
                onSelect={() => uploadSample.mutate(sample.id)}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-border/50',
                  focusRing,
                )}
              >
                <span className="amount block text-xs text-text-muted">{sample.file}</span>
                <span className="block text-sm">{sample.scenario}</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

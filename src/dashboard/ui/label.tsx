import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../lib/cn';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('flex items-center gap-2 text-sm font-medium leading-none select-none', className)} {...props} />;
}

/** Label + control + help/error, wired with aria-describedby. */
export function Field({ label, htmlFor, labelAfter, help, error, required, children }: { label: string; htmlFor: string; labelAfter?: React.ReactNode; help?: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}{required && <span className="text-destructive" aria-hidden="true">*</span>}</Label>
        {labelAfter}
      </div>
      {children}
      {help && <p id={`${htmlFor}-help`} className="text-xs text-muted-foreground">{help}</p>}
      {error && <p id={`${htmlFor}-error`} className="text-xs font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

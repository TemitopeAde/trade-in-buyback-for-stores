import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../lib/cn';

export function Separator({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return <SeparatorPrimitive.Root orientation={orientation} className={cn('shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px', className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden="true" {...props} />;
}

export function Alert({ variant = 'info', title, children, className }: { variant?: 'info' | 'destructive' | 'success' | 'warning'; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = variant === 'destructive' || variant === 'warning' ? AlertCircle : variant === 'success' ? CheckCircle2 : Info;
  return (
    <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn('relative grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm', variant === 'destructive' && 'border-destructive/40 text-destructive', variant === 'success' && 'border-success/40', variant === 'warning' && 'border-warning/60 bg-warning/5', className)}>
      <Icon className="mt-0.5 size-4" aria-hidden="true" />
      <div className="grid gap-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

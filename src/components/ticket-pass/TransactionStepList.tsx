import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

export type TransactionStepStatus = 'idle' | 'executing' | 'success' | 'error';

export type TransactionStep = {
  id: string;
  label: string;
  status: TransactionStepStatus;
  error?: string;
};

interface TransactionStepListProps {
  steps: TransactionStep[];
}

export function TransactionStepList({ steps }: TransactionStepListProps) {
  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div key={step.id} className="flex min-w-0 items-start gap-3">
          {step.status === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />}
          {step.status === 'executing' && <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-blue-600" />}
          {step.status === 'error' && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
          {step.status === 'idle' && <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />}

          <div className="min-w-0">
            <p className="text-sm font-medium leading-5 text-foreground">{step.label}</p>
            {step.error && <p className="mt-0.5 break-words text-xs leading-5 text-red-600">{step.error}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

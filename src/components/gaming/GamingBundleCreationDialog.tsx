
import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { TxStep } from "@/hooks/useTransactionStepper";
import { Badge } from "@/components/ui/badge";

interface GamingBundleCreationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    steps: TxStep[];
    currentStepIndex: number;
    onRetry: (index: number) => void;
    onComplete: () => void;
    title?: string;
}

export const GamingBundleCreationDialog: React.FC<GamingBundleCreationDialogProps> = ({
    open,
    onOpenChange,
    steps,
    currentStepIndex,
    onRetry,
    onComplete,
    title = "Creating Gaming Bundle"
}) => {
    const isFinished = steps.every(s => s.status === 'success');
    const hasError = steps.some(s => s.status === 'error');

    return (
        <Dialog open={open} onOpenChange={(val) => {
            // Prevent closing while executing or if finished (force explicit button click)
            if (steps.some(s => s.status === 'executing')) return;
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Please follow the steps below and approve transactions in your wallet.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {steps.map((step, index) => (
                        <div
                            key={step.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${index === currentStepIndex ? 'bg-blue-50/50 border-blue-200' :
                                    step.status === 'success' ? 'bg-green-50/30 border-green-100' :
                                        'bg-gray-50/50 border-gray-100'
                                }`}
                        >
                            <div className="mt-0.5">
                                {step.status === 'executing' && <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />}
                                {step.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                                {step.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}
                                {step.status === 'idle' && <div className="w-5 h-5 rounded-full border-2 border-gray-200" />}
                            </div>

                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className={`text-sm font-semibold ${index === currentStepIndex ? 'text-blue-900' :
                                            step.status === 'success' ? 'text-green-900' : 'text-gray-900'
                                        }`}>
                                        {step.label}
                                    </span>
                                    {step.status === 'executing' && (
                                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider animate-pulse bg-blue-100 text-blue-700 border-blue-200">
                                            Processing
                                        </Badge>
                                    )}
                                </div>

                                {step.description && (
                                    <p className="text-xs text-gray-600">{step.description}</p>
                                )}

                                {step.status === 'error' && (
                                    <div className="mt-2 space-y-2">
                                        <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded">
                                            {step.error}
                                        </p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs border-red-200 hover:bg-red-50"
                                            onClick={() => onRetry(index)}
                                        >
                                            <RefreshCw className="w-3 h-3 mr-1.5" />
                                            Retry Step
                                        </Button>
                                    </div>
                                )}

                                {step.txHash && (
                                    <div className="mt-1">
                                        <a
                                            href={`https://basescan.org/tx/${step.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                                        >
                                            View Transaction <ExternalLink className="w-2 h-2" />
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end pt-2">
                    {isFinished ? (
                        <Button onClick={onComplete} className="w-full">
                            Finish & Refresh
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={steps.some(s => s.status === 'executing')}>
                            {hasError ? 'Close & Save Progress' : 'Cancel'}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

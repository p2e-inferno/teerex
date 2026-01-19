
import { useState, useCallback } from 'react';

export type TxStepStatus = 'idle' | 'executing' | 'success' | 'error';

export interface TxStep {
    id: string;
    label: string;
    description?: string;
    status: TxStepStatus;
    error?: string;
    txHash?: string;
    action: () => Promise<any>;
}

export function useTransactionStepper(initialSteps: Omit<TxStep, 'status'>[]) {
    const [steps, setSteps] = useState<TxStep[]>(
        initialSteps.map(step => ({ ...step, status: 'idle' }))
    );
    const [currentStepIndex, setCurrentStepIndex] = useState(-1);
    const [isExecuting, setIsExecuting] = useState(false);

    const executeStep = useCallback(async (index: number) => {
        setIsExecuting(true);
        setCurrentStepIndex(index);

        let currentStep: TxStep | undefined;

        // Use a temporary way to get the latest step without depending on 'steps' state directly in the callback
        setSteps(prev => {
            currentStep = prev[index];
            if (!currentStep) return prev;
            return prev.map((s, i) => i === index ? { ...s, status: 'executing', error: undefined } : s);
        });

        // Small delay to ensure state has 'started' before we run the heavy action
        // This also helps with the UI transition
        await new Promise(resolve => setTimeout(resolve, 0));

        try {
            // Re-fetch the step from the state to be safe, though currentStep from above is likely same
            // Actually, we need to be careful here. If we use the 'prev' from setSteps, we can't easily run the async action.
            // Let's assume the index is valid based on the call site.

            // We need the action. Since actions are functions that might change, we should be careful.
            // In our case, the actions are part of the 'steps' objects.

            // Let's find the step again to get its action
            let actionToRun: (() => Promise<any>) | undefined;
            setSteps(prev => {
                actionToRun = prev[index]?.action;
                return prev;
            });

            if (!actionToRun) {
                throw new Error("Step action not found");
            }

            const result = await actionToRun();

            setSteps(prev => prev.map((s, i) => i === index ? { ...s, status: 'success', txHash: result?.transactionHash || result?.hash } : s));
            setIsExecuting(false);
            return result;
        } catch (err: any) {
            console.error(`Error in step ${index}:`, err);
            setSteps(prev => prev.map((s, i) => i === index ? { ...s, status: 'error', error: err.message || String(err) } : s));
            setIsExecuting(false);
            throw err;
        }
    }, []);

    const reset = useCallback(() => {
        setSteps(initialSteps.map(step => ({ ...step, status: 'idle' })));
        setCurrentStepIndex(-1);
        setIsExecuting(false);
    }, [initialSteps]);

    return {
        steps,
        currentStepIndex,
        isExecuting,
        executeStep,
        reset,
        setSteps
    };
}

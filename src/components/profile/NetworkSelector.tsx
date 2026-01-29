import React from 'react';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';
import { cn } from '@/lib/utils';
import { Network } from 'lucide-react';

interface NetworkSelectorProps {
    selectedChainId: number;
    onSelectChain: (chainId: number) => void;
}

export const NetworkSelector: React.FC<NetworkSelectorProps> = ({
    selectedChainId,
    onSelectChain,
}) => {
    const { networks: activeNetworks } = useNetworkConfigs();
    const chainIds = activeNetworks.map((n) => n.chain_id).sort();

    if (chainIds.length === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-1">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 px-1">
                <Network className="w-4 h-4" />
                <span className="text-sm font-medium">Network</span>
            </div>

            <div className="flex flex-wrap gap-2">
                {chainIds.map((chainId) => {
                    const networkConfig = activeNetworks.find((n) => n.chain_id === chainId);
                    const isActive = selectedChainId === chainId;

                    return (
                        <button
                            key={chainId}
                            onClick={() => onSelectChain(chainId)}
                            className={cn(
                                'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border',
                                isActive
                                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white shadow-md'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 dark:hover:bg-slate-800'
                            )}
                        >
                            {networkConfig?.chain_name || `Chain ${chainId}`}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

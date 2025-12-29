import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNetworkConfigs } from '@/hooks/useNetworkConfigs';

interface QRCodeDisplayProps {
  address: string;
  size?: number;
  chainId?: number;
}

/**
 * QR Code display component with download functionality
 * Clean, minimal design with elegant download button
 *
 * Generates EIP-681 compliant Ethereum URI for wallet compatibility:
 * - If DG token available: ethereum:DG_TOKEN@chainId/transfer?address=USER_ADDRESS&uint256=0
 * - Fallback: ethereum:USER_ADDRESS@chainId or ethereum:USER_ADDRESS
 */
export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  address,
  size = 160,
  chainId,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { networks: activeNetworks } = useNetworkConfigs();

  // Build EIP-681 compliant Ethereum URI
  const buildEthereumURI = (): string => {
    // Find network config if chainId provided and networks loaded
    const network = chainId && activeNetworks
      ? activeNetworks.find((n: { chain_id: number }) => n.chain_id === chainId)
      : null;

    // If DG token exists on this network, create token transfer URI
    if (network?.dg_token_address) {
      return `ethereum:${network.dg_token_address}@${chainId}/transfer?address=${address}&uint256=0`;
    }

    // Fallback to basic Ethereum URI with chain (if provided)
    if (chainId) {
      return `ethereum:${address}@${chainId}`;
    }

    // Ultimate fallback: plain ethereum URI
    return `ethereum:${address}`;
  };

  const ethereumURI = buildEthereumURI();

  const handleDownload = () => {
    try {
      const canvas = canvasRef.current?.querySelector('canvas');
      if (!canvas) {
        throw new Error('QR code canvas not found');
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error('Failed to generate QR code image');
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wallet-qr-${address.slice(0, 6)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: 'Downloaded',
          description: 'QR code saved to your device',
        });
      });
    } catch (error) {
      console.error('QR code download error:', error);
      toast({
        title: 'Download Failed',
        description: 'Could not download QR code',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={canvasRef} className="rounded-lg overflow-hidden">
        <QRCodeCanvas
          value={ethereumURI}
          size={size}
          level="H"
          includeMargin={false}
          bgColor="#ffffff"
          fgColor="#0f172a"
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 h-8 px-3"
      >
        <Download className="w-3.5 h-3.5 mr-1.5" />
        Save QR
      </Button>
    </div>
  );
};

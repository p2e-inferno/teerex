import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

interface WalletConnectionGateProps {
  title?: string;
  description?: string;
  fullPage?: boolean;
}

export const WalletConnectionGate: React.FC<WalletConnectionGateProps> = ({
  title = "Connect Your Wallet",
  description = "Connect your wallet to access this feature",
  fullPage = false
}) => {
  const { login, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const content = (
    <Card className="w-full max-w-md mx-auto border-0 shadow-lg bg-white">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-purple-600" />
        </div>
        <CardTitle className="text-xl text-gray-900">{title}</CardTitle>
        <CardDescription className="text-gray-600 mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={login}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl py-3"
          size="lg"
        >
          Connect Wallet
        </Button>
      </CardContent>
    </Card>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        {content}
      </div>
    );
  }

  return content;
};


import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, LogOut } from 'lucide-react';

export const WalletConnect: React.FC = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Card className="w-full max-w-md mx-auto border-0 shadow-lg bg-white">
        <CardHeader className="text-center pb-4">
          <CardTitle className="flex items-center justify-center gap-2 text-gray-900 text-xl">
            <Wallet className="h-5 w-5 text-purple-600" />
            Connect Wallet
          </CardTitle>
          <CardDescription className="text-gray-600">
            Connect your wallet to start creating events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={login} 
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl py-3"
          >
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto border-0 shadow-lg bg-white">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-gray-900">
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-600" />
            Connected
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={logout}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 mb-1">Email:</p>
            <p className="font-mono text-sm text-gray-900">{user?.email?.address}</p>
          </div>
          
          {user?.wallet && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Wallet:</p>
              <p className="font-mono text-sm break-all text-gray-900">
                {user.wallet.address}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};


import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, LogOut, Sparkles } from 'lucide-react';

export const WalletConnect: React.FC = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Card className="w-full max-w-md mx-auto bg-gray-800/40 border-gray-700/50 backdrop-blur-xl">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-white">
            <Wallet className="h-6 w-6 text-pink-400" />
            Connect Wallet
          </CardTitle>
          <CardDescription className="text-gray-300">
            Connect your wallet to start creating and managing events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={login} 
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold rounded-xl shadow-lg transform hover:scale-105 transition-all duration-200"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto bg-gray-800/40 border-gray-700/50 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <span className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-pink-400" />
            Connected
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={logout}
            className="text-gray-300 hover:text-white hover:bg-gray-700/50"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Email:</p>
          <p className="font-mono text-sm text-gray-200">{user?.email?.address}</p>
          
          {user?.wallet && (
            <>
              <p className="text-sm text-gray-400">Wallet:</p>
              <p className="font-mono text-sm break-all text-gray-200">
                {user.wallet.address}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

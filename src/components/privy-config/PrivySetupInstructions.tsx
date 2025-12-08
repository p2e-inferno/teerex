import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export const PrivySetupInstructions: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <CardTitle>Privy Setup Required</CardTitle>
          <CardDescription>
            Set VITE_PRIVY_APP_ID in your .env file with your real Privy App ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-2">
            <p><strong>Steps to get your Privy App ID:</strong></p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Visit <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privy Dashboard</a></li>
              <li>Copy your App ID from your app settings</li>
              <li>Copy .env.example to .env and set VITE_PRIVY_APP_ID</li>
              <li>Restart the development server</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useUserAttestations } from '@/hooks/useAttestations';
import { Loader2, Shield, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const Attestations = () => {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  
  const { attestations, isLoading } = useUserAttestations(wallet?.address || '');

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-6 max-w-6xl text-center">
          <div className="py-20 px-6 bg-white rounded-lg shadow-sm border">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <User className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800">Please Connect Your Wallet</h3>
            <p className="text-gray-600 mt-2 max-w-md mx-auto">
              Connect your wallet to view your attestations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Attestations</h1>
          <p className="text-gray-600">Your blockchain-verified event attestations and credentials.</p>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
          </div>
        ) : attestations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {attestations.map((attestation: any) => (
              <Card key={attestation.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    Event Attestation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Status:</span>
                      <Badge variant={attestation.is_revoked ? "destructive" : "default"}>
                        {attestation.is_revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Created:</span>
                      <span className="text-sm text-gray-900">
                        {new Date(attestation.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 break-all">
                      UID: {attestation.attestation_uid}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-6 bg-white rounded-lg shadow-sm border">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Shield className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800">No Attestations Yet</h3>
            <p className="text-gray-600 mt-2 max-w-md mx-auto">
              Your event attestations and credentials will appear here once you participate in events.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attestations;
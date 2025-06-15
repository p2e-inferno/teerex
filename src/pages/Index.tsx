
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ticket, Shield, Users, Zap, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const { authenticated, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Ticket className="h-12 w-12 text-primary" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              TeeRex
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            The future of event ticketing powered by Web3. Create verifiable tickets, 
            build reputation through attestations, and unlock new possibilities for event creators.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <Badge variant="secondary">Multi-chain Support</Badge>
            <Badge variant="secondary">Verifiable Attestations</Badge>
            <Badge variant="secondary">Fiat & Crypto Payments</Badge>
            <Badge variant="secondary">Unlock Protocol</Badge>
          </div>

          {!authenticated ? (
            <div className="max-w-md mx-auto">
              <WalletConnect />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link to="/create">
                  Create Your First Event
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/events">View My Events</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="text-center">
            <CardHeader>
              <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Verifiable Tickets</CardTitle>
              <CardDescription>
                Create tamper-proof tickets using blockchain technology with customizable tiers and restrictions
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Users className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Attestation System</CardTitle>
              <CardDescription>
                Build reputation and verify attendance with on-chain attestations for events and participants
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
              <CardTitle>Flexible Payments</CardTitle>
              <CardDescription>
                Accept both cryptocurrency and fiat payments with Paystack integration for Nigerian users
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Getting Started Section */}
        {authenticated && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Welcome to TeeRex!</CardTitle>
              <CardDescription>
                You're all set to start creating and managing events. Here's what you can do:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Button variant="outline" className="h-auto p-4 flex flex-col items-start" asChild>
                  <Link to="/create">
                    <div className="font-semibold mb-1">Create Event</div>
                    <div className="text-sm text-muted-foreground">
                      Set up your first Web3 event with custom tiers
                    </div>
                  </Link>
                </Button>
                
                <Button variant="outline" className="h-auto p-4 flex flex-col items-start" asChild>
                  <Link to="/attestations">
                    <div className="font-semibold mb-1">View Attestations</div>
                    <div className="text-sm text-muted-foreground">
                      Manage your reputation and event verifications
                    </div>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;

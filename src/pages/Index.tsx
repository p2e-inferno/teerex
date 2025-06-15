
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ticket, Shield, Users, Zap, ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const { authenticated, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-20 left-10 w-72 h-72 bg-pink-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 py-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="relative">
              <Ticket className="h-16 w-16 text-pink-400" />
              <Sparkles className="h-6 w-6 text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
            </div>
            <h1 className="text-7xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              TeeRex
            </h1>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Delightful events
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              start here.
            </span>
          </h2>

          <p className="text-xl text-gray-300 mb-8 leading-relaxed max-w-2xl mx-auto">
            Set up an event page, invite friends and sell tickets. Host a memorable event today with Web3 technology.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <Badge variant="secondary" className="bg-gray-800/50 text-pink-300 border-pink-500/20 backdrop-blur-sm">
              Multi-chain Support
            </Badge>
            <Badge variant="secondary" className="bg-gray-800/50 text-purple-300 border-purple-500/20 backdrop-blur-sm">
              Verifiable Attestations
            </Badge>
            <Badge variant="secondary" className="bg-gray-800/50 text-blue-300 border-blue-500/20 backdrop-blur-sm">
              Fiat & Crypto Payments
            </Badge>
            <Badge variant="secondary" className="bg-gray-800/50 text-green-300 border-green-500/20 backdrop-blur-sm">
              Unlock Protocol
            </Badge>
          </div>

          {!authenticated ? (
            <div className="max-w-md mx-auto">
              <WalletConnect />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold px-8 py-3 rounded-xl shadow-2xl transform hover:scale-105 transition-all duration-200"
                asChild
              >
                <Link to="/create">
                  Create Your First Event
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-2 border-purple-400/50 text-purple-300 hover:bg-purple-500/20 backdrop-blur-sm rounded-xl px-8 py-3"
                asChild
              >
                <Link to="/events">View My Events</Link>
              </Button>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl text-center hover:transform hover:scale-105 transition-all duration-300">
            <CardHeader>
              <div className="bg-gradient-to-br from-pink-500 to-purple-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-white">Verifiable Tickets</CardTitle>
              <CardDescription className="text-gray-300">
                Create tamper-proof tickets using blockchain technology with customizable tiers and restrictions
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl text-center hover:transform hover:scale-105 transition-all duration-300">
            <CardHeader>
              <div className="bg-gradient-to-br from-blue-500 to-cyan-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <Users className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-white">Attestation System</CardTitle>
              <CardDescription className="text-gray-300">
                Build reputation and verify attendance with on-chain attestations for events and participants
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl text-center hover:transform hover:scale-105 transition-all duration-300">
            <CardHeader>
              <div className="bg-gradient-to-br from-yellow-500 to-orange-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <Zap className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-white">Flexible Payments</CardTitle>
              <CardDescription className="text-gray-300">
                Accept both cryptocurrency and fiat payments with Paystack integration for Nigerian users
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Getting Started Section */}
        {authenticated && (
          <Card className="max-w-2xl mx-auto bg-gray-800/40 border-gray-700/50 backdrop-blur-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-white flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-400" />
                Welcome to TeeRex!
              </CardTitle>
              <CardDescription className="text-gray-300">
                You're all set to start creating and managing events. Here's what you can do:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Button 
                  variant="outline" 
                  className="h-auto p-4 flex flex-col items-start bg-gray-700/30 border-gray-600/50 text-left hover:bg-gray-600/40 backdrop-blur-sm" 
                  asChild
                >
                  <Link to="/create">
                    <div className="font-semibold mb-1 text-white">Create Event</div>
                    <div className="text-sm text-gray-400">
                      Set up your first Web3 event with custom tiers
                    </div>
                  </Link>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto p-4 flex flex-col items-start bg-gray-700/30 border-gray-600/50 text-left hover:bg-gray-600/40 backdrop-blur-sm" 
                  asChild
                >
                  <Link to="/attestations">
                    <div className="font-semibold mb-1 text-white">View Attestations</div>
                    <div className="text-sm text-gray-400">
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

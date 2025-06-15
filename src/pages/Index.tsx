
import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { WalletConnect } from '@/components/WalletConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ticket, Shield, Users, Zap, ArrowRight, Sparkles, Calendar, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const { authenticated, ready } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge variant="secondary" className="bg-pink-500/10 text-pink-400 border-pink-500/20">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Web3 Events Platform
                </Badge>
                <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                  Create{' '}
                  <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                    Delightful
                  </span>
                  <br />
                  Events
                </h1>
                <p className="text-xl text-gray-300 max-w-lg">
                  Host unforgettable events with Web3 technology. Sell tickets, manage attendees, and create verifiable experiences.
                </p>
              </div>

              {!authenticated ? (
                <div className="max-w-sm">
                  <WalletConnect />
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                    asChild
                  >
                    <Link to="/create">
                      Create Event
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
                    asChild
                  >
                    <Link to="/events">View Events</Link>
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span>Secure & Verified</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Multi-chain Support</span>
                </div>
              </div>
            </div>

            {/* Right Image */}
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-pink-500/20 to-purple-500/20 p-8">
                <img 
                  src="/placeholder.svg" 
                  alt="Event Dashboard Preview" 
                  className="w-full h-auto rounded-xl shadow-2xl"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl"></div>
              </div>
              
              {/* Floating cards */}
              <div className="absolute -top-4 -left-4 bg-gray-800/90 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700/50">
                <div className="flex items-center gap-3">
                  <Calendar className="w-6 h-6 text-pink-400" />
                  <div>
                    <div className="text-sm font-medium text-white">Live Events</div>
                    <div className="text-xs text-gray-400">2,347 active</div>
                  </div>
                </div>
              </div>
              
              <div className="absolute -bottom-4 -right-4 bg-gray-800/90 backdrop-blur-sm rounded-xl p-4 shadow-xl border border-gray-700/50">
                <div className="flex items-center gap-3">
                  <Star className="w-6 h-6 text-yellow-400" />
                  <div>
                    <div className="text-sm font-medium text-white">Rating</div>
                    <div className="text-xs text-gray-400">4.9/5 ⭐</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Why Choose TeeRex?</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Everything you need to create, manage, and verify Web3 events in one platform
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl hover:transform hover:scale-105 transition-all duration-300">
              <CardHeader className="text-center">
                <div className="bg-gradient-to-br from-pink-500 to-purple-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-white">Verifiable Tickets</CardTitle>
                <CardDescription className="text-gray-300">
                  Create tamper-proof tickets using blockchain technology with customizable tiers
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl hover:transform hover:scale-105 transition-all duration-300">
              <CardHeader className="text-center">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-white">Attestation System</CardTitle>
                <CardDescription className="text-gray-300">
                  Build reputation and verify attendance with on-chain attestations
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-gray-800/40 border-gray-700/50 backdrop-blur-xl hover:transform hover:scale-105 transition-all duration-300">
              <CardHeader className="text-center">
                <div className="bg-gradient-to-br from-yellow-500 to-orange-500 w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-white">Flexible Payments</CardTitle>
                <CardDescription className="text-gray-300">
                  Accept both cryptocurrency and fiat payments with multiple integrations
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-800/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                10K+
              </div>
              <div className="text-gray-400 text-sm">Events Created</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                50K+
              </div>
              <div className="text-gray-400 text-sm">Tickets Sold</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                98%
              </div>
              <div className="text-gray-400 text-sm">Satisfaction Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                24/7
              </div>
              <div className="text-gray-400 text-sm">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {authenticated && (
        <section className="py-20">
          <div className="container mx-auto px-4">
            <Card className="max-w-4xl mx-auto bg-gradient-to-r from-pink-500/10 to-purple-500/10 border-pink-500/20 backdrop-blur-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold text-white mb-4">
                  Ready to Create Your First Event?
                </CardTitle>
                <CardDescription className="text-lg text-gray-300 mb-8">
                  Join thousands of event creators who trust TeeRex for their Web3 events
                </CardDescription>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                    asChild
                  >
                    <Link to="/create">
                      Create Your Event
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
                    asChild
                  >
                    <Link to="/attestations">View Attestations</Link>
                  </Button>
                </div>
              </CardHeader>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
};

export default Index;

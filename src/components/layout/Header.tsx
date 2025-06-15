
import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Ticket, Plus } from 'lucide-react';

export const Header: React.FC = () => {
  const { authenticated, logout } = usePrivy();

  return (
    <header className="border-b border-gray-800/50 bg-gray-900/80 backdrop-blur-xl supports-[backdrop-filter]:bg-gray-900/60">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-white">
            <Ticket className="h-6 w-6 text-pink-400" />
            <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
              TeeRex
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-gray-300 hover:text-white transition-colors">
              Home
            </Link>
            {authenticated && (
              <>
                <Link to="/events" className="text-gray-300 hover:text-white transition-colors">
                  My Events
                </Link>
                <Link to="/create" className="text-gray-300 hover:text-white transition-colors">
                  Create Event
                </Link>
                <Link to="/attestations" className="text-gray-300 hover:text-white transition-colors">
                  Attestations
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {authenticated ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 backdrop-blur-sm"
                  asChild
                >
                  <Link to="/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Event
                  </Link>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-300 hover:text-white hover:bg-gray-800/50"
                  onClick={logout}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 backdrop-blur-sm"
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

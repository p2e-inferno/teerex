
import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Ticket, Plus } from 'lucide-react';

export const Header: React.FC = () => {
  const { authenticated, logout, login } = usePrivy();

  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 sticky top-0 z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-gray-900">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <Ticket className="h-5 w-5 text-white" />
            </div>
            <span>TeeRex</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link to="/explore" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
              Explore
            </Link>
            {authenticated && (
              <>
                <Link to="/events" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
                  My Events
                </Link>
                <Link to="/create" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
                  Create
                </Link>
                <Link to="/attestations" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
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
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                  asChild
                >
                  <Link to="/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create
                  </Link>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium"
                  onClick={logout}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                onClick={login}
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


import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Ticket, Plus, Calendar, Settings } from 'lucide-react';

export const Header: React.FC = () => {
  const { authenticated, user, logout } = usePrivy();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <Ticket className="h-6 w-6 text-primary" />
            TeeRex
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              Home
            </Link>
            {authenticated && (
              <>
                <Link to="/events" className="text-muted-foreground hover:text-foreground transition-colors">
                  My Events
                </Link>
                <Link to="/create" className="text-muted-foreground hover:text-foreground transition-colors">
                  Create Event
                </Link>
                <Link to="/attestations" className="text-muted-foreground hover:text-foreground transition-colors">
                  Attestations
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {authenticated ? (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Event
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm">
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

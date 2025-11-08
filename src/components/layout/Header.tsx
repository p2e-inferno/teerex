
import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Ticket, Plus, ChevronDown, FileText, Calendar, LogOut, User, Settings } from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';

export const Header: React.FC = () => {
  const { authenticated, logout, login } = usePrivy();
  const { isAdmin } = useIsAdmin();

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
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium"
                    >
                      <User className="h-4 w-4 mr-2" />
                      Account
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-200 shadow-lg">
                    <DropdownMenuItem asChild>
                      <Link to="/events" className="flex items-center cursor-pointer">
                        <Calendar className="h-4 w-4 mr-2" />
                        My Events
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/my-tickets" className="flex items-center cursor-pointer">
                        <Ticket className="h-4 w-4 mr-2" />
                        My Tickets
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/drafts" className="flex items-center cursor-pointer">
                        <FileText className="h-4 w-4 mr-2" />
                        Drafts
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="flex items-center cursor-pointer">
                          <Settings className="h-4 w-4 mr-2" />
                          Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="flex items-center cursor-pointer text-red-600 focus:text-red-600">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

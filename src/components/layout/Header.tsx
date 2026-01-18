
import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Ticket, Plus, ChevronDown, FileText, Calendar, LogOut, User, Settings, Building2, Gamepad2, ScanLine, ClipboardList, Lock, Shield, UserCircle } from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsVendor } from '@/hooks/useIsVendor';

export const Header: React.FC = () => {
  const { authenticated, logout, login } = usePrivy();
  const { isAdmin } = useIsAdmin();
  const { isVendor, loading: vendorLoading } = useIsVendor();

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
            <Link to="/gaming-bundles" className="text-gray-700 hover:text-gray-900 transition-colors font-medium">
              Bundles
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
                  <DropdownMenuContent align="end" className="w-56 bg-white border border-gray-200 shadow-xl p-2 rounded-xl">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                        Personal
                      </DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <UserCircle className="h-4 w-4 mr-2 text-gray-500" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/my-tickets" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <Ticket className="h-4 w-4 mr-2 text-gray-500" />
                          My Tickets
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/my-bundles" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <Gamepad2 className="h-4 w-4 mr-2 text-gray-500" />
                          My Bundles
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    <DropdownMenuSeparator className="my-1 mx-1 bg-gray-100" />

                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                        My Activity
                      </DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/events" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                          My Events
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/create" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <Plus className="h-4 w-4 mr-2 text-gray-500" />
                          Create Event
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/drafts" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                          <FileText className="h-4 w-4 mr-2 text-gray-500" />
                          Drafts
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>

                    {isVendor && (
                      <>
                        <DropdownMenuSeparator className="my-1 mx-1 bg-gray-100" />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                            Vendor Tools
                          </DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link to="/vendor/payout-account" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <Building2 className="h-4 w-4 mr-2 text-gray-500" />
                              Payout Account
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/vendor/gaming-bundles" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <Gamepad2 className="h-4 w-4 mr-2 text-gray-500" />
                              Gaming Bundles
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/vendor/bundles-pos" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <Ticket className="h-4 w-4 mr-2 text-gray-500" />
                              POS sale Bundle
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/vendor/bundles-redeem" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <ScanLine className="h-4 w-4 mr-2 text-gray-500" />
                              Redeem Bundles
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/vendor/bundles-orders" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <ClipboardList className="h-4 w-4 mr-2 text-gray-500" />
                              Orders
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    )}

                    {!isVendor && !vendorLoading && (
                      <>
                        <DropdownMenuSeparator className="my-1 mx-1 bg-gray-100" />
                        <DropdownMenuItem asChild>
                          <Link to="/become-vendor" className="flex items-center cursor-pointer py-2 px-2 hover:bg-purple-50 rounded-md transition-colors text-purple-600 font-medium">
                            <Shield className="h-4 w-4 mr-2" />
                            Become a Vendor
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}

                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator className="my-1 mx-1 bg-gray-100" />
                        <DropdownMenuGroup>
                          <DropdownMenuLabel className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">
                            Admin
                          </DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link to="/admin" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <Settings className="h-4 w-4 mr-2 text-gray-500" />
                              Dashboard
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to="/admin/vendor-lock" className="flex items-center cursor-pointer py-2 px-2 hover:bg-gray-50 rounded-md transition-colors">
                              <Lock className="h-4 w-4 mr-2 text-gray-500" />
                              Vendor Config
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    )}

                    <DropdownMenuSeparator className="my-1 mx-1 bg-gray-100" />
                    <DropdownMenuItem onClick={logout} className="flex items-center cursor-pointer py-2 px-2 text-red-600 focus:text-red-700 focus:bg-red-50 rounded-md transition-colors font-medium">
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
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

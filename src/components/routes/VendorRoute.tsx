import React, { PropsWithChildren } from 'react';
import { Link } from 'react-router-dom';
import { useIsVendor } from '@/hooks/useIsVendor';
import NotAuthorized from '@/pages/NotAuthorized';

/**
 * Route guard for vendor-only pages
 * Checks if user owns a key in the vendor lock contract
 *
 * Shows loading state while checking
 * Shows "not configured" if no vendor lock exists
 * Shows "not vendor" with link to purchase if user doesn't own key
 * Renders children if user is a vendor
 */
export const VendorRoute: React.FC<PropsWithChildren> = ({ children }) => {
  const { isVendor, loading, vendorLockConfigured } = useIsVendor();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Checking vendor access...</div>
      </div>
    );
  }

  if (!vendorLockConfigured) {
    return (
      <NotAuthorized details="Vendor lock not configured. Please contact administrator." />
    );
  }

  if (!isVendor) {
    return (
      <NotAuthorized
        details={
          <div className="space-y-2">
            <p>You need vendor access to view this page.</p>
            <Link
              to="/become-vendor"
              className="inline-block text-primary hover:underline font-medium"
            >
              Purchase vendor access →
            </Link>
          </div>
        }
      />
    );
  }

  return <>{children}</>;
};

export default VendorRoute;

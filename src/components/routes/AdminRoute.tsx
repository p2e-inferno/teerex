import React, { PropsWithChildren } from 'react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import NotAuthorized from '@/pages/NotAuthorized';

export const AdminRoute: React.FC<PropsWithChildren> = ({ children }) => {
  const { isAdmin, loading, adminLockConfigured } = useIsAdmin();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Checking access…</div>
      </div>
    );
  }

  if (!adminLockConfigured) {
    return (
      <NotAuthorized details="Admin lock not configured. Please set VITE_ADMIN_LOCK_ADDRESS to enable admin access." />
    );
  }

  if (!isAdmin) {
    return <NotAuthorized />;
  }

  return <>{children}</>;
};

export default AdminRoute;


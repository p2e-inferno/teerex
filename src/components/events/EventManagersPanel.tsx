import React, { useState } from 'react';
import { Clock, Info, ListOrdered, Loader2, MessageSquare, MoreHorizontal, Plus, RefreshCw, Trash2, UserCheck, Users } from 'lucide-react';
import type { PublishedEvent } from '@/types/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { EventManager, EventManagerPermissions, useEventManagers } from '@/hooks/useEventManagers';
import { IdentityName } from '@/components/identity/IdentityName';
import { shortAddress } from '@/lib/identity';

interface EventManagersPanelProps {
  event: PublishedEvent;
  enabled: boolean;
}

const PERMISSION_LABELS: Array<{
  key: keyof EventManagerPermissions;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    key: 'manage_access',
    label: 'Manage Allowlist',
    description: 'Add, remove, and approve people on the event allowlist.',
    icon: UserCheck,
  },
  {
    key: 'manage_waitlist',
    label: 'Manage Waitlist',
    description: 'View the waitlist and notify people when spots open up.',
    icon: Clock,
  },
  {
    key: 'manage_discussions',
    label: 'Manage Event Discussions',
    description: 'Create, edit, and moderate posts and comments in event discussions.',
    icon: MessageSquare,
  },
  {
    key: 'manage_results',
    label: 'Manage Results',
    description: 'Submit and edit organizer-reported tournament standings.',
    icon: ListOrdered,
  },
];

export const EventManagersPanel: React.FC<EventManagersPanelProps> = ({ event, enabled }) => {
  const { toast } = useToast();
  const {
    managers,
    loading,
    saving,
    error,
    refresh,
    addManager,
    updatePermissions,
    removeManager,
    defaultPermissions,
  } = useEventManagers(event.id, enabled);
  const [identifier, setIdentifier] = useState('');
  const [label, setLabel] = useState('');
  const [permissions, setPermissions] = useState<EventManagerPermissions>(defaultPermissions);
  const [managerToRemove, setManagerToRemove] = useState<EventManager | null>(null);

  const handleAdd = async () => {
    if (!identifier.trim()) return;
    try {
      await addManager(identifier.trim(), permissions, label.trim() || undefined);
      setIdentifier('');
      setLabel('');
      setPermissions(defaultPermissions);
      toast({ title: 'Manager added', description: 'Their event permissions are now active.' });
    } catch (err: any) {
      toast({
        title: 'Could not add manager',
        description: err?.message || 'Manager add failed',
        variant: 'destructive',
      });
    }
  };

  const handleToggle = async (
    managerId: string,
    current: EventManagerPermissions,
    key: keyof EventManagerPermissions,
    value: boolean,
  ) => {
    const next = { ...current, [key]: value };
    if (!Object.values(next).some(Boolean)) {
      toast({
        title: 'Permission required',
        description: 'A manager must have at least one permission.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updatePermissions(managerId, next);
    } catch (err: any) {
      toast({
        title: 'Could not update permissions',
        description: err?.message || 'Permission update failed',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async (managerId: string) => {
    try {
      await removeManager(managerId);
      toast({ title: 'Manager removed', description: 'Their delegated access has been revoked.' });
    } catch (err: any) {
      toast({
        title: 'Could not remove manager',
        description: err?.message || 'Manager removal failed',
        variant: 'destructive',
      });
    }
  };

  const confirmRemove = async () => {
    if (!managerToRemove) return;
    const managerId = managerToRemove.id;
    setManagerToRemove(null);
    await handleRemove(managerId);
  };

  if (!enabled) return null;

  return (
    <div className="space-y-5 rounded-xl border p-5 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-purple-100 p-2.5 rounded-xl flex-shrink-0">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-gray-900">Event managers</h3>
            <p className="text-sm text-muted-foreground">
              Add trusted users by wallet address or by email if they already use Teerex.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-gray-700 flex-shrink-0"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Add manager form */}
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="manager-identifier" className="flex items-center gap-1.5 text-sm font-medium">
            Wallet address or email
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </Label>
          <div className="relative">
            <Input
              id="manager-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="0x1234... or user@email.com"
              className="pr-12"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-gray-50 p-1 text-muted-foreground hover:bg-gray-100"
              tabIndex={-1}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="manager-label" className="flex items-center gap-1.5 text-sm font-medium">
            Manager name or note
            <span className="font-normal text-muted-foreground">(optional)</span>
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
          </Label>
          <Input
            id="manager-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label to identify the manager"
          />
        </div>

        <Button
          className="w-fit bg-purple-600 hover:bg-purple-700 text-white"
          onClick={handleAdd}
          disabled={saving || !identifier.trim()}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Add
        </Button>
      </div>

      {/* Permissions */}
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">Choose what this manager can do.</p>
        {PERMISSION_LABELS.map((item) => {
          const Icon = item.icon;
          return (
            <label
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-purple-50 p-2 rounded-lg flex-shrink-0">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </div>
              <Switch
                className="data-[state=checked]:bg-purple-600"
                checked={permissions[item.key]}
                onCheckedChange={(checked) => setPermissions((prev) => ({ ...prev, [item.key]: checked }))}
              />
            </label>
          );
        })}
      </div>

      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}

      {/* Managers list */}
      <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-3 border-b bg-gray-50/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span>Email</span>
              <span>Address</span>
              <span>Permissions</span>
              <span />
            </div>
            {loading && managers.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600/50" />
              </div>
            ) : managers.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Users className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No managers added yet</p>
              </div>
            ) : (
              managers.map((manager) => (
                <div
                  key={manager.id}
                  className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-3 border-b px-4 py-4 text-sm last:border-b-0 hover:bg-gray-50/30 transition-colors"
                >
                  <div className="min-w-0">
                    {manager.email ? (
                      <div className="truncate font-medium text-gray-900" title={manager.email}>{manager.email}</div>
                    ) : (
                      <span className="text-gray-400 italic">Not provided</span>
                    )}
                    {manager.label && <div className="text-xs text-muted-foreground truncate mt-0.5">{manager.label}</div>}
                  </div>
                  <div className="text-xs pt-0.5 text-gray-600" title={manager.wallet_address}>
                    <IdentityName address={manager.wallet_address} displayName={manager.label} />
                  </div>
                  <div className="grid gap-2">
                    {PERMISSION_LABELS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <label
                          key={item.key}
                          className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-2 shadow-sm"
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3 h-3 text-purple-500 flex-shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-tight text-gray-700">{item.label}</span>
                          </div>
                          <Switch
                            className="scale-75 origin-right"
                            checked={Boolean(manager.permissions?.[item.key])}
                            onCheckedChange={(checked) => handleToggle(manager.id, manager.permissions, item.key, checked)}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setManagerToRemove(manager)}
                    title="Remove manager"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={Boolean(managerToRemove)} onOpenChange={(open) => !open && setManagerToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove manager?</AlertDialogTitle>
            <AlertDialogDescription>
              This revokes delegated access for{' '}
              {managerToRemove?.email || (
                <IdentityName
                  address={managerToRemove?.wallet_address}
                  displayName={managerToRemove?.label}
                  fallback={managerToRemove?.wallet_address ? shortAddress(managerToRemove.wallet_address) : 'this manager'}
                />
              )}
              .
              They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>
              Remove manager
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

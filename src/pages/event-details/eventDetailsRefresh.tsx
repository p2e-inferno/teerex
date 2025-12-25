import * as React from 'react';

type EventDetailsRefreshContextValue = {
  refreshToken: number;
  triggerRefresh: () => void;
};

const EventDetailsRefreshContext = React.createContext<EventDetailsRefreshContextValue | null>(null);

export function EventDetailsRefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshToken, setRefreshToken] = React.useState(0);
  const triggerRefresh = React.useCallback(() => setRefreshToken((t) => t + 1), []);

  return (
    <EventDetailsRefreshContext.Provider value={{ refreshToken, triggerRefresh }}>
      {children}
    </EventDetailsRefreshContext.Provider>
  );
}

export function useEventDetailsRefresh(): EventDetailsRefreshContextValue {
  const ctx = React.useContext(EventDetailsRefreshContext);
  if (!ctx) {
    throw new Error('useEventDetailsRefresh must be used within EventDetailsRefreshProvider');
  }
  return ctx;
}


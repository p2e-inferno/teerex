import { useRef, useState, useCallback } from 'react';

export interface SSEHandlers {
  onOpen?: (ev: Event) => void;
  onMessage?: (ev: MessageEvent) => void;
  onError?: (ev: Event) => void;
  events?: Record<string, (ev: MessageEvent) => void>;
}

export interface SSEOptions {
  autoReconnect?: boolean; // default true
  reconnectDelayMs?: number; // default 2000
}

export const useSSE = (options?: SSEOptions) => {
  const autoReconnect = options?.autoReconnect ?? true;
  const reconnectDelayMs = options?.reconnectDelayMs ?? 2000;

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const currentHandlersRef = useRef<SSEHandlers | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback((url: string, handlers?: SSEHandlers) => {
    cleanup();
    currentUrlRef.current = url;
    currentHandlersRef.current = handlers || null;

    // Attach Last-Event-ID if we have it
    const finalUrl = lastEventId ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}` : url;

    const es = new EventSource(finalUrl);
    esRef.current = es;

    es.onopen = (ev) => {
      setIsConnected(true);
      handlers?.onOpen?.(ev);
    };
    es.onerror = (ev) => {
      handlers?.onError?.(ev);
      setIsConnected(false);
      if (autoReconnect && currentUrlRef.current && !reconnectTimer.current) {
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = null;
          // Attempt reconnect with same URL and handlers
          connect(currentUrlRef.current as string, currentHandlersRef.current || undefined);
        }, reconnectDelayMs) as unknown as number;
      }
    };
    es.onmessage = (ev) => {
      setLastEventId(ev.lastEventId || null);
      handlers?.onMessage?.(ev);
    };

    if (handlers?.events) {
      Object.entries(handlers.events).forEach(([name, handler]) => {
        es.addEventListener(name, (ev) => {
          setLastEventId((ev as MessageEvent).lastEventId || null);
          handler(ev as MessageEvent);
        });
      });
    }
  }, [autoReconnect, reconnectDelayMs, cleanup, lastEventId]);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    connect,
    disconnect,
    isConnected,
    lastEventId,
  };
};


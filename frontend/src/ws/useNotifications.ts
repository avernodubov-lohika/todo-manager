import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { browserTimezone } from '../api/client';

export type NotificationType = 'overdue' | 'due_soon';
export interface NotificationItem {
  id: string;
  type: NotificationType;
  taskId: string;
  listId: string;
  title: string;
  dueDate: string;
}
export interface NotificationPrefs {
  types: NotificationType[];
  intervalSec: number;
}
export type ConnectionStatus = 'connecting' | 'open' | 'closed';

const PREFS_KEY = 'todo.notificationPrefs';
const DEFAULT_PREFS: NotificationPrefs = { types: ['overdue', 'due_soon'], intervalSec: 60 };

export function loadPrefs(): NotificationPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (p && Array.isArray(p.types) && typeof p.intervalSec === 'number') return p;
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export function useNotifications(enabled: boolean, onUnauthorized?: () => void) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);
  const wsRef = useRef<WebSocket | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  const onUnauthRef = useRef(onUnauthorized);
  onUnauthRef.current = onUnauthorized;

  const sendSubscribe = useCallback((p: NotificationPrefs) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', types: p.types, intervalSec: p.intervalSec, timezone: browserTimezone() }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let closedByUs = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        sendSubscribe(prefsRef.current);
      };
      ws.onmessage = (ev) => {
        let msg: { type: string; items?: NotificationItem[]; message?: string };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === 'notifications' && msg.items) {
          const batch = msg.items;
          const fresh = batch.filter((i) => !seen.current.has(i.id));
          batch.forEach((i) => seen.current.add(i.id));
          setItems(batch);
          if (fresh.length > 0) {
            if (first.current || fresh.length > 3) {
              toast.warning(`${fresh.length} task${fresh.length === 1 ? '' : 's'} need${fresh.length === 1 ? 's' : ''} your attention`);
            } else {
              fresh.forEach((i) =>
                (i.type === 'overdue' ? toast.error : toast.warning)(i.title, {
                  description: i.type === 'overdue' ? `Overdue since ${i.dueDate}` : `Due ${i.dueDate}`,
                }),
              );
            }
          }
          first.current = false;
        } else if (msg.type === 'error') {
          console.warn('WebSocket error message:', msg.message);
        }
      };
      ws.onclose = (ev) => {
        setStatus('closed');
        if (closedByUs) return;
        if (ev.code === 4401) return onUnauthRef.current?.();
        const delay = Math.min(30_000, 1000 * 2 ** attempt++);
        retry = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, sendSubscribe]);

  const ack = useCallback((ids: string[]) => {
    if (!ids.length) return;
    wsRef.current?.send(JSON.stringify({ type: 'ack', ids }));
    setItems((cur) => cur.filter((i) => !ids.includes(i.id)));
  }, []);

  const updatePrefs = useCallback(
    (next: NotificationPrefs) => {
      setPrefs(next);
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      sendSubscribe(next);
    },
    [sendSubscribe],
  );

  return useMemo(() => ({ status, items, prefs, ack, updatePrefs }), [status, items, prefs, ack, updatePrefs]);
}

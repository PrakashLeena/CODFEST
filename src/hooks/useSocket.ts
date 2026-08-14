"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Shared Socket.IO client (one connection per browser tab). */
export function getSocket(): Socket {
  if (!socket) {
    // In LAN/event mode: set NEXT_PUBLIC_SOCKET_URL=http://<server-ip>:3000
    // Leave unset for same-machine dev (relative URL).
    const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? undefined;
    socket = io(url as any, {
      transports: ["polling", "websocket"],
      reconnectionAttempts: 2,
      timeout: 5000,
      autoConnect: true,
    });
    socket.on("connect_error", () => {
      // Graceful fallback to periodic polling when socket server is unavailable
    });
  }
  return socket;
}

/**
 * Subscribe to one or more realtime events. The handler receives
 * (eventName, payload) so pages can refetch or patch state live.
 */
export function useSocketEvents(
  events: string[],
  handler: (event: string, payload: any) => void
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = getSocket();
    const listeners = events.map((event) => {
      const fn = (payload: any) => handlerRef.current(event, payload);
      s.on(event, fn);
      return { event, fn };
    });
    return () => {
      listeners.forEach(({ event, fn }) => s.off(event, fn));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(events)]);
}

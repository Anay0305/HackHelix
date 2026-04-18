import { env } from "@/lib/env";
import type { ClientMsg, ServerMsg } from "./types";

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

type Listener = (msg: ServerMsg) => void;
type StatusListener = (s: WsStatus) => void;

/**
 * Thin WebSocket wrapper with auto-reconnect and status tracking.
 * Sends typed ClientMsg; receives typed ServerMsg.
 */
export class SimulatorSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private status: WsStatus = "idle";
  private retryCount = 0;
  private retryTimer: number | null = null;
  private closedByClient = false;

  get currentStatus() {
    return this.status;
  }

  connect() {
    this.closedByClient = false;
    this.setStatus("connecting");
    try {
      this.ws = new WebSocket(env.wsUrl);
    } catch (e) {
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.retryCount = 0;
      this.setStatus("open");
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as ServerMsg;
        this.listeners.forEach((l) => l(msg));
      } catch (e) {
        console.warn("ws: invalid json", evt.data);
      }
    };

    this.ws.onerror = () => {
      this.setStatus("error");
    };

    this.ws.onclose = () => {
      this.setStatus("closed");
      if (!this.closedByClient) this.scheduleReconnect();
    };
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect() {
    this.closedByClient = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  onMessage(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onStatus(l: StatusListener) {
    this.statusListeners.add(l);
    l(this.status);
    return () => this.statusListeners.delete(l);
  }

  private setStatus(s: WsStatus) {
    this.status = s;
    this.statusListeners.forEach((l) => l(s));
  }

  private scheduleReconnect() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    const delay = Math.min(1000 * 2 ** this.retryCount, 10_000);
    this.retryCount += 1;
    this.retryTimer = window.setTimeout(() => this.connect(), delay);
  }
}

export interface ISimulatorSocket {
  currentStatus: WsStatus;
  connect(): void;
  disconnect(): void;
  send(msg: ClientMsg): void;
  onMessage(l: Listener): () => void;
  onStatus(l: StatusListener): () => void;
}

// singleton — one socket per session.
// Override via setSocketImpl() in main.tsx when VITE_USE_MSW=true
let _socket: ISimulatorSocket | null = null;

export function setSocketImpl(impl: ISimulatorSocket) {
  _socket = impl;
}

export function getSocket(): ISimulatorSocket {
  if (!_socket) _socket = new SimulatorSocket();
  return _socket;
}

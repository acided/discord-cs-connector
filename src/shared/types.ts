/** Server address extracted from a `connect HOST:PORT; password PASS` string. */
export interface ConnectInfo {
  host: string;
  port: number;
  password: string | null;
  steamUrl: string;
  /** The exact text that matched, kept for diagnostics. */
  raw: string;
}

export type LaunchMethod = 'netcon' | 'steam';

export interface LaunchOutcome {
  method: LaunchMethod;
  /** Why NetCon was not used; set only for the Steam fallback. */
  fallbackReason?: string;
}

export type LaunchTrigger = 'auto' | 'manual';

export type MonitorState = 'idle' | 'connecting' | 'listening' | 'reconnecting' | 'error';

/** Where a message snapshot came from. */
export type MessageSource = 'snapshot' | 'gateway';

export type NetConState = 'connecting' | 'connected' | 'disconnected';

export interface NetConStatus {
  state: NetConState;
  port: number;
  /** Connection attempts since the last successful connection. */
  attempt: number;
}

export interface AppInfo {
  version: string;
}

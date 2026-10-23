import type {
  ConnectInfo,
  LaunchOutcome,
  LaunchTrigger,
  MessageSource,
  MonitorState,
  NetConStatus,
} from './types';

/** Events pushed from the main process to the renderer. */
export type AppEvent =
  | { type: 'monitor-state'; state: MonitorState; detail?: string }
  | { type: 'connect-found'; connect: ConnectInfo; source: MessageSource }
  /** The watched message was edited, but it holds no new server. */
  | { type: 'message-updated'; result: 'no-connect' | 'unchanged' }
  | { type: 'launch'; outcome: LaunchOutcome; trigger: LaunchTrigger; connect: ConnectInfo }
  | { type: 'netcon-status'; status: NetConStatus }
  /** Recoverable problem worth showing; monitoring keeps running. */
  | { type: 'warning'; message: string };

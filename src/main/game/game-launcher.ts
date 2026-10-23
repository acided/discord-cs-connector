import type { ConnectInfo, LaunchOutcome } from '../../shared/types';

export interface ConsoleSink {
  readonly isConnected: boolean;
  send(command: string): boolean;
}

export type OpenExternal = (url: string) => Promise<void>;

/** Connects CS2 to a server: NetCon console first, `steam://` URL as fallback. */
export class GameLauncher {
  constructor(
    private readonly console: ConsoleSink,
    private readonly openExternal: OpenExternal,
  ) {}

  async launch(connect: ConnectInfo): Promise<LaunchOutcome> {
    if (this.console.send(buildConsoleCommand(connect))) return { method: 'netcon' };

    const fallbackReason = this.console.isConnected
      ? 'NetCon write failed'
      : 'CS2 NetCon is not connected';
    if (!connect.steamUrl.startsWith('steam://')) throw new Error(`Refusing to open ${connect.steamUrl}`);
    await this.openExternal(connect.steamUrl);
    return { method: 'steam', fallbackReason };
  }
}

export function buildConsoleCommand({ host, port, password }: ConnectInfo): string {
  const address = `${host}:${port}`;
  return password ? `connect ${address}; password ${password}` : `connect ${address}`;
}

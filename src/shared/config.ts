import { fail, ok, type Result } from './result';

export interface AppConfig {
  /** User token, or `Bot <token>` for a bot account. */
  token: string;
  channelId: string;
  /** Port passed to CS2 via `-netconport`. */
  netconPort: number;
}

export const DEFAULT_NETCON_PORT = 2121;

export const DEFAULT_CONFIG: AppConfig = {
  token: '',
  channelId: '',
  netconPort: DEFAULT_NETCON_PORT,
};

const SNOWFLAKE_RE = /^\d{17,20}$/;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE_RE.test(value);
}

export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function validateConfig(config: AppConfig): Result<AppConfig> {
  const normalized: AppConfig = {
    token: config.token.trim(),
    channelId: config.channelId.trim(),
    netconPort: config.netconPort,
  };
  if (!normalized.token) return fail('Discord token is required');
  if (!isSnowflake(normalized.channelId)) return fail('Channel ID must be a 17–20 digit number');
  if (!isValidPort(normalized.netconPort)) return fail('NetCon port must be between 1 and 65535');
  return ok(normalized);
}

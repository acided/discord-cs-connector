import { errorMessage } from '../../shared/result';
import type { DiscordMessage } from './types';

const API_BASE = 'https://discord.com/api/v9';
const REQUEST_TIMEOUT_MS = 10_000;

export class DiscordApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DiscordApiError';
  }
}

export type FetchMessage = (token: string, channelId: string, messageId: string) => Promise<DiscordMessage>;

/**
 * Fetches a single message. Uses the channel history endpoint because
 * `GET /messages/{id}` is unavailable to user accounts.
 */
export const fetchMessage: FetchMessage = async (token, channelId, messageId) => {
  const url = `${API_BASE}/channels/${channelId}/messages?around=${messageId}&limit=1`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new DiscordApiError(`Network error: ${errorMessage(err)}`);
  }

  if (!response.ok) {
    throw new DiscordApiError(describeHttpStatus(response.status), response.status);
  }

  const body: unknown = await response.json();
  // `around` returns the nearest message when the ID is absent, so require an exact match.
  const message = Array.isArray(body)
    ? (body as DiscordMessage[]).find((m) => m?.id === messageId)
    : undefined;
  if (!message) throw new DiscordApiError('Message not found in this channel', 404);
  return message;
};

function describeHttpStatus(status: number): string {
  switch (status) {
    case 401: return 'Invalid Discord token (HTTP 401)';
    case 403: return 'No access to this channel (HTTP 403)';
    case 404: return 'Channel not found (HTTP 404)';
    case 429: return 'Rate limited by Discord (HTTP 429)';
    default: return `Discord API error (HTTP ${status})`;
  }
}

/** Subset of the Discord API message object this app reads. */
export interface DiscordMessage {
  id: string;
  channel_id: string;
  content?: string;
  embeds?: DiscordEmbed[];
  timestamp?: string;
  edited_timestamp?: string | null;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  author?: { name?: string };
  footer?: { text?: string };
  fields?: { name?: string; value?: string }[];
}

export const GatewayOpcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  Resume: 6,
  Reconnect: 7,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
} as const;

export interface GatewayPayload {
  op: number;
  d: unknown;
  s: number | null;
  t: string | null;
}

export interface ReadyEvent {
  session_id: string;
  resume_gateway_url: string;
}

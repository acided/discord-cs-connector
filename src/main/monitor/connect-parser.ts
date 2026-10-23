import type { ConnectInfo } from '../../shared/types';
import type { DiscordMessage } from '../discord/types';

// The password stops at a backtick so a closing code fence (```) never sticks to it.
const CONNECT_RE = /connect\s+([\w.-]+):(\d{1,5})(?:\s*;\s*password\s+([^\s`]+))?/i;

const ZERO_WIDTH_RE = /[​-‍⁠﻿]/g;
// Markdown wrappers Discord renders around inline text: **bold**, __underline__, ||spoiler||, ~~strike~~, *italic*, quotes.
const EDGE_MARKUP_RE = /^(?:\*\*|__|\|\||~~|[*"'])+|(?:\*\*|__|\|\||~~|[*"'])+$/g;

/** Finds the first `connect HOST:PORT[; password PASS]` in the message text or its embeds. */
export function parseConnect(message: Pick<DiscordMessage, 'content' | 'embeds'>): ConnectInfo | null {
  for (const text of collectTexts(message)) {
    const connect = parseConnectText(text);
    if (connect) return connect;
  }
  return null;
}

export function parseConnectText(text: string): ConnectInfo | null {
  const match = CONNECT_RE.exec(text.replace(ZERO_WIDTH_RE, ''));
  if (!match) return null;

  const [raw, host, portText, rawPassword] = match;
  const port = Number(portText);
  if (port < 1 || port > 65535) return null;

  const password = rawPassword ? rawPassword.replace(EDGE_MARKUP_RE, '') || null : null;
  const address = `${host}:${port}`;
  return {
    host,
    port,
    password,
    steamUrl: password ? `steam://connect/${address}/${password}` : `steam://connect/${address}`,
    raw,
  };
}

export function isSameServer(a: ConnectInfo, b: ConnectInfo): boolean {
  return a.host === b.host && a.port === b.port && a.password === b.password;
}

function collectTexts({ content, embeds }: Pick<DiscordMessage, 'content' | 'embeds'>): string[] {
  const texts = [content ?? ''];
  for (const embed of embeds ?? []) {
    texts.push(embed.description ?? '', embed.title ?? '', embed.author?.name ?? '', embed.footer?.text ?? '');
    for (const field of embed.fields ?? []) texts.push(field.name ?? '', field.value ?? '');
  }
  return texts.filter(Boolean);
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} not found`);
  return element as T;
}

export type StatusKind = 'idle' | 'pending' | 'ok' | 'error';

export function setStatusDot(dot: HTMLElement, kind: StatusKind): void {
  dot.className = `status-dot ${kind}`;
}

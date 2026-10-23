export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

export function ok(): Result<void>;
export function ok<T>(value: T): Result<T>;
export function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): Result<T> {
  return { ok: false, error };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

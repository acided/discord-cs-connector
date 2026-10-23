import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, isValidPort, type AppConfig } from '../../shared/config';
import { errorMessage } from '../../shared/result';
import type { SecretCodec } from './secret-codec';

/** On-disk shape. `token` is the legacy plaintext field, migrated to `tokenEncrypted` on load. */
interface StoredConfig {
  token?: string;
  tokenEncrypted?: string;
  channelId?: string;
  netconPort?: number;
}

export class ConfigStore {
  private config: AppConfig = { ...DEFAULT_CONFIG };

  constructor(
    private readonly filePath: string,
    private readonly codec: SecretCodec,
  ) {}

  get current(): AppConfig {
    return { ...this.config };
  }

  get directory(): string {
    return path.dirname(this.filePath);
  }

  load(): AppConfig {
    const stored = this.readFile();
    if (!stored) return this.current;

    const token = stored.tokenEncrypted
      ? (this.codec.decrypt(stored.tokenEncrypted) ?? '')
      : (stored.token ?? '');
    const port = stored.netconPort;
    this.config = {
      token,
      channelId: stored.channelId ?? DEFAULT_CONFIG.channelId,
      netconPort: typeof port === 'number' && isValidPort(port) ? port : DEFAULT_CONFIG.netconPort,
    };

    if (stored.token && !stored.tokenEncrypted) this.tryMigratePlaintextToken();
    return this.current;
  }

  /** Persists the config; throws on I/O errors. */
  save(config: AppConfig): void {
    const encrypted = config.token ? this.codec.encrypt(config.token) : null;
    const stored: StoredConfig = {
      ...(encrypted ? { tokenEncrypted: encrypted } : { token: config.token }),
      channelId: config.channelId,
      netconPort: config.netconPort,
    };

    fs.mkdirSync(this.directory, { recursive: true });
    // Write-then-rename so a crash never leaves a half-written file.
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(stored, null, 2));
    fs.renameSync(tmpPath, this.filePath);
    this.config = { ...config };
  }

  private readFile(): StoredConfig | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as StoredConfig;
    } catch (err) {
      console.error('[config] failed to read', this.filePath, errorMessage(err));
      return null;
    }
  }

  private tryMigratePlaintextToken(): void {
    if (!this.codec.encrypt('probe')) return;
    try {
      this.save(this.config);
    } catch (err) {
      console.error('[config] token migration failed', errorMessage(err));
    }
  }
}

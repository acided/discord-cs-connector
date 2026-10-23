import { safeStorage } from 'electron';

/** Encrypts secrets at rest; `null` means encryption is unavailable or the data is unreadable. */
export interface SecretCodec {
  encrypt(plain: string): string | null;
  decrypt(encoded: string): string | null;
}

/** OS-level encryption (DPAPI on Windows). Usable only after `app.whenReady()`. */
export const safeStorageCodec: SecretCodec = {
  encrypt(plain) {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.encryptString(plain).toString('base64');
  },
  decrypt(encoded) {
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    } catch {
      return null;
    }
  },
};

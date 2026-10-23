import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ConfigStore } from '../src/main/config/config-store';
import type { SecretCodec } from '../src/main/config/secret-codec';

const reverseCodec: SecretCodec = {
  encrypt: (plain) => `enc:${[...plain].reverse().join('')}`,
  decrypt: (encoded) => (encoded.startsWith('enc:') ? [...encoded.slice(4)].reverse().join('') : null),
};

function tempConfigPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs2ac-')), 'config.json');
}

describe('ConfigStore', () => {
  it('returns defaults when no file exists', () => {
    const store = new ConfigStore(tempConfigPath(), reverseCodec);
    assert.deepEqual(store.load(), { token: '', channelId: '', netconPort: 2121 });
  });

  it('stores the token encrypted and reads it back', () => {
    const file = tempConfigPath();
    new ConfigStore(file, reverseCodec).save({ token: 'abc', channelId: '1', netconPort: 3000 });

    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(raw.token, undefined);
    assert.equal(raw.tokenEncrypted, 'enc:cba');
    assert.deepEqual(new ConfigStore(file, reverseCodec).load(), { token: 'abc', channelId: '1', netconPort: 3000 });
  });

  it('migrates a legacy plaintext token', () => {
    const file = tempConfigPath();
    fs.writeFileSync(file, JSON.stringify({ token: 'legacy', channelId: '1', pollInterval: 5000 }));

    const config = new ConfigStore(file, reverseCodec).load();
    assert.equal(config.token, 'legacy');
    assert.equal(config.netconPort, 2121);

    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(raw.token, undefined);
    assert.equal(raw.tokenEncrypted, 'enc:ycagel');
  });

  it('falls back to plaintext when encryption is unavailable', () => {
    const file = tempConfigPath();
    const noCodec: SecretCodec = { encrypt: () => null, decrypt: () => null };
    new ConfigStore(file, noCodec).save({ token: 'abc', channelId: '1', netconPort: 2121 });
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token, 'abc');
  });
});

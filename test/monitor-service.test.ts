import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AppEvent } from '../src/shared/events';
import type { ConnectInfo, LaunchOutcome } from '../src/shared/types';
import type { GatewayListener } from '../src/main/discord/gateway-client';
import type { DiscordMessage } from '../src/main/discord/types';
import { MonitorService } from '../src/main/monitor/monitor-service';

const TARGET = { token: 't', channelId: '111111111111111111', messageId: '222222222222222222' };

function message(content: string, editedAt: string): DiscordMessage {
  return { id: TARGET.messageId, channel_id: TARGET.channelId, content, edited_timestamp: editedAt };
}

function setup(snapshots: DiscordMessage[]) {
  const events: AppEvent[] = [];
  const launches: ConnectInfo[] = [];
  let listener: GatewayListener | null = null;
  let gatewayStopped = false;

  const service = new MonitorService({
    fetchMessage: async () => {
      const next = snapshots.shift();
      if (!next) throw new Error('no snapshot');
      return next;
    },
    createGateway: (_token, l) => {
      listener = l;
      return { start: () => {}, stop: () => { gatewayStopped = true; } };
    },
    launcher: {
      launch: async (connect): Promise<LaunchOutcome> => {
        launches.push(connect);
        return { method: 'netcon' };
      },
    },
    emit: (event) => events.push(event),
  });

  return {
    service,
    events,
    launches,
    gateway: () => listener!,
    isGatewayStopped: () => gatewayStopped,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('MonitorService', () => {
  it('launches from the snapshot and still starts the gateway', async () => {
    const t = setup([message('connect 1.2.3.4:27015; password a', '2026-01-01T00:00:00Z')]);
    const result = await t.service.start(TARGET);
    await flush();

    assert.ok(result.ok);
    assert.equal(t.launches.length, 1);
    assert.ok(t.gateway(), 'gateway must be created even when the snapshot already has a server');
  });

  it('launches again only when the server changes', async () => {
    const t = setup([message('waiting', '2026-01-01T00:00:00Z')]);
    await t.service.start(TARGET);

    t.gateway().onMessageUpdate(message('connect 1.2.3.4:27015; password a', '2026-01-01T00:01:00Z'));
    t.gateway().onMessageUpdate(message('connect 1.2.3.4:27015; password a', '2026-01-01T00:02:00Z'));
    t.gateway().onMessageUpdate(message('connect 1.2.3.4:27015; password b', '2026-01-01T00:03:00Z'));
    await flush();

    assert.deepEqual(t.launches.map((c) => c.password), ['a', 'b']);
  });

  it('ignores updates for other messages and stale versions', async () => {
    const t = setup([message('waiting', '2026-01-01T00:05:00Z')]);
    await t.service.start(TARGET);

    t.gateway().onMessageUpdate({ ...message('connect 1.2.3.4:27015; password x', '2026-01-01T00:06:00Z'), id: '333333333333333333' });
    t.gateway().onMessageUpdate(message('connect 1.2.3.4:27015; password old', '2026-01-01T00:04:00Z'));
    await flush();

    assert.equal(t.launches.length, 0);
  });

  it('resyncs on gateway connect to catch edits missed in between', async () => {
    const t = setup([
      message('waiting', '2026-01-01T00:00:00Z'),
      message('connect 1.2.3.4:27015; password late', '2026-01-01T00:01:00Z'),
    ]);
    await t.service.start(TARGET);
    t.gateway().onStateChange('connected');
    await flush();

    assert.deepEqual(t.launches.map((c) => c.password), ['late']);
  });

  it('reports snapshot errors and does not start the gateway', async () => {
    const t = setup([]);
    const result = await t.service.start(TARGET);

    assert.ok(!result.ok);
    assert.ok(t.events.some((e) => e.type === 'monitor-state' && e.state === 'error'));
    assert.equal(t.service.isRunning, false);
  });

  it('stops on a fatal gateway error', async () => {
    const t = setup([message('waiting', '2026-01-01T00:00:00Z')]);
    await t.service.start(TARGET);
    t.gateway().onFatalError('bad token');

    assert.equal(t.service.isRunning, false);
    assert.ok(t.isGatewayStopped());
    assert.deepEqual(t.events.at(-1), { type: 'monitor-state', state: 'error', detail: 'bad token' });
  });
});

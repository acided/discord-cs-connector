import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSameServer, parseConnect, parseConnectText } from '../src/main/monitor/connect-parser';

describe('parseConnectText', () => {
  it('parses host, port and password', () => {
    const connect = parseConnectText('connect 1.2.3.4:27015; password secret');
    assert.deepEqual(connect, {
      host: '1.2.3.4',
      port: 27015,
      password: 'secret',
      steamUrl: 'steam://connect/1.2.3.4:27015/secret',
      raw: 'connect 1.2.3.4:27015; password secret',
    });
  });

  it('accepts hostnames and loose whitespace', () => {
    const connect = parseConnectText('CONNECT  eu-1.example.com:27015 ;password   pw');
    assert.equal(connect?.host, 'eu-1.example.com');
    assert.equal(connect?.password, 'pw');
  });

  it('does not let a closing code fence stick to the password', () => {
    assert.equal(parseConnectText('```connect 1.2.3.4:27015; password abc```')?.password, 'abc');
    assert.equal(parseConnectText('`connect 1.2.3.4:27015; password abc`')?.password, 'abc');
  });

  it('strips markdown wrappers around the password', () => {
    for (const text of ['**abc**', '__abc__', '||abc||', '~~abc~~', '*abc*', '"abc"']) {
      assert.equal(parseConnectText(`connect 1.2.3.4:27015; password ${text}`)?.password, 'abc', text);
    }
    assert.equal(parseConnectText('**connect 1.2.3.4:27015; password abc**')?.password, 'abc');
  });

  it('keeps underscores that belong to the password', () => {
    assert.equal(parseConnectText('connect 1.2.3.4:27015; password my_pass_')?.password, 'my_pass_');
  });

  it('ignores zero-width characters', () => {
    assert.equal(parseConnectText('connect 1.2.3.4:27015; password ab​c​')?.password, 'abc');
  });

  it('supports servers without a password', () => {
    const connect = parseConnectText('connect 1.2.3.4:27015');
    assert.equal(connect?.password, null);
    assert.equal(connect?.steamUrl, 'steam://connect/1.2.3.4:27015');
  });

  it('rejects text without a connect string or with an invalid port', () => {
    assert.equal(parseConnectText('server is starting soon'), null);
    assert.equal(parseConnectText('connect 1.2.3.4:99999; password x'), null);
  });
});

describe('parseConnect', () => {
  it('finds the connect string inside embed fields', () => {
    const connect = parseConnect({
      content: 'Match ready',
      embeds: [{ title: 'Server', fields: [{ name: 'Connect', value: '`connect 5.6.7.8:27016; password q`' }] }],
    });
    assert.equal(connect?.host, '5.6.7.8');
    assert.equal(connect?.password, 'q');
  });

  it('returns null for a message without one', () => {
    assert.equal(parseConnect({ content: 'hello', embeds: [] }), null);
    assert.equal(parseConnect({}), null);
  });
});

describe('isSameServer', () => {
  it('compares host, port and password', () => {
    const a = parseConnectText('connect 1.2.3.4:27015; password a')!;
    assert.ok(isSameServer(a, parseConnectText('**connect 1.2.3.4:27015; password a**')!));
    assert.ok(!isSameServer(a, parseConnectText('connect 1.2.3.4:27015; password b')!));
  });
});

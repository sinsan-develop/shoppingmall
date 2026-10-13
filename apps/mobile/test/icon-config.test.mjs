import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Expo consumes the approved square artwork for default and Android adaptive icons', async () => {
  const root = new URL('../', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('node_modules/expo/bin/cli', root)),
    'config', '--type', 'public', '--json'], { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.icon, './assets/icon.png');
  assert.equal(config.android.adaptiveIcon.foregroundImage, './assets/icon.png');
  assert.equal(config.android.adaptiveIcon.backgroundColor, '#faf7ef');
  const artwork = await readFile(new URL(config.icon, root));
  assert.deepEqual([...artwork.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(artwork.readUInt32BE(16), artwork.readUInt32BE(20));
  assert.ok(artwork.readUInt32BE(16) >= 1024);
  const approved = await readFile(new URL('../../docs/design/assets/app-icon-candidate-20261014.png', root));
  const sha = input => createHash('sha256').update(input).digest('hex');
  assert.equal(sha(artwork), sha(approved), '승인한 그림을 바꾸지 않아야 한다');
});

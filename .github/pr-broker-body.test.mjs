import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./pr-broker-body.mjs', import.meta.url));
const completeBody = `## 목적\nFlat v2 시안 통합\n\n## 변경 요약\n시안과 PR 자동화 수정\n\n## 영향\n정적 화면만\n\n## 검증\nnode --test 44개 통과\n\n## 미검증\n인쇄·모바일 실제 브라우저\n\n## 롤백\n이전 main으로 되돌림\n`;

function validate(body) {
  const directory = mkdtempSync(join(tmpdir(), 'owool-pr-body-'));
  try {
    const path = join(directory, 'body.md');
    writeFileSync(path, body);
    return spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('complete PR explanation is accepted', () => {
  const result = validate(completeBody);
  assert.equal(result.status, 0, result.stderr);
});

test('missing required section blocks PR creation', () => {
  const result = validate(completeBody.replace('## 미검증\n인쇄·모바일 실제 브라우저\n\n', ''));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /미검증/);
});

test('empty required section blocks PR creation', () => {
  const result = validate(completeBody.replace('## 영향\n정적 화면만', '## 영향\n'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /영향/);
});

test('duplicate required section blocks ambiguous PR body', () => {
  const result = validate(`${completeBody}\n## 목적\n다른 목적\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /목적/);
});

test('placeholder cannot stand in for verification evidence', () => {
  const result = validate(completeBody.replace('node --test 44개 통과', 'TODO'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /검증/);
});

test('required explanation hidden in an HTML comment is rejected', () => {
  const result = validate(`<!--\n${completeBody}\n-->\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /목적/);
});

test('required explanation inside a fenced code block is rejected', () => {
  const result = validate(`\`\`\`markdown\n${completeBody}\n\`\`\`\n`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /목적/);
});

test('bulleted placeholder cannot stand in for verification evidence', () => {
  const result = validate(completeBody.replace('node --test 44개 통과', '- TODO'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /검증/);
});

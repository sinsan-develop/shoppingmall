const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, 'owool-static-v1.css'), 'utf8');

function fontSize(selector, mobile = false) {
  const section = (mobile ? css.slice(css.indexOf('@media(max-width:600px)')) : css.split('@media(max-width:900px)')[0])
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...section.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, names]) => names.split(',').some((name) => name.trim() === selector));
  const declarations = rules.at(-1)?.[2];
  const size = declarations?.match(/(?:^|;)\s*font-size\s*:\s*([^;}]*)/);
  const shorthand = declarations?.match(/(?:^|;)\s*font\s*:\s*[^;]*?\s(\d+(?:\.\d+)?px)\//);
  return size?.[1].trim() ?? shorthand?.[1];
}

test('desktop typography follows the owoolmall reference scale', () => {
  assert.equal(fontSize('body'), '12px');
  assert.equal(fontSize('h1'), '18px');
  assert.equal(fontSize('h2'), '18px');
  assert.equal(fontSize('.product h3'), '13px');
  assert.equal(fontSize('.price'), '14px');
});

test('mobile keeps compact body text and readable form inputs', () => {
  assert.equal(fontSize('body', true), '12px');
  assert.equal(fontSize('input', true), '16px');
});

test('all four static screens use the same typography stylesheet', () => {
  for (const name of ['home-v1.html', 'checkout-v1.html', 'seller-v1.html', 'admin-v1.html']) {
    const html = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.match(html, /owool-static-v1\.css/);
  }
});

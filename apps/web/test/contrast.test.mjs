import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');

function declaration(selector, property) {
  const start = css.indexOf(`${selector}{`);
  assert.notEqual(start, -1, `missing rule ${selector}`);
  const body = css.slice(start + selector.length + 1, css.indexOf('}', start));
  const value = body.match(new RegExp(`(?:^|;)${property}:([^;]+)`))?.[1];
  assert.ok(value, `missing ${property} on ${selector}`);
  return value;
}

function hex(selector, property) {
  const value = declaration(selector, property).match(/#[0-9a-f]{3,6}\b/i)?.[0];
  assert.ok(value, `missing color on ${selector}.${property}`);
  const digits = value.slice(1);
  return digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
}

function luminance(value) {
  const components = value.match(/../g).map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
}

function ratio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const cases = [
  ['primary button text', ['.primary-button', 'color'], ['.primary-button', 'background'], 4.5],
  ['small hero eyebrow', ['.eyebrow', 'color'], ['.hero', 'background'], 4.5],
  ['search placeholder', ['.search-preview input::placeholder', 'color'], ['.site-header', 'background'], 4.5],
  ['search outline', ['.search-preview', 'border'], ['.site-header', 'background'], 3],
  ['input outline', ['.account-form input,.account-form select', 'border'],
    ['.account-form input,.account-form select', 'background'], 3],
  ['search filter outline', ['.search-filters input,.search-filters select', 'border'],
    ['.search-filters input,.search-filters select', 'background'], 3],
  ['textarea outline', ['.account-form textarea', 'border'], ['.account-form textarea', 'background'], 3],
  ['secondary button outline', ['.secondary-button', 'border'], ['.secondary-button', 'background'], 3],
];

for (const [name, foreground, background, minimum] of cases) {
  test(`${name} contrast meets ${minimum}:1`, () => {
    const actual = ratio(hex(...foreground), hex(...background));
    assert.ok(actual >= minimum, `${name}: ${actual.toFixed(2)}:1 < ${minimum}:1`);
  });
}

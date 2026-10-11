import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Check only the planned route inventory, never infer UI/API/DB verification. */
export function auditRoleMatrix(matrixText, appRoot) {
  const rows = [...matrixText.matchAll(/^\|\s*(\d+)\s*\|\s*(구매자|판매자|관리자)\s*\|\s*`([^`]+)`\s*\|/gm)];
  if (rows.length !== 18) throw new Error(`Expected 18 role routes, found ${rows.length}`);
  const routes = [];
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    const number = Number(row[1]);
    const role = row[2];
    const route = row[3];
    const expectedRole = index < 5 ? '구매자' : index < 10 ? '판매자' : '관리자';
    if (number !== index + 1 || role !== expectedRole)
      throw new Error(`Invalid role matrix row ${index + 1}`);
    if (!/^\/[a-zA-Z0-9/\[\]-]*$/.test(route) || route.includes('//'))
      throw new Error(`Invalid role route ${number}`);
    if (seen.has(route)) throw new Error(`Duplicate role route ${number}`);
    seen.add(route);
    const page = join(appRoot, route === '/' ? 'page.tsx' : route.slice(1),
      ...(route === '/' ? [] : ['page.tsx']));
    if (!existsSync(page)) throw new Error(`Missing Next page for role route ${number}`);
    routes.push(route);
  }
  return { routes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../', import.meta.url);
  const matrixText = readFileSync(new URL('docs/evidence/three-role-menu-matrix.md', root), 'utf8');
  const result = auditRoleMatrix(matrixText, fileURLToPath(new URL('apps/web/app/', root)));
  process.stdout.write(`Role route inventory: ${result.routes.length}/18; functional/browser evidence is separate\n`);
}

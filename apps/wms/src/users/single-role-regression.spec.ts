import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('single-role migration regression', () => {
  it('keeps the WMS happy path on the current scalar-role users API', () => {
    const happyPath = source('apps/wms/test/happy-path.e2e-spec.ts');

    expect(happyPath).toContain(".post('/api/wms/users')");
    expect(happyPath).toContain(
      ".send({ username, password: 'E2ePass123!', role })",
    );
    expect(happyPath).not.toContain(".post('/api/wms/auth/users')");
    expect(happyPath).not.toContain('roles: [role]');
  });

  it('does not let Ecommerce seed scripts recreate the legacy roles field', () => {
    for (const path of [
      'scripts/seed-ecom-admin.js',
      'scripts/seed-ecom-users.js',
    ]) {
      expect(source(path)).not.toMatch(/\broles\s*:/);
    }
  });

  it('keeps supplier blacklist authorization tied to WmsRole', () => {
    const service = source('apps/wms/src/supplier/supplier.service.ts');
    const controller = source('apps/wms/src/supplier/supplier.controller.ts');

    expect(service).toContain('role: WmsRole');
    expect(service).toContain('role !== WmsRole.ADMIN');
    expect(service).not.toContain("role !== 'ADMIN'");
    expect(controller).toContain("@CurrentUser('role') role: WmsRole");
  });
});

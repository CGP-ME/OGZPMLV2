'use strict';

const fs = require('fs');
const path = require('path');

const PAGES = [
  'public/index.html',
  'public/features.html',
  'public/pricing.html',
];

const DS_ROOT = 'public/_ds/ogzprime-design-system-802711b8-5fec-4a65-9ea6-0c4f5160d99c';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function localRefs(html) {
  return Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
    .map(match => match[1])
    .filter(ref => {
      if (!ref || ref === '/') return false;
      if (ref.endsWith('/')) return false;
      if (ref.startsWith('#')) return false;
      if (ref.startsWith('http')) return false;
      if (ref.startsWith('mailto:') || ref.startsWith('tel:')) return false;
      if (ref.startsWith('data:')) return false;
      return true;
    })
    .map(ref => ref.split('#')[0].split('?')[0])
    .filter(Boolean);
}

describe('marketing page static contract', () => {
  test('pages keep basic HTML and design component contracts', () => {
    const manifest = JSON.parse(read(path.join(DS_ROOT, '_ds_manifest.json')));
    const components = new Set(
      manifest.components.map(component => `OGZPrimeDesignSystem_802711.${component.name}`)
    );

    for (const page of PAGES) {
      const html = read(page);
      expect(html).toMatch(/<html\s+lang="en"/);
      expect(html).toContain('<x-dc>');
      expect(html).toContain('</x-dc>');

      for (const match of html.matchAll(/component-from-global-scope="([^"]+)"/g)) {
        expect(components.has(match[1])).toBe(true);
      }

      for (const ref of localRefs(html)) {
        const target = path.resolve(path.dirname(page), ref);
        expect(fs.existsSync(target)).toBe(true);
      }
    }
  });

  test('design system runtime files parse', () => {
    for (const filePath of [
      'public/support.js',
      'public/ds-base.js',
      path.join(DS_ROOT, '_ds_bundle.js'),
    ]) {
      expect(() => new Function(read(filePath))).not.toThrow();
    }
  });

  test('public checkout and lead capture use publishable/client endpoints only', () => {
    const index = read('public/index.html');
    const pricing = read('public/pricing.html');

    expect(index).toContain('https://hook.us2.make.com/');
    expect(pricing).toContain('pk_live_');
    expect(`${index}\n${pricing}`).not.toMatch(/sk_live_|sk_test_|whsec_/);
  });
});

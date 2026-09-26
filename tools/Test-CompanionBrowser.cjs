#!/usr/bin/env node
'use strict';
// Production Lit/Fluent browser checks with an in-memory Tauri adapter.
// No native IPC, live files, installation or SteamVR processes are touched.
// Run after build:ui. Install Playwright separately or supply it via NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const repo = path.resolve(__dirname, '..');
const dist = path.join(repo, 'GalaxyXRDriverGUI/dist/fluent');
const out = path.join(repo, 'build/companion-ui-validation');
fs.mkdirSync(out, { recursive: true });

function fixture() {
  const normalize = value => {
    const parts = String(value).replaceAll('\\', '/').split('/');
    const result = [];
    for (const part of parts) { if (part === '..') result.pop(); else if (part && part !== '.') result.push(part); }
    return '/' + result.join('/');
  };
  const data = '/roaming/GalaxyXR/CustomHeadset';
  const initial = {
    [data + '/gui-settings.json']: JSON.stringify({ colorScheme: 'light', advanceMode: true }),
    [data + '/settings.json']: JSON.stringify({ galaxyXr: { nativeIdentity: true }, streamFrame: { enable: true } }),
    [data + '/info.json']: JSON.stringify({ driverVersion: '1.2.13' }),
    [data + '/Distortion/kept.json']: '{"name":"kept-profile"}',
    '/local/openvr/openvrpaths.vrpath': JSON.stringify({ runtime: ['/SteamVR'], config: ['/SteamConfig'], external_drivers: ['/managed/GalaxyXRNative'] }),
    '/SteamConfig/steamvr.vrsettings': JSON.stringify({ driver_GalaxyXRNative: { enable: true } }),
    '/SteamVR/bin/win64/vrserver.exe': '',
    '/SteamVR/bin/win64/vrpathreg.exe': '',
    '/managed/GalaxyXRNative/driver.vrdrivermanifest': '{"name":"GalaxyXRNative","version":"1.2.13"}',
    '/managed/GalaxyXRNative/bin/win64/driver_GalaxyXRNative.dll': '',
  };
  const files = JSON.parse(sessionStorage.getItem('qa-files') || 'null') || initial;
  const calls = [];
  const persist = () => sessionStorage.setItem('qa-files', JSON.stringify(files));
  const put = (p, value) => { files[normalize(p)] = value; persist(); };
  const github = { tagName: '1.2.13', releaseUrl: 'https://github.com/AngelDark92/GalaxyXR-Driver/releases/tag/v1.2.13',
    status: 200, hold: false, pending: [], requests: [] };
  window.__qa = { files, calls, data, github, openerError: '', releaseGithub() {
    github.hold = false;
    for (const release of github.pending.splice(0)) release();
  } };
  const oldFetch = window.fetch;
  window.fetch = (url, ...args) => {
    if (!String(url).includes('api.github.com')) return oldFetch(url, ...args);
    github.requests.push(String(url));
    const response = { tag_name: github.tagName, html_url: github.releaseUrl }, status = github.status;
    const reply = () => new Response(JSON.stringify(response), { status });
    return github.hold ? new Promise(resolve => github.pending.push(() => resolve(reply()))) : Promise.resolve(reply());
  };
  let callback = 0;
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => ++callback,
    unregisterCallback() {},
    async invoke(command, args = {}, options = {}) {
      calls.push({ command, args });
      const p = normalize(args.path || '');
      if (command === 'plugin:path|resolve_directory') return args.directory === 14 ? '/roaming/app' : '/local';
      if (command === 'plugin:path|join') return normalize(args.paths.join('/'));
      if (command === 'plugin:path|normalize') return p;
      if (command === 'plugin:path|basename') return p.split('/').at(-1);
      if (command === 'plugin:path|dirname') return p.slice(0, p.lastIndexOf('/'));
      if (command === 'plugin:app|version') return '1.2.13';
      if (command === 'plugin:opener|open_url') {
        if (window.__qa.openerError) throw Error(window.__qa.openerError);
        return;
      }
      if (command === 'plugin:fs|exists') return Object.hasOwn(files, p) || Object.keys(files).some(key => key.startsWith(p + '/'));
      if (command === 'plugin:fs|read_text_file') {
        if (!Object.hasOwn(files, p)) throw Error('Missing fixture: ' + p);
        return Array.from(new TextEncoder().encode(files[p]));
      }
      if (command === 'plugin:fs|read_dir') return Object.keys(files).filter(key => key.startsWith(p + '/') && !key.slice(p.length + 1).includes('/'))
        .map(key => ({ name: key.split('/').at(-1), isFile: true, isDirectory: false, isSymlink: false }));
      if (command === 'plugin:fs|write_text_file') {
        const target = options.headers?.path ? decodeURIComponent(options.headers.path) : p;
        const value = args.contents ?? args.data ?? args;
        put(target, typeof value === 'string' ? value : new TextDecoder().decode(new Uint8Array(value)));
        return;
      }
      if (command === 'plugin:fs|copy_file') { put(args.to, files[normalize(args.from)]); return; }
      if (command === 'plugin:fs|remove') { delete files[p]; persist(); return; }
      if (command === 'plugin:fs|mkdir') return;
      if (command === 'plugin:fs|watch') return 1;
      if (command === 'plugin:fs|unwatch' || command === 'plugin:resources|close') return;
      if (command === 'get_galaxyxr_runtime_status') return {
        state: 'not-running', detail: 'SteamVR is closed.', steamvrRunning: false, driverInitialized: false,
        headsetConnected: false, driverVersion: null, serverPid: null, checkedAt: Date.now(),
      };
      if (command === 'clean_galaxyxr_settings') {
        put(data + '/settings.json', '{"galaxyXr":{"nativeIdentity":true}}');
        put(data + '/gui-settings.json', '{}');
        delete files[data + '/info.json']; persist();
        return { outcome: 'complete', preservedPaths: [data + '/Distortion'], unresolvedItems: [],
          backupPath: '/roaming/GalaxyXR/Backups/reset-fixture', resetFiles: [data + '/settings.json', data + '/gui-settings.json'],
          restoredSettings: 2, removedIdentityKeys: [], removedIdentitySections: [], steamvrCleaned: true, warnings: [] };
      }
      if (command === 'uninstall_galaxyxr_driver') {
        for (const key of Object.keys(files)) {
          if (key.startsWith('/managed/') || (key.startsWith(data + '/') && !key.startsWith(data + '/Distortion/'))) delete files[key];
        }
        put('/local/openvr/openvrpaths.vrpath', JSON.stringify({ runtime: ['/SteamVR'], config: ['/SteamConfig'], external_drivers: [] }));
        put('/SteamConfig/steamvr.vrsettings', '{}');
        return { outcome: 'complete', removedPaths: ['/managed/GalaxyXRNative'], restoredSettings: 2, legacyReset: false,
          warnings: [], unresolvedItems: [], preservedPaths: [data + '/Distortion'] };
      }
      throw Error('Unexpected fixture IPC: ' + command);
    },
  };
}

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  const results = [];
  try {
    browser = await chromium.launch({ channel: process.env.COMPANION_BROWSER || 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(fixture);
    const externalRequests = [];
    await context.route(/^https?:\/\//, route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      externalRequests.push(route.request().url());
      return route.abort();
    });
    page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const base = `http://127.0.0.1:${server.address().port}/en-US/index.html`;
    await page.goto(base + '#/setup');
    await page.waitForFunction(() => window.appContext?.sds.driverState() === 'installed');
    await page.locator('app-setup-page').waitFor();
    assert.deepEqual(await page.evaluate(() => ['button','badge','message-bar','dialog','dialog-body','accordion','accordion-item','spinner']
      .filter(name => !customElements.get('fluent-' + name))), []);
    results.push('All Fluent elements registered in production bundle');
    const mutationCommands = ['clean_galaxyxr_settings','uninstall_galaxyxr_driver','plugin:fs|mkdir','plugin:fs|write_text_file','plugin:fs|copy_file','plugin:fs|remove'];
    const mutations = () => page.evaluate(list => window.__qa.calls.filter(call => list.includes(call.command)).length, mutationCommands);
    const openerUrls = () => page.evaluate(() => window.__qa.calls.filter(call => call.command === 'plugin:opener|open_url').map(call => call.args.url));
    const focusLinkWithKeyboard = async link => {
      assert.equal(await link.evaluate(element => element.tagName), 'A');
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      assert.equal(await link.evaluate(element => element.matches(':focus-visible')), true);
      assert.equal(await link.evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      assert.ok(await link.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth) >= 2));
    };
    const openRoute = async route => {
      await page.evaluate(route => { location.hash = '/' + route; }, route);
      await page.locator(`app-${route}-page`).getByRole('heading', { level: 1 }).waitFor();
    };
    for (const theme of ['light','dark']) {
      await page.evaluate(async theme => {
        const app = window.appContext.appSetting;
        await app.save({ ...app.values(), colorScheme: theme });
      }, theme);
      for (const route of ['driver-settings','stream-frame','distortion-profile','app-settings','setup','about']) {
        await openRoute(route);
        await page.screenshot({ path: path.join(out, `${route}-${theme}-1100.png`), animations: 'disabled' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await page.setViewportSize({ width: 1100, height: 1200 });
      await page.screenshot({ path: path.join(out, `about-${theme}-1100-full.png`), animations: 'disabled', fullPage: true });
      await page.setViewportSize({ width: 1100, height: 900 });
    }
    await page.setViewportSize({ width: 600, height: 900 });
    for (const route of ['driver-settings','stream-frame','distortion-profile','app-settings','setup','about']) {
      await openRoute(route);
      await page.screenshot({ path: path.join(out, `${route}-dark-600.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 600, height: 1700 });
    await page.screenshot({ path: path.join(out, 'about-dark-600-full.png'), animations: 'disabled', fullPage: true });
    results.push('Six production tabs captured in both themes and narrow layout');
    await page.setViewportSize({ width: 1100, height: 900 });
    await openRoute('about');
    const about = page.locator('app-about-page');
    await about.locator('.update-status[aria-busy="false"]').waitFor();
    const project = 'https://github.com/AngelDark92/GalaxyXR-Driver';
    const externalUrls = [project, project + '/releases', project + '/blob/main/Docs/StreamFrame.md',
      project + '/blob/main/Docs/TunerUsage.md', project + '/issues',
      'https://github.com/sboys3/CustomHeadsetOpenVR', 'https://github.com/timkhronos/CustomHeadsetOpenVrGxR',
      'https://patreon.com/SBoys3', 'https://ko-fi.com/sboys3'];
    assert.deepEqual(await about.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href'))), externalUrls);
    const aboutUrl = page.url(), beforeAboutActions = await mutations();
    for (const url of externalUrls) {
      const link = about.locator(`a[href="${url}"]`);
      assert.equal(await link.getAttribute('title'), 'Opens in your browser');
      for (const method of ['click', 'Enter']) {
        const before = (await openerUrls()).length;
        if (method === 'click') await link.click();
        else { await focusLinkWithKeyboard(link); await page.keyboard.press('Enter'); }
        await page.waitForFunction(count => window.__qa.calls.filter(call => call.command === 'plugin:opener|open_url').length > count, before);
        assert.deepEqual((await openerUrls()).slice(before), [url]);
        assert.equal(page.url(), aboutUrl);
        assert.equal(context.pages().length, 1);
      }
    }
    assert.equal(await mutations(), beforeAboutActions);
    results.push('All nine exact About destinations open once for click and Enter, preserve route, and make no writes');
    const failedLink = about.locator(`a[href="${project + '/issues'}"]`);
    await page.evaluate(() => { window.__qa.openerError = 'Injected opener failure'; });
    await focusLinkWithKeyboard(failedLink);
    const beforeFailedOpen = (await openerUrls()).length;
    await page.keyboard.press('Enter');
    const linkError = page.locator('fluent-dialog');
    await linkError.getByText('Could not open link', { exact: true }).waitFor();
    assert.match(await linkError.innerText(), /Try again, or copy the address into your browser\./);
    await linkError.getByText('Details', { exact: true }).click();
    assert.equal(await linkError.locator('pre').innerText(), project + '/issues');
    await page.screenshot({ path: path.join(out, 'about-link-error.png'), animations: 'disabled' });
    await linkError.locator('fluent-button').click();
    await linkError.waitFor({ state: 'detached' });
    assert.equal(await failedLink.evaluate(link => link.getRootNode().activeElement === link), true);
    assert.deepEqual((await openerUrls()).slice(beforeFailedOpen), [project + '/issues']);
    assert.equal(page.url(), aboutUrl);
    assert.equal(await mutations(), beforeAboutActions);
    await page.evaluate(() => { window.__qa.openerError = ''; });
    results.push('Opener failure shows the URL in a recoverable dialog and restores link focus without navigation or writes');
    const checkForUpdate = async ({ status = 200, tagName = '1.2.13', releaseUrl = project + '/releases/tag/v1.2.13' } = {}) => {
      const before = await page.evaluate(state => {
        Object.assign(window.__qa.github, state, { hold: true });
        return window.__qa.github.requests.length;
      }, { status, tagName, releaseUrl });
      await about.getByText('Check for updates', { exact: true }).click();
      await page.waitForFunction(count => window.__qa.github.requests.length > count, before);
      await about.locator('.update-status[aria-busy="true"] fluent-spinner').waitFor();
      assert.notEqual(await about.getByText('Checking…', { exact: true }).getAttribute('disabled'), null);
      assert.equal(await about.getByText('Up to date', { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.__qa.github.requests.length), before + 1);
      await page.screenshot({ path: path.join(out, 'about-update-loading.png'), animations: 'disabled' });
      await page.evaluate(() => window.__qa.releaseGithub());
      await about.locator('.update-status[aria-busy="false"]').waitFor();
    };
    await checkForUpdate();
    await about.getByText('Up to date', { exact: true }).waitFor();
    assert.equal(await about.locator('.version-number').innerText(), '1.2.13');
    assert.equal(await about.getByText('Update check unavailable', { exact: true }).count(), 0);
    await checkForUpdate({ status: 503 });
    await about.getByText('Update check unavailable', { exact: true }).waitFor();
    assert.equal(await about.getByText('Up to date', { exact: true }).count(), 0);
    assert.equal(await about.getByText('Update available', { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(out, 'about-update-error.png'), animations: 'disabled' });
    await checkForUpdate();
    await about.getByText('Up to date', { exact: true }).waitFor();
    assert.equal(await about.getByText('Update check unavailable', { exact: true }).count(), 0);
    const newReleaseUrl = project + '/releases/tag/v1.3.0';
    await checkForUpdate({ tagName: '1.3.0', releaseUrl: newReleaseUrl });
    await about.getByText('Update available', { exact: true }).waitFor();
    const beforeReleaseOpen = (await openerUrls()).length;
    await about.getByText('View release', { exact: true }).click();
    assert.deepEqual((await openerUrls()).slice(beforeReleaseOpen), [newReleaseUrl]);
    assert.equal(page.url(), aboutUrl);
    assert.equal(await about.locator('.version-number').innerText(), '1.2.13');
    assert.equal(await mutations(), beforeAboutActions);
    await page.screenshot({ path: path.join(out, 'about-update-available.png'), animations: 'disabled' });
    results.push('Update checks expose loading, current, failure, recovery and new-release states without installing or writing');
    await openRoute('distortion-profile');
    await page.evaluate(() => appContext.galaxy.sections.set({ ...appContext.galaxy.sections(), share: true }));
    const beforeImport = await mutations();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('app-distortion-profile-page').getByText('Import .json', { exact: true }).click();
    await (await chooserPromise).setFiles([]);
    assert.equal(await mutations(), beforeImport);
    results.push('Import JSON opens a file chooser and cancellation makes no writes');
    await openRoute('setup');
    const setup = page.locator('app-setup-page');
    await setup.getByText('Check settings', { exact: true }).click();
    await page.waitForFunction(() => !!window.appContext.checks.report() && !window.appContext.checks.checking());
    const primaryTable = setup.locator('table').first();
    assert.match(await primaryTable.innerText(), /Driver Settings.*Headset.*Galaxy XR Native Identity/s);
    assert.doesNotMatch(await primaryTable.innerText(), /settings\.json|streamFrame\./);
    await primaryTable.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'settings-check-dark-1100.png'), animations: 'disabled' });
    const beforeLink = await mutations();
    const beforeInternalOpen = (await openerUrls()).length;
    const settingLink = primaryTable.locator('tr').filter({ hasText: 'Galaxy XR Native Identity' }).getByText('Show setting');
    await focusLinkWithKeyboard(settingLink);
    assert.ok(await settingLink.evaluate(link => parseFloat(getComputedStyle(link).minHeight) >= 32));
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash.includes('setting='));
    await page.locator('[data-setting-id="galaxyXr.nativeIdentity"]').waitFor();
    assert.equal(await page.evaluate(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.getAttribute('data-setting-id');
    }), 'galaxyXr.nativeIdentity');
    assert.equal(await mutations(), beforeLink);
    assert.equal((await openerUrls()).length, beforeInternalOpen);
    results.push('Human-readable checker link has visible keyboard focus and routes natively without opener calls or writes');
    await page.evaluate(async () => {
      const app = appContext.appSetting;
      await app.save({ ...app.values(), advanceMode: false });
    });
    await openRoute('setup');
    await setup.getByText('Check settings', { exact: true }).click();
    await page.waitForFunction(() => !!appContext.checks.report() && !appContext.checks.checking());
    const beforeAdvancedLink = await mutations();
    await primaryTable.locator('tr').filter({ hasText: 'NVENC Tap' }).getByText('Show setting').click();
    await page.locator('[data-setting-id="streamFrame.nvencTap"]').waitFor();
    assert.equal(await page.evaluate(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.getAttribute('data-setting-id');
    }), 'streamFrame.nvencTap');
    assert.equal(await page.evaluate(() => appContext.appSetting.values().advanceMode), false);
    assert.equal(await mutations(), beforeAdvancedLink);
    assert.equal((await openerUrls()).length, beforeInternalOpen);
    results.push('Advanced target reveals and focuses its container without enabling Advanced Mode or writing');
    await openRoute('setup');
    const beforeCancel = await mutations();
    await setup.locator('fluent-button.danger:not([disabled])').click();
    const dialog = page.locator('fluent-dialog');
    await dialog.locator('fluent-dialog-body').waitFor();
    assert.match(await dialog.innerText(), /Saved profiles|saved profiles/);
    assert.equal(await page.evaluate(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.textContent?.trim();
    }), 'Cancel');
    await page.screenshot({ path: path.join(out, 'uninstall-confirmation.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await mutations(), beforeCancel);
    assert.equal(await page.evaluate(() => {
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return active?.textContent?.trim();
    }), 'Uninstall driver');
    results.push('Uninstall confirmation focuses Cancel; Escape restores trigger focus without mutations');
    await setup.locator('fluent-button:not([disabled])').filter({ hasText: 'Restore defaults' }).click();
    await dialog.locator('fluent-dialog-body').waitFor();
    assert.deepEqual(await dialog.locator('fluent-button').allTextContents(), ['Cancel', 'Restore defaults']);
    const cdp = await context.newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    assert(nodes.some(node => node.role?.value === 'alertdialog' && node.name?.value === 'Restore all defaults?'));
    const actionNames = nodes.filter(node => node.role?.value === 'button').map(node => node.name?.value);
    assert(actionNames.includes('Cancel') && actionNames.includes('Restore defaults'));
    await cdp.detach();
    results.push('Confirmation exposes its title and both action names in the browser accessibility tree');
    await dialog.locator('fluent-button').nth(1).click();
    await dialog.getByText('Defaults restored', { exact: true }).waitFor();
    await dialog.locator('fluent-button').click();
    assert.equal(await page.evaluate(() => window.appContext.appSetting.values().advanceMode), false);
    assert.equal(await page.evaluate(() => window.appContext.appSetting.values().colorScheme), 'dark');
    results.push('Confirmed reset reloads driver and app defaults');
    await setup.locator('fluent-button.danger:not([disabled])').click();
    await dialog.locator('fluent-dialog-body').waitFor();
    assert.deepEqual(await dialog.locator('fluent-button').allTextContents(), ['Cancel', 'Uninstall and clear settings']);
    await dialog.locator('fluent-button').nth(1).click();
    await dialog.getByText('Uninstall complete', { exact: true }).waitFor();
    await dialog.locator('fluent-button').click();
    assert.equal(await page.evaluate(() => window.__qa.files[window.__qa.data + '/Distortion/kept.json']), '{"name":"kept-profile"}');
    assert.equal(await page.evaluate(() => window.__qa.files[window.__qa.data + '/gui-settings.json']), undefined);
    await page.reload();
    await page.waitForFunction(() => window.appContext?.sds.driverState() === 'not-installed');
    assert.equal(await mutations(), 0);
    assert.equal(await page.evaluate(() => window.__qa.files[window.__qa.data + '/settings.json']), undefined);
    results.push('Uninstall preserves profile and reopening does not recreate active settings');
    await openRoute('app-settings');
    const setupLink = page.locator('app-app-settings-page').getByText('Open Setup', { exact: true });
    await focusLinkWithKeyboard(setupLink);
    const beforeSetupLink = await mutations(), beforeSetupOpen = (await openerUrls()).length;
    await page.keyboard.press('Enter');
    await page.locator('app-setup-page').getByRole('heading', { name: 'Setup', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '#/setup');
    assert.equal(await mutations(), beforeSetupLink);
    assert.equal((await openerUrls()).length, beforeSetupOpen);
    results.push('Open Setup remains a native keyboard link after uninstall without opener calls or settings recreation');
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
    const assets = path.join(dist, 'en-US/assets');
    const hashes = Object.fromEntries(fs.readdirSync(assets).filter(name => /\.(js|css)$/.test(name))
      .map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(assets, name))).digest('hex')]));
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ productionBundle: true, nativeIPC: 'in-memory fixture only', hashes, results, errors }, null, 2));
    console.log(JSON.stringify({ passed: results.length, screenshots: out, results }, null, 2));
  } catch (error) {
    if (page) {
      console.error(await page.evaluate(() => ({ dialogs: [...document.querySelectorAll('fluent-dialog')].map(dialog => dialog.innerText),
        calls: window.__qa?.calls.slice(-20).map(call => call.command), runtime: window.appContext?.startup.status() })));
      await page.screenshot({ path: path.join(out, 'failure.png'), animations: 'disabled' });
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

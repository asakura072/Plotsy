'use strict';

const assert = require('node:assert/strict');
const { mkdir, readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const screenshots = path.join(root, 'screenshots');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
};

const example = [
  'plotsy 1',
  'view 0 0 64',
  'expr "y=x"',
  '  latex "y=x"',
  '  color #2563eb',
  'expr "(cos(t),sin(t))"',
  '  color #059669',
  ''
].join('\n');

function startServer() {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = pathname === '/' ? '/index.html' : pathname;
    if (!/^\/(?:index\.html|(?:assets|css|js|vendor)\/[\w./-]+)$/.test(file) || file.split('/').includes('..')) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(path.join(root, file.slice(1)));
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function openApp(page, url) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  const response = await page.goto(url);
  assert.ok(response.ok(), 'The app failed to load.');
  await page.locator('.formula-line math-field').first().waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  return errors;
}

async function importExample(page) {
  await page.locator('#fileInput').setInputFiles({
    name: 'Example.psy', mimeType: 'text/plain', buffer: Buffer.from(example)
  });
  await waitForCount(page, 2);
  await page.waitForFunction(() => document.querySelector('math-field')?.shadowRoot);
}

async function typeMath(page, field, text, delay = 0) {
  await field.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text, { delay });
}

function mathLatex(field) {
  return field.evaluate((editor) => editor.getValue('latex'));
}

async function testPairedParentheses(page, url) {
  const errors = await openApp(page, url);
  const field = page.locator('.formula-line math-field');
  const raw = '((3)/(1.2)x)^2+(3y-((3)/(1.2)x^2)^(((1)/(3))))^2=9';
  let previousId = await page.locator('.expr-card').getAttribute('data-id');
  for (const savedLatex of [
    '',
    '\\left(\\frac{3}{1.2}x\\right.)^2+(3y-(\\frac{3}{1.2}x^2)^{(\\frac{1}{3})})^2=9',
    '\\biggl(\\frac{3}{1.2}x)^2+(3y-(\\frac{3}{1.2}x^2)^{(\\frac{1}{3})})^2=9'
  ]) {
    const records = ['plotsy 1', 'expr ' + JSON.stringify(raw)];
    if (savedLatex) records.push('  latex ' + JSON.stringify(savedLatex));
    await page.locator('#fileInput').setInputFiles({
      name: 'Parentheses.psy', mimeType: 'text/plain', buffer: Buffer.from(records.join('\n') + '\n')
    });
    await page.waitForFunction((id) => document.querySelector('.expr-card')?.dataset.id !== id, previousId);
    previousId = await page.locator('.expr-card').getAttribute('data-id');
    await paintFrame(page);
    assert.match(await mathLatex(field), /^\\left\(\\frac\{3\}\{1\.2\}x\\right\)\^/);
    const pairs = await field.evaluate((editor) => [...editor.shadowRoot.querySelectorAll('.ML__left-right')]
      .map((fence) => {
        const left = [...fence.children].find((node) => node.textContent === '(');
        const right = [...fence.children].find((node) => node.textContent === ')');
        return [left, right].map((node) => node?.getBoundingClientRect().height);
      }));
    assert.ok(pairs.length >= 3);
    assert.ok(pairs.every(([left, right]) => left > 0 && left === right), JSON.stringify(pairs));
    assert.ok(await hasBlueCurveAt(page, 0, 1), 'The imported curve must still pass through (0, 1).');
  }
  await page.locator('#toast').waitFor({ state: 'hidden' });
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 560, height: 900 });
  await paintFrame(page);
  await screenshot(page, 'plotsy-matched-parentheses');
  await page.setViewportSize(viewport);
  await paintFrame(page);

  const original = (await mathLatex(field)).replace(/\s+/g, '');
  await field.click();
  await field.evaluate((editor) => {
    for (let offset = 1; offset <= editor.lastOffset; offset += 1) {
      if (editor.getElementInfo(offset).latex !== 'x') continue;
      editor.position = offset;
      break;
    }
  });
  await page.keyboard.press('Backspace');
  assert.match(await mathLatex(field), /^\\left\(\\frac\{3\}\{1\.2\}\\right\)\^/);
  await page.keyboard.type('x');
  assert.equal((await mathLatex(field)).replace(/\s+/g, ''), original);

  const fraction = page.locator('#keypad button[title="分数"]');
  const open = page.locator('#keypad button[data-symbol-latex="("]');
  const close = page.locator('#keypad button[data-symbol-latex=")"]');
  for (const [openOnScreen, closeOnScreen] of [[false, true], [true, false], [true, true]]) {
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    if (openOnScreen) await open.click();
    else await page.keyboard.type('(');
    await fraction.click();
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1.2');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('x');
    if (closeOnScreen) await close.click();
    else await page.keyboard.type(')');
    await page.keyboard.type('^2');
    assert.match(await mathLatex(field), /^\\left\(\\frac\{3\}\{1\.2\}x\\right\)\^(?:2|\{2\})$/);
  }
  assert.deepEqual(errors, []);
  console.log('PASS  paired parentheses in loaded formulas, safe deletion, and mixed physical/virtual brackets');
}

async function testFunctionDeletion(page, url) {
  const errors = await openApp(page, url);
  const field = page.locator('.formula-line math-field');
  const functions = page.locator('#keypadTabFunctions');
  const main = page.locator('#keypadTabMain');
  const erase = page.locator('[data-action="backspace"]');
  await field.click();
  await functions.click();
  const keys = await page.locator('.func-key').evaluateAll((buttons) => buttons.map((button) =>
    button.dataset.fn ? ['fn', button.dataset.fn] : ['calculus', button.dataset.calculus]
  ));
  assert.equal(keys.length, 47);
  for (const [category, name] of keys) {
    await field.evaluate((editor) => {
      editor.setValue('y=x+z');
      editor.position = 4;
    });
    await page.locator('[data-' + category + '="' + name + '"]').click();
    assert.notEqual(await mathLatex(field), 'y=x+z', name + ' was not inserted');
    await page.keyboard.press('Backspace');
    assert.equal(await mathLatex(field), 'y=x+z', name + ' was not cleanly deleted');
  }

  for (const [category, name] of [['fn', 'nthroot'], ['fn', 'floor'], ['fn', 'atan2'], ['fn', 'polygamma'], ['calculus', 'integral']]) {
    await field.evaluate((editor) => {
      editor.setValue('y=x+z');
      editor.position = 4;
    });
    await functions.click();
    await page.locator('[data-' + category + '="' + name + '"]').click();
    await main.click();
    await erase.click();
    assert.equal(await mathLatex(field), 'y=x+z', name + ' was not deleted by the on-screen keypad');
  }

  await field.evaluate((editor) => editor.setValue(
    'y=\\sin\\left(\\sqrt{\\placeholder{}}+\\sqrt{z}\\right)',
    { selectionMode: 'placeholder' }
  ));
  await page.keyboard.press('Delete');
  assert.equal(await mathLatex(field), 'y=\\sin\\left(+\\sqrt{z}\\right)');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  assert.equal(await mathLatex(field), '');

  await typeMath(page, field, 'y=x+gamma');
  assert.match(await mathLatex(field), /\\gamma$/);
  await page.keyboard.press('Backspace');
  assert.equal(await mathLatex(field), 'y=x+');

  await functions.click();
  await page.locator('[data-fn="floor"]').click();
  await page.keyboard.type('2');
  await page.keyboard.press('Backspace');
  assert.equal(await mathLatex(field), 'y=x+\\left\\lfloor\\placeholder{}\\right\\rfloor');
  await page.keyboard.press('Backspace');
  assert.equal(await mathLatex(field), 'y=x+');

  for (const template of ['\\int_0^1x\\,dx', '\\sum_{i=1}^{10}x']) {
    await field.evaluate((editor, latex) => {
      editor.setValue('y=x+' + latex + '+z');
      editor.position = editor.lastOffset - 2;
    }, template);
    for (let press = 0; press < 12 && await mathLatex(field) !== 'y=x++z'; press += 1) {
      await page.keyboard.press('Backspace');
    }
    assert.equal(await mathLatex(field), 'y=x++z', 'Backspace got stuck while clearing ' + template);
  }
  assert.deepEqual(errors, []);
  console.log('PASS  all 47 function and calculus keys, physical and on-screen deletion, nested structure, and preserved placeholders');
}

async function testShortcuts(page, url) {
  const errors = await openApp(page, url);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await waitForCount(page, 1);
  const field = page.locator('.formula-line math-field');

  await typeMath(page, field, 'y=(xpi+2)');
  assert.match(await mathLatex(field), /x\\pi\+2/);

  await typeMath(page, field, 'y=3+4');
  await field.evaluate((editor) => { editor.position = 3; });
  await page.keyboard.type('pi');
  assert.match(await mathLatex(field), /3\\pi\+4/);

  await typeMath(page, field, 'y=p+2');
  await field.evaluate((editor) => { editor.position = 3; });
  await page.keyboard.type('i');
  await page.waitForFunction(() => document.querySelector('.formula-line math-field').value.includes('\\pi'));

  await typeMath(page, field, 'sinh', 700);
  assert.equal(await mathLatex(field), '\\sinh');
  for (const [shortcut, rest, operator] of [['int', 'egral', '\\int'], ['prod', 'uct', '\\prod']]) {
    await typeMath(page, field, shortcut);
    assert.equal((await mathLatex(field)).match(/\\placeholder/g)?.length, 2);
    await page.keyboard.type(rest);
    const latex = await mathLatex(field);
    assert.ok(latex.startsWith(operator), latex);
    assert.equal(latex.match(/\\placeholder/g)?.length, 2, latex);
  }

  for (const [text, expected] of [
    ['y=xpi+sqrt(4)', /x\\pi\s*\+\\operatorname\{sqrt\}/],
    ['y=\\frac{pi}{2}+\\operatorname{sin}(0)', /\\frac\{\\pi\}\{2\}/]
  ]) {
    await field.click();
    await page.keyboard.press('Control+a');
    await field.evaluate((editor, contents) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', contents);
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true, bubbles: true }));
    }, text);
    assert.match(await mathLatex(field), expected);
  }

  await page.locator('h1').click();
  await page.locator('#keypad').waitFor({ state: 'hidden' });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#importBtn').click();
  await (await chooser).setFiles({
    name: 'Polar.psy', mimeType: 'text/plain', buffer: Buffer.from('plotsy 1\nexpr "r=2+cos(theta)"\n')
  });
  const polarBound = page.locator('[data-bound="max"]');
  await polarBound.waitFor();
  await typeMath(page, polarBound, '3');
  await page.getByRole('tab', { name: 'ABC/αβγ', exact: true }).click();
  await page.getByTitle('Letter p', { exact: true }).click();
  await page.getByTitle('Letter i', { exact: true }).click();
  assert.match(await mathLatex(polarBound), /3\\pi/);
  await typeMath(page, polarBound, 'erf');
  assert.equal(await mathLatex(polarBound), '\\operatorname{erf}');
  await page.getByTitle('Letter c', { exact: true }).click();
  await page.keyboard.type('(0)');
  assert.match(await mathLatex(polarBound), /^\\operatorname\{erfc\}.*0/);
  const polarFormula = page.locator('.formula-line math-field');
  assert.match(await mathLatex(polarFormula), /^r\s*=/);
  assert.deepEqual(errors, []);
  console.log('PASS  instant shortcuts in nested and middle edits, slow aliases, paste, and polar bounds keypad');
}

async function testErrorFunctions(page, url) {
  const errors = await openApp(page, url);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  const fields = page.locator('.formula-line math-field');
  const first = fields.first();

  await typeMath(page, first, 'y=erf', 100);
  assert.equal(await mathLatex(first), 'y=\\operatorname{erf}');
  await page.keyboard.type('c(x)');
  assert.match(await mathLatex(first), /^y=\\operatorname\{erfc\}.*x/);
  await paintFrame(page);
  assert.ok(await hasBlueCurveAt(page, 0, 1), 'The shortcut did not plot the complementary error function.');

  await typeMath(page, first, 'y=(2erf');
  assert.match(await mathLatex(first), /2\\operatorname\{erf\}/);
  await page.keyboard.type('c(x))');
  assert.match(await mathLatex(first), /2\\operatorname\{erfc\}.*x/);

  await first.click();
  await page.keyboard.press('Control+a');
  await first.evaluate((editor) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'y=erfc(x)');
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, cancelable: true, bubbles: true }));
  });
  assert.match(await mathLatex(first), /^y=\\operatorname\{erfc\}.*x/);

  await typeMath(page, first, 'y=erf(x)');
  await page.getByRole('button', { name: 'Add expression', exact: true }).click();
  await waitForCount(page, 2);
  await page.waitForFunction(() => document.activeElement === document.querySelector('.expr-card:last-child .formula-line math-field'));
  const second = fields.last();
  await page.keyboard.type('y=');
  await page.getByRole('tab', { name: 'Functions & calculus' }).click();
  await page.getByRole('button', { name: 'erfc · Complementary error function', exact: true }).click();
  await page.keyboard.type('x');
  assert.match(await mathLatex(second), /^y=\\operatorname\{erfc\}[^)]*x/);
  await paintFrame(page);
  assert.ok(await hasBlueCurveAt(page, 0, 0), 'The error function is missing its origin crossing.');
  await screenshot(page, 'plotsy-error-functions');
  assert.deepEqual(errors, []);
  console.log('PASS  erf and erfc graphing, keycaps, paste, and extending an already converted erf with c');
}

async function chooseExport(page, menuItem) {
  await page.locator('#exportBtn').click();
  await page.getByRole('menuitem', { name: menuItem }).click();
}

async function saveThroughLink(page, menuItem, basename, expectedName) {
  let downloads = 0;
  const onDownload = () => { downloads += 1; };
  page.on('download', onDownload);
  try {
    await chooseExport(page, menuItem);
    const dialog = page.getByRole('dialog', { name: 'Save file' });
    await dialog.waitFor();
    assert.equal(downloads, 0, 'Export should wait for the user to save.');
    await dialog.getByRole('textbox', { name: 'File name' }).fill(basename);
    const saved = page.waitForEvent('download');
    await dialog.getByRole('link', { name: 'Save link' }).click();
    const download = await saved;
    assert.equal(download.suggestedFilename(), expectedName);
    await dialog.waitFor({ state: 'hidden' });
    return readFile(await download.path());
  } finally {
    page.off('download', onDownload);
  }
}

async function testSavePicker(page) {
  await page.evaluate(() => {
    const test = window.testSavePicker = { calls: [], writes: [], cancel: false };
    window.showSaveFilePicker = async (options) => {
      test.calls.push({ options, active: navigator.userActivation.isActive });
      if (test.cancel) throw new DOMException('Cancelled', 'AbortError');
      const isImage = options.types[0].accept['image/png'] !== undefined;
      const name = isImage ? 'Custom crop.png' : 'Custom project.psy';
      return {
        name,
        async createWritable() {
          let contents;
          return {
            async write(blob) {
              contents = isImage ? Array.from(new Uint8Array(await blob.slice(0, 8).arrayBuffer())) : await blob.text();
            },
            async close() { test.writes.push({ name, contents }); }
          };
        }
      };
    };
  });
  await chooseExport(page, /^Export project/);
  await page.getByText('Plotsy project exported.', { exact: true }).waitFor();
  await chooseExport(page, /^Export image/);
  await page.getByText('High-resolution PNG exported.', { exact: true }).waitFor();
  const { calls, writes } = await page.evaluate(() => window.testSavePicker);
  assert.deepEqual(calls.map(({ active }) => active), [true, true]);
  assert.equal(calls[0].options.excludeAcceptAllOption, true);
  assert.deepEqual(calls[0].options.types.map(({ accept }) => accept), [
    { 'application/x-plotsy-project': ['.psy'] }
  ]);
  assert.deepEqual(calls[1].options.types[0].accept, { 'image/png': ['.png'] });
  assert.match(calls[0].options.suggestedName, /^plotsy-.*\.psy$/);
  assert.match(calls[1].options.suggestedName, /^plotsy-.*\.png$/);
  assert.equal(writes[0].name, 'Custom project.psy');
  assert.match(writes[0].contents, /^plotsy 1\n/);
  assert.equal(writes[1].name, 'Custom crop.png');
  assert.equal(Buffer.from(writes[1].contents).toString('hex'), '89504e470d0a1a0a');

  await page.evaluate(() => { window.testSavePicker.cancel = true; });
  await chooseExport(page, /^Export project/);
  await page.waitForFunction(() => window.testSavePicker.calls.length === 3 && !document.querySelector('#exportBtn').disabled);
  assert.equal(await page.evaluate(() => window.testSavePicker.writes.length), 2);
  assert.ok(!await page.getByRole('dialog', { name: 'Save file' }).isVisible());
  console.log('PASS  native Save As API, selected names, file writes, and cancellation');
}

async function paintFrame(page) {
  const wasmReady = await page.evaluate(async () => {
    const ready = await window.Plotsy.wasm.readyPromise;
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return ready;
  });
  assert.ok(wasmReady, 'The bundled Plotsy WASM failed to load.');
}

function screenshot(page, name) {
  return page.screenshot({ path: path.join(screenshots, name + '.png'), animations: 'disabled' });
}

function waitForCount(page, count) {
  return page.waitForFunction((value) => Number(document.querySelector('#exprCount').textContent) === value, count);
}

async function graphPosition(page, x, y) {
  const [box, scale] = await Promise.all([
    page.locator('#graphCanvas').boundingBox(),
    page.locator('#scaleReadout').textContent()
  ]);
  return { x: box.x + box.width / 2 + x * Number(scale), y: box.y + box.height / 2 - y * Number(scale) };
}

async function hasBlueCurveAt(page, x, y) {
  const position = await graphPosition(page, x, y);
  return page.locator('#graphCanvas').evaluate((canvas, point) => {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const px = Math.round((point.x - rect.x) * scale);
    const py = Math.round((point.y - rect.y) * scale);
    const { data } = canvas.getContext('2d').getImageData(px - 2, py - 2, 5, 5);
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 100 && data[index + 1] < 150 && data[index + 2] > 195) return true;
    }
    return false;
  }, position);
}

async function hasInterestAt(page, x, y) {
  const point = await graphPosition(page, x, y);
  return page.locator('#overlayCanvas').evaluate((canvas, point) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const pixels = canvas.getContext('2d').getImageData(
      Math.round((point.x - rect.left) * dpr) - 2, Math.round((point.y - rect.top) * dpr) - 2, 5, 5
    ).data;
    const expected = [68, 65, 59];
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 240 && expected.every((value, channel) => Math.abs(pixels[i + channel] - value) < 4)) return true;
    }
    return false;
  }, point);
}

async function waitForCoordinates(page, x, y) {
  await page.waitForFunction(({ x, y }) => {
    return [[x, '#coordX'], [y, '#coordY']].every(([expected, selector]) => {
      const actual = Number(document.querySelector(selector).textContent.replace('−', '-'));
      return Math.abs(actual - expected) < 0.016;
    });
  }, { x, y });
}

async function testGraphSelection(page, url) {
  const errors = await openApp(page, url);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await page.locator('#fileInput').setInputFiles({
    name: 'Intersections.psy',
    mimeType: 'text/plain',
    buffer: Buffer.from([
      'plotsy 1', 'view 0 0 64', 'expr "y=x^2-1"', 'expr "x^2+y^2=4"',
      'expr "(t,1)"', 'expr "r=3"', ''
    ].join('\n'))
  });
  await waitForCount(page, 4);
  await paintFrame(page);
  const cards = page.locator('.expr-card');
  const selectedCards = cards.and(page.locator('.is-graph-selected'));
  assert.equal(await page.locator('.trace-select').count(), 0);
  assert.equal(await selectedCards.count(), 0);
  assert.equal(await hasInterestAt(page, 0, -1), false);

  async function selectAt(x, y, index) {
    const point = await graphPosition(page, x, y);
    await page.mouse.click(point.x, point.y);
    assert.equal(await selectedCards.count(), 1);
    assert.match(await cards.nth(index).getAttribute('class'), /\bis-graph-selected\b/);
    await paintFrame(page);
  }

  const onCurve = await graphPosition(page, 0.7, -0.51);
  await selectAt(0.7, -0.51, 0);
  assert.ok(await hasInterestAt(page, 0, -1), 'The parabola minimum is not visible as a standard marker.');
  assert.ok(await hasInterestAt(page, 1.51749, 1.30278), 'The implicit crossing is not visible.');
  assert.ok(await hasInterestAt(page, Math.sqrt(2), 1), 'The parametric crossing is not visible.');
  assert.ok(await hasInterestAt(page, 1.83638, 2.37228), 'The polar crossing is not visible.');

  await page.mouse.move(onCurve.x, onCurve.y - 165);
  await waitForCoordinates(page, 0.7, -0.51);
  const crossing = await graphPosition(page, 1.51749, 1.30278);
  await page.mouse.click(crossing.x + 5, crossing.y);
  await waitForCoordinates(page, 1.51749, 1.30278);
  await page.locator('h1').hover();
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await screenshot(page, 'plotsy-graph-intersections');

  const offCurve = await graphPosition(page, -3.7, 0.8);
  await selectAt(-2, 0, 1);
  assert.ok(await hasInterestAt(page, 0, -2));
  await page.mouse.move(offCurve.x, offCurve.y);
  await waitForCoordinates(page, -7.4 / Math.hypot(3.7, 0.8), 1.6 / Math.hypot(3.7, 0.8));

  await selectAt(4, 1, 2);
  const offParametric = await graphPosition(page, 2.2, -2);
  await page.mouse.move(offParametric.x, offParametric.y);
  await waitForCoordinates(page, 2.2, 1);

  await selectAt(0, 3, 3);
  assert.ok(await hasInterestAt(page, Math.sqrt(8), 1));
  await page.mouse.move(offCurve.x, offCurve.y);
  await waitForCoordinates(page, -11.1 / Math.hypot(3.7, 0.8), 2.4 / Math.hypot(3.7, 0.8));

  await selectAt(0.7, -0.51, 0);
  await page.locator('.color-dot').nth(1).click();
  await paintFrame(page);
  assert.equal(await hasInterestAt(page, 1.51749, 1.30278), false);
  assert.ok(await hasInterestAt(page, Math.sqrt(2), 1));
  await page.keyboard.press('Escape');
  await paintFrame(page);
  assert.equal(await selectedCards.count(), 0);
  assert.equal(await hasInterestAt(page, 0, -1), false);
  await selectAt(0.7, -0.51, 0);
  await page.mouse.click(onCurve.x, onCurve.y);
  assert.equal(await selectedCards.count(), 0);
  assert.equal(await page.locator('#coordReadout').getAttribute('aria-hidden'), 'true');
  await paintFrame(page);
  assert.equal(await hasInterestAt(page, 0, -1), false);

  await selectAt(0.7, -0.51, 0);
  const blank = await graphPosition(page, -4.5, -2);
  await page.mouse.click(blank.x, blank.y);
  assert.equal(await selectedCards.count(), 0);
  assert.equal(await page.locator('#coordReadout').getAttribute('aria-hidden'), 'true');
  await paintFrame(page);
  assert.equal(await hasInterestAt(page, 0, -1), false);

  const initialScale = await page.locator('#scaleReadout').textContent();
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.wheel(0, -180);
  await page.waitForFunction((scale) => document.querySelector('#scaleReadout').textContent !== scale, initialScale);
  await paintFrame(page);
  const zoomedScale = await page.locator('#scaleReadout').textContent();
  const probe = { x: blank.x + 20, y: blank.y - 20 };
  await page.mouse.move(probe.x, probe.y);
  const readout = page.locator('#coordX, #coordY');
  const zoomedCoordinates = await readout.allTextContents();
  await page.mouse.dblclick(blank.x, blank.y);
  await paintFrame(page);
  await page.mouse.move(probe.x, probe.y);
  assert.equal(await page.locator('#scaleReadout').textContent(), zoomedScale);
  assert.deepEqual(await readout.allTextContents(), zoomedCoordinates);
  await page.locator('#resetView').click();
  await page.waitForFunction((scale) => document.querySelector('#scaleReadout').textContent === scale, initialScale);
  assert.deepEqual(errors, []);
  console.log('PASS  curve switching, repeat- and blank-click deselection, double-click without reset, and toolbar reset');
}

async function testDesktop(page, url) {
  const oldKey = 'plotsy.project.v1';
  const oldProject = JSON.stringify({ format: 'plotsy-graph', version: 1, expressions: [{ raw: 'y=1', latex: 'y=1' }] });
  await page.addInitScript(({ key, value }) => {
    window.showSaveFilePicker = undefined;
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: oldKey, value: oldProject });
  const errors = await openApp(page, url);
  await waitForCount(page, 1);
  const firstEditor = page.locator('.formula-line math-field').first();
  assert.equal(await mathLatex(firstEditor), '');
  assert.equal(await page.locator('.expr-action.delete:visible').count(), 0);
  assert.equal(await page.title(), 'Plotsy · 图形计算器');
  await paintFrame(page);
  assert.ok(!await hasBlueCurveAt(page, 0, 1), 'The initial graph should have no saved curve.');
  await screenshot(page, 'plotsy-desktop-zh');
  await importExample(page);

  await page.getByRole('button', { name: 'Switch to English' }).click();
  assert.equal(await page.title(), 'Plotsy · Graphing Calculator');
  await page.reload();
  await firstEditor.waitFor();
  await waitForCount(page, 1);
  assert.equal(await mathLatex(firstEditor), '');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), oldKey), oldProject);
  console.log('PASS  blank startup and reload, with project autosaving disabled');
  await importExample(page);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.title(), 'Plotsy · Graphing Calculator');
  await page.getByRole('button', { name: 'Help and syntax' }).click();
  await page.getByRole('heading', { name: 'Graphing help' }).waitFor();
  await page.getByRole('button', { name: 'Close help' }).click();
  console.log('PASS  English controls, help, and saved language');

  const formula = page.locator('math-field').first();
  await formula.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('y=x^2');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Restriction', exact: true }).click();
  await page.keyboard.type('0<x<2');
  await page.locator('h1').click();
  await page.locator('#keypad').waitFor({ state: 'hidden' });
  await paintFrame(page);
  assert.ok(await hasBlueCurveAt(page, 1, 1), 'The restricted curve is missing at x = 1.');
  assert.ok(!await hasBlueCurveAt(page, -1, 1), 'The curve was drawn outside its restriction.');
  assert.ok(!await hasBlueCurveAt(page, 2.2, 2.2 ** 2), 'The curve was drawn past its upper limit.');
  const nearCurve = await graphPosition(page, 1, 1);
  await page.mouse.click(nearCurve.x, nearCurve.y);
  await page.mouse.move(nearCurve.x, nearCurve.y + 42);
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('#coordY').textContent) - 1) < 0.015);
  await screenshot(page, 'plotsy-desktop-en');
  console.log('PASS  keypad restriction, canvas pixels, and mouse trace');

  const previousEditor = page.locator('.formula-line math-field').last();
  const previousLatex = await mathLatex(previousEditor);
  await previousEditor.evaluate((field) => {
    window.Plotsy.mathfield.focusField(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
  });
  await waitForCount(page, 3);
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('.formula-line math-field')[2]);
  // Check that the old MathLive editor cannot take focus back after its 60 ms timer.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await page.keyboard.type('y=mx+b');
  assert.equal(await mathLatex(page.locator('.formula-line math-field').nth(1)), previousLatex);
  assert.equal(await mathLatex(page.locator('.formula-line math-field').nth(2)), 'y=mx+b');
  const addSliders = page.getByRole('button', { name: 'Add sliders: m, b' });
  await addSliders.click();
  await waitForCount(page, 5);
  const slider = page.getByRole('slider', { name: 'Slider m' });
  await slider.press('ArrowRight');
  const sliderFormula = slider.locator('xpath=ancestor::article').locator('.formula-line math-field');
  assert.match(await sliderFormula.evaluate((field) => field.value), /^m\s*=\s*1\.1$/);
  console.log('PASS  one-click sliders and keyboard adjustment');

  const upperBound = page.locator('[data-bound="max"]:visible');
  await typeMath(page, upperBound, '-1');
  await page.keyboard.press('Enter');
  await page.getByText('The start must be below the end of the range.', { exact: true }).waitFor();
  await typeMath(page, upperBound, '3pi');
  assert.match(await mathLatex(upperBound), /3\\pi/);
  await page.keyboard.press('Enter');
  await page.getByText('The start must be below the end of the range.', { exact: true }).waitFor({ state: 'hidden' });
  console.log('PASS  invalid parameter range stays editable');

  const exportedContents = await saveThroughLink(page, /^Export project/, 'My project', 'My project.psy');
  const text = exportedContents.toString('utf8');
  assert.match(text, /^plotsy 1\n/);
  assert.equal(text.match(/^expr /gm).length, 5);
  assert.match(text, /bounds "0" "3π"/);

  const fileInput = page.locator('#fileInput');
  assert.equal(await fileInput.getAttribute('accept'), '.psy');
  for (const [name, contents, message] of [
    ['graph.data', exportedContents, 'Select a Plotsy project with the .psy extension.'],
    ['future.psy', Buffer.from('plotsy 2\n'), 'The file uses an unsupported Plotsy project format or version.'],
    ['corrupt.psy', Buffer.from('plotsy 1\nexpr "x"\nslider -3 3 -1\n'), 'The project file has an invalid record on line 3.']
  ]) {
    await fileInput.setInputFiles({
      name, mimeType: 'application/octet-stream', buffer: contents
    });
    await page.getByText(message, { exact: true }).waitFor();
    assert.equal(await page.locator('#exprCount').textContent(), '5');
  }

  const chosen = page.waitForEvent('filechooser');
  await page.locator('#importBtn').click();
  const chooser = await chosen;
  await chooser.setFiles({
    name: 'My renamed graph.PSY', mimeType: 'application/octet-stream', buffer: exportedContents
  });
  await page.getByText('Imported 5 expressions.', { exact: true }).waitFor();
  assert.deepEqual(await saveThroughLink(page, /^Export project/, 'Round trip.PSY', 'Round trip.PSY'), exportedContents);

  const transfer = await page.evaluateHandle((contents) => {
    const data = new DataTransfer();
    data.items.add(new File([contents], 'Another graph.psy', { type: 'application/octet-stream' }));
    return data;
  }, 'plotsy 1\nexpr "(2,3)"\n');
  try {
    await page.locator('#graphPane').dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
  await waitForCount(page, 1);
  await page.getByText('Imported 1 expression.', { exact: true }).waitFor();

  const png = await saveThroughLink(page, /^Export image/, 'My image', 'My image.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  console.log('PASS  .psy round trip, invalid file rejection, and confirm-before-download fallback for .psy and PNG');
  await testSavePicker(page);

  assert.equal(await page.evaluate((key) => localStorage.getItem(key), oldKey), oldProject);
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('button', { name: 'Create blank graph', exact: true }).click();
  await firstEditor.waitFor();
  await waitForCount(page, 1);
  assert.equal(await mathLatex(firstEditor), '');

  await page.getByRole('button', { name: '切换为简体中文' }).click();
  assert.equal(await page.title(), 'Plotsy · 图形计算器');
  assert.deepEqual(errors, []);
}

async function testWorkspace(page, url) {
  const errors = await openApp(page, url);
  assert.equal(await page.locator('#keypadTabLetters').textContent(), 'ABC/αβγ');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  assert.equal(await page.locator('.quick-tip, .sidebar-footer, .visibility, .empty-state, .graph-hint').count(), 0);
  const addButton = page.getByRole('button', { name: 'Add expression', exact: true });
  const addLayout = await addButton.evaluate((button) => {
    const example = button.previousElementSibling;
    const box = button.getBoundingClientRect();
    const exampleBox = example.getBoundingClientRect();
    return {
      square: box.width === box.height,
      aligned: box.top === exampleBox.top && box.height === exampleBox.height,
      onRight: box.left > exampleBox.right,
      sameRadius: getComputedStyle(button).borderRadius === getComputedStyle(example).borderRadius
    };
  });
  assert.deepEqual(addLayout, { square: true, aligned: true, onRight: true, sameRadius: true });
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  const gallery = page.getByRole('dialog', { name: 'Examples' });
  assert.equal(await gallery.locator('.syntax-card .katex').count(), 13);
  await gallery.getByRole('button', { name: 'Sine wave', exact: true }).click();
  await waitForCount(page, 1);
  const fields = page.locator('.formula-line math-field');
  assert.match(await mathLatex(fields.first()), /\\sin/);

  const main = page.locator('[data-keypad-panel="main"]');
  await main.waitFor();
  assert.equal(await page.getByRole('tab').count(), 3);
  assert.equal(await main.locator('[data-move]').count(), 4);
  assert.deepEqual(await main.locator('.keypad-numbers button').evaluateAll((buttons) =>
    buttons.slice(0, 9).map(({ dataset }) => dataset.symbolLatex)), '789456123'.split(''));
  assert.equal(await main.locator('button:not(:has(.katex))').count(), 0);
  await paintFrame(page);
  await screenshot(page, 'plotsy-desktop-keypad');
  const end = await fields.first().evaluate((field) => (field.position = field.lastOffset));
  await main.getByRole('button', { name: 'Move caret left' }).click();
  assert.ok(await fields.first().evaluate((field) => field.position) < end);
  await main.getByRole('button', { name: 'Enter', exact: true }).click();
  await waitForCount(page, 2);
  await page.waitForFunction(() => document.activeElement === document.querySelectorAll('.formula-line math-field')[1]);
  assert.equal(await mathLatex(fields.last()), '');

  const multiply = main.getByRole('button', { name: 'Multiplication', exact: true });
  const divide = main.getByRole('button', { name: 'Division', exact: true });
  const fraction = main.getByRole('button', { name: 'Fraction', exact: true });
  assert.match(await multiply.locator('.katex-mathml annotation').textContent(), /\\times$/);
  assert.match(await divide.locator('.katex-mathml annotation').textContent(), /\\div$/);
  await page.keyboard.type('2');
  await multiply.click();
  await page.keyboard.type('3');
  assert.match(await mathLatex(fields.last()), /^2\\cdot\s*3$/);
  const lastResult = page.locator('.expr-card').last();
  await lastResult.locator('.calc-result-formula:text-is("6")').waitFor();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  const fractionTemplate = '\\frac{\\placeholder{}}{\\placeholder{}}';
  await page.keyboard.type('x^2+3');
  assert.equal(await mathLatex(fields.last()), 'x^{2+3}');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('+4');
  assert.equal(await mathLatex(fields.last()), 'x^{2+3}+4');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  const power = main.getByRole('button', { name: 'Superscript / power', exact: true });
  for (const key of [divide, fraction]) {
    await page.keyboard.type('x');
    await power.click();
    await main.locator('button[data-symbol-latex="2"]').click();
    await multiply.click();
    await key.click();
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
    await page.keyboard.type('4');
    assert.match(await mathLatex(fields.last()), /^x\^\{2\\cdot\s*\\frac(?:3|\{3\})(?:4|\{4\})\}$/);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
  }

  for (const key of [divide, fraction]) {
    await key.click();
    assert.equal(await mathLatex(fields.last()), fractionTemplate);
    await page.keyboard.type('8');
    await page.keyboard.press('Tab');
    await page.keyboard.type('2');
    assert.match(await mathLatex(fields.last()), /^\\frac(?:8|\{8\})(?:2|\{2\})$/);
    await lastResult.locator('.calc-result-formula:text-is("4")').waitFor();
    if (key === divide) {
      await fields.last().evaluate((field) => { field.position = field.lastOffset; });
      await multiply.click();
      await page.keyboard.type('3');
      await lastResult.locator('.calc-result-formula:text-is("12")').waitFor();
      await screenshot(page, 'plotsy-keypad-operators');
    }
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
  }

  await page.getByRole('tab', { name: 'Functions & calculus' }).click();
  const functions = page.locator('[data-keypad-panel="functions"]');
  assert.equal(await functions.locator('.func-key[data-fn] .katex').count(), 43);
  assert.equal(await functions.locator('.func-key[data-calculus] .katex').count(), 4);
  await functions.locator('[data-calculus="integral"]').click();
  assert.match(await mathLatex(fields.last()), /\\int/);

  await page.getByRole('tab', { name: 'ABC/αβγ', exact: true }).click();
  const alphabet = page.locator('[data-keypad-panel="letters"]');
  const keyPositions = () => alphabet.locator('.letter-row .math-key').evaluateAll((keys) =>
    keys.map((key) => {
      const { x, y, width, height } = key.getBoundingClientRect();
      return [x, y, width, height];
    })
  );
  const latinPositions = await keyPositions();
  await alphabet.getByRole('button', { name: 'Switch to Greek letters' }).click();
  assert.deepEqual(await keyPositions(), latinPositions);
  assert.equal(await alphabet.locator('.letter-grid .math-key .katex').count(), 26);
  const greekKeys = () => alphabet.locator('.letter-row').evaluateAll((rows) =>
    rows.map((row) => Array.from(row.querySelectorAll('.math-key'), (key) => key.dataset.symbolLatex))
  );
  assert.deepEqual(await greekKeys(), [
    [';', '\\varsigma', '\\varepsilon', '\\rho', '\\tau', '\\upsilon', '\\theta', '\\iota', 'ο', '\\pi'],
    ['\\alpha', '\\sigma', '\\delta', '\\varphi', '\\gamma', '\\eta', '\\xi', '\\kappa', '\\lambda'],
    ['\\zeta', '\\chi', '\\psi', '\\omega', '\\beta', '\\nu', '\\mu']
  ]);
  await screenshot(page, 'plotsy-desktop-greek');
  await alphabet.getByRole('button', { name: 'Switch to uppercase' }).click();
  assert.equal((await greekKeys())[0][6], 'Θ');
  assert.equal(await alphabet.locator('.letter-grid .math-key .katex').count(), 26);
  await alphabet.getByRole('button', { name: 'Switch to lowercase' }).click();
  await alphabet.getByRole('button', { name: 'Greek letter θ' }).click();
  assert.match(await mathLatex(fields.last()), /\\theta/);
  await alphabet.getByRole('button', { name: 'Switch to Latin letters' }).click();
  assert.equal(await alphabet.locator('.letter-grid .math-key .katex').count(), 26);

  await page.locator('.expr-action.delete').last().click();
  await waitForCount(page, 1);
  assert.equal(await page.locator('.expr-action.delete:visible').count(), 0);

  const dot = page.locator('.color-dot');
  await dot.click();
  await page.waitForFunction(() => document.querySelector('.color-dot').getAttribute('aria-pressed') === 'false');
  await dot.click();
  await page.waitForFunction(() => document.querySelector('.color-dot').getAttribute('aria-pressed') === 'true');
  const bounds = await dot.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  const palette = page.locator('#colorPopover');
  await palette.waitFor();
  await page.mouse.up();
  assert.equal(await dot.getAttribute('aria-pressed'), 'true');
  await palette.waitFor();
  assert.match(await page.locator('#customSwatch').evaluate((swatch) => getComputedStyle(swatch).backgroundImage), /conic-gradient/);
  const swatches = await palette.locator('.swatch').evaluateAll((items) => items.map((item) => [
    Math.round(item.getBoundingClientRect().x), Math.round(item.getBoundingClientRect().y)
  ]));
  assert.equal(swatches.length, 9);
  assert.equal(new Set(swatches.map(([x]) => x)).size, 3);
  assert.equal(new Set(swatches.map(([, y]) => y)).size, 3);
  await screenshot(page, 'plotsy-color-palette');
  await palette.locator('#customSwatch').click();
  const initialHex = await palette.locator('#customColor').inputValue();
  await palette.locator('#colorPlane').click({ position: { x: 165, y: 36 } });
  assert.notEqual(await palette.locator('#customColor').inputValue(), initialHex);
  await palette.getByRole('button', { name: 'Back' }).click();
  assert.equal(await page.locator('.expr-card').evaluate((card) => card.style.getPropertyValue('--expr-color')), '#2563eb');
  await palette.locator('#customSwatch').click();
  await palette.locator('#customColor').fill('#8a35d0');
  await screenshot(page, 'plotsy-custom-color');
  await palette.getByRole('button', { name: 'Apply color' }).click();
  await page.waitForFunction(() => document.querySelector('.expr-card').style.getPropertyValue('--expr-color') === '#8a35d0');
  await palette.waitFor({ state: 'hidden' });

  await page.locator('#fileInput').setInputFiles({
    name: 'Empty.psy', mimeType: 'text/plain', buffer: Buffer.from('plotsy 1\n')
  });
  await page.waitForFunction(() => document.querySelector('.formula-line math-field')?.value === '');
  await waitForCount(page, 1);
  assert.equal(await page.locator('.expr-action.delete:visible').count(), 0);
  await addButton.click();
  await waitForCount(page, 2);
  await page.waitForFunction(() => document.activeElement === document.querySelector('.expr-card:last-child .formula-line math-field'));
  assert.equal(await mathLatex(fields.last()), '');
  assert.deepEqual(errors, []);
  console.log('PASS  square Add expression button, LaTeX keycaps, examples, Enter, protected final row, and custom colors');
}

async function testMobile(page, url) {
  const errors = await openApp(page, url);
  await waitForCount(page, 1);
  await importExample(page);
  await page.getByRole('button', { name: 'Switch to English' }).tap();
  await paintFrame(page);
  const center = await graphPosition(page, 0, 0);
  await page.touchscreen.tap(center.x, center.y + 6);
  await page.locator('#coordReadout.is-visible').waitFor();
  assert.ok(Math.abs(Number(await page.locator('#coordY').textContent())) < 0.015);
  assert.match(await page.locator('.expr-card').first().getAttribute('class'), /\bis-graph-selected\b/);
  const onLine = await graphPosition(page, 1.5, 1.5);
  await page.touchscreen.tap(onLine.x, onLine.y);
  assert.equal(await page.locator('.expr-card.is-graph-selected').count(), 0);
  await page.touchscreen.tap(onLine.x, onLine.y);
  assert.match(await page.locator('.expr-card').first().getAttribute('class'), /\bis-graph-selected\b/);
  const distant = await graphPosition(page, 1, -1.8);
  const touch = await page.context().newCDPSession(page);
  const dragTarget = await graphPosition(page, 1.55, -1.8);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [distant] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [dragTarget] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitForCoordinates(page, 1.55, 1.55);
  const [canvas, workspace] = await Promise.all([
    page.locator('#graphCanvas').boundingBox(),
    page.locator('.sidebar').boundingBox()
  ]);
  assert.ok(canvas.y < workspace.y, 'The graph should come before the expressions on a phone.');
  const parameterCard = page.locator('.expr-card').last();
  await parameterCard.locator('.bound-marker .katex').last().waitFor();
  assert.equal(await parameterCard.locator('.bound-marker .katex').count(), 2);
  assert.match(await mathLatex(parameterCard.locator('.bound-math').last()), /2\s*\\pi/);
  await page.locator('#toast').waitFor({ state: 'hidden' });
  await screenshot(page, 'plotsy-mobile-en');
  await page.touchscreen.tap(distant.x, distant.y);
  assert.equal(await page.locator('.expr-card.is-graph-selected').count(), 0);
  assert.equal(await page.locator('#coordReadout').getAttribute('aria-hidden'), 'true');

  const dot = page.locator('.color-dot').first();
  await dot.tap();
  await page.waitForFunction(() => document.querySelector('.color-dot').getAttribute('aria-pressed') === 'false');
  await dot.tap();
  await page.waitForFunction(() => document.querySelector('.color-dot').getAttribute('aria-pressed') === 'true');
  const target = await dot.boundingBox();
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }]
  });
  await page.locator('#colorPopover').waitFor();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await dot.getAttribute('aria-pressed'), 'true');
  await page.locator('#customSwatch').tap();
  const customColor = page.locator('#customColor');
  const previousColor = await customColor.inputValue();
  await page.locator('#colorPlane').tap({ position: { x: 170, y: 36 } });
  assert.notEqual(await customColor.inputValue(), previousColor);
  await screenshot(page, 'plotsy-mobile-color');
  await page.locator('#colorBack').tap();
  await page.locator('#colorGrid button').first().tap();
  await page.locator('math-field').first().tap();
  await page.locator('#keypad').waitFor();
  const waitForVisibleEditor = () => page.waitForFunction(() => {
    const field = document.activeElement;
    if (field?.tagName !== 'MATH-FIELD') return false;
    const editor = field.getBoundingClientRect();
    const list = field.closest('.sidebar-scroll').getBoundingClientRect();
    const keypad = document.querySelector('#keypad').getBoundingClientRect();
    return editor.top >= list.top - 1 && editor.bottom <= Math.min(list.bottom, keypad.top) + 1;
  });
  await waitForVisibleEditor();
  const editingControlsFit = () => page.locator('.keypad-controls').evaluate((controls) => {
    const keypad = controls.closest('.keypad-panel').getBoundingClientRect();
    const { top, bottom, left, right } = controls.getBoundingClientRect();
    return top >= keypad.top && bottom <= keypad.bottom && left >= keypad.left && right <= keypad.right;
  });
  assert.ok(await editingControlsFit(), 'The editing controls extend outside the mobile keyboard.');
  await screenshot(page, 'plotsy-mobile-keypad');
  await page.getByRole('tab', { name: 'ABC/αβγ', exact: true }).tap();
  await page.getByRole('button', { name: 'Switch to Greek letters' }).tap();
  await screenshot(page, 'plotsy-mobile-greek');
  await page.getByRole('tab', { name: 'Keypad', exact: true }).tap();
  await page.setViewportSize({ width: 320, height: 680 });
  assert.ok(await editingControlsFit(), 'The editing controls extend outside the keyboard at 320px.');
  await page.getByRole('tab', { name: /Function/ }).tap();
  await page.getByRole('button', { name: /sin · Sine/ }).waitFor();
  const fits = await page.locator('[data-keypad-panel="functions"] .func-key small').evaluateAll((labels) =>
    labels.every((label) => label.getBoundingClientRect().right <= label.parentElement.getBoundingClientRect().right)
  );
  assert.ok(fits, 'Function labels extend outside their keys on mobile.');
  await page.getByRole('button', { name: 'Add expression', exact: true }).tap();
  await waitForCount(page, 3);
  await page.waitForFunction(() => document.activeElement === document.querySelector('.expr-card:last-child .formula-line math-field'));
  assert.equal(await mathLatex(page.locator('.formula-line math-field').last()), '');
  await page.setViewportSize({ width: 320, height: 568 });
  await waitForVisibleEditor();
  await page.getByRole('tab', { name: 'Keypad', exact: true }).tap();
  await page.keyboard.type('y=x^2');
  await page.locator('#keypad button[data-symbol-latex="+"]').tap();
  await page.locator('#keypad button[data-symbol-latex="3"]').tap();
  assert.equal(await mathLatex(page.locator('.formula-line math-field').last()), 'y=x^{2+3}');
  await waitForVisibleEditor();
  await screenshot(page, 'plotsy-mobile-short-editing');
  await page.setViewportSize({ width: 640, height: 360 });
  await waitForVisibleEditor();
  await screenshot(page, 'plotsy-mobile-landscape-editing');
  assert.deepEqual(errors, []);
  console.log('PASS  mobile layout, touch trace, color dot tap/hold, and LaTeX keypad');
}

async function run() {
  const { chromium } = require(process.env.PLOTSY_PLAYWRIGHT_MODULE || 'playwright');
  await mkdir(screenshots, { recursive: true });
  const server = await startServer();
  const url = 'http://127.0.0.1:' + server.address().port;
  let browser;
  let page;
  let stage = 'desktop';
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLOTSY_BROWSER_EXECUTABLE
    });
    console.log('Headless Chromium ' + browser.version());
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testDesktop(page, url);
    await page.close();

    stage = 'shortcuts';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testShortcuts(page, url);
    await page.close();

    stage = 'parentheses';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testPairedParentheses(page, url);
    await page.close();

    stage = 'error-functions';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testErrorFunctions(page, url);
    await page.close();

    stage = 'function-deletion';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testFunctionDeletion(page, url);
    await page.close();

    stage = 'graph-selection';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testGraphSelection(page, url);
    await page.close();

    stage = 'workspace';
    page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(8000);
    await testWorkspace(page, url);
    await page.close();

    stage = 'mobile';
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce'
    });
    page.setDefaultTimeout(8000);
    await testMobile(page, url);
    console.log('Screenshots: ' + screenshots);
  } catch (error) {
    if (page && !page.isClosed()) {
      await screenshot(page, 'failed-' + stage).catch(() => {});
    }
    throw error;
  } finally {
    try { await browser?.close(); }
    finally { server.close(); }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

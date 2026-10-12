/**
 * Browser check for the upload flow: every PDF must land in the file list and
 * step 3 must auto-match by name. Catches the bug where an insecure context
 * (http:// on a phone or LAN) made hashing throw and rejected every file.
 *
 * Needs a dev server first:  npm run dev -- --port 5199 --strictPort
 * Then:  npm run test:e2e   (BASE_URL overrides http://localhost:5199/)
 */
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.BASE_URL || 'http://localhost:5199/';
const docsDir = resolve('output/documents');
const pdfs = readdirSync(docsDir)
  .filter((name) => name.toLowerCase().endsWith('.pdf'))
  .map((name) => resolve(docsDir, name));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const logs = [];
page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) =>
  logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`),
);

await page.goto(base, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Load sample requirements' }).click();
await page.waitForTimeout(300);

await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdfs);
await page.waitForTimeout(8000);

const report = {
  uploaded: pdfs.length,
  fileRows: await page.locator('.file').count(),
  fileNames: await page.locator('.file__name').allTextContents(),
  notices: (await page.locator('.notice').allTextContents()).map((s) => s.trim()),
  statuses: (await page.locator('.req .badge, .req [class*="whitespace-nowrap"]').allTextContents()).map(
    (s) => s.trim(),
  ),
  matchedSelects: await page.locator('select option:checked').allTextContents(),
  logs,
};

console.log(JSON.stringify(report, null, 2));
await browser.close();

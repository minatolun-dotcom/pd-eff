const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [CONSOLE ERROR]', msg.text());
  });
  page.on('pageerror', err => console.log('  [PAGE ERROR]', err.message));

  // ============ SIGN PAGE ============
  console.log('=== 1. Sign Page ===');
  await page.goto(`${FRONTEND}`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/final-01-sign.png' });
  const signText = await page.textContent('body');
  console.log('  Has Sign:', signText.includes('Sign') ? '✅' : '❌');
  console.log('  ✅ /tmp/final-01-sign.png');

  // ============ VERIFY PAGE - EMPTY ============
  console.log('\n=== 2. Verify Page (empty) ===');
  await page.goto(`${FRONTEND}/verify`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/final-02-verify-empty.png' });
  console.log('  ✅ /tmp/final-02-verify-empty.png');

  // ============ UPLOAD & VERIFY ============
  console.log('\n=== 3. Upload st tribe.pdf ===');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(path.join('/home/khuptong/project/pd-eff', 'st tribe.pdf'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/final-03-file-selected.png' });
  console.log('  ✅ /tmp/final-03-file-selected.png');

  console.log('\n=== 4. Click Verify ===');
  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '/tmp/final-04-after-verify.png' });
  console.log('  ✅ /tmp/final-04-after-verify.png');

  // ============ CHECK VERIFICATION RESULTS ============
  console.log('\n=== 5. Verify Results ===');
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height, hasContent: c.toDataURL().length > 1000 } : null;
  });
  console.log('  Canvas:', canvasInfo?.hasContent ? `✅ ${canvasInfo.w}x${canvasInfo.h}` : '❌ Not rendered');

  const stampVisible = await page.evaluate(() => {
    const el = document.querySelector('[class*="cursor-grab"]');
    if (!el) return null;
    const style = el.style;
    return { left: style.left, top: style.top, width: style.width, height: style.height, text: el.textContent?.substring(0, 60) };
  });
  console.log('  Stamp overlay:', stampVisible ? `✅ at (${stampVisible.left}, ${stampVisible.top})` : '❌ Not found');
  if (stampVisible) console.log('  Stamp text:', stampVisible.text);

  const hasExportBtn = await page.$('button:has-text("Export")');
  console.log('  Export button:', hasExportBtn ? '✅' : '❌');

  const hasVerifyAnother = await page.$('button:has-text("Verify Another")');
  console.log('  Verify Another button:', hasVerifyAnother ? '✅' : '❌');

  // ============ EXPORT VIA BROWSER ============
  console.log('\n=== 6. Click Export ===');
  if (hasExportBtn) {
    await hasExportBtn.click();
    // Wait for stamp API call and download button to appear
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/final-05-after-export.png' });
    console.log('  ✅ /tmp/final-05-after-export.png');

    // Check if download button appeared
    const hasDownloadBtn = await page.$('button:has-text("Download")');
    console.log('  Download button appeared:', hasDownloadBtn ? '✅' : '❌');

    if (hasDownloadBtn) {
      // Click download and capture the file
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        hasDownloadBtn.click()
      ]);

      if (download) {
        const savePath = '/tmp/browser-exported.pdf';
        await download.saveAs(savePath);
        const size = fs.statSync(savePath).size;
        console.log('  Downloaded file:', size, 'bytes', size > 10000 ? '✅' : '❌');

        // Check if stamps are in the file
        const content = fs.readFileSync(savePath, 'latin1');
        const hasStampText = content.includes('Signature valid') || content.includes('Digitally signed by');
        const hasGreenOps = content.includes('0.13 0.55 0.13');
        console.log('  Has stamp text:', hasStampText ? '✅' : '❌');
        console.log('  Has green checkmark:', hasGreenOps ? '✅' : '❌');
      } else {
        console.log('  ❌ No download event');
      }
    }
  }

  // ============ CERTIFICATES PAGE ============
  console.log('\n=== 7. Certificates Page ===');
  await page.goto(`${FRONTEND}/certificates`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/final-06-certificates.png' });
  const certText = await page.textContent('body');
  console.log('  Has Certificate:', certText.includes('Certificate') ? '✅' : '❌');
  console.log('  ✅ /tmp/final-06-certificates.png');

  // ============ AUDIT PAGE ============
  console.log('\n=== 8. Audit Page ===');
  await page.goto(`${FRONTEND}/audit`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/final-07-audit.png' });
  const auditText = await page.textContent('body');
  console.log('  Has Audit:', auditText.includes('Audit') ? '✅' : '❌');
  console.log('  ✅ /tmp/final-07-audit.png');

  // ============ NAVIGATION CHECK ============
  console.log('\n=== 9. Sidebar Navigation ===');
  const navLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href]');
    return Array.from(links).map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().substring(0, 20) }));
  });
  const expectedPages = ['/', '/verify', '/certificates', '/audit'];
  for (const p of expectedPages) {
    const found = navLinks.find(l => l.href === p);
    console.log(`  ${p}:`, found ? `✅ (${found.text})` : '❌');
  }

  // ============ THEME TOGGLE ============
  console.log('\n=== 10. Theme Toggle ===');
  const themeToggle = await page.$('button:has-text("Dark"), button:has-text("Light")');
  console.log('  Theme toggle:', themeToggle ? '✅' : '❌');

  await browser.close();
  console.log('\n=============================');
  console.log('  ALL TESTS COMPLETE ✅');
  console.log('=============================');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

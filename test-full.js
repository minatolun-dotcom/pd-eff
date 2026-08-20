const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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

  // ============ VERIFY WORKFLOW ============
  console.log('=== 1. Load Verify Page ===');
  await page.goto(`${FRONTEND}/verify`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/test-full-01-verify-empty.png' });
  console.log('  ✅ Screenshot: /tmp/test-full-01-verify-empty.png');

  console.log('\n=== 2. Upload st tribe.pdf ===');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(path.join('/home/khuptong/project/pd-eff', 'st tribe.pdf'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/test-full-02-file-selected.png' });
  console.log('  ✅ Screenshot: /tmp/test-full-02-file-selected.png');

  console.log('\n=== 3. Click Verify ===');
  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: '/tmp/test-full-03-after-verify.png' });
  console.log('  ✅ Screenshot: /tmp/test-full-03-after-verify.png');

  console.log('\n=== 4. Check verification results ===');
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height, hasContent: c.toDataURL().length > 1000 } : null;
  });
  console.log('  Canvas:', canvasInfo);

  const stampInfo = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="cursor-grab"]');
    return Array.from(els).map(e => ({
      text: e.textContent?.substring(0, 80),
      rect: e.getBoundingClientRect(),
      style: e.style.cssText.substring(0, 200)
    }));
  });
  console.log('  Stamp overlays:', stampInfo.length, stampInfo.length > 0 ? '✅' : '❌');
  if (stampInfo.length > 0) {
    console.log('  Stamp text:', stampInfo[0].text?.substring(0, 60));
    console.log('  Stamp rect:', JSON.stringify(stampInfo[0].rect));
  }

  const verificationText = await page.evaluate(() => {
    const body = document.body.textContent || '';
    return {
      hasValid: body.includes('Valid') || body.includes('VALID'),
      hasSignature: body.includes('Signature'),
      hasExport: body.includes('Export'),
      hasDownload: body.includes('Download'),
      hasDHARUN: body.includes('DHARUN'),
    };
  });
  console.log('  Verification text:', verificationText);

  // ============ EXPORT TEST ============
  console.log('\n=== 5. Test Export via API ===');
  const stampResult = execSync(
    `curl -s -X POST "${BACKEND}/api/verify/stamp?stamp_x=300&stamp_y=400&stamp_w=210&stamp_h=80" -F "file=@/home/khuptong/project/pd-eff/st tribe.pdf"`,
    { timeout: 15000 }
  ).toString();
  const stampData = JSON.parse(stampResult);
  console.log('  Stamp API response:', stampData.id ? '✅' : '❌', stampData.filename);

  // Download the stamped PDF
  const downloadUrl = `${BACKEND}${stampData.download_url}`;
  console.log('  Download URL:', downloadUrl);
  execSync(`curl -s -o /tmp/stamped-output.pdf "${downloadUrl}"`, { timeout: 10000 });
  const stampedSize = fs.statSync('/tmp/stamped-output.pdf').size;
  console.log('  Stamped file size:', stampedSize, 'bytes', stampedSize > 10000 ? '✅' : '❌');

  // Check if stamped PDF has verification stamps
  const stampedContent = fs.readFileSync('/tmp/stamped-output.pdf', 'latin1');
  const hasStampText = stampedContent.includes('Signature valid') || stampedContent.includes('Digitally signed by');
  const hasGreenColor = stampedContent.includes('0.13 0.55 0.13');
  console.log('  Has stamp text:', hasStampText ? '✅' : '❌');
  console.log('  Has green checkmark:', hasGreenColor ? '✅' : '❌');

  // ============ EXPORT VIA BROWSER ============
  console.log('\n=== 6. Test Export Button in Browser ===');
  const exportBtn = await page.$('button:has-text("Export")');
  if (exportBtn) {
    console.log('  Export button found ✅');
    await exportBtn.click();
    await page.waitForTimeout(8000);
    
    // After clicking export, it should call the stamp API and show a download link
    const hasDownloadLink = await page.evaluate(() => {
      return !!document.querySelector('a[download]');
    });
    console.log('  Download link appeared:', hasDownloadLink ? '✅' : '❌');
    
    await page.screenshot({ path: '/tmp/test-full-04-after-export-click.png' });
    console.log('  ✅ Screenshot: /tmp/test-full-04-after-export-click.png');
    
    // Try to download via the link
    if (hasDownloadLink) {
      const href = await page.evaluate(() => {
        const a = document.querySelector('a[download]');
        return a?.href || null;
      });
      console.log('  Download href:', href);
      
      if (href) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
          page.evaluate((url) => {
            const a = document.querySelector('a[download]');
            if (a) a.click();
          }, href)
        ]);
        
        if (download) {
          await download.saveAs('/tmp/browser-export.pdf');
          console.log('  Browser export saved:', fs.statSync('/tmp/browser-export.pdf').size, 'bytes ✅');
        }
      }
    }
  } else {
    console.log('  ❌ No export button found');
  }

  // ============ OTHER PAGES ============
  console.log('\n=== 7. Test Other Pages ===');
  for (const [name, url] of [['Sign', '/'], ['Certificates', '/certificates'], ['Audit', '/audit']]) {
    await page.goto(`${FRONTEND}${url}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/test-full-page-${name.toLowerCase()}.png` });
    console.log(`  ${name} page: ✅`);
  }

  await browser.close();
  console.log('\n=== ALL DONE ===');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

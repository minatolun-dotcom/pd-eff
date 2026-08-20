const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('=== Verify st tribe.pdf ===');
  await page.goto('http://localhost:3000/verify');
  await page.waitForTimeout(3000);

  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1500);

  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);

  // Check stamp visibility
  const stampInfo = await page.evaluate(() => {
    const el = document.querySelector('[class*="cursor-grab"]');
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    const container = el.closest('[class*="overflow-hidden"]');
    const containerRect = container ? container.getBoundingClientRect() : null;
    return {
      found: true,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      visible: rect.width > 0 && rect.height > 0,
      inContainer: containerRect ? (
        rect.left >= containerRect.left &&
        rect.right <= containerRect.right &&
        rect.top >= containerRect.top &&
        rect.bottom <= containerRect.bottom
      ) : 'no container',
      containerSize: containerRect ? { w: containerRect.width, h: containerRect.height } : null,
      text: el.textContent?.substring(0, 60),
    };
  });
  console.log('  Stamp:', JSON.stringify(stampInfo, null, 2));

  await page.screenshot({ path: '/tmp/vis-01.png' });
  console.log('  ✅ /tmp/vis-01.png');

  // Test export
  console.log('\n=== Export ===');
  const exportBtn = await page.$('button:has-text("Export")');
  await exportBtn.click();
  await page.waitForTimeout(10000);

  const downloadBtn = await page.$('button:has-text("Download")');
  if (downloadBtn) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      downloadBtn.click()
    ]);
    if (download) {
      await download.saveAs('/tmp/vis-exported.pdf');
      const size = fs.statSync('/tmp/vis-exported.pdf').size;
      console.log(`  Downloaded: ${size} bytes ✅`);
    }
  }

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

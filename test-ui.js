const { chromium } = require('playwright');
const path = require('path');

const BACKEND = 'http://localhost:8000';
const FRONTEND = 'http://localhost:3000';
const PDF_DIR = '/home/khuptong/project/pd-eff';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [BROWSER ERROR]', msg.text());
  });
  page.on('pageerror', err => console.log('  [PAGE ERROR]', err.message));

  console.log('=== 1. Test Verify Page Loads ===');
  await page.goto(`${FRONTEND}/verify`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-01-verify-page.png' });
  console.log('  Screenshot: /tmp/test-01-verify-page.png');

  // Check page elements
  const heading = await page.textContent('h1, h2, [class*="heading"]').catch(() => 'NOT FOUND');
  console.log('  Heading:', heading);

  const uploadArea = await page.$('input[type="file"]');
  console.log('  File input:', uploadArea ? 'FOUND' : 'MISSING');

  console.log('\n=== 2. Upload st tribe.pdf ===');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(path.join(PDF_DIR, 'st tribe.pdf'));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/test-02-file-selected.png' });
    console.log('  Screenshot: /tmp/test-02-file-selected.png');
  } else {
    console.log('  ERROR: No file input found');
  }

  console.log('\n=== 3. Click Verify Button ===');
  const verifyBtn = await page.$('button:has-text("Verify"), button:has-text("verify")');
  if (verifyBtn) {
    await verifyBtn.click();
    console.log('  Clicked Verify');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/test-03-after-verify.png' });
    console.log('  Screenshot: /tmp/test-03-after-verify.png');
  } else {
    console.log('  ERROR: No verify button found');
    // List all buttons
    const buttons = await page.$$eval('button', els => els.map(e => e.textContent.trim()));
    console.log('  Available buttons:', buttons);
  }

  console.log('\n=== 4. Check Verification Results ===');
  const pageText = await page.textContent('body');
  const hasValid = pageText.includes('Valid') || pageText.includes('VALID');
  const hasSignature = pageText.includes('Signature') || pageText.includes('signature');
  const hasExport = pageText.includes('Export');
  console.log('  Has "Valid":', hasValid);
  console.log('  Has "Signature":', hasSignature);
  console.log('  Has "Export":', hasExport);

  // Check for stamp overlay
  const stampElements = await page.$$('.stamp-overlay, [class*="stamp"], [draggable="true"]');
  console.log('  Stamp/draggable elements:', stampElements.length);

  // Check for canvas (pdfjs)
  const canvasElements = await page.$$('canvas');
  console.log('  Canvas elements:', canvasElements.length);

  console.log('\n=== 5. Check PDF Preview ===');
  const previewContainer = await page.$('[class*="preview"], [class*="pdf"], [class*="viewer"]');
  if (previewContainer) {
    const box = await previewContainer.boundingBox();
    console.log('  Preview container:', box ? `${box.width}x${box.height}` : 'no bounding box');
  } else {
    console.log('  No preview container found');
  }

  // Take a full page screenshot
  await page.screenshot({ path: '/tmp/test-04-full-page.png', fullPage: true });
  console.log('  Screenshot: /tmp/test-04-full-page.png');

  console.log('\n=== 6. Click Export ===');
  const exportBtn = await page.$('button:has-text("Export")');
  if (exportBtn) {
    // Set up download handler
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(e => {
        console.log('  Download timeout:', e.message);
        return null;
      }),
      exportBtn.click()
    ]);
    
    if (download) {
      const savePath = path.join('/tmp', 'exported-verified.pdf');
      await download.saveAs(savePath);
      console.log('  Downloaded to:', savePath);
      
      // Check file size
      const fs = require('fs');
      const stat = fs.statSync(savePath);
      console.log('  File size:', stat.size, 'bytes');
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/test-05-after-export.png' });
    console.log('  Screenshot: /tmp/test-05-after-export.png');
  } else {
    console.log('  No export button found');
  }

  console.log('\n=== 7. Verify exported PDF has stamps ===');
  try {
    const fs = require('fs');
    const exportedPath = '/tmp/exported-verified.pdf';
    if (fs.existsSync(exportedPath)) {
      const content = fs.readFileSync(exportedPath, 'latin1');
      const hasStampOps = content.includes('Signature valid') || content.includes('Signature Verified') || content.includes('Digitally signed by');
      const hasCheckmark = content.includes('0.13 0.55 0.13 rg') || content.includes('0.00 0.50 0.00');
      const fileSize = fs.statSync(exportedPath).size;
      console.log('  File size:', fileSize, 'bytes');
      console.log('  Has stamp text:', hasStampOps);
      console.log('  Has green color ops:', hasCheckmark);
    }
  } catch (e) {
    console.log('  Error checking PDF:', e.message);
  }

  console.log('\n=== 8. Test Sign Page ===');
  await page.goto(`${FRONTEND}`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-06-sign-page.png' });
  console.log('  Screenshot: /tmp/test-06-sign-page.png');

  console.log('\n=== 9. Test Certificates Page ===');
  await page.goto(`${FRONTEND}/certificates`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-07-certificates-page.png' });
  console.log('  Screenshot: /tmp/test-07-certificates-page.png');

  console.log('\n=== 10. Test Audit Page ===');
  await page.goto(`${FRONTEND}/audit`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-08-audit-page.png' });
  console.log('  Screenshot: /tmp/test-08-audit-page.png');

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

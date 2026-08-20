const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FRONTEND = 'http://localhost:3000';
const BACKEND = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Capture ALL console messages
  page.on('console', msg => console.log(`  [CONSOLE ${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.log('  [PAGE ERROR]', err.message));

  console.log('=== 1. Load Verify Page ===');
  await page.goto(`${FRONTEND}/verify`);
  await page.waitForTimeout(3000);

  console.log('\n=== 2. Upload st tribe.pdf ===');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles(path.join('/home/khuptong/project/pd-eff', 'st tribe.pdf'));
  await page.waitForTimeout(1000);

  console.log('\n=== 3. Click Verify ===');
  const verifyBtn = await page.$('button:has-text("Verify")');
  if (verifyBtn) {
    await verifyBtn.click();
    // Wait longer for verification
    await page.waitForTimeout(8000);
  }

  // Take screenshot after verification
  await page.screenshot({ path: '/tmp/debug-after-verify.png' });

  // Debug: Check what's on the page
  console.log('\n=== 4. Debug Page State ===');
  const canvases = await page.$$('canvas');
  console.log('  Canvas count:', canvases.length);
  
  // Check for stamp overlay - look for absolute positioned divs
  const absDivs = await page.$$eval('div[style*="absolute"]', els => 
    els.map(e => ({
      className: e.className,
      style: e.style.cssText.substring(0, 200),
      text: e.textContent?.substring(0, 100)
    }))
  );
  console.log('  Absolute divs:', JSON.stringify(absDivs, null, 2));

  // Check body text
  const bodyText = await page.textContent('body');
  const relevantText = bodyText.replace(/\s+/g, ' ').substring(0, 500);
  console.log('  Page text:', relevantText);

  // Check if the stamp is in the DOM
  const stampHtml = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="stamp"], [class*="cursor-grab"]');
    return Array.from(els).map(e => e.outerHTML.substring(0, 200));
  });
  console.log('  Stamp elements:', stampHtml);

  // Check if pdfjs rendered successfully
  const canvasInfo = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return Array.from(canvases).map(c => ({
      width: c.width,
      height: c.height,
      clientWidth: c.clientWidth,
      clientHeight: c.clientHeight,
      hasContent: c.toDataURL().length > 1000
    }));
  });
  console.log('  Canvas info:', JSON.stringify(canvasInfo, null, 2));

  // Check left panel visibility
  const leftPanel = await page.evaluate(() => {
    const panel = document.querySelector('.w-\\[380px\\]');
    return panel ? {
      visible: panel.clientWidth > 0,
      width: panel.clientWidth,
      height: panel.clientHeight,
      text: panel.textContent?.substring(0, 200)
    } : 'NOT FOUND';
  });
  console.log('  Left panel:', JSON.stringify(leftPanel, null, 2));

  // Check right panel (PDF preview area)
  const rightPanel = await page.evaluate(() => {
    // Find the flex-1 container next to the 380px panel
    const panels = document.querySelectorAll('.flex-1');
    return Array.from(panels).map(p => ({
      width: p.clientWidth,
      height: p.clientHeight,
      childCount: p.children.length,
      className: p.className
    }));
  });
  console.log('  Right panels:', JSON.stringify(rightPanel, null, 2));

  console.log('\n=== 5. Test Export via API directly ===');
  // Test stamp API
  const stampRes = await page.evaluate(async () => {
    const fileInput = document.querySelector('input[type="file"]');
    const form = new FormData();
    // Use the uploaded file from memory - we need to re-upload
    return 'need to upload via API';
  });

  // Test export via backend API
  const curlTest = await new Promise((resolve) => {
    const { execSync } = require('child_process');
    try {
      const result = execSync(
        `curl -s -X POST "${BACKEND}/api/verify/stamp?stamp_x=300&stamp_y=400&stamp_w=210&stamp_h=80" -F "file=@/home/khuptong/project/pd-eff/st tribe.pdf"`,
        { timeout: 15000 }
      );
      resolve(result.toString());
    } catch (e) {
      resolve(e.stderr?.toString() || e.message);
    }
  });
  console.log('  Stamp API result:', curlTest.substring(0, 200));

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

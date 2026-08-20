const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('=== 1. Auto-verify on upload ===');
  await page.goto('http://localhost:3000/verify');
  await page.waitForTimeout(2000);

  // Upload file
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1000);
  console.log('  File uploaded');

  // Check that verification starts automatically (loading state or results)
  await page.waitForTimeout(10000);

  // Check results appeared
  const hasResults = await page.evaluate(() => {
    return document.body.textContent?.includes('All Signatures Valid') || 
           document.body.textContent?.includes('Untrusted') ||
           document.body.textContent?.includes('Invalid');
  });
  console.log('  Auto-verified:', hasResults ? '✅ Results appeared' : '❌ No results');

  // Check if the verify button was NOT clicked (should be auto)
  const verifyBtnExists = await page.$('button:has-text("Verify Signatures")');
  console.log('  Verify button still visible:', verifyBtnExists ? '⚠️ Button exists (may not have auto-verified)' : '✅ Button hidden (auto-verified)');

  await page.screenshot({ path: '/tmp/auto-01.png' });
  console.log('  Screenshot: /tmp/auto-01.png');

  console.log('\n=== 2. Canvas stamp replacement ===');
  // Check canvas has the old stamp painted over
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Sample pixels at the widget area (approximately where the old stamp was)
    // Widget is at PDF coords [395, 100, 575, 130]
    // Canvas scale = 552/595 ≈ 0.928
    const scale = canvas.width / 595;
    const widgetTop = (970 - 130) * scale; // top of widget in canvas coords
    const widgetLeft = 395 * scale;
    
    // Sample center of widget area
    const centerX = widgetLeft + (575 - 395) * scale / 2;
    const centerY = widgetTop + (130 - 100) * scale / 2;
    
    const pixel = ctx.getImageData(Math.floor(centerX), Math.floor(centerY), 1, 1).data;
    
    return {
      canvasSize: { w: canvas.width, h: canvas.height },
      widgetArea: { x: Math.floor(widgetLeft), y: Math.floor(widgetTop) },
      centerPixel: { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] },
      isWhite: pixel[0] > 240 && pixel[1] > 240 && pixel[2] > 240,
      note: 'If white, old stamp was painted over'
    };
  });
  console.log('  Canvas info:', JSON.stringify(canvasInfo, null, 2));

  // Take a zoomed screenshot of the widget area
  await page.screenshot({ path: '/tmp/auto-02-canvas.png', clip: { x: 604, y: 0, width: 796, height: 900 } });
  console.log('  Screenshot: /tmp/auto-02-canvas.png');

  // Check if "Signature valid" text is drawn on canvas
  // We can't read text from canvas directly, but we can check if the pixel colors
  // in the widget area match what we'd expect from the overlay
  const overlayCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    const scale = canvas.width / 595;
    const widgetTop = (970 - 130) * scale;
    const widgetLeft = 395 * scale;
    const widgetW = (575 - 395) * scale;
    const widgetH = (130 - 100) * scale;
    
    // Sample a strip of pixels across the widget area
    const samples = [];
    for (let x = widgetLeft; x < widgetLeft + widgetW; x += 10) {
      const pixel = ctx.getImageData(Math.floor(x), Math.floor(widgetTop + widgetH / 2), 1, 1).data;
      samples.push({ x: Math.floor(x), r: pixel[0], g: pixel[1], b: pixel[2] });
    }
    
    // Count white vs non-white pixels
    const whiteCount = samples.filter(s => s.r > 240 && s.g > 240 && s.b > 240).length;
    const darkCount = samples.filter(s => s.r < 100 && s.g < 100 && s.b < 100).length;
    
    return {
      totalSamples: samples.length,
      whitePixels: whiteCount,
      darkPixels: darkCount,
      allWhite: whiteCount === samples.length,
      hasDarkText: darkCount > 0,
    };
  });
  console.log('  Overlay check:', JSON.stringify(overlayCheck));

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

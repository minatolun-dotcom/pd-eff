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

  // Check stamp position
  const stampInfo = await page.evaluate(() => {
    const el = document.querySelector('[class*="cursor-grab"]');
    if (!el) return null;
    return {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
      text: el.textContent?.substring(0, 80),
    };
  });
  console.log('  Stamp position:', stampInfo);

  // Check canvas info
  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
  console.log('  Canvas:', canvasInfo);

  // Take screenshot
  await page.screenshot({ path: '/tmp/stamp-pos-01.png' });
  console.log('  ✅ /tmp/stamp-pos-01.png');

  // Export and check the stamped PDF
  console.log('\n=== Export ===');
  const exportBtn = await page.$('button:has-text("Export")');
  await exportBtn.click();
  await page.waitForTimeout(10000);

  const downloadBtn = await page.$('button:has-text("Download")');
  console.log('  Download button:', downloadBtn ? '✅' : '❌');

  if (downloadBtn) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      downloadBtn.click()
    ]);

    if (download) {
      await download.saveAs('/tmp/stamp-pos-exported.pdf');
      const size = fs.statSync('/tmp/stamp-pos-exported.pdf').size;
      console.log(`  Downloaded: ${size} bytes ✅`);

      // Check the stamped PDF content
      const pikepdf = require('/home/khuptong/project/pd-eff/pdf-signer-app/backend/venv/lib/python3.11/site-packages/pikepdf');
      const pdf = pikepdf.open('/tmp/stamp-pos-exported.pdf');
      const page = pdf.pages[0];
      const content = page.get('/Contents');
      let data;
      if (content instanceof pikepdf.Stream) {
        data = content.read_bytes().decode('latin-1');
      } else if (content instanceof pikepdf.Array) {
        data = '';
        for (const item of content) {
          if (item instanceof pikepdf.Stream) {
            data += item.read_bytes().decode('latin-1') + '\n';
          }
        }
      }

      // Find stamp content
      const stampMatch = data.match(/Signature valid.*?Location:.*?\)/s);
      if (stampMatch) {
        console.log('\n  Stamp content found:');
        console.log('  ' + stampMatch[0].substring(0, 200));
      }

      // Find the stamp position from the cm translation
      const cmMatch = data.match(/q 1 0 0 1 ([\d.]+) ([\d.]+) cm/);
      if (cmMatch) {
        const sx = parseFloat(cmMatch[1]);
        const sy = parseFloat(cmMatch[2]);
        console.log(`\n  Stamp placed at PDF coords: (${sx}, ${sy})`);
        console.log(`  Widget is at: (395, 100) to (575, 130)`);
        console.log(`  Stamp bottom: y=${sy}, Widget bottom: y=100`);
        if (sy + 80 < 100) {
          console.log('  ✅ Stamp is BELOW the widget (no overlap)');
        } else if (sy > 130) {
          console.log('  ✅ Stamp is ABOVE the widget (no overlap)');
        } else {
          console.log('  ⚠️  Stamp may overlap with widget area');
        }
      }

      pdf.close();
    }
  }

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

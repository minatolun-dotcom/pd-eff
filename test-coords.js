const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://localhost:3000/verify');
  await page.waitForTimeout(3000);

  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1500);

  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);

  // Get ALL coordinate data
  const data = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const stamp = document.querySelector('[class*="cursor-grab"]');
    const container = canvas?.closest('[class*="overflow-hidden"]');
    if (!canvas || !stamp || !container) return { error: 'elements not found' };

    const canvasRect = canvas.getBoundingClientRect();
    const stampRect = stamp.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return {
      canvas: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      stamp: { left: stampRect.left, top: stampRect.top, width: stampRect.width, height: stampRect.height },
      container: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
      stampStyle: { left: stamp.style.left, top: stamp.style.top, width: stamp.style.width, height: stamp.style.height },
    };
  });
  console.log('=== Coordinate Debug ===');
  console.log(JSON.stringify(data, null, 2));

  // Export
  const exportBtn = await page.$('button:has-text("Export")');
  await exportBtn.click();
  await page.waitForTimeout(10000);
  const dlBtn = await page.$('button:has-text("Download")');
  if (dlBtn) {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      dlBtn.click()
    ]);
    if (dl) {
      await dl.saveAs('/tmp/coord-export.pdf');
      // Get stamp position from exported PDF
      const pos = execSync(
        `cd /home/khuptong/project/pd-eff/pdf-signer-app/backend && ./venv/bin/python3 -c "
import pikepdf, re
pdf = pikepdf.open('/tmp/coord-export.pdf')
page = pdf.pages[0]
c = page.get('/Contents')
data = c.read_bytes().decode('latin-1') if isinstance(c, pikepdf.Stream) else ''
for item in (c if isinstance(c, pikepdf.Array) else []):
    if isinstance(item, pikepdf.Stream):
        data += item.read_bytes().decode('latin-1')
m = re.search(r'q 1 0 0 1 ([\\\\d\\.]+) ([\\\\d\\.]+) cm', data)
if m:
    print(f'BACKEND_STAMP: x={float(m.group(1)):.2f} y={float(m.group(2)):.2f}')
else:
    print('BACKEND_STAMP: NOT_FOUND')
pdf.close()
"`,
        { timeout: 10000 }
      ).toString().trim();
      console.log('\n' + pos);
    }
  }

  // Compute what the overlay position SHOULD be vs what it IS
  console.log('\n=== Analysis ===');
  const canvasTop = data.canvas?.top;
  const stampTop = data.stamp?.top;
  const stampStyleTop = parseFloat(data.stampStyle?.top);
  const stampH = parseFloat(data.stampStyle?.height);
  console.log(`Canvas top: ${canvasTop}`);
  console.log(`Stamp div top (CSS): ${stampStyleTop}`);
  console.log(`Stamp div height: ${stampH}`);
  console.log(`Stamp div bottom: ${stampStyleTop + stampH}`);
  
  // The stamp overlay top should align with the TOP of the stamp area in screen coords
  // But currently it aligns with the BOTTOM (because pdfToScreen gives bottom-left)
  console.log(`\nThe overlay top=${stampStyleTop} is at the BOTTOM of the stamp area.`);
  console.log(`The overlay SHOULD be at top=${stampStyleTop - stampH} to show stamp content correctly.`);
  console.log(`Mismatch = ${stampH}px (stamp height)`);

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

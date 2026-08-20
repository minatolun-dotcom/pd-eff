const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('=== 1. Verify st tribe.pdf ===');
  await page.goto('http://localhost:3000/verify');
  await page.waitForTimeout(3000);

  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1500);

  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);

  // Check initial stamp position
  const pos1 = await page.evaluate(() => {
    const el = document.querySelector('[class*="cursor-grab"]');
    return el ? { left: el.style.left, top: el.style.top, w: el.style.width, h: el.style.height } : null;
  });
  console.log('  Initial stamp pos:', pos1);

  // Export with initial position
  console.log('\n=== 2. Export with initial position ===');
  const exportBtn1 = await page.$('button:has-text("Export")');
  await exportBtn1.click();
  await page.waitForTimeout(10000);

  const dlBtn1 = await page.$('button:has-text("Download")');
  if (dlBtn1) {
    const [dl1] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      dlBtn1.click()
    ]);
    if (dl1) {
      await dl1.saveAs('/tmp/reexport-1.pdf');
      console.log('  Downloaded:', fs.statSync('/tmp/reexport-1.pdf').size, 'bytes');
    }
  }

  // Now drag the stamp to a different position
  console.log('\n=== 3. Drag stamp to different position ===');
  const stamp = await page.$('[class*="cursor-grab"]');
  if (stamp) {
    const box = await stamp.boundingBox();
    console.log('  Stamp at:', box);
    
    // Drag stamp 200px to the right and 100px up
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 - 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const pos2 = await page.evaluate(() => {
      const el = document.querySelector('[class*="cursor-grab"]');
      return el ? { left: el.style.left, top: el.style.top, w: el.style.width, h: el.style.height } : null;
    });
    console.log('  After drag stamp pos:', pos2);
    console.log('  Position changed:', JSON.stringify(pos1) !== JSON.stringify(pos2) ? '✅ YES' : '❌ NO (same position)');
  }

  // Re-export with new position
  console.log('\n=== 4. Re-export with new position ===');
  const reExportBtn = await page.$('button:has-text("Re-Export")');
  if (reExportBtn) {
    await reExportBtn.click();
    await page.waitForTimeout(10000);

    const dlBtn2 = await page.$('button:has-text("Download")');
    if (dlBtn2) {
      const [dl2] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        dlBtn2.click()
      ]);
      if (dl2) {
        await dl2.saveAs('/tmp/reexport-2.pdf');
        const size2 = fs.statSync('/tmp/reexport-2.pdf').size;
        console.log('  Downloaded:', size2, 'bytes');
        
        // Compare with first export
        const size1 = fs.statSync('/tmp/reexport-1.pdf').size;
        console.log('  File 1 size:', size1, 'File 2 size:', size2);
        console.log('  Files different:', size1 !== size2 ? '✅ YES' : '⚠️ Same size (checking content...)');
        
        // Check stamp positions in both files
        const checkStamp = (path) => {
          const result = execSync(
            `cd /home/khuptong/project/pd-eff/pdf-signer-app/backend && ./venv/bin/python3 -c "
import pikepdf, re
pdf = pikepdf.open('${path}')
page = pdf.pages[0]
content = page.get('/Contents')
if isinstance(content, pikepdf.Stream):
    data = content.read_bytes().decode('latin-1')
elif isinstance(content, pikepdf.Array):
    data = ''
    for item in content:
        if isinstance(item, pikepdf.Stream):
            data += item.read_bytes().decode('latin-1') + '\\n'
m = re.search(r'q 1 0 0 1 ([\\\\d\\.]+) ([\\\\d\\.]+) cm', data)
if m:
    print(f'{float(m.group(1)):.0f},{float(m.group(2)):.0f}')
else:
    print('NO_STAMP')
pdf.close()
"`,
            { timeout: 10000 }
          ).toString().trim();
          return result;
        };
        
        const pos1_str = checkStamp('/tmp/reexport-1.pdf');
        const pos2_str = checkStamp('/tmp/reexport-2.pdf');
        console.log('  Export 1 stamp pos:', pos1_str);
        console.log('  Export 2 stamp pos:', pos2_str);
        console.log('  Stamp position changed:', pos1_str !== pos2_str ? '✅ YES — export reflects new position!' : '❌ NO — still same position');
      }
    }
  } else {
    console.log('  ❌ No Re-Export button found');
    const buttons = await page.$$eval('button', els => els.map(e => e.textContent?.trim().substring(0, 30)));
    console.log('  Available buttons:', buttons);
  }

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

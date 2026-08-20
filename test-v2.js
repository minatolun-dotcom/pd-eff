const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('=== Full browser workflow ===');
  
  // 1. Verify st tribe.pdf
  await page.goto('http://localhost:3000/verify');
  await page.waitForTimeout(3000);
  
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1500);
  
  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);
  
  await page.screenshot({ path: '/tmp/final-v2-01-verify.png' });
  console.log('  ✅ Verify result');
  
  // 2. Click export
  const exportBtn = await page.$('button:has-text("Export")');
  if (exportBtn) {
    await exportBtn.click();
    await page.waitForTimeout(10000);
    
    await page.screenshot({ path: '/tmp/final-v2-02-after-export.png' });
    
    const downloadBtn = await page.$('button:has-text("Download")');
    console.log('  Download button:', downloadBtn ? '✅' : '❌');
    
    if (downloadBtn) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        downloadBtn.click()
      ]);
      
      if (download) {
        await download.saveAs('/tmp/final-exported.pdf');
        const size = fs.statSync('/tmp/final-exported.pdf').size;
        console.log(`  ✅ Downloaded: ${size} bytes`);
        
        // Open the exported PDF in a new tab to verify stamps render
        const page2 = await browser.newPage({ viewport: { width: 800, height: 1100 } });
        await page2.goto(`http://localhost:3000/verify`);
        await page2.waitForTimeout(2000);
        
        // Use file:// to open the PDF in Chrome's viewer
        await page2.goto(`file:///tmp/final-exported.pdf`);
        await page2.waitForTimeout(5000);
        await page2.screenshot({ path: '/tmp/final-v2-03-exported-pdf.png' });
        console.log('  ✅ Exported PDF screenshot');
        await page2.close();
      }
    }
  }
  
  // 3. Test all other pages
  console.log('\n=== Other pages ===');
  for (const [name, url] of [['Sign', '/'], ['Certificates', '/certificates'], ['Audit', '/audit']]) {
    await page.goto(`http://localhost:3000${url}`);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `/tmp/final-v2-page-${name.toLowerCase()}.png` });
    console.log(`  ✅ ${name} page`);
  }
  
  await browser.close();
  console.log('\n=== ALL DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });

  // Create an HTML page that renders the PDF with pdfjs
  const html = `
<!DOCTYPE html>
<html><head><style>
body { margin: 0; padding: 0; background: #333; display: flex; justify-content: center; }
canvas { box-shadow: 0 4px 20px rgba(0,0,0,0.5); margin: 20px; }
</style></head><body>
<canvas id="pdf-canvas"></canvas>
<script src="/pdf.worker.min.js"></script>
<script>
window.renderPdf = async function(base64Data) {
  const pdfjsLib = await import('/pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  
  const canvas = document.getElementById('pdf-canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  
  return 'rendered';
};
</script></body></html>`;

  // Save HTML
  fs.writeFileSync('/tmp/render-pdf.html', html);

  // Test 1: Render the original PDF
  console.log('=== Rendering original st tribe.pdf ===');
  await page.goto('file:///tmp/render-pdf.html');
  await page.waitForTimeout(1000);
  
  const originalData = fs.readFileSync('/home/khuptong/project/pd-eff/st tribe.pdf').toString('base64');
  await page.evaluate((data) => window.renderPdf(data), originalData);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/render-original.png' });
  console.log('  ✅ /tmp/render-original.png');

  // Test 2: Render the stamped PDF
  console.log('\n=== Rendering stamped PDF ===');
  const stampedPath = '/home/khuptong/project/pd-eff/pdf-signer-app/backend/data/signed/verified_9d769d65_st tribe.pdf';
  if (fs.existsSync(stampedPath)) {
    const stampedData = fs.readFileSync(stampedPath).toString('base64');
    await page.evaluate((data) => window.renderPdf(data), stampedData);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/render-stamped.png' });
    console.log('  ✅ /tmp/render-stamped.png');
  } else {
    console.log('  ❌ Stamped file not found');
  }

  // Test 3: Full browser workflow - verify and export via the app
  console.log('\n=== Full browser workflow ===');
  const frontend = 'http://localhost:3000';
  await page.setViewportSize({ width: 1400, height: 900 });
  
  await page.goto(`${frontend}/verify`);
  await page.waitForTimeout(3000);
  
  const fileInput = await page.$('input[type="file"]');
  await fileInput.setInputFiles('/home/khuptong/project/pd-eff/st tribe.pdf');
  await page.waitForTimeout(1500);
  
  const verifyBtn = await page.$('button:has-text("Verify")');
  await verifyBtn.click();
  await page.waitForTimeout(8000);
  
  await page.screenshot({ path: '/tmp/render-verify-result.png' });
  console.log('  ✅ Verify result screenshot');
  
  // Click export
  const exportBtn = await page.$('button:has-text("Export")');
  if (exportBtn) {
    await exportBtn.click();
    await page.waitForTimeout(10000);
    
    // Check if download button appeared
    const downloadBtn = await page.$('button:has-text("Download")');
    console.log('  Download button:', downloadBtn ? '✅' : '❌');
    
    if (downloadBtn) {
      // Download and save
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
        downloadBtn.click()
      ]);
      
      if (download) {
        await download.saveAs('/tmp/browser-exported-final.pdf');
        console.log('  ✅ Downloaded to /tmp/browser-exported-final.pdf');
        
        // Render the exported PDF
        const exportedData = fs.readFileSync('/tmp/browser-exported-final.pdf').toString('base64');
        await page.evaluate((data) => window.renderPdf(data), exportedData);
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/tmp/render-exported-final.png' });
        console.log('  ✅ Rendered exported PDF: /tmp/render-exported-final.png');
        
        // Compare file sizes
        const origSize = fs.statSync('/home/khuptong/project/pd-eff/st tribe.pdf').size;
        const exportSize = fs.statSync('/tmp/browser-exported-final.pdf').size;
        console.log(`  Original: ${origSize} bytes, Exported: ${exportSize} bytes, Diff: ${exportSize - origSize} bytes`);
      }
    }
  }

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

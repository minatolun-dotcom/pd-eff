/**
 * Test auto-updater independently
 */

const https = require('https');

const GITHUB_REPO = 'minatolun-dotcom/pdf-eff';
const CURRENT_VERSION = '1.0.0';

function isNewerVersion(newVersion, currentVersion) {
  const newParts = newVersion.split('.').map(Number);
  const currentParts = currentVersion.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((newParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((newParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

console.log('Testing auto-updater...\n');
console.log(`Current version: ${CURRENT_VERSION}`);
console.log(`Checking GitHub: ${GITHUB_REPO}\n`);

const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

https.get(url, { headers: { 'User-Agent': 'pd-eff-updater' } }, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const release = JSON.parse(data);
      const latestVersion = release.tag_name?.replace('v', '') || '0.0.0';

      console.log(`Latest version: ${latestVersion}`);
      console.log(`Release URL: ${release.html_url}`);
      console.log(`Published: ${release.published_at}`);
      console.log(`Assets: ${release.assets?.length || 0}`);

      if (release.assets) {
        release.assets.forEach(asset => {
          console.log(`  - ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)}MB)`);
        });
      }

      const hasUpdate = isNewerVersion(latestVersion, CURRENT_VERSION);
      console.log(`\nUpdate available: ${hasUpdate ? 'YES' : 'NO (current)'}`);

      if (release.body) {
        console.log(`\nRelease notes:\n${release.body.substring(0, 500)}`);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw:', data.substring(0, 200));
    }
  });
}).on('error', (e) => {
  console.log('Network error:', e.message);
});

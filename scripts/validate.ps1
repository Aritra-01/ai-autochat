$ErrorActionPreference = "Stop"

node --check background.js
node --check shared/config.js
node --check content/content.js
node --check popup/popup.js
node --check docs/landing.js

node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('manifest.json','utf8')); if(m.manifest_version!==3) throw new Error('Manifest V3 required'); console.log('manifest ok', m.version)"

if (-not (Test-Path 'docs/assets/preview.gif')) { throw 'docs/assets/preview.gif is missing' }
if (-not (Test-Path 'docs/assets/banner.png')) { throw 'docs/assets/banner.png is missing' }

Write-Host 'Validation passed.'

const http = require('http');
const fs = require('fs');
const path = require('path');

async function getCDPTarget() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const targets = JSON.parse(data);
        const page = targets.find(t => t.type === 'page');
        resolve(page);
      });
    }).on('error', reject);
  });
}

async function testMobileViewport(page, width, height, filename) {
  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  await new Promise(res => ws.on('open', res));
  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const currentId = id++;
    const handler = (msg) => {
      const response = JSON.parse(msg);
      if (response.id === currentId) {
        ws.removeListener('message', handler);
        res(response.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: currentId, method, params }));
  });

  await send('Emulation.setDeviceMetricsOverride', {
    width: width,
    height: height,
    deviceScaleFactor: 2,
    mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:8080/' });
  await new Promise(r => setTimeout(r, 2000));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const outPath = path.join(__dirname, '..', filename);
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved screenshot: ${filename} (${width}x${height})`);

  ws.close();
}

async function main() {
  const page = await getCDPTarget();
  if (!page) {
    console.error('No CDP target page found!');
    return;
  }
  await testMobileViewport(page, 430, 932, 'iphone_14_promax.png');
  await testMobileViewport(page, 414, 896, 'iphone_xr.png');
  await testMobileViewport(page, 375, 667, 'iphone_se.png');
}

main().catch(console.error);

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

async function main() {
  const page = await getCDPTarget();
  if (!page) {
    console.error('No CDP target page found!');
    return;
  }

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
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  await send('Page.navigate', { url: 'http://localhost:8080/' });
  console.log('Navigated to page, waiting for frames to load...');
  await new Promise(r => setTimeout(r, 4500));

  // Scrub through the hero frame sequence to unlock scrolling
  for (let i = 0; i < 40; i++) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 500,
      y: 500,
      deltaX: 0,
      deltaY: 400
    });
    await new Promise(r => setTimeout(r, 40));
  }

  await new Promise(r => setTimeout(r, 1000));

  // Scroll down to #overview
  await send('Runtime.evaluate', {
    expression: "document.getElementById('overview').scrollIntoView({ behavior: 'instant' });"
  });

  await new Promise(r => setTimeout(r, 1500));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const outPath = path.join(__dirname, '..', 'section1_brochure_redesign.png');
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Saved screenshot: section1_brochure_redesign.png`);

  ws.close();
}

main().catch(console.error);

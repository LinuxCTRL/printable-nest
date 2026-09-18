const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = '/usr/bin/google-chrome';
const JSON_FILE = path.join(__dirname, 'printable.json');
const OUT_ROOT = path.join(__dirname, 'pdfs');
const LOG_FILE = path.join(__dirname, 'failed.txt');

const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const RESUME = process.env.RESUME !== '0';

function sanitize(name) {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}

function safeSubject(subject) {
  const map = {
    'Math & Numbers': 'math',
    'General Worksheets': 'general',
    'Reading & ELA': 'reading',
    'Life Skills & Geography': 'life-skills',
  };
  return map[subject] || sanitize(subject).toLowerCase();
}

async function renderToPdf(page, topic) {
  const subjDir = path.join(OUT_ROOT, safeSubject(topic.subject));
  const outFile = path.join(subjDir, `${topic.slug}.pdf`);
  fs.mkdirSync(subjDir, { recursive: true });

  if (RESUME && fs.existsSync(outFile) && fs.statSync(outFile).size > 5000) {
    return { status: 'skipped', file: outFile };
  }

  await page.goto(topic.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.worksheet-preview', { timeout: 20000 });

  await page.evaluate(() => {
    const preview = document.querySelector('.worksheet-preview');
    if (!preview) return;
    const clone = preview.cloneNode(true);
    document.body.innerHTML = '';
    document.body.appendChild(clone);
  });

  await page.addStyleTag({
    content: `
      @media print {
        @page { size: Letter; margin: 0; }
        body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .worksheet-preview {
          margin: 0 !important; padding: 0 !important;
          border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
          width: 100% !important;
        }
        .worksheet-preview .paper { width: 100% !important; }
      }
    `,
  });

  await page.pdf({
    path: outFile,
    format: 'Letter',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  return { status: 'ok', file: outFile };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  let topics = data.topics;
  if (LIMIT) topics = topics.slice(0, LIMIT);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const pool = [];
  let idx = 0;
  const results = { ok: 0, skipped: 0, failed: [] };
  const start = Date.now();

  const worker = async () => {
    while (idx < topics.length) {
      const i = idx++;
      const topic = topics[i];
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 900 });
      try {
        const r = await renderToPdf(page, topic);
        results[r.status] = (results[r.status] || 0) + 1;
        if (r.status === 'ok') {
          console.log(`[${results.ok}] ${topic.slug}`);
        }
      } catch (err) {
        results.failed.push(`${topic.url}\t${(err && err.message || err).split('\n')[0]}`);
        console.error(`FAIL ${topic.slug}: ${String(err.message || err).split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
  };

  for (let w = 0; w < CONCURRENCY; w++) pool.push(worker());
  await Promise.all(pool);
  await browser.close();

  fs.writeFileSync(LOG_FILE, results.failed.join('\n') + '\n');

  const secs = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`\nDone in ${secs}s. ok=${results.ok} skipped=${results.skipped} failed=${results.failed.length}`);
  if (results.failed.length) console.log(`Failures logged in ${LOG_FILE}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
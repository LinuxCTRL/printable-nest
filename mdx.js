const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const TurndownService = require('turndown');

const CHROME = '/usr/bin/google-chrome';
const JSON_FILE = path.join(__dirname, 'printable.json');
const OUT_ROOT = path.join(__dirname, 'mdx');
const LOG_FILE = path.join(__dirname, 'mdx-failed.txt');

const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const RESUME = process.env.RESUME !== '0';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
td.addRule('strikethrough', {
  filter: 's',
  replacement: (content) => `~~${content}~~`,
});

function sanitize(name) {
  return name.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}

const SUBJECT_DIR = {
  'Math & Numbers': 'math',
  'General Worksheets': 'general',
  'Reading & ELA': 'reading',
  'Life Skills & Geography': 'life-skills',
};

function subjectDir(subject) {
  return SUBJECT_DIR[subject] || sanitize(subject).toLowerCase();
}

function yamlStr(v) {
  if (v == null) return '""';
  const s = String(v);
  return JSON.stringify(s);
}

function frontmatter(fields) {
  const lines = Object.keys(fields).map((k) => {
    const v = fields[k];
    if (Array.isArray(v)) {
      return `${k}:\n${v.map((x) => `  - ${JSON.stringify(String(x))}`).join('\n')}`;
    }
    return `${k}: ${yamlStr(v)}`;
  });
  return `---\n${lines.join('\n')}\n---\n`;
}

async function extractPage(page) {
  return page.evaluate(() => {
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const crumbs = [...document.querySelectorAll('.crumbs a, .crumbs span')]
      .map(txt)
      .join(' · ');
    const ket = txt(document.querySelector('.kicker'));
    const title = txt(document.querySelector('h1'));
    const tags = [...document.querySelectorAll('.worksheet-meta-row .tag, .tag-row .tag')].map(txt);
    const lead = txt(document.querySelector('.worksheet-head .lead'));
    const prose = document.querySelector('.prose') ? document.querySelector('.prose').innerHTML : '';
    const objectives = [...document.querySelectorAll('.objectives ul li')].map(txt);
    const meta = {};
    document.querySelectorAll('.meta-box dl > div').forEach((row) => {
      const dt = txt(row.querySelector('dt'));
      const dd = txt(row.querySelector('dd'));
      if (dt && dd) meta[dt] = dd;
    });
    const links = {};
    document.querySelectorAll('a').forEach((a) => {
      const t = txt(a);
      const h = a.getAttribute('href') || '';
      if (/answer-key/.test(h)) links.answerKey = h;
      else if (/javascript:window\.print\(\)/.test(h)) links.download = h;
    });
    return { crumbs, ket, title, tags, lead, prose, objectives, meta, links };
  });
}

function buildMdx(data, entry) {
  const md = td.turndown(data.prose || '');

  const fields = {
    title: entry.title || data.title,
    slug: entry.slug,
    subject: entry.subject,
    grade: data.meta['Grade level'] || data.tags.join(', ') || '',
    difficulty: data.meta['Difficulty'] || '',
    ccss: data.meta['Common Core standard'] || '',
    format: data.meta['Format'] || '',
    gradeBand: data.meta['Grade band'] || '',
    lead: data.lead || '',
    urlWorksheet: entry.url,
    urlAnswerKey: data.links.answerKey ? `https://printablenest.com${data.links.answerKey}` : '',
    pdfPath: `./pdfs/${subjectDir(entry.subject)}/${entry.slug}.pdf`,
  };

  const objectivesMd = data.objectives.length
    ? data.objectives.map((o) => `- ${o}`).join('\n')
    : '';

  let body = fields.lead ? `\n${fields.lead}\n` : '\n';
  if (objectivesMd) body += `## Learning objectives\n\n${objectivesMd}\n\n`;
  if (Object.keys(data.meta).length) {
    body += '## Worksheet details\n\n';
    body += '| Field | Value |\n| --- | --- |\n';
    Object.entries(data.meta).forEach(([k, v]) => {
      body += `| ${k} | ${v.replace(/\|/g, '\\|')} |\n`;
    });
    body += '\n';
  }
  if (md) body += `${md}\n`;

  return `${frontmatter(fields)}${body}`;
}

const progress = { idx: 0 };

async function worker(browser) {
  while (true) {
    const i = progress.idx++;
    const entry = TOPICS[i];
    if (!entry) return;

    const dir = path.join(OUT_ROOT, subjectDir(entry.subject));
    const outFile = path.join(dir, `${entry.slug}.mdx`);
    fs.mkdirSync(dir, { recursive: true });

    if (RESUME && fs.existsSync(outFile) && fs.statSync(outFile).size > 200) {
      console.log(`[skip] ${entry.slug}`);
      continue;
    }

    const page = await browser.newPage();
    try {
      await page.goto(entry.url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('.prose, .worksheet-head .lead', { timeout: 20000 });
      const data = await extractPage(page);
      const content = buildMdx(data, entry);
      fs.writeFileSync(outFile, content);
      console.log(`[ok] ${entry.slug}`);
    } catch (err) {
      const msg = `${entry.url}\t${String(err.message || err).split('\n')[0]}`;
      fs.appendFileSync(LOG_FILE, msg + '\n');
      console.error(`[FAIL] ${entry.slug}: ${String(err.message || err).split('\n')[0]}`);
      if (fs.existsSync(outFile)) fs.rmSync(outFile);
      try { await page.close(); } catch {}
    }
    await page.close();
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  TOPICS = data.topics;
  if (LIMIT) TOPICS = TOPICS.slice(0, LIMIT);
  fs.rmSync(LOG_FILE, { force: true });
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const start = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker(browser));
  await Promise.all(workers);

  await browser.close();
  const secs = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`Done in ${secs}s. files in ${OUT_ROOT}`);
}

let TOPICS = [];
main().catch((err) => { console.error(err); process.exit(1); });

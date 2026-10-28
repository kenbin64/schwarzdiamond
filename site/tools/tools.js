// The working tools on schwarzdiamond.com. Each module in the sidebar opens its tool here. They run the same
// module code as the Schwarz Diamond Hardener app (hardener.js, built from it), in the visitor's own browser:
// files are read from the visitor's computer by the browser and never sent anywhere.
import * as H from './hardener.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const view = $('tool'), body = $('tool-body');

// ---- Small shared pieces ----
const readText = f => f.text();
const readBytes = async f => H.Buffer.from(new Uint8Array(await f.arrayBuffer()));
function download(name, data, type = 'text/plain') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function out(title, text, file) {
  const box = document.createElement('div'); box.className = 'out';
  box.innerHTML = `<div class="out-head"><h3>${esc(title)}</h3><span><button type="button" data-act="copy">Copy</button>${file ? '<button type="button" data-act="save">Download</button>' : ''}</span></div><pre></pre>`;
  box.querySelector('pre').textContent = text;
  box.querySelector('[data-act=copy]').onclick = async e => { try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select and copy'; } setTimeout(() => { e.target.textContent = 'Copy'; }, 1800); };
  if (file) box.querySelector('[data-act=save]').onclick = () => download(file, text);
  return box;
}
function findings(r) {
  const box = document.createElement('div'); box.className = 'findings';
  box.innerHTML = (r.findings || []).map(f => `<div class="finding ${f.autofix ? 'auto' : ''}"><b>${esc(f.title)}</b>${f.measured ? `<p>${esc(f.measured)}</p>` : ''}${f.fix ? `<p class="fix">${esc(f.fix)}</p>` : ''}</div>`).join('') +
    ((r.good || []).length ? `<div class="good"><b>Already good</b><ul>${r.good.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : '');
  return box;
}
// What a cleaner removed, in words: "EXIF (camera, dates), 2.1 KB; a comment, 0.1 KB".
const removed = list => list.map(d => typeof d === 'string' ? d : `${d.what} (${(d.bytes / 1024).toFixed(1)} KB)`).join('; ');
const status = (el, text) => { el.querySelector('.status').textContent = text; };
// A run button that shows it is working and reports a failure plainly.
function wire(el, run) {
  const btn = el.querySelector('.run'), res = el.querySelector('.results');
  btn.onclick = async () => {
    btn.disabled = true; res.innerHTML = ''; status(el, 'Working, in your browser…');
    try { await run(res); } catch (e) { status(el, 'Could not finish: ' + e.message); }
    finally { btn.disabled = false; }
  };
}
const panel = html => { const el = document.createElement('div'); el.className = 'panel'; el.innerHTML = html + '<p class="status" role="status"></p><div class="results"></div>'; return el; };
const textInput = (label, accept, rows = 9) => `<label class="lbl">${label}<textarea class="src" rows="${rows}" placeholder="Paste here, or choose a file below."></textarea></label>
  <label class="file">Or choose a file from your computer <input type="file" class="pick" accept="${accept}"></label>`;
async function sourceText(el) {
  const f = el.querySelector('.pick')?.files?.[0]; const typed = el.querySelector('.src')?.value || '';
  if (typed.trim()) return { text: typed, name: 'your text' };
  if (f) return { text: await readText(f), name: f.name };
  throw new Error('paste some text or choose a file first.');
}

// ---- The tools ----
const TOOLS = {
  text: mode => {
    const el = panel(`<fieldset class="mode"><legend>What to do</legend>
      <label><input type="radio" name="tmode" value="fix" ${mode !== 'ai' ? 'checked' : ''}> Fix and summarize</label>
      <label><input type="radio" name="tmode" value="ai" ${mode === 'ai' ? 'checked' : ''}> AI detector and humanizer</label></fieldset>
      ${textInput('Your text', '.txt,.md,.markdown,text/plain')}<button class="run primary" type="button">Run</button>`);
    wire(el, async res => {
      const { text, name } = await sourceText(el), ai = el.querySelector('input[name=tmode]:checked').value === 'ai';
      if (ai) {
        const r = H.scanAi(text, name), a = r.ai;
        status(el, `AI-style score ${a.before.score} of 100 (${a.before.band}); after humanizing ${a.after.score}. A likelihood from style, not proof: never use it to accuse anyone.`);
        res.append(out('The score, habit by habit', a.before.signals.map(s => `${s.name.padEnd(16)} +${String(s.points).padStart(2)} of ${s.max}   ${s.measured}`).join('\n')),
          out('Humanized text', a.held.length ? `Held back: a number, name or quotation would have changed, so here is your text unchanged.\n\n${a.humanized}` : a.humanized, 'humanized.txt'), findings(r));
      } else {
        const r = H.scanText(text);
        status(el, r.held?.length ? 'Held back: the fact check found a change it could not explain, so your text is unchanged.' : `${r.changes.length} fix(es) by rule; every number, name, quotation and hedge word came through.`);
        res.append(out('Your text, fixed', r.fixedText ?? text, 'fixed.txt'), out('Summary (whole sentences, word for word)', r.summaryText || 'Too short to need a summary (under 6 sentences).', 'summary.txt'), findings(r));
      }
    });
    return el;
  },
  aistyle: () => TOOLS.text('ai'),
  bias: () => {
    const el = panel(`<label class="lbl">Three or more articles about the same event, with a line of --- between them<textarea class="src" rows="10" placeholder="First article&#10;---&#10;Second article&#10;---&#10;Third article"></textarea></label>
      <label class="file">Or choose three or more files <input type="file" class="picks" multiple accept=".txt,.md,text/plain"></label><button class="run primary" type="button">Run</button>`);
    wire(el, async res => {
      const files = [...el.querySelector('.picks').files], typed = el.querySelector('.src').value;
      const articles = typed.trim() ? H.articlesFrom(null, typed) : await Promise.all(files.map(async f => ({ name: f.name, text: await readText(f) })));
      if (articles.length < 3) throw new Error('give three or more articles.');
      const r = H.scanArticles(articles);
      status(el, r.summary || 'Done.');
      res.append(out('What every side reports', r.consensus?.length ? r.consensus.map(c => `${c.text}\n   (in ${c.in.join(', ')})`).join('\n\n') : 'No claim is carried across sides.'),
        out("Each side's own claims", (r.articles || []).map(a => `${a.name} (${a.alone ? 'stands alone' : 'faction ' + a.faction}; ${a.loadedPer100} loaded words per 100)\n` + (a.factionClaims.length ? a.factionClaims.map(c => `  - ${c}`).join('\n') : '  (nothing beyond the consensus)')).join('\n\n')), findings(r));
    });
    return el;
  },
  ask: () => {
    const el = panel(`<label class="file">Choose the documents to answer from (.txt or .md; they stay in your browser) <input type="file" class="picks" multiple accept=".txt,.md,.markdown,text/plain"></label>
      <div class="chat" aria-live="polite"></div>
      <div class="ask-row"><input class="q" placeholder="Ask a question about your documents"><button class="run primary" type="button">Ask</button><button class="new" type="button">New conversation</button></div>`);
    let ix = null, key = '', prevQ = '', prevA = [];
    const chat = el.querySelector('.chat'), q = el.querySelector('.q');
    const turn = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; chat.append(d); d.scrollIntoView({ block: 'nearest' }); };
    el.querySelector('.new').onclick = () => { chat.innerHTML = ''; prevQ = ''; prevA = []; };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') el.querySelector('.run').click(); });
    wire(el, async () => {
      const files = [...el.querySelector('.picks').files], question = q.value.trim();
      if (!files.length) throw new Error('choose your documents first.');
      if (!question) throw new Error('type a question.');
      const k = files.map(f => f.name + f.size + f.lastModified).join('|');
      if (k !== key) { ix = H.indexDocs(await Promise.all(files.map(async f => ({ path: f.name, text: await readText(f) })))); key = k; }
      turn('you', esc(question)); q.value = '';
      const r = H.ask(ix, question, prevQ, prevA);
      if (r.kind !== 'rephrase') { prevQ = question; prevA = r.sources.filter(s => !s.lean).map(s => s.text); }
      const w = r.why;
      turn('a ' + r.kind, `<b>${esc(r.say)}</b>` + r.sources.map(s => `<blockquote>${esc(s.text)}<cite>${s.lean ? 'context it leans on: ' : ''}${esc(s.file)}, line ${s.line}</cite></blockquote>`).join('') +
        (w ? `<p class="why">Looked for: ${esc([...w.matched, ...w.missing].join(', '))}${w.carried ? ' · ' + esc(w.carried) : ''}. Read ${r.stats.files} file(s), ${r.stats.sentences} sentences.</p>` : ''));
      status(el, 'Answered from your documents only, in your browser.');
    });
    return el;
  },
  images: () => {
    const el = panel(`<label class="file">Choose a picture (.jpg or .png) <input type="file" class="pick" accept=".jpg,.jpeg,.png,image/jpeg,image/png"></label><button class="run primary" type="button">Clean it</button>`);
    wire(el, async res => {
      const f = el.querySelector('.pick').files[0]; if (!f) throw new Error('choose a picture first.');
      const bytes = await readBytes(f), png = /\.png$/i.test(f.name) || f.type === 'image/png';
      const r = png ? H.cleanPng(bytes) : H.cleanJpeg(bytes);
      if (!r) throw new Error('that file is not a JPEG or PNG this tool can read.');
      const type = png ? 'image/png' : 'image/jpeg', a = new Blob([bytes], { type }), b = new Blob([r.out], { type });
      const same = await samePixels(a, b);
      status(el, r.dropped.length ? `Removed: ${removed(r.dropped)}. ${same ? 'Every pixel checked identical.' : 'The pictures differ, so the copy is not offered.'}` : 'Nothing to remove: this picture carries nothing extra.');
      const pair = document.createElement('div'); pair.className = 'pair';
      pair.innerHTML = `<figure><img alt="Your original"><figcaption>Original: ${(bytes.length / 1024).toFixed(1)} KB (unchanged)</figcaption></figure><figure><img alt="The cleaned copy"><figcaption>Cleaned copy: ${(r.out.length / 1024).toFixed(1)} KB${same ? ', every pixel the same' : ''}</figcaption></figure>`;
      pair.querySelectorAll('img')[0].src = URL.createObjectURL(a); pair.querySelectorAll('img')[1].src = URL.createObjectURL(b);
      res.append(pair);
      if (r.dropped.length && same) { const btn = document.createElement('button'); btn.className = 'primary'; btn.textContent = 'Download the cleaned copy'; btn.onclick = () => download(f.name.replace(/(\.\w+)$/, ' (cleaned)$1'), b); res.append(btn); }
    });
    return el;
  },
  sound: () => {
    const el = panel(`<label class="file">Choose a sound file (.wav) <input type="file" class="pick" accept=".wav,audio/wav"></label><button class="run primary" type="button">Clean it</button>`);
    wire(el, async res => {
      const f = el.querySelector('.pick').files[0]; if (!f) throw new Error('choose a .wav file first.');
      const bytes = await readBytes(f), r = H.cleanWav(bytes);
      if (!r || !r.out) throw new Error(r?.reason || 'that file is not a WAV this tool can read.');
      const a = new Blob([bytes], { type: 'audio/wav' }), b = new Blob([r.out], { type: 'audio/wav' }), same = await sameSamples(a, b);
      status(el, r.dropped.length ? `Removed: ${removed(r.dropped)}. ${same ? 'Every sample checked identical.' : 'The sound differs, so the copy is not offered.'}` : 'Nothing to remove: this file carries nothing extra.');
      const pair = document.createElement('div'); pair.className = 'pair';
      pair.innerHTML = `<figure><audio controls></audio><figcaption>Original: ${(bytes.length / 1024).toFixed(1)} KB</figcaption></figure><figure><audio controls></audio><figcaption>Cleaned copy: ${(r.out.length / 1024).toFixed(1)} KB</figcaption></figure>`;
      pair.querySelectorAll('audio')[0].src = URL.createObjectURL(a); pair.querySelectorAll('audio')[1].src = URL.createObjectURL(b);
      res.append(pair);
      if (r.dropped.length && same) { const btn = document.createElement('button'); btn.className = 'primary'; btn.textContent = 'Download the cleaned copy'; btn.onclick = () => download(f.name.replace(/(\.\w+)$/, ' (cleaned)$1'), b); res.append(btn); }
    });
    return el;
  },
  budget: () => {
    const el = panel(`<label class="file">Choose a bank statement (.csv with date, description, amount, category) <input type="file" class="pick" accept=".csv,text/csv"></label><button class="run primary" type="button">Run</button>`);
    wire(el, async res => {
      const f = el.querySelector('.pick').files[0]; if (!f) throw new Error('choose a CSV statement first.');
      const r = H.scanStatement(await readText(f));
      status(el, `${r.findings.length} pattern(s) found. Not financial advice: you decide.`); res.append(findings(r));
    });
    return el;
  },
  balance: () => {
    const el = panel(`${textInput('Code (JavaScript, or a page with scripts)', '.js,.mjs,.cjs,.html,.htm', 10)}<button class="run primary" type="button">Run</button>`);
    wire(el, async res => {
      const { text, name } = await sourceText(el);
      const r = await H.scanCode(/\.\w+$/.test(name) ? name : 'pasted.js', text, timeInWorker);
      status(el, r.findings.length ? `${r.findings.length} side(s) tipping. Nothing is changed; each is your decision.` : 'Nothing tipping: input, transform and output are in balance.'); res.append(findings(r));
    });
    return el;
  },
};
// Modules that need the app on a computer, and why: said plainly rather than left blank.
const APP_ONLY = {
  source: 'It reads your whole project to see what uses what, then fixes files with a way back (snapshot, Commit, Restore).',
  webcode: 'It runs your web app in Chrome and records which code runs, which a web page cannot do.',
  security: 'It runs the npm audit against the public advisory database and reads the whole project folder.',
  models: 'It draws each 3D model before and after every change from several angles to prove nothing visible changed.',
  pages: 'It opens other websites, which a browser does not allow a page to read for privacy reasons; the app does it with Chrome on your computer.',
};

// ---- Pixel and sample checks, in the browser ----
async function samePixels(a, b) {
  const draw = async blob => { const img = await createImageBitmap(blob, { imageOrientation: 'from-image' }); const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
  const [x, y] = await Promise.all([draw(a), draw(b)]); if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true;
}
async function sameSamples(a, b) {
  const ctx = new OfflineAudioContext(1, 1, 44100), dec = async blob => ctx.decodeAudioData(await blob.arrayBuffer());
  const [x, y] = await Promise.all([dec(a), dec(b)]); if (x.length !== y.length || x.numberOfChannels !== y.numberOfChannels) return false;
  for (let c = 0; c < x.numberOfChannels; c++) { const p = x.getChannelData(c), q = y.getChannelData(c); for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; }
  return true;
}
// Balance times a risky pattern in a Web Worker, stopped after 1.5 s, so a runaway pattern cannot freeze the page.
const WORKER = URL.createObjectURL(new Blob([`onmessage = e => { const d = e.data; const re = new RegExp(d.source, d.flags.replace(/[gy]/g, '')); const t = performance.now(); re.test(d.input); postMessage(performance.now() - t); };`], { type: 'text/javascript' }));
function timeInWorker(source, flags, input, limit = 1500) {
  return new Promise(resolve => {
    const w = new Worker(WORKER), stop = setTimeout(() => { w.terminate(); resolve(Infinity); }, limit);
    w.onmessage = e => { clearTimeout(stop); w.terminate(); resolve(e.data); };
    w.onerror = () => { clearTimeout(stop); w.terminate(); resolve(null); };
    w.postMessage({ source, flags, input });
  });
}

// ---- Which view: a module's tool (#m-text), or the overview ----
function route() {
  const k = (location.hash.match(/^#m-([\w-]+)$/) || [])[1], card = k && document.getElementById('m-' + k);
  document.body.dataset.view = card ? 'tool' : 'overview';
  view.hidden = !card; for (const id of ['hero', 'overview']) $(id).hidden = !!card;
  document.querySelectorAll('.side a').forEach(a => a.setAttribute('aria-current', String(card ? a.getAttribute('href') === '#m-' + k : false)));
  if (!card) { const to = location.hash.length > 1 && document.querySelector(location.hash); if (to && to.id !== 'top') to.scrollIntoView(); return; }   // an About section: go there
  $('tool-title').textContent = card.querySelector('h4').textContent;
  $('tool-about').innerHTML = card.querySelector('dl').outerHTML;
  body.innerHTML = '';
  if (TOOLS[k]) body.append(TOOLS[k]());
  else body.innerHTML = `<div class="panel app-only"><b>This one runs in the app on your own computer.</b><p>${esc(APP_ONLY[k] || '')}</p></div>`;
  window.scrollTo({ top: 0 });
}
// The whole card opens its app, not only its Open button.
document.querySelectorAll('.mod').forEach(card => card.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = '#' + card.id; }));
addEventListener('hashchange', route);
route();

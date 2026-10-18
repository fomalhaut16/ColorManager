// Builds out/preview.html: every slot of both modes rendered as a mock VSCode window.
// Usage: npm run preview [-- --tint=0.9]
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tintArg = process.argv.find((a) => a.startsWith('--tint='));
const tint = tintArg ? Number(tintArg.slice('--tint='.length)) : 1;

const bundle = resolve(root, 'out/preview-palette.cjs');
await esbuild.build({
  stdin: {
    contents: `
      export { generatePalette, colorHex } from './src/palette/generate';
      export { hueForSlot } from './src/palette/time';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  // jsonc-parser's UMD build uses dynamic requires; take its ESM build.
  mainFields: ['module', 'main'],
  format: 'cjs',
  outfile: bundle,
  logLevel: 'warning',
});
const { generatePalette, colorHex, hueForSlot } = createRequire(import.meta.url)(bundle);

const slots = 96;
const data = {};
for (const mode of ['normal', 'sky']) {
  data[mode] = [];
  for (let k = 0; k < slots; k++) {
    const p = generatePalette(hueForSlot(k, mode, slots), { tint });
    const colors = {};
    for (const [name, c] of Object.entries(p.colors)) colors[name] = colorHex(c);
    data[mode].push({ k, hue: Math.round(p.hue * 10) / 10, colors });
  }
}

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ColorManager Preview</title>
<style>
  :root { --page: #f4f4f5; --text: #222; }
  body { margin: 0; padding: 16px; background: var(--page); color: var(--text); font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
  input[type=range] { width: min(480px, 90vw); }
  .win { max-width: 980px; border-radius: 8px; overflow: hidden; box-shadow: 0 8px 30px #0003; font: 13px/1.6 Menlo, monospace; }
  .title { height: 30px; display: flex; align-items: center; justify-content: center; font: 12px -apple-system, sans-serif; }
  .body { display: flex; height: 380px; }
  .activity { width: 44px; display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 10px; }
  .activity span { width: 22px; height: 22px; border-radius: 5px; opacity: .55; }
  .activity span.on { opacity: 1; }
  .side { width: 210px; padding: 8px 0; font: 13px -apple-system, sans-serif; }
  .side div { padding: 2px 16px; }
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .tabs { display: flex; height: 34px; }
  .tab { padding: 0 14px; display: flex; align-items: center; font: 12px -apple-system, sans-serif; }
  .editor { flex: 1; display: flex; overflow: hidden; }
  .gutter { padding: 8px 10px; text-align: right; user-select: none; }
  pre { margin: 0; padding: 8px 4px; flex: 1; overflow: hidden; }
  .line { display: block; padding-right: 8px; }
  .status { height: 24px; display: flex; align-items: center; gap: 14px; padding: 0 10px; font: 12px -apple-system, sans-serif; }
  .strip { display: grid; grid-template-columns: repeat(96, 1fr); height: 40px; max-width: 980px; margin: 14px 0 4px; cursor: pointer; }
  .strip div { height: 100%; }
  .legend { max-width: 980px; display: flex; justify-content: space-between; font-size: 12px; color: #666; }
  .swatches { display: flex; flex-wrap: wrap; gap: 6px; max-width: 980px; margin-top: 14px; }
  .sw { width: 112px; font: 11px Menlo, monospace; }
  .sw b { display: block; height: 28px; border-radius: 4px; border: 1px solid #0001; }
</style>
</head>
<body>
<h1>ColorManager Preview</h1>
<div class="controls">
  <label><input type="radio" name="mode" value="normal" checked> normal</label>
  <label><input type="radio" name="mode" value="sky"> sky</label>
  <input id="slot" type="range" min="0" max="${slots - 1}" value="48">
  <span id="label"></span>
  <label><input id="play" type="checkbox"> 1日を流す</label>
</div>
<div class="win" id="win">
  <div class="title" id="title">implementation-plan.md — ColorManager</div>
  <div class="body">
    <div class="activity" id="activity"><span class="on"></span><span></span><span></span><span></span></div>
    <div class="side" id="side">
      <div style="font-weight:600;letter-spacing:.04em;font-size:11px">EXPLORER</div>
      <div data-r="sel">▾ src</div><div>&nbsp;&nbsp;extension.ts</div><div>&nbsp;&nbsp;scheduler.ts</div><div data-r="hover">&nbsp;&nbsp;settingsWriter.ts</div><div>&nbsp;&nbsp;palette/</div><div>package.json</div>
    </div>
    <div class="main">
      <div class="tabs" id="tabs"><div class="tab" data-t="active">generate.ts</div><div class="tab">roles.ts</div><div class="tab">README.md</div></div>
      <div class="editor" id="editor"><div class="gutter" id="gutter"></div><pre id="code"></pre></div>
    </div>
  </div>
  <div class="status" id="status"><span>⎇ main</span><span>⟳</span><span style="margin-left:auto">Ln 12, Col 4</span><span>TypeScript</span></div>
</div>
<div class="strip" id="strip"></div>
<div class="legend"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
<div class="swatches" id="swatches"></div>
<script>
const DATA = ${JSON.stringify(data)};
const CODE = [
  [['tok.comment','// Rotate the palette once a day']],
  [['tok.keyword','import'],['fg',' { '],['tok.variable','softChroma'],['fg',' } '],['tok.keyword','from'],['fg',' '],['tok.string',"'../color/gamut'"],['tok.operator',';']],
  [],
  [['tok.decorator','@memoize'],['fg','']],
  [['tok.storage','export function '],['tok.function','generatePalette'],['tok.operator','('],['tok.parameter','H'],['tok.operator',': '],['tok.type','number'],['tok.operator',', '],['tok.parameter','opt'],['tok.operator','?: '],['tok.type','PaletteOptions'],['tok.operator',') {']],
  [['fg','  '],['tok.storage','const '],['tok.variable','hue'],['tok.operator',' = '],['tok.function','wrapHue'],['tok.operator','('],['tok.parameter','H'],['tok.operator',' + '],['tok.number','29.234'],['tok.operator',');']],
  [['fg','  '],['tok.keyword','for'],['tok.operator',' ('],['tok.storage','const '],['tok.variable','role'],['tok.keyword',' of '],['tok.variable','ROLES'],['tok.operator',') {']],
  [['fg','    '],['tok.keyword','if'],['tok.operator',' ('],['tok.variable','role'],['tok.operator','.'],['tok.property','group'],['tok.operator',' === '],['tok.string',"'vivid'"],['tok.operator',') '],['tok.variable','L'],['tok.operator',' += '],['tok.function','anchorDeltaL'],['tok.operator','(h);']],
  [['fg','    '],['tok.variable','out'],['tok.operator','['],['tok.variable','role'],['tok.operator','.'],['tok.property','name'],['tok.operator','] = '],['tok.function','make'],['tok.operator','('],['tok.variable','L'],['tok.operator',', '],['tok.variable','C'],['tok.operator',', '],['tok.regexp','/^#[0-9a-f]{6}$/'],['tok.operator',');']],
  [['fg','  '],['tok.operator','}']],
  [['fg','  '],['tok.keyword','return'],['tok.operator',' { '],['tok.property','hue'],['tok.operator',', '],['tok.property','colors'],['tok.operator',': '],['tok.variable','out'],['tok.operator',' };']],
  [['tok.operator','}']],
  [],
  [['md.heading','## ColorManager']],
  [['fg','Hue rotates '],['md.bold','once a day'],['fg',', see '],['md.link','docs/implementation-plan.md'],['fg','.']],
];
const SW = ['editor.bg','sideBar.bg','tabs.strip','titleBar.bg','activityBar.bg','accent','statusBar.bg','statusBar.alt','sel.editor','find.current','editor.fg','fg.secondary','tok.keyword','tok.storage','tok.function','tok.type','tok.string','tok.number','tok.parameter','tok.regexp','tok.property','tok.comment','status.error','status.warning','status.info','status.success','ansi.red','ansi.green','ansi.yellow','ansi.blue','ansi.magenta','ansi.cyan','bracket.1','bracket.2','bracket.3','bracket.4','bracket.5','bracket.6'];
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const style = (fs) => fs === 'italic' ? 'font-style:italic' : fs === 'bold' ? 'font-weight:700' : fs === 'underline' ? 'text-decoration:underline' : '';
const FONT = { 'tok.parameter':'italic','tok.comment':'italic','tok.decorator':'italic','md.heading':'bold','md.bold':'bold','md.link':'underline' };
function mode() { return document.querySelector('input[name=mode]:checked').value; }
function render() {
  const k = Number($('slot').value); const s = DATA[mode()][k]; const c = s.colors;
  const hh = String(Math.floor(k / 4)).padStart(2, '0'), mm = String((k % 4) * 15).padStart(2, '0');
  $('label').textContent = hh + ':' + mm + '  H=' + s.hue + '°';
  $('title').style.cssText = 'background:' + c['titleBar.bg'] + ';color:' + c['fg.secondary'] + ';border-bottom:1px solid ' + c.border;
  $('activity').style.background = c['activityBar.bg'];
  [...$('activity').children].forEach((e, i) => e.style.background = i === 0 ? c.accent : c['fg.secondary']);
  $('side').style.cssText = 'background:' + c['sideBar.bg'] + ';color:' + c['fg.primary'] + ';border-right:1px solid ' + c.border;
  $('side').querySelector('[data-r=sel]').style.background = c['list.activeSelection'];
  $('side').querySelector('[data-r=hover]').style.background = c['list.hover'];
  $('tabs').style.background = c['tabs.strip'];
  [...$('tabs').children].forEach((t) => {
    const on = t.dataset.t === 'active';
    t.style.cssText = 'background:' + (on ? c['editor.bg'] : c['sideBar.bg']) + ';color:' + (on ? c['fg.primary'] : c['fg.secondary']) + ';border-top:2px solid ' + (on ? c.accent : 'transparent') + ';border-right:1px solid ' + c.border;
  });
  $('editor').style.background = c['editor.bg'];
  $('gutter').style.color = c.lineNumber;
  $('gutter').innerHTML = CODE.map((_, i) => '<span class="line" style="' + (i === 6 ? 'color:' + c['lineNumber.active'] : '') + '">' + (i + 1) + '</span>').join('');
  $('code').innerHTML = CODE.map((line, i) => {
    const bg = i === 6 ? 'background:' + c.lineHighlight : i === 8 ? 'background:linear-gradient(90deg,' + c['sel.editor'] + ' 0 40%, transparent 40%)' : '';
    return '<span class="line" style="' + bg + '">' + (line.map(([r, t]) => '<span style="color:' + c[r] + ';' + style(FONT[r]) + '">' + esc(t) + '</span>').join('') || ' ') + '</span>';
  }).join('');
  $('status').style.cssText = 'background:' + c['statusBar.bg'] + ';color:' + c.onAccent;
  $('swatches').innerHTML = SW.map((r) => '<div class="sw"><b style="background:' + c[r] + '"></b>' + r + '<br>' + c[r] + '</div>').join('');
  $('strip').innerHTML = DATA[mode()].map((x, i) => '<div title="slot ' + i + '" data-k="' + i + '" style="background:' + x.colors.accent + ';' + (i === k ? 'outline:2px solid #000;outline-offset:-2px' : '') + '"></div>').join('');
}
$('slot').addEventListener('input', render);
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', render));
$('strip').addEventListener('click', (e) => { const k = e.target.dataset.k; if (k) { $('slot').value = k; render(); } });
let timer = null;
$('play').addEventListener('change', (e) => {
  if (e.target.checked) timer = setInterval(() => { $('slot').value = (Number($('slot').value) + 1) % ${slots}; render(); }, 120);
  else clearInterval(timer);
});
render();
</script>
</body>
</html>
`;

mkdirSync(resolve(root, 'out'), { recursive: true });
writeFileSync(resolve(root, 'out/preview.html'), html);
console.log(`wrote out/preview.html (tint ${tint})`);

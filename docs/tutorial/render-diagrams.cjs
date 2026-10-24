// Usage (mermaid is not a dependency of this repo): in any empty folder run
//   npm install mermaid@11.4.1
//   node <repo>/docs/tutorial/render-diagrams.cjs <repo>/docs/ui-interactions.md <repo>/docs/tutorial/diagrams
// then rebuild the tutorial: python3 docs/tutorial/build.py
// Renders every ```mermaid block of a markdown file to SVG (light theme), into out/<n>.svg; fails on any syntax error.
const { chromium } = require('playwright');
const fs = require('fs');
const md = fs.readFileSync(process.argv[2], 'utf8');
const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m => m[1]);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent('<html><body></body></html>');
  await p.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js', { paths: [process.cwd()] }) });
  const outDir = process.argv[3] || 'out'; fs.mkdirSync(outDir, { recursive: true });
  let bad = 0;
  for (let i = 0; i < blocks.length; i++) {
    const r = await p.evaluate(async ([code, i]) => {
      window.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'IBM Plex Sans, Helvetica, Arial, sans-serif', flowchart: { htmlLabels: false } });
      try { const { svg } = await window.mermaid.render('d' + i, code); return { svg }; } catch (e) { return { err: String(e.message || e) }; }
    }, [blocks[i], i]);
    if (r.err) { bad++; console.log(`diagram ${i + 1}: ${r.err.slice(0, 300)}`); } else fs.writeFileSync(`${outDir}/${i + 1}.svg`, r.svg);
  }
  console.log(`${blocks.length - bad} of ${blocks.length} rendered`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();

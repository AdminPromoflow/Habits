// Local rendering only. Usage: node render.cjs /path/to/node_modules
const fs = require('node:fs');
const path = require('node:path');
const packages = process.argv[2];
const resolve = name => packages ? require(path.join(packages, name)) : require(name);
const { instance } = resolve('@viz-js/viz');
const { Resvg } = resolve('@resvg/resvg-js');
(async () => {
  const viz = await instance();
  for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith('.dot')).sort()) {
    const dot = fs.readFileSync(path.join(__dirname, file), 'utf8');
    const result = viz.render(dot, { format: 'svg', engine: 'dot' });
    if (result.status !== 'success' || result.errors.some(error => error.level === 'error')) {
      throw new Error(`${file}: ${JSON.stringify(result.errors)}`);
    }
    const svg = result.output;
    const base = path.join(__dirname, file.slice(0, -4));
    fs.writeFileSync(base + '.svg', svg);
    const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: 1.5 }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } }).render();
    fs.writeFileSync(base + '.png', png.asPng());
    console.log(file, `${png.width}×${png.height}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

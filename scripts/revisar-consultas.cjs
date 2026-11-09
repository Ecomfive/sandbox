#!/usr/bin/env node
// Busca consultas de Supabase que pueden traer más de 1 000 filas sin darse cuenta: un `.from(...).select(...)` sin
// `.range`, `.limit`, `.single`, `.maybeSingle`, `head: true` ni paginador (`traerTodas*`). PostgREST corta en ~1 000
// y la suma sale mal sin error. Es una ayuda (puede marcar de más): revisa cada línea y, si está bien, agrégale el
// comentario `// consulta-acotada` en la misma sentencia.
//   node scripts/revisar-consultas.cjs            → lista
//   node scripts/revisar-consultas.cjs --estricto → sale con error si hay alguna nueva (para CI, con la lista base)
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..", "src");
const base = path.join(__dirname, "revisar-consultas.base.txt");
const estricto = process.argv.includes("--estricto");
const ACOTA = /\.range\(|\.limit\(|\.single\(|\.maybeSingle\(|head:\s*true|consulta-acotada|\.in\(\s*["'][a-z_]*id["']/;

function archivos(dir, lista = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, lista);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) lista.push(p);
  }
  return lista;
}

const hallazgos = [];
for (const f of archivos(raiz)) {
  const texto = fs.readFileSync(f, "utf8");
  const re = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)\s*\.select\(/g;
  let m;
  while ((m = re.exec(texto))) {
    // La sentencia: hasta el próximo `;` o línea en blanco.
    const resto = texto.slice(m.index, m.index + 1500);
    const fin = resto.search(/;\s*$|;\n|\n\s*\n/m);
    const sentencia = fin > 0 ? resto.slice(0, fin) : resto;
    const antes = texto.slice(Math.max(0, m.index - 200), m.index);
    if (ACOTA.test(sentencia) || /traerTodas|paginar|\(d,\s*h\)\s*=>/.test(antes + sentencia)) continue;
    const linea = texto.slice(0, m.index).split("\n").length;
    hallazgos.push(`${path.relative(path.join(__dirname, ".."), f)}:${linea} ${m[1]}`);
  }
}

if (!estricto) {
  for (const h of hallazgos) console.log(h);
  console.log(`\n${hallazgos.length} consultas sin acotar. Revisa las que suman o cuentan: Supabase entrega como mucho 1 000 filas.`);
  process.exit(0);
}
const conocidas = new Set(fs.existsSync(base) ? fs.readFileSync(base, "utf8").split("\n").map((l) => l.replace(/:\d+ /, " ")).filter(Boolean) : []);
const nuevas = hallazgos.filter((h) => !conocidas.has(h.replace(/:\d+ /, " ")));
for (const h of nuevas) console.error(`Nueva consulta sin acotar: ${h}`);
process.exit(nuevas.length ? 1 : 0);

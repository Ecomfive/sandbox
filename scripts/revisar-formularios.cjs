// Revisa que los formularios sean accesibles: que toda <label> esté ligada a un campo y que todo <input>, <select> o
// <textarea> tenga nombre. Uso: `node scripts/revisar-formularios.cjs` (sale con error si encuentra algo).
//
// Una etiqueta está ligada si envuelve al campo (la forma que usa el proyecto: <label><span>Nombre</span><input/></label>)
// o lleva `htmlFor`. Un campo tiene nombre si está dentro de una <label>, o lleva `aria-label`, `aria-labelledby` o `id`
// (para una etiqueta con `htmlFor`). Los campos repetidos en una lista deben decir de quién son: `aria-label={`Costo de ${p.nombre}`}`.
const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "src");
const CONTROLES = ["input", "select", "textarea"];

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const etiquetaDe = (n) => (ts.isJsxElement(n) ? n.openingElement : n).tagName.getText();
const atributos = (n) => (ts.isJsxElement(n) ? n.openingElement : n).attributes.properties.filter(ts.isJsxAttribute);
const esJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);

const hallazgos = [];
for (const archivo of archivos(raiz)) {
  const texto = fs.readFileSync(archivo, "utf8");
  if (!/<(label|input|select|textarea)\b/.test(texto)) continue;
  const fuente = ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const donde = (n) => path.relative(raiz, archivo).replace(/\\/g, "/") + ":" + (fuente.getLineAndCharacterOfPosition(n.getStart()).line + 1);

  (function visitar(n, dentroDeLabel, enFuncion) {
    // Las funciones que arman un <select> para usarlo dentro de una <label> (el cargador de archivos) se revisan en su sitio de uso.
    const funcion = ts.isFunctionDeclaration(n) && n.name ? n.name.getText() : enFuncion;
    if (esJsx(n)) {
      const tag = etiquetaDe(n);
      const nombres = atributos(n).map((a) => a.name.getText());
      if (tag === "label" && ts.isJsxElement(n)) {
        // Envuelve un campo (directo, o llamando a una función que lo dibuja) o lleva htmlFor.
        let envuelve = false;
        (function buscar(x) {
          if (esJsx(x) && CONTROLES.includes(etiquetaDe(x))) envuelve = true;
          if (ts.isJsxExpression(x) && x.expression && ts.isCallExpression(x.expression)) envuelve = true;
          ts.forEachChild(x, buscar);
        })(n);
        if (!nombres.includes("htmlFor") && !envuelve) hallazgos.push(donde(n) + "  <label> sin campo: «" + n.getText().replace(/\s+/g, " ").slice(0, 60) + "»");
      }
      if (CONTROLES.includes(tag) && !dentroDeLabel && funcion !== "columnaSelect") {
        const tipo = atributos(n).find((a) => a.name.getText() === "type");
        const clase = atributos(n).find((a) => a.name.getText() === "className");
        const oculto = /hidden|submit|button/.test(tipo ? tipo.getText() : "") || (clase && /"hidden"/.test(clase.getText()));
        if (!oculto && !["aria-label", "aria-labelledby", "id"].some((x) => nombres.includes(x))) {
          hallazgos.push(donde(n) + "  <" + tag + "> sin nombre (envuélvelo en una <label> o dale aria-label)");
        }
      }
      ts.forEachChild(n, (c) => visitar(c, dentroDeLabel || tag === "label", funcion));
    } else ts.forEachChild(n, (c) => visitar(c, dentroDeLabel, funcion));
  })(fuente, false, null);
}

if (hallazgos.length) {
  console.error(hallazgos.length + " problema(s) de accesibilidad en formularios:\n" + hallazgos.join("\n"));
  process.exit(1);
}
console.log("Formularios: todas las etiquetas están ligadas y todos los campos tienen nombre.");

/* eslint-disable @typescript-eslint/no-require-imports -- Next lo carga con require(): tiene que ser CommonJS. */
// Respuestas simuladas de Google Fonts para `next/font/google` sin red (mecanismo oficial de Next:
// NEXT_FONT_GOOGLE_MOCKED_RESPONSES apunta a este archivo). Responde cualquier URL con un @font-face de Inter que
// usa los archivos instalados en el sistema (INTER_DIR, por defecto /usr/share/fonts/opentype/inter); si no están,
// el navegador cae a la fuente de reserva y el diseño no cambia de forma, solo de letra.
const fs = require("node:fs");
const path = require("node:path");

const DIR = process.env.INTER_DIR || "/usr/share/fonts/opentype/inter";
const PESOS = [
  [100, "Thin"],
  [200, "ExtraLight"],
  [300, "Light"],
  [400, "Regular"],
  [500, "Medium"],
  [600, "SemiBold"],
  [700, "Bold"],
  [800, "ExtraBold"],
  [900, "Black"],
];

function css() {
  return PESOS.map(([peso, nombre]) => {
    const archivo = path.join(DIR, `Inter-${nombre}.otf`);
    const src = fs.existsSync(archivo) ? archivo : "/dev/null";
    return `/* latin */\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: ${peso};\n  font-display: swap;\n  src: url(${src}) format('opentype');\n}\n`;
  }).join("");
}

module.exports = new Proxy({}, { get: (_, url) => (typeof url === "string" && url.startsWith("http") ? css() : undefined) });

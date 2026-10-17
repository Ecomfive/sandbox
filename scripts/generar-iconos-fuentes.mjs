// Genera los íconos de la app «Ecomfive Fuentes» (la que se instala en el celular y aparece en «Compartir en…») y el ícono de la pestaña.
// Se dibujan en vectores, no se recortan del logo (el recorte anterior salía borroso y cortado): la «E» tiene las medidas exactas de la del
// logo (public/brand/ecomfive-rojo.png: tallo 42 px, brazos de 36 px, 103 × 157 px) y las esquinas son las del marco del logo, repetidas
// en las cuatro como el visor de una cámara: captura.
//
//   node scripts/generar-iconos-fuentes.mjs
//
// Salida: public/pwa/icon-192.png, icon-512.png (rojo con esquinas redondeadas), icon-maskable-512.png (a sangre, para el recorte
// circular de Android), src/app/apple-icon.png (180, a sangre; iOS lo redondea) y src/app/icon.png (pestaña del navegador: solo la «E»,
// que se lee mejor a 16 px).
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROJO = "#E83B3C";

// La «E» del logo en su propio sistema de coordenadas: x 52–154, y 27–183.
const E = { x: 52, y: 27, w: 102, h: 156, tallo: 41, brazo: 36, medio: 88 };
function trazoE(escala, cx, cy) {
  const x0 = cx - (E.w / 2) * escala;
  const y0 = cy - (E.h / 2) * escala;
  const r = (x, y, w, h) => `<rect x="${(x0 + x * escala).toFixed(2)}" y="${(y0 + y * escala).toFixed(2)}" width="${(w * escala).toFixed(2)}" height="${(h * escala).toFixed(2)}" rx="${(2.5 * escala).toFixed(2)}"/>`;
  return [r(0, 0, E.tallo, E.h), r(0, 0, E.w, E.brazo), r(0, E.medio - E.y, E.w - 8, E.brazo - 1), r(0, E.h - E.brazo, E.w, E.brazo)].join("");
}

/** El visor: las cuatro esquinas del marco del logo. `c` = distancia del centro al eje del trazo, `largo` = lo que mide cada brazo. */
function visor(c, largo, grosor) {
  const m = 256;
  const esquina = (sx, sy) => {
    const x = m + sx * c;
    const y = m + sy * c;
    return `<path d="M${x - sx * largo} ${y} H${x} V${y - sy * largo}" />`;
  };
  return `<g fill="none" stroke="#fff" stroke-width="${grosor}" stroke-linejoin="miter" stroke-linecap="butt">${esquina(-1, -1)}${esquina(1, -1)}${esquina(-1, 1)}${esquina(1, 1)}</g>`;
}

function svg({ redondeo, conVisor }) {
  const forma = redondeo ? `<rect width="512" height="512" rx="${redondeo}" fill="url(#fondo)"/>` : `<rect width="512" height="512" fill="url(#fondo)"/>`;
  const e = conVisor ? trazoE(1.28, 256, 256) : trazoE(2.2, 256, 256);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F4605F"/>
      <stop offset="0.55" stop-color="${ROJO}"/>
      <stop offset="1" stop-color="#C92A2F"/>
    </linearGradient>
    <radialGradient id="brillo" cx="0.25" cy="0.15" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="sombra" x="-20%" y="-20%" width="140%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="7"/>
      <feOffset dy="8" result="d"/>
      <feFlood flood-color="#6d0b10" flood-opacity="0.45"/>
      <feComposite in2="d" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${forma}
  <rect width="512" height="512" ${redondeo ? `rx="${redondeo}"` : ""} fill="url(#brillo)"/>
  <g fill="#fff" filter="url(#sombra)">${e}${conVisor ? visor(128, 64, 30) : ""}</g>
</svg>`;
}

async function guardar(ruta, opciones, lado) {
  mkdirSync(dirname(ruta), { recursive: true });
  await sharp(Buffer.from(svg(opciones))).resize(lado, lado).png({ compressionLevel: 9 }).toFile(ruta);
  console.log("listo", ruta.replace(raiz, "."), `${lado}x${lado}`);
}

await guardar(join(raiz, "public/pwa/icon-512.png"), { redondeo: 112, conVisor: true }, 512);
await guardar(join(raiz, "public/pwa/icon-192.png"), { redondeo: 112, conVisor: true }, 192);
await guardar(join(raiz, "public/pwa/icon-maskable-512.png"), { redondeo: 0, conVisor: true }, 512);
await guardar(join(raiz, "src/app/apple-icon.png"), { redondeo: 0, conVisor: true }, 180);
await guardar(join(raiz, "src/app/icon.png"), { redondeo: 112, conVisor: false }, 512);

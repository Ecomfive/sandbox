// Dibuja el favicon de la plataforma: la «E» del logo con su línea en L (abajo y a la izquierda), en el rojo del logo (#E83B3C).
//   node scripts/generar-favicon.mjs
// Escribe src/app/icon.png (512, fondo transparente: pestaña del navegador) y src/app/apple-icon.png (180, fondo blanco: iOS no admite
// transparencia). Es el mismo dibujo de la propuesta aprobada; los iconos de la app instalada (public/pwa) los hace generar-iconos-fuentes.mjs.
import sharp from "sharp";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const marca = `
  <rect x="44" y="44" width="28" height="424"/>
  <rect x="44" y="440" width="308" height="28"/>
  <rect x="150" y="116" width="64" height="280" rx="10"/>
  <rect x="150" y="116" width="222" height="64" rx="10"/>
  <rect x="150" y="224" width="196" height="64" rx="10"/>
  <rect x="150" y="332" width="222" height="64" rx="10"/>`;
const svg = (fondo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${fondo ? `<rect width="512" height="512" fill="${fondo}"/>` : ""}<g fill="#e83b3c">${marca}</g></svg>`;

await sharp(Buffer.from(svg(null)), { density: 288 }).resize(512, 512).png({ compressionLevel: 9 }).toFile(join(raiz, "src/app/icon.png"));
await sharp(Buffer.from(svg("#ffffff")), { density: 288 }).resize(180, 180).png({ compressionLevel: 9 }).toFile(join(raiz, "src/app/apple-icon.png"));
console.log("src/app/icon.png y src/app/apple-icon.png listos");

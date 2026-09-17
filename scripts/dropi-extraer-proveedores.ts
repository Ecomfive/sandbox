// Extrae el directorio de proveedores competidores visible desde una cuenta
// DROPSHIPPER de Dropi (marketplace de "Proveedores"), para inteligencia
// competitiva. Requiere una sesion guardada con:
//   npx tsx scripts/dropi-guardar-sesion.ts <cr|pa> dropshipper
//
// Uso: npx tsx scripts/dropi-extraer-proveedores.ts <cr|pa>

import { chromium, type Page, type Response } from "playwright";
import fs from "node:fs";

const pais = process.argv[2];
const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-extraer-proveedores.ts <cr|pa>");
  process.exit(1);
}

interface ProveedorDropi {
  id: number;
  name: string;
  store_name: string | null;
  products_count: number;
  categories_name: string[];
  warehouses: { city: { name: string } }[];
}

function esperarRespuesta(page: Page, timeoutMs = 20000): Promise<ProveedorDropi[] | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      page.off("response", onResponse);
      resolve(null);
    }, timeoutMs);

    const onResponse = async (res: Response) => {
      if (!res.url().includes("getDataProductsSuplierFilter")) return;
      try {
        const json = await res.json();
        clearTimeout(timeout);
        page.off("response", onResponse);
        resolve(json.objects ?? []);
      } catch {
        /* seguir esperando */
      }
    };
    page.on("response", onResponse);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: `.dropi-session-${pais}-dropshipper.json` });
  const page = await context.newPage();

  const porId = new Map<number, ProveedorDropi>();

  let espera = esperarRespuesta(page);
  await page.goto(`${bases[pais]}/dashboard/providers`, { waitUntil: "load" });
  let objetos = await espera;
  if (objetos === null) throw new Error("No respondio getDataProductsSuplierFilter en la carga inicial.");
  for (const p of objetos) porId.set(p.id, p);
  console.log(`carga inicial: ${porId.size} proveedores`);

  let sinNuevos = 0;
  let scroll = 0;
  while (sinNuevos < 3 && scroll < 200) {
    const antes = porId.size;
    espera = esperarRespuesta(page);
    await page.mouse.wheel(0, 3000);
    objetos = await espera;
    scroll++;
    if (objetos === null) {
      sinNuevos++;
      continue;
    }
    for (const p of objetos) porId.set(p.id, p);
    if (porId.size === antes) sinNuevos++;
    else {
      sinNuevos = 0;
      console.log(`scroll ${scroll}: ${porId.size} proveedores`);
    }
  }

  const lista = Array.from(porId.values());
  fs.mkdirSync(".dropi-downloads", { recursive: true });
  const dest = `.dropi-downloads/proveedores-${pais}-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(dest, JSON.stringify(lista, null, 2));
  console.log(`Guardados ${lista.length} proveedores en ${dest}`);

  await browser.close();
}

main();

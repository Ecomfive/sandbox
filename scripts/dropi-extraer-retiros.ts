// Extrae el "Historial de Retiros" de la cuenta PROVEEDOR de Dropi
// (Configuraciones > Retiros de Saldo > Historial de Retiros). Esa misma
// respuesta trae ademas el saldo actual de la wallet (user.wallets[0].amount),
// asi que no hace falta calcularlo aparte.
//
// Requiere una sesion guardada con:
//   npx tsx scripts/dropi-guardar-sesion.ts <cr|pa>
//
// Uso: npx tsx scripts/dropi-extraer-retiros.ts <cr|pa>

import { chromium } from "playwright";
import fs from "node:fs";

const pais = process.argv[2];
const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-extraer-retiros.ts <cr|pa>");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: `.dropi-session-${pais}.json` });
  const page = await context.newPage();

  const respuestaWithdrawal = page.waitForResponse(
    (res) => res.url().includes("/api/withdrawal") && res.request().resourceType() === "fetch",
    { timeout: 30000 }
  );

  await page.goto(`${bases[pais]}/dashboard`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.locator("text=Configuraciones").first().click();
  await page.waitForTimeout(800);
  await page.locator("text=Retiros de Saldo").first().click();
  await page.waitForTimeout(1500);
  await page.locator("text=Historial de Retiros").first().click();

  const respuesta = await respuestaWithdrawal;
  const cuerpo = await respuesta.json();
  const objetos: Record<string, unknown>[] = cuerpo.objects ?? [];

  fs.mkdirSync(".dropi-downloads", { recursive: true });
  const hoy = new Date().toISOString().slice(0, 10);
  const destino = `.dropi-downloads/retiros-${pais}-${hoy}.json`;
  fs.writeFileSync(destino, JSON.stringify(objetos, null, 2));
  console.log(`Guardados ${objetos.length} retiros en ${destino}`);

  await browser.close();
}

main();

// Visita el dashboard de Dropi con una sesion ya guardada (sin pedir
// usuario/contrasena) y vuelve a guardar las cookies actualizadas. Sirve
// para renovarla periodicamente y que no expire por inactividad.
//
// Uso: npx tsx scripts/dropi-mantener-sesion.ts <cr|pa> [dropshipper]
// Se puede programar en el Programador de tareas de Windows para que
// corra sola cada cierto tiempo (ej. cada 6 horas).

import { chromium } from "playwright";

const pais = process.argv[2];
const tipo = process.argv[3] === "dropshipper" ? "dropshipper" : "proveedor";
const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-mantener-sesion.ts <cr|pa> [dropshipper]");
  process.exit(1);
}

const archivo = tipo === "dropshipper" ? `.dropi-session-${pais}-dropshipper.json` : `.dropi-session-${pais}.json`;

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: archivo });
  const page = await context.newPage();

  await page.goto(`${bases[pais]}/dashboard`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes("/auth/login")) {
    console.error(`La sesion de ${archivo} ya expiro. Hay que iniciar sesion de nuevo manualmente.`);
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: archivo });
  console.log(`Sesion de ${archivo} renovada (${new Date().toISOString()}).`);

  await browser.close();
}

main();

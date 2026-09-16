import { chromium } from "playwright";

const pais = process.argv[2];
const urls: Record<string, string> = {
  cr: "https://app.dropi.cr/auth/login",
  pa: "https://app.dropi.pa/auth/login",
};

if (!urls[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-guardar-sesion.ts <cr|pa>");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(urls[pais]);

  console.log("");
  console.log("Se abrio una ventana de Chromium. Inicia sesion ahi con tu cuenta");
  console.log("de PROVEEDOR de Dropi (no la de dropshipper). Esta consola espera");
  console.log("a que termines - no hace falta hacer nada mas aqui.");
  console.log("");

  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 0 });

  const outPath = `.dropi-session-${pais}.json`;
  await context.storageState({ path: outPath });
  console.log(`Listo. Sesion guardada en ${outPath}`);

  await browser.close();
}

main();

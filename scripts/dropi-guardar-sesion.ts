import { chromium } from "playwright";

const pais = process.argv[2];
const tipo = process.argv[3] === "dropshipper" ? "dropshipper" : "proveedor";
const urls: Record<string, string> = {
  cr: "https://app.dropi.cr/auth/login",
  pa: "https://app.dropi.pa/auth/login",
};

if (!urls[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-guardar-sesion.ts <cr|pa> [dropshipper]");
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(urls[pais]);

  console.log("");
  console.log(`Se abrio una ventana de Chromium. Inicia sesion ahi con tu cuenta`);
  console.log(`de ${tipo.toUpperCase()} de Dropi. Esta consola espera a que termines`);
  console.log("- no hace falta hacer nada mas aqui.");
  console.log("");

  await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 0 });

  const outPath = tipo === "dropshipper" ? `.dropi-session-${pais}-dropshipper.json` : `.dropi-session-${pais}.json`;
  await context.storageState({ path: outPath });
  console.log(`Listo. Sesion guardada en ${outPath}`);

  await browser.close();
}

main();

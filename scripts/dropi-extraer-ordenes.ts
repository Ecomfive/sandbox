import { chromium, type Page, type Response } from "playwright";
import fs from "node:fs";

const pais = process.argv[2];
const desde = process.argv[3];
const hasta = process.argv[4];

const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""] || !desde || !hasta) {
  console.error("Uso: npx tsx scripts/dropi-extraer-ordenes.ts <cr|pa> <desde:YYYY-MM-DD> <hasta:YYYY-MM-DD>");
  process.exit(1);
}

function esperarRespuesta(page: Page, timeoutMs = 45000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      page.off("response", onResponse);
      reject(new Error(`Timeout esperando respuesta de myorders/v2 (${timeoutMs}ms)`));
    }, timeoutMs);

    const onResponse = async (res: Response) => {
      if (!res.url().includes("/api/orders/myorders/v2")) return;
      try {
        const json = await res.json();
        clearTimeout(timeout);
        page.off("response", onResponse);
        resolve(json.objects ?? []);
      } catch {
        /* respuesta no-json, seguir esperando */
      }
    };
    page.on("response", onResponse);
  });
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: `.dropi-session-${pais}.json` });
  const page = await context.newPage();
  const base = bases[pais];

  const allOrders: unknown[] = [];

  let esperaPagina = esperarRespuesta(page);
  await page.goto(`${base}/dashboard/orders/supplier?from=${desde}&until=${hasta}`, {
    waitUntil: "load",
  });
  let objetos = await esperaPagina;
  const pageSize = objetos.length;
  console.log(`pagina 1: +${objetos.length}`);
  allOrders.push(...objetos);

  let pagina = 1;
  while (objetos.length === pageSize && pageSize > 0) {
    const siguiente = page.locator("text=Siguiente").first();
    if ((await siguiente.count()) === 0) break;
    const disabled = await siguiente.evaluate(
      (el) => el.closest("li")?.classList.contains("disabled") ?? false
    );
    if (disabled) break;

    esperaPagina = esperarRespuesta(page);
    await siguiente.click();
    objetos = await esperaPagina;
    pagina++;
    console.log(`pagina ${pagina}: +${objetos.length}`);
    allOrders.push(...objetos);

    if (pagina > 500) throw new Error("Demasiadas paginas, posible loop infinito.");
  }

  fs.mkdirSync(".dropi-downloads", { recursive: true });
  const dest = `.dropi-downloads/ordenes-${pais}-${desde}_a_${hasta}.json`;
  fs.writeFileSync(dest, JSON.stringify(allOrders, null, 2));
  console.log(`Guardadas ${allOrders.length} ordenes en ${dest}`);

  await browser.close();
}

main();

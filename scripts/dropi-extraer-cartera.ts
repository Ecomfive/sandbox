// Extrae el "Historial de Cartera" de la cuenta PROVEEDOR de Dropi usando
// su propio boton "Descargar en Excel" (trae todo el rango de una vez, sin
// paginar). El selector de fechas es un calendario (no un campo de texto),
// asi que hay que navegar los meses y hacer clic en el dia exacto.
//
// Requiere una sesion guardada con:
//   npx tsx scripts/dropi-guardar-sesion.ts <cr|pa>
//
// Uso: npx tsx scripts/dropi-extraer-cartera.ts <cr|pa> <desde:YYYY-MM-DD> <hasta:YYYY-MM-DD>

import { chromium, type Page } from "playwright";
import * as XLSX from "xlsx";
import fs from "node:fs";

const pais = process.argv[2];
const desde = process.argv[3];
const hasta = process.argv[4];

const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""] || !desde || !hasta) {
  console.error("Uso: npx tsx scripts/dropi-extraer-cartera.ts <cr|pa> <desde:YYYY-MM-DD> <hasta:YYYY-MM-DD>");
  process.exit(1);
}

const MESES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function elegirFecha(page: Page, placeholder: string, iso: string) {
  const [anioStr, mesStr, diaStr] = iso.split("-");
  const anioObjetivo = Number(anioStr);
  const mesObjetivo = Number(mesStr) - 1;
  const dia = String(Number(diaStr));

  const input = page.getByPlaceholder(placeholder);
  await input.click();
  const panelId = await input.getAttribute("aria-controls");
  if (!panelId) throw new Error(`No se encontro aria-controls para el campo ${placeholder}`);
  const panel = page.locator(`#${panelId}`);
  await panel.waitFor({ state: "visible" });

  for (let intentos = 0; intentos < 24; intentos++) {
    const mesTexto = (await panel.locator(".p-datepicker-month").innerText()).trim();
    const anioTexto = (await panel.locator(".p-datepicker-year").innerText()).trim();
    const mesActual = MESES.indexOf(mesTexto);
    const anioActual = Number(anioTexto);
    if (mesActual === mesObjetivo && anioActual === anioObjetivo) break;

    const objetivoIndice = anioObjetivo * 12 + mesObjetivo;
    const actualIndice = anioActual * 12 + mesActual;
    const boton = objetivoIndice < actualIndice ? ".p-datepicker-prev" : ".p-datepicker-next";
    await panel.locator(boton).first().click();
    await page.waitForTimeout(200);
  }

  await panel
    .locator("td:not(.p-datepicker-other-month) > span", { hasText: new RegExp(`^${dia}$`) })
    .first()
    .click();
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: `.dropi-session-${pais}.json`, acceptDownloads: true });
  const page = await context.newPage();

  await page.goto(`${bases[pais]}/dashboard/historywallet`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  await elegirFecha(page, "Desde", desde);
  await page.waitForTimeout(500);
  console.log("Desde quedo en:", await page.getByPlaceholder("Desde").inputValue());
  await elegirFecha(page, "Hasta", hasta);
  await page.waitForTimeout(1500);
  console.log("Hasta quedo en:", await page.getByPlaceholder("Hasta").inputValue());
  await page.screenshot({ path: `.dropi-explore-${pais}-fechas.png`, fullPage: false });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.locator("text=Descargar en Excel").first().click(),
  ]);

  fs.mkdirSync(".dropi-downloads", { recursive: true });
  const rutaExcel = `.dropi-downloads/cartera-${pais}-${desde}_a_${hasta}.xlsx`;
  await download.saveAs(rutaExcel);

  const wb = XLSX.readFile(rutaExcel);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: null }) as Record<string, unknown>[];

  const destino = `.dropi-downloads/cartera-${pais}-${desde}_a_${hasta}.json`;
  fs.writeFileSync(destino, JSON.stringify(filas, null, 2));
  console.log(`Guardadas ${filas.length} transacciones de cartera en ${destino}`);

  await browser.close();
}

main();

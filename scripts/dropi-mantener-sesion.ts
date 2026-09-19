// Visita el dashboard de Dropi con una sesion ya guardada (sin pedir
// usuario/contrasena) y vuelve a guardar las cookies actualizadas. Sirve
// para renovarla periodicamente y que no expire por inactividad.
//
// Uso: npx tsx scripts/dropi-mantener-sesion.ts <cr|pa> [dropshipper]
// Se puede programar en el Programador de tareas de Windows para que
// corra sola cada cierto tiempo (ej. cada 6 horas).

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const pais = process.argv[2];
const tipo = process.argv[3] === "dropshipper" ? "dropshipper" : "proveedor";
const bases: Record<string, string> = { cr: "https://app.dropi.cr", pa: "https://app.dropi.pa" };

if (!bases[pais ?? ""]) {
  console.error("Uso: npx tsx scripts/dropi-mantener-sesion.ts <cr|pa> [dropshipper]");
  process.exit(1);
}

const archivo = tipo === "dropshipper" ? `.dropi-session-${pais}-dropshipper.json` : `.dropi-session-${pais}.json`;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/** Deja constancia en el Centro de notificaciones de si esta renovación funcionó o no,
 * para que el equipo la vea sin tener que revisar el log de la tarea programada. */
async function reportarSesion(ok: boolean, mensaje: string | null) {
  await supabase
    .from("dropi_sesiones")
    .upsert({ pais_codigo: pais.toUpperCase(), tipo, renovada_en: new Date().toISOString(), ok, mensaje });
}

async function main() {
  const browser = await chromium.launch({ headless: false, channel: "msedge" });
  const context = await browser.newContext({ storageState: archivo });
  const page = await context.newPage();

  await page.goto(`${bases[pais]}/dashboard`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes("/auth/login")) {
    console.error(`La sesion de ${archivo} ya expiro. Hay que iniciar sesion de nuevo manualmente.`);
    await reportarSesion(false, "La sesión expiró — hay que iniciar sesión de nuevo manualmente.");
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: archivo });
  console.log(`Sesion de ${archivo} renovada (${new Date().toISOString()}).`);
  await reportarSesion(true, null);

  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  await reportarSesion(false, err instanceof Error ? err.message : String(err));
  process.exit(1);
});

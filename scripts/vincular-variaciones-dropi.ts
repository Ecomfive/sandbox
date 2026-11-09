// Vincula las variaciones de Dropi con las variantes de Producto en todas las publicaciones que ya existen (9 nov 2026, pedido de Hernán; migración 0261).
// Sin --aplicar solo dice qué haría. La lectura de «Mis productos» lo hace sola con lo nuevo; esto es para ponerse al día.
//   npx tsx scripts/vincular-variaciones-dropi.ts            simula
//   npx tsx scripts/vincular-variaciones-dropi.ts --aplicar  guarda

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { autoVincularVariaciones } from "../src/lib/publicaciones/vincular-variaciones-db";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const aplicar = process.argv.includes("--aplicar");

(async () => {
  const r = await autoVincularVariaciones(supabase, { aplicar });
  if (!r) return console.log("Falta correr en Supabase la migración 0261.");
  console.log(`${aplicar ? "Guardado" : "Simulación"}: ${r.variaciones} variaciones; ${r.yaVinculadas} ya vinculadas; ${r.nuevas} ${aplicar ? "vinculadas ahora" : "se vincularían"}; ${r.sinPareja.length} sin pareja.`);
  for (const s of r.sinPareja) console.log(`  Sin pareja: ${s.publicacion} (ID ${s.dropiId}) · «${s.etiqueta}»`);
})();

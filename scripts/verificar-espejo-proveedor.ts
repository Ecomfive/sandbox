// Comprueba que el espejo del portal del proveedor (`proveedor_pedidos`, migración 0124) coincide con Compras: una fila visible por
// cada compra del proveedor desde «Cotizar», con su etapa, unidades, total, fechas y pagos. Solo lee.
//
//   npx tsx --env-file=.env.local scripts/verificar-espejo-proveedor.ts

import { createClient } from "@supabase/supabase-js";
import { etapaPortal, viaPortal } from "../src/lib/proveedor/espejo";
import { traerTodasLasFilas } from "../src/lib/supabase/paginar";

type Fila = Record<string, unknown>;

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: proveedores, error } = await s.from("proveedores").select("id, nombre, nombre_en_compras").eq("activo", true);
  if (error) throw new Error("Falta correr la migración 0124: " + error.message);
  let problemas = 0;
  for (const p of proveedores ?? []) {
    const compras = await traerTodasLasFilas<Fila>((d, h) =>
      s.from("wms_compras").select("id, etapa, tipo, anulada_en, via_envio, qty_total, monto_total, fecha_envio, fecha_llegada, primer_pago, segundo_pago").ilike("proveedor", p.nombre_en_compras as string).range(d, h),
    );
    const espejo = await traerTodasLasFilas<Fila>((d, h) =>
      s.from("proveedor_pedidos").select("compra_id, visible, etapa, via, unidades, monto_total, fecha_envio, fecha_llegada, primer_pago, segundo_pago").eq("proveedor_id", p.id as string).range(d, h),
    );
    const porCompra = new Map(espejo.map((e) => [e.compra_id as string, e]));
    const conteo = new Map<string, number>();
    const malos: string[] = [];
    for (const c of compras) {
      const etapa = c.anulada_en || c.tipo !== "pais" ? null : etapaPortal(c.etapa as string);
      const e = porCompra.get(c.id as string);
      if (!etapa) {
        if (e?.visible) malos.push(`${c.id}: no debería verse (etapa ${c.etapa})`);
        continue;
      }
      conteo.set(etapa, (conteo.get(etapa) ?? 0) + 1);
      if (!e || !e.visible) { malos.push(`${c.id}: falta en el espejo (${c.etapa})`); continue; }
      const iguales: [string, unknown, unknown][] = [
        ["etapa", e.etapa, etapa],
        ["via", e.via, viaPortal(c.via_envio as string[] | null)],
        ["unidades", num(e.unidades), num(c.qty_total)],
        ["monto", num(e.monto_total), num(c.monto_total)],
        ["envío", e.fecha_envio, c.fecha_envio],
        ["llegada", e.fecha_llegada, c.fecha_llegada],
        ["pago 1", num(e.primer_pago), num(c.primer_pago)],
        ["pago 2", num(e.segundo_pago), num(c.segundo_pago)],
      ];
      for (const [campo, a, b] of iguales) if ((a ?? null) !== (b ?? null)) malos.push(`${c.id}: ${campo} ${a} ≠ ${b}`);
    }
    const visibles = espejo.filter((e) => e.visible).length;
    console.log(`${p.nombre}: ${compras.length} compras, ${visibles} visibles en el espejo`);
    console.log("  por etapa:", Object.fromEntries([...conteo].sort()));
    if (malos.length) { problemas += malos.length; console.log(`  ${malos.length} diferencias:`); for (const m of malos.slice(0, 20)) console.log("   ", m); }
    else console.log("  sin diferencias");
  }
  process.exitCode = problemas ? 1 : 0;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });

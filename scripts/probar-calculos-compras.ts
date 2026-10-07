// Prueba los cálculos del informe de Compras contra las compras reales de la base (solo lee). Uso: npx tsx scripts/probar-calculos-compras.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { FilaCompra } from "../src/app/(app)/compras/def-compras";
import * as K from "../src/app/(app)/compras/calculos-compras";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const filas: Record<string, unknown>[] = [];
  for (let d = 0; ; d += 1000) {
    const { data } = await sb
      .from("wms_compras")
      .select("id, tipo, codigo, nombre, etapa, estado, proveedor, tienda, via_envio, qty_total, monto_total, pagado_a_proveedor, fecha_pago_1, fecha_envio, fecha_llegada, inconveniente, responsable_nombre, creado_en, cerrado_en, paises(codigo)")
      .eq("tipo", "pais")
      .range(d, d + 999);
    if (!data?.length) break;
    filas.push(...data);
  }
  const compras = filas.map(
    (c) =>
      ({
        ...({} as FilaCompra),
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        etapa: c.etapa,
        estado: c.estado,
        proveedor: c.proveedor,
        tienda: c.tienda,
        viaEnvio: c.via_envio ?? [],
        qtyTotal: c.qty_total === null ? null : Number(c.qty_total),
        montoTotal: c.monto_total === null ? null : Number(c.monto_total),
        pagadoAProveedor: c.pagado_a_proveedor === null ? null : Number(c.pagado_a_proveedor),
        fechaPago1: c.fecha_pago_1,
        fechaEnvio: c.fecha_envio,
        fechaLlegada: c.fecha_llegada,
        inconveniente: c.inconveniente,
        asignadoNombre: c.responsable_nombre,
        creadoEn: c.creado_en,
        cerradoEn: c.cerrado_en,
        paisCodigo: (c.paises as { codigo: string } | null)?.codigo ?? null,
      }) as FilaCompra,
  );

  const umbral = K.umbralesTransito(compras);
  console.log("compras:", compras.length, "| umbrales de tránsito:", umbral);
  const meses = K.periodos(compras, "mes");
  console.log("meses:", meses.length, "de", meses[0]?.clave, "a", meses.at(-1)?.clave);
  const sep = K.estadisticasPeriodo(compras, "2026-09", "mes");
  console.log("septiembre 2026:", { ...sep, ciclo: sep.ciclo.mediana });
  const r = K.paraRevisar(compras, umbral);
  console.log("atrasadas:", r.atrasadas.length, "| cotización > 3 semanas:", r.cotizacionLarga.length, "| inconveniente:", r.conInconveniente.length);
  for (const g of ["abiertas", "cotizando", "produccion", "transito", "atrasadas", "cerradas"] as const)
    console.log(`  grupo ${g}:`, compras.filter((c) => K.enGrupo(c, g, umbral)).length);
  console.log("tramos:", K.tiemposPorTramo(compras).map((t) => `${t.nombre}: ${t.mediana} d (n ${t.n})`).join(" | "));
  console.log("por proveedor:", K.porDimension(compras, (c) => [c.proveedor ?? "Sin proveedor"]).slice(0, 3));
  console.log("semanas:", K.periodos(compras, "semana").length, "| días:", K.periodos(compras, "dia").length);
  console.log("serie (últimos 3):", K.serieMensual(compras).slice(-3));
  console.log("tránsito mensual (últimos 3):", K.transitoMensual(compras).slice(-3));
  console.log("histograma:", K.histogramaTransito(compras).map((f) => `${f.rango}: ${f.mar}/${f.aire}/${f.otra}`).join(" | "));
  console.log("a tiempo:", K.aTiempo(compras, umbral));
  console.log(K.textoInforme(compras, "2026-09", "mes", "todos", umbral));
}
main();

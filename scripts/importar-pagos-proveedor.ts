// Importa las hojas de pagos de Chin («payment record for EcomFive», una por país) al portal del proveedor (migración 0127): cada fila
// queda en `proveedor_historial` (con su pedido si se emparejó con una compra) y lo pagado en `proveedor_pagos` (origen «hoja»).
// Se puede repetir: cada corrida reemplaza lo que trajo la anterior. Los pagos avisados y confirmados en el portal no se tocan.
//
//   npx tsx --env-file=.env.local scripts/importar-pagos-proveedor.ts            (solo informa)
//   npx tsx --env-file=.env.local scripts/importar-pagos-proveedor.ts --aplicar
//
// Las hojas van en datos-privados/ (ignorada por git): chin-pagos-PA.csv, chin-pagos-CR.csv, chin-pagos-MX.csv. La de «PA» es la hoja
// sin país en el nombre (trae también envíos a otros países: el país solo suma puntos al emparejar).

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { emparejar, leerHojaPagos, type FilaHoja, type PedidoParaEmparejar } from "../src/lib/proveedor/hoja-pagos";
import { traerTodasLasFilas } from "../src/lib/supabase/paginar";

const HOJAS = [
  { hoja: "PA", archivo: "datos-privados/chin-pagos-PA.csv" },
  { hoja: "CR", archivo: "datos-privados/chin-pagos-CR.csv" },
  { hoja: "MX", archivo: "datos-privados/chin-pagos-MX.csv" },
];
const PROVEEDOR = "Chin";
const aplicar = process.argv.includes("--aplicar");

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: prov, error } = await s.from("proveedores").select("id").eq("nombre", PROVEEDOR).single();
  if (error || !prov) throw new Error("Falta el proveedor (migración 0124).");

  const filas: { fila: FilaHoja; pais: string; clave: string }[] = [];
  for (const { hoja, archivo } of HOJAS) leerHojaPagos(readFileSync(archivo, "utf8")).forEach((fila, i) => filas.push({ fila, pais: hoja, clave: `${hoja}#${i + 1}` }));

  const espejo = await traerTodasLasFilas<Record<string, unknown>>((d, h) => s.from("proveedor_pedidos").select("id, producto, pais_codigo, unidades, monto_total, fecha_envio").eq("proveedor_id", prov.id).order("id").range(d, h));
  const pedidos: PedidoParaEmparejar[] = espejo.map((p) => ({
    id: p.id as string,
    producto: p.producto as string,
    paisCodigo: (p.pais_codigo as string | null) ?? null,
    unidades: p.unidades == null ? null : Number(p.unidades),
    montoTotal: p.monto_total == null ? null : Number(p.monto_total),
    fechaEnvio: (p.fecha_envio as string | null) ?? null,
  }));
  const pareja = emparejar(filas, pedidos);
  const sinCompra = filas.filter((_, i) => !pareja.has(i));
  const pagos = filas.reduce((n, f) => n + f.fila.pagosAnticipo.length + f.fila.pagosSaldo.length, 0);
  console.log(`${filas.length} filas en las hojas · ${pareja.size} con su compra · ${sinCompra.length} como historial suelto · ${pagos} pagos`);
  writeFileSync(
    "datos-privados/pagos-proveedor-sin-compra.txt",
    `Filas de las hojas de pagos de ${PROVEEDOR} sin compra en el sistema (cuentan como historial suelto)\n\n` +
      sinCompra.map(({ fila, pais }) => `${pais}\t${fila.fechaEnvio}\t${fila.producto}\t${fila.unidades ?? ""} u.\t$${fila.monto}`).join("\n") +
      "\n",
  );
  console.log("Reporte: datos-privados/pagos-proveedor-sin-compra.txt");
  if (!aplicar) return console.log("Sin --aplicar: no se guardó nada.");

  // Lo que trajo la corrida anterior se reemplaza (los pagos avisados en el portal no son de la hoja y se quedan).
  await s.from("proveedor_pagos").delete().eq("proveedor_id", prov.id).eq("origen", "hoja");
  await s.from("proveedor_historial").delete().eq("proveedor_id", prov.id);
  await s.from("proveedor_pedidos").update({ anticipo_monto: null }).eq("proveedor_id", prov.id).not("anticipo_monto", "is", null);

  const historial = filas.map(({ fila, pais, clave }, i) => ({
    proveedor_id: prov.id,
    pedido_id: pareja.get(i) ?? null,
    clave,
    hoja: pais,
    pais_codigo: pais,
    producto: fila.producto,
    unidades: fila.unidades,
    monto_total: fila.monto,
    anticipo_monto: fila.anticipo,
    fecha_envio: fila.fechaEnvio,
    fecha_llegada: fila.fechaLlegada,
  }));
  const ids = new Map<string, string>();
  for (let i = 0; i < historial.length; i += 500) {
    const { data, error: e } = await s.from("proveedor_historial").insert(historial.slice(i, i + 500)).select("id, clave");
    if (e) throw new Error("No se pudo guardar el historial: " + e.message);
    for (const r of data ?? []) ids.set(r.clave as string, r.id as string);
  }
  const filasPago = filas.flatMap(({ fila, clave }, i) =>
    (["anticipo", "saldo"] as const).flatMap((cuota) =>
      (cuota === "anticipo" ? fila.pagosAnticipo : fila.pagosSaldo).map((p) => ({ proveedor_id: prov.id, pedido_id: pareja.get(i) ?? null, historial_id: ids.get(clave)!, cuota, monto: p.monto, fecha: p.fecha, origen: "hoja" })),
    ),
  );
  for (let i = 0; i < filasPago.length; i += 500) {
    const { error: e } = await s.from("proveedor_pagos").insert(filasPago.slice(i, i + 500));
    if (e) throw new Error("No se pudieron guardar los pagos: " + e.message);
  }
  // El anticipo distinto del 50 % (UPS: todo por adelantado) queda en el pedido.
  let distintos = 0;
  for (const [i, pedidoId] of pareja) {
    const f = filas[i].fila;
    if (Math.abs(f.anticipo - f.monto / 2) > 1) {
      distintos++;
      await s.from("proveedor_pedidos").update({ anticipo_monto: f.anticipo }).eq("id", pedidoId);
    }
  }
  console.log(`Guardado: ${historial.length} filas de historial, ${filasPago.length} pagos, ${distintos} pedidos con anticipo distinto del 50 %.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

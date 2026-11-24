import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ETAPAS_COMPRA } from "../../app/(app)/compras/def-compras";
import { ETAPAS_LLEGADA_PUERTO, esLlegadaPuerto } from "./etapas-puerto";
import { armarAviso, desdeDeLista, diasDeLista, llegadaDeEtapa, unaPorCompra, pagadoTrasSegundoPago, revisarPago, textoProductos, totalesDeLlegada, filaSinMontos, type FilaLlegada } from "./llegadas-avisos";

const fila = (o: Partial<FilaLlegada> = {}): FilaLlegada => ({
  compraId: "c1",
  orden: "OC-0101",
  codigo: "ECOM01-0525",
  productos: [{ codigo: "ACEITE/OREGANO", nombre: "Aceite de orégano" }],
  unidades: 500,
  cajas: 10,
  etiquetasRutas: [],
  segundoPago: 1200,
  pagadoEn: null,
  montoPagado: null,
  pagadoPor: null,
  etapa: "en_bodega",
  ...o,
});

test("el flujo de etapas queda 04 Producción → 05 Tracking → 06 Llegada a Puerto → 07 En Bodega → 08 Completado", () => {
  const etiquetas = Object.fromEntries(ETAPAS_COMPRA.map((e) => [e.valor, e.etiqueta]));
  assert.equal(etiquetas.produccion, "04 - En Producción");
  assert.equal(etiquetas.tracking, "05 - Tracking");
  assert.equal(etiquetas.arribo_mercancia, "06 - Llegada a Puerto");
  assert.equal(etiquetas.en_bodega, "07 - En Bodega");
  assert.equal(etiquetas.completado, "08 - Completado");
  const orden = ETAPAS_COMPRA.map((e) => e.valor);
  assert.ok(orden.indexOf("arribo_mercancia") < orden.indexOf("en_bodega") && orden.indexOf("en_bodega") < orden.indexOf("completado"));
});

test("la migración acepta la etapa nueva y la de las acciones es la misma que la del código", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0359_compras_llegada_puerto_lotes.sql", import.meta.url), "utf8");
  for (const e of ETAPAS_COMPRA) assert.match(sql, new RegExp(`'${e.valor}'`), e.valor);
});

test("solo Llegada a Puerto y En Bodega avisan", () => {
  assert.deepEqual(llegadaDeEtapa("arribo_mercancia"), { tipo: "puerto", evento: "llegada_puerto" });
  assert.deepEqual(llegadaDeEtapa("en_bodega"), { tipo: "bodega", evento: "llegada_bodega" });
  for (const e of ["tracking", "completado", "produccion", "descartado"]) assert.equal(llegadaDeEtapa(e), null, e);
});

test("las etapas por lote avisan igual que Llegada a Puerto y están en la lista de etapas", () => {
  for (const e of ETAPAS_LLEGADA_PUERTO) {
    assert.deepEqual(llegadaDeEtapa(e), { tipo: "puerto", evento: "llegada_puerto" }, e);
    assert.ok(ETAPAS_COMPRA.some((x) => x.valor === e), e);
  }
  const etiquetas = Object.fromEntries(ETAPAS_COMPRA.map((e) => [e.valor, e.etiqueta]));
  assert.equal(etiquetas.llegada_puerto_lote_1, "06 - Llegada a Puerto - Lote 1");
  assert.equal(etiquetas.llegada_puerto_lote_3, "06 - Llegada a Puerto - Lote 3");
  assert.ok(esLlegadaPuerto("llegada_puerto_lote_2") && !esLlegadaPuerto("en_bodega") && !esLlegadaPuerto(null));
});

test("totales: unidades, cajas, por pagar y ya pagado", () => {
  const t = totalesDeLlegada([
    fila(),
    fila({ compraId: "c2", unidades: 300, cajas: null, segundoPago: 800 }),
    fila({ compraId: "c3", unidades: null, cajas: 4, segundoPago: null }),
    fila({ compraId: "c4", pagadoEn: "2026-11-20", montoPagado: 500, segundoPago: 500 }),
  ]);
  assert.equal(t.compras, 4);
  assert.equal(t.unidades, 500 + 300 + 500);
  assert.equal(t.cajas, 10 + 4 + 10);
  assert.equal(t.sinCajas, 1);
  assert.equal(t.porPagar, 1200 + 800);
  assert.equal(t.sinMonto, 1);
  assert.equal(t.pagado, 500);
  assert.equal(t.pendientes, 3);
});

test("el aviso a Logística trae productos, unidades y cajas", () => {
  const a = armarAviso("puerto", [fila(), fila({ compraId: "c2", orden: "OC-0102", productos: [{ codigo: null, nombre: "Crema Nida" }], unidades: 1000, cajas: 25 })]);
  assert.match(a.titulo, /2 compras/);
  assert.match(a.titulo, /1\.500 unidades|1,500 unidades|1500 unidades/);
  assert.match(a.texto, /ACEITE\/OREGANO · Aceite de orégano/);
  assert.match(a.texto, /Crema Nida/);
  assert.match(a.texto, /35 cajas/);
});

test("el aviso a Pagos trae el monto de cada compra y el total", () => {
  const a = armarAviso("bodega", [fila(), fila({ compraId: "c2", segundoPago: 800.5 }), fila({ compraId: "c3", segundoPago: null })]);
  assert.match(a.titulo, /\$2[.,]000\.50|\$2[.,]000,50|\$2000\.50/);
  assert.match(a.texto, /sin monto/);
});

test("un aviso largo se resume con «+N más»", () => {
  const filas = Array.from({ length: 7 }, (_, i) => fila({ compraId: `c${i}` }));
  assert.match(armarAviso("puerto", filas).texto, /\+3 más/);
  assert.match(textoProductos(fila({ productos: [{ codigo: "A", nombre: "a" }, { codigo: "B", nombre: "b" }, { codigo: "C", nombre: "c" }] })), /\+1 más/);
  assert.equal(textoProductos(fila({ productos: [] })), "ECOM01-0525");
});

test("registrar el pago: monto y día válidos, y el pagado a proveedor nunca baja", () => {
  assert.deepEqual(revisarPago("1200,50", "2026-11-16", "2026-11-16"), { monto: 1200.5, dia: "2026-11-16" });
  assert.ok("error" in revisarPago(0, "2026-11-16", "2026-11-16"));
  assert.ok("error" in revisarPago(100, "2026-11-17", "2026-11-16"));
  assert.ok("error" in revisarPago(100, "mañana", "2026-11-16"));
  assert.equal(pagadoTrasSegundoPago(null, 1000, 1200), 2200);
  assert.equal(pagadoTrasSegundoPago(5000, 1000, 1200), 5000);
  assert.equal(pagadoTrasSegundoPago(2000, null, 1200), 2000);
});

test("la lista de todas las llegadas: periodos válidos, desde las 00:00 de Panamá y una vez por compra", () => {
  assert.equal(diasDeLista("30"), 30);
  assert.equal(diasDeLista(["1"]), 1);
  assert.equal(diasDeLista("5"), 7, "un periodo que no existe vuelve al de entrada");
  assert.equal(diasDeLista(undefined), 7);
  assert.equal(desdeDeLista("2026-11-17", 1), "2026-11-17T00:00:00-05:00");
  assert.equal(desdeDeLista("2026-11-17", 7), "2026-11-11T00:00:00-05:00");
  assert.equal(desdeDeLista("2026-03-02", 7), "2026-02-24T00:00:00-05:00");
  const filas = [fila({ compraId: "a", llegadaId: "nueva" }), fila({ compraId: "b" }), fila({ compraId: "a", llegadaId: "vieja" })];
  assert.deepEqual(unaPorCompra(filas).map((f) => [f.compraId, f.llegadaId]), [["a", "nueva"], ["b", undefined]]);
});

test("el aviso de llegada a puerto lleva a la lista; el de bodega conserva su llegada", async () => {
  const { hrefDeAviso, esAvisoDePuerto, RUTA_LISTA_PUERTO } = await import("./llegadas-avisos");
  assert.equal(esAvisoDePuerto("Llega a puerto: 3 compras · 900 unidades"), true);
  assert.equal(esAvisoDePuerto("En bodega: $120.00 por pagar de 1 compra"), false);
  assert.equal(hrefDeAviso("Llega a puerto: 1 compra · 10 unidades", "/llegadas/abc"), RUTA_LISTA_PUERTO);
  assert.equal(hrefDeAviso("En bodega: $120.00 por pagar de 1 compra", "/llegadas/abc"), "/llegadas/abc");
  assert.equal(hrefDeAviso("Llega a puerto: x", "/compras/lista"), "/compras/lista");
});

test("sin ver el segundo pago, la fila llega sin montos ni día del pago, pero dice si se pagó (auditoría, 18 nov 2026)", () => {
  const pagada = filaSinMontos(fila({ pagadoEn: "2026-11-10", montoPagado: 1200, pagadoPor: "Francis" }));
  assert.equal(pagada.segundoPago, null);
  assert.equal(pagada.montoPagado, null);
  assert.equal(pagada.pagadoEn, null);
  assert.equal(pagada.pagada, true);
  assert.equal(filaSinMontos(fila()).pagada, false);
  assert.equal(totalesDeLlegada([pagada, filaSinMontos(fila())]).pendientes, 1);
});

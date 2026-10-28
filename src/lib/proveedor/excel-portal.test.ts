import assert from "node:assert/strict";
import test from "node:test";
import { hojaCotizados, hojaEnviados, hojaPagos, hojaPorCotizar, hojaProduccion, type ContextoExcel } from "./excel-portal";
import type { PedidoPortal } from "./datos";
import { CAMPOS_REGISTRO, type FilaRegistro } from "./registro-pagos";
import { TEXTOS } from "./textos";

const pedido = (extra: Partial<PedidoPortal> = {}): PedidoPortal => ({
  id: "p1", compraId: "c1", referencia: "OC-1088", producto: "Cepillo de vapor", fotoReferencia: null, paisCodigo: "PA", via: "mar", modalidad: "FCL", etapa: "produccion",
  unidadesPedidas: 1000, unidades: 960, montoTotal: 2400, costoUnitario: 2.5, notaParaProveedor: "Urgente", fechaEnvio: "2026-10-01", fechaLlegada: null, primerPago: null, fechaPago1: null,
  segundoPago: null, fechaPago2: null, pagadoAProveedor: null, fotoRealRuta: null, comentarioProveedor: "Caja de 48", cotizadoEn: null, actualizadoEn: "2026-10-20T00:00:00Z",
  anticipoMonto: null, confirmadoEn: "2026-10-20T15:30:00Z", ...extra,
});
const ctx = (idioma: "es" | "zh"): ContextoExcel => ({ t: TEXTOS[idioma], tr: (s) => (s ? (idioma === "zh" ? `ZH ${s}` : s) : ""), via: (p) => `${p.via === "aire" ? "Aéreo" : "Marítimo"} ${p.modalidad ?? ""}`.trim() });

function coherente(h: { columnas: unknown[]; filas: { celdas: unknown[] }[] }) {
  for (const f of h.filas) assert.equal(f.celdas.length, h.columnas.length);
}

test("cada pestaña da una celda por columna y una fila por pedido, con la llave de la fila", () => {
  const ps = [pedido(), pedido({ id: "p2", unidades: null, montoTotal: null })];
  for (const h of [hojaPorCotizar(ps, ctx("es")), hojaCotizados(ps, ctx("es")), hojaProduccion(ps, ctx("es"))]) {
    coherente(h);
    assert.deepEqual(h.filas.map((f) => f.id), ["p1", "p2"]);
  }
});

test("los títulos salen en el idioma de la persona y lo escrito por personas, traducido", () => {
  const zh = hojaCotizados([pedido()], ctx("zh"));
  assert.equal(zh.columnas[0].titulo, TEXTOS.zh.colProducto);
  assert.equal(zh.filas[0].celdas[0], "ZH Cepillo de vapor");
  assert.equal(zh.filas[0].celdas.at(-1), "ZH Caja de 48");
  assert.equal(hojaCotizados([pedido()], ctx("es")).columnas[0].titulo, TEXTOS.es.colProducto);
});

test("números y fechas van como valores: la confirmación en día de Panamá", () => {
  const h = hojaProduccion([pedido()], ctx("es"));
  const i = h.columnas.findIndex((c) => c.titulo === TEXTOS.es.colConfirmado);
  assert.equal(h.columnas[i].tipo, "fecha");
  assert.equal(h.filas[0].celdas[i], "2026-10-20");
  assert.equal(h.filas[0].celdas[h.columnas.findIndex((c) => c.titulo === TEXTOS.es.colTotal)], 2400);
  assert.equal(hojaProduccion([pedido({ confirmadoEn: null })], ctx("es")).filas[0].celdas[i], null);
});

test("enviados lleva los días, el plazo prometido y el estado tal como se ven", () => {
  const h = hojaEnviados([{ p: pedido({ etapa: "enviado" }), dias: 27, plazo: "60-80 d", estado: "Faltan 53 d" }], ctx("es"));
  coherente(h);
  assert.deepEqual(h.filas[0].celdas.slice(-3), [27, "60-80 d", "Faltan 53 d"]);
  assert.equal(h.filas[0].celdas[h.columnas.findIndex((c) => c.titulo === TEXTOS.es.colEnviado)], "2026-10-01");
});

test("pagos: producto, código, país y las 11 columnas del registro, con su tipo", () => {
  const valores = Object.fromEntries(CAMPOS_REGISTRO.map((c) => [c, null])) as FilaRegistro["valores"];
  Object.assign(valores, { producto: "Cepillo", unidades: 960, monto: 2400, fecha_envio: "2026-10-01", sin_pagar: 1200, saldo: 1200 });
  const f: FilaRegistro = { fila: "p1", pedidoId: "p1", referencia: "OC-1088", foto: null, paisCodigo: "PA", valores, editadas: [], estadoAnticipo: null };
  const h = hojaPagos([f], ctx("es"));
  coherente(h);
  assert.equal(h.columnas.length, 3 + 11);
  assert.equal(h.filas[0].id, "p1");
  assert.equal(h.columnas[3].tipo, "entero");
  assert.equal(h.columnas[5].tipo, "fecha");
  assert.equal(h.filas[0].celdas[4], 2400);
});

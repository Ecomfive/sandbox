import assert from "node:assert/strict";
import test from "node:test";
import { despachoDeItem, faltaCompletar, sugerirMapeo } from "../monday/columnas";
import { colorDe, diaIso, diaTexto, etiquetaLimpia, grupoDevolucion, grupoPorAsesores, rangoElegido, sinDuplicados, sumasGrupo, textoSobre, type FilaDespacho } from "./etiquetas";

test("etiquetas: el nombre limpio corrige los errores de Monday y conserva lo desconocido", () => {
  assert.equal(etiquetaLimpia("courier", "DEIMIBLE CIUDAD"), "DEIMIBEL CIUDAD");
  assert.equal(etiquetaLimpia("courier", "GILBERTO    PARRA"), "GILBERTO PARRA");
  assert.equal(etiquetaLimpia("courier", "Andres Alvarez"), "ANDRÉS ÁLVAREZ");
  assert.equal(etiquetaLimpia("forma_pago", "MiPOS."), "MiPOS");
  assert.equal(etiquetaLimpia("courier", "  NUEVO  REPARTIDOR "), "NUEVO REPARTIDOR");
  assert.equal(etiquetaLimpia("estado", ""), null);
  assert.equal(colorDe("estado", "ENTREGADO"), "#00c875");
  assert.equal(colorDe("courier", "NUEVO REPARTIDOR"), "#9ca3af");
  assert.equal(textoSobre("#ffcb00"), "#18181b");
  assert.equal(textoSobre("#333333"), "#ffffff");
});

test("devoluciones: grupos de Monday y la regla de DESINTEGRADO", () => {
  assert.equal(grupoDevolucion("DEVOLUCION CIUDAD"), "DEVOLUCIÓN CIUDAD");
  assert.equal(grupoDevolucion("RECHAZADOS/CANCELADOS"), "RECHAZADOS / CANCELADOS");
  assert.equal(grupoDevolucion("REALIZADOS/REPROGRAMADOS"), "REALIZADOS / REPROGRAMADOS");
  assert.equal(grupoPorAsesores("desintegrado"), "RECHAZADOS / CANCELADOS");
  assert.equal(grupoPorAsesores("PENDIENTE"), null);
});

test("días: de Monday al sistema y de vuelta", () => {
  assert.equal(diaIso("14/11/2026"), "2026-11-14");
  assert.equal(diaIso("2026-11-14"), "2026-11-14");
  assert.equal(diaIso("DEVOLUCION CIUDAD"), null);
  assert.equal(diaTexto("2026-11-04"), "04/11/2026");
});

test("sin duplicados: manda lo editado en el sistema, luego el tablero del repartidor y no el consolidado", () => {
  const f = (itemId: string, tableroId: string, extra: Partial<FilaDespacho> = {}): FilaDespacho => ({ itemId, tableroId, origen: "monday", editadoEn: null, actualizado: "2026-11-12T10:00:00Z", numero: "1456", tienda: "KENKU", dia: "2026-11-12", ...extra });
  const conso = f("1", "CONSO", { actualizado: "2026-11-30T10:00:00Z" });
  const rep = f("2", "JULY");
  assert.deepEqual(sinDuplicados([conso, rep], "CONSO").map((x) => x.itemId), ["2"]);
  const editada = f("1", "CONSO", { editadoEn: "2026-11-13T10:00:00Z" });
  assert.deepEqual(sinDuplicados([editada, rep], "CONSO").map((x) => x.itemId), ["1"]);
  // Otro día u otra tienda no es el mismo; «(copy)» sí.
  assert.equal(sinDuplicados([rep, f("3", "JULY", { dia: "2026-11-13" }), f("4", "JULY", { tienda: "OFERFY" })], "CONSO").length, 3);
  assert.deepEqual(sinDuplicados([rep, f("5", "CONSO", { numero: "1456 (copy)" })], "CONSO").map((x) => x.itemId), ["2"]);
  assert.equal(sinDuplicados([f("6", "JULY", { numero: null }), f("7", "JULY", { numero: null })], "CONSO").length, 2);
});

test("sumas del grupo", () => {
  assert.deepEqual(sumasGrupo([
    { estado: "ENTREGADO", porCobrar: 32.9, cobrado: null, costeEnvio: 3.65 },
    { estado: "FALLIDO", porCobrar: 41.98, cobrado: 41.98, costeEnvio: 5 },
  ]), { pedidos: 2, entregados: 1, porCobrar: 74.88, cobrado: 41.98, costeEnvio: 8.65 });
});

test("Monday: las columnas nuevas se reconocen por el título y se leen del ítem", () => {
  const columnas = [
    ["name", "Name"], ["tienda", "Tienda"], ["delivery", "Delivery"], ["estado", "Estado"], ["edo", "Edo. Pago"], ["forma", "Forma de Pago"],
    ["porcobrar", "$ Por Cobrar"], ["cobrado", "$ Cobrado"], ["comp", "Comprobante"], ["coment", "Comentario"], ["coste", "Coste Envío"], ["turno", "CAMBIO/RETIRO / TURNO"],
  ].map(([id, titulo]) => ({ id, titulo, tipo: "text" }));
  const m = sugerirMapeo(columnas);
  assert.equal(m.edo_pago, "edo");
  assert.equal(m.por_cobrar, "porcobrar");
  assert.equal(m.monto_cobrado, "cobrado");
  assert.equal(m.coste_envio, "coste");
  assert.equal(m.turno, "turno");
  assert.equal(m.comentario, "coment");
  assert.equal(m.comprobante, "comp");
  assert.equal(faltaCompletar(m), false);
  assert.equal(faltaCompletar({ pedido: "name", estado: "estado" }), true);
  const v = (id: string, text: string) => ({ id, text, value: null });
  const d = despachoDeItem(
    { id: "99", name: "1456", updated_at: "2026-11-12T21:05:50Z", grupo: "12/11/2026", column_values: [v("estado", "ENTREGADO"), v("edo", "PAGADO"), v("porcobrar", "32.9"), v("coste", "3.65"), v("turno", "1ER. TURNO"), v("coment", "Llamar antes"), v("comp", "https://oferfly.monday.com/protected_static/1/a.jpg, https://oferfly.monday.com/protected_static/1/b.jpg")] },
    { ...m, pedido: "name" },
  );
  assert.equal(d.grupo, "12/11/2026");
  assert.equal(d.edo_pago, "PAGADO");
  assert.equal(d.por_cobrar, 32.9);
  assert.equal(d.coste_envio, 3.65);
  assert.equal(d.turno, "1ER. TURNO");
  assert.equal(d.comentario, "Llamar antes");
  assert.equal(d.comprobantes.length, 2);
});

test("día o rango elegido para los cierres de los mensajeros", () => {
  assert.deepEqual(rangoElegido("2026-11-20", undefined), { desde: "2026-11-20", hasta: "2026-11-20" });
  assert.deepEqual(rangoElegido("2026-11-20", "2026-11-16"), { desde: "2026-11-16", hasta: "2026-11-20" });
  assert.deepEqual(rangoElegido("2026-09-01", "2026-12-31"), { desde: "2026-09-01", hasta: "2026-11-01" });
  assert.equal(rangoElegido("20/11/2026", "2026-11-21"), null);
  assert.equal(rangoElegido(undefined, "2026-11-21"), null);
  assert.deepEqual(rangoElegido("2026-11-20", "no"), { desde: "2026-11-20", hasta: "2026-11-20" });
});

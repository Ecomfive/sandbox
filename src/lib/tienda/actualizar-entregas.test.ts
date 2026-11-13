import assert from "node:assert/strict";
import { test } from "node:test";
import { cambioDeEntrega, type DatoGuia, type DatoMonday, type OrdenParaEntrega } from "./actualizar-entregas";

const orden = (o: Partial<OrdenParaEntrega> = {}): OrdenParaEntrega => ({ id: "o1", numero: "#1006", fase: "despachada", fecha: "2026-10-15", congelada: false, cod_esperado: 32.9, transportista: null, guia: null, ...o });
const monday = (m: Partial<DatoMonday> = {}): DatoMonday => ({ estado_grupo: "entregado", estado: "ENTREGADO", courier: "Aníbal Pérez", causa_rechazo: null, fecha: "2026-10-16", ...m });
const guia = (g: Partial<DatoGuia> = {}): DatoGuia => ({ guia: "2400123", estado_grupo: "entregado", estado: "ENTREGADA", fecha_estado: "2026-10-20", recaudo: 32.9, ultimo_motivo: null, ...g });
const nada = new Set<string>();

test("Monday entregado: la orden de ciudad pasa a entregada con el día del reparto y su repartidor", () => {
  const c = cambioDeEntrega(orden(), monday(), null, nada);
  assert.equal(c?.fase, "entregada");
  assert.equal(c?.fuente, "monday");
  assert.equal(c?.set.entregada_en, "2026-10-16T17:00:00.000Z");
  assert.equal(c?.set.transportista, "Aníbal Pérez");
  assert.equal(c?.set.cod_cobrado, undefined, "el contra entrega queda por remitir con lo esperado");
});

test("Monday rechazado: devuelta, con la causa y sin contra entrega por cobrar", () => {
  const c = cambioDeEntrega(orden(), monday({ estado_grupo: "rechazado", estado: "RECHAZADO", causa_rechazo: "No contesta" }), null, nada);
  assert.equal(c?.fase, "devuelta");
  assert.equal(c?.set.cod_esperado, null);
  assert.match(String(c?.set.motivo_cancelacion), /RECHAZADO \(No contesta\)/);
});

test("Servientrega manda sobre Monday y deja la guía y lo recaudado", () => {
  const c = cambioDeEntrega(orden(), monday({ estado_grupo: "rechazado" }), guia({ recaudo: 30 }), nada);
  assert.equal(c?.fuente, "servientrega");
  assert.equal(c?.fase, "entregada");
  assert.equal(c?.set.guia, "2400123");
  assert.equal(c?.set.transportista, "Servientrega");
  assert.equal(c?.set.cod_cobrado, 30);
  assert.equal(cambioDeEntrega(orden({ cod_esperado: 0 }), null, guia(), nada)?.set.cod_cobrado, undefined, "lo pagado por adelantado no lleva cobro");
});

test("Servientrega devuelta; en ruta o con novedad no cambia nada, aunque Monday diga entregado", () => {
  assert.equal(cambioDeEntrega(orden(), null, guia({ estado_grupo: "devuelto", estado: "DEVUELTA", ultimo_motivo: "Dirección errada" }), nada)?.fase, "devuelta");
  assert.equal(cambioDeEntrega(orden(), monday(), guia({ estado_grupo: "en_ruta" }), nada), null);
  assert.equal(cambioDeEntrega(orden(), null, guia({ estado_grupo: "novedad" }), nada), null);
});

test("solo órdenes despachadas, sin congelar y de un mes abierto", () => {
  assert.equal(cambioDeEntrega(orden({ fase: "entregada" }), monday(), null, nada), null);
  assert.equal(cambioDeEntrega(orden({ fase: "confirmada" }), monday(), null, nada), null);
  assert.equal(cambioDeEntrega(orden({ congelada: true }), monday(), null, nada), null);
  assert.equal(cambioDeEntrega(orden(), monday(), null, new Set(["2026-10"])), null);
  assert.equal(cambioDeEntrega(orden(), monday({ estado_grupo: "en_ruta" }), null, nada), null);
  assert.equal(cambioDeEntrega(orden(), monday({ estado_grupo: "sin_estado" }), null, nada), null);
  assert.equal(cambioDeEntrega(orden(), null, null, nada), null);
});

test("sin fecha en Monday, el momento de ahora; el transportista que ya tenía no se pisa", () => {
  const c = cambioDeEntrega(orden({ transportista: "Kenku ciudad" }), monday({ fecha: null }), null, nada);
  assert.ok(typeof c?.set.entregada_en === "string");
  assert.equal(c?.set.transportista, undefined);
});

test("DESINTEGRADO de los asesores (13 nov 2026): devuelta, con lo que anotaron los asesores y lo del repartidor como evidencia", () => {
  const c = cambioDeEntrega(
    orden(),
    monday({ estado_grupo: "rechazado", estado: "POSPUESTO", causa_rechazo: "no contesta", estado_asesores: "DESINTEGRADO", observaciones_asesores: "3er msj sin respuesta", fecha: "2026-11-09" }),
    null,
    nada,
  );
  assert.equal(c?.fase, "devuelta");
  assert.equal(c?.set.motivo_cancelacion, "Monday · asesores: DESINTEGRADO (3er msj sin respuesta) · repartidor: POSPUESTO (no contesta)");
  assert.equal(c?.set.fecha_devolucion, "2026-11-09");
});

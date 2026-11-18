import assert from "node:assert/strict";
import test from "node:test";
import { acierto, coincideConPropuesta, faltaVigente, resultadoFinal, revisarVeredicto, seleccionarEjemplos } from "./revision";

const etiquetas = { etiquetaCiudad: "CIUDAD", etiquetaInterior: "INTERIOR/SERVIENTREGA" };

test("revisarVeredicto: completa con zona, o incompleta con lo que falta", () => {
  assert.deepEqual(revisarVeredicto({ completa: true, zona: "ciudad" }, true), { veredicto: { completa: true, zona: "ciudad", falta: null } });
  assert.deepEqual(revisarVeredicto({ completa: true, zona: "interior" }, false), { veredicto: { completa: true, zona: null, falta: null } });
  assert.deepEqual(revisarVeredicto({ completa: false, falta: "  el número   de casa " }, true), { veredicto: { completa: false, zona: null, falta: "el número de casa" } });
  assert.ok("error" in revisarVeredicto({ completa: true }, true), "donde se distingue, completa pide zona");
  assert.ok("error" in revisarVeredicto({ completa: true, zona: "otra" }, true));
  assert.ok("error" in revisarVeredicto({ completa: false, falta: " " }, true));
  assert.ok("error" in revisarVeredicto({}, true));
});

test("coincideConPropuesta: listo, falta un dato y lo que el sistema no pudo decidir", () => {
  const v = (completa: boolean, zona: "ciudad" | "interior" | null = null) => ({ completa, zona, falta: completa ? null : "algo" });
  assert.equal(coincideConPropuesta({ estado: "listo", zona: "ciudad" }, v(true, "ciudad"), true), true);
  assert.equal(coincideConPropuesta({ estado: "listo", zona: "ciudad" }, v(true, "interior"), true), false);
  assert.equal(coincideConPropuesta({ estado: "listo", zona: null }, v(true), false), true, "sin zona en el país, solo cuenta que esté completa");
  assert.equal(coincideConPropuesta({ estado: "listo", zona: "ciudad" }, v(false), true), false);
  assert.equal(coincideConPropuesta({ estado: "falta_dato", zona: null }, v(false), true), true);
  assert.equal(coincideConPropuesta({ estado: "falta_dato", zona: null }, v(true, "ciudad"), true), false);
  assert.equal(coincideConPropuesta({ estado: "revisar", zona: null }, v(true, "ciudad"), true), null);
  assert.equal(coincideConPropuesta({ estado: "error", zona: null }, v(false), true), null);
});

test("resultadoFinal: lo que dijo el equipo manda sobre lo que dijo la IA", () => {
  const base = { estado: "revisar" as const, zona: null, etiqueta: null, falta: null };
  assert.deepEqual(resultadoFinal({ ...base, revision: null }, etiquetas), { estado: "revisar", zona: null, etiqueta: null, falta: null });
  const revisado = (r: { completa: boolean; zona: "ciudad" | "interior" | null; falta: string | null }) => ({ ...r, ok: null, por: "Ana", en: "2026-11-16T10:00:00Z" });
  assert.deepEqual(resultadoFinal({ ...base, revision: revisado({ completa: true, zona: "interior", falta: null }) }, etiquetas), { estado: "listo", zona: "interior", etiqueta: "INTERIOR/SERVIENTREGA", falta: null });
  assert.deepEqual(resultadoFinal({ estado: "listo", zona: "ciudad", etiqueta: "CIUDAD", falta: null, revision: revisado({ completa: false, zona: null, falta: "la calle" }) }, etiquetas), { estado: "falta_dato", zona: null, etiqueta: null, falta: "la calle" });
});

test("acierto: solo cuenta lo que el sistema había propuesto", () => {
  const r = (ok: boolean | null) => ({ revision: { ok } });
  assert.deepEqual(acierto([r(true), r(true), r(false), r(null), { revision: null }]), { revisados: 4, conPropuesta: 3, acertados: 2 });
  assert.deepEqual(acierto([]), { revisados: 0, conPropuesta: 0, acertados: 0 });
});

test("seleccionarEjemplos reparte las completas entre ciudad e interior y deja las incompletas más recientes", () => {
  const e = (id: number, completa: boolean, zona: "ciudad" | "interior" | null = null) => ({ id, completa, zona });
  const filas = [e(1, true, "ciudad"), e(2, true, "ciudad"), e(3, true, "ciudad"), e(4, true, "ciudad"), e(5, true, "interior"), e(6, false), e(7, false), e(8, false)];
  const r = seleccionarEjemplos(filas, 3);
  assert.deepEqual(r.filter((x) => x.completa).map((x) => x.id), [1, 5, 2], "ciudad, interior y otra vez ciudad: no solo ciudad");
  assert.deepEqual(r.filter((x) => !x.completa).map((x) => x.id), [6, 7, 8]);
  assert.equal(seleccionarEjemplos([e(1, true, "ciudad"), e(2, true, "ciudad")], 5).length, 2, "si no hay más, no inventa");
});

test("faltaVigente: lo que marcó el equipo manda; sin revisión, lo que dijo la IA", () => {
  assert.equal(faltaVigente({ estado: "falta_dato", falta: "la calle" }), "la calle");
  assert.equal(faltaVigente({ estado: "listo", falta: null }), null);
  assert.equal(faltaVigente({ estado: "revisar", rev_en: "2026-11-16", rev_completa: false, rev_falta: "el número de casa" }), "el número de casa", "marcado a mano como falta un dato");
  assert.equal(faltaVigente({ estado: "falta_dato", falta: "la calle", rev_en: "2026-11-16", rev_completa: true }), null, "el equipo dijo que estaba completa");
  assert.equal(faltaVigente({ estado: "falta_dato", falta: "la calle", rev_en: null }), "la calle");
});

test("«Falta un dato» sobre un pedido en espera de pago: primero el cobro, y la dirección se pide cuando el pago llegó", () => {
  const revision = { completa: false, zona: null, falta: "la calle", ok: null, por: "Ana", en: "2026-11-18T10:00:00Z" };
  const f = { estado: "adelantado" as const, zona: null, etiqueta: null, falta: null, revision };
  assert.deepEqual(resultadoFinal(f, etiquetas), { estado: "adelantado", zona: null, etiqueta: null, falta: "la calle" });
  assert.deepEqual(resultadoFinal(f, etiquetas, true), { estado: "falta_dato", zona: null, etiqueta: null, falta: "la calle" }, "con el pago ya hecho se le puede pedir la dirección");
  assert.equal(resultadoFinal({ ...f, estado: "listo" }, etiquetas).estado, "falta_dato", "fuera del pago por adelantado nada cambia");
});

test("pago por adelantado marcado por el equipo: queda en espera de pago, sin etiqueta, y es un ejemplo propio", () => {
  assert.deepEqual(revisarVeredicto({ completa: true, zona: "adelantado" }, true), { veredicto: { completa: true, zona: "adelantado", falta: null } });
  const base = { estado: "revisar" as const, zona: null, etiqueta: null, falta: null };
  const revision = { completa: true, zona: "adelantado" as const, falta: null, ok: null, por: "Ana", en: "2026-11-17T10:00:00Z" };
  assert.deepEqual(resultadoFinal({ ...base, revision }, etiquetas), { estado: "adelantado", zona: null, etiqueta: null, falta: null });
  assert.equal(coincideConPropuesta({ estado: "listo", zona: "interior" }, { completa: true, zona: "adelantado", falta: null }, true), false);
  const ej = (zona: "ciudad" | "interior" | "adelantado", n: number) => ({ id: `${zona}${n}`, completa: true, zona });
  const elegidos = seleccionarEjemplos([ej("ciudad", 1), ej("ciudad", 2), ej("interior", 1), ej("adelantado", 1), ej("adelantado", 2)], 4);
  assert.ok(elegidos.some((e) => e.zona === "adelantado"), "el pago por adelantado entra entre los ejemplos aunque haya de las otras");
});

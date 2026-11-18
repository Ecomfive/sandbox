import assert from "node:assert/strict";
import test from "node:test";
import { combinar, etiquetaDeZona, faltaParaCliente, leerRespuesta, limpiarFalta, mensajePedirDetalle, type ResultadoModelo } from "./combinar";

const ok = (proveedor: "openai" | "anthropic", zona: "ciudad" | "interior" | "adelantado" | "no_se", completa: boolean, falta: string | null = null): ResultadoModelo => ({
  proveedor,
  ok: true,
  respuesta: { zona, completa, falta, motivo: "porque sí" },
});

test("lee la respuesta de una IA aunque venga con texto o en un bloque de código", () => {
  const r = leerRespuesta('Claro:\n```json\n{"zona":"Interior","completa":false,"falta":"El número de casa.","motivo":"no trae casa"}\n```');
  assert.deepEqual(r, { zona: "interior", completa: false, falta: "el número de casa", motivo: "no trae casa" });
  assert.equal(leerRespuesta('{"zona":"ciudad","completa":true,"falta":"algo","motivo":""}')?.falta, null);
  assert.equal(leerRespuesta("no sé"), null);
  assert.equal(leerRespuesta('{"zona":"otra","completa":true}'), null);
  assert.equal(leerRespuesta('{"zona":"ciudad","completa":"si"}'), null);
});

test("lo que falta sale limpio para un mensaje", () => {
  assert.equal(limpiarFalta("  Un punto de referencia. "), "un punto de referencia");
  assert.equal(limpiarFalta("llama al +507 6123-4567 o entra a https://x.com"), "llama al o entra a");
  assert.equal(limpiarFalta("ab"), null);
  assert.equal(limpiarFalta(null), null);
});

test("las dos IA coinciden: lista con zona; si una duda, a revisar", () => {
  const a = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "ciudad", true), ok("anthropic", "ciudad", true)] });
  assert.deepEqual([a.estado, a.zona, a.zonaPor, a.acuerdo], ["listo", "ciudad", "ia", true]);
  const b = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "ciudad", true), ok("anthropic", "interior", true)] });
  assert.deepEqual([b.estado, b.zona, b.acuerdo], ["revisar", null, false]);
  const c = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "no_se", true), ok("anthropic", "no_se", true)] });
  assert.equal(c.estado, "revisar");
});

test("una palabra de zona del equipo manda sobre las IA", () => {
  const r = combinar({ distingueZona: true, zonaReglas: "interior", modelos: [ok("openai", "ciudad", true), ok("anthropic", "ciudad", true)] });
  assert.deepEqual([r.estado, r.zona, r.zonaPor], ["listo", "interior", "regla"]);
});

test("incompleta: se pide lo que falta antes de decidir la zona", () => {
  const r = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "ciudad", true), ok("anthropic", "ciudad", false, "el número de casa")] });
  assert.deepEqual([r.estado, r.completa, r.falta], ["falta_dato", false, "el número de casa"]);
});

test("con una sola IA contesta esa; sin ninguna, error; sin zona en el país, solo si está completa", () => {
  const una = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "interior", true), { proveedor: "anthropic", ok: false, error: "sin clave" }] });
  assert.deepEqual([una.estado, una.zona, una.acuerdo], ["listo", "interior", null]);
  const ninguna = combinar({ distingueZona: true, zonaReglas: null, modelos: [{ proveedor: "openai", ok: false, error: "falló" }] });
  assert.equal(ninguna.estado, "error");
  const sinZona = combinar({ distingueZona: false, zonaReglas: null, modelos: [ok("openai", "no_se", true), ok("anthropic", "no_se", true)] });
  assert.deepEqual([sinZona.estado, sinZona.zona, sinZona.acuerdo], ["listo", null, true]);
});

test("el mensaje que pide el dato y la etiqueta de cada zona", () => {
  assert.equal(
    mensajePedirDetalle({ nombre: "MARÍA josé", numero: "#1625", tienda: "Kenku", falta: "un punto de referencia" }),
    "Hola María 👋 Para poder enviar tu pedido #1625 de Kenku necesitamos completar tu dirección. ¿Nos puedes escribir un punto de referencia? ¡Gracias! 🙏",
  );
  assert.ok(mensajePedirDetalle({ nombre: null, numero: null, tienda: null, falta: "x y" }).startsWith("Hola 👋 Para poder enviar tu pedido necesitamos"));
  const cfg = { etiquetaCiudad: "CIUDAD", etiquetaInterior: "INTERIOR/SERVIENTREGA" };
  assert.equal(etiquetaDeZona("interior", cfg), "INTERIOR/SERVIENTREGA");
  assert.equal(etiquetaDeZona("ciudad", { etiquetaCiudad: null, etiquetaInterior: null }), null);
  assert.equal(etiquetaDeZona(null, cfg), null);
});

test("pago por adelantado: si las dos IA lo ven así, queda en espera de pago y sin etiqueta", () => {
  const r = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "adelantado", true), ok("anthropic", "adelantado", true)] });
  assert.deepEqual([r.estado, r.zona, r.falta], ["adelantado", null, null]);
  const dudan = combinar({ distingueZona: true, zonaReglas: null, modelos: [ok("openai", "adelantado", true), ok("anthropic", "interior", true)] });
  assert.equal(dudan.estado, "revisar", "si una IA no coincide, se revisa");
  assert.equal(etiquetaDeZona("adelantado", { etiquetaCiudad: "CIUDAD", etiquetaInterior: "INTERIOR/SERVIENTREGA" }), null);
  assert.equal(leerRespuesta('{"zona":"adelantado","completa":true,"falta":null,"motivo":"x"}')?.zona, "adelantado");
});

test("faltaParaCliente: el mensaje automático solo lleva frases fijas, nunca el texto libre de la IA", () => {
  assert.equal(faltaParaCliente("el número de casa o una referencia"), "el número de casa o un punto de referencia");
  assert.equal(faltaParaCliente("la calle y el número de casa"), "la calle o el sector y el número de casa o un punto de referencia");
  assert.equal(faltaParaCliente("el corregimiento"), "la ciudad o el corregimiento");
  // Una dirección de otro cliente copiada por la IA no pasa: queda solo la frase fija.
  const copiada = faltaParaCliente("Calle Ficticia 1, Casa 9, Barrio Prueba");
  assert.ok(!/ficticia|prueba|9/i.test(copiada), copiada);
  assert.equal(faltaParaCliente("algo raro"), "los datos que faltan de tu dirección (la calle o el sector y el número de casa o un punto de referencia)");
  assert.equal(faltaParaCliente(null), "los datos que faltan de tu dirección (la calle o el sector y el número de casa o un punto de referencia)");
});

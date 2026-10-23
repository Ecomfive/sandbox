import assert from "node:assert/strict";
import test from "node:test";
import { TEXTOS, errorEn, fechaCorta, textoCuota, textoTransito } from "./textos";
import { leerTraduccion, necesitaTraduccion, promptTraduccion } from "./traduccion";

test("el diccionario del portal tiene los mismos textos en español y en chino", () => {
  assert.deepEqual(Object.keys(TEXTOS.zh).sort(), Object.keys(TEXTOS.es).sort());
  for (const [clave, valor] of Object.entries(TEXTOS.zh)) {
    assert.equal(typeof valor, typeof TEXTOS.es[clave as keyof typeof TEXTOS.es], clave);
    // Solo la nota de «solo ver» es exclusiva de Ecomfive: en chino queda vacía.
    if (typeof valor === "string" && clave !== "soloLectura") assert.ok(valor.length > 0, clave);
  }
});

test("qué se traduce: al chino lo que tiene letras latinas, al español lo que tiene caracteres chinos", () => {
  assert.equal(necesitaTraduccion("Crema reafirmante 50 ml", "zh"), true);
  assert.equal(necesitaTraduccion("丰胸霜 50 ml", "zh"), false);
  assert.equal(necesitaTraduccion("1000", "zh"), false);
  assert.equal(necesitaTraduccion("", "zh"), false);
  assert.equal(necesitaTraduccion(null, "es"), false);
  assert.equal(necesitaTraduccion("一箱 960 个", "es"), true);
  assert.equal(necesitaTraduccion("La caja trae 960", "es"), false);
  assert.equal(necesitaTraduccion("x".repeat(2001), "zh"), false);
});

test("el pedido a Gemini lleva los textos como arreglo JSON", () => {
  const p = promptTraduccion(["Crema", "Nota \"1\""], "zh");
  assert.ok(p.includes("chino simplificado"));
  assert.ok(p.endsWith(JSON.stringify(["Crema", "Nota \"1\""])));
});

test("lee la respuesta de Gemini y rechaza la que no tiene la forma pedida", () => {
  const resp = (texto: string) => ({ candidates: [{ content: { parts: [{ text: texto }] } }] });
  assert.deepEqual(leerTraduccion(resp('["丰胸霜 ", "备注"]'), 2), ["丰胸霜", "备注"]);
  assert.deepEqual(leerTraduccion(resp('```json\n["a"]\n```'), 1), ["a"]);
  assert.equal(leerTraduccion(resp('["a"]'), 2), null);
  assert.equal(leerTraduccion(resp("no es json"), 1), null);
  assert.equal(leerTraduccion(resp("[1, 2]"), 2), null);
  assert.equal(leerTraduccion({}, 1), null);
  assert.equal(leerTraduccion(null, 1), null);
});

test("fechas, estados y errores en chino", () => {
  assert.equal(fechaCorta("2026-10-21", "es"), "21 oct");
  assert.equal(fechaCorta("2026-10-21", "zh"), "10月21日");
  assert.equal(fechaCorta(null, "zh"), "—");
  assert.equal(textoCuota({ clave: "vencido", n: 5 }, "zh"), "已逾期 5 天");
  assert.equal(textoCuota({ clave: "vencido", n: 5 }, "es"), "Vencido 5 d");
  assert.equal(textoTransito({ clave: "atrasado", n: 3 }, "zh"), "延误 3 天");
  assert.equal(textoTransito({ clave: "en_plazo", n: 0 }, "es"), "En plazo");
  assert.equal(errorEn("La fecha no puede ser futura.", "zh"), "日期不能是未来日期。");
  assert.equal(errorEn("La fecha no puede ser futura.", "es"), "La fecha no puede ser futura.");
  assert.equal(errorEn("La fecha de envío no puede ser de hace más de 60 días.", "zh"), "发货日期不能早于 60 天前。");
  assert.equal(errorEn("Algo nuevo", "zh"), "Algo nuevo");
});

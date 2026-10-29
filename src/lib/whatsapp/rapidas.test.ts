import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizarRapida, sugerirRapidas, validarRapida, yaEsRapida, type RespuestaRapida } from "./rapidas";

const r = (id: string, texto: string, usos = 0): RespuestaRapida => ({ id, texto, usos });
const rapidas = [r("1", "Hola, ¿cómo estás? 👋", 5), r("2", "¿Me compartes el número de pedido?", 9), r("3", "Te paso el estado en un momento", 2), r("4", "Gracias por escribirnos", 1)];

describe("mensajes rápidos", () => {
  it("compara sin mayúsculas, tildes ni espacios de más", () => {
    assert.equal(normalizarRapida("  ¿Cómo   ESTÁS? "), "¿como estas?");
  });

  it("valida el texto que se guarda", () => {
    assert.deepEqual(validarRapida("  hola   que tal  "), { texto: "hola que tal" });
    assert.ok("error" in validarRapida("a"));
    assert.ok("error" in validarRapida("x".repeat(1001)));
  });

  it("reconoce uno que ya está guardado", () => {
    assert.equal(yaEsRapida(rapidas, "te paso el ESTADO en un momento"), true);
    assert.equal(yaEsRapida(rapidas, "otra cosa"), false);
    assert.equal(yaEsRapida(rapidas, "   "), false);
  });

  it("con el cuadro vacío ofrece los más usados", () => {
    assert.deepEqual(sugerirRapidas(rapidas, "", 2).map((x) => x.id), ["2", "1"]);
  });

  it("al escribir «hol» sale el saludo; los que empiezan por lo escrito van primero", () => {
    assert.deepEqual(sugerirRapidas(rapidas, "hol").map((x) => x.id), ["1"]);
    assert.deepEqual(sugerirRapidas(rapidas, "Número").map((x) => x.id), ["2"]);
    // «te»: empieza «Te paso…»; «compartes» solo lo contiene (y los demás no lo tienen).
    assert.deepEqual(sugerirRapidas(rapidas, "te").map((x) => x.id), ["3", "2"]);
  });

  it("no ofrece lo que ya está escrito entero ni lo que no se parece", () => {
    assert.deepEqual(sugerirRapidas(rapidas, "Te paso el estado en un momento"), []);
    assert.deepEqual(sugerirRapidas(rapidas, "xyz"), []);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { leerVerificacion } from "@/lib/imagen/ia-imagen";
import { claveVerificacion, pedidoCompararCompetencia } from "./verificar-ia";

test("el pedido lleva nuestra foto primero y la competencia en el orden de la lista", () => {
  const p = pedidoCompararCompetencia({ nombre: "Lemme Burn", foto: "https://a/n.jpg" }, [
    { nombre: "Quemador Lemme Burn", foto: "https://a/1.jpg" },
    { nombre: "Lemme Burn 2 frascos", foto: "https://a/2.jpg" },
  ]);
  assert.deepEqual(p.imagenes, ["https://a/n.jpg", "https://a/1.jpg", "https://a/2.jpg"]);
  assert.match(p.texto, /Nuestro producto: Lemme Burn/);
  assert.match(p.texto, /1\. Quemador Lemme Burn\n2\. Lemme Burn 2 frascos/);
  assert.match(p.instrucciones, /misma presentación/);
});

test("la respuesta de la IA se lee como en «Buscar por imagen»", () => {
  const r = leerVerificacion('{"resultados":[{"n":1,"veredicto":"mismo","motivo":"misma etiqueta"},{"n":2,"veredicto":"parecido","motivo":"otro tamaño"},{"n":7,"veredicto":"mismo"}]}', 2);
  assert.deepEqual(
    r.map((x) => [x.n, x.veredicto]),
    [
      [1, "mismo"],
      [2, "parecido"],
    ],
  );
});

test("la clave de un par", () => {
  assert.equal(claveVerificacion("a", "b"), "a|b");
});

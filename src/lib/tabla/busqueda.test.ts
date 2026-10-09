import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearBuscador, sonido } from "./busqueda";

const fila = "OC-1188 Excalvo Shampoo 2x1 Chin";

describe("crearBuscador", () => {
  it("encuentra el texto tal cual, sin mayúsculas ni acentos", () => {
    assert.equal(crearBuscador("excalvo")(fila), true);
    assert.equal(crearBuscador("OC-1188")(fila), true);
    assert.equal(crearBuscador("Bálsamo")("Balsamo Purpura"), true);
  });
  it("perdona una letra cambiada o que suena igual", () => {
    assert.equal(crearBuscador("escalvo")(fila), true);
    assert.equal(crearBuscador("shampo")(fila), true);
    assert.equal(crearBuscador("bitaminas")("Capsulas Vitaminas Para Cabello"), true);
    assert.equal(crearBuscador("organisador")("Organizador De Especias"), true);
  });
  it("cada palabra tiene que estar", () => {
    assert.equal(crearBuscador("escalvo shampoo")(fila), true);
    assert.equal(crearBuscador("escalvo crema")(fila), false);
  });
  it("mientras se escribe, coincide con el comienzo", () => {
    assert.equal(crearBuscador("escal")(fila), true);
  });
  it("no trae de más: palabras cortas y números van tal cual", () => {
    assert.equal(crearBuscador("1189")(fila), false);
    assert.equal(crearBuscador("gel")("Gancho Adhesivo"), false);
    assert.equal(crearBuscador("calcitrin")(fila), false);
    assert.equal(crearBuscador("cargador")("Conjunto Cortadora de Verduras"), false);
    assert.equal(crearBuscador("chin")("Sujetador Sin Broches"), false);
  });
  it("sin nada escrito, todo coincide", () => {
    assert.equal(crearBuscador("  ")(fila), true);
  });
});

describe("sonido", () => {
  it("iguala las letras que se confunden", () => {
    assert.equal(sonido("excalvo"), sonido("escalbo"));
    assert.equal(sonido("llave"), sonido("yabe"));
  });
});

describe("buscar en una tabla con «Cerrados» exclusivo (Compras)", () => {
  it("encuentra abiertas y cerradas a la vez", async () => {
    const { aplicarVista } = await import("./vista");
    const def = {
      clave: "prueba",
      campos: [{ id: "estado", etiqueta: "Estado", tipo: "seleccion" as const, valores: (f: { estado: string }) => [f.estado] }],
      cerrados: { etiqueta: "Cerrados", esCerrado: (f: { estado: string }) => f.estado === "cerrada", campoEstado: "estado", valoresCerrados: ["cerrada"], ocultosPorDefecto: true, exclusivo: true },
    };
    const filas = [{ estado: "abierta" }, { estado: "cerrada" }];
    assert.equal(aplicarVista(def, filas, [], false).filas.length, 1);
    assert.equal(aplicarVista(def, filas, [], false, true).filas.length, 2);
  });
});

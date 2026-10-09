import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aplicarVista } from "./vista";

describe("buscar en una tabla con «Cerrados» exclusivo (Compras)", () => {
  it("encuentra abiertas y cerradas a la vez", () => {
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

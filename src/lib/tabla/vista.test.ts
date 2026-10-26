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

describe("buscar en una tabla donde «Archivados» solo agrega (Gestión de IDs Dropi)", () => {
  it("con el botón apagado no muestra las archivadas; encendido, sí", () => {
    const def = {
      clave: "prueba",
      campos: [{ id: "estado", etiqueta: "Estado", tipo: "seleccion" as const, valores: (f: { estado: string }) => [f.estado] }],
      cerrados: { etiqueta: "Archivados", esCerrado: (f: { estado: string }) => f.estado === "archivada", campoEstado: "estado", valoresCerrados: ["archivada"], ocultosPorDefecto: true },
    };
    const filas = [{ estado: "activa" }, { estado: "archivada" }];
    assert.equal(aplicarVista(def, filas, [], false, true).filas.length, 1);
    assert.equal(aplicarVista(def, filas, [], true, true).filas.length, 2);
  });
});

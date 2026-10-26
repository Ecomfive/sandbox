import assert from "node:assert/strict";
import { test } from "node:test";
import { descubrir, enlaceProveedor, fotoDe, type LecturaCatalogo } from "./descubrir";

const primera: LecturaCatalogo = {
  pais: "mx",
  leido: "2026-10-26T15:00:00Z",
  proveedores: { "10": "HYPER MODA", "20": "ATMA", "30": "CHICO" },
  productos: [
    [1, 10, 500, "2026-10-20", 99, "Repelente", "a.jpg"],
    [2, 10, 100, "2026-01-01", 50, "Lámpara", null],
    [3, 20, 900, "2026-10-01", 120, "Faja", "b.jpg"],
    [4, 20, 80, "2025-12-01", 60, "Cepillo", null],
    [5, 20, 10, "", 30, "Gorra", null],
    [6, 30, 5, "2024-05-01", 10, "Llavero", null],
  ],
};

test("primera lectura: sin ventas todavía; ordena por novedades y tamaño, y destaca lo más nuevo", () => {
  const r = descubrir(primera, null);
  assert.deepEqual(r.map((p) => [p.nombre, p.productos, p.nuevos30, p.stock, p.ventas]), [
    ["ATMA", 3, 1, 990, null],
    ["HYPER MODA", 2, 1, 600, null],
    ["CHICO", 1, 0, 5, null],
  ]);
  assert.deepEqual(r[1].destacados.map((d) => d.nombre), ["Repelente"]);
});

test("segunda lectura: lo que bajó el stock manda; las subidas y lo que cambió de proveedor no cuentan", () => {
  const segunda: LecturaCatalogo = {
    ...primera,
    leido: "2026-11-02T15:00:00Z",
    productos: [
      [1, 10, 380, "2026-10-20", 99, "Repelente", "a.jpg"], // bajó 120
      [2, 10, 90, "2026-01-01", 50, "Lámpara", null], // bajó 10
      [3, 20, 950, "2026-10-01", 120, "Faja", "b.jpg"], // reposición
      [4, 30, 40, "2025-12-01", 60, "Cepillo", null], // cambió de proveedor
      [7, 30, 50, "2026-11-01", 15, "Nuevo", null], // no estaba
    ],
  };
  const r = descubrir(segunda, fotoDe(primera));
  assert.equal(r[0].nombre, "HYPER MODA");
  assert.equal(r[0].ventas, 130);
  assert.equal(r[0].conVentas, 2);
  assert.deepEqual(r[0].destacados.map((d) => [d.nombre, d.ventas]), [["Repelente", 120], ["Lámpara", 10]]);
  assert.equal(r.find((p) => p.nombre === "ATMA")!.ventas, 0);
  assert.equal(r.find((p) => p.nombre === "CHICO")!.ventas, 0);
});

test("el enlace del proveedor es el que acepta «Agregar proveedor»", () => {
  assert.equal(enlaceProveedor("mx", 3243, "Hyper Moda Importaciones"), "https://app.dropi.mx/dashboard/provider/3243/HYPER%20MODA%20IMPORTACIONES");
});

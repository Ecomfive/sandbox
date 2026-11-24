import assert from "node:assert/strict";
import test from "node:test";
import { entregasPorProducto, unidadesDeTiendas } from "./historico-datos";

test("las tiendas de las cuentas se reconocen por el nombre de la unidad, sin acentos ni mayúsculas", () => {
  const unidades = [{ id: "1", nombre: "CLICKSI" }, { id: "2", nombre: "KENKU" }, { id: "3", nombre: "OFERFY PAN" }];
  assert.deepEqual(unidadesDeTiendas(unidades, ["Oferfy"]).map((u) => u.id), ["3"]);
  assert.deepEqual(unidadesDeTiendas(unidades, ["oferfy", "KENKU"]).map((u) => u.id), ["2", "3"]);
  assert.deepEqual(unidadesDeTiendas(unidades, []), [], "sin tienda anotada no se adivina");
  assert.deepEqual(unidadesDeTiendas(unidades, ["Nuvo"]), []);
});

test("las entregas por producto cuentan unidades por estado y dejan fuera los servicios", () => {
  const m = entregasPorProducto([
    { producto: "Shilajit", cantidad: 2, estado: "entregada", servicio: false },
    { producto: "Shilajit", cantidad: 1, estado: "devuelta", servicio: false },
    { producto: "Shilajit", cantidad: 1, estado: "cancelada", servicio: false },
    { producto: "Shilajit", cantidad: 3, estado: "en_transito", servicio: false },
    { producto: "Shilajit", cantidad: 1, estado: "no_gestionada", servicio: false },
    { producto: "Envío", cantidad: 1, estado: "entregada", servicio: true },
    { producto: "", cantidad: 1, estado: "entregada", servicio: false },
  ]);
  assert.deepEqual(m.get("Shilajit"), { nombre: "Shilajit", entregadas: 2, devueltas: 1, canceladas: 2, enCamino: 3 });
  assert.equal(m.has("Envío"), false);
  assert.equal(m.size, 1);
});

import { indexarCatalogo } from "./etapa-venta";
import { productoEnVentas } from "./historico-datos";

test("el producto de una campaña se reconoce entre los de la tienda aunque el nombre no sea idéntico", () => {
  const indice = indexarCatalogo(["Shilajit Ultra", "Gomitas de Shilajit 100% Puro", "NAD+ Selerb | ¡Apoya tu vitalidad masculina!", "Tratamiento Tensor Instantáneo | Borra los Signos", "Aceite Truly"].map((nombre) => ({ nombre, clase: "" })));
  assert.equal(productoEnVentas("META SUPLEMENTO NAD SELERB", indice), "NAD+ Selerb | ¡Apoya tu vitalidad masculina!");
  assert.equal(productoEnVentas("META SHILAJIT GOMITAS", indice), "Gomitas de Shilajit 100% Puro");
  assert.equal(productoEnVentas("META TENSOR INSTANTANEO DE OJOS", indice), "Tratamiento Tensor Instantáneo | Borra los Signos");
  assert.equal(productoEnVentas("EO ACEITE TRULY", indice), "Aceite Truly");
  assert.equal(productoEnVentas("META LENTES SMART ZOOM", indice), null, "nada de la tienda se parece");
  assert.equal(productoEnVentas(null, indice), null);
});

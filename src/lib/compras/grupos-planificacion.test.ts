import assert from "node:assert/strict";
import test from "node:test";
import { enGrupoTienda, enViaPlanificacion, grupoDeTienda } from "./grupos-planificacion";

test("agrupa las tiendas que hay en las compras", () => {
  const casos: [string, string][] = [
    ["EcomFive", "Ecomfive"],
    ["Ecomfive 🇵🇦", "Ecomfive"],
    ["Ecomfive 🇨🇷", "Ecomfive"],
    ["Ecomfive Importadora", "Ecomfive"],
    ["Dropi", "Ecomfive"],
    ["DropLatam", "Ecomfive"],
    ["Kenku Panamá", "Kenku"],
    ["Kenku Costa Rica", "Kenku"],
    ["Clicksy", "Clicksi"],
    ["MELI", "Mercado Libre"],
    ["Mercado Libre", "Mercado Libre"],
    ["Nube Oferta", "Nube/Oferta"],
    ["Oferfy Panamá", "Oferfy"],
    ["Nuvo Panamá", "Otras tiendas"],
    ["Cobrevida", "Otras tiendas"],
    ["Oceans", "Otras tiendas"],
    ["Limitada", "Otras tiendas"],
  ];
  for (const [tienda, grupo] of casos) assert.equal(grupoDeTienda(tienda), grupo, tienda);
});

test("una compra entra en el grupo de cualquiera de sus tiendas, y «Sin tienda» es la que no tiene", () => {
  assert.equal(enGrupoTienda(["Oceans", "Kenku Panamá"], "Kenku"), true);
  assert.equal(enGrupoTienda(["Oceans"], "Ecomfive"), false);
  assert.equal(enGrupoTienda([], "Sin tienda"), true);
  assert.equal(enGrupoTienda(["Dropi"], "Sin tienda"), false);
});

test("terrestre y sin vía cuentan como marítimo", () => {
  assert.equal(enViaPlanificacion(["mar"], "mar"), true);
  assert.equal(enViaPlanificacion(["tierra"], "mar"), true);
  assert.equal(enViaPlanificacion([], "mar"), true);
  assert.equal(enViaPlanificacion(["aire"], "mar"), false);
  assert.equal(enViaPlanificacion(["aire"], "aire"), true);
  assert.equal(enViaPlanificacion(["tierra"], "aire"), false);
  assert.equal(enViaPlanificacion(["mar", "aire"], "mar"), true);
  assert.equal(enViaPlanificacion(["mar", "aire"], "aire"), true);
});

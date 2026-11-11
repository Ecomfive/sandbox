import assert from "node:assert/strict";
import test from "node:test";
import {
  aDolares,
  conParametros,
  elegirEntidad,
  elegirVista,
  entidadDeArchivo,
  factorEntre,
  leerTasa,
  opcionesEntidad,
  parametrosVista,
  tasaDelMes,
  unidadEnEntidad,
  type Entidad,
  type TasaMes,
  type UnidadCatalogo,
} from "./entidades";

const PA: Entidad = { id: "e-pa", codigo: "PA", razon_social: "Panamá", moneda: "USD", orden: 10 };
const CR: Entidad = { id: "e-cr", codigo: "CR", razon_social: "Costa Rica", moneda: "CRC", orden: 20 };
const ENTIDADES = [CR, PA];

test("la entidad: la pedida, si no la del país de la barra, si no el consolidado", () => {
  assert.equal(elegirEntidad("cr", ENTIDADES, "PA"), CR);
  assert.equal(elegirEntidad("consolidado", ENTIDADES, "CR"), null);
  assert.equal(elegirEntidad(undefined, ENTIDADES, "CR"), CR);
  assert.equal(elegirEntidad(undefined, ENTIDADES, "MX"), null);
  assert.equal(elegirEntidad(["CR"], ENTIDADES, null), null, "un arreglo no es un código");
  assert.equal(elegirEntidad("XX", ENTIDADES, "PA"), PA, "un código que no existe cae al país de la barra");
});

test("la moneda: el consolidado y Panamá en USD; Costa Rica en CRC salvo que pida USD", () => {
  assert.deepEqual(elegirVista("consolidado", "local", ENTIDADES, "CR"), { entidad: null, moneda: "USD", local: false });
  assert.deepEqual(elegirVista("PA", "local", ENTIDADES, null), { entidad: PA, moneda: "USD", local: false });
  assert.deepEqual(elegirVista("CR", undefined, ENTIDADES, null), { entidad: CR, moneda: "CRC", local: true });
  assert.deepEqual(elegirVista("CR", "usd", ENTIDADES, null), { entidad: CR, moneda: "USD", local: false });
});

test("parámetros y opciones del selector", () => {
  assert.deepEqual(opcionesEntidad(ENTIDADES).map((o) => o.valor), ["consolidado", "PA", "CR"]);
  assert.deepEqual(parametrosVista({ entidad: CR, moneda: "USD", local: false }), { entidad: "CR", moneda: "usd" });
  assert.deepEqual(parametrosVista({ entidad: null, moneda: "USD", local: false }), { entidad: "consolidado" });
  assert.equal(conParametros("/flujo-caja", { entidad: "CR", desde: null, hasta: "2026-03" }), "/flujo-caja?entidad=CR&hasta=2026-03");
  assert.equal(conParametros("/flujo-caja", {}), "/flujo-caja");
});

test("unidades del libro de Costa Rica: un nombre que ya es de Panamá lleva el sufijo de la entidad", () => {
  const catalogo: UnidadCatalogo[] = [
    { nombre: "A DISTRIBUIR", entidad: "PA", clase: "reparto" },
    { nombre: "A DISTRIBUIR CR", entidad: "CR", clase: "reparto" },
    { nombre: "CORPORATIVO", entidad: "PA", clase: "gestion" },
    { nombre: "TIENDA UNO", entidad: "CR", clase: "tienda" },
  ];
  assert.deepEqual(unidadEnEntidad("A DISTRIBUIR", "CR", catalogo), { nombre: "A DISTRIBUIR CR", crear: null });
  assert.deepEqual(unidadEnEntidad("Corporativo", "CR", catalogo), { nombre: "Corporativo CR", crear: { clase: "gestion" } });
  assert.deepEqual(unidadEnEntidad("tienda uno", "CR", catalogo), { nombre: "TIENDA UNO", crear: null });
  assert.deepEqual(unidadEnEntidad("TIENDA DOS", "CR", catalogo), { nombre: "TIENDA DOS", crear: { clase: "tienda" } });
  // En Panamá el nombre no cambia nunca (aunque exista en otra entidad).
  assert.deepEqual(unidadEnEntidad("TIENDA UNO", "PA", catalogo), { nombre: "TIENDA UNO", crear: null });
  assert.deepEqual(unidadEnEntidad("NUEVA", "PA", catalogo), { nombre: "NUEVA", crear: { clase: "tienda" } });
});

test("tasas del mes: promedio exacto, cierre del mes o el último anterior; USD = 1", () => {
  const tasas: TasaMes[] = [
    { moneda: "CRC", periodo: "2026-01-01", promedio: 500, cierre: 510 },
    { moneda: "CRC", periodo: "2026-02-01", promedio: 520, cierre: 515 },
  ];
  assert.equal(tasaDelMes(tasas, "USD", "2026-05-01", "promedio"), 1);
  assert.equal(tasaDelMes(tasas, "CRC", "2026-02-01", "promedio"), 520);
  assert.equal(tasaDelMes(tasas, "CRC", "2026-03-01", "promedio"), null, "sin el promedio del mes: sin tasa");
  assert.equal(tasaDelMes(tasas, "CRC", "2026-03-01", "cierre"), 515);
  assert.equal(tasaDelMes(tasas, "CRC", "2025-12-01", "cierre"), 510, "antes de la primera: la primera");
  assert.equal(tasaDelMes([], "CRC", "2026-01-01", "cierre"), null);
  assert.equal(aDolares(1_000_000, 500), 2000);
  assert.equal(aDolares(1_000_000, null), null);
  assert.equal(factorEntre(tasas, "CRC", "USD", "2026-01-01", "cierre"), 1 / 510);
  assert.equal(factorEntre(tasas, "USD", "CRC", "2026-02-01", "cierre"), 515);
  assert.equal(factorEntre(tasas, "CRC", "CRC", "2026-02-01", "cierre"), 1);
});

test("tasa escrita a mano y entidad por el nombre del archivo", () => {
  assert.equal(leerTasa("505,25"), 505.25);
  assert.equal(leerTasa(" 507.8 "), 507.8);
  assert.equal(leerTasa("0"), null);
  assert.equal(leerTasa("-3"), null);
  assert.equal(leerTasa("abc"), null);
  assert.equal(entidadDeArchivo("GASTOS_COSTA_RICA_2026.xlsx", ENTIDADES), CR);
  assert.equal(entidadDeArchivo("GASTOS_PANAMA_2026.xlsx", ENTIDADES), PA);
  assert.equal(entidadDeArchivo("otro.xlsx", ENTIDADES), null);
});

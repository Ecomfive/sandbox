import assert from "node:assert/strict";
import test from "node:test";
import { leerFecha } from "./libro-excel";
import { cambiosMovimiento, leerDatosMovimiento, leerTextoPegado, prepararPegado, type VistaMovimiento } from "./movimiento-manual";

const U = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";

test("lee la ficha de un movimiento", () => {
  const datos = { mes: "2026-10", unidad_id: U, tipo_id: T, descripcion: "  Pago   de prueba ", monto: "1,250.405", fecha_pago: "2026-10-03", en_eerr: "si", cuenta_id: "" };
  const r = leerDatosMovimiento((k) => datos[k as keyof typeof datos]);
  assert.ok(!("error" in r));
  assert.equal(r.periodo, "2026-10-01");
  assert.equal(r.descripcion, "Pago de prueba");
  assert.equal(r.monto, 1250.41);
  assert.equal(r.en_eerr, true);
  assert.equal(r.en_flujo, false);
  assert.equal(r.cuenta_id, null);
  const sin = (cambio: Record<string, string>) => leerDatosMovimiento((k) => ({ ...datos, ...cambio })[k as keyof typeof datos]);
  assert.deepEqual(sin({ mes: "2026-13" }), { error: "Elige el mes." });
  assert.deepEqual(sin({ tipo_id: "" }), { error: "Elige el tipo." });
  assert.deepEqual(sin({ monto: "-5" }), { error: "El monto debe ser mayor a cero." });
  assert.deepEqual(sin({ descripcion: " " }), { error: "Falta la descripción." });
});

test("solo los campos que cambiaron van a la auditoría", () => {
  const a: VistaMovimiento = { mes: "2026-10-01", pago: "", prestacion: "", tienda: "NUVO PAN", tipo: "SISTEMAS", descripcion: "x", monto: 10, cuenta: "", eerr: true, flujo: true };
  const r = cambiosMovimiento(a, { ...a, tienda: "KENKU", eerr: false });
  assert.deepEqual(r, { antes: { Tienda: "NUVO PAN", EERR: "Sí" }, despues: { Tienda: "KENKU", EERR: "No" } });
  assert.deepEqual(cambiosMovimiento(a, { ...a }), { antes: {}, despues: {} });
});

test("fechas copiadas como texto DD/MM/AAAA", () => {
  assert.equal(leerFecha("04/01/2026"), "2026-01-04");
  assert.equal(leerFecha("4/1/2026"), "2026-01-04");
  assert.equal(leerFecha("31/02/2026"), null);
});

test("texto de Excel con comillas, tabuladores y saltos dentro de una celda", () => {
  const t = 'a\t"b\tc"\t"d\n""e"""\r\n\tx\n';
  assert.deepEqual(leerTextoPegado(t), [["a", "b\tc", 'd\n"e"'], [null, "x"]]);
});

const CATALOGOS = { tiendas: ["NUVO PAN", "SIN ASIGNAR"], tipos: ["SISTEMAS"], cuentas: ["BANCO GENERAL"] };
const TITULOS = ["MES", "FECHA INCLUSIÓN", "TIENDA", "TIPO", "ESTATUS DE GESTION ", "TIENDA A PAGAR", "DESCRIPCIÓN", "EERR?", "FLUJO ? ", "USD", "", "Prestación de Servicio o disponibilidad mercancia", "Pago", "Forma de Pago"].join("\t");

test("pegar filas con títulos: errores y avisos por fila", () => {
  const filas = [
    TITULOS,
    "10-2026\t03/10/2026\tNUVO PAN\tSISTEMAS\t\t\tLicencia\tSI\tSI\t1,200.50\t\t01/10/2026\t02/10/2026\tBANCO GENERAL",
    "10-2026\t\tNUBO PAN\tSISTEMAS\t\t\tTienda mal escrita\tSI\tSI\t10",
    "10-2026\t\t\tCosa nueva\t\t\tSin tienda\tNO\tSI\t5\t\t\t\tBANCO NUEVO",
    "\t\tNUVO PAN\tSISTEMAS\t\t\tSin mes\tSI\tSI\t5",
  ].join("\n");
  const r = prepararPegado(filas, CATALOGOS);
  assert.equal(r.error, null);
  assert.equal(r.sinTitulos, false);
  assert.deepEqual(r.filas.map((f) => [f.fila, f.estado]), [[2, "ok"], [3, "error"], [4, "aviso"], [5, "error"]]);
  const ok = r.filas[0].mov!;
  assert.equal(ok.monto, 1200.5);
  assert.equal(ok.fecha_pago, "2026-10-02");
  assert.equal(ok.en_eerr, true);
  assert.match(r.filas[1].mensajes[0], /no existe/);
  assert.equal(r.filas[2].mov?.unidad, "SIN ASIGNAR");
  assert.equal(r.filas[2].mensajes.length, 3);
  // Pegar lo mismo otra vez da la misma huella: no se duplica.
  assert.equal(prepararPegado(filas, CATALOGOS).filas[0].mov!.origen_clave, ok.origen_clave);
});

test("pegar filas sin títulos usa el orden de la hoja", () => {
  const r = prepararPegado("\t10-2026\t\tNUVO PAN\tSISTEMAS\t\t\tLicencia\tSI\tNO\t99", CATALOGOS);
  assert.equal(r.sinTitulos, true);
  assert.equal(r.filas[0].fila, 1);
  assert.equal(r.filas[0].estado, "ok");
  assert.equal(r.filas[0].mov?.en_flujo, false);
  assert.match(prepararPegado("hola\tmundo", CATALOGOS).error ?? "", /títulos/);
  assert.equal(prepararPegado("   ", CATALOGOS).error, "No hay nada pegado.");
});

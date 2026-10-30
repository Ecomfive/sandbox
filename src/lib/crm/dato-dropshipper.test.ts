import { test } from "node:test";
import assert from "node:assert/strict";
import { esCampoDato, listaDeTexto, normalizarDato } from "./dato-dropshipper";

const HOY = "2026-10-29";

test("vacío es quitar el dato", () => {
  for (const campo of ["ciudad", "ingreso", "correo", "tiendas", "productos"] as const) assert.deepEqual(normalizarDato(campo, "   ", HOY), { valor: null });
});

test("ciudad: quita espacios de más y pone un tope", () => {
  assert.deepEqual(normalizarDato("ciudad", "  Ciudad   de Panamá ", HOY), { valor: "Ciudad de Panamá" });
  assert.ok("error" in normalizarDato("ciudad", "a".repeat(81), HOY));
});

test("correo: en minúsculas y con forma de correo", () => {
  assert.deepEqual(normalizarDato("correo", " Josa@Gmail.COM ", HOY), { valor: "josa@gmail.com" });
  assert.ok("error" in normalizarDato("correo", "josa@gmail", HOY));
  assert.ok("error" in normalizarDato("correo", "no es correo", HOY));
});

test("ingreso: fecha real, no futura", () => {
  assert.deepEqual(normalizarDato("ingreso", "2026-05-19", HOY), { valor: "2026-05-19" });
  assert.deepEqual(normalizarDato("ingreso", HOY, HOY), { valor: HOY });
  assert.ok("error" in normalizarDato("ingreso", "2026-10-30", HOY));
  assert.ok("error" in normalizarDato("ingreso", "2026-02-30", HOY));
  assert.ok("error" in normalizarDato("ingreso", "19/05/2026", HOY));
});

test("solo se aceptan los campos editables", () => {
  assert.ok(esCampoDato("ciudad"));
  assert.ok(!esCampoDato("notas"));
  assert.ok(!esCampoDato("toString"));
});

test("nombre: no puede quedar vacío y se limpia", () => {
  assert.deepEqual(normalizarDato("nombre", "  Ana   Pérez ", HOY), { valor: "Ana Pérez" });
  assert.ok("error" in normalizarDato("nombre", "   ", HOY));
  assert.ok("error" in normalizarDato("nombre", "a".repeat(121), HOY));
});

test("estado: solo uno de la lista", () => {
  assert.deepEqual(normalizarDato("estado", "inactivo", HOY), { valor: "inactivo" });
  assert.ok("error" in normalizarDato("estado", "vip", HOY));
  assert.ok("error" in normalizarDato("estado", "", HOY));
});

test("WhatsApp: vacío no borra el número", () => {
  assert.deepEqual(normalizarDato("telefono", " +57 300 111 2233 ", HOY), { valor: "+57 300 111 2233" });
  assert.ok("error" in normalizarDato("telefono", "  ", HOY));
});

test("tiendas y productos: lista separada por comas, sin vacíos ni repetidos", () => {
  assert.deepEqual(normalizarDato("tiendas", "Yappea,  yappea , Clovin web,, ", HOY), { valor: "Yappea, Clovin web" });
  assert.deepEqual(normalizarDato("productos", "Crema, Aceite", HOY), { valor: "Crema, Aceite" });
  assert.deepEqual(listaDeTexto("a, b, c, d", 2, 10), ["a", "b"]);
});

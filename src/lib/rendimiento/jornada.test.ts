import assert from "node:assert/strict";
import { test } from "node:test";
import { armarJornada, diaPanama, duracion, etiquetaHora, horaPanama, rangoDeHoras, rangoDelDia, rutaDeLatido } from "./jornada";

// 8:00 de Panamá = 13:00 UTC.
const min = (hhmm: string, ruta = "/publicaciones-dropi") => ({ minuto: `2026-10-27T${hhmm}:00.000Z`, ruta });
const pagina = (r: string) => (r.startsWith("/publicaciones-dropi") ? "Gestión de IDs Dropi" : r === "/compras" ? "Compras" : r);

test("la ruta del navegador se limpia", () => {
  assert.equal(rutaDeLatido("/publicaciones-dropi?abrir=1#x"), "/publicaciones-dropi");
  assert.equal(rutaDeLatido("/retiros/"), "/retiros");
  assert.equal(rutaDeLatido("/"), "/");
  assert.equal(rutaDeLatido("https://otro.com"), null);
  assert.equal(rutaDeLatido("/<script>"), null);
  assert.equal(rutaDeLatido(42), null);
  assert.equal(rutaDeLatido("/" + "a".repeat(250)), null);
});

test("hora y día de Panamá", () => {
  assert.equal(horaPanama("2026-10-27T13:30:00Z"), 8);
  assert.equal(horaPanama("2026-10-28T03:00:00Z"), 22);
  assert.equal(diaPanama("2026-10-28T03:00:00Z"), "2026-10-27");
  assert.deepEqual(rangoDelDia("2026-10-27"), { desde: "2026-10-27T05:00:00.000Z", hasta: "2026-10-28T05:00:00.000Z" });
});

test("entrada, salida, tiempo activo y pausas", () => {
  const minutos = [min("13:00"), min("13:01"), min("13:02"), min("13:04"), min("13:30", "/compras"), min("13:31", "/compras")];
  const j = armarJornada(minutos, [], pagina);
  assert.equal(j.entrada, "2026-10-27T13:00:00.000Z");
  assert.equal(j.salida, "2026-10-27T13:32:00.000Z");
  assert.equal(j.minutosActivos, 6);
  assert.equal(j.tramos.length, 2, "un hueco de 2 minutos no es pausa");
  assert.deepEqual(j.pausas, [{ desde: "2026-10-27T13:05:00.000Z", hasta: "2026-10-27T13:30:00.000Z", minutos: 25 }]);
  assert.equal(j.principal, "Gestión de IDs Dropi");
});

test("por hora: minutos, páginas y lo que guardó", () => {
  const minutos = [min("13:58"), min("13:59"), min("14:00", "/compras")];
  const acciones = [{ creadoEn: "2026-10-27T14:00:30Z", texto: "Cambió el precio" }, { creadoEn: "2026-10-27T13:59:10Z", texto: "Archivó" }];
  const j = armarJornada(minutos, acciones, pagina);
  assert.deepEqual(
    j.horas.map((h) => [h.hora, h.minutos, h.paginas.map((p) => p.pagina), h.acciones.map((a) => a.texto)]),
    [
      [8, 2, ["Gestión de IDs Dropi"], ["Archivó"]],
      [9, 1, ["Compras"], ["Cambió el precio"]],
    ],
  );
  assert.equal(j.acciones, 2);
});

test("minutos repetidos cuentan una vez y una acción sola también marca la jornada", () => {
  const j = armarJornada([min("13:00"), min("13:00", "/compras")], [{ creadoEn: "2026-10-27T20:10:00Z", texto: "Script" }], pagina);
  assert.equal(j.minutosActivos, 1);
  assert.equal(j.salida, "2026-10-27T20:10:00.000Z");
  const vacia = armarJornada([], [], pagina);
  assert.equal(vacia.entrada, null);
  assert.equal(vacia.minutosActivos, 0);
});

test("duración en palabras", () => {
  assert.equal(duracion(445), "7 h 25 min");
  assert.equal(duracion(120), "2 h");
  assert.equal(duracion(45), "45 min");
});

test("etiquetas y rango de horas", () => {
  assert.equal(etiquetaHora(15), "3:00 p. m.");
  assert.equal(etiquetaHora(0), "12:00 a. m.");
  assert.equal(etiquetaHora(9, true), "9a");
  assert.deepEqual(rangoDeHoras([]), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(rangoDeHoras([{ hora: 6 }, { hora: 20 }]).at(0), 6);
  assert.deepEqual(rangoDeHoras([{ hora: 6 }, { hora: 20 }]).at(-1), 20);
});

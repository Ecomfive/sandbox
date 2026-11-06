import assert from "node:assert/strict";
import { test } from "node:test";
import { armarJornada, diaPanama, dispositivoDeAgente, duracion, etiquetaHora, horaPanama, rangoDeHoras, rangoDelDia, rutaDeLatido } from "./jornada";

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

test("el dispositivo sale del navegador", () => {
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"), "computadora");
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"), "computadora");
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"), "telefono");
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), "telefono");
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"), "tablet");
  assert.equal(dispositivoDeAgente("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"), "tablet");
  assert.equal(dispositivoDeAgente(""), null);
  assert.equal(dispositivoDeAgente(null), null);
});

test("la cronología separa por página, dispositivo y pausa, y reparte lo que hizo", () => {
  const compu = (hhmm: string, ruta = "/compras") => ({ ...min(hhmm, ruta), dispositivo: "computadora" as const });
  const tel = (hhmm: string, ruta = "/compras") => ({ ...min(hhmm, ruta), dispositivo: "telefono" as const });
  const j = armarJornada(
    [compu("13:00"), compu("13:01"), compu("13:04"), compu("13:05", "/crm-dropshippers/bandeja"), tel("13:06", "/crm-dropshippers/bandeja"), tel("13:30", "/crm-dropshippers/bandeja"), min("13:31", "/compras")],
    [
      { creadoEn: "2026-10-27T13:02:30.000Z", texto: "Guardó una compra" },
      { creadoEn: "2026-10-27T13:08:00.000Z", texto: "Justo después de irse" },
      { creadoEn: "2026-10-27T15:00:00.000Z", texto: "Sin minutos alrededor" },
    ],
    pagina,
    [
      { momento: "2026-10-27T13:30:10.000Z", chat: "Tienda Sol" },
      { momento: "2026-10-27T13:30:40.000Z", chat: "Tienda Sol" },
    ],
  );
  assert.deepEqual(
    j.bloques.map((b) => [b.pagina, b.area, b.dispositivo, b.minutos]),
    [
      ["Compras", "Compras", "computadora", 3],
      ["/crm-dropshippers/bandeja", "CRM", "computadora", 1],
      ["/crm-dropshippers/bandeja", "CRM", "telefono", 1],
      ["/crm-dropshippers/bandeja", "CRM", "telefono", 1],
      ["Compras", "Compras", null, 1],
      [null, null, null, 0],
    ],
  );
  assert.equal(j.bloques[0].acciones[0].texto, "Guardó una compra");
  assert.equal(j.bloques[2].acciones[0].texto, "Justo después de irse");
  assert.deepEqual(j.bloques[3].mensajes, [{ chat: "Tienda Sol", n: 2, primero: "2026-10-27T13:30:10.000Z" }]);
  assert.equal(j.bloques[5].acciones[0].texto, "Sin minutos alrededor");
  assert.equal(j.mensajes, 2);
  assert.deepEqual(j.areas.map((x) => [x.area, x.minutos]), [["Compras", 4], ["CRM", 3]]);
  assert.deepEqual(j.dispositivos, [{ dispositivo: "computadora", minutos: 4 }, { dispositivo: "telefono", minutos: 2 }, { dispositivo: null, minutos: 1 }]);
});

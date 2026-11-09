import { test } from "node:test";
import assert from "node:assert/strict";
import { detallePrivadoDeLectura, reservasDeDropi, reservasGuardadas, textoReservas, tipoSegunDropi } from "./reservas-dropi";

test("reservas por correo: se leen las vivas de la ficha de Dropi", () => {
  const producto = {
    privated_product: false,
    private_product_inventories: [
      { id: 7, user_id: 501, email: "Ana@Correo.com", stock: "66", variation_id: null, user: { id: 501, name: "Ana", surname: "Pérez" } },
      { id: 8, user_id: 502, email: null, stock: 5, user: { id: 502, email: "luis@correo.com" } },
      { id: 9, user_id: 503, email: "quitada@correo.com", stock: 10, deleted_at: "2026-11-01" },
    ],
  };
  const r = reservasDeDropi(producto);
  assert.equal(r.length, 2, "la quitada no cuenta");
  assert.deepEqual(r[0], { id: 7, usuario: 501, correo: "ana@correo.com", nombre: "Ana Pérez", unidades: 66, variacion: null });
  assert.equal(r[1].correo, "luis@correo.com", "sin correo en la reserva, el del usuario");
  assert.deepEqual(detallePrivadoDeLectura({ detalle_privado: producto })?.privadoProducto, false);
  assert.equal(detallePrivadoDeLectura({}), null, "sin ficha leída, null");
  assert.deepEqual(reservasGuardadas(r), r, "lo guardado vuelve igual");
  assert.deepEqual(reservasGuardadas("raro"), []);
});

test("el tipo según Dropi: con la ficha leída manda privated_product", () => {
  assert.equal(tipoSegunDropi({ privado: true, privadoProducto: false }), "publico", "PUB-0010: la lista dice privado, la ficha dice público con reserva");
  assert.equal(tipoSegunDropi({ privado: true, privadoProducto: true }), "privado");
  assert.equal(tipoSegunDropi({ privado: true, privadoProducto: null }), "privado", "sin la ficha, lo de la lista");
  assert.equal(tipoSegunDropi({ privado: false, privadoProducto: null }), "publico");
});

test("el texto de la insignia", () => {
  const una = [{ id: 1, usuario: 1, correo: "a@x.com", nombre: "Ana", unidades: 66, variacion: null }];
  assert.equal(textoReservas(una), `Reservado a Ana · ${(66).toLocaleString("es-PA")} u.`);
  assert.equal(textoReservas([...una, { ...una[0], id: 2, correo: "b@x.com", nombre: "Beto", unidades: 14 }]), `Reservado a 2 correos · ${(80).toLocaleString("es-PA")} u.`);
});

import { faltantesReserva, normalizarDatosReserva, RESERVA_JS, reservasPara } from "./reservas-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${RESERVA_JS}; return { reservasPara, rvVivas };`)() as { reservasPara: (o: Obj, u: Obj | null, d: unknown) => Obj; rvVivas: (o: Obj) => Obj[] };
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const producto = (extra: Obj = {}): Obj => ({
  id: 8744,
  type: "SIMPLE",
  warehouse_product: [{ warehouse_id: 81, stock: 66 }],
  private_product_inventories: [
    { id: 7, product_id: 8744, user_id: 501, email: "ana@correo.com", stock: 40, user: { id: 501, name: "Ana" } },
    { id: 9, product_id: 8744, user_id: 503, email: "vieja@correo.com", stock: 10, deleted_at: "2026-10-01" },
  ],
  ...extra,
});

test("reserva: cambiar, quitar o agregar un correo, igual en el sistema y en el favorito", () => {
  const casos: [Obj | null, Obj][] = [
    [null, { correo: "ana@correo.com", unidades: 50, nombre: null, antes: 40 }],
    [null, { correo: "ANA@correo.com", unidades: 0, nombre: null, antes: 40 }],
    [null, { correo: "ana@correo.com", unidades: 40, nombre: null, antes: 40 }],
    [{ id: 600, email: "beto@correo.com" }, { correo: "beto@correo.com", unidades: 20, nombre: "Beto", antes: null }],
    [{ id: 600 }, { correo: "beto@correo.com", unidades: 30, nombre: null, antes: null }],
    [null, { correo: "beto@correo.com", unidades: 5, nombre: null, antes: null }],
  ];
  for (const [u, d] of casos) igual(delFavorito.reservasPara(producto(), u, d), reservasPara(producto(), u, d as never));

  const cambio = reservasPara(producto(), null, { correo: "ana@correo.com", unidades: 50, nombre: null, antes: 40 });
  assert.ok("reservas" in cambio);
  assert.equal(cambio.reservas[0].stock, 50);
  assert.equal(cambio.reservas[0].change, true);
  assert.equal(cambio.reservas[1].deleted_at, true, "la quitada sigue quitada");
  const quitar = reservasPara(producto(), null, { correo: "ana@correo.com", unidades: 0, nombre: null, antes: 40 });
  assert.ok("reservas" in quitar && quitar.reservas[0].deleted_at === true && quitar.reservas[0].change === true);
  assert.deepEqual(reservasPara(producto(), null, { correo: "ana@correo.com", unidades: 40, nombre: null, antes: 40 }), { sinCambio: true });
  const nueva = reservasPara(producto(), { id: 600 }, { correo: "beto@correo.com", unidades: 20, nombre: null, antes: null });
  assert.ok("reservas" in nueva && nueva.reservas.length === 3 && nueva.reservas[2].user_id === 600);
  assert.ok("error" in reservasPara(producto(), { id: 600 }, { correo: "beto@correo.com", unidades: 30, nombre: null, antes: null }), "40 + 30 pasa de 66");
  assert.ok("error" in reservasPara(producto(), null, { correo: "beto@correo.com", unidades: 5, nombre: null, antes: null }), "sin cuenta de Dropi");
  assert.ok("error" in reservasPara(producto({ type: "VARIABLE" }), null, { correo: "ana@correo.com", unidades: 5, nombre: null, antes: 40 }));
  igual(delFavorito.rvVivas(producto()).map((x) => x.id), [7]);
});

test("reserva: lo que se pide se revisa", () => {
  assert.deepEqual(normalizarDatosReserva({ correo: " Ana@Correo.com ", unidades: "12", nombre: "Ana" }), { correo: "ana@correo.com", unidades: 12, nombre: "Ana", antes: null });
  assert.equal(normalizarDatosReserva({ correo: "a@b.co", unidades: -3 }).unidades, -1);
  assert.equal(faltantesReserva({ correo: "no-es-correo", unidades: 5, nombre: null, antes: null }, { stock: 66, otras: 0, tieneReserva: false }).length, 1);
  assert.equal(faltantesReserva({ correo: "a@b.co", unidades: 0, nombre: null, antes: null }, { stock: 66, otras: 0, tieneReserva: false }).length, 1, "quitar sin reserva");
  assert.equal(faltantesReserva({ correo: "a@b.co", unidades: 30, nombre: null, antes: null }, { stock: 66, otras: 40, tieneReserva: false }).length, 1, "pasa del stock");
  assert.deepEqual(faltantesReserva({ correo: "a@b.co", unidades: 26, nombre: null, antes: null }, { stock: 66, otras: 40, tieneReserva: false }), []);
});

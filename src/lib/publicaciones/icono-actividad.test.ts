import assert from "node:assert/strict";
import { test } from "node:test";
import { iconoDeAccion } from "./icono-actividad";

const icono = (a: string, t = "") => iconoDeAccion(a, t)?.icono ?? null;

test("cada acción lleva el ícono de su botón", () => {
  assert.equal(icono("publicacion_liquidacion"), "liquidacion");
  assert.equal(icono("publicacion_fin_liquidacion"), "liquidacion");
  assert.equal(icono("archivar_publicacion_dropi"), "archivar");
  assert.equal(icono("desarchivar_publicacion_dropi"), "archivar");
  assert.equal(icono("dropi_archivar_pendiente"), "archivar");
  assert.equal(icono("dropi_restaurar_pendiente"), "archivar");
  assert.equal(icono("dropi_restaurada"), "archivar");
  assert.equal(icono("pausar_publicacion_dropi"), "pausar");
  assert.equal(icono("reactivar_publicacion_dropi"), "reactivar");
  assert.equal(icono("dropi_apagar_pendiente"), "apagar");
  assert.equal(icono("dropi_apagado"), "apagar");
  assert.equal(icono("dropi_privatizada"), "privatizar");
  assert.equal(icono("dropi_republicar_pendiente"), "republicar");
  assert.equal(icono("dropi_stock_aplicado"), "stock");
  assert.equal(icono("dropi_fotos_pendiente"), "fotos");
  assert.equal(icono("ia_titulos_publicacion"), "ia");
  assert.equal(icono("vincular_sku_publicacion"), "vincular");
  assert.equal(icono("decidir_recomendacion_publicacion"), "recomendacion");
  assert.equal(icono("crear_tarea_publicacion"), "tarea");
  assert.equal(icono("resolver_tarea_publicacion"), "tarea");
  assert.equal(icono("crear_publicacion_dropi"), "crear");
  assert.equal(icono("eliminar_comentario_publicacion"), "eliminar");
  assert.equal(icono("restaurar_nombre_dropi"), "dropi");
  assert.equal(icono("sincronizar_dropi_publicacion"), "dropi");
  assert.equal(icono("dropi_nombre_aplicado"), "dropi");
});

test("editar: el del precio si cambió el precio; deshacer y errores", () => {
  assert.equal(icono("editar_publicacion_dropi", "Editó la publicación · Precio de venta $5.00 → $4.50"), "precio");
  assert.equal(icono("editar_publicacion_dropi", "Editó la publicación · Dónde está"), "editar");
  assert.equal(icono("dropi_apagar_cancelado"), "deshacer");
  assert.equal(icono("dropi_cambio_deshecho"), "deshacer");
  assert.deepEqual(iconoDeAccion("dropi_stock_error"), { icono: "stock", error: true });
  assert.deepEqual(iconoDeAccion("dropi_apagado_parcial"), { icono: "apagar", error: true });
  assert.equal(iconoDeAccion("algo_que_no_existe"), null);
});

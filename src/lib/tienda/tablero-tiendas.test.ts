import assert from "node:assert/strict";
import test from "node:test";
import type { EstadoPedido } from "./resumen";
import { alertasTiendas, colorTienda, juntarTiendas, resumirTienda, variacion } from "./tablero-tiendas";

/** Pedidos de mentira: `porDia` pedidos cada día desde `desde`, con los estados repartidos en orden. */
function pedidos(desde: string, dias: number[], estados: EstadoPedido[], total = 40) {
  const fuera: { estado: EstadoPedido; total: number; creado: string; unidades: number }[] = [];
  let k = 0;
  dias.forEach((n, i) => {
    const dia = new Date(Date.parse(`${desde}T17:00:00Z`) + i * 86_400_000).toISOString();
    for (let j = 0; j < n; j++) fuera.push({ estado: estados[k++ % estados.length], total, creado: dia, unidades: 1 });
  });
  return fuera;
}

test("cada tienda: el periodo, el anterior y los pedidos por día (con los días vacíos en 0)", () => {
  const antes = pedidos("2026-10-01", Array(14).fill(2), ["entregado"]);
  const ahora = pedidos("2026-10-15", [3, 0, 5], ["entregado", "nuevo", "cancelado"]);
  const r = resumirTienda({ id: "k", nombre: "Kenku", fuente: "En vivo", sinVincular: 3 }, 0, [...antes, ...ahora], "2026-10-15", "2026-10-18");
  assert.equal(r.actual.pedidos, 8);
  assert.equal(r.anterior.pedidos, 28);
  assert.deepEqual(r.dias.map((d) => d.pedidos), [3, 0, 5, 0]);
  assert.equal(r.porConfirmar, r.actual.porEstado.nuevo);
  assert.equal(r.color, colorTienda(0));
});

test("los colores siguen a la tienda por su lugar en la lista; de la séptima en adelante, gris", () => {
  assert.notEqual(colorTienda(0), colorTienda(1));
  assert.equal(colorTienda(6), "#8d8d8d");
});

test("todas juntas: suman pedidos y dinero y recalculan los porcentajes sobre el total", () => {
  const a = resumirTienda({ id: "a", nombre: "A", fuente: "", sinVincular: 0 }, 0, pedidos("2026-10-15", [10], ["entregado", "cancelado"]), "2026-10-15", "2026-10-15");
  const b = resumirTienda({ id: "b", nombre: "B", fuente: "", sinVincular: 0 }, 1, pedidos("2026-10-15", [30], ["entregado", "en_camino", "nuevo"]), "2026-10-15", "2026-10-15");
  const t = juntarTiendas([a, b]);
  assert.equal(t.actual.pedidos, 40);
  assert.equal(t.actual.porEstado.entregado, 15);
  assert.equal(t.actual.cancelacion, 12.5);
  assert.equal(t.actual.facturado, (40 - 5) * 40);
  assert.equal(t.actual.ticketPromedio, 40);
  assert.equal(t.porConfirmar, 10);
  assert.equal(variacion(120, 100), 20);
  assert.equal(variacion(5, 0), null);
});

test("«Para decidir hoy»: caída de la última semana, entrega baja, cancelación alta, por confirmar y SKU sin vincular, de lo más grave a lo menos", () => {
  // Como Kenku: ~21 por día y la última semana ~11.
  const dias = [...Array(23).fill(21), 14, 13, 15, 13, 10, 11, 6];
  const estados: EstadoPedido[] = ["entregado", "en_camino", "en_camino", "cancelado", "cancelado", "nuevo", "nuevo"];
  const lista = pedidos("2026-10-15", dias, estados);
  const desde = "2026-10-15";
  const hasta = new Date(Date.parse(`${desde}T12:00:00Z`) + 29 * 86_400_000).toISOString().slice(0, 10);
  const r = resumirTienda({ id: "k", nombre: "Kenku", fuente: "", sinVincular: 69 }, 0, lista, desde, hasta);
  const al = alertasTiendas([r]);
  assert.deepEqual(al.map((x) => x.tono), ["critico", "serio", "aviso", "aviso", "info"]);
  assert.match(al[0].titulo, /Kenku: los pedidos bajaron 4\d % en la última semana/);
  assert.match(al[1].titulo, /solo 33[.,]\d % entregado/);
  assert.match(al[2].titulo, /cancelación de 28[.,]\d %/);
  assert.match(al[3].titulo, /pedidos por confirmar/);
  assert.match(al[4].titulo, /69 SKU sin vincular/);
});

test("una tienda chica no se mide y una que creció lo dice", () => {
  const chica = resumirTienda({ id: "c", nombre: "Chica", fuente: "", sinVincular: 0 }, 0, pedidos("2026-10-15", [3], ["cancelado"]), "2026-10-15", "2026-10-15");
  assert.deepEqual(alertasTiendas([chica]), []);
  const antes = pedidos("2026-10-01", Array(14).fill(2), ["entregado"]);
  const ahora = pedidos("2026-10-15", Array(14).fill(5), ["entregado"]);
  const crece = resumirTienda({ id: "g", nombre: "Grande", fuente: "", sinVincular: 0 }, 0, [...antes, ...ahora], "2026-10-15", "2026-10-28");
  const al = alertasTiendas([crece]);
  assert.equal(al.at(-1)?.tono, "bien");
  assert.match(al.at(-1)!.titulo, /crecieron 150 %/);
});

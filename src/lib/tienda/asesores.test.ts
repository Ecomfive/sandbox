import assert from "node:assert/strict";
import test from "node:test";
import { atencionesDe, cambioDeTexto, confirmadosPorDia, contarRangos, efectoEtiquetas, MIN_RESUELTOS_CORONA, puntuarAsesores, resumirAsesores, textoMinutos, type EventoEtiqueta, type FilaAsesor, type PedidoAsesor } from "./asesores";

const pedidos = new Map<string, PedidoAsesor>([
  ["p1", { tiendaId: "k", creado: "2026-11-20T14:00:00Z" }],
  ["p2", { tiendaId: "k", creado: "2026-11-20T14:00:00Z" }],
  ["p3", { tiendaId: "o", creado: "2026-11-20T15:00:00Z" }],
  ["p4", { tiendaId: "k", creado: null }],
]);
const tienda = (id: string) => ({ k: "Kenku", o: "Oferfy" })[id] ?? "—";
const ev = (ordenId: string, usuarioId: string | null, usuario: string, creadoEn: string, agregadas: string[], quitadas: string[] = []): EventoEtiqueta => ({ ordenId, usuarioId, usuario, creadoEn, agregadas, quitadas });

test("efectoEtiquetas: confirmar, cancelar y dejar en gestión", () => {
  assert.deepEqual(efectoEtiquetas(["Confirmada"]), { confirma: true, cancela: false, gestion: false });
  assert.deepEqual(efectoEtiquetas(["ANULADO VERIFICADO"]), { confirma: false, cancela: true, gestion: false });
  assert.deepEqual(efectoEtiquetas(["Cancelado"]), { confirma: false, cancela: true, gestion: false });
  assert.deepEqual(efectoEtiquetas(["Pendiente"]), { confirma: false, cancela: false, gestion: true });
  assert.deepEqual(efectoEtiquetas(["CIUDAD"]), { confirma: false, cancela: false, gestion: false });
});

test("cambioDeTexto lee los eventos viejos (solo texto)", () => {
  assert.deepEqual(cambioDeTexto("Etiquetas en Shopify: agregó «Confirmada», «CIUDAD» y quitó «Pendiente»"), { agregadas: ["Confirmada", "CIUDAD"], quitadas: ["Pendiente"] });
  assert.deepEqual(cambioDeTexto("Etiquetas en Shopify: quitó «Pendiente»"), { agregadas: [], quitadas: ["Pendiente"] });
  assert.deepEqual(cambioDeTexto(null), { agregadas: [], quitadas: [] });
});

test("resumirAsesores: cada pedido una vez por asesor, con lo último que hizo, y la rapidez desde que entró", () => {
  const filas = resumirAsesores(
    [
      ev("p1", "u1", "Ana", "2026-11-20T14:30:00Z", ["Pendiente"]),
      ev("p1", "u1", "Ana", "2026-11-20T15:00:00Z", ["Confirmada"], ["Pendiente"]),
      ev("p2", "u1", "Ana", "2026-11-20T14:20:00Z", ["Confirmada"]),
      ev("p3", "u1", "Ana", "2026-11-20T16:00:00Z", ["ANULADO VERIFICADO"]),
      ev("p4", "u1", "Ana", "2026-11-20T16:00:00Z", ["Confirmada"]),
      ev("p2", "u2", "Beto", "2026-11-20T18:00:00Z", ["Modificar Dirección"]),
      ev("otro", "u2", "Beto", "2026-11-20T18:00:00Z", ["Confirmada"]),
    ],
    pedidos,
    tienda,
  );
  assert.equal(filas.length, 2);
  const [ana, beto] = filas;
  assert.equal(ana.nombre, "Ana");
  assert.deepEqual(ana.tiendas, ["Kenku", "Oferfy"]);
  assert.equal(ana.atendidos, 4);
  assert.equal(ana.confirmados, 3);
  assert.equal(ana.cancelados, 1);
  assert.equal(ana.enGestion, 0);
  assert.equal(ana.tasa, 75);
  // p1: 60 min, p2: 20 min (p4 sin hora de Shopify no cuenta).
  assert.equal(ana.minutosMediana, 40);
  assert.equal(ana.minutosPromedio, 40);
  assert.equal(ana.ultimo, "2026-11-20T16:00:00Z");
  // Un pedido que no es de las tiendas que se miran no cuenta.
  assert.equal(beto.atendidos, 1);
  assert.equal(beto.enGestion, 1);
  assert.equal(beto.tasa, null);
});

test("sin perfil, el asesor se junta por su nombre", () => {
  const filas = resumirAsesores([ev("p1", null, "María ", "2026-11-20T15:00:00Z", ["Confirmada"]), ev("p2", null, "maría", "2026-11-20T15:10:00Z", ["Confirmada"])], pedidos, tienda);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].confirmados, 2);
});

test("textoMinutos", () => {
  assert.equal(textoMinutos(null), "—");
  assert.equal(textoMinutos(25), "25 min");
  assert.equal(textoMinutos(190), "3 h 10 min");
  assert.equal(textoMinutos(120), "2 h");
  assert.equal(textoMinutos(60 * 52), "2 d 4 h");
});


test("contarRangos: cada confirmación en su rango de atención", () => {
  assert.deepEqual(contarRangos([5, 14.9, 15, 45, 61, 300, 2000]), [2, 1, 1, 1, 1, 1]);
});

test("puntuarAsesores: puntaje y corona solo con el mínimo de resueltos", () => {
  const base = { tiendas: ["Kenku"], atendidos: 0, cancelados: 0, enGestion: 0, minutosPromedio: null, ultimo: "", rangos: [] } as unknown as FilaAsesor;
  const filas: FilaAsesor[] = [
    { ...base, clave: "a", nombre: "Ana", confirmados: 40, tasa: 90, minutosMediana: 12, resueltos: 44 },
    { ...base, clave: "b", nombre: "Beto", confirmados: 3, tasa: 100, minutosMediana: 2, resueltos: 3 },
    { ...base, clave: "c", nombre: "Caro", confirmados: 30, tasa: 75, minutosMediana: 60, resueltos: 40 },
  ];
  const r = puntuarAsesores(filas);
  assert.equal(r[0].nombre, "Ana");
  assert.equal(r[0].puntos, Math.round(50 * 0.9 + 30 * (1 - 12 / 120) + 20));
  assert.equal(r[0].corona, 0);
  assert.equal(r.find((x) => x.nombre === "Beto")!.corona, null, `menos de ${MIN_RESUELTOS_CORONA} resueltos`);
  assert.equal(r.find((x) => x.nombre === "Caro")!.corona, 1);
});

test("atencionesDe: el paso a paso de cada asesor con cada pedido", () => {
  const a = atencionesDe(
    [ev("p1", "u1", "Ana", "2026-11-20T14:30:00Z", ["Pendiente"]), ev("p1", "u1", "Ana", "2026-11-20T15:00:00Z", ["Confirmada"], ["Pendiente"]), ev("p3", "u1", "Ana", "2026-11-20T16:00:00Z", ["Cancelado"])],
    pedidos,
  );
  assert.equal(a.length, 2);
  assert.equal(a[0].ordenId, "p3");
  const p1 = a.find((x) => x.ordenId === "p1")!;
  assert.equal(p1.resultado, "confirma");
  assert.equal(p1.minutos, 60);
  assert.deepEqual(p1.pasos.map((x) => x.tipo), ["gestion", "confirma"]);
});

test("confirmadosPorDia: por día de Panamá, y por semana si el periodo es largo", () => {
  const d = confirmadosPorDia([{ t: "2026-11-20T04:00:00Z" }, { t: "2026-11-20T15:00:00Z" }], [{ creado: "2026-11-21T15:00:00Z" }], "2026-11-19", "2026-11-21");
  assert.deepEqual(d, [{ desde: "2026-11-19", sistema: 1, shopify: 0 }, { desde: "2026-11-20", sistema: 1, shopify: 0 }, { desde: "2026-11-21", sistema: 0, shopify: 1 }]);
  assert.equal(confirmadosPorDia([], [], "2026-01-01", "2026-06-30").length, 26);
});

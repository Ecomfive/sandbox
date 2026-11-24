import assert from "node:assert/strict";
import test from "node:test";
import { esAvisoDePantalla, juntarAvisosDePuerto, rutaInterna, sinMostrar, type AvisoEnPantalla } from "./avisos-pantalla";

const aviso = (id: string, creadoEn: string): AvisoEnPantalla => ({ id, tipo: "llegada", titulo: "t", texto: null, href: "/llegadas/x", creadoEn });

test("solo salen en pantalla los avisos de llegada de Compras y de remisión", () => {
  assert.equal(esAvisoDePantalla("llegada"), true);
  assert.equal(esAvisoDePantalla("remision"), true);
  assert.equal(esAvisoDePantalla("adelanto"), true);
  assert.equal(esAvisoDePantalla("seguridad"), true);
  for (const t of ["mencion", "tarea", "sin_stock", "whatsapp", "proveedor", "cierre"]) assert.equal(esAvisoDePantalla(t), false, t);
});

test("el botón de la tarjeta nunca lleva fuera del sistema", () => {
  assert.equal(rutaInterna("/llegadas/abc"), "/llegadas/abc");
  assert.equal(rutaInterna("/compras/lista?abrir=1"), "/compras/lista?abrir=1");
  assert.equal(rutaInterna("https://otro.sitio/x"), "/notificaciones");
  assert.equal(rutaInterna("//otro.sitio/x"), "/notificaciones");
  assert.equal(rutaInterna("/\\otro.sitio/x"), "/notificaciones");
  assert.equal(rutaInterna("javascript:alert(1)"), "/notificaciones");
});

test("sinMostrar deja lo que no se ha mostrado, del más viejo al más nuevo", () => {
  const lista = [aviso("b", "2026-11-17T10:05:00Z"), aviso("a", "2026-11-17T10:00:00Z"), aviso("c", "2026-11-17T10:10:00Z")];
  assert.deepEqual(sinMostrar(lista, new Set(["b"])).map((x) => x.id), ["a", "c"]);
  assert.deepEqual(sinMostrar(lista, new Set(lista.map((x) => x.id))), []);
});

const avisoDe = (id: string, titulo: string, creadoEn: string): AvisoEnPantalla => ({ id, tipo: "llegada", titulo, texto: "x", href: "/llegadas?tipo=puerto", creadoEn });

test("varios avisos «Llega a puerto» salen en una sola tarjeta que los marca todos", () => {
  const lista = [
    avisoDe("a", "Llega a puerto: 1 compra · 100 unidades", "2026-11-24T10:00:00Z"),
    avisoDe("o", "En bodega: $10.00 por pagar de 1 compra", "2026-11-24T10:01:00Z"),
    avisoDe("b", "Llega a puerto: 1 compra · 50 unidades", "2026-11-24T10:02:00Z"),
    avisoDe("c", "Llega a puerto: 2 compras · 70 unidades", "2026-11-24T10:03:00Z"),
  ];
  const r = juntarAvisosDePuerto(lista);
  assert.equal(r.length, 2);
  const junta = r.find((a) => a.ids);
  assert.deepEqual(junta?.ids, ["a", "b", "c"]);
  assert.equal(junta?.titulo, "Llegan a puerto: 3 avisos nuevos");
  assert.ok(r.some((a) => a.id === "o"));
});

test("un solo aviso de puerto, o ninguno, queda como estaba", () => {
  const uno = [avisoDe("a", "Llega a puerto: 1 compra · 100 unidades", "2026-11-24T10:00:00Z"), avisoDe("o", "En bodega: $1.00 por pagar de 1 compra", "2026-11-24T10:01:00Z")];
  assert.deepEqual(juntarAvisosDePuerto(uno), uno);
});

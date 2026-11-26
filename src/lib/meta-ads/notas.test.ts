import { test } from "node:test";
import assert from "node:assert/strict";
import { esCierre, etiquetaCierre, notaAbierta, pospuestaHasta, revisarNota, separarNotas, type NotaMeta } from "./notas";

test("una nota nueva: texto obligatorio y origen válido", () => {
  assert.deepEqual(revisarNota({ texto: "  Probar  ángulo salud \n\n\n\n en V2 " }), { texto: "Probar ángulo salud \n\n en V2", origenClave: null, origenTexto: null });
  assert.ok("error" in revisarNota({ texto: "   " }));
  assert.ok("error" in revisarNota({ texto: 5 }));
  assert.ok("error" in revisarNota({ texto: "x".repeat(2001) }));
  assert.deepEqual(revisarNota({ texto: "ok", origenClave: "campana:123", origenTexto: " Agrega 2 videos " }), { texto: "ok", origenClave: "campana:123", origenTexto: "Agrega 2 videos" });
  assert.ok("error" in revisarNota({ texto: "ok", origenClave: "<script>" }));
  assert.deepEqual(revisarNota({ texto: "ok", origenClave: "", origenTexto: "se ignora" }), { texto: "ok", origenClave: null, origenTexto: null });
});

test("cerrar: solo los tres botones", () => {
  assert.ok(esCierre("hecha") && esCierre("pospuesta") && esCierre("descartada"));
  assert.ok(!esCierre("abierta") && !esCierre("borrada"));
});

test("«Dejar para después» vuelve sola a los 7 días", () => {
  assert.equal(pospuestaHasta("2026-11-26"), "2026-12-03");
  assert.equal(notaAbierta({ estado: "pospuesta", pospuestaHasta: "2026-12-03" }, "2026-12-02"), false);
  assert.equal(notaAbierta({ estado: "pospuesta", pospuestaHasta: "2026-12-03" }, "2026-12-03"), true);
  assert.equal(notaAbierta({ estado: "hecha", pospuestaHasta: null }, "2026-12-03"), false);
  assert.equal(etiquetaCierre({ estado: "pospuesta", pospuestaHasta: "2026-12-03" }), "Para después (vuelve el 03/12/26)");
});

test("abiertas arriba las más nuevas; cerradas aparte", () => {
  const n = (id: string, estado: NotaMeta["estado"], creadoEn: string, cerradoEn: string | null = null): NotaMeta => ({ id, texto: id, origenClave: null, origenTexto: null, estado, pospuestaHasta: null, creadoPorNombre: null, creadoEn, cerradoPorNombre: null, cerradoEn });
  const r = separarNotas([n("a", "abierta", "2026-11-01"), n("b", "hecha", "2026-11-02", "2026-11-05"), n("c", "abierta", "2026-11-03"), n("d", "descartada", "2026-11-04", "2026-11-04")], "2026-11-26");
  assert.deepEqual(r.abiertas.map((x) => x.id), ["c", "a"]);
  assert.deepEqual(r.cerradas.map((x) => x.id), ["b", "d"]);
});

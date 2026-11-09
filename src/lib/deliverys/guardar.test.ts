import assert from "node:assert/strict";
import test from "node:test";
import { etiquetasSinDueno, validarAsignaciones, validarEntregaExcel } from "./guardar";

const BUENA = {
  fila: 3,
  fecha: "2026-10-08",
  etiqueta: "Repartidor  Prueba",
  tienda: "nuvo",
  categoria: "entrega",
  estado: "entregado",
  cantidad: 4,
  tarifa: 3.65,
  origen_clave: `${"a".repeat(24)}#0`,
};

test("una línea válida se limpia (nombre y tienda normalizados)", () => {
  const r = validarEntregaExcel(BUENA);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.entrega.etiqueta, "REPARTIDOR PRUEBA");
    assert.equal(r.entrega.tienda, "NUVO");
    assert.equal(r.entrega.tarifa, 3.65);
  }
  const devuelto = validarEntregaExcel({ ...BUENA, categoria: null, estado: "devuelto", tarifa: 9 });
  assert.ok(devuelto.ok && devuelto.entrega.tarifa === 0);
});

test("no se confía en lo que manda el navegador", () => {
  const malas: Record<string, unknown>[] = [
    { fecha: "08/10/2026" },
    { fecha: "2026-13-45" },
    { etiqueta: "" },
    { tienda: "OTRA TIENDA" },
    { categoria: "regalo" },
    { estado: "perdido" },
    { categoria: null, estado: "entregado" },
    { cantidad: 0 },
    { cantidad: 1.5 },
    { cantidad: "4" },
    { tarifa: -1 },
    { tarifa: Number.NaN },
    { categoria: "propina", cantidad: 2 },
    { origen_clave: "x" },
    { origen_clave: `${"a".repeat(24)}` },
  ];
  for (const m of malas) assert.equal(validarEntregaExcel({ ...BUENA, ...m }).ok, false, JSON.stringify(m));
  assert.equal(validarEntregaExcel(null).ok, false);
  assert.equal(validarEntregaExcel("hola").ok, false);
});

test("asignaciones de nombres de la hoja", () => {
  const id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
  assert.deepEqual(validarAsignaciones([{ etiqueta: "zona 1 x", repartidorId: id }, { etiqueta: "Lugar", repartidorId: null }]), [
    { etiqueta: "ZONA 1 X", repartidorId: id },
    { etiqueta: "LUGAR", repartidorId: null },
  ]);
  assert.equal(validarAsignaciones([{ etiqueta: "x", repartidorId: "no-es-uuid" }]), null);
  assert.equal(validarAsignaciones([{ etiqueta: "", repartidorId: null }]), null);
  assert.equal(validarAsignaciones("x"), null);
});

test("nombres que todavía no son de nadie", () => {
  const reps = [{ id: "a", clave: "PEDRO PRUEBA", alias: ["ZONA 1 PEDRO"] }];
  assert.deepEqual(etiquetasSinDueno(["Pedro Prueba", "ZONA 1 PEDRO", "lugar", "LUGAR", "otro"], reps), ["LUGAR", "OTRO"]);
});

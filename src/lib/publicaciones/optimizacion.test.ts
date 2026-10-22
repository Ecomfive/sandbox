import assert from "node:assert/strict";
import { test } from "node:test";
import { notaOptimizacion, palabrasEnIngles, revisarPublicacion, tieneCantidad, type EntradaRevision } from "./optimizacion";
import { REGLAS_DEFECTO } from "./reglas";
import { recomendarOptimizacion, tareaCumplida } from "./recomendaciones";

const base: EntradaRevision = { titulo: "", categoria: null, precio: 4.99, precioSugerido: 12.99, fotos: null, videos: null, descripcionLargo: null, leidoEnDropi: true };
const estado = (e: Partial<EntradaRevision>, clave: string) => revisarPublicacion({ ...base, ...e }, REGLAS_DEFECTO).find((r) => r.clave === clave)!.estado;

test("título en inglés", () => {
  assert.deepEqual(palabrasEnIngles("DHT Blocker Hair Growth"), ["blocker", "hair", "growth"]);
  assert.deepEqual(palabrasEnIngles("Kit de cejas mini spray"), []);
  assert.equal(estado({ titulo: "DHT Blocker Crecimiento de Cabello" }, "titulo_espanol"), "falta");
  assert.equal(estado({ titulo: "Cinturón lumbar para la ciática" }, "titulo_espanol"), "ok");
});

test("cantidad: un suplemento debe decir cuántas cápsulas; lo demás no aplica", () => {
  assert.equal(estado({ titulo: "Biotina para el cabello" }, "titulo_cantidad"), "falta");
  assert.equal(estado({ titulo: "Biotina 60 cápsulas para el cabello" }, "titulo_cantidad"), "ok");
  assert.equal(estado({ titulo: "Aceite de orégano", categoria: "Suplementos" }, "titulo_cantidad"), "falta");
  assert.equal(estado({ titulo: "Cinturón lumbar" }, "titulo_cantidad"), "no_aplica");
  assert.ok(tieneCantidad("Medias de compresión 2 pares"));
  assert.ok(tieneCantidad("Tónico PACK 2"));
});

test("para qué sirve, formato, fotos, video, descripción y precio sugerido", () => {
  assert.equal(estado({ titulo: "Cinturón lumbar ciática" }, "titulo_angulo"), "revisar");
  assert.equal(estado({ titulo: "Cinturón lumbar para la ciática" }, "titulo_angulo"), "ok");
  assert.equal(estado({ titulo: "CINTURON LUMBAR CIATICA" }, "titulo_formato"), "falta");
  assert.equal(estado({ titulo: "Faja" }, "titulo_formato"), "falta");
  assert.equal(estado({ fotos: null }, "fotos"), "sin_datos");
  assert.equal(estado({ fotos: 4 }, "fotos"), "falta");
  assert.equal(estado({ fotos: 7 }, "fotos"), "ok");
  assert.equal(estado({ videos: 0 }, "video"), "falta");
  assert.equal(estado({ descripcionLargo: 120 }, "descripcion"), "falta");
  assert.equal(estado({ precioSugerido: 4.5 }, "precio_sugerido"), "falta");
  assert.equal(estado({ precioSugerido: null }, "precio_sugerido"), "falta");
  assert.equal(estado({ leidoEnDropi: false }, "precio_sugerido"), "sin_datos");
});

test("la nota cuenta solo lo que se puede revisar", () => {
  const revs = revisarPublicacion({ ...base, titulo: "Cinturón lumbar para la ciática" }, REGLAS_DEFECTO);
  assert.deepEqual(notaOptimizacion(revs), { cumple: 4, total: 4 });
});

test("recomendaciones de optimización y su cumplimiento", () => {
  const revs = revisarPublicacion({ ...base, titulo: "CINTURON LUMBAR CIATICA", fotos: 3, videos: 0 }, REGLAS_DEFECTO);
  const tipos = recomendarOptimizacion(revs, false).map((r) => r.tipo);
  assert.deepEqual(tipos, ["optimizar_titulo", "mas_fotos", "agregar_video"]);
  assert.deepEqual(recomendarOptimizacion(revs, true), []);
  const t = { tipo: "optimizar_titulo", fecha: "2026-10-22", precioAntes: 4.99 };
  assert.equal(tareaCumplida(t, { cambioPrecio: null, comboPublicado: false, revisiones: revs }), null);
  const arreglado = revisarPublicacion({ ...base, titulo: "Cinturón lumbar para la ciática", fotos: 3 }, REGLAS_DEFECTO);
  assert.equal(tareaCumplida(t, { cambioPrecio: null, comboPublicado: false, revisiones: arreglado })?.como, "dropi");
  assert.equal(tareaCumplida({ ...t, tipo: "agregar_video" }, { cambioPrecio: null, comboPublicado: false, revisiones: arreglado }), null);
});

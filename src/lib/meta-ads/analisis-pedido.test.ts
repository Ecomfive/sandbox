import assert from "node:assert/strict";
import test from "node:test";
import { claveDeTema, ejecutarAnalisis, evaluarVigilancia, hallazgoDeVigilancia, ordenarVigilancias, validarAnalisis, validarVigilancia, vigilanciaDeAnalisis, type BaseDias } from "./analisis-pedido";
import { interpretarRespuestaChat, pedidoChat, pedidoConResultados } from "./chat-ia";
import { sinResultados } from "./metricas";
import { analizarHistorico } from "./historico";
import { leerListaVigilancias } from "./vigilancias";

const HOY = "2026-11-24";
const dia = (fecha: string, campanaId: string, videoId: string | null, gasto: number, compras: number) => ({ fecha, campanaId, videoId, r: { ...sinResultados(), gasto, compras, impresiones: gasto * 100, clics: gasto * 2 } });

const base: BaseDias = {
  campanas: new Map([
    ["c1", { id: "c1", nombre: "Shilajit | ALL PA | CBO", producto: "Shilajit", familia: "suplemento", etapa: "venta", estructura: "CBO", puja: null, tope: 10 }],
    ["c2", { id: "c2", nombre: "Crema | ALL PA | ABO", producto: "Crema Nida", familia: "belleza", etapa: "testing", estructura: "ABO", puja: null, tope: 6 }],
  ]),
  videos: new Map([
    ["v1", { id: "v1", nombre: "Video uno", angulo: "Energía", gancho: "Pregunta", formato: "UGC", cta: "Compra ya" }],
    ["v2", { id: "v2", nombre: "Video dos", angulo: "Piel", gancho: null, formato: null, cta: null }],
  ]),
  dias: [
    // Hace dos semanas (14 a 27 días): Shilajit 100 gastados, 20 compras. Ahora (últimos 14): 100 gastados, 10 compras.
    dia("2026-11-05", "c1", "v1", 100, 20),
    dia("2026-11-20", "c1", "v1", 100, 10),
    dia("2026-11-20", "c2", "v2", 60, 5),
    dia("2026-10-01", "c2", "v2", 50, 5),
  ],
};

test("el análisis que pide la IA se valida campo por campo: enumeraciones, fechas y límites", () => {
  const ok = validarAnalisis({ titulo: "CPA por producto", agrupar: "producto", desde: "2026-11-01", hasta: "2026-11-24", orden: "cpa", sentido: "asc", limite: 99, filtros: { familia: "suplemento", raro: "x" } }, HOY)!;
  assert.equal(ok.agrupar, "producto");
  assert.equal(ok.limite, 15, "el límite se recorta");
  assert.deepEqual(ok.filtros, { familia: "suplemento" }, "una clave de filtro desconocida se ignora");
  assert.equal(validarAnalisis({ agrupar: "sql; drop table", desde: "ayer", hasta: HOY }, HOY), null, "una fecha rara no se acepta");
  assert.equal(validarAnalisis({ desde: "2020-01-01", hasta: "2026-11-24" }, HOY), null, "más de dos años no se acepta");
  const sinFechas = validarAnalisis({ agrupar: "angulo" }, HOY)!;
  assert.equal(sinFechas.hasta, HOY);
  assert.equal(sinFechas.desde, "2026-10-26", "sin fechas, los últimos 30 días");
  assert.equal(validarAnalisis({ desde: "2026-11-01", hasta: "2027-01-01" }, HOY)!.hasta, HOY, "no mira al futuro");
  assert.equal(validarAnalisis({ agrupar: "angulo", orden: "inventada" }, HOY)!.orden, "gasto", "una métrica rara cae al gasto");
});

test("ejecutar un análisis agrupa, filtra, ordena y compara dos periodos", () => {
  const spec = validarAnalisis({ agrupar: "producto", desde: "2026-11-01", hasta: "2026-11-24", orden: "cpa", sentido: "asc" }, HOY)!;
  const r = ejecutarAnalisis(spec, base);
  assert.deepEqual(r.filas.map((f) => f.nombre).sort(), ["Crema Nida", "Shilajit"]);
  const shilajit = r.filas.find((f) => f.nombre === "Shilajit")!;
  assert.equal(shilajit.gasto, 200);
  assert.equal(shilajit.compras, 30);
  assert.equal(shilajit.cpa, 6.67);
  assert.equal(r.total.gasto, 260, "el total suma lo filtrado en el periodo");
  assert.ok(r.filas[0].cpa! <= r.filas[1].cpa!, "ordenado por CPA de menor a mayor");

  const filtrado = ejecutarAnalisis(validarAnalisis({ agrupar: "angulo", desde: "2026-10-01", hasta: HOY, filtros: { familia: "belleza" } }, HOY)!, base);
  assert.deepEqual(filtrado.filas.map((f) => f.nombre), ["Piel"], "el filtro deja solo lo de belleza");
  assert.equal(ejecutarAnalisis(validarAnalisis({ agrupar: "gancho", desde: "2026-10-01", hasta: HOY, filtros: { angulo: "energia" } }, HOY)!, base).filas[0].nombre, "Pregunta", "los filtros ignoran acentos y mayúsculas");

  const comparado = ejecutarAnalisis(validarAnalisis({ agrupar: "producto", desde: "2026-11-15", hasta: HOY, comparar: { desde: "2026-11-01", hasta: "2026-11-14" }, orden: "cpa" }, HOY)!, base);
  const s = comparado.filas.find((f) => f.nombre === "Shilajit")!;
  assert.equal(s.cpa, 10);
  assert.equal(s.comparacion!.cpa, 5);
  assert.equal(s.cambio_pct_de_la_metrica_de_orden, 100, "el CPA subió 100 %");

  const vacio = ejecutarAnalisis(validarAnalisis({ agrupar: "producto", desde: "2026-01-01", hasta: "2026-01-31" }, HOY)!, base);
  assert.equal(vacio.filas.length, 0);
  assert.match(vacio.aviso ?? "", /No hay resultados/);
});

test("por día, semana y mes los grupos van en orden de fecha", () => {
  const r = ejecutarAnalisis(validarAnalisis({ agrupar: "mes", desde: "2026-10-01", hasta: HOY }, HOY)!, base);
  assert.deepEqual(r.filas.map((f) => f.nombre), ["2026-10", "2026-11"]);
});

test("una vigilancia compara los últimos N días con los N anteriores y marca lo que se movió en contra o a favor", () => {
  const v = validarVigilancia({ titulo: "CPA por producto", agrupar: "producto", metrica: "cpa", ventana_dias: 14, umbral_pct: 20, gasto_minimo: 40 })!;
  const r = evaluarVigilancia({ id: "a", spec: v, prioridad: "alta", origen: "chat", activa: true }, base, HOY);
  assert.equal(r.estado, "alerta", "el CPA de Shilajit subió 100 %");
  assert.equal(r.filas[0].nombre, "Shilajit");
  assert.equal(r.filas[0].sentido, "malo");
  assert.match(r.resumen, /CPA de «Shilajit»: \$5\.00 → \$10\.00 \(\+100 %\)/);
  // Con una métrica donde subir es bueno, el mismo movimiento es a favor.
  const compras = evaluarVigilancia({ id: "b", spec: { ...v, metrica: "compras" }, prioridad: "baja", origen: "chat", activa: true }, base, HOY);
  assert.equal(compras.filas.find((f) => f.nombre === "Shilajit")!.sentido, "malo", "las compras bajaron de 20 a 10");
  // Sin gasto suficiente no hay nada que decir.
  const poco = evaluarVigilancia({ id: "c", spec: { ...v, gastoMinimo: 5000 }, prioridad: "media", origen: "chat", activa: true }, base, HOY);
  assert.equal(poco.estado, "sin_datos");
});

test("las vigilancias en alerta pasan a hallazgos con la prioridad que se les dio y se ordenan alertas primero", () => {
  const v = validarVigilancia({ metrica: "cpa", agrupar: "producto" })!;
  const alerta = evaluarVigilancia({ id: "x", spec: v, prioridad: "alta", origen: "insistencia", activa: true }, base, HOY);
  const h = hallazgoDeVigilancia(alerta)!;
  assert.equal(h.prioridad, "alta");
  assert.equal(h.tono, "alerta");
  assert.match(h.titulo, /^Vigilancia · /);
  assert.equal(hallazgoDeVigilancia({ ...alerta, activa: false }), null, "una pausada no sugiere nada");
  assert.equal(hallazgoDeVigilancia({ ...alerta, estado: "estable" }), null);
  const orden = ordenarVigilancias([
    { estado: "estable", prioridad: "alta", gasto: 1 },
    { estado: "alerta", prioridad: "baja", gasto: 1 },
    { estado: "alerta", prioridad: "alta", gasto: 1 },
  ]);
  assert.deepEqual(orden.map((o) => `${o.estado}/${o.prioridad}`), ["alerta/alta", "alerta/baja", "estable/alta"]);
});

test("un análisis preguntado seguido se convierte en vigilancia sin fechas, y su tema no depende de ellas", () => {
  const a = validarAnalisis({ agrupar: "dia", orden: "cpa", filtros: { producto: "Shilajit" }, desde: "2026-11-01", hasta: HOY }, HOY)!;
  const b = validarAnalisis({ agrupar: "dia", orden: "cpa", filtros: { producto: "  shilajit " }, desde: "2026-09-01", hasta: "2026-09-30" }, HOY)!;
  assert.equal(claveDeTema(a), claveDeTema(b), "mismas cosas, otras fechas: el mismo tema");
  assert.notEqual(claveDeTema(a), claveDeTema({ ...a, orden: "gasto" }));
  const vig = vigilanciaDeAnalisis(a);
  assert.equal(vig.agrupar, "total", "un desglose por día se vigila en conjunto");
  assert.equal(vig.metrica, "cpa");
  assert.deepEqual(vig.filtros, { producto: "Shilajit" });
});

test("el chat distingue una respuesta de texto de un pedido de análisis o de vigilancia, aun con cercas de código", () => {
  assert.deepEqual(interpretarRespuestaChat("El mejor producto es Shilajit."), { tipo: "texto", texto: "El mejor producto es Shilajit." });
  const analizar = interpretarRespuestaChat('```json\n{"accion":"analizar","analisis":[{"agrupar":"producto"},{"a":1},{"b":2}]}\n```');
  assert.equal(analizar.tipo, "analizar");
  assert.equal(analizar.tipo === "analizar" && analizar.analisis.length, 2, "como mucho dos análisis");
  const vigilar = interpretarRespuestaChat('{"accion":"vigilar","vigilancia":{"metrica":"cpa"},"prioridad":"alta","mensaje":"Listo, vigilo el CPA."}');
  assert.equal(vigilar.tipo, "vigilar");
  assert.equal(vigilar.tipo === "vigilar" && vigilar.mensaje, "Listo, vigilo el CPA.");
  assert.equal(interpretarRespuestaChat('{"accion":"borrar todo"}').tipo, "texto", "una acción desconocida se trata como texto");
  assert.equal(interpretarRespuestaChat("{no es json").tipo, "texto");
});

test("el pedido al chat explica cómo pedir análisis y vigilar, y el segundo pedido lleva los resultados", () => {
  const pedido = pedidoChat(analizarHistorico({ campanas: [], videos: [], productos: [], desde: null, hasta: null }), [], HOY, "¿cómo va esta semana?", []);
  assert.match(pedido.instrucciones, /"accion":"analizar"/);
  assert.match(pedido.instrucciones, /"accion":"vigilar"/);
  assert.match(pedido.instrucciones, /agrupar" \(uno de: producto/);
  const segundo = pedidoConResultados(pedido, [{ titulo: "X" }]);
  assert.match(segundo.instrucciones, /No devuelvas JSON/);
  assert.match(segundo.texto, /Resultados de los análisis nuevos/);
  assert.match(segundo.texto, /"titulo":"X"/);
});

test("la lista guardada de vigilancias se lee con validación y descarta lo que no sirve", () => {
  const lista = leerListaVigilancias({
    items: [
      { id: "a", spec: { metrica: "cpa", agrupar: "producto" }, prioridad: "alta", origen: "insistencia", activa: false, creadaPor: "Ana", creadaEn: "2026-11-24T10:00:00Z", pregunta: "¿?", tema: "abc" },
      { id: "b", spec: "roto" },
      { spec: { metrica: "cpa" } },
      { id: "c", spec: { metrica: "inventada", ventana_dias: 99, umbral_pct: 9999 }, prioridad: "urgentísima" },
    ],
  });
  assert.equal(lista.length, 2);
  assert.equal(lista[0].activa, false);
  assert.equal(lista[0].origen, "insistencia");
  assert.equal(lista[1].spec.metrica, "cpa", "una métrica rara cae a CPA");
  assert.equal(lista[1].spec.ventanaDias, 14);
  assert.equal(lista[1].spec.umbralPct, 200);
  assert.equal(lista[1].prioridad, "media");
  assert.deepEqual(leerListaVigilancias(null), []);
});

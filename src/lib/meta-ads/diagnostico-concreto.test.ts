import assert from "node:assert/strict";
import test from "node:test";
import { accionDeEntregaConcreta, accionDeZonas, concretarHallazgos, diagnosticoDeLanding, fallasDePagina, leerValorOfertas, leerValorPaginas, type OfertasProducto } from "./diagnostico-concreto";
import { analizarHistorico, sinVentanas, type ProductoHist } from "./historico";
import { concluir, type InvestigacionProducto, type OrdenInv } from "./investigacion-entrega";
import { sinResultados } from "./metricas";
import type { SenalesCreativas } from "./senales-creativas";

let n = 0;
const orden = (o: Partial<OrdenInv>): OrdenInv => ({ numero: `#${++n}`, fecha: "2026-11-01", estado: "entregada", total: 30, unidades: 1, conOtros: false, pago: "efectivo", courier: "Servientrega", provincia: "Panamá", zona: "ciudad", confirmada: true, visitas: 0, motivos: [], ...o });
const muchas = (cuantas: number, o: Partial<OrdenInv>) => Array.from({ length: cuantas }, () => orden(o));

const inv = (): InvestigacionProducto => {
  const ordenes = [
    ...muchas(30, { provincia: "Panamá", estado: "entregada" }),
    ...muchas(3, { provincia: "Panamá", estado: "devuelta", motivos: ["cliente no contesta"] }),
    ...muchas(9, { provincia: "Colón", zona: "interior", estado: "entregada" }),
    ...muchas(12, { provincia: "Colón", zona: "interior", estado: "devuelta", motivos: ["cliente no contesta"] }),
  ];
  const c = concluir({ ordenes, tiendaEntrega: 0.85, cpa: 8, conversaciones: null });
  return { clave: "corrector", producto: "Corrector", productoEnTienda: "Corrector de postura", generadaEn: "2026-11-24", dias: 60, tiendas: ["Kenku"], resumen: c.resumen, tiendaEntrega: 0.85, grupos: c.grupos, razones: c.razones.razones, conMotivo: c.razones.conMotivo, sinMotivo: c.razones.sinMotivo, conversaciones: null, hallazgos: c.hallazgos, costo: c.costo };
};

const pagina = (extra: string[]) => ["Tipo de página: página de producto de la tienda", "Botones de compra: uno", "Velocidad de la página: rápida (menos de 1 segundo)", ...extra];
const COMPLETA = pagina(["La página: muestra el precio", "La página: dice que se paga contra entrega", "La página: habla de garantía o devolución", "La página: muestra reseñas o testimonios"]);

const ofertas = (rasgos: string[]): OfertasProducto => ({ producto: "Corrector", anuncios: [{ titulo: "Corrector", inicio: "¿Dolor de espalda? Siéntete mejor en 2 semanas", landing: "tienda.com/corrector", gasto: 900, compras: 80 }], paginas: { "tienda.com/corrector": rasgos } });

test("lo que le falta a una landing sale de lo medido: sin medición no se adivina nada", () => {
  assert.deepEqual(fallasDePagina(undefined), []);
  assert.deepEqual(fallasDePagina([]), []);
  assert.deepEqual(fallasDePagina(COMPLETA), []);
  const f = fallasDePagina(pagina(["La página: muestra el precio"]));
  assert.ok(f.includes("no dice que se paga contra entrega"));
  assert.ok(f.includes("no habla de garantía ni devolución"));
  assert.ok(f.includes("no muestra reseñas ni testimonios"));
  assert.ok(!f.includes("no muestra el precio"));
  assert.ok(fallasDePagina([...COMPLETA, "Velocidad de la página: lenta (más de 2,5 segundos)", "Peso de la página: pesada (más de 1,5 MB)"]).length === 2);
  assert.deepEqual(diagnosticoDeLanding([{ url: "a.com/x", rasgos: [] }]), null);
  assert.equal(diagnosticoDeLanding([{ url: "a.com/x", rasgos: COMPLETA }])!.fallas.length, 0);
});

test("las zonas dicen cuáles bajar, con los pedidos que lo respaldan, y a cuáles mover el presupuesto", () => {
  const t = accionDeZonas(inv())!;
  assert.match(t, /Bajar o excluir de la segmentación Colón \(12 de 21 pedidos volvieron, 57 %\) y mover/);
  assert.ok(!t.includes("Interior"), "no se repite la zona cuando ya se dijo la provincia");
  assert.match(t, /mover ese presupuesto a Panamá \(9 % de devoluciones\)/);
  const parejo = concluir({ ordenes: [...muchas(20, { provincia: "Panamá" }), ...muchas(2, { provincia: "Panamá", estado: "devuelta" }), ...muchas(18, { provincia: "Chiriquí" }), ...muchas(2, { provincia: "Chiriquí", estado: "devuelta" })], tiendaEntrega: 0.9, cpa: 5, conversaciones: null });
  const sinFactor = { ...inv(), grupos: parejo.grupos, resumen: parejo.resumen };
  assert.match(accionDeZonas(sinFactor)!, /Ninguna zona ni provincia concentra las devoluciones/);
  assert.equal(accionDeZonas({ ...inv(), grupos: [] }), null);
});

test("el «Qué hacer» de entrega junta zonas, la promesa del anuncio y lo que falta a su landing, sin pedir nada de otras áreas", () => {
  const t = accionDeEntregaConcreta(inv(), ofertas(pagina(["La página: muestra el precio"])))!;
  assert.match(t, /Colón/);
  assert.match(t, /Su anuncio con más gasto \(\$900\) empieza diciendo «¿Dolor de espalda\? Siéntete mejor en 2 semanas» y lleva a tienda\.com\/corrector, que no dice que se paga contra entrega/);
  assert.match(t, /Lo que más escribieron en las devoluciones/);
  assert.ok(!/llamada|WhatsApp|cobro previo|pago por adelantado|despachar/i.test(t), t);
  const buena = accionDeEntregaConcreta(inv(), ofertas(COMPLETA))!;
  assert.match(buena, /la promesa y la página no parecen ser la causa/);
  assert.match(accionDeEntregaConcreta(undefined, ofertas([]))!, /todavía no se ha medido/);
  assert.equal(accionDeEntregaConcreta(undefined, undefined), null, "sin datos se deja el texto de antes");
});

test("los hallazgos del análisis reemplazan el texto genérico cuando hay datos, y lo demás queda igual", () => {
  const p: ProductoHist = { clave: "corrector", nombre: "Corrector", familia: "general", tope: 10, campanas: 2, total: { ...sinResultados(), gasto: 700, compras: 100 }, v: sinVentanas(), entrega: { nombre: "Corrector", entregadas: 48, devueltas: 52, canceladas: 3, enCamino: 1 } };
  const a = analizarHistorico({ campanas: [], videos: [], productos: [p], desde: "2025-11-01", hasta: "2026-11-24" });
  const antes = a.hallazgos.find((h) => h.id === "entrega:corrector:mala")!;
  assert.match(antes.accion!, /mirar en qué zonas se entrega peor/, "el texto genérico de antes");
  const nuevo = concretarHallazgos(a, { investigaciones: [inv()], senales: [], rasgos: [], ofertas: { corrector: ofertas(pagina([])) } });
  const despues = nuevo.hallazgos.find((h) => h.id === "entrega:corrector:mala")!;
  assert.match(despues.accion!, /Colón/);
  assert.match(despues.accion!, /tienda\.com\/corrector/);
  assert.equal(nuevo.hallazgos.length, a.hallazgos.length);
  const sinDatos = concretarHallazgos(a, { investigaciones: [], senales: [], rasgos: [], ofertas: {} });
  assert.equal(sinDatos.hallazgos.find((h) => h.id === "entrega:corrector:mala")!.accion, antes.accion);
});

test("una tendencia que empeoró en un producto usa las causas de sus creativos", () => {
  const senal: SenalesCreativas = { producto: "Corrector", generadaEn: "2026-11-24", gasto14: 500, videosActivos: 2, parteVieja: 0.8, nuevos14: { videos: 0, gasto: 0, cpa: null }, viejos14: { gasto: 500, cpa: 12 }, videos: [], mejorAngulo: null, causas: [{ tipo: "cansancio", titulo: "El video V2 lleva 40 días y su hook cayó de 45 % a 28 %", detalle: "", accion: "Rotar: subir 2 o 3 videos nuevos y bajar el gasto del cansado.", fuerza: 300 }] };
  const base = analizarHistorico({ campanas: [], videos: [], productos: [], desde: "2025-11-01", hasta: "2026-11-24" });
  const a = { ...base, hallazgos: [{ id: "tendencia:Producto:Corrector:semana", categoria: "tendencia" as const, tono: "alerta" as const, titulo: "x", detalle: "y", accion: "Mirar qué campañas de ahí bajaron y por qué motivo antes de seguir subiendo presupuesto.", certeza: "firme" as const, gasto: 500 }] };
  const r = concretarHallazgos(a, { investigaciones: [], senales: [senal], rasgos: [], ofertas: {} }).hallazgos[0];
  assert.match(r.accion!, /El video V2 lleva 40 días/);
  assert.match(r.accion!, /Rotar: subir 2 o 3 videos nuevos/);
});

test("lo guardado se lee sin romperse con datos raros", () => {
  assert.deepEqual(leerValorOfertas(null), {});
  assert.deepEqual(leerValorOfertas({ productos: { a: { producto: 1 }, b: { producto: "B", anuncios: [{ inicio: "hola", gasto: 1, compras: 0, landing: null, titulo: null }, 5], paginas: { "x.com": ["r"], "y.com": 5 } } } }).b.paginas, { "x.com": ["r"] });
  assert.deepEqual(leerValorPaginas({ paginas: { "a.com": { rasgos: ["x"], en: "e" }, "b.com": { rasgos: [], en: "e", error: true }, "c.com": { rasgos: ["z"], error: true } } }), { "a.com": ["x"] });
});

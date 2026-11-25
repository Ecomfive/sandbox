import assert from "node:assert/strict";
import test from "node:test";
import { concluir, gruposDeDevolucion, leerConversacionesClasificadas, limpiarTexto, pedidoConversaciones, razonDeTexto, razonesDeDevolucion, textoParaIA, type OrdenInv } from "./investigacion-entrega";

let n = 0;
const orden = (o: Partial<OrdenInv>): OrdenInv => ({ numero: `#${++n}`, fecha: "2026-11-01", estado: "entregada", total: 30, unidades: 1, conOtros: false, pago: "efectivo", courier: "Servientrega", provincia: "Panamá", zona: "ciudad", confirmada: true, visitas: 0, motivos: [], ...o });
const muchas = (cuantas: number, o: Partial<OrdenInv>) => Array.from({ length: cuantas }, () => orden(o));

test("lo que escriben Servientrega, Monday y los asesores se clasifica por razón, sin tildes ni mayúsculas", () => {
  assert.equal(razonDeTexto("CLIENTE NO CONTESTA LLAMADAS"), "no_contesta");
  assert.equal(razonDeTexto("No quiere el pedido, se arrepintió"), "rechaza");
  assert.equal(razonDeTexto("Cliente no tiene el dinero"), "sin_dinero");
  assert.equal(razonDeTexto("Dirección incorrecta, no se ubicó"), "direccion");
  assert.equal(razonDeTexto("Cliente ausente"), "ausente");
  assert.equal(razonDeTexto("Reprogramado para otro día"), "reprogramar");
  assert.equal(razonDeTexto("No era lo que esperaba"), "producto");
  assert.equal(razonDeTexto("Pedido duplicado"), "duplicado");
  assert.equal(razonDeTexto("algo que no calza"), "otro");
});

test("un grupo que devuelve claramente más que el producto es un factor; con pocos pedidos no se dice nada", () => {
  const ordenes = [
    ...muchas(30, { zona: "ciudad", estado: "entregada" }),
    ...muchas(3, { zona: "ciudad", estado: "devuelta" }),
    ...muchas(6, { zona: "interior", estado: "entregada", provincia: "Chiriquí" }),
    ...muchas(9, { zona: "interior", estado: "devuelta", provincia: "Chiriquí" }),
  ];
  const grupos = gruposDeDevolucion(ordenes);
  const interior = grupos.find((g) => g.dimension === "zona" && g.nombre === "Interior")!;
  assert.equal(interior.resueltos, 15);
  assert.equal(interior.devueltos, 9);
  assert.equal(interior.factor, true, "60 % frente a 31 % del producto");
  assert.equal(grupos.find((g) => g.dimension === "zona" && g.nombre === "Ciudad")!.factor, false);
  assert.equal(grupos[0].factor, true, "los factores van primero");
  assert.deepEqual(gruposDeDevolucion(muchas(5, { estado: "devuelta" })), [], "con menos de 15 pedidos resueltos no se concluye nada");
});

test("las devoluciones se cuentan por la razón más específica de lo escrito y se avisa cuántas no dicen nada", () => {
  const ordenes = [
    orden({ estado: "devuelta", motivos: ["Cliente no contesta", "devuelto"] }),
    orden({ estado: "devuelta", motivos: ["No contestó la llamada 3 veces al +507 6123-4567"] }),
    orden({ estado: "devuelta", motivos: ["Dirección incorrecta"] }),
    orden({ estado: "devuelta", motivos: [] }),
    orden({ estado: "entregada", motivos: ["no contesta"] }),
  ];
  const r = razonesDeDevolucion(ordenes);
  assert.equal(r.conMotivo, 3);
  assert.equal(r.sinMotivo, 1);
  assert.equal(r.razones[0].razon, "no_contesta");
  assert.equal(r.razones[0].devoluciones, 2);
  assert.ok(r.razones[0].ejemplos.every((e) => !/\d{4}-\d{4}/.test(e)), "los teléfonos no salen en los ejemplos");
  assert.equal(limpiarTexto("Escribe a ana@correo.com o al 6123-4567 https://x.com/y"), "Escribe a [correo] o al [número] [enlace]");
});

test("la conclusión dice si es del producto o de toda la tienda, qué grupo devuelve de más, qué dicen los couriers y cuánto debe costar una compra", () => {
  const ordenes = [
    ...muchas(25, { zona: "ciudad", estado: "entregada" }),
    ...muchas(2, { zona: "ciudad", estado: "devuelta", motivos: ["no contesta"] }),
    ...muchas(5, { zona: "interior", estado: "entregada", confirmada: false }),
    ...muchas(10, { zona: "interior", estado: "devuelta", confirmada: false, motivos: ["dirección incorrecta"] }),
  ];
  const c = concluir({ ordenes, tiendaEntrega: 0.85, cpa: 4, conversaciones: null });
  assert.equal(c.resumen.resueltos, 42);
  assert.equal(c.hallazgos[0].tipo === "producto" || c.hallazgos[0].fuerza > 0, true);
  const titulos = c.hallazgos.map((h) => h.titulo).join(" | ");
  assert.match(titulos, /El producto entrega peor que el resto de la tienda: 71 % frente a 85 %/);
  assert.match(titulos, /Zona «Interior»: 67 % de devoluciones/);
  assert.match(titulos, /Confirmación «Salió sin confirmación registrada»/);
  assert.match(titulos, /«Dirección mala o fuera de cobertura» en 10 de 12/);
  const zona = c.hallazgos.find((h) => h.tipo === "zona")!;
  assert.match(zona.accion, /pago por adelantado/);
  // CPA $4 con 71 % de entrega = $5.60 por compra entregada; para quedar en $10 el CPA puede ser $7.14.
  assert.equal(c.costo!.costoPorEntrega, 5.6);
  assert.equal(c.costo!.cpaObjetivo, 7.14);
  // Si la tienda entera entrega igual de mal, el problema no es del producto.
  const igual = concluir({ ordenes, tiendaEntrega: 0.65, cpa: null, conversaciones: null });
  assert.match(igual.hallazgos.map((h) => h.titulo).join("|"), /igual o mejor que la tienda/);
  assert.equal(igual.costo, null);
});

test("las conversaciones leídas por la IA se validan: solo los pedidos pedidos, razones de la lista y evidencia limpia", () => {
  const p = pedidoConversaciones("Shilajit", [{ numero: "#1", texto: "Cliente: no quiero" }, { numero: "#2", texto: "Cliente: no tengo plata" }]);
  assert.match(p.instrucciones, /se_arrepintio/);
  assert.match(p.texto, /### Pedido #2/);
  const r = leerConversacionesClasificadas('```json\n{"conversaciones":[{"numero":"#1","razon":"se_arrepintio","evidencia":"Dijo que ya no lo quería, llámame al 6123-4567"},{"numero":"#9","razon":"otro","evidencia":"x"},{"numero":"#2","razon":"inventada","evidencia":"sin plata"},{"numero":"#1","razon":"otro","evidencia":"repetido"}]}\n```', ["#1", "#2"]);
  assert.equal(r.length, 2);
  assert.equal(r[0].razon, "se_arrepintio");
  assert.ok(!/6123/.test(r[0].evidencia));
  assert.equal(r[1].razon, "otro", "una razón fuera de la lista cae a «otro»");
  assert.deepEqual(leerConversacionesClasificadas("no es json", ["#1"]), []);
});

test("lo que se le da a la IA lleva las causas con sus números y el objetivo de costo", () => {
  const c = concluir({ ordenes: [...muchas(30, { estado: "entregada" }), ...muchas(10, { estado: "devuelta", zona: "interior", confirmada: false, motivos: ["no contesta"] })], tiendaEntrega: 0.8, cpa: 5, conversaciones: null });
  const t = textoParaIA({ clave: "x", producto: "Shilajit", productoEnTienda: "Shilajit en cápsulas", generadaEn: "2026-11-24", dias: 90, tiendas: ["Oferfy"], tiendaEntrega: 0.8, conversaciones: null, ...c, ...c.razones }) as Record<string, unknown>;
  assert.equal(t.objetivo_costo_por_entrega_usd, 10);
  assert.ok(Array.isArray(t.causas_encontradas));
  assert.equal(t.conversaciones_de_whatsapp, "no se han leído");
});

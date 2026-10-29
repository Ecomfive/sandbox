import assert from "node:assert/strict";
import test from "node:test";
import {
  grupoDeMotivo,
  hayQueClasificar,
  normalizarMotivo,
  ordenarPorUrgencia,
  pedidoMotivo,
  plazoDe,
  plazoDelChat,
  urgenciaDe,
  columnaDelChat,
  repartirTablero,
  type ChatParaOrdenar,
  type EstadoMotivo,
} from "./prioridad";

const AHORA = new Date("2026-10-29T15:00:00Z").getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

test("cada motivo tiene su grupo; molesto siempre es queja", () => {
  assert.equal(grupoDeMotivo("producto_privado"), "comercial");
  assert.equal(grupoDeMotivo("entrega_demorada"), "pedido");
  assert.equal(grupoDeMotivo("retiro_estado"), "pagos");
  assert.equal(grupoDeMotivo("stock_disponible"), "consulta");
  assert.equal(grupoDeMotivo("saludo"), "otro");
  assert.equal(grupoDeMotivo(null), "otro");
  assert.equal(grupoDeMotivo("producto_privado", true), "queja");
});

test("un VIP tiene el plazo del grupo de arriba; la queja ya es lo más urgente", () => {
  assert.equal(plazoDe("comercial"), 240);
  assert.equal(plazoDe("comercial", true), 120);
  assert.equal(plazoDe("queja", true), 15);
  assert.equal(plazoDe("otro"), null);
  assert.equal(plazoDe("otro", true), 240);
});

test("el plazo avisa cerca del final y vence al pasarse", () => {
  assert.equal(plazoDelChat(hace(5), "queja", false, AHORA).estado, "a_tiempo");
  assert.equal(plazoDelChat(hace(12), "queja", false, AHORA).estado, "cerca");
  const vencido = plazoDelChat(hace(20), "queja", false, AHORA);
  assert.equal(vencido.estado, "vencido");
  assert.equal(vencido.restan, -5);
  assert.equal(plazoDelChat(hace(600), "otro", false, AHORA).restan, null);
});

test("se ordena por lo gastado del plazo: una queja de 20 min va antes que algo comercial de casi 2 h", () => {
  const chat = (id: string, grupo: ChatParaOrdenar["grupo"], minutos: number | null, vip = false) => ({
    id,
    grupo,
    vip,
    esperandoDesde: minutos == null ? null : hace(minutos),
    ultimoMensajeEn: hace(minutos ?? 1),
  });
  const lista = [chat("comercial", "comercial", 100), chat("contestado", "queja", null), chat("queja", "queja", 20), chat("pagos", "pagos", 30), chat("comercial-vip", "comercial", 100, true)];
  assert.deepEqual(ordenarPorUrgencia(lista, AHORA).map((c) => c.id), ["queja", "comercial-vip", "pagos", "comercial", "contestado"]);
  assert.equal(urgenciaDe(chat("x", null, 60), AHORA), 0.5);
});

test("la respuesta de la IA se valida: grupo malo toma el del motivo, molesto pasa a queja, basura da null", () => {
  assert.deepEqual(normalizarMotivo('Listo: {"grupo":"comercial","motivo":"producto_privado","molesto":false,"resumen":"Quiere privatizar el Cutting Mix"}'), {
    grupo: "comercial",
    motivo: "producto_privado",
    molesto: false,
    resumen: "Quiere privatizar el Cutting Mix",
  });
  assert.equal(normalizarMotivo('{"grupo":"inventado","motivo":"retiro_estado"}')?.grupo, "pagos");
  assert.equal(normalizarMotivo('{"grupo":"consulta","motivo":"stock_disponible","molesto":true}')?.grupo, "queja");
  assert.equal(normalizarMotivo('{"grupo":"x","motivo":"y"}'), null);
  assert.equal(normalizarMotivo("no sé"), null);
});

test("a la IA no llegan teléfonos y van las correcciones de ejemplo", () => {
  const p = pedidoMotivo([{ id: "1", direccion: "entrante", tipo: "texto", texto: "Llámame al +507 6111-2233, mi pedido no llegó", momento: hace(3) }], [{ texto: "quiero el producto solo para mí", grupo: "comercial" }]);
  assert.ok(!p.texto.includes("6111"));
  assert.ok(p.texto.startsWith("Cliente:"));
  assert.ok(p.instrucciones.includes("«quiero el producto solo para mí» → comercial"));
});

test("se clasifica solo lo que espera y tiene algo nuevo; lo que puso una persona se respeta", () => {
  const base: EstadoMotivo = { esperandoDesde: hace(10), ultimoEntranteEn: hace(1), motivoGrupo: null, motivoPor: null, motivoEn: null, motivoPedidoEn: null };
  assert.equal(hayQueClasificar(base, AHORA), true);
  assert.equal(hayQueClasificar({ ...base, esperandoDesde: null }, AHORA), false);
  assert.equal(hayQueClasificar({ ...base, motivoPedidoEn: hace(0.5) }, AHORA), false);
  const deLaIA = { ...base, motivoGrupo: "pedido", motivoPor: "ia" as const, motivoEn: hace(5) };
  assert.equal(hayQueClasificar(deLaIA, AHORA), true);
  assert.equal(hayQueClasificar({ ...deLaIA, motivoEn: hace(1.5), ultimoEntranteEn: hace(1) }, AHORA), false);
  assert.equal(hayQueClasificar({ ...deLaIA, motivoEn: hace(0.5) }, AHORA), false);
  const dePersona = { ...deLaIA, motivoPor: "persona" as const };
  assert.equal(hayQueClasificar(dePersona, AHORA), false);
  // Se le contestó y volvió a escribir: la espera nueva es posterior al motivo.
  assert.equal(hayQueClasificar({ ...dePersona, esperandoDesde: hace(2) }, AHORA), true);
});

test("tablero: cada chat va al nivel de su motivo; vencido sube uno; contestado va a Contestados", () => {
  const base = { vip: false, resuelta: false, ultimoMensajeEn: hace(1) };
  assert.deepEqual(columnaDelChat({ ...base, grupo: "queja", esperandoDesde: hace(5) }, AHORA), { columna: "alta", subio: false });
  assert.deepEqual(columnaDelChat({ ...base, grupo: "comercial", esperandoDesde: hace(30) }, AHORA), { columna: "media", subio: false });
  assert.deepEqual(columnaDelChat({ ...base, grupo: "consulta", esperandoDesde: hace(130) }, AHORA), { columna: "alta", subio: true });
  assert.deepEqual(columnaDelChat({ ...base, grupo: "otro", esperandoDesde: hace(3000) }, AHORA), { columna: "baja", subio: false });
  // Un VIP con saludo tiene plazo (el de comercial): al vencer sube a Media.
  assert.deepEqual(columnaDelChat({ ...base, vip: true, grupo: "otro", esperandoDesde: hace(300) }, AHORA), { columna: "media", subio: true });
  // Sin motivo todavía: Media.
  assert.deepEqual(columnaDelChat({ ...base, grupo: null, esperandoDesde: hace(10) }, AHORA), { columna: "media", subio: false });
  assert.deepEqual(columnaDelChat({ ...base, grupo: "pedido", esperandoDesde: null }, AHORA), { columna: "contestados", subio: false });
  assert.equal(columnaDelChat({ ...base, grupo: "pedido", esperandoDesde: null, ultimoMensajeEn: hace(60 * 50) }, AHORA), null);
  assert.equal(columnaDelChat({ ...base, grupo: "pedido", esperandoDesde: null, resuelta: true }, AHORA), null);
});

test("tablero: cada columna por urgencia y Contestados con lo más reciente arriba", () => {
  const chat = (id: string, grupo: ChatParaOrdenar["grupo"], espera: number | null, ultimo = 1) => ({ id, grupo, vip: false, resuelta: false, esperandoDesde: espera == null ? null : hace(espera), ultimoMensajeEn: hace(ultimo) });
  const t = repartirTablero([chat("pagos", "pagos", 10), chat("queja", "queja", 10), chat("viejo", null, null, 300), chat("nuevo", null, null, 5)], AHORA);
  assert.deepEqual(t.alta.map((x) => x.chat.id), ["queja", "pagos"]);
  assert.deepEqual(t.contestados.map((x) => x.chat.id), ["nuevo", "viejo"]);
});

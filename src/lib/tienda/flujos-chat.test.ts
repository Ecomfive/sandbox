import assert from "node:assert/strict";
import test from "node:test";
import { armarLlamadaFlujos, herramientaDeFlujos, type HerramientaConEsquema } from "./flujos-chat";

const esquema = (props: Record<string, string>) => ({ properties: Object.fromEntries(Object.entries(props).map(([k, type]) => [k, { type }])) });

test("busca la herramienta que pausa los flujos de un chat", () => {
  const hs: HerramientaConEsquema[] = [
    { name: "ver_conversacion_whatsapp" },
    { name: "pausar_bot_conversacion" },
    { name: "listar_flujos_activos" },
    { name: "crear_flujo_whatsapp" },
    { name: "pausar_flujos_conversacion" },
  ];
  assert.equal(herramientaDeFlujos(hs)?.name, "pausar_flujos_conversacion");
  assert.equal(herramientaDeFlujos(hs.slice(0, 2)), null);
  assert.equal(herramientaDeFlujos([{ name: "listar_flujos_activos" }, { name: "editar_flujo_pausa" }]), null);
  // Entre dos, la que habla de pausar.
  assert.equal(herramientaDeFlujos([{ name: "activar_flujos_chat" }, { name: "pausar_flow_chat" }])?.name, "pausar_flow_chat");
});

test("arma los argumentos según el esquema de la herramienta", () => {
  const h = { name: "pausar_flujos_conversacion", inputSchema: esquema({ conversation_id: "number", pausar: "boolean", motivo: "string" }) };
  assert.deepEqual(armarLlamadaFlujos(h, { conversacionId: 7, telefono: "5076000", pausar: true, motivo: "x" }), { args: { conversation_id: 7, pausar: true, motivo: "x" } });
  // Sin conversación usa el teléfono si la herramienta lo acepta.
  const porTel = { name: "pausar_flujos", inputSchema: esquema({ telefono: "string", activo: "boolean" }) };
  assert.deepEqual(armarLlamadaFlujos(porTel, { conversacionId: null, telefono: "5076000", pausar: true, motivo: "x" }), { args: { telefono: "5076000", activo: false } });
  assert.deepEqual(armarLlamadaFlujos(porTel, { conversacionId: 3, telefono: "5076000", pausar: false, motivo: "x" }), { args: { telefono: "5076000", activo: true } });
  // Solo con conversación y sin ella no se puede.
  const soloId = { name: "pausar_flujos", inputSchema: esquema({ conversation_id: "number", pausar: "boolean" }) };
  assert.match((armarLlamadaFlujos(soloId, { conversacionId: null, telefono: "1", pausar: true, motivo: "x" }) as { error: string }).error, /conversación/);
  // Sin a qué chat.
  assert.ok("error" in armarLlamadaFlujos({ name: "pausar_flujos", inputSchema: esquema({ pausar: "boolean" }) }, { conversacionId: 1, telefono: "1", pausar: true, motivo: "x" }));
});

test("una herramienta que solo pausa o solo reanuda no sirve para lo contrario", () => {
  const solo = { name: "reanudar_flujos_chat", inputSchema: esquema({ conversation_id: "number" }) };
  assert.deepEqual(armarLlamadaFlujos(solo, { conversacionId: 1, telefono: "1", pausar: false, motivo: "x" }), { args: { conversation_id: 1 } });
  assert.ok("error" in armarLlamadaFlujos(solo, { conversacionId: 1, telefono: "1", pausar: true, motivo: "x" }));
  const otra = { name: "alternar_flujos_chat", inputSchema: esquema({ conversation_id: "number" }) };
  assert.ok("error" in armarLlamadaFlujos(otra, { conversacionId: 1, telefono: "1", pausar: true, motivo: "x" }));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { resolverAfinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { CATALOGO_CRM } from "@/lib/permisos/catalogo";
import { accionBandejaBloqueada, chatEnAlcance, permisosBandeja } from "./permisos-bandeja";

// Se corre con: npm run test:seguridad (incluye las pruebas del CRM)
const fila = (tipo: FilaAfinada["tipo"], clave: string, valor: string): FilaAfinada => ({ modulo: "crm-dropshippers", tipo, clave, valor });
const afinadoDe = (filas: FilaAfinada[]) => ({ "crm-dropshippers": resolverAfinado(CATALOGO_CRM, filas) });

test("sin nada afinado, la bandeja deja hacer todo y ver todos los chats de sus áreas", () => {
  const p = permisosBandeja(undefined);
  assert.deepEqual(p, { responder: true, archivos: true, notas: true, pasarArea: true, tomar: true, resolver: true, verTelefono: true, alcance: "todas" });
  assert.equal(accionBandejaBloqueada(undefined, "responder"), null);
});

test("lo afinado en Usuarios y roles quita botones y el servidor lo rechaza", () => {
  const a = afinadoDe([fila("accion", "pasar-area", "bloqueada"), fila("accion", "responder", "bloqueada"), fila("campo", "telefono", "oculto")]);
  const p = permisosBandeja(a);
  assert.equal(p.pasarArea, false);
  assert.equal(p.responder, false);
  assert.equal(p.archivos, false, "sin responder tampoco manda archivos");
  assert.equal(p.notas, true);
  assert.equal(p.verTelefono, false);
  assert.ok(accionBandejaBloqueada(a, "pasar-area"));
  assert.ok(accionBandejaBloqueada(a, "archivos"));
  assert.equal(accionBandejaBloqueada(a, "notas"), null);
});

test("con «los suyos y los libres» no ve el chat que lleva otra persona", () => {
  const p = permisosBandeja(afinadoDe([fila("alcance", "alcance", "mias-y-libres")]));
  assert.equal(p.alcance, "mias-y-libres");
  assert.equal(chatEnAlcance(p.alcance, null, "yo"), true);
  assert.equal(chatEnAlcance(p.alcance, "yo", "yo"), true);
  assert.equal(chatEnAlcance(p.alcance, "otra", "yo"), false);
  assert.equal(chatEnAlcance("todas", "otra", "yo"), true);
});

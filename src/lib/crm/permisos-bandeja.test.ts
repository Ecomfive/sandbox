import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_CRM } from "@/lib/permisos/catalogo";
import { resolverAfinado, type FilaAfinada } from "@/lib/permisos/afinado";
import { accionBandejaBloqueada, chatEnAlcance, PERMISOS_BANDEJA_COMPLETOS, permisosBandeja, soloSuyosYLibres } from "./permisos-bandeja";

const ID = "11111111-2222-3333-4444-555555555555";
const con = (filas: Omit<FilaAfinada, "modulo">[]) => ({ id: ID, afinado: { "crm-dropshippers": resolverAfinado(CATALOGO_CRM, filas.map((f) => ({ ...f, modulo: "crm-dropshippers" }))) } });

test("sin nada afinado puede todo y ve todos los chats de sus áreas", () => {
  assert.deepEqual(permisosBandeja({ afinado: {} }), PERMISOS_BANDEJA_COMPLETOS);
  assert.deepEqual(permisosBandeja(null), PERMISOS_BANDEJA_COMPLETOS);
  assert.equal(accionBandejaBloqueada({ afinado: {} }, "responder"), null);
  assert.equal(soloSuyosYLibres({ id: ID, afinado: {} }), null);
});

test("una acción bloqueada se niega con un aviso; sin responder tampoco se mandan archivos", () => {
  const u = con([{ tipo: "accion", clave: "responder", valor: "bloqueada" }]);
  const p = permisosBandeja(u);
  assert.equal(p.responder, false);
  assert.equal(p.archivos, false);
  assert.equal(p.notas, true);
  assert.match(accionBandejaBloqueada(u, "responder") ?? "", /responder por WhatsApp/);
  assert.match(accionBandejaBloqueada(u, "archivos") ?? "", /fotos, videos y documentos/);
  assert.equal(accionBandejaBloqueada(u, "notas"), null);
});

test("lo de la persona puede soltar lo que el rol bloqueaba", () => {
  const u = con([
    { tipo: "accion", clave: "tomar", valor: "bloqueada" },
    { tipo: "accion", clave: "tomar", valor: "permitida" },
  ]);
  assert.equal(permisosBandeja(u).tomar, true);
});

test("con «los suyos y los libres» no ve el chat que lleva otra persona", () => {
  const u = con([{ tipo: "alcance", clave: "alcance", valor: "mias-y-libres" }]);
  assert.equal(permisosBandeja(u).alcance, "mias-y-libres");
  assert.equal(soloSuyosYLibres(u), ID);
  assert.equal(chatEnAlcance("mias-y-libres", null, ID), true);
  assert.equal(chatEnAlcance("mias-y-libres", ID, ID), true);
  assert.equal(chatEnAlcance("mias-y-libres", "otra-persona", ID), false);
  assert.equal(chatEnAlcance("todas", "otra-persona", ID), true);
});

test("el catálogo trae las pestañas del CRM con su página", () => {
  for (const p of CATALOGO_CRM.pestanas) assert.ok(p.href.startsWith("/crm-dropshippers/"), p.clave);
});

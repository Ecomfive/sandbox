import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alertaDeEvento, extraerEventosCuenta, type EventoCuenta } from "./eventos";

const aviso = (field: string, value: unknown) => ({ object: "whatsapp_business_account", entry: [{ id: "1", time: 1, changes: [{ field, value }] }] });

describe("extraerEventosCuenta", () => {
  it("lee el estado de una plantilla", () => {
    const e = extraerEventosCuenta(aviso("message_template_status_update", { event: "REJECTED", message_template_id: 123, message_template_name: "retomar", message_template_language: "es", reason: "INVALID_FORMAT", rejection_info: { recommendation: "Quita la variable del final" }, message_template_category: "MARKETING" }));
    assert.deepEqual(e, [{ tipo: "plantilla_estado", metaId: "123", nombre: "retomar", idioma: "es", evento: "REJECTED", motivo: "INVALID_FORMAT · Quita la variable del final", categoria: "MARKETING" }]);
  });
  it("«NONE» no es un motivo", () => {
    const [e] = extraerEventosCuenta(aviso("message_template_status_update", { event: "APPROVED", message_template_id: 1, message_template_name: "a", reason: "NONE" }));
    assert.equal(e.tipo === "plantilla_estado" && e.motivo, null);
  });
  it("lee la calidad de una plantilla", () => {
    const e = extraerEventosCuenta(aviso("message_template_quality_update", { previous_quality_score: "GREEN", new_quality_score: "RED", message_template_id: 5, message_template_name: "a", message_template_language: "en-US" }));
    assert.deepEqual(e, [{ tipo: "plantilla_calidad", metaId: "5", nombre: "a", idioma: "en-US", previa: "GREEN", nueva: "RED" }]);
  });
  it("lee el cambio de categoría, ya hecho o avisado de antemano", () => {
    const hecho = extraerEventosCuenta(aviso("template_category_update", { message_template_id: 1, message_template_name: "a", previous_category: "UTILITY", new_category: "MARKETING" }));
    assert.deepEqual(hecho[0], { tipo: "plantilla_categoria", metaId: "1", nombre: "a", idioma: "es", previa: "UTILITY", nueva: "MARKETING", programada: null });
    const previo = extraerEventosCuenta(aviso("template_category_update", { message_template_id: 1, message_template_name: "a", new_category: "UTILITY", correct_category: "MARKETING", category_update_timestamp: 1746255600 }));
    const p = previo[0];
    assert.ok(p.tipo === "plantilla_categoria" && p.nueva === "MARKETING" && p.previa === null && p.programada?.startsWith("2025-05-03"));
  });
  it("lee el límite del número (el campo nuevo manda sobre el viejo)", () => {
    const e = extraerEventosCuenta(aviso("phone_number_quality_update", { display_phone_number: "50761986830", event: "THROUGHPUT_UPGRADE", current_limit: "TIER_250", max_daily_conversations_per_business: "TIER_10K" }));
    assert.deepEqual(e, [{ tipo: "numero_limite", numero: "50761986830", limite: "TIER_10K", evento: "THROUGHPUT_UPGRADE" }]);
    const viejo = extraerEventosCuenta(aviso("phone_number_quality_update", { display_phone_number: "1", event: "ONBOARDING", current_limit: "TIER_250" }));
    assert.equal(viejo[0].tipo === "numero_limite" && viejo[0].limite, "TIER_250");
  });
  it("lee las restricciones y los bloqueos de la cuenta", () => {
    const r = extraerEventosCuenta(aviso("account_update", { event: "ACCOUNT_RESTRICTION", restriction_info: [{ restriction_type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expiration: 1641330498 }] }));
    assert.deepEqual(r, [{ tipo: "cuenta", evento: "ACCOUNT_RESTRICTION", detalle: "RESTRICTED_BIZ_INITIATED_MESSAGING · hasta 2022-01-04" }]);
    const v = extraerEventosCuenta(aviso("account_update", { event: "ACCOUNT_VIOLATION", violation_info: { violation_type: "ADULT" } }));
    assert.deepEqual(v, [{ tipo: "cuenta", evento: "ACCOUNT_VIOLATION", detalle: "ADULT" }]);
    const d = extraerEventosCuenta(aviso("account_update", { event: "DISABLED_UPDATE", ban_info: { waba_ban_state: "DISABLE", waba_ban_date: "April 17, 2025" } }));
    assert.deepEqual(d, [{ tipo: "cuenta", evento: "DISABLED_UPDATE", detalle: "DISABLE · April 17, 2025" }]);
  });
  it("ignora lo que no entiende: otros campos, otros eventos de la cuenta, avisos de otra cosa", () => {
    assert.deepEqual(extraerEventosCuenta(aviso("messages", { messages: [] })), []);
    assert.deepEqual(extraerEventosCuenta(aviso("account_update", { event: "PARTNER_ADDED" })), []);
    assert.deepEqual(extraerEventosCuenta(aviso("message_template_status_update", { event: "APPROVED" })), []);
    assert.deepEqual(extraerEventosCuenta({ object: "instagram", entry: [] }), []);
    assert.deepEqual(extraerEventosCuenta(null), []);
  });
  it("360dialog puede mandar el aviso sin «object»", () => {
    const sin = { entry: [{ changes: [{ field: "message_template_quality_update", value: { new_quality_score: "YELLOW", message_template_name: "a" } }] }] };
    assert.equal(extraerEventosCuenta(sin).length, 0);
    assert.equal(extraerEventosCuenta(sin, true).length, 1);
  });
});

describe("alertaDeEvento", () => {
  const estado = (evento: string, motivo: string | null = null): EventoCuenta => ({ tipo: "plantilla_estado", metaId: "1", nombre: "retomar", idioma: "es", evento, motivo, categoria: null });
  it("avisa cuando Meta aprueba, rechaza, pausa o deshabilita una plantilla", () => {
    assert.deepEqual(alertaDeEvento(estado("APPROVED")), { tipo: "plantilla_aprobada", severidad: "info", titulo: "Meta aprobó la plantilla «retomar»", detalle: "Ya se puede enviar." });
    assert.equal(alertaDeEvento(estado("REJECTED", "INVALID_FORMAT"))?.detalle, "INVALID_FORMAT");
    assert.equal(alertaDeEvento(estado("REJECTED"))?.severidad, "aviso");
    assert.equal(alertaDeEvento(estado("PAUSED"))?.severidad, "critica");
    assert.equal(alertaDeEvento(estado("DISABLED"))?.severidad, "critica");
    assert.equal(alertaDeEvento(estado("FLAGGED"))?.tipo, "plantilla_riesgo");
  });
  it("lo que no merece un aviso no lo da", () => {
    assert.equal(alertaDeEvento(estado("PENDING")), null);
    assert.equal(alertaDeEvento(estado("ARCHIVED")), null);
    assert.equal(alertaDeEvento({ tipo: "plantilla_calidad", metaId: null, nombre: "a", idioma: "es", previa: "YELLOW", nueva: "GREEN" }), null);
    assert.equal(alertaDeEvento({ tipo: "numero_limite", numero: "1", limite: "TIER_10K", evento: null }), null);
  });
  it("avisa cuando la calidad baja y cuando Meta cambia la categoría", () => {
    assert.equal(alertaDeEvento({ tipo: "plantilla_calidad", metaId: null, nombre: "a", idioma: "es", previa: "GREEN", nueva: "RED" })?.severidad, "critica");
    assert.equal(alertaDeEvento({ tipo: "plantilla_calidad", metaId: null, nombre: "a", idioma: "es", previa: "GREEN", nueva: "YELLOW" })?.severidad, "aviso");
    const c = alertaDeEvento({ tipo: "plantilla_categoria", metaId: null, nombre: "a", idioma: "es", previa: "UTILITY", nueva: "MARKETING", programada: null });
    assert.equal(c?.titulo, "Meta cambió «a» a Marketing");
    assert.match(c?.detalle ?? "", /Antes era Utilidad/);
    const p = alertaDeEvento({ tipo: "plantilla_categoria", metaId: null, nombre: "a", idioma: "es", previa: null, nueva: "MARKETING", programada: "2026-11-02T10:00:00.000Z" });
    assert.equal(p?.titulo, "Meta cambiará «a» a Marketing");
    assert.match(p?.detalle ?? "", /2026-11-02/);
  });
  it("lo que pasa en la cuenta es crítico", () => {
    for (const evento of ["ACCOUNT_VIOLATION", "ACCOUNT_RESTRICTION", "DISABLED_UPDATE"] as const) assert.equal(alertaDeEvento({ tipo: "cuenta", evento, detalle: "x" })?.severidad, "critica");
  });
});

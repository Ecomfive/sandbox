// Los avisos de Meta que no son mensajes (28 oct 2026): una plantilla aprobada, rechazada o pausada, su calidad o su categoría que cambian,
// el límite de envío del número y las restricciones de la cuenta. Llegan por el mismo webhook de siempre (el de Meta y el de 360dialog).
// Sin base ni red, para poder probarlo: src/lib/whatsapp/eventos.test.ts. Los campos son los de la documentación de Meta (webhooks).

export type EventoCuenta =
  | {
      tipo: "plantilla_estado";
      metaId: string | null;
      nombre: string;
      idioma: string;
      /** APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED, REINSTATED… */
      evento: string;
      /** Por qué la rechazó, la pausó o la deshabilitó. */
      motivo: string | null;
      categoria: string | null;
    }
  | { tipo: "plantilla_calidad"; metaId: string | null; nombre: string; idioma: string; previa: string | null; nueva: string }
  | {
      tipo: "plantilla_categoria";
      metaId: string | null;
      nombre: string;
      idioma: string;
      previa: string | null;
      nueva: string;
      /** Si es un aviso previo («en 24 h pasará a…»): cuándo (ISO). Si ya pasó, null. */
      programada: string | null;
    }
  | { tipo: "numero_limite"; numero: string | null; limite: string | null; evento: string | null }
  | { tipo: "cuenta"; evento: "ACCOUNT_VIOLATION" | "ACCOUNT_RESTRICTION" | "DISABLED_UPDATE"; detalle: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const identificador = (v: unknown): string | null => (typeof v === "number" && Number.isFinite(v) ? String(v) : texto(v));
const iso = (segundos: unknown): string | null => {
  const n = Number(segundos);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};

/**
 * Los eventos de plantillas, de número y de cuenta de un aviso del webhook. Lo que no se entiende se ignora. Con `sinObjeto` (avisos de
 * 360dialog, que pueden llegar sin `object`) se aceptan también sin él.
 */
export function extraerEventosCuenta(aviso: unknown, sinObjeto = false): EventoCuenta[] {
  const eventos: EventoCuenta[] = [];
  if (obj(aviso).object !== "whatsapp_business_account" && !(sinObjeto && obj(aviso).object === undefined)) return eventos;
  for (const entrada of lista(obj(aviso).entry)) {
    for (const cambio of lista(obj(entrada).changes).map(obj)) {
      const v = obj(cambio.value);
      const nombre = texto(v.message_template_name);
      const idioma = texto(v.message_template_language) ?? "es";
      const metaId = identificador(v.message_template_id);
      switch (cambio.field) {
        case "message_template_status_update": {
          const evento = texto(v.event);
          if (!nombre || !evento) break;
          const recomendacion = texto(obj(v.rejection_info).recommendation);
          const razon = texto(v.reason);
          const otra = texto(obj(v.other_info).description);
          const motivo = [razon && razon.toUpperCase() !== "NONE" ? razon : null, recomendacion, otra].filter(Boolean).join(" · ") || null;
          eventos.push({ tipo: "plantilla_estado", metaId, nombre, idioma, evento: evento.toUpperCase(), motivo, categoria: texto(v.message_template_category) });
          break;
        }
        case "message_template_quality_update": {
          const nueva = texto(v.new_quality_score);
          if (!nombre || !nueva) break;
          eventos.push({ tipo: "plantilla_calidad", metaId, nombre, idioma, previa: texto(v.previous_quality_score), nueva });
          break;
        }
        case "template_category_update": {
          if (!nombre) break;
          // Un aviso previo trae `correct_category` (la que tendrá en 24 h); uno ya hecho trae `previous_category` y `new_category`.
          const correcta = texto(v.correct_category);
          const nueva = correcta ?? texto(v.new_category);
          if (!nueva) break;
          eventos.push({ tipo: "plantilla_categoria", metaId, nombre, idioma, previa: texto(v.previous_category), nueva, programada: correcta ? iso(v.category_update_timestamp) : null });
          break;
        }
        case "phone_number_quality_update": {
          // `current_limit` se quitó en febrero de 2026: el límite está en `max_daily_conversations_per_business`.
          const limite = texto(v.max_daily_conversations_per_business) ?? texto(v.current_limit);
          eventos.push({ tipo: "numero_limite", numero: texto(v.display_phone_number), limite, evento: texto(v.event) });
          break;
        }
        case "account_update": {
          const evento = texto(v.event);
          if (evento === "ACCOUNT_VIOLATION") eventos.push({ tipo: "cuenta", evento, detalle: texto(obj(v.violation_info).violation_type) ?? "Sin detalle" });
          else if (evento === "ACCOUNT_RESTRICTION") {
            const tipos = lista(v.restriction_info).map((r) => texto(obj(r).restriction_type)).filter(Boolean);
            const hasta = iso(obj(lista(v.restriction_info)[0]).expiration);
            eventos.push({ tipo: "cuenta", evento, detalle: `${tipos.join(", ") || "Sin detalle"}${hasta ? ` · hasta ${hasta.slice(0, 10)}` : ""}` });
          } else if (evento === "DISABLED_UPDATE") {
            const b = obj(v.ban_info);
            eventos.push({ tipo: "cuenta", evento, detalle: `${texto(b.waba_ban_state) ?? "Sin detalle"}${texto(b.waba_ban_date) ? ` · ${texto(b.waba_ban_date)}` : ""}` });
          }
          break;
        }
      }
    }
  }
  return eventos;
}

export type Severidad = "info" | "aviso" | "critica";

export interface AlertaNueva {
  tipo: string;
  severidad: Severidad;
  titulo: string;
  detalle: string | null;
}

const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" };
const categoriaTexto = (c: string | null) => (c ? (CATEGORIA[c.toUpperCase()] ?? c) : "otra");

/** Qué avisar de un evento (en palabras para el equipo), o null si no hace falta avisar nada. */
export function alertaDeEvento(e: EventoCuenta): AlertaNueva | null {
  switch (e.tipo) {
    case "plantilla_estado": {
      const n = `«${e.nombre}»`;
      switch (e.evento) {
        case "APPROVED":
          return { tipo: "plantilla_aprobada", severidad: "info", titulo: `Meta aprobó la plantilla ${n}`, detalle: "Ya se puede enviar." };
        case "REJECTED":
          return { tipo: "plantilla_rechazada", severidad: "aviso", titulo: `Meta rechazó la plantilla ${n}`, detalle: e.motivo ?? "Ábrela para corregirla y volver a mandarla." };
        case "PAUSED":
          return { tipo: "plantilla_pausada", severidad: "critica", titulo: `Meta pausó la plantilla ${n}`, detalle: e.motivo ?? "Muchas personas la bloquearon o no la leyeron. No se puede enviar mientras esté pausada." };
        case "DISABLED":
          return { tipo: "plantilla_deshabilitada", severidad: "critica", titulo: `Meta deshabilitó la plantilla ${n}`, detalle: e.motivo ?? "Ya no se puede enviar." };
        case "FLAGGED":
          return { tipo: "plantilla_riesgo", severidad: "aviso", titulo: `La plantilla ${n} está en riesgo`, detalle: "Meta la marcó por mala calidad: si sigue así la pausará." };
        case "REINSTATED":
          return { tipo: "plantilla_reactivada", severidad: "info", titulo: `Meta reactivó la plantilla ${n}`, detalle: null };
        default:
          return null;
      }
    }
    case "plantilla_calidad":
      if (e.nueva.toUpperCase() === "RED") return { tipo: "plantilla_calidad", severidad: "critica", titulo: `La calidad de «${e.nombre}» bajó a baja`, detalle: "Meta puede pausarla. Revisa el mensaje y a quién se le manda." };
      if (e.nueva.toUpperCase() === "YELLOW") return { tipo: "plantilla_calidad", severidad: "aviso", titulo: `La calidad de «${e.nombre}» bajó a media`, detalle: "Hay personas que la bloquean o no la leen." };
      return null;
    case "plantilla_categoria":
      return {
        tipo: "plantilla_categoria",
        severidad: "aviso",
        titulo: e.programada ? `Meta cambiará «${e.nombre}» a ${categoriaTexto(e.nueva)}` : `Meta cambió «${e.nombre}» a ${categoriaTexto(e.nueva)}`,
        detalle: e.programada
          ? `Pasará el ${e.programada.slice(0, 10)}. Marketing cuesta más por mensaje.`
          : e.previa
            ? `Antes era ${categoriaTexto(e.previa)}. Marketing cuesta más por mensaje.`
            : null,
      };
    case "numero_limite":
      return null;
    case "cuenta":
      return {
        tipo: e.evento === "ACCOUNT_RESTRICTION" ? "cuenta_restringida" : e.evento === "ACCOUNT_VIOLATION" ? "cuenta_violacion" : "cuenta_deshabilitada",
        severidad: "critica",
        titulo:
          e.evento === "ACCOUNT_RESTRICTION" ? "Meta restringió la cuenta de WhatsApp" : e.evento === "ACCOUNT_VIOLATION" ? "Meta avisó de una infracción en la cuenta de WhatsApp" : "Cambió el estado de la cuenta de WhatsApp",
        detalle: e.detalle,
      };
  }
}

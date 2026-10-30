import type { SupabaseClient } from "@supabase/supabase-js";
import { alertasDe, calcularSalud, compararAlertas, segmentoDe, type Prioridad, type Salud, type Segmento, type TipoAlerta } from "@/lib/crm/salud";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import { MODULO_ATENCION } from "@/lib/crm/areas";

/** Un dropshipper con cuenta de Dropi en el país, como lo ve Dirección. */
export interface FilaDireccion {
  id: string;
  codigo: string;
  nombre: string;
  /** Tipo de cliente (regular, vip, black), el que calcula el sistema o se fijó a mano. */
  nivel: string;
  responsable: string | null;
  salud: Salud;
  segmento: Segmento;
  ultimoPedido: string | null;
  pedidos30: number;
  pedidos30Antes: number;
}

export interface AlertaDireccion {
  /** `<dropshipper>:<tipo>`: una por tipo y dropshipper. */
  clave: string;
  dropshipperId: string;
  nombre: string;
  codigo: string;
  tipo: TipoAlerta;
  prioridad: Prioridad;
  texto: string;
  responsable: string | null;
  /** Pedidos de 60 días: entre alertas iguales va primero la de quien más movía. */
  peso: number;
}

export interface DatosDireccion {
  hoy: string;
  /** Pedidos al mes desde los que el país es VIP (Configuración › Tipo de cliente). */
  refVip: number;
  filas: FilaDireccion[];
  alertas: AlertaDireccion[];
  /** Alertas que alguien ya atendió y no vuelven a salir hasta su fecha. */
  atendidas: number;
  /** Dropshippers del país sin cuenta de Dropi vinculada: de ellos no se sabe si venden. */
  sinCuenta: number;
  semanas: { semana: string; pedidos: number }[];
  /** A quién se le puede pasar una tarea (quien puede escribir en el CRM). */
  personas: { id: string; nombre: string }[];
}

const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

interface FilaSalud {
  dropshipper_id: string;
  pedidos_14: number;
  pedidos_14_antes: number;
  pedidos_30: number;
  pedidos_30_antes: number;
  primer_pedido: string | null;
  ultimo_pedido: string | null;
  entregados_60: number;
  devueltos_60: number;
}

/**
 * Todo lo del panel de Dirección de un país: la salud de cada dropshipper con cuenta vinculada, la cola de alertas (sin las atendidas) y
 * los pedidos por semana. Sin la migración 0197 devuelve el error para avisarlo.
 */
export async function cargarDireccion(supabase: SupabaseClient, paisId: string): Promise<DatosDireccion | { error: string }> {
  const hoy = hoyPanama();
  const [salud, semanas, cuentas, enPais, umbral, atendidas, perfiles, personas] = await Promise.all([
    supabase.rpc("crm_salud_dropshippers", { p_pais: paisId }),
    supabase.rpc("crm_pedidos_semanales", { p_pais: paisId, p_semanas: 8 }),
    traerTodasLasFilas<{ dropshipper_id: string }>((d, h) => supabase.from("dropshipper_cuentas").select("dropshipper_id").eq("pais_id", paisId).order("id").range(d, h)),
    traerTodasLasFilas<{ dropshipper_id: string }>((d, h) => supabase.from("dropshipper_paises").select("dropshipper_id").eq("pais_id", paisId).order("dropshipper_id").range(d, h)),
    supabase.from("crm_tipo_cliente_umbrales").select("vip_desde").eq("pais_id", paisId).maybeSingle(),
    supabase.from("crm_alertas_atendidas").select("dropshipper_id, tipo").eq("pais_id", paisId).gte("hasta", hoy),
    supabase.from("perfiles").select("id, nombre, email"),
    personasConModulos(supabase, [MODULO_ATENCION]).catch(() => []),
  ]);
  if (salud.error || semanas.error || atendidas.error) return { error: "Falta correr la migración 0197 (panel de Dirección) en la base." };

  const conCuenta = new Set(cuentas.map((c) => c.dropshipper_id));
  const porId = new Map(((salud.data ?? []) as FilaSalud[]).map((f) => [f.dropshipper_id, f]));
  const ids = [...new Set([...conCuenta, ...porId.keys()])];
  const ds = await traerTodasLasFilas<{ id: string; codigo: string; nombre: string; nivel: string; responsable_id: string | null; fecha_ingreso: string | null; captado_en: string | null }>(
    (d, h) => supabase.from("dropshippers").select("id, codigo, nombre, nivel, responsable_id, fecha_ingreso, captado_en").order("id").range(d, h),
  );
  const dsPorId = new Map(ds.map((d) => [d.id, d]));
  // Quién lo lleva: su líder comercial y, si no tiene, quien tiene asignado su chat.
  const chats = await traerTodasLasFilas<{ dropshipper_id: string; asignada_a: string | null }>((d, h) =>
    supabase.from("whatsapp_conversaciones").select("dropshipper_id, asignada_a").not("dropshipper_id", "is", null).not("asignada_a", "is", null).order("id").range(d, h),
  );
  const nombrePerfil = new Map(((perfiles.data ?? []) as { id: string; nombre: string | null; email: string }[]).map((p) => [p.id, p.nombre || p.email]));
  const chatDe = new Map(chats.map((c) => [c.dropshipper_id, c.asignada_a]));
  const refVip = Number(umbral.data?.vip_desde ?? 500);
  const vistas = new Set(((atendidas.data ?? []) as { dropshipper_id: string; tipo: string }[]).map((a) => `${a.dropshipper_id}:${a.tipo}`));

  const filas: FilaDireccion[] = [];
  const alertas: AlertaDireccion[] = [];
  let ocultas = 0;
  for (const id of ids) {
    const d = dsPorId.get(id);
    if (!d) continue;
    const f = porId.get(id);
    const p = {
      pedidos14: f?.pedidos_14 ?? 0,
      pedidos14Antes: f?.pedidos_14_antes ?? 0,
      pedidos30: f?.pedidos_30 ?? 0,
      pedidos30Antes: f?.pedidos_30_antes ?? 0,
      primerPedido: f?.primer_pedido ?? null,
      ultimoPedido: f?.ultimo_pedido ?? null,
      entregados60: f?.entregados_60 ?? 0,
      devueltos60: f?.devueltos_60 ?? 0,
    };
    const respId = d.responsable_id ?? chatDe.get(id) ?? null;
    const responsable = respId ? (nombrePerfil.get(respId) ?? null) : null;
    filas.push({
      id,
      codigo: d.codigo,
      nombre: d.nombre,
      nivel: d.nivel,
      responsable,
      salud: calcularSalud(p, hoy, refVip),
      segmento: segmentoDe(p, hoy),
      ultimoPedido: p.ultimoPedido,
      pedidos30: p.pedidos30,
      pedidos30Antes: p.pedidos30Antes,
    });
    // La fecha de ingreso real (no `creado_en`: los que vinieron de ClickUp se crearon todos al importarlos, en octubre de 2026).
    const ingreso = (d.fecha_ingreso ?? d.captado_en)?.slice(0, 10) ?? null;
    for (const a of alertasDe(p, hoy, ingreso)) {
      const clave = `${id}:${a.tipo}`;
      if (vistas.has(clave)) {
        ocultas++;
        continue;
      }
      alertas.push({ clave, dropshipperId: id, nombre: d.nombre, codigo: d.codigo, ...a, responsable, peso: p.pedidos30 + p.pedidos30Antes });
    }
  }
  alertas.sort(compararAlertas);
  const sinCuenta = new Set(enPais.map((e) => e.dropshipper_id).filter((id) => !conCuenta.has(id))).size;

  return {
    hoy,
    refVip,
    filas,
    alertas,
    atendidas: ocultas,
    sinCuenta,
    semanas: ((semanas.data ?? []) as { semana: string; pedidos: number }[]).map((s) => ({ semana: s.semana, pedidos: Number(s.pedidos) })),
    personas: personas.filter((x) => !x.soloLectura).map(({ id, nombre }) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

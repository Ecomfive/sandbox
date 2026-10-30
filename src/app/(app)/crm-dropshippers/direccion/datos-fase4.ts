import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDuplicados, type FilaEntregas, type GrupoDuplicado } from "@/lib/crm/automatizar";
import { traerTodasConError, traerTodasLasFilas } from "@/lib/supabase/paginar";

/** Los pedidos del país por dropshipper y transportadora (`crm_entregas`, migración 0204). */
export async function cargarEntregas(supabase: SupabaseClient, paisId: string, dias: number): Promise<FilaEntregas[] | { error: string }> {
  const r = await traerTodasConError<{ dropshipper_id: string | null; transportadora: string; pedidos: number; entregados: number; devueltos: number; cancelados: number; novedades: number; en_camino: number }>(
    (d, h) => supabase.rpc("crm_entregas", { p_pais: paisId, p_dias: dias }).order("transportadora").order("dropshipper_id").range(d, h),
  );
  if (r.error) return { error: "Falta correr la migración 0204 (fase 4 del panel de Dirección) en la base." };
  return (r.data ?? []).map((f) => ({
    dropshipperId: f.dropshipper_id,
    transportadora: f.transportadora,
    pedidos: Number(f.pedidos),
    entregados: Number(f.entregados),
    devueltos: Number(f.devueltos),
    cancelados: Number(f.cancelados),
    novedades: Number(f.novedades),
    enCamino: Number(f.en_camino),
  }));
}

export interface MiembroDuplicado {
  id: string;
  codigo: string;
  nombre: string;
  /** Cuentas de Dropi vinculadas. */
  cuentas: number;
  ingreso: string | null;
  tieneChat: boolean;
}
export interface DuplicadosVista {
  grupos: (GrupoDuplicado & { miembros: MiembroDuplicado[] })[];
}

/** Los dropshippers que parecen la misma persona (de todos los países). Los números no salen de aquí: solo se dice «Mismo WhatsApp». */
export async function cargarDuplicados(supabase: SupabaseClient): Promise<DuplicadosVista> {
  const [ds, cuentas, chats] = await Promise.all([
    traerTodasLasFilas<{ id: string; codigo: string; nombre: string; contacto_telefono: string | null; telefono_alterno: string | null; contacto_email: string | null; tiendas: string[] | null; fecha_ingreso: string | null }>(
      (d, h) => supabase.from("dropshippers").select("id, codigo, nombre, contacto_telefono, telefono_alterno, contacto_email, tiendas, fecha_ingreso").order("id").range(d, h),
    ),
    traerTodasLasFilas<{ dropshipper_id: string; tienda_nombre: string | null }>((d, h) => supabase.from("dropshipper_cuentas").select("dropshipper_id, tienda_nombre").order("id").range(d, h)),
    traerTodasLasFilas<{ dropshipper_id: string }>((d, h) => supabase.from("whatsapp_conversaciones").select("dropshipper_id").not("dropshipper_id", "is", null).order("id").range(d, h)),
  ]);
  const tiendasDe = new Map<string, string[]>();
  const cuentasDe = new Map<string, number>();
  for (const c of cuentas) {
    cuentasDe.set(c.dropshipper_id, (cuentasDe.get(c.dropshipper_id) ?? 0) + 1);
    if (c.tienda_nombre) tiendasDe.set(c.dropshipper_id, [...(tiendasDe.get(c.dropshipper_id) ?? []), c.tienda_nombre]);
  }
  const conChat = new Set(chats.map((c) => c.dropshipper_id));
  const grupos = buscarDuplicados(
    ds.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      telefono: d.contacto_telefono,
      telefonoAlterno: d.telefono_alterno,
      correo: d.contacto_email,
      tiendas: [...(d.tiendas ?? []), ...(tiendasDe.get(d.id) ?? [])],
    })),
  );
  const porId = new Map(ds.map((d) => [d.id, d]));
  return {
    grupos: grupos.map((g) => ({
      ...g,
      miembros: g.ids.map((id) => {
        const d = porId.get(id)!;
        return { id, codigo: d.codigo, nombre: d.nombre, cuentas: cuentasDe.get(id) ?? 0, ingreso: d.fecha_ingreso, tieneChat: conChat.has(id) };
      }),
    })),
  };
}

export interface SecuenciaAltaVista {
  encendida: boolean;
  encendidaEn: string | null;
  responsableId: string | null;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
  /** Tareas que ya creó la secuencia y dropshippers que entraron en ella. */
  tareasCreadas: number;
  dropshippers: number;
}

export async function cargarSecuenciaAlta(supabase: SupabaseClient): Promise<SecuenciaAltaVista | { error: string }> {
  const [{ data, error }, pasos] = await Promise.all([
    supabase.from("crm_automatizaciones").select("encendida, config, encendida_en, actualizado_por_nombre, actualizado_en").eq("clave", "secuencia_alta").maybeSingle(),
    traerTodasConError<{ dropshipper_id: string; tarea_id: string | null }>((d, h) => supabase.from("crm_alta_pasos").select("dropshipper_id, tarea_id").order("dropshipper_id").order("paso").range(d, h)),
  ]);
  if (error || !data) return { error: "Falta correr la migración 0204 (fase 4 del panel de Dirección) en la base." };
  const filas = pasos.data ?? [];
  return {
    encendida: !!data.encendida,
    encendidaEn: (data.encendida_en as string | null) ?? null,
    responsableId: ((data.config ?? {}) as { responsable_id?: string }).responsable_id ?? null,
    actualizadoPor: (data.actualizado_por_nombre as string | null) ?? null,
    actualizadoEn: (data.actualizado_en as string | null) ?? null,
    tareasCreadas: filas.filter((p) => p.tarea_id).length,
    dropshippers: new Set(filas.map((p) => p.dropshipper_id)).size,
  };
}

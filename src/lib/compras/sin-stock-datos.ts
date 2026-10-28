// Compras › Sin stock (migración 0167): abre y cierra las alertas con la última lectura de «Mis productos» de Dropi y avisa a Compras. La
// llama `guardarNuestrosProductos` (la tarea de las 7:00 y «Actualizar datos») después de guardar la lectura. Importa con rutas relativas
// porque también corre desde `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarPersonasConAcceso, type PerfilConRol, type PermisoDeRol, type PermisoPropioDeModulo } from "../acceso-seccion";
import { puedeVerPais } from "../paises-permitidos";
import { idsDeDropi } from "../publicaciones/sincronizar-dropi";
import { conciliarAlertas, estadoDeProductos } from "./sin-stock";

export const RUTA_SIN_STOCK = "/compras/sin-stock";

/** Quienes pueden **modificar** Compras y ver el país: a ellos les llega el aviso. */
async function destinatarios(supabase: SupabaseClient, codigoPais: string): Promise<string[]> {
  const [perfiles, permisos, propios, roles] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id, activo, paises_permitidos"),
    supabase.from("permisos_rol").select("rol_id, solo_lectura").eq("modulo", "compras"),
    supabase.from("permisos_persona").select("perfil_id, nivel").eq("modulo", "compras"),
    supabase.from("roles").select("id, nombre"),
  ]);
  const nombres = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const deRol: PermisoDeRol[] = (permisos.data ?? []).map((p) => ({
    rol_id: p.rol_id as string,
    solo_lectura: !!p.solo_lectura,
    rol: nombres.get(p.rol_id as string) ?? "",
  }));
  const personas = armarPersonasConAcceso(
    (perfiles.data ?? []) as PerfilConRol[],
    deRol,
    (propios.error ? [] : (propios.data ?? [])) as PermisoPropioDeModulo[],
    nombres,
  );
  const paises = new Map((perfiles.data ?? []).map((p) => [p.id as string, (p.paises_permitidos as string[] | null) ?? null]));
  return personas.filter((p) => !p.soloLectura && puedeVerPais(paises.get(p.id) ?? null, codigoPais)).map((p) => p.id);
}

/**
 * Abre una alerta por cada producto que se quedó sin stock en Dropi (sin una viva) y cierra las de los que volvieron a tener; a quienes
 * pueden modificar Compras les deja un aviso «Para ti» con cuántos productos nuevos hay. Sin la migración no hace nada. Devuelve el resumen.
 */
export async function revisarSinStock(
  supabase: SupabaseClient,
  pais: { id: string; codigo: string },
): Promise<{ abiertas: number; cerradas: number } | { error: string }> {
  const vivasR = await supabase.from("compras_alertas_sin_stock").select("id, clave").eq("pais_id", pais.id).neq("estado", "cerrada");
  if (vivasR.error) return { error: "Falta la migración 0167." };
  const [pubsR, stockR, pausadasR] = await Promise.all([
    supabase.from("dropi_publicaciones").select("nombre, dropi_id, sku_maestro_id, estado, estado_publicacion, skus_maestros(nombre)").eq("pais_id", pais.id),
    supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock, stock_privado").eq("pais_id", pais.id),
    supabase.from("dropi_publicaciones").select("dropi_id").eq("pais_id", pais.id).not("pausada_en", "is", null),
  ]);
  if (pubsR.error || stockR.error) return { error: "No se pudieron leer las publicaciones o el stock." };
  const pausadas = new Set((pausadasR.error ? [] : (pausadasR.data ?? [])).map((p) => String(p.dropi_id)));
  const stock = new Map((stockR.data ?? []).map((s) => [String(s.dropi_producto_id), (Number(s.stock) || 0) + (Number(s.stock_privado) || 0)]));
  const productos = estadoDeProductos(
    (pubsR.data ?? []).map((p) => ({
      nombre: String(p.nombre ?? ""),
      dropiIds: idsDeDropi((p.dropi_id as string | null) ?? null).map(String),
      skuId: (p.sku_maestro_id as string | null) ?? null,
      skuNombre: ((p.skus_maestros as unknown as { nombre: string } | null)?.nombre as string | undefined) ?? null,
      viva: (p.estado !== "archivado" && p.estado_publicacion !== "archivado") || pausadas.has(String(p.dropi_id)),
    })),
    stock,
  );
  const { abrir, cerrar } = conciliarAlertas(productos, vivasR.data ?? []);
  const ahora = new Date().toISOString();
  if (cerrar.length)
    await supabase
      .from("compras_alertas_sin_stock")
      .update({
        estado: "cerrada",
        cerrada_en: ahora,
        motivo_cierre: "volvio_stock",
      })
      .in("id", cerrar);
  if (abrir.length) {
    const { error } = await supabase.from("compras_alertas_sin_stock").insert(
      abrir.map((p) => ({
        pais_id: pais.id,
        clave: p.clave,
        sku_maestro_id: p.skuId,
        dropi_ids: p.dropiIds,
        nombre: p.nombre.slice(0, 300),
      })),
    );
    if (error) return { error: "No se pudieron guardar las alertas." };
    const personas = await destinatarios(supabase, pais.codigo);
    const titulo = abrir.length === 1 ? `Sin stock en Dropi: ${abrir[0].nombre}` : `${abrir.length} productos se quedaron sin stock en Dropi`;
    const texto =
      abrir.length === 1
        ? "Revisa el inventario manual y decide si se compra."
        : abrir
            .map((p) => p.nombre)
            .slice(0, 5)
            .join(" · ") + (abrir.length > 5 ? "…" : "");
    if (personas.length)
      await supabase.from("notificaciones_usuario").insert(
        personas.map((id) => ({
          usuario_id: id,
          tipo: "sin_stock",
          titulo: titulo.slice(0, 200),
          texto: texto.slice(0, 500),
          href: RUTA_SIN_STOCK,
          autor_nombre: "Sistema",
        })),
      );
  }
  return { abiertas: abrir.length, cerradas: cerrar.length };
}

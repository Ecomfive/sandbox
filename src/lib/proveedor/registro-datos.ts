// Portal del proveedor › «Registro de pagos»: las filas de la tabla (cuotas ya con lo editado, más la llegada que anotó el proveedor) y
// guardar una celda. Solo servidor: quien llama ya comprobó el acceso (la cuenta del proveedor o Compras con escritura y montos).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { hoyPanama } from "./fechas";
import type { EstadoPagos } from "./pagos-servidor";
import { CAMPOS_REGISTRO, COLUMNA_HOJA, TIPO_CAMPO, filasRegistro, leerCelda, type CampoRegistro, type FilaRegistro } from "./registro-pagos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cargarRegistro(supabase: SupabaseClient, proveedorId: string, estado: EstadoPagos): Promise<FilaRegistro[]> {
  const llegadas = await traerTodasConError<{ id: string; llegada_proveedor: string | null }>((d, h) =>
    supabase.from("proveedor_pedidos").select("id, llegada_proveedor").eq("proveedor_id", proveedorId).not("llegada_proveedor", "is", null).order("id").range(d, h),
  );
  return filasRegistro(
    estado.envios,
    { registro: estado.registro, llegadaProveedor: Object.fromEntries((llegadas.error ? [] : (llegadas.data ?? [])).map((l) => [l.id, l.llegada_proveedor as string])) },
    hoyPanama(),
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function textoValor(campo: CampoRegistro, v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "vacío";
  if (TIPO_CAMPO[campo] === "fecha") return `${Number(String(v).slice(8, 10))} ${MESES[Number(String(v).slice(5, 7)) - 1]} ${String(v).slice(0, 4)}`;
  if (TIPO_CAMPO[campo] === "numero" && campo !== "unidades") return `$${Number(v).toLocaleString("es-PA", { maximumFractionDigits: 2 })}`;
  return typeof v === "number" ? v.toLocaleString("es-PA") : String(v);
}

/** Quién cambia la celda: el proveedor desde su portal o alguien de Ecomfive desde el Tablero de Chin. */
export type AutorRegistro = { lado: "proveedor"; nombre: string; proveedor: string; notificarA: string | null } | { lado: "ecomfive"; nombre: string; usuarioId: string; proveedor: string };

/**
 * Guarda una celda del Registro de pagos (vacía = vuelve al valor de siempre). Deja la línea en la Actividad de la compra (si la fila
 * tiene compra), la auditoría y el aviso al otro lado: a Ecomfive (novedad «Nuevo» y campana de `notificar_a`) si la cambió el
 * proveedor; al proveedor («Lo nuevo de Ecomfive» en su portal) si la cambió Ecomfive. Con `paisesPermitidos`, solo filas de esos
 * países. Devuelve el error como valor.
 */
export async function guardarCeldaRegistro(
  supabase: SupabaseClient,
  proveedorId: string,
  fila: unknown,
  campo: unknown,
  valor: unknown,
  autor: AutorRegistro,
  puedeVerPais?: (codigo: string | null) => boolean,
): Promise<{ error?: string }> {
  if (typeof campo !== "string" || !(CAMPOS_REGISTRO as readonly string[]).includes(campo)) return { error: "Columna no válida." };
  const c = campo as CampoRegistro;
  if (typeof fila !== "string" || fila.length > 80) return { error: "Fila no válida." };
  const leido = leerCelda(c, valor);
  if ("error" in leido) return leido;

  // La fila tiene que ser de este proveedor: un pedido visible de su espejo o una fila de sus hojas.
  type PedidoFila = { id: string; compra_id: string; producto: string; pais_codigo: string | null };
  let pedido: PedidoFila | null = null;
  let producto: string;
  if (UUID.test(fila)) {
    const { data } = await supabase.from("proveedor_pedidos").select("id, compra_id, producto, pais_codigo, proveedor_id, visible").eq("id", fila).maybeSingle();
    if (!data || data.proveedor_id !== proveedorId || !data.visible || (puedeVerPais && !puedeVerPais(data.pais_codigo as string | null))) return { error: "Esa fila ya no está en el registro." };
    pedido = data as PedidoFila;
    producto = data.producto as string;
  } else if (fila.startsWith("hoja:")) {
    const { data } = await supabase.from("proveedor_historial").select("producto, pais_codigo").eq("proveedor_id", proveedorId).eq("clave", fila.slice(5)).maybeSingle();
    if (!data || (puedeVerPais && !puedeVerPais(data.pais_codigo as string | null))) return { error: "Esa fila ya no está en el registro." };
    producto = data.producto as string;
  } else return { error: "Fila no válida." };

  const { data: previa } = await supabase.from("proveedor_registro").select(c).eq("proveedor_id", proveedorId).eq("fila", fila).maybeSingle();
  const antes = (previa as Record<string, string | number | null> | null)?.[c] ?? null;
  if (String(antes ?? "") === String(leido.valor ?? "")) return {};
  const { error } = await supabase
    .from("proveedor_registro")
    .upsert({ proveedor_id: proveedorId, fila, [c]: leido.valor, actualizado_por_nombre: autor.nombre, actualizado_en: new Date().toISOString() }, { onConflict: "proveedor_id,fila" });
  if (error) return { error: "No se pudo guardar. ¿Falta correr la migración 0142?" };

  const columna = COLUMNA_HOJA[c];
  const cambio = `${columna}: ${textoValor(c, antes)} → ${textoValor(c, leido.valor)}${leido.valor === null ? " (vuelve al valor de siempre)" : ""}`;
  const quien = autor.lado === "proveedor" ? `${autor.proveedor} (proveedor)` : autor.nombre;
  const texto = `${quien} cambió en el Registro de pagos ${producto} · ${cambio}`;
  await Promise.all([
    pedido
      ? supabase.from("wms_compra_eventos").insert({ compra_id: pedido.compra_id, campo: "registroPagos", valor_antes: null, valor_despues: cambio, autor: quien, origen: autor.lado === "proveedor" ? "proveedor" : "sistema" })
      : Promise.resolve(),
    supabase.from("proveedor_novedades").insert({ proveedor_id: proveedorId, pedido_id: pedido?.id ?? null, lado: autor.lado, tipo: "pago", texto, autor_nombre: autor.nombre }),
    autor.lado === "proveedor" && autor.notificarA
      ? supabase.from("notificaciones_usuario").insert({ usuario_id: autor.notificarA, tipo: "proveedor", titulo: texto, texto: "Registro de pagos", href: "/compras/tablero-chin?ver=pagos", autor_nombre: quien })
      : Promise.resolve(),
    supabase.from("historial_auditoria").insert({
      usuario_id: autor.lado === "ecomfive" ? autor.usuarioId : null,
      usuario_nombre: quien,
      accion: "editar_campo_compra",
      entidad: pedido ? "wms_compras" : "proveedor_historial",
      entidad_id: pedido ? pedido.compra_id : null,
      detalle: texto,
    }),
  ]);
  return {};
}

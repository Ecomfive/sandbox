import { redirect } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { getUsuarioActual } from "@/lib/auth";
import { NOMBRE_MODULO, ORDEN_CARGA } from "@/lib/importar/reconocer";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaHistorial, type FilaImportacion } from "./tabla-historial";

export const metadata = { title: "Historial de importaciones" };

export const dynamic = "force-dynamic";

/**
 * Bitácora de importaciones: no es un módulo; la abre quien puede abrir al menos un módulo con importador y solo ve las
 * importaciones de esos módulos. «Deshacer» se ofrece en los módulos que la persona puede modificar y lo vuelve a comprobar su acción.
 */
export default async function HistorialImportacionesPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  const modulos = ORDEN_CARGA.filter((m) => usuario.modulos.includes(m));
  if (!modulos.length) redirect("/sin-acceso");
  const { data, error } = await createServiceClient()
    .from("fin_importaciones")
    .select("id, modulo, archivo, usuario_nombre, creado_en, terminado_en, estado, nuevas, actualizadas, saltadas, borradas, detalle, deshecha_en, deshechas")
    .in("modulo", modulos)
    .order("creado_en", { ascending: false })
    .limit(500);
  if (error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Historial de importaciones" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la bitácora de importaciones">Correr la migración 0925 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const filas: FilaImportacion[] = (data ?? []).map((r) => ({
    id: r.id as string,
    modulo: r.modulo as string,
    nombreModulo: NOMBRE_MODULO[r.modulo as keyof typeof NOMBRE_MODULO] ?? (r.modulo as string),
    archivo: r.archivo as string,
    quien: (r.usuario_nombre as string | null) ?? "—",
    fecha: r.creado_en as string,
    estado: r.estado as FilaImportacion["estado"],
    nuevas: Number(r.nuevas) || 0,
    actualizadas: Number(r.actualizadas) || 0,
    saltadas: Number(r.saltadas) || 0,
    borradas: Number(r.borradas) || 0,
    detalle: Array.isArray(r.detalle) ? (r.detalle as string[]) : [],
    deshechaEn: (r.deshecha_en as string | null) ?? null,
    deshechas: (r.deshechas as number | null) ?? null,
  }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Historial de importaciones" imprimir={false} />
      <TablaHistorial filas={filas} modulosDeshacer={modulos.filter((m) => !usuario.modulosSoloLectura.includes(m))} />
    </Pagina>
  );
}

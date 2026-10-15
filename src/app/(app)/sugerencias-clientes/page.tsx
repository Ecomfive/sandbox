import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaSugerencia } from "./def-sugerencias";
import { TablaSugerencias } from "./tabla-sugerencias";

export const metadata = { title: "Sugerencias de clientes" };

export const dynamic = "force-dynamic";

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const etiquetaCliente = (d: { codigo: string | null; nombre: string } | null) => (d ? `${d.codigo ? `${d.codigo} · ` : ""}${d.nombre}` : "—");

/** Testing Lab › Fuentes › Sugerencias de clientes, en el país de operación de la barra de arriba. Se asignan a cualquier cliente. */
export default async function SugerenciasClientesPage() {
  const usuario = await requireModulo("sugerencias-clientes");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [sugerenciasR, clientesR] = await Promise.all([
    supabase
      .from("sugerencias_clientes")
      .select("id, codigo, nombre, estado, foto_url, notas, categoria, pais_detectado, dropshipper_id, creado_en, dropshippers(codigo, nombre), wms_seleccion_productos!sugerencias_clientes_seleccion_id_fkey(numero)")
      .eq("pais_id", pais.id)
      .order("creado_en", { ascending: false })
      .limit(1000),
    supabase.from("dropshippers").select("id, codigo, nombre").order("codigo"),
  ]);

  if (sugerenciasR.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Sugerencias de clientes" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las sugerencias. Si es la primera vez, falta correr la migración 0109 en Supabase.
        </p>
      </Pagina>
    );
  }

  const filas: FilaSugerencia[] = (sugerenciasR.data ?? []).map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nombre: s.nombre,
    estado: s.estado,
    fotoUrl: s.foto_url,
    notas: s.notas,
    categoria: s.categoria,
    paisDetectado: s.pais_detectado,
    dropshipperId: s.dropshipper_id,
    dropshipper: etiquetaCliente(uno(s.dropshippers as never)),
    seleccionNumero: (uno(s.wms_seleccion_productos as never) as { numero: number } | null)?.numero ?? null,
    creadoEn: s.creado_en,
  }));
  const clientes = (clientesR.data ?? []).map((d) => ({ id: d.id as string, etiqueta: etiquetaCliente(d as { codigo: string | null; nombre: string }) }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Sugerencias de clientes" oculto />
      <TablaSugerencias filas={filas} puedeEscribir={!usuario.modulosSoloLectura.includes("sugerencias-clientes")} clientes={clientes} />
    </Pagina>
  );
}

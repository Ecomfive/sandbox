import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { ExtractoUploader } from "./uploader";
import type { FilaMovimientoBanco } from "./def-movimientos";
import { TablaMovimientosBanco } from "./tabla-movimientos";
import { requireModulo } from "@/lib/auth";
import { ExtractoIcon } from "@/lib/nav-icons";

export const metadata = { title: "Extractos bancarios" };

export const dynamic = "force-dynamic";

export default async function ExtractosPage() {
  await requireModulo("extractos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: extractos }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("extractos_bancarios")
      .select(
        "id, archivo_path, fecha_carga, pais_id, movimientos_bancarios(id, fecha, monto, tipo, descripcion, plataforma_id)"
      )
      .eq("pais_id", pais.id)
      .order("fecha_carga", { ascending: false })
      .limit(10),
  ]);

  const nombrePlataforma = new Map((plataformas ?? []).map((p) => [p.id, p.nombre]));
  const movimientos: FilaMovimientoBanco[] = (extractos ?? []).flatMap((extracto) =>
    (extracto.movimientos_bancarios ?? []).map(
      (m: {
        id: string;
        fecha: string;
        monto: number;
        tipo: string;
        descripcion: string | null;
        plataforma_id: string | null;
      }) => ({
        id: m.id,
        extracto: extracto.fecha_carga,
        fecha: m.fecha,
        monto: Number(m.monto),
        tipo: m.tipo,
        descripcion: m.descripcion,
        plataformaId: m.plataforma_id,
        plataforma: m.plataforma_id ? (nombrePlataforma.get(m.plataforma_id) ?? null) : null,
      })
    )
  );

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <EncabezadoPagina titulo="Cargar extracto bancario" icono={ExtractoIcon} className="mb-4">
          Sube el archivo del banco, mapea las columnas y confirma para guardarlo.
        </EncabezadoPagina>
        <div className="max-w-5xl">
          <ExtractoUploader pais={pais} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Extractos cargados</h2>
        <div className="mt-3">
          <TablaMovimientosBanco
            movimientos={movimientos}
            codigoPais={pais.codigo}
            plataformas={plataformas ?? []}
            descargaCompleta={{
              href: "/api/exportar-extractos",
              etiqueta: "Todos los extractos",
              detalle: "historial completo",
            }}
          />
        </div>
      </div>
    </Pagina>
  );
}

import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { GUIAS } from "@/lib/ayuda/contenido";
import { manualesDeMisPuestos } from "@/lib/puestos/datos";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonLeido } from "../boton-leido";
import { cargarManuales, puedeEditarManuales, requireSesion } from "../../datos-ayuda";
import { EditorManual } from "./editor-manual";
import { TextoManual } from "../texto-manual";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manual de proceso" };

/** Un manual: se lee; quien administra lo edita en la misma página. `nuevo` crea uno. */
export default async function ManualPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireSesion();
  const editor = puedeEditarManuales(usuario);
  const modulos = GUIAS.map((g) => ({ valor: g.modulo, etiqueta: g.titulo }));

  if (id === "nuevo") {
    if (!editor) notFound();
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EtiquetaMiga texto="Nuevo manual" />
        <EncabezadoPagina titulo="Nuevo manual" oculto />
        <EditorManual manual={null} modulosDisponibles={modulos} />
      </Pagina>
    );
  }

  // Un manual enlazado a un puesto de la persona lo puede abrir aunque no sea de sus módulos.
  const [manuales, deMisPuestos] = await Promise.all([cargarManuales(usuario, true), manualesDeMisPuestos(usuario.id)]);
  const manual = manuales?.find((m) => m.id === id && (m.visible || deMisPuestos.has(m.id)));
  if (!manual) notFound();
  const estado = await estadoLectura(usuario.id, manual.id, manual.actualizadoEn);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={manual.titulo} />
      {editor ? (
        <EditorManual manual={manual} modulosDisponibles={modulos} />
      ) : (
        <>
          <EncabezadoPagina titulo={manual.titulo} />
          <article className="rounded-[10px] border border-border bg-card p-5">
            <TextoManual texto={manual.contenido} />
          </article>
        </>
      )}
      {estado && <BotonLeido manualId={manual.id} estado={estado} />}
    </Pagina>
  );
}

/** Si la persona ya leyó este manual (y si cambió después). Sin la migración 0112, `null` y no se ofrece el botón. */
async function estadoLectura(usuarioId: string, manualId: string, actualizadoEn: string): Promise<"hecho" | "pendiente" | "desactualizado" | null> {
  const { data, error } = await createServiceClient().from("manuales_lecturas").select("leido_en").eq("usuario_id", usuarioId).eq("manual_id", manualId).maybeSingle();
  if (error) return null;
  if (!data) return "pendiente";
  return Date.parse(actualizadoEn) > Date.parse(data.leido_en as string) ? "desactualizado" : "hecho";
}

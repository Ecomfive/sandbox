import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { GUIAS } from "@/lib/ayuda/contenido";
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

  const manual = (await cargarManuales(usuario))?.find((m) => m.id === id);
  if (!manual) notFound();
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
    </Pagina>
  );
}

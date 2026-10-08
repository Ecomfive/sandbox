import Link from "next/link";
import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { guiasPara } from "@/lib/ayuda/contenido";
import { cursosPara } from "@/lib/ayuda/cursos";
import { requireSesion } from "../../datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guía" };

/** La guía de un módulo, con su curso si lo tiene. Solo si la persona puede abrir ese módulo. */
export default async function GuiaPage({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  const usuario = await requireSesion();
  const guia = guiasPara(usuario.modulos).find((g) => g.modulo === modulo);
  if (!guia) notFound();
  const curso = cursosPara(usuario.modulos).find((c) => c.modulo === modulo);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={guia.titulo} />
      <EncabezadoPagina titulo={guia.titulo}>{guia.resumen}</EncabezadoPagina>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={guia.ruta} className={`rounded-lg border border-border bg-card px-3 py-1.5 font-medium hover:bg-muted ${anilloFoco}`}>
          Ir a {guia.titulo}
        </Link>
        {curso && (
          <Link href={`/ayuda/universidad/${curso.id}`} className={`rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-primario hover:bg-muted ${anilloFoco}`}>
            Hacer el curso «{curso.titulo}»
          </Link>
        )}
      </div>
      {guia.secciones.map((s) => (
        <section key={s.titulo} className="rounded-[10px] border border-border bg-card p-4">
          <h2 className="text-base font-semibold">{s.titulo}</h2>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            {s.pasos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>
      ))}
    </Pagina>
  );
}

import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { APROBAR_DESDE, cursoParaAlumno, cursosPara } from "@/lib/ayuda/cursos";
import { cargarProgreso, requireSesion } from "../../datos-ayuda";
import { CursoInteractivo } from "./curso-interactivo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curso" };

/** Un curso: sus lecciones una a una y el examen al final. Las respuestas correctas no salen del servidor. */
export default async function CursoPage({ params }: { params: Promise<{ curso: string }> }) {
  const { curso: id } = await params;
  const usuario = await requireSesion();
  const curso = cursosPara(usuario.modulos).find((c) => c.id === id);
  if (!curso) notFound();
  const progreso = (await cargarProgreso(usuario.id))?.get(curso.id) ?? null;
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={curso.titulo} />
      <EncabezadoPagina titulo={curso.titulo}>{curso.descripcion}</EncabezadoPagina>
      <CursoInteractivo curso={cursoParaAlumno(curso)} aprobarDesde={Math.round(APROBAR_DESDE * 100)} completadoEn={progreso?.completadoEn ?? null} mejorNota={progreso?.puntaje ?? null} />
    </Pagina>
  );
}

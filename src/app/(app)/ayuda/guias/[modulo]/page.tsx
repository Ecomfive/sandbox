import Link from "next/link";
import { notFound } from "next/navigation";
import { ICONO_MODULO, tonoModulo } from "@/components/ayuda/iconos-modulo";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { GLOSARIO, guiasPara } from "@/lib/ayuda/contenido";
import { cursosPara } from "@/lib/ayuda/cursos";
import { AyudaIcon, HistorialIcon, UniversidadIcon } from "@/lib/nav-icons";
import { cargarManuales, cargarProgreso, requireSesion } from "../../datos-ayuda";
import { PasosGuia } from "./pasos-guia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guía" };

/**
 * La guía de un módulo: encabezado con su ícono, índice de secciones, los pasos para ir marcando y, al lado, su curso, los
 * términos del glosario y los manuales de ese módulo. Solo si la persona puede abrir el módulo.
 */
export default async function GuiaPage({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  const usuario = await requireSesion();
  const guia = guiasPara(usuario.modulos).find((g) => g.modulo === modulo);
  if (!guia) notFound();
  const [progreso, manuales] = await Promise.all([cargarProgreso(usuario.id), cargarManuales(usuario)]);
  const curso = cursosPara(usuario.modulos).find((c) => c.modulo === modulo);
  const terminos = GLOSARIO.filter((t) => t.modulos?.includes(modulo));
  const manualesDelModulo = (manuales ?? []).filter((m) => m.modulos.includes(modulo));
  const Icono = ICONO_MODULO[modulo] ?? AyudaIcon;
  const tono = tonoModulo(modulo);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={guia.titulo} />
      <EncabezadoPagina titulo={guia.titulo} oculto />
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: tono }}>
          <Icono className="h-6 w-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 text-xl font-semibold">{guia.titulo}</p>
          <p className="m-0 text-sm text-muted-foreground">{guia.resumen}</p>
        </div>
        <Link href={guia.ruta} className={`boton-neon rounded-lg px-3 py-1.5 text-sm font-medium text-white ${anilloFoco}`}>
          Ir a {guia.titulo}
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <PasosGuia modulo={modulo} secciones={guia.secciones} />

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="En esta guía" className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
            <span className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">En esta guía</span>
            {guia.secciones.map((s, i) => (
              <a key={s.titulo} href={`#seccion-${i}`} className={`rounded-md px-2 py-1 text-sm hover:bg-muted ${anilloFoco}`}>
                {s.titulo}
              </a>
            ))}
          </nav>
          {curso && (
            <Link href={`/ayuda/universidad/${curso.id}`} className={`flex flex-col gap-1 rounded-xl border border-primario/40 bg-primario-suave p-3 ${anilloFoco}`}>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-primario">
                <UniversidadIcon className="h-4 w-4" aria-hidden="true" />
                {progreso?.get(curso.id)?.completadoEn ? "Curso completado ✓" : "Haz el curso"}
              </span>
              <span className="text-xs text-foreground-soft">
                {curso.titulo} · {curso.minutos} min
              </span>
            </Link>
          )}
          {terminos.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <span className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Términos</span>
              <dl className="m-0 flex flex-col gap-2">
                {terminos.slice(0, 6).map((t) => (
                  <div key={t.termino}>
                    <dt className="text-sm font-medium">{t.termino}</dt>
                    <dd className="m-0 text-xs text-muted-foreground">{t.definicion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {manualesDelModulo.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
              <span className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Manuales</span>
              {manualesDelModulo.map((m) => (
                <Link key={m.id} href={`/ayuda/manuales/${m.id}`} className={`flex items-center gap-1.5 rounded-md px-1 py-1 text-sm hover:bg-muted ${anilloFoco}`}>
                  <HistorialIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {m.titulo}
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </Pagina>
  );
}

import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { glosarioPara, guiasPara } from "@/lib/ayuda/contenido";
import { cursosPara } from "@/lib/ayuda/cursos";
import { AyudaIcon, CatalogoIcon, HistorialIcon, UniversidadIcon } from "@/lib/nav-icons";
import { cargarManuales, cargarProgreso, requireSesion } from "./datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de ayuda" };

/**
 * Centro de ayuda: el glosario, las guías de cada módulo, la Universidad (cursos con examen y progreso) y los manuales de
 * proceso. Todo se filtra por los módulos que la persona puede abrir.
 */
export default async function AyudaPage() {
  const usuario = await requireSesion();
  const [progreso, manuales] = await Promise.all([cargarProgreso(usuario.id), cargarManuales(usuario)]);
  const guias = guiasPara(usuario.modulos);
  const cursos = cursosPara(usuario.modulos);
  const completados = cursos.filter((c) => progreso?.get(c.id)?.completadoEn).length;

  const tarjetas = [
    { href: "/ayuda/glosario", titulo: "Glosario", texto: `${glosarioPara(usuario.modulos).length} términos del sistema explicados en una frase.`, Icono: CatalogoIcon },
    { href: "/ayuda/guias", titulo: "Guías", texto: `Cómo funciona cada parte: ${guias.length} guías de tus módulos.`, Icono: AyudaIcon },
    { href: "/ayuda/universidad", titulo: "Universidad", texto: `${completados} de ${cursos.length} cursos completados.`, Icono: UniversidadIcon },
    { href: "/ayuda/manuales", titulo: "Manuales de proceso", texto: manuales === null ? "Próximamente." : `${manuales.length} manuales de cómo trabajamos.`, Icono: HistorialIcon },
  ];

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Centro de ayuda" oculto />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {tarjetas.map(({ href, titulo, texto, Icono }) => (
          <li key={href}>
            <Link href={href} className={`flex h-full items-start gap-3 rounded-[10px] border border-border bg-card p-4 transition-colors hover:bg-muted ${anilloFoco}`}>
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primario-suave text-primario">
                <Icono className="h-5 w-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{titulo}</span>
                <span className="text-sm text-muted-foreground">{texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {cursos.some((c) => !progreso?.get(c.id)?.completadoEn) && (
        <section aria-labelledby="ayuda-siguiente" className="rounded-[10px] border border-border bg-card p-4">
          <h2 id="ayuda-siguiente" className="text-sm font-semibold">
            Tu siguiente curso
          </h2>
          {(() => {
            const c = cursos.find((x) => !progreso?.get(x.id)?.completadoEn)!;
            return (
              <p className="mt-1 text-sm text-muted-foreground">
                <Link href={`/ayuda/universidad/${c.id}`} className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}>
                  {c.titulo}
                </Link>{" "}
                · {c.minutos} min · {c.descripcion}
              </p>
            );
          })()}
        </section>
      )}
    </Pagina>
  );
}

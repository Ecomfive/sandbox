import Link from "next/link";
import { BuscadorAyuda } from "@/components/ayuda/buscador-ayuda";
import { ICONO_MODULO, tonoModulo } from "@/components/ayuda/iconos-modulo";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { glosarioPara, guiasPara, novedadesPara } from "@/lib/ayuda/contenido";
import { cursosPara } from "@/lib/ayuda/cursos";
import { formatearFecha } from "@/lib/formato";
import { AyudaIcon, CatalogoIcon, HistorialIcon, UniversidadIcon } from "@/lib/nav-icons";
import { cargarManuales, cargarProgreso, construirIndice, requireSesion } from "./datos-ayuda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centro de ayuda" };

/** Temas rápidos del buscador (los que más se preguntan); solo los de módulos que la persona usa. */
const TEMAS: { tema: string; modulo?: string }[] = [
  { tema: "Etapa", modulo: "compras" },
  { tema: "Vincular productos", modulo: "compras" },
  { tema: "Variantes", modulo: "producto" },
  { tema: "Lote", modulo: "inventario" },
  { tema: "Disponible", modulo: "inventario" },
  { tema: "Conciliar", modulo: "retiros" },
  { tema: "Permisos" },
  { tema: "Mención" },
];

/**
 * Centro de ayuda (inspirado en el de ClickUp): un buscador grande que encuentra al instante términos, guías, pasos, cursos y
 * manuales; accesos a cada sección; tu avance en la Universidad; las novedades del sistema y las guías de tus módulos.
 */
export default async function AyudaPage() {
  const usuario = await requireSesion();
  const [progreso, manuales] = await Promise.all([cargarProgreso(usuario.id), cargarManuales(usuario)]);
  const guias = guiasPara(usuario.modulos);
  const cursos = cursosPara(usuario.modulos);
  const completados = cursos.filter((c) => progreso?.get(c.id)?.completadoEn).length;
  const siguiente = cursos.find((c) => !progreso?.get(c.id)?.completadoEn);
  const novedades = novedadesPara(usuario.modulos).slice(0, 6);
  const temas = TEMAS.filter((t) => !t.modulo || usuario.modulos.includes(t.modulo)).map((t) => t.tema);
  const nombre = (usuario.nombre ?? usuario.email).split(/\s+/)[0];

  const recursos = [
    { href: "/ayuda/universidad", titulo: "Universidad", texto: `${completados} de ${cursos.length} cursos completados`, Icono: UniversidadIcon, tono: "#8a35c9" },
    { href: "/ayuda/guias", titulo: "Guías", texto: `${guias.length} guías de tus módulos`, Icono: AyudaIcon, tono: "#5f43d1" },
    { href: "/ayuda/glosario", titulo: "Glosario", texto: `${glosarioPara(usuario.modulos).length} términos explicados`, Icono: CatalogoIcon, tono: "#d74c81" },
    { href: "/ayuda/manuales", titulo: "Manuales de proceso", texto: manuales === null ? "Próximamente" : `${manuales.length} manuales del equipo`, Icono: HistorialIcon, tono: "#b12a97" },
  ];

  return (
    <Pagina ancho="media" className="flex flex-col gap-8">
      <EncabezadoPagina titulo="Centro de ayuda" oculto />

      <section aria-labelledby="ayuda-hola" className="relative rounded-2xl px-6 py-8 text-white sm:px-10 sm:py-10" style={{ backgroundImage: "var(--neon)" }}>
        <h2 id="ayuda-hola" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Hola, {nombre}. ¿En qué te ayudamos?
        </h2>
        <p className="mt-1 mb-5 text-sm text-white/85">Busca un término, una pantalla o cómo hacer algo. Solo verás lo de tus módulos.</p>
        <BuscadorAyuda indice={construirIndice(usuario, manuales)} grande temas={temas} />
      </section>

      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
        {recursos.map(({ href, titulo, texto, Icono, tono }) => (
          <li key={href}>
            <Link
              href={href}
              className={`group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgb(95_67_209/0.5)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco}`}
            >
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: tono }}>
                <Icono className="h-5 w-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">{titulo}</span>
                <span className="text-xs text-muted-foreground">{texto}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="ayuda-modulos" className="flex flex-col gap-3">
          <h2 id="ayuda-modulos" className="text-base font-semibold">
            Guías de tus módulos
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
            {guias.map((g) => {
              const Icono = ICONO_MODULO[g.modulo] ?? AyudaIcon;
              const tono = tonoModulo(g.modulo);
              return (
                <li key={g.modulo}>
                  <Link href={`/ayuda/guias/${g.modulo}`} className={`flex h-full items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted ${anilloFoco}`}>
                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${tono}1f`, color: tono }}>
                      <Icono className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">{g.titulo}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{g.resumen}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          {siguiente && (
            <section aria-labelledby="ayuda-siguiente" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <h2 id="ayuda-siguiente" className="flex items-center gap-2 text-base font-semibold">
                <UniversidadIcon className="h-4 w-4 text-primario" aria-hidden="true" />
                Tu siguiente curso
              </h2>
              <p className="m-0 text-sm font-medium">{siguiente.titulo}</p>
              <p className="m-0 text-xs text-muted-foreground">
                {siguiente.lecciones.length} lecciones · {siguiente.minutos} min · examen de {siguiente.examen.length} preguntas
              </p>
              <span className="block h-1.5 rounded-full bg-muted">
                <span className="barra-neon block h-1.5 rounded-full" style={{ width: `${cursos.length ? (completados / cursos.length) * 100 : 0}%` }} />
              </span>
              <Link href={`/ayuda/universidad/${siguiente.id}`} className={`boton-neon mt-1 w-fit rounded-lg px-3 py-1.5 text-sm font-medium text-white ${anilloFoco}`}>
                Empezar
              </Link>
            </section>
          )}

          {novedades.length > 0 && (
            <section aria-labelledby="ayuda-novedades" className="flex flex-col gap-3">
              <h2 id="ayuda-novedades" className="text-base font-semibold">
                Novedades
              </h2>
              <ol className="m-0 flex list-none flex-col gap-0 border-l-2 border-primario/30 p-0 pl-4">
                {novedades.map((n) => (
                  <li key={n.titulo} className="relative pb-4 last:pb-0">
                    <span aria-hidden="true" className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ring-2 ring-card" style={{ backgroundImage: "var(--neon)" }} />
                    <span className="text-[11px] text-muted-foreground">{formatearFecha(n.fecha)}</span>
                    {n.href ? (
                      <Link href={n.href} className={`block rounded text-sm font-medium hover:underline ${anilloFoco}`}>
                        {n.titulo}
                      </Link>
                    ) : (
                      <span className="block text-sm font-medium">{n.titulo}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">{n.texto}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </Pagina>
  );
}

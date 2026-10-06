"use client";

import { Fragment, Suspense, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { almacen } from "@/components/tabla/almacen";
import { ContadorMenu, ContadorSobreIcono } from "@/components/sidebar-contador";
import { FavoritoToggle } from "@/components/favorito-toggle";
import { anilloFoco } from "@/components/ui/field";
import { SIN_PENDIENTES, sumaDeItems, type PendientesMenu } from "@/lib/contadores-menu";
import { FRENTES, PRONTO_NAV, encontrarSeccionActiva, moduloDeHref, type NavItem, type NavSection } from "@/lib/nav-data";
import { AjustesIcon, AvisosIcon, ConfiguracionIcon, DashboardIcon, SECTION_ICONS } from "@/lib/nav-icons";

/** Si el panel de páginas está oculto («cerrado»); se guarda en el navegador de cada persona. */
const CLAVE_PANEL = "sidebar-panel-v1";

function ToggleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

function puedeVer(modulosPermitidos: string[] | null | undefined, href?: string) {
  if (!href || !modulosPermitidos) return true;
  return modulosPermitidos.includes(moduloDeHref(href));
}

interface AreaVisible {
  area: NavSection;
  /** Las páginas del área que esta persona puede abrir. */
  items: NavItem[];
  /** Lo que suman los pendientes de esas páginas (la pastilla del riel). */
  cantidad: number;
}

/** Las áreas tal como las ve la persona: solo las páginas de sus módulos y sin áreas vacías. */
function areasVisibles(areas: NavSection[], modulos: string[] | null | undefined, contadores: PendientesMenu["contadores"]): AreaVisible[] {
  return areas
    .map((area) => {
      const items = area.items.filter((item) => puedeVer(modulos, item.href));
      return { area, items, cantidad: sumaDeItems(items, contadores) };
    })
    .filter((a) => a.items.length > 0);
}

/** Pendientes de una página: el Centro de notificaciones muestra el total; las demás, lo suyo. */
function cantidadDe(item: NavItem, pendientes: PendientesMenu): number {
  if (!item.href) return 0;
  return item.href === "/notificaciones" ? pendientes.total : (pendientes.contadores[item.href] ?? 0);
}

function esActiva(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/** Una página del panel: su enlace, lo pendiente y la estrella para fijarla. */
function ItemPagina({
  item,
  pathname,
  favoritos,
  pendientes,
  alNavegar,
}: {
  item: NavItem;
  pathname: string;
  favoritos: string[];
  pendientes: PendientesMenu;
  alNavegar?: () => void;
}) {
  if (!item.href) return null;
  const activo = esActiva(pathname, item.href);
  return (
    <div className="flex items-center gap-0.5">
      <Link
        href={item.href}
        onClick={alNavegar}
        aria-current={activo ? "page" : undefined}
        className={`flex flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[13px] ${anilloFoco} ${
          activo ? "bg-accent font-medium text-accent-foreground" : "text-foreground transition-colors hover:bg-muted"
        }`}
      >
        {item.label}
        <ContadorMenu cantidad={cantidadDe(item, pendientes)} />
      </Link>
      <FavoritoToggle href={item.href} activo={favoritos.includes(item.href)} />
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 px-3 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>;
}

function SubTitulo({ children }: { children: ReactNode }) {
  return <h3 className="mb-0.5 px-3 text-[0.68rem] font-medium tracking-wide text-muted-foreground">{children}</h3>;
}

/**
 * Las páginas de un área. Si el área se reparte en frentes (Proveeduría, Gestión de tienda, Fulfillment) cada uno lleva su
 * subtítulo y el que no tiene páginas dice «Próximamente»; lo que no es de ningún frente va arriba, sin subtítulo.
 */
function PaginasDeArea({
  area,
  items,
  ...resto
}: {
  area: NavSection;
  items: NavItem[];
  pathname: string;
  favoritos: string[];
  pendientes: PendientesMenu;
  alNavegar?: () => void;
}) {
  if (!area.frentes) {
    return (
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <ItemPagina key={item.href} item={item} {...resto} />
        ))}
      </div>
    );
  }
  const generales = items.filter((i) => !i.frente);
  return (
    <div className="flex flex-col gap-3">
      {generales.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {generales.map((item) => (
            <ItemPagina key={item.href} item={item} {...resto} />
          ))}
        </div>
      )}
      {FRENTES.map((f) => {
        const delFrente = items.filter((i) => i.frente === f.id);
        return (
          <div key={f.id} role="group" aria-label={f.titulo}>
            <SubTitulo>{f.titulo}</SubTitulo>
            {delFrente.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {delFrente.map((item) => (
                  <ItemPagina key={item.href} item={item} {...resto} />
                ))}
              </div>
            ) : (
              <p className="m-0 px-3 py-1 text-xs text-muted-foreground/70">Próximamente</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Las páginas favoritas de la persona (los accesos rápidos), siempre a la vista. */
function Favoritos({ areas, favoritos, ...resto }: { areas: AreaVisible[]; favoritos: string[]; pathname: string; pendientes: PendientesMenu; alNavegar?: () => void }) {
  const todos = areas.flatMap((a) => a.items);
  const fijados = favoritos.map((href) => todos.find((i) => i.href === href)).filter((i): i is NavItem => i !== undefined);
  return (
    <section aria-label="Favoritos">
      <Titulo>Favoritos</Titulo>
      {fijados.length === 0 ? (
        <p className="px-3 text-xs text-muted-foreground">Marca una página con ☆ para tenerla aquí.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {fijados.map((item) => (
            <ItemPagina key={item.href} item={item} favoritos={favoritos} {...resto} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Lo que aún no se puede abrir, recogido para no ocupar lugar en el menú. */
function Proximamente({ className = "" }: { className?: string }) {
  return (
    <details className={`group ${className}`}>
      <summary className={`cursor-pointer rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}>
        Próximamente ({PRONTO_NAV.length})
      </summary>
      <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
        {PRONTO_NAV.map((nombre) => (
          <li key={nombre} className="flex items-center justify-between rounded-md px-3 py-1.5 text-[13px] text-muted-foreground/70">
            {nombre}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Pronto</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** El foco sobre el riel negro: anillo blanco (el de siempre es casi negro y no se vería). */
const anilloRiel = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-riel";
const claseRielBoton = `flex w-full flex-col items-center gap-1.5 rounded-lg px-0.5 py-2 text-center text-[0.65rem] leading-tight ${anilloRiel}`;
/** Elegida: texto blanco y el halo de color detrás del ícono; las demás, gris claro que se aclara al pasar. */
const claseRiel = (seleccionada: boolean) => `${claseRielBoton} ${seleccionada ? "font-semibold text-white" : "text-riel-texto hover:bg-riel-hover hover:text-white"}`;

/** El ícono de un botón del riel, con el halo de color si es el elegido y la pastilla de pendientes en su esquina. */
function IconoRiel({ Icono, seleccionada, cantidad = 0 }: { Icono: (typeof SECTION_ICONS)[string]; seleccionada: boolean; cantidad?: number }) {
  return (
    <span className="relative inline-flex">
      {seleccionada && <span aria-hidden="true" className="brillo-riel" />}
      <Icono className="relative h-5 w-5" />
      <ContadorSobreIcono cantidad={cantidad} />
    </span>
  );
}

/**
 * Menú de escritorio: un riel con las áreas de trabajo (un punto de color donde hay algo pendiente) y, al lado, el panel
 * con las páginas del área elegida, las fijadas y lo que viene. Pulsar un área solo cambia el panel; no sale de la
 * página. Al navegar, el panel pasa solo al área de la nueva página. El panel se puede ocultar para ganar ancho.
 */
function RielYPanel({
  areas,
  modulosPermitidos,
  favoritos,
  pendientes,
}: {
  areas: NavSection[];
  modulosPermitidos?: string[] | null;
  favoritos: string[];
  pendientes: PendientesMenu;
}) {
  const pathname = usePathname();
  const visibles = areasVisibles(areas, modulosPermitidos, pendientes.contadores);
  // Las áreas «ocultas» (Avisos) no tienen botón en el riel: tienen el suyo abajo.
  const delRiel = visibles.filter((v) => !v.area.oculta);
  const deLaRuta = encontrarSeccionActiva(pathname, visibles.map((v) => ({ ...v.area, items: v.items })));
  const activa = deLaRuta && delRiel.some((v) => v.area.title === deLaRuta) ? deLaRuta : (delRiel[0]?.area.title ?? null);
  // El área que se pulsó vale solo mientras se esté en la misma página: al navegar, manda la de la página nueva.
  const [elegida, setElegida] = useState<{ ruta: string; titulo: string } | null>(null);
  const guardado = almacen(CLAVE_PANEL, "local");
  const panelOculto = useSyncExternalStore(guardado.suscribir, guardado.leer, () => "") === "cerrado";
  const rielRef = useRef<HTMLElement>(null);

  // Un clic fuera del menú recoge el panel (el riel se queda): se pulsa un área para volver a abrirlo. Dentro del menú
  // (el riel, el panel, una estrella) no pasa nada. En móvil el menú de escritorio no se ve y no hace nada.
  useEffect(() => {
    if (panelOculto) return;
    function alPulsar(e: PointerEvent) {
      const menu = rielRef.current?.closest("aside");
      if (!menu || menu.getClientRects().length === 0) return;
      if (e.target instanceof Node && !menu.contains(e.target)) guardado.guardar("cerrado");
    }
    document.addEventListener("pointerdown", alPulsar);
    return () => document.removeEventListener("pointerdown", alPulsar);
    // `guardado` se vuelve a crear en cada dibujo pero apunta siempre a la misma clave guardada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOculto]);

  const titulo = elegida && elegida.ruta === pathname ? elegida.titulo : activa;
  const verFavoritos = titulo === "Favoritos";
  const mostrada = delRiel.find((v) => v.area.title === titulo) ?? delRiel[0];
  const puedeConfigurar = puedeVer(modulosPermitidos, "/configuracion");
  const puedeVerAvisos = puedeVer(modulosPermitidos, "/notificaciones");

  function elegir(nombre: string) {
    setElegida({ ruta: pathname, titulo: nombre });
    if (panelOculto) guardado.guardar("");
  }

  function botonRiel(nombre: string, seleccionada: boolean, Icono: (typeof SECTION_ICONS)[string], cantidad: number) {
    return (
      <button
        key={nombre}
        type="button"
        aria-pressed={seleccionada}
        onClick={() => elegir(nombre)}
        className={claseRiel(seleccionada)}
      >
        <IconoRiel Icono={Icono} seleccionada={seleccionada} cantidad={cantidad} />
        <span>{nombre}</span>
      </button>
    );
  }

  return (
    <>
      <nav ref={rielRef} aria-label="Áreas del menú" className="flex w-20 shrink-0 flex-col items-center gap-1 bg-riel px-1 py-2.5">
        <Link href="/" aria-label="Ecomfive, ir al inicio" className={`mb-2 flex h-9 w-full items-center justify-center rounded ${anilloRiel}`}>
          <Image src="/brand/ecomfive-rojo.png" alt="" width={161} height={44} className="h-3 w-auto" />
        </Link>
        {delRiel.map((v, i) => {
          const Icono = SECTION_ICONS[v.area.title] ?? DashboardIcon;
          const boton = botonRiel(v.area.title, !verFavoritos && v.area.title === mostrada?.area.title, Icono, v.cantidad);
          // «Favoritos» va justo después del primer botón, como acceso propio.
          return i === 0 ? (
            <Fragment key={v.area.title}>
              {boton}
              {botonRiel("Favoritos", verFavoritos, SECTION_ICONS.Favoritos, 0)}
            </Fragment>
          ) : (
            boton
          );
        })}
        <div className="mt-auto flex w-full flex-col gap-0.5">
          {puedeVerAvisos && (
            <Link
              href="/notificaciones"
              aria-current={pathname === "/notificaciones" ? "page" : undefined}
              className={claseRiel(pathname === "/notificaciones")}
            >
              <IconoRiel Icono={AvisosIcon} seleccionada={pathname === "/notificaciones"} cantidad={pendientes.total} />
              <span>Avisos</span>
            </Link>
          )}
          {puedeConfigurar && (
            <Link
              href="/configuracion"
              aria-current={pathname === "/configuracion" ? "page" : undefined}
              className={claseRiel(pathname === "/configuracion")}
            >
              <IconoRiel Icono={AjustesIcon} seleccionada={pathname === "/configuracion"} />
              <span>Ajustes</span>
            </Link>
          )}
          <button
            type="button"
            aria-expanded={!panelOculto}
            aria-label={panelOculto ? "Mostrar el panel de páginas" : "Ocultar el panel de páginas"}
            onClick={() => guardado.guardar(panelOculto ? "" : "cerrado")}
            className={claseRiel(false)}
          >
            <ToggleIcon className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {!panelOculto && (verFavoritos || mostrada) && (
        <nav aria-label={verFavoritos ? "Páginas favoritas" : `Páginas de ${mostrada?.area.title}`} className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-2.5">
          {verFavoritos ? (
            <Favoritos areas={visibles} favoritos={favoritos} pathname={pathname} pendientes={pendientes} />
          ) : (
            mostrada && (
              <section aria-label={mostrada.area.panel ?? mostrada.area.title}>
                <Titulo>{mostrada.area.panel ?? mostrada.area.title}</Titulo>
                <PaginasDeArea area={mostrada.area} items={mostrada.items} pathname={pathname} favoritos={favoritos} pendientes={pendientes} />
              </section>
            )
          )}
          <Proximamente className="mt-auto" />
        </nav>
      )}
    </>
  );
}

/** Menú de móvil: todas las áreas, una debajo de la otra (sin acordeones), con los favoritos arriba. */
function ListaMovil({
  areas,
  modulosPermitidos,
  favoritos,
  pendientes,
  alNavegar,
}: {
  areas: NavSection[];
  modulosPermitidos?: string[] | null;
  favoritos: string[];
  pendientes: PendientesMenu;
  alNavegar: () => void;
}) {
  const pathname = usePathname();
  const visibles = areasVisibles(areas, modulosPermitidos, pendientes.contadores);
  return (
    <nav aria-label="Menú principal" className="flex flex-1 flex-col gap-4 overflow-y-auto p-2.5">
      <Favoritos areas={visibles} favoritos={favoritos} pathname={pathname} pendientes={pendientes} alNavegar={alNavegar} />
      {visibles
        .filter((v) => !v.area.oculta)
        .map((v) => (
          <section key={v.area.title} aria-label={v.area.panel ?? v.area.title}>
            <Titulo>{v.area.panel ?? v.area.title}</Titulo>
            <PaginasDeArea area={v.area} items={v.items} pathname={pathname} favoritos={favoritos} pendientes={pendientes} alNavegar={alNavegar} />
          </section>
        ))}
      {puedeVer(modulosPermitidos, "/notificaciones") && (
        <section aria-label="Avisos">
          <Titulo>Avisos</Titulo>
          <Link
            href="/notificaciones"
            onClick={alNavegar}
            aria-current={pathname === "/notificaciones" ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[13px] ${anilloFoco} ${pathname === "/notificaciones" ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}
          >
            Centro de notificaciones
            <ContadorMenu cantidad={pendientes.total} />
          </Link>
        </section>
      )}
      {puedeVer(modulosPermitidos, "/configuracion") && (
        <section aria-label="Sistema">
          <Titulo>Sistema</Titulo>
          <Link
            href="/configuracion"
            onClick={alNavegar}
            aria-current={pathname === "/configuracion" ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] ${anilloFoco} ${pathname === "/configuracion" ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}
          >
            <ConfiguracionIcon className="h-4 w-4 text-muted-foreground" />
            Configuración
          </Link>
        </section>
      )}
      <Proximamente />
    </nav>
  );
}

function Resuelto({ pendientes, children }: { pendientes: Promise<PendientesMenu>; children: (p: PendientesMenu) => ReactNode }) {
  return <>{children(use(pendientes))}</>;
}

/**
 * El menú sale de inmediato y los contadores llegan cuando la consulta termina: la promesa la crea el layout sin
 * esperarla, así contar pendientes no retrasa la carga de ninguna página. Mientras tanto se dibuja el mismo menú sin
 * contadores (las pastillas están al final de cada fila: no mueve nada).
 */
function ConPendientes({ pendientes, children }: { pendientes: Promise<PendientesMenu>; children: (p: PendientesMenu) => ReactNode }) {
  return (
    <Suspense fallback={<>{children(SIN_PENDIENTES)}</>}>
      <Resuelto pendientes={pendientes}>{children}</Resuelto>
    </Suspense>
  );
}

export function Sidebar({
  modulosPermitidos,
  areas,
  favoritos,
  pendientes,
}: {
  modulosPermitidos?: string[] | null;
  areas: NavSection[];
  favoritos: string[];
  pendientes: Promise<PendientesMenu>;
}) {
  const [movilAbierto, setMovilAbierto] = useState(false);

  return (
    <>
      {/* Riel y panel — escritorio */}
      <aside className="sticky top-0 hidden h-screen shrink-0 md:flex">
        <ConPendientes pendientes={pendientes}>
          {(p) => <RielYPanel areas={areas} modulosPermitidos={modulosPermitidos} favoritos={favoritos} pendientes={p} />}
        </ConPendientes>
      </aside>

      {/* Botón hamburguesa — móvil */}
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setMovilAbierto(true)}
        className={`fixed top-3 left-3 z-40 rounded-md bg-card p-2 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground transition-colors md:hidden ${anilloFoco}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Cajón — móvil */}
      {movilAbierto && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div role="dialog" aria-modal="true" aria-label="Menú" className="flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <Image src="/brand/ecomfive-rojo.png" alt="Ecomfive" width={161} height={44} className="h-5 w-auto" />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMovilAbierto(false)}
                className={`rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted ${anilloFoco}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ConPendientes pendientes={pendientes}>
              {(p) => (
                <ListaMovil areas={areas} modulosPermitidos={modulosPermitidos} favoritos={favoritos} pendientes={p} alNavegar={() => setMovilAbierto(false)} />
              )}
            </ConPendientes>
          </div>
          <button aria-label="Cerrar menú" onClick={() => setMovilAbierto(false)} className="flex-1 bg-black/30" />
        </div>
      )}
    </>
  );
}

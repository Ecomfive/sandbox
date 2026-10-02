"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { EVENTO_ABRIR_BUSCADOR } from "@/components/atajos-teclado";
import { almacen } from "@/components/tabla/almacen";
import { anilloFoco } from "@/components/ui/field";
import { buscarGlobal, type ResultadoBusqueda } from "@/lib/busqueda-global";
import type { AccionCrear } from "@/lib/crear-global";
import { BuscarIcon, ChevronRightIcon, MasIcon } from "@/lib/nav-icons";
import {
  filtrarPaginas,
  filtrarPorTexto,
  leerBusquedaRetiro,
  moverSeleccion,
  parsearRecientes,
  recientesActualizados,
  type PaginaBuscable,
} from "@/lib/paleta";

type TipoOpcion = "accion" | "pagina" | "registro";

interface Opcion {
  id: string;
  grupo: string;
  titulo: string;
  detalle: string;
  href: string;
  tipo: TipoOpcion;
}

const ICONO: Record<TipoOpcion, typeof MasIcon> = { accion: MasIcon, pagina: ChevronRightIcon, registro: BuscarIcon };

/**
 * Buscador y paleta de comandos, con atajo Ctrl K (⌘ K en Mac) desde cualquier página. La barra de arriba muestra un
 * botón con forma de campo; al pulsarlo (o con el atajo, o con «/») se abre una ventana al centro con el campo de búsqueda.
 * Sin escribir ofrece las páginas recientes, las acciones de crear y otras páginas; al escribir filtra las acciones y las
 * páginas al instante y busca retiros (por correlativo), pedidos, productos, productos en test y dropshippers. Se usa con
 * flechas, Enter y Escape (patrón combobox con `aria-activedescendant`).
 */
export function BusquedaGlobal({ paginas, acciones }: { paginas: PaginaBuscable[]; acciones: AccionCrear[] }) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [remotos, setRemotos] = useState<ResultadoBusqueda[]>([]);
  const [activo, setActivo] = useState(-1);
  // La etiqueta del atajo depende del equipo; en el servidor se dibuja «Ctrl K» y en el navegador se ajusta.
  const esMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const disparadorRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const idTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consultaVigente = useRef(0);
  const devolverFoco = useRef(true);

  // Páginas recientes: se guardan en el navegador de cada persona.
  const recientesAlmacen = almacen("paleta-recientes-v1", "local");
  const recientesJson = useSyncExternalStore(recientesAlmacen.suscribir, recientesAlmacen.leer, () => "");
  const porHref = useMemo(() => new Map(paginas.map((p) => [p.href, p])), [paginas]);

  useEffect(() => {
    if (!porHref.has(pathname)) return;
    recientesAlmacen.guardar(JSON.stringify(recientesActualizados(parsearRecientes(recientesAlmacen.leer()), pathname)));
  }, [pathname, porHref, recientesAlmacen]);

  function abrir() {
    devolverFoco.current = true;
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setConsulta("");
    setRemotos([]);
    setActivo(-1);
    if (idTimeout.current) clearTimeout(idTimeout.current);
    consultaVigente.current += 1;
  }

  // Ctrl K / ⌘ K desde cualquier página: abre, y con la paleta abierta la cierra.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (abierto) {
        cerrar();
      } else {
        abrir();
      }
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  // El atajo «/» (ver AtajosTeclado) también abre el buscador.
  useEffect(() => {
    document.addEventListener(EVENTO_ABRIR_BUSCADOR, abrir);
    return () => document.removeEventListener(EVENTO_ABRIR_BUSCADOR, abrir);
  }, []);

  // Al abrir, el foco entra en el campo; al cerrar, vuelve al botón (salvo que se haya ido a otra página).
  useEffect(() => {
    if (abierto) {
      inputRef.current?.focus();
      return;
    }
    if (devolverFoco.current) disparadorRef.current?.focus({ preventScroll: true });
  }, [abierto]);

  // Con la paleta abierta la página de atrás no se desplaza.
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [abierto]);

  const texto = consulta.trim();
  const opciones = useMemo<Opcion[]>(() => {
    const lista: Opcion[] = [];
    const deRemoto = (grupo: string, tipos: ResultadoBusqueda["tipo"][]) =>
      remotos
        .filter((r) => tipos.includes(r.tipo))
        .forEach((r, i) => lista.push({ id: `${idBase}-${r.tipo}-${i}`, grupo, titulo: r.titulo, detalle: r.detalle, href: r.href, tipo: "registro" }));
    const deAcciones = (elegidas: AccionCrear[]) =>
      elegidas.forEach((a, i) => lista.push({ id: `${idBase}-a${i}`, grupo: "Acciones", titulo: a.etiqueta, detalle: a.detalle, href: a.href, tipo: "accion" }));
    if (texto === "") {
      const recientes = parsearRecientes(recientesJson)
        .filter((href) => href !== pathname)
        .map((href) => porHref.get(href))
        .filter((p): p is PaginaBuscable => p !== undefined);
      const vistas = new Set(recientes.map((p) => p.href));
      const sugeridas = paginas.filter((p) => p.href !== pathname && !vistas.has(p.href)).slice(0, 6);
      recientes.forEach((p, i) => lista.push({ id: `${idBase}-r${i}`, grupo: "Recientes", titulo: p.etiqueta, detalle: p.contexto, href: p.href, tipo: "pagina" }));
      deAcciones(acciones);
      sugeridas.forEach((p, i) => lista.push({ id: `${idBase}-s${i}`, grupo: "Ir a", titulo: p.etiqueta, detalle: p.contexto, href: p.href, tipo: "pagina" }));
      return lista;
    }
    deRemoto("Retiros", ["retiro"]);
    deAcciones(filtrarPorTexto(acciones.map((a) => ({ ...a, etiqueta: a.etiqueta })), texto));
    filtrarPaginas(paginas, texto).forEach((p, i) =>
      lista.push({ id: `${idBase}-p${i}`, grupo: "Páginas", titulo: p.etiqueta, detalle: p.contexto, href: p.href, tipo: "pagina" })
    );
    deRemoto("Pedidos Dropi", ["pedido"]);
    deRemoto("Productos", ["producto"]);
    deRemoto("Productos en test", ["producto-test"]);
    deRemoto("Dropshippers", ["dropshipper"]);
    return lista;
  }, [texto, remotos, paginas, acciones, porHref, recientesJson, pathname, idBase]);

  function alEscribir(valor: string) {
    setConsulta(valor);
    setActivo(-1);
    if (idTimeout.current) clearTimeout(idTimeout.current);
    const numero = ++consultaVigente.current;
    // Un número suelto busca un retiro; lo demás pide al menos dos letras.
    if (valor.trim().length < 2 && leerBusquedaRetiro(valor) === null) {
      setRemotos([]);
      return;
    }
    idTimeout.current = setTimeout(() => {
      startTransition(async () => {
        // Si la búsqueda falla (sin conexión, sesión vencida) siguen las páginas y acciones, que se filtran aquí.
        const encontrados = await buscarGlobal(valor).catch(() => []);
        // Si mientras tanto se escribió otra cosa, esta respuesta ya no vale.
        if (numero === consultaVigente.current) setRemotos(encontrados);
      });
    }, 250);
  }

  function irA(href: string) {
    devolverFoco.current = false;
    cerrar();
    router.push(href);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const siguiente = moverSeleccion(activo, e.key === "ArrowDown" ? 1 : -1, opciones.length);
      setActivo(siguiente);
      const id = opciones[siguiente]?.id;
      if (id) listaRef.current?.querySelector(`[id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const elegida = opciones[activo] ?? (opciones.length === 1 ? opciones[0] : undefined) ?? (texto !== "" ? opciones[0] : undefined);
      if (elegida) {
        e.preventDefault();
        irA(elegida.href);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (consulta !== "") {
        setConsulta("");
        setRemotos([]);
        setActivo(-1);
      } else {
        cerrar();
      }
    }
  }

  const sinResultados = texto !== "" && !pending && opciones.length === 0;
  // Las opciones ya vienen ordenadas por grupo; el índice es la posición para la selección con teclado.
  const grupos = useMemo(() => {
    const salida: { nombre: string; id: string; opciones: { opcion: Opcion; indice: number }[] }[] = [];
    opciones.forEach((opcion, indice) => {
      const ultimo = salida[salida.length - 1];
      if (ultimo && ultimo.nombre === opcion.grupo) ultimo.opciones.push({ opcion, indice });
      else salida.push({ nombre: opcion.grupo, id: `${idBase}-g${salida.length}`, opciones: [{ opcion, indice }] });
    });
    return salida;
  }, [opciones, idBase]);

  return (
    <>
      <button
        ref={disparadorRef}
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={abrir}
        className={`flex min-h-8 w-full max-w-xs items-center gap-2 rounded-full border border-border-control bg-background py-1.5 pr-2 pl-3.5 text-left text-sm text-muted-foreground hover:bg-muted ${anilloFoco}`}
      >
        <BuscarIcon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Buscar retiro, pedido, página…</span>
        <kbd aria-hidden="true" className="hidden rounded border border-border bg-card px-1.5 py-0.5 text-[0.65rem] font-medium md:block">
          {esMac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </button>

      {abierto &&
        createPortal(
          <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
            <div role="dialog" aria-modal="true" aria-label="Buscar o ir a una página" className="flex max-h-[min(34rem,80vh)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-border px-4">
                <BuscarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={idLista}
                  aria-autocomplete="list"
                  aria-activedescendant={activo >= 0 ? opciones[activo]?.id : undefined}
                  aria-label="Buscar o ir a una página"
                  autoComplete="off"
                  value={consulta}
                  onChange={(e) => alEscribir(e.target.value)}
                  onKeyDown={alTeclear}
                  placeholder="Busca una página, una acción, un retiro (#0007) o un producto…"
                  className="w-full bg-transparent py-3.5 text-[15px] placeholder:text-muted-foreground focus:outline-none"
                />
                <button type="button" onClick={cerrar} className={`shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                  Esc
                </button>
              </div>

              <div ref={listaRef} id={idLista} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {grupos.map((g) => (
                  <div key={g.nombre} role="group" aria-labelledby={g.id}>
                    <p id={g.id} className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                      {g.nombre}
                    </p>
                    {g.opciones.map(({ opcion: o, indice: i }) => {
                      const Icono = ICONO[o.tipo];
                      return (
                        <div
                          key={o.id}
                          id={o.id}
                          role="option"
                          aria-selected={i === activo}
                          // mousedown y no click: así el campo no pierde el foco antes de ir a la página.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            irA(o.href);
                          }}
                          onMouseMove={() => activo !== i && setActivo(i)}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${i === activo ? "bg-muted" : ""}`}
                        >
                          <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{o.titulo}</span>
                          <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{o.detalle}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {pending && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
                {sinResultados && (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    <p>Sin resultados para “{texto}”.</p>
                    <p className="mt-0.5">Prueba con el número de un retiro (#0007), un SKU, una orden o el nombre de una página.</p>
                  </div>
                )}
              </div>

              <div aria-hidden="true" className="flex gap-4 border-t border-border px-4 py-2 text-[0.7rem] text-muted-foreground">
                <span>↑ ↓ para moverte</span>
                <span>Enter para abrir</span>
                <span>Esc para cerrar</span>
              </div>
              <p role="status" className="sr-only">
                {texto !== "" && !pending ? `${opciones.length} resultado${opciones.length === 1 ? "" : "s"}` : ""}
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

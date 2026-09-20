"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { almacen } from "@/components/tabla/almacen";
import { buscarGlobal, type ResultadoBusqueda } from "@/lib/busqueda-global";
import {
  filtrarPaginas,
  leerBusquedaRetiro,
  moverSeleccion,
  parsearRecientes,
  recientesActualizados,
  type PaginaBuscable,
} from "@/lib/paleta";

interface Opcion {
  id: string;
  grupo: string;
  titulo: string;
  detalle: string;
  href: string;
}

/**
 * Buscador de la barra de arriba, con atajo Ctrl K (o ⌘ K) desde cualquier página. Sin escribir muestra las
 * páginas recientes; al escribir filtra las páginas del menú al instante y busca retiros (por correlativo),
 * pedidos, productos y dropshippers. Se usa con flechas, Enter y Escape (patrón combobox).
 */
export function BusquedaGlobal({ paginas }: { paginas: PaginaBuscable[] }) {
  const [consulta, setConsulta] = useState("");
  const [remotos, setRemotos] = useState<ResultadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consultaVigente = useRef(0);

  // Páginas recientes: se guardan en el navegador de cada persona.
  const recientesAlmacen = almacen("paleta-recientes-v1", "local");
  const recientesJson = useSyncExternalStore(recientesAlmacen.suscribir, recientesAlmacen.leer, () => "");
  const porHref = useMemo(() => new Map(paginas.map((p) => [p.href, p])), [paginas]);

  useEffect(() => {
    if (!porHref.has(pathname)) return;
    recientesAlmacen.guardar(JSON.stringify(recientesActualizados(parsearRecientes(recientesAlmacen.leer()), pathname)));
  }, [pathname, porHref, recientesAlmacen]);

  // Ctrl K / ⌘ K desde cualquier página.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setAbierto(true);
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const texto = consulta.trim();
  const opciones = useMemo<Opcion[]>(() => {
    const lista: Opcion[] = [];
    const deRemoto = (grupo: string, tipos: ResultadoBusqueda["tipo"][]) =>
      remotos
        .filter((r) => tipos.includes(r.tipo))
        .forEach((r, i) => lista.push({ id: `${idBase}-${r.tipo}-${i}`, grupo, titulo: r.titulo, detalle: r.detalle, href: r.href }));
    if (texto === "") {
      const recientes = parsearRecientes(recientesJson)
        .filter((href) => href !== pathname)
        .map((href) => porHref.get(href))
        .filter((p): p is PaginaBuscable => p !== undefined);
      const vistas = new Set(recientes.map((p) => p.href));
      const sugeridas = paginas.filter((p) => p.href !== pathname && !vistas.has(p.href)).slice(0, 6);
      recientes.forEach((p, i) => lista.push({ id: `${idBase}-r${i}`, grupo: "Recientes", titulo: p.etiqueta, detalle: p.contexto, href: p.href }));
      sugeridas.forEach((p, i) => lista.push({ id: `${idBase}-s${i}`, grupo: "Ir a", titulo: p.etiqueta, detalle: p.contexto, href: p.href }));
      return lista;
    }
    deRemoto("Retiros", ["retiro"]);
    filtrarPaginas(paginas, texto).forEach((p, i) =>
      lista.push({ id: `${idBase}-p${i}`, grupo: "Páginas", titulo: p.etiqueta, detalle: p.contexto, href: p.href })
    );
    deRemoto("Pedidos Dropi", ["pedido"]);
    deRemoto("Productos", ["producto"]);
    deRemoto("Dropshippers", ["dropshipper"]);
    return lista;
  }, [texto, remotos, paginas, porHref, recientesJson, pathname, idBase]);

  function alEscribir(valor: string) {
    setConsulta(valor);
    setActivo(-1);
    setAbierto(true);
    if (idTimeout.current) clearTimeout(idTimeout.current);
    const numero = ++consultaVigente.current;
    // Un número suelto busca un retiro; lo demás pide al menos dos letras.
    if (valor.trim().length < 2 && leerBusquedaRetiro(valor) === null) {
      setRemotos([]);
      return;
    }
    idTimeout.current = setTimeout(() => {
      startTransition(async () => {
        // Si la búsqueda falla (sin conexión, sesión vencida) siguen las páginas, que se filtran aquí.
        const encontrados = await buscarGlobal(valor).catch(() => []);
        // Si mientras tanto se escribió otra cosa, esta respuesta ya no vale.
        if (numero === consultaVigente.current) setRemotos(encontrados);
      });
    }, 250);
  }

  function cerrar() {
    setAbierto(false);
    setActivo(-1);
  }

  function irA(href: string) {
    cerrar();
    setConsulta("");
    setRemotos([]);
    inputRef.current?.blur();
    router.push(href);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => moverSeleccion(a, e.key === "ArrowDown" ? 1 : -1, opciones.length));
    } else if (e.key === "Enter") {
      const elegida = opciones[activo] ?? (opciones.length === 1 ? opciones[0] : undefined);
      if (elegida) {
        e.preventDefault();
        irA(elegida.href);
      }
    } else if (e.key === "Escape") {
      if (abierto) {
        e.preventDefault();
        cerrar();
      } else if (consulta !== "") {
        setConsulta("");
        setRemotos([]);
      }
    } else if (e.key === "Tab") {
      cerrar();
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
    <div ref={contenedorRef} className="relative w-full max-w-xs">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? opciones[activo]?.id : undefined}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Buscar o ir a una página"
        autoComplete="off"
        value={consulta}
        onChange={(e) => alEscribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}
        placeholder="Buscar retiro, pedido, página…"
        className="w-full rounded-full border border-border-control bg-background py-1.5 pr-14 pl-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground md:block"
      >
        Ctrl K
      </kbd>
      {abierto && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Resultados"
          className="absolute top-full left-0 z-40 mt-1 max-h-96 w-full min-w-[22rem] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {grupos.map((g) => (
            <div key={g.nombre} role="group" aria-labelledby={g.id}>
              <p id={g.id} className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                {g.nombre}
              </p>
              {g.opciones.map(({ opcion: o, indice: i }) => (
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
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-1.5 text-sm ${
                    i === activo ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-medium">{o.titulo}</span>
                  <span className="text-xs text-muted-foreground">{o.detalle}</span>
                </div>
              ))}
            </div>
          ))}
          {pending && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
          {sinResultados && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              <p>Sin resultados para “{texto}”.</p>
              <p className="mt-0.5">Prueba con el número de un retiro (#0007), un SKU, una orden o el nombre de una página.</p>
            </div>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {abierto && texto !== "" && !pending ? `${opciones.length} resultado${opciones.length === 1 ? "" : "s"}` : ""}
      </p>
    </div>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { BuscarIcon } from "@/lib/nav-icons";
import { normalizar } from "@/lib/tabla/motor";
import { CrearDropshipperPanel } from "./crear-dropshipper-panel";
import { DEF_DROPSHIPPERS, diasEntre, etiquetaNivel, etiquetaUltimoPedido, montoCorto, type FilaCaso, type FilaDropshipper } from "./def-crm";
import { FichaLateral, tonoEstado } from "./ficha-lateral";
import { BotonBarra, BotonDescargar, Etiqueta, MarcoTabla, Pastilla, Punto, claseConFicha, claseTd, claseTh } from "./piezas-crm";

const DIAS_RIESGO = 30;
const GRUPOS = [
  { estado: "activo", titulo: "Activos", punto: "exito" as const },
  { estado: "prospecto", titulo: "Prospectos", punto: "aviso" as const },
  { estado: "inactivo", titulo: "Inactivos", punto: "gris" as const },
];
const ENCABEZADOS = ["Dropshipper", "Nivel", "Ciudad", "Responsable", "Pedidos mes", "Ventas mes", "Último pedido", "Casos", "Etiquetas"];

/** Directorio de dropshippers: búsqueda, filtros de un toque, agrupado por estado y la ficha del elegido a la derecha. */
export function TablaDirectorio({
  dropshippers,
  casos,
  paisId,
  codigoPais,
  hoy,
  demo,
  puedeEscribir,
}: {
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  paisId: string;
  codigoPais: string;
  hoy: string;
  demo: boolean;
  puedeEscribir: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloVip, setSoloVip] = useState(false);
  const [enRiesgo, setEnRiesgo] = useState(false);
  const [agrupar, setAgrupar] = useState(true);
  const [verInactivos, setVerInactivos] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return dropshippers.filter(
      (d) =>
        (verInactivos || d.estado !== "inactivo") &&
        (!q || normalizar(`${d.nombre} ${d.codigo} ${d.ciudad ?? ""} ${d.tienda ?? ""}`).includes(q)) &&
        (!soloVip || d.nivel === "vip") &&
        (!enRiesgo || (d.estado === "activo" && d.ultimoPedido !== null && diasEntre(d.ultimoPedido, hoy) >= DIAS_RIESGO)),
    );
  }, [dropshippers, busqueda, soloVip, enRiesgo, verInactivos, hoy]);

  const grupos = useMemo(
    () => (agrupar ? GRUPOS.map((g) => ({ ...g, filas: filas.filter((d) => d.estado === g.estado) })).filter((g) => g.filas.length > 0) : [{ estado: "todos", titulo: "", punto: "gris" as const, filas }]),
    [filas, agrupar],
  );
  const orden = grupos.flatMap((g) => g.filas.map((d) => d.id));
  const idFicha = elegido && orden.includes(elegido) ? elegido : (orden[0] ?? null);
  const ocultos = dropshippers.filter((d) => d.estado === "inactivo").length;

  const fila = (d: FilaDropshipper) => (
    <tr
      key={d.id}
      tabIndex={0}
      aria-current={d.id === idFicha ? "true" : undefined}
      onClick={() => setElegido(d.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setElegido(d.id);
        }
      }}
      className={`cursor-pointer hover:bg-muted aria-[current=true]:bg-accent ${anilloFoco}`}
    >
      <td className={claseTd}>
        <span className="block font-medium">{d.nombre}</span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {d.codigo}
          {d.tienda ? ` · ${d.tienda}` : ""}
        </span>
      </td>
      <td className={claseTd}>
        <Pastilla tono={d.nivel === "vip" ? "oscuro" : "neutro"}>{etiquetaNivel(d.nivel)}</Pastilla>
      </td>
      <td className={claseTd}>{d.ciudad ?? "—"}</td>
      <td className={claseTd}>{d.responsable ?? <span className="text-muted-foreground">Sin asignar</span>}</td>
      <td className={`${claseTd} text-right tabular-nums`}>{d.pedidosMes || "—"}</td>
      <td className={`${claseTd} text-right tabular-nums`}>{d.ventasMes ? montoCorto(d.ventasMes, codigoPais) : "—"}</td>
      <td className={claseTd}>{etiquetaUltimoPedido(d.ultimoPedido, hoy)}</td>
      <td className={claseTd}>
        {d.casosAbiertos ? (
          <Pastilla>
            <Punto />
            {d.casosAbiertos}
            <span className="sr-only"> casos abiertos</span>
          </Pastilla>
        ) : (
          "—"
        )}
      </td>
      <td className={claseTd}>{d.etiquetas.length ? d.etiquetas.map((e) => <Etiqueta key={e}>{e}</Etiqueta>) : "—"}</td>
    </tr>
  );

  return (
    <div className={claseConFicha}>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex h-[34px] max-w-xs min-w-[12.5rem] flex-[1_1_12.5rem] items-center gap-1.5 rounded-lg border border-border-control bg-card px-2.5 focus-within:ring-2 focus-within:ring-foreground">
            <BuscarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar nombre, código o ciudad"
              aria-label="Buscar dropshipper"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </label>
          <BotonBarra activo={soloVip} onClick={() => setSoloVip((v) => !v)}>Solo VIP</BotonBarra>
          <BotonBarra activo={enRiesgo} onClick={() => setEnRiesgo((v) => !v)}>Sin pedir {DIAS_RIESGO} días</BotonBarra>
          <BotonBarra activo={agrupar} onClick={() => setAgrupar((v) => !v)}>Agrupar: Estado</BotonBarra>
          <BotonBarra activo={verInactivos} onClick={() => setVerInactivos((v) => !v)}>Inactivos{ocultos ? ` (${ocultos})` : ""}</BotonBarra>
          <span className="flex-1" />
          <BotonDescargar def={DEF_DROPSHIPPERS} filas={filas} />
          {puedeEscribir && <CrearDropshipperPanel paisId={paisId} />}
        </div>

        <MarcoTabla ariaLabel="Directorio de dropshippers">
          <table className="w-full min-w-[54rem] border-collapse">
            <thead>
              <tr>
                {ENCABEZADOS.map((t, i) => (
                  <th key={t} scope="col" className={`${claseTh} ${i === 4 || i === 5 ? "text-right" : ""}`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={ENCABEZADOS.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {dropshippers.length === 0 ? "Todavía no hay dropshippers. Usa «Agregar» para registrar el primero." : "Ningún dropshipper coincide con lo que buscas."}
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <Fragment key={g.estado}>
                    {agrupar && (
                      <tr>
                        <td colSpan={ENCABEZADOS.length} className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground-soft">
                          <Punto tono={tonoEstado(g.estado) === "exito" ? "exito" : g.punto} className="mr-2" />
                          {g.titulo} · {g.filas.length}
                        </td>
                      </tr>
                    )}
                    {g.filas.map(fila)}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </MarcoTabla>
        <p className="px-0.5 py-2 text-xs text-muted-foreground" role="status">
          Mostrando {filas.length} de {dropshippers.length}
          {!verInactivos && ocultos > 0 ? ` · ${ocultos} inactivos ocultos (botón «Inactivos»)` : ""}
        </p>
      </div>

      <FichaLateral
        dropshipper={dropshippers.find((d) => d.id === idFicha) ?? null}
        casos={casos}
        orden={orden}
        alIr={setElegido}
        codigoPais={codigoPais}
        hoy={hoy}
        demo={demo}
      />
    </div>
  );
}

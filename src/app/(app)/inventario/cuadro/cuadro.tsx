"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Segmentado } from "@/components/panel/piezas-panel";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { fieldClassSm } from "@/components/ui/field";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { formatearFecha, formatearTiempoRelativo } from "@/lib/formato";
import { BuscarIcon } from "@/lib/nav-icons";
import { CON_VENTAS, resumenCuadro, type FilaCuadro } from "@/lib/wms/cuadro-plataformas";
import { ETIQUETA_PLATAFORMA, lecturaVieja, type Plataforma } from "@/lib/wms/stock-plataformas";
import { tomarCorte } from "./actions";

export interface FilaVista extends FilaCuadro {
  codigo: string;
  nombre: string;
  foto: string | null;
}

const entero = (n: number) => n.toLocaleString("es-PA");
const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const OPCIONES = (["dropi", "effi", "drop"] as const).map((p) => ({ valor: p, etiqueta: ETIQUETA_PLATAFORMA[p] }));

function Cifra({ titulo, valor, tono = "" }: { titulo: string; valor: string; tono?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{titulo}</span>
      <span className={`text-2xl font-semibold tabular-nums ${tono}`}>{valor}</span>
    </div>
  );
}

/**
 * El cuadro de una plataforma: por producto, corte + entró − vendido = debería haber, contra lo que ella dice. Lo que entró sin remisión sale como sobrante y lo que se perdió como
 * faltante. Sin ventas conectadas (Effi, Drop), la diferencia incluye lo vendido, y lo dice. Sin corte, ofrece tomarlo.
 */
export function Cuadro({
  plataforma,
  filas,
  fechaCorte,
  lectura,
  ventasHasta,
  lecturaFallo,
  puedeTomarCorte,
}: {
  plataforma: Plataforma;
  filas: FilaVista[];
  fechaCorte: string | null;
  lectura: string | null;
  ventasHasta: string | null;
  lecturaFallo: boolean;
  puedeTomarCorte: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { mostrarToast } = useToast();
  const [pendiente, startTransition] = useTransition();
  const [buscar, setBuscar] = useState("");
  const [todas, setTodas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conVentas = CON_VENTAS[plataforma];
  const nombre = ETIQUETA_PLATAFORMA[plataforma];
  const resumen = useMemo(() => resumenCuadro(filas), [filas]);
  const visibles = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    return filas.filter((f) => (todas || q || f.diferencia !== 0) && (!q || sinAcentos(`${f.codigo} ${f.nombre}`).includes(q)));
  }, [filas, buscar, todas]);

  const corte = () => {
    setError(null);
    startTransition(async () => {
      const r = await tomarCorte(plataforma);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(`Corte de ${nombre} guardado: ${entero(r.productos ?? 0)} productos`);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmentado etiqueta="Plataforma" valor={plataforma} alCambiar={(p) => router.replace(`${pathname}?plataforma=${p}`)} opciones={OPCIONES} />
        <p className="m-0 text-xs text-muted-foreground">
          {fechaCorte ? `Corte del ${formatearFecha(fechaCorte)} · ` : ""}
          <span className={lecturaVieja(lectura) ? "font-medium text-warning" : ""}>Lectura {lectura ? formatearTiempoRelativo(lectura) : "pendiente"}</span>
          {ventasHasta ? ` · Ventas hasta el ${formatearFecha(ventasHasta)}` : ""}
        </p>
      </div>
      {lecturaFallo && (
        <p role="alert" className="m-0 text-sm text-destructive">
          Una lectura no cargó: el cuadro puede estar incompleto. Recarga la página.
        </p>
      )}

      {!fechaCorte ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5">
          <p className="m-0 text-sm font-medium">{nombre} todavía no tiene corte.</p>
          <p className="m-0 max-w-2xl text-sm text-muted-foreground">
            El corte guarda lo que dice la última lectura de {nombre} como punto de partida, y desde ahí se cuadra. Se toma una sola vez.
            {lecturaVieja(lectura) ? ` La última lectura está vieja: conviene actualizar ${nombre} antes.` : ""}
          </p>
          {puedeTomarCorte ? (
            <button type="button" disabled={pendiente} onClick={corte} className="min-h-10 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground">
              {pendiente ? "Guardando…" : `Tomar corte de ${nombre}`}
            </button>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Lo toma un administrador.</p>
          )}
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <section aria-label="Resumen del cuadro" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra titulo="Cuadran" valor={entero(resumen.cuadran)} tono="text-success" />
            <Cifra titulo="Con diferencia" valor={entero(resumen.conDiferencia)} tono={resumen.conDiferencia ? "text-warning" : ""} />
            <Cifra titulo="Unidades de más" valor={entero(resumen.sobran)} />
            <Cifra titulo={conVentas ? "Unidades de menos" : "De menos (incluye ventas)"} valor={entero(resumen.faltan)} />
          </section>
          <p className="m-0 max-w-4xl text-sm text-muted-foreground">
            {conVentas
              ? "De más: entró a la plataforma sin una remisión del sistema. De menos: falta mercancía, o una venta todavía no se ve. Un pedido reciente cancelado o devuelto puede mover la cifra unos días."
              : `Las ventas de ${nombre} todavía no se leen: lo de menos incluye lo que se vendió, así que no es una pérdida. Lo de más sí es mercancía que entró sin remisión.`}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <span className="sr-only">Buscar producto</span>
              <BuscarIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Código o nombre" className={`${fieldClassSm} w-60 pl-8`} />
            </label>
            <button
              type="button"
              aria-pressed={todas}
              onClick={() => setTodas((v) => !v)}
              className={`min-h-9 rounded-md border px-3 text-sm ${todas ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}
            >
              Ver también los que cuadran
            </button>
          </div>

          <ContenedorTabla ariaLabel={`Cuadro de ${nombre}`}>
            <table className="tabla-datos w-full min-w-[56rem] border-collapse text-sm">
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th scope="col" className={claseEncabezadoColumna}>Foto</th>
                  <th scope="col" className={claseEncabezadoColumna}>Producto</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Corte</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Entró</th>
                  {conVentas && <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Vendido</th>}
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Debería haber</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>{nombre} dice</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={conVentas ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground">
                      {filas.length ? "Ningún producto con diferencia." : "Todavía no hay datos para cuadrar."}
                    </td>
                  </tr>
                )}
                {visibles.map((f) => (
                  <tr key={f.sku} className="border-b border-border align-top">
                    <td className={claseCeldaColumna}>
                      <MiniaturaFoto url={f.foto} nombre={f.nombre} />
                    </td>
                    <td className={claseCeldaColumna}>
                      <span className="block font-medium">{f.codigo}</span>
                      <span className="block text-xs text-muted-foreground">{f.nombre}</span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{entero(f.corte)}</td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>
                      {entero(f.entro)}
                      {f.enCamino > 0 && <span className="block text-xs text-muted-foreground">{entero(f.enCamino)} en camino</span>}
                    </td>
                    {conVentas && <td className={`${claseCeldaColumna} text-right tabular-nums`}>{entero(f.vendido)}</td>}
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{entero(f.deberia)}</td>
                    <td className={`${claseCeldaColumna} text-right tabular-nums`}>{entero(f.dice)}</td>
                    <td className={`${claseCeldaColumna} text-right`}>
                      {f.diferencia === 0 ? <span className="text-success">Cuadra</span> : <span className={`font-semibold tabular-nums ${f.diferencia > 0 ? "text-warning" : "text-destructive"}`}>{f.diferencia > 0 ? `+${entero(f.diferencia)}` : entero(f.diferencia)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        </>
      )}
    </div>
  );
}

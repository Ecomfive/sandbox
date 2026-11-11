"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge, type Tone } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaHora } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { deshacerImportacion } from "@/lib/importar/bitacora-actions";
import { CalendarioIcon, ExtractoIcon, HistorialIcon, PapeleraIcon, PedidoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

export interface FilaImportacion {
  id: string;
  modulo: string;
  nombreModulo: string;
  archivo: string;
  quien: string;
  fecha: string;
  estado: "en_curso" | "terminada" | "fallida" | "deshecha";
  nuevas: number;
  actualizadas: number;
  saltadas: number;
  borradas: number;
  detalle: string[];
  deshechaEn: string | null;
  deshechas: number | null;
}

const ESTADO: Record<FilaImportacion["estado"], { etiqueta: string; tono: Tone }> = {
  en_curso: { etiqueta: "Sin terminar", tono: "warning" },
  terminada: { etiqueta: "Terminada", tono: "success" },
  fallida: { etiqueta: "Falló", tono: "destructive" },
  deshecha: { etiqueta: "Deshecha", tono: "neutral" },
};

const sel = (id: keyof FilaImportacion, etiqueta: string, valor: (f: FilaImportacion) => string) => ({
  id,
  etiqueta,
  tipo: "seleccion" as const,
  valores: (f: FilaImportacion) => [valor(f)],
  agrupable: true,
});

const DEF: DefTabla<FilaImportacion> = {
  clave: "importaciones-historial",
  campos: [
    sel("nombreModulo", "Módulo", (f) => f.nombreModulo),
    sel("estado", "Estado", (f) => ESTADO[f.estado].etiqueta),
    sel("quien", "Quién", (f) => f.quien),
    { id: "archivo", etiqueta: "Archivo", tipo: "texto", valor: (f) => f.archivo },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha.slice(0, 10) },
    { id: "nuevas", etiqueta: "Nuevas", tipo: "numero", valor: (f) => f.nuevas },
  ],
};

const ICONOS: Record<string, IconoComp> = { nombreModulo: PedidoIcon, estado: PedidoIcon, quien: PedidoIcon, archivo: ExtractoIcon, fecha: CalendarioIcon, nuevas: HistorialIcon };
const NOMBRE: NombreFilas = { singular: "importación", plural: "importaciones" };
const cifra = (v: number) => <span className={v ? "" : "text-muted-foreground"}>{entero(v)}</span>;

const COLUMNAS: ColumnaTabla<FilaImportacion, null>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => fechaHora(f.fecha) },
  { id: "archivo", label: "Archivo", ocultable: false, clase: "max-w-xs truncate", render: (f) => f.archivo },
  { id: "modulo", label: "Módulo", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.nombreModulo },
  { id: "quien", label: "Quién", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => f.quien },
  { id: "nuevas", label: "Nuevas", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => cifra(f.nuevas) },
  { id: "actualizadas", label: "Actualizadas", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => cifra(f.actualizadas) },
  { id: "saltadas", label: "Saltadas", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => cifra(f.saltadas) },
  { id: "borradas", label: "Borradas", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => cifra(f.borradas) },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge tone={ESTADO[f.estado].tono}>{ESTADO[f.estado].etiqueta}</Badge> },
];

/** La bitácora: toda la fila abre la ficha de la importación, con «Deshacer» si la persona puede modificar su módulo. */
export function TablaHistorial({ filas, modulosDeshacer }: { filas: FilaImportacion[]; modulosDeshacer: string[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const fila = filas.find((f) => f.id === abierta);
  return (
    <>
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        abrirFila={{ etiqueta: (f) => `Abrir la importación de ${f.archivo}`, alAbrir: (f) => setAbierta(f.id) }}
        ariaLabel="Historial de importaciones"
        vacio="Todavía no hay importaciones registradas."
      />
      {fila && <FichaImportacion f={fila} puedeDeshacer={modulosDeshacer.includes(fila.modulo) && (fila.estado === "terminada" || fila.estado === "fallida") && fila.nuevas > 0} alCerrar={() => setAbierta(null)} />}
    </>
  );
}

function FichaImportacion({ f, puedeDeshacer, alCerrar }: { f: FilaImportacion; puedeDeshacer: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deshacer() {
    setError(null);
    empezar(async () => {
      const r = await deshacerImportacion(f.id).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) {
        setError(r.error);
        setConfirmando(false);
        return;
      }
      mostrarToast(`${entero(r.borrados)} ${r.borrados === 1 ? "fila borrada" : "filas borradas"}${r.conservados ? `, ${entero(r.conservados)} conservadas` : ""}`);
      setConfirmando(false);
      router.refresh();
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="md"
      titulo={
        <>
          <span className="text-lg font-semibold">Importación</span>
          <Badge tone={ESTADO[f.estado].tono}>{ESTADO[f.estado].etiqueta}</Badge>
        </>
      }
    >
      <div className="flex flex-col gap-0 p-5">
        <p className="text-sm font-medium break-all">{f.archivo}</p>
        <p className="text-sm text-muted-foreground">
          {f.nombreModulo} · {f.quien} · {fechaHora(f.fecha)}
        </p>
        {puedeDeshacer && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!confirmando ? (
              <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={() => setConfirmando(true)}>
                Deshacer
              </BotonAccion>
            ) : (
              <div role="group" aria-label="Confirmar deshacer" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  ¿Borrar {f.nuevas === 1 ? "la fila nueva" : `las ${entero(f.nuevas)} filas nuevas`} que creó? Lo corregido a mano, lo de meses cerrados y lo ya conciliado o cerrado se queda.
                </span>
                <button type="button" onClick={deshacer} disabled={pendiente} data-enfocar className="rounded-md bg-destructive px-3 py-1.5 font-medium text-background hover:bg-destructive/85 disabled:opacity-50">
                  {pendiente ? "Deshaciendo..." : "Sí, deshacer"}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} disabled={pendiente} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
                  No
                </button>
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 divide-y divide-border">
          <Seccion icono={HistorialIcon} titulo="Resultado">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {(
                [
                  ["Nuevas", f.nuevas],
                  ["Actualizadas", f.actualizadas],
                  ["Saltadas", f.saltadas],
                  ["Borradas", f.borradas],
                ] as const
              ).map(([t, v]) => (
                <div key={t} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{t}</dt>
                  <dd className={`font-semibold ${claseCifra}`}>{entero(v)}</dd>
                </div>
              ))}
            </dl>
            {f.detalle.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {f.detalle.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {f.deshechaEn && (
              <p className="text-sm">
                Deshecha el {fechaHora(f.deshechaEn)}: {entero(f.deshechas ?? 0)} filas borradas.
              </p>
            )}
          </Seccion>
        </div>
      </div>
    </Ventana>
  );
}

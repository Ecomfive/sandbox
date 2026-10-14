"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFechaHora } from "@/lib/formato";
import { CalendarioIcon, CheckIcon, EnlaceIcon, EstadoIcon, InstagramIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import {
  colorEstadoInstagram,
  colorTipoInstagram,
  DEF_INSTAGRAM,
  etiquetaEstadoInstagram,
  etiquetaTipoInstagram,
  numeroInstagram,
  quienEnvio,
  type FilaInstagram,
} from "./def-instagram";
import { FichaInstagram } from "./ficha-instagram";

const NOMBRE: NombreFilas = { singular: "captura", plural: "capturas" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  tipo: InstagramIcon,
  enviadoPor: PersonaIcon,
  autor: InstagramIcon,
  recibido: CalendarioIcon,
  video: CheckIcon,
  megusta: EstadoIcon,
  comentarios: EstadoIcon,
  vistas: EstadoIcon,
  compartidos: EstadoIcon,
  notas: EstadoIcon,
};
const cifra = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-CR"));

function Vinculo({ url, texto }: { url: string | null; texto: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip texto={texto}>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={texto} className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-primario hover:bg-muted ${anilloFoco}`}>
        <EnlaceIcon className="h-4 w-4" />
      </a>
    </Tooltip>
  );
}

const resumen = (f: FilaInstagram) => f.titulo || f.textoMensaje || "Sin copy";

const COLUMNAS: ColumnaTabla<FilaInstagram, undefined>[] = [
  { id: "numero", label: "N.º", ocultable: false, clase: "tabular-nums text-muted-foreground whitespace-nowrap", render: (f) => numeroInstagram(f.numero) },
  {
    id: "captura",
    label: "Captura",
    ocultable: false,
    clase: "font-medium",
    render: (f) => (
      <span className="flex items-center gap-2">
        <Badge color={colorTipoInstagram(f.tipo)}>{etiquetaTipoInstagram(f.tipo)}</Badge>
        <span className="block max-w-[26rem] truncate" title={resumen(f)}>
          {resumen(f)}
        </span>
      </span>
    ),
  },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge color={colorEstadoInstagram(f.estado)}>{etiquetaEstadoInstagram(f.estado)}</Badge> },
  { id: "enviadoPor", label: "Enviado por", ocultable: true, clase: "whitespace-nowrap", render: (f) => quienEnvio(f) },
  { id: "recibido", label: "Recibido", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => formatearFechaHora(f.recibidoEn) },
  {
    id: "video",
    label: "Video",
    ocultable: true,
    render: (f) =>
      f.tieneVideo ? (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Guardado</span>
        </span>
      ) : f.videoError ? (
        <Tooltip texto={f.videoError}>
          <span tabIndex={0} role="img" aria-label={`Sin video: ${f.videoError}`} className={`text-warning ${anilloFoco}`}>
            ⚠
          </span>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { id: "instagram", label: "Instagram", ocultable: true, render: (f) => <Vinculo url={f.enlace} texto={`Abrir la captura ${numeroInstagram(f.numero)} en Instagram`} /> },
  { id: "paginaDestino", label: "Página de destino", ocultable: true, render: (f) => <Vinculo url={f.paginaDestino} texto={`Abrir la página de destino de ${numeroInstagram(f.numero)}`} /> },
  { id: "autor", label: "Cuenta del video", ocultable: true, oculta: true, clase: "text-muted-foreground", render: (f) => (f.autorUsuario ? `@${f.autorUsuario}` : "—") },
  { id: "megusta", label: "Me gusta", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f) => cifra(f.megusta) },
  { id: "comentarios", label: "Comentarios", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f) => cifra(f.comentarios) },
  { id: "vistas", label: "Vistas", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f) => cifra(f.vistas) },
  { id: "compartidos", label: "Compartidos", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f) => cifra(f.compartidos) },
  { id: "notas", label: "Notas", ocultable: true, oculta: true, clase: "text-muted-foreground", render: (f) => <span className="block max-w-[18rem] truncate">{f.notas ?? "—"}</span> },
];

/**
 * La lista de capturas de Instagram (Testing Lab › Fuentes), con la barra de herramientas común: arranca agrupada por
 * estado y lo descartado se oculta. No lleva «Agregar»: las capturas las crea el webhook cuando alguien comparte algo por
 * mensaje directo con la cuenta de fuentes. Pulsar la captura abre su ficha.
 */
export function TablaInstagram({ filas, codigoPais, puedeEscribir }: { filas: FilaInstagram[]; codigoPais: string; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const fila = abierta ? filas.find((f) => f.id === abierta.id) : undefined;
  const cols = useMemo(() => COLUMNAS, []);

  return (
    <>
      <TablaDatos
        def={DEF_INSTAGRAM}
        filas={filas}
        columnas={cols}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        anchoMinimo="56rem"
        aspecto="lista"
        etiquetaGrupo={(campo, grupo) =>
          campo === "estado" ? <Badge color={colorEstadoInstagram(grupo.clave)}>{grupo.etiqueta}</Badge> : campo === "tipo" ? <Badge color={colorTipoInstagram(grupo.clave)}>{grupo.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>
        }
        abrirFila={{
          etiqueta: (f) => `Abrir la captura ${numeroInstagram(f.numero)}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
          columna: "captura",
          soloColumna: true,
        }}
        ariaLabel="Capturas de Instagram"
        vacio="Todavía no hay capturas. Comparte un reel por mensaje directo con la cuenta de fuentes y aparecerá aquí."
      />
      <FichaInstagram
        fila={fila}
        orden={abierta?.orden ?? []}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}

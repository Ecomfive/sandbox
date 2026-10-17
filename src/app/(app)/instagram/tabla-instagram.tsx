"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { escucharActualizacionesInstagram } from "@/lib/instagram/canal";
import { CalendarioIcon, CheckIcon, EnlaceIcon, EstadoIcon, InstagramIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import {
  colorEstadoInstagram,
  colorFormatoInstagram,
  colorPlataforma,
  DEF_INSTAGRAM,
  etiquetaPlataforma,
  etiquetaFormatoInstagram,
  formatoDeCaptura,
  numeroInstagram,
  quienEnvio,
  type FilaInstagram,
} from "./def-instagram";
import { cambiarEstadoCaptura, eliminarCapturas, fusionarCapturasRepetidas, unirCapturas } from "./actions";
import { BarraLoteInstagram } from "./barra-lote-instagram";
import { unionProbable } from "@/lib/instagram/unir";
import { FichaInstagram } from "./ficha-instagram";
import { paraUnir } from "./unir-captura";
import { SelectorEstadoInstagram } from "./selector-estado-instagram";

const NOMBRE: NombreFilas = { singular: "captura", plural: "capturas" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  formato: InstagramIcon,
  plataforma: InstagramIcon,
  enviadoPor: PersonaIcon,
  autor: InstagramIcon,
  recibido: CalendarioIcon,
  video: CheckIcon,
  megusta: EstadoIcon,
  comentarios: EstadoIcon,
  publicado: CalendarioIcon,
  anuncios: EstadoIcon,
  nombrePagina: PersonaIcon,
  repetida: EstadoIcon,
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

function columnas(puedeEscribir: boolean, cambiar: (id: string, estado: string) => void, uniones: Map<string, number>): ColumnaTabla<FilaInstagram, undefined>[] {
  return [
  { id: "numero", label: "N.º", ocultable: false, clase: "tabular-nums text-muted-foreground whitespace-nowrap", render: (f) => numeroInstagram(f.numero) },
  {
    id: "captura",
    label: "Captura",
    ocultable: false,
    clase: "font-medium",
    render: (f) => (
      <span className="flex items-center gap-2">
        <Badge color={colorFormatoInstagram(formatoDeCaptura(f))}>{etiquetaFormatoInstagram(formatoDeCaptura(f))}</Badge>
        {f.repetidaDe !== null && <Badge tone="warning">{`Repetida de ${numeroInstagram(f.repetidaDe)}`}</Badge>}
        {f.envios.length > 0 && <Badge tone="info">{`Compartida ${f.envios.length + 1} veces`}</Badge>}
        {puedeEscribir && uniones.has(f.id) && <Badge tone="warning">{`Se puede unir con ${numeroInstagram(uniones.get(f.id) as number)}`}</Badge>}
        <span className="block max-w-[26rem] truncate" title={resumen(f)}>
          {resumen(f)}
        </span>
      </span>
    ),
  },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (f) => <SelectorEstadoInstagram estado={f.estado} aria={`Estado de ${numeroInstagram(f.numero)}`} puedeEscribir={puedeEscribir} alCambiar={(e) => cambiar(f.id, e)} />,
  },
  { id: "plataforma", label: "Red", ocultable: true, clase: "whitespace-nowrap", render: (f) => <Badge color={colorPlataforma(f.plataforma)}>{etiquetaPlataforma(f.plataforma)}</Badge> },
  { id: "enviadoPor", label: "Enviado por", ocultable: true, clase: "whitespace-nowrap", render: (f) => quienEnvio(f) },
  { id: "nombrePagina", label: "Página", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.nombrePagina ?? "—" },
  { id: "recibido", label: "Recibido", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => formatearFechaHora(f.recibidoEn) },
  {
    id: "video",
    label: "Archivo",
    ocultable: true,
    render: (f) =>
      f.tieneArchivo ? (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Guardado</span>
        </span>
      ) : f.videoError ? (
        <Tooltip texto={f.videoError}>
          <span tabIndex={0} role="img" aria-label={`Sin archivo: ${f.videoError}`} className={`text-warning ${anilloFoco}`}>
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
  {
    id: "anuncios",
    label: "Anuncios (mismo copy)",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (f) =>
      f.anuncios === null ? (
        "—"
      ) : f.bibliotecaActivos !== null ? (
        <Tooltip texto={`${cifra(f.bibliotecaActivos)} ${f.bibliotecaActivos === 1 ? "activo" : "activos"}`}>
          <span tabIndex={0} className={anilloFoco}>
            {cifra(f.anuncios)}
          </span>
        </Tooltip>
      ) : (
        cifra(f.anuncios)
      ),
  },
  { id: "megusta", label: "Me gusta", ocultable: true, clase: "text-right tabular-nums", render: (f) => cifra(f.megusta) },
  { id: "comentarios", label: "Comentarios", ocultable: true, clase: "text-right tabular-nums", render: (f) => cifra(f.comentarios) },
  { id: "publicado", label: "Publicado", ocultable: true, oculta: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.fechaPublicacion ? formatearFecha(f.fechaPublicacion) : "—") },
  { id: "notas", label: "Notas", ocultable: true, oculta: true, clase: "text-muted-foreground", render: (f) => <span className="block max-w-[18rem] truncate">{f.notas ?? "—"}</span> },
  ];
}

/**
 * La lista de capturas de Instagram (Testing Lab › Fuentes), con la barra de herramientas común: arranca agrupada por
 * estado y lo descartado se oculta. No lleva «Agregar»: las capturas las crea el webhook cuando alguien comparte algo por
 * mensaje directo con la cuenta de fuentes. Pulsar la captura abre su ficha.
 */
export function TablaInstagram({ filas, codigoPais, puedeEscribir }: { filas: FilaInstagram[]; codigoPais: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  // Las capturas las crea el webhook: la lista se vuelve a pedir sola cada 30 segundos mientras la pestaña se ve, para que lo que
  // llega aparezca sin recargar. Lo que está abierto (la ficha, un campo a medias) no se pierde: solo se traen los datos nuevos.
  useEffect(() => {
    const cada = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    // Y al instante cuando otra pestaña guardó algo (la lectura de la Biblioteca, lo compartido desde el celular) o cuando esta pestaña vuelve a verse.
    const alVolver = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    const dejarDeEscuchar = escucharActualizacionesInstagram(() => {
      router.refresh();
      // Algunos navegadores dejan traer esta pestaña al frente; si no, queda actualizada para cuando se vuelva a ella.
      window.focus();
    });
    return () => {
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
      dejarDeEscuchar();
    };
  }, [router]);
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  // Los estados cambiados que el servidor todavía no devolvió: se ven al instante y vuelven atrás si se rechazan. Cada uno guarda
  // el estado que tenía el servidor (`base`) y solo vale mientras siga siendo ese: cuando el servidor trae otro (el elegido, o uno
  // cambiado después desde la ficha), manda el del servidor.
  const [cambios, setCambios] = useState<Record<string, { estado: string; base: string }>>({});
  const vistas = useMemo(() => filas.map((f) => (cambios[f.id] && cambios[f.id].base === f.estado ? { ...f, estado: cambios[f.id].estado } : f)), [filas, cambios]);
  const fila = abierta ? vistas.find((f) => f.id === abierta.id) : undefined;

  const cambiar = useCallback(
    async (id: string, estado: string) => {
      const base = filas.find((f) => f.id === id)?.estado;
      if (base === undefined) return;
      setCambios((c) => ({ ...c, [id]: { estado, base } }));
      const r = await cambiarEstadoCaptura(id, estado).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) {
        setCambios((c) => Object.fromEntries(Object.entries(c).filter(([k]) => k !== id)));
        mostrarToast(r.error, "destructive");
      }
    },
    [filas, mostrarToast],
  );
  // Un anuncio reenviado desde un chat llega solo como archivo; si hay una captura con enlace de hace pocos minutos, casi seguro es el mismo: se avisa en la lista.
  const uniones = useMemo(() => {
    const paraAvisar = new Map<string, number>();
    const todas = vistas.map(paraUnir);
    for (const c of todas) {
      const u = unionProbable(c, todas);
      if (u) paraAvisar.set(c.id, u.numero);
    }
    return paraAvisar;
  }, [vistas]);
  const cols = useMemo(() => columnas(puedeEscribir, (id, estado) => void cambiar(id, estado), uniones), [puedeEscribir, cambiar, uniones]);

  // Las capturas que ya estaban repetidas antes de que se fusionaran solas: un botón las deja en una sola ficha cada una.
  const repetidas = filas.filter((f) => f.repetidaDe !== null).length;
  const [fusionando, setFusionando] = useState(false);
  async function fusionar() {
    if (fusionando || !confirm(`Se fusionarán ${repetidas} ${repetidas === 1 ? "captura repetida" : "capturas repetidas"} en la primera de cada una, con todos sus datos. ¿Continuar?`)) return;
    setFusionando(true);
    const r: { error?: string; fusionadas?: number } = await fusionarCapturasRepetidas().catch(() => ({ error: "No se pudieron fusionar las capturas." }));
    setFusionando(false);
    if (r.error) mostrarToast(r.error, "destructive");
    else {
      mostrarToast(`${r.fusionadas ?? 0} ${r.fusionadas === 1 ? "captura fusionada" : "capturas fusionadas"}`);
      router.refresh();
    }
  }

  // Unir y eliminar desde la lista, sin abrir la ficha: lo hace la barra de las capturas marcadas.
  const [trabajando, setTrabajando] = useState<"unir" | "eliminar" | null>(null);
  async function unirMarcadas(marcadas: FilaInstagram[], quitar: () => void) {
    if (marcadas.length !== 2 || trabajando) return;
    const [vieja, nueva] = marcadas[0].numero < marcadas[1].numero ? marcadas : [marcadas[1], marcadas[0]];
    if (!confirm(`Se unirán ${numeroInstagram(vieja.numero)} y ${numeroInstagram(nueva.numero)} en ${numeroInstagram(vieja.numero)}, la más antigua. ${numeroInstagram(nueva.numero)} se elimina y lo que aporte (enlace, copy, cifras, archivo) pasa a la que queda. ¿Continuar?`)) return;
    setTrabajando("unir");
    const r = await unirCapturas(marcadas[0].id, marcadas[1].id).catch(() => ({ error: "No se pudieron unir las capturas." }) as { error?: string; numero?: number });
    setTrabajando(null);
    if (r.error || r.numero === undefined) return mostrarToast(r.error ?? "No se pudieron unir las capturas.", "destructive");
    mostrarToast(`Unidas en ${numeroInstagram(r.numero)}`);
    quitar();
    router.refresh();
  }
  async function eliminarMarcadas(marcadas: FilaInstagram[], quitar: () => void) {
    if (marcadas.length === 0 || trabajando) return;
    const nombres = marcadas.length <= 3 ? marcadas.map((f) => numeroInstagram(f.numero)).join(", ") : `${marcadas.length} capturas`;
    if (!confirm(`¿Eliminar ${nombres}? Se borran con sus archivos y no se puede deshacer.`)) return;
    setTrabajando("eliminar");
    const r = await eliminarCapturas(marcadas.map((f) => f.id)).catch(() => ({ error: "No se pudieron eliminar las capturas." }) as { error?: string; eliminadas?: number });
    setTrabajando(null);
    if (r.error) mostrarToast(r.error, "destructive");
    else mostrarToast(r.eliminadas === 1 ? "Captura eliminada" : `${r.eliminadas} capturas eliminadas`);
    if ((r.eliminadas ?? 0) > 0) {
      quitar();
      setAbierta((a) => (a && marcadas.some((f) => f.id === a.id) ? null : a));
      router.refresh();
    }
  }

  return (
    <>
      <TablaDatos
        def={DEF_INSTAGRAM}
        filas={vistas}
        columnas={cols}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        anchoMinimo="56rem"
        aspecto="lista"
        etiquetaGrupo={(campo, grupo) =>
          campo === "estado" ? <Badge color={colorEstadoInstagram(grupo.clave)}>{grupo.etiqueta}</Badge> : campo === "formato" ? <Badge color={colorFormatoInstagram(grupo.clave)}>{grupo.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>
        }
        abrirFila={{
          etiqueta: (f) => `Abrir la captura ${numeroInstagram(f.numero)}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
          columna: "captura",
          soloColumna: true,
        }}
        seleccion={
          puedeEscribir
            ? {
                etiqueta: (f) => `Seleccionar la captura ${numeroInstagram(f.numero)}`,
                barra: (marcadas, quitar) => <BarraLoteInstagram filas={marcadas} trabajo={trabajando} alUnir={() => void unirMarcadas(marcadas, quitar)} alEliminar={() => void eliminarMarcadas(marcadas, quitar)} alQuitar={quitar} />,
              }
            : undefined
        }
        accionPrincipal={
          puedeEscribir && repetidas > 0 ? (
            <span className="inline-flex items-center gap-3">
              {fusionando && <ProgresoEstimado compacta pasos={["Fusionando las repetidas"]} estimadoMs={Math.max(3000, repetidas * 1200)} etiqueta="Fusionando las capturas repetidas" />}
              <button type="button" onClick={() => void fusionar()} disabled={fusionando} className={`inline-flex items-center justify-center gap-1 boton-neon border border-transparent px-4 py-2 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-40 ${anilloFoco} !rounded-md`}>
              {fusionando ? "Fusionando..." : `Fusionar ${repetidas} ${repetidas === 1 ? "repetida" : "repetidas"}`}
            </button>
            </span>
          ) : undefined
        }
        ariaLabel="Capturas de Instagram"
        vacio="Todavía no hay capturas. Comparte un reel por mensaje directo con la cuenta de fuentes y aparecerá aquí."
      />
      <FichaInstagram
        fila={fila}
        otras={vistas}
        orden={abierta?.orden ?? []}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}

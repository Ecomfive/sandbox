import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { enviosDe } from "@/lib/instagram/fusion";
import { plataformaDeMetricas } from "@/lib/instagram/plataformas";
import { repetidasDe } from "@/lib/instagram/repetidas";
import type { FilaInstagram } from "./def-instagram";
import { RegistrarSw } from "./registrar-sw";
import { TablaInstagram } from "./tabla-instagram";

export const metadata = { title: "Instagram" };

export const dynamic = "force-dynamic";

interface FilaBase {
  id: string;
  numero: number;
  recibido_en: string;
  remitente_id: string;
  remitente_usuario: string | null;
  remitente_nombre: string | null;
  tipo: string;
  enlace: string | null;
  titulo: string | null;
  texto_mensaje: string | null;
  video_ruta: string | null;
  video_bytes: number | null;
  video_error: string | null;
  autor_usuario: string | null;
  metricas: Record<string, unknown> | null;
  pagina_destino: string | null;
  notas: string | null;
  estado: string;
  payload: unknown;
  media_id: string | null;
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** El detalle de la última lectura de la Biblioteca de anuncios (`metricas.biblioteca`), si hubo una. */
const biblioteca = (m: Record<string, unknown> | null): Record<string, unknown> | null => (m && typeof m.biblioteca === "object" && m.biblioteca !== null ? (m.biblioteca as Record<string, unknown>) : null);

/**
 * Testing Lab › Fuentes › Instagram: lo que el equipo comparte por mensaje directo con la cuenta de fuentes cuando ve en
 * Instagram un producto que puede servir para testear. Las capturas las crea el webhook (`/api/instagram/webhook`); aquí se
 * ven, se completan (página de destino, notas) y se decide cuáles se testean.
 */
export default async function InstagramPage() {
  const usuario = await requireModulo("instagram");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const r = await traerTodasConError<FilaBase>((a, b) =>
    supabase
      .from("instagram_capturas")
      .select("id, numero, recibido_en, remitente_id, remitente_usuario, remitente_nombre, tipo, enlace, titulo, texto_mensaje, video_ruta, video_bytes, video_error, autor_usuario, metricas, pagina_destino, notas, estado, payload, media_id")
      .order("numero", { ascending: false })
      .range(a, b),
  );

  if (r.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Instagram" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las capturas. Si es la primera vez, falta correr la migración 0106 en Supabase.
        </p>
      </Pagina>
    );
  }

  const base = r.data ?? [];
  const repetidas = repetidasDe(base.map((f) => ({ numero: f.numero, enlace: f.enlace, mediaId: f.media_id })));
  const filas: FilaInstagram[] = base.map((f) => ({
    id: f.id,
    numero: f.numero,
    recibidoEn: f.recibido_en,
    plataforma: plataformaDeMetricas(f.metricas?.plataforma),
    remitenteId: f.remitente_id,
    remitenteUsuario: f.remitente_usuario,
    remitenteNombre: f.remitente_nombre,
    tipo: f.tipo,
    enlace: f.enlace,
    titulo: f.titulo,
    textoMensaje: f.texto_mensaje,
    tieneArchivo: !!f.video_ruta,
    archivoTipo: !f.video_ruta ? null : /\.(jpg|png|webp|gif)$/i.test(f.video_ruta) ? "imagen" : "video",
    nombrePagina: typeof f.metricas?.nombre_pagina === "string" ? f.metricas.nombre_pagina : null,
    repetidaDe: repetidas.get(f.numero) ?? null,
    envios: enviosDe(f.metricas).map((e) => ({ mensajeId: e.mensaje_id, quien: e.remitente_usuario ? `@${e.remitente_usuario}` : e.remitente_nombre || `ID ${e.remitente_id}`, en: e.recibido_en })),
    videoBytes: f.video_bytes === null ? null : Number(f.video_bytes),
    videoError: f.video_error,
    autorUsuario: f.autor_usuario,
    megusta: numero(f.metricas?.like_count),
    comentarios: numero(f.metricas?.comments_count),
    vistas: numero(f.metricas?.view_count),
    compartidos: numero(f.metricas?.share_count),
    fechaPublicacion: typeof f.metricas?.fecha_publicacion === "string" ? f.metricas.fecha_publicacion : null,
    fuenteCifras: typeof f.metricas?.fuente === "string" ? f.metricas.fuente : null,
    leidoEn: typeof f.metricas?.leido_en === "string" ? f.metricas.leido_en : null,
    paginaDestino: f.pagina_destino,
    anuncios: numero(f.metricas?.anuncios_mismo_copy),
    bibliotecaActivos: numero(biblioteca(f.metricas)?.activos),
    bibliotecaInactivos: numero(biblioteca(f.metricas)?.inactivos),
    bibliotecaDesde: typeof biblioteca(f.metricas)?.desde === "string" ? (biblioteca(f.metricas)?.desde as string) : null,
    bibliotecaLeidoEn: typeof biblioteca(f.metricas)?.leido_en === "string" ? (biblioteca(f.metricas)?.leido_en as string) : null,
    bibliotecaPagina: typeof biblioteca(f.metricas)?.pagina === "string" ? (biblioteca(f.metricas)?.pagina as string) : null,
    cuentaDeBiblioteca: f.metricas?.cuenta_origen === "biblioteca",
    notas: f.notas,
    estado: f.estado,
    datosMeta: JSON.stringify({ aviso: f.payload, consulta: f.metricas?.consulta ?? null, mensaje: f.metricas?.mensaje_meta ?? null }, null, 2).slice(0, 20000),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Instagram" oculto />
      <RegistrarSw />
      <TablaInstagram filas={filas} codigoPais={pais.codigo} puedeEscribir={!usuario.modulosSoloLectura.includes("instagram")} />
    </Pagina>
  );
}

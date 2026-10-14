import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaInstagram } from "./def-instagram";
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
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

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
      .select("id, numero, recibido_en, remitente_id, remitente_usuario, remitente_nombre, tipo, enlace, titulo, texto_mensaje, video_ruta, video_bytes, video_error, autor_usuario, metricas, pagina_destino, notas, estado, payload")
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

  const filas: FilaInstagram[] = (r.data ?? []).map((f) => ({
    id: f.id,
    numero: f.numero,
    recibidoEn: f.recibido_en,
    remitenteId: f.remitente_id,
    remitenteUsuario: f.remitente_usuario,
    remitenteNombre: f.remitente_nombre,
    tipo: f.tipo,
    enlace: f.enlace,
    titulo: f.titulo,
    textoMensaje: f.texto_mensaje,
    tieneVideo: !!f.video_ruta,
    videoBytes: f.video_bytes === null ? null : Number(f.video_bytes),
    videoError: f.video_error,
    autorUsuario: f.autor_usuario,
    megusta: numero(f.metricas?.like_count),
    comentarios: numero(f.metricas?.comments_count),
    vistas: numero(f.metricas?.view_count),
    compartidos: numero(f.metricas?.share_count),
    paginaDestino: f.pagina_destino,
    notas: f.notas,
    estado: f.estado,
    datosMeta: JSON.stringify({ aviso: f.payload, consulta: f.metricas?.consulta ?? null }, null, 2).slice(0, 20000),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Instagram" oculto />
      <TablaInstagram filas={filas} codigoPais={pais.codigo} puedeEscribir={!usuario.modulosSoloLectura.includes("instagram")} />
    </Pagina>
  );
}

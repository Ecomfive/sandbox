"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { anilloFoco } from "@/components/ui/field";
import { EVENTOS_USO } from "@/components/latido-presencia";
import { CANAL_PRESENCIA_CHATS, personasConectadas, personasFuera, personasPorChat, sigueActiva, type PersonaConectada, type PersonaEnSistema, type PresenciaChat } from "@/lib/crm/presencia-chats";
import { supabase } from "@/lib/supabase/client";
import { RUTA_DIRECCION } from "../direccion/ruta";
import { equipoEnSistema, nombresDeChats } from "./presencia-actions";

/** Una persona del equipo, para ponerle cara a quien está en un chat. */
export interface PersonaEquipo {
  id: string;
  nombre: string;
  foto: string | null;
}

/** Cada cuánto se revisa si la persona dejó de usar el sistema. */
const REVISAR_MS = 15_000;
/** Cada cuánto Dirección pregunta quién está usando el sistema: cada persona avisa una vez por minuto. */
const EQUIPO_MS = 60_000;
/** Hasta cuántas fotos se muestran en un chat; las demás van en «+N». */
const MAX_FOTOS = 3;

/**
 * Publica el chat que tengo abierto y devuelve quién más está en cada chat y quién está conectado (`src/lib/crm/presencia-chats.ts`). Al dejar de usar el sistema se publica
 * que no estoy activa: la foto dice que la persona está trabajando ahí, no que dejó el chat abierto y se fue.
 */
export function usePresenciaChats(chatAbierto: string | null, miId: string): { enChats: Record<string, string[]>; conectadas: PersonaConectada[] } {
  const [presencia, setPresencia] = useState<{ enChats: Record<string, string[]>; conectadas: PersonaConectada[] }>({ enChats: {}, conectadas: [] });
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const conectado = useRef(false);
  const publicado = useRef<string | null>(null);
  const abierto = useRef(chatAbierto);
  const ultimoUso = useRef(0);
  const publicar = useRef(() => {
    const activa = sigueActiva(Date.now() - ultimoUso.current, document.visibilityState === "visible");
    const presente: PresenciaChat = { chat: activa ? abierto.current : null, activa };
    const clave = JSON.stringify(presente);
    if (!conectado.current || publicado.current === clave) return;
    publicado.current = clave;
    void canalRef.current?.track({ ...presente });
  });

  useEffect(() => {
    const publicarAhora = publicar.current;
    const usar = () => {
      ultimoUso.current = Date.now();
      publicarAhora();
    };
    ultimoUso.current = Date.now();
    const canal = supabase.channel(CANAL_PRESENCIA_CHATS, { config: { presence: { key: miId } } });
    canalRef.current = canal;
    canal
      .on("presence", { event: "sync" }, () => {
        const estado = canal.presenceState<PresenciaChat>();
        setPresencia({ enChats: personasPorChat(estado, miId), conectadas: personasConectadas(estado, miId) });
      })
      .subscribe((estado) => {
        conectado.current = estado === "SUBSCRIBED";
        if (!conectado.current) return;
        publicado.current = null;
        publicarAhora();
      });
    const cada = setInterval(publicarAhora, REVISAR_MS);
    document.addEventListener("visibilitychange", publicarAhora);
    for (const e of EVENTOS_USO) window.addEventListener(e, usar, { passive: true, capture: true });
    return () => {
      clearInterval(cada);
      document.removeEventListener("visibilitychange", publicarAhora);
      for (const e of EVENTOS_USO) window.removeEventListener(e, usar, { capture: true });
      conectado.current = false;
      canalRef.current = null;
      void supabase.removeChannel(canal);
    };
  }, [miId]);

  useEffect(() => {
    abierto.current = chatAbierto;
    publicar.current();
  }, [chatAbierto]);

  return presencia;
}

/** Para Dirección: quién del CRM está usando el sistema y en qué página (`equipoEnSistema`). Va por el aviso de cada minuto, así que no depende de la conexión en vivo. */
export function useEquipoEnSistema(activo: boolean): PersonaEnSistema[] {
  const [personas, setPersonas] = useState<PersonaEnSistema[]>([]);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    const traer = () => {
      if (document.visibilityState !== "visible") return;
      equipoEnSistema()
        .then((r) => vigente && setPersonas(r))
        .catch(() => {});
    };
    traer();
    const cada = setInterval(traer, EQUIPO_MS);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vigente = false;
      clearInterval(cada);
      document.removeEventListener("visibilitychange", traer);
    };
  }, [activo]);
  return personas;
}

/** La foto de una persona que está trabajando: el círculo con el aro verde que parpadea. */
function FotoPresente({ persona, tamano }: { persona: PersonaEquipo; tamano: "xs" | "sm" }) {
  return (
    <span aria-hidden="true" className="relative inline-flex flex-none rounded-full ring-2 ring-[var(--presencia)]">
      <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-[var(--presencia)] motion-reduce:animate-none" />
      <AvatarPersona nombre={persona.nombre} email="" avatarUrl={persona.foto} tamano={tamano} />
    </span>
  );
}

/**
 * Arriba de la bandeja: «Tú» y cada persona conectada, con su foto y el chat donde está. Pulsar a alguien abre ese chat.
 * `nombreDeChat` da null si el chat no está en la lista cargada: el nombre se le pide al servidor, que solo lo da si es de un área que esta persona puede ver; si no, dice «otro chat».
 * `abreTodos`: abrir no depende de la lista cargada (el panel de Dirección no tiene lista: lleva al chat). `fuera`: solo para Dirección, quienes usan el sistema sin salir en vivo.
 */
export function BarraPresencia({
  miId,
  miChat,
  conectadas,
  equipo,
  nombreDeChat,
  alAbrir,
  abreTodos = false,
  enSistema = [],
}: {
  miId: string;
  miChat: string | null;
  conectadas: PersonaConectada[];
  equipo: Map<string, PersonaEquipo>;
  nombreDeChat: (id: string) => string | null;
  alAbrir: (id: string) => void;
  abreTodos?: boolean;
  enSistema?: PersonaEnSistema[];
}) {
  const yo = equipo.get(miId);
  const quienes = [{ id: miId, chats: miChat ? [miChat] : [] }, ...conectadas];
  const [nombres, setNombres] = useState<Record<string, string>>({});
  // Vacío si el servidor no dio el nombre: se recuerda para no volver a pedirlo.
  const faltan = [...new Set(quienes.flatMap((q) => q.chats))].filter((id) => !nombreDeChat(id) && !(id in nombres)).sort().join(",");
  useEffect(() => {
    if (!faltan) return;
    let vigente = true;
    const ids = faltan.split(",");
    nombresDeChats(ids)
      .then((r) => vigente && setNombres((a) => ({ ...a, ...Object.fromEntries(ids.map((id) => [id, r[id] ?? ""])) })))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [faltan]);
  return (
    <section aria-label="Quién está trabajando en la bandeja" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--wa-sec)]">
      {quienes.flatMap((q) => {
        const persona = q.id === miId ? yo : equipo.get(q.id);
        if (!persona) return [];
        const quien = q.id === miId ? "Tú" : persona.nombre.split(/\s+/)[0];
        const lugares = q.chats.length ? q.chats : [null];
        return lugares.map((chat) => {
          const enLista = chat ? nombreDeChat(chat) : null;
          const nombre = enLista ?? (chat ? nombres[chat] || null : null);
          const contenido = (
            <>
              <FotoPresente persona={persona} tamano="xs" />
              <span className="font-medium text-[var(--wa-texto)]">{quien}</span>
              {chat && <span className="max-w-48 truncate">· {nombre ?? "otro chat"}</span>}
            </>
          );
          const llave = `${q.id}-${chat ?? "bandeja"}`;
          return chat && nombre && q.id !== miId && (enLista || abreTodos) ? (
            <button key={llave} type="button" onClick={() => alAbrir(chat)} title={`Abrir el chat de ${nombre}`} className={`inline-flex items-center gap-2 rounded-full hover:text-[var(--wa-texto)] ${anilloFoco}`}>
              {contenido}
            </button>
          ) : (
            <span key={llave} className="inline-flex items-center gap-2">
              {contenido}
            </span>
          );
        });
      })}
      {personasFuera(enSistema, conectadas, miId).flatMap((p) => {
        const persona = equipo.get(p.id);
        if (!persona) return [];
        return [
          <span key={p.id} title={`${persona.nombre} está en ${p.pagina}`} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-flex flex-none rounded-full ring-2 ring-border">
              <AvatarPersona nombre={persona.nombre} email="" avatarUrl={persona.foto} tamano="xs" />
            </span>
            <span className="font-medium text-[var(--wa-texto)]">{persona.nombre.split(/\s+/)[0]}</span>
            <span className="max-w-48 truncate">· {p.pagina}</span>
          </span>,
        ];
      })}
    </section>
  );
}

/** La misma barra en las pestañas del panel de Dirección (Resumen, Clientes, Equipo…): ahí no hay bandeja, pero Dirección también ve a Atención y a Comercial. */
export function PresenciaDireccion({ miId, equipo }: { miId: string; equipo: PersonaEquipo[] }) {
  const router = useRouter();
  const { conectadas } = usePresenciaChats(null, miId);
  const enSistema = useEquipoEnSistema(true);
  const porId = useMemo(() => new Map(equipo.map((p) => [p.id, p])), [equipo]);
  return <BarraPresencia miId={miId} miChat={null} conectadas={conectadas} equipo={porId} nombreDeChat={() => null} abreTodos enSistema={enSistema} alAbrir={(id) => router.push(`${RUTA_DIRECCION}?abrir=${id}`)} />;
}

/** La foto de cada persona que está trabajando en un chat, en un círculo pequeño que parpadea en verde. */
export function PersonasEnChat({ ids, equipo, tamano = "xs" }: { ids: string[] | undefined; equipo: Map<string, PersonaEquipo>; tamano?: "xs" | "sm" }) {
  const personas = (ids ?? []).flatMap((id) => {
    const p = equipo.get(id);
    return p ? [p] : [];
  });
  if (!personas.length) return null;
  const nombres = personas.map((p) => p.nombre).join(", ");
  const texto = `${nombres} ${personas.length === 1 ? "está" : "están"} en este chat`;
  return (
    <span title={texto} className="inline-flex flex-none items-center gap-1.5 pl-0.5">
      <span className="sr-only">{texto}</span>
      {personas.slice(0, MAX_FOTOS).map((p) => (
        <FotoPresente key={p.id} persona={p} tamano={tamano} />
      ))}
      {personas.length > MAX_FOTOS && (
        <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums">
          +{personas.length - MAX_FOTOS}
        </span>
      )}
    </span>
  );
}

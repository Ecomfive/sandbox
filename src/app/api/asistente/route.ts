// El asistente del sistema (14 nov 2026, pedido de Hernán: «que Ángeles le pregunte a la IA cualquier cosa del sistema y le responda desde ahí»). Recibe la
// conversación, llama a Claude (API de Anthropic, clave `ANTHROPIC_API_KEY`) con las herramientas de solo lectura de `src/lib/asistente/herramientas.ts`
// y devuelve la respuesta a medida que se escribe, en líneas JSON: {t:"texto"}, {t:"herramienta"}, {t:"fin"} o {t:"error"}. Cada herramienta pide el mismo
// módulo que su pantalla: la IA solo ve lo que la persona puede abrir. Nada se guarda: la conversación vive en el navegador.

import Anthropic from "@anthropic-ai/sdk";
import { getUsuarioActual } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { etiquetaDeModulo } from "@/lib/permisos/catalogo";
import { AVISO_HERRAMIENTA, HERRAMIENTAS, correrHerramienta } from "@/lib/asistente/herramientas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODELO = process.env.ANTHROPIC_MODEL_ASISTENTE?.trim() || "claude-opus-5-5";
const MAX_VUELTAS = 8;
const MAX_MENSAJES = 20;
const MAX_TEXTO = 4000;

/** La parte fija de las instrucciones (igual para todos: queda en caché). */
const INSTRUCCIONES = `Eres el asistente del sistema de gestión de ECOMFIVE (Proveeduría, tiendas de Shopify, inventario, compras, CRM de dropshippers, finanzas), dentro del propio sistema. Te escribe alguien del equipo que trabaja con él.

Cómo respondes:
- Siempre en español, claro y corto, para alguien que no es técnico. Usa los nombres de pantallas y botones tal como salen en el sistema.
- Para «cómo se hace algo», «qué significa» o «dónde está»: busca primero en el Centro de ayuda con buscar_ayuda y responde con eso. Termina con el enlace a la guía o pantalla (en formato Markdown: [texto](/ruta)).
- Para datos (stock, compras, pedidos de tienda): usa las herramientas. Para stock o compras, primero buscar_producto y después stock_producto o compras_producto con su id. Si hay varios productos parecidos, di cuáles encontraste y pregunta cuál es.
- Solo di lo que salga de las herramientas o del Centro de ayuda. Si no lo encuentras, dilo, y di dónde puede mirarlo en el sistema o a quién preguntar. Nunca inventes cifras, estados, nombres ni pasos.
- Solo puedes consultar: no puedes crear, cambiar, borrar ni mandar nada. Si te piden hacer algo, explica cómo hacerlo en el sistema y en qué pantalla.
- Si una herramienta dice que la persona no tiene acceso, díselo tal cual: no busques el dato por otro lado.
- Los datos de clientes (nombres, teléfonos, direcciones) solo los das si te los piden para un pedido concreto.`;

interface MensajeEntrada {
  rol: "usuario" | "asistente";
  texto: string;
}

function leerMensajes(v: unknown): MensajeEntrada[] | null {
  if (!Array.isArray(v) || !v.length || v.length > MAX_MENSAJES) return null;
  const salida: MensajeEntrada[] = [];
  for (const m of v) {
    const o = (m ?? {}) as Record<string, unknown>;
    if ((o.rol !== "usuario" && o.rol !== "asistente") || typeof o.texto !== "string" || !o.texto.trim()) return null;
    salida.push({ rol: o.rol, texto: o.texto.slice(0, MAX_TEXTO) });
  }
  return salida[0].rol === "usuario" && salida[salida.length - 1].rol === "usuario" ? salida : null;
}

export async function POST(request: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario) return new Response("No autorizado", { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "El asistente está apagado: falta conectar la IA (ANTHROPIC_API_KEY en Vercel)." }, { status: 503 });
  const cuerpo = await request.json().catch(() => null);
  const entrada = leerMensajes((cuerpo as { mensajes?: unknown } | null)?.mensajes);
  if (!entrada) return Response.json({ error: "Conversación no válida." }, { status: 400 });

  const pais = await getPaisActual(createServiceClient());
  // Lo de esta persona va después de lo fijo (no rompe la caché de la parte fija).
  const quien = `Te escribe ${usuario.nombre || usuario.email}${usuario.rolNombre ? ` (rol: ${usuario.rolNombre})` : ""}. País elegido arriba en el sistema: ${pais.nombre}. Módulos que puede abrir: ${usuario.modulos.map((m) => etiquetaDeModulo(m)).join(", ") || "ninguno"}. Hoy es ${new Date().toLocaleDateString("es-PA", { timeZone: "America/Panama", dateStyle: "full" })}.`;

  const mensajes: Anthropic.Beta.BetaMessageParam[] = entrada.map((m) => ({ role: m.rol === "usuario" ? "user" : "assistant", content: m.texto }));
  const client = new Anthropic();
  const codificador = new TextEncoder();

  const salida = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (o: Record<string, unknown>) => controller.enqueue(codificador.encode(`${JSON.stringify(o)}\n`));
      let entradaTokens = 0;
      let salidaTokens = 0;
      try {
        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
          // Si el modelo declina una pregunta por sus filtros de seguridad, la API la responde con otro modelo en la misma llamada (`fallbacks`).
          const stream = client.beta.messages.stream({
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            model: MODELO,
            max_tokens: 16000,
            output_config: { effort: "low" },
            system: [
              { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
              { type: "text", text: quien },
            ],
            tools: HERRAMIENTAS,
            messages: mensajes,
          });
          stream.on("text", (delta) => enviar({ t: "texto", d: delta }));
          const mensaje = await stream.finalMessage();
          entradaTokens += mensaje.usage.input_tokens + (mensaje.usage.cache_read_input_tokens ?? 0) + (mensaje.usage.cache_creation_input_tokens ?? 0);
          salidaTokens += mensaje.usage.output_tokens;

          if (mensaje.stop_reason === "refusal") {
            enviar({ t: "texto", d: "\n\nNo puedo responder eso." });
            break;
          }
          if (mensaje.stop_reason === "pause_turn") {
            mensajes.push({ role: "assistant", content: mensaje.content });
            continue;
          }
          const usos = mensaje.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (mensaje.stop_reason !== "tool_use" || !usos.length) break;

          mensajes.push({ role: "assistant", content: mensaje.content });
          for (const u of usos) enviar({ t: "herramienta", d: AVISO_HERRAMIENTA[u.name] ?? "Consultando el sistema…" });
          const resultados = await Promise.all(
            usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => ({ type: "tool_result", tool_use_id: u.id, content: await correrHerramienta(u.name, u.input, usuario) })),
          );
          mensajes.push({ role: "user", content: resultados });
          enviar({ t: "texto", d: "\n\n" });
        }
        enviar({ t: "fin", tokens: { entrada: entradaTokens, salida: salidaTokens } });
      } catch (e) {
        const msg =
          e instanceof Anthropic.AuthenticationError
            ? "La clave de la IA no es válida (ANTHROPIC_API_KEY)."
            : e instanceof Anthropic.RateLimitError
              ? "La IA está ocupada: intenta de nuevo en un minuto."
              : e instanceof Anthropic.APIError
                ? `La IA respondió con un error (${e.status}).`
                : "No se pudo responder.";
        enviar({ t: "error", d: msg });
      }
      console.log(`[asistente] ${usuario.email}: ${entradaTokens} tokens de entrada, ${salidaTokens} de salida`);
      controller.close();
    },
  });
  return new Response(salida, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

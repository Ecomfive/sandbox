"use server";

import { cookies } from "next/headers";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { listarTiendas } from "./tienda-actual";
import { TIENDA_COOKIE, TODAS_TIENDAS, valorTiendaValido } from "./tienda-elegida";

/**
 * Guarda la tienda global (`id` de una tienda de `fin_unidades` o «todas»). Solo con sesión y solo una tienda que
 * exista; lo demás se ignora. No refresca la página: quien la llama decide (la barra navega, la página ya muestra esa).
 */
export async function setTiendaActual(valor: string): Promise<{ ok: boolean }> {
  if (!valorTiendaValido(valor)) return { ok: false };
  if (!(await getUsuarioActual())) return { ok: false };
  if (valor !== TODAS_TIENDAS && !(await listarTiendas(createServiceClient())).some((t) => t.id === valor)) return { ok: false };
  (await cookies()).set(TIENDA_COOKIE, valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}

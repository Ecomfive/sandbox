"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { PAIS_COOKIE } from "@/lib/nav-data";

export async function setPaisActual(codigo: string) {
  const cookieStore = await cookies();
  cookieStore.set(PAIS_COOKIE, codigo, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}

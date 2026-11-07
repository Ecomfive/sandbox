// Aviso de inactividad (7 nov 2026, pedido de Alcides): a las personas marcadas en Configuración › «Aviso de inactividad»
// (`perfiles.aviso_inactividad`, migración 0249) el sistema les muestra que llevan 5 minutos sin actividad, y bloquea hasta «Entendido». Es la misma regla con que Equipo › Rendimiento deja de contar un minuto como
// activo (mouse, teclado, desplazarse o tocar la pantalla en los últimos 5 minutos). Solo avisa a la persona: no guarda nada nuevo.
// Sin base ni React, con prueba.

import { duracion, ZONA } from "./jornada";

/** Los minutos sin usar el sistema a partir de los cuales sale el aviso (los mismos que Rendimiento, `SIN_USO_MS` del latido). */
export const MINUTOS_AVISO = 5;

const MINUTO = 60_000;

/** «10:12 a. m.», en hora de Panamá. */
export const horaCorta = (ms: number) => new Date(ms).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });

/** Los minutos enteros que pasaron (nunca menos de 0). */
export const minutosEntre = (desde: number, hasta: number) => Math.max(0, Math.floor((hasta - desde) / MINUTO));

/** Si ya pasó el tiempo para avisar. */
export const sinActividad = (ultimoUso: number, ahora: number) => ahora - ultimoUso >= MINUTOS_AVISO * MINUTO;

/** Mientras sigue sin actividad: «Sin actividad en el sistema desde las 10:12 a. m. (6 min)». */
export const textoSinActividad = (ultimoUso: number, ahora: number) => `Sin actividad en el sistema desde las ${horaCorta(ultimoUso)} (${duracion(minutosEntre(ultimoUso, ahora))})`;

/** Al volver: «Estuviste 8 min sin actividad en el sistema, de 10:12 a. m. a 10:20 a. m.». */
export const textoVolvio = (desde: number, hasta: number) => `Estuviste ${duracion(minutosEntre(desde, hasta))} sin actividad en el sistema, de ${horaCorta(desde)} a ${horaCorta(hasta)}.`;

export interface OfficialScheduleItem {
  code: string; // Nombre / Código
  name: string; // Nombre del horario
  description: string; // Descripción
  type: string; // Flexible | Normal | A
  entryTime: string; // Entrada (ej. 07:00:00)
  exitTime: string; // Salida (ej. 15:00:00)
  workMinutes: number; // Tiempo de Trabajo en minutos
  workType: string; // Trabajo Normal | Día de Descanso
}

/**
 * Catálogo Oficial Maestro de Turnos y Horarios de la Empresa
 */
export const OFFICIAL_SCHEDULES_CATALOG: OfficialScheduleItem[] = [
  {
    code: 'D',
    name: 'Horario Dia_Descanso_default',
    description: 'Aplica para el personal sindicalizado y no sindicalizado de todas las empresas',
    type: 'Flexible',
    entryTime: '00:00:00',
    exitTime: '23:59:00',
    workMinutes: 0,
    workType: 'Día de Descanso',
  },
  {
    code: 'F',
    name: 'Festivo',
    description: 'Aplica cuando el personal no se presente por ser un día festivo ej 1° de enero',
    type: 'Flexible',
    entryTime: '00:00:00',
    exitTime: '23:59:00',
    workMinutes: 0,
    workType: 'Día de Descanso',
  },
  {
    code: '1',
    name: 'Primer turno',
    description: 'Aplica para todo el personal de PQ',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '15:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '1P',
    name: 'Primer turno pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '15:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '2',
    name: 'Segundo turno',
    description: 'Aplica para todo el personal de PQ',
    type: 'Normal',
    entryTime: '15:00:00',
    exitTime: '23:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '2P',
    name: 'Segundo turno pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '15:00:00',
    exitTime: '23:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '3',
    name: 'Tercer turno',
    description: 'Aplica para todo el personal de PQ',
    type: 'Normal',
    entryTime: '23:00:00',
    exitTime: '07:00:00+1',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '3P',
    name: 'Tercer turno pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '23:00:00',
    exitTime: '07:00:00+1',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '4',
    name: 'Cuarto turno',
    description: 'Aplica para todo el personal de PQ',
    type: 'Normal',
    entryTime: '11:00:00',
    exitTime: '19:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '4P',
    name: 'Cuarto turno pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '11:00:00',
    exitTime: '19:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CMN',
    name: 'Primer turno Mantenimiento',
    description: 'Aplica para todo el personal de PQ',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '14:00:00',
    workMinutes: 420,
    workType: 'Trabajo Normal',
  },
  {
    code: '12M',
    name: '12x12 matutino',
    description: 'Aplica, siempre y cuando sea su turno normal y no genere tiempo extra',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '19:00:00',
    workMinutes: 720,
    workType: 'Trabajo Normal',
  },
  {
    code: '12V',
    name: '12x12 vespertino',
    description: 'Aplica, siempre y cuando sea su turno normal y no genere tiempo extra',
    type: 'Normal',
    entryTime: '19:00:00',
    exitTime: '07:00:00+1',
    workMinutes: 720,
    workType: 'Trabajo Normal',
  },
  {
    code: '1P',
    name: 'Primer turno a pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '14:30:00',
    exitTime: '22:30:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '1S',
    name: 'Primer turno supervision',
    description: 'Aplica para el personal de supervisión no sindicalizado de BT y PQ',
    type: 'Normal',
    entryTime: '06:30:00',
    exitTime: '14:30:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '2P',
    name: 'Segundo turno a pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '14:30:00',
    exitTime: '22:30:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '2S',
    name: 'Segundo turno supervision',
    description: 'Aplica para el personal de supervisión no sindicalizado de BT y PQ',
    type: 'Normal',
    entryTime: '14:30:00',
    exitTime: '22:30:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '3P',
    name: 'Tercer turno a pago',
    description: 'Aplica para todo el personal de PQ que paga en dia de descanso sea por cambio de turno o TXT o adelanta turno, NO ES TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '22:30:00',
    exitTime: '06:30:00+1',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: '3S',
    name: 'Tercer turno supervision',
    description: 'Aplica para el personal de supervisión no sindicalizado de BT y PQ',
    type: 'Normal',
    entryTime: '22:30:00',
    exitTime: '06:30:00+1',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: 'A',
    name: 'Almacen',
    description: 'Para el personal de Almacén que aplique el pago de 2 horas',
    type: 'Normal',
    entryTime: '13:00:00',
    exitTime: '23:00:00',
    workMinutes: 600,
    workType: 'Trabajo Normal',
  },
  {
    code: 'B',
    name: 'Becarios',
    description: 'Aplica para el personal que esta como becario',
    type: 'Normal',
    entryTime: '08:00:00',
    exitTime: '16:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: 'C',
    name: 'Central',
    description: 'Aplica para todo el personal',
    type: 'Normal',
    entryTime: '08:00:00',
    exitTime: '17:30:00',
    workMinutes: 570,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CA',
    name: 'Central A',
    description: 'Aplica para todo el personal',
    type: 'Normal',
    entryTime: '08:30:00',
    exitTime: '18:00:00',
    workMinutes: 570,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CAP',
    name: 'Induccion',
    description: 'Aplica cuando el personal esta en inducción',
    type: 'Normal',
    entryTime: '08:00:00',
    exitTime: '17:30:00',
    workMinutes: 570,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CAP1',
    name: 'Capacitación primer turno',
    description: 'Aplica cuando la capacitación abarque todo el 1er turno',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '15:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CAP2',
    name: 'Capacitación segundo turno',
    description: 'Aplica cuando la capacitación abarque todo el 2do turno',
    type: 'Normal',
    entryTime: '15:00:00',
    exitTime: '23:00:00',
    workMinutes: 480,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CAPS',
    name: 'Capacitacion sindicalizados y no sindicalizados',
    description: 'Aplica cuando la capacitación sea por menos de 8 horas',
    type: 'Flexible',
    entryTime: '00:00:00',
    exitTime: '23:59:00',
    workMinutes: 0,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CB',
    name: 'Central B',
    description: 'Aplica para el personal de Polatecnia',
    type: 'Normal',
    entryTime: '09:00:00',
    exitTime: '13:30:00',
    workMinutes: 270,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CE',
    name: 'Central E',
    description: 'Aplica para el personal de Polatecnia',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '17:00:00',
    workMinutes: 600,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CM',
    name: 'Central matutino',
    description: 'Para todo el personal que aplique.',
    type: 'Normal',
    entryTime: '08:00:00',
    exitTime: '15:00:00',
    workMinutes: 420,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT1',
    name: 'Cubre 1 y 2 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '23:00:00',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT2',
    name: 'Cubre 2 y 3 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '15:00:00',
    exitTime: '07:00:00+1',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT3',
    name: 'Cubre 3 y 1 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'A',
    entryTime: '23:00:00',
    exitTime: '15:00:00',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT4',
    name: 'Cubre 1 y 3 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'A',
    entryTime: '07:00:00',
    exitTime: '07:00:00+1',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT1S',
    name: 'Cubre 1 y 2 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '06:30:00',
    exitTime: '22:30:00',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT2S',
    name: 'Cubre 2 y 3 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'Normal',
    entryTime: '14:30:00',
    exitTime: '06:30:00+1',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT3S',
    name: 'Cubre 3 y 1 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'A',
    entryTime: '22:30:00',
    exitTime: '15:00:00',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'CT4S',
    name: 'Cubre 1 y 3 turno',
    description: 'Aplica cuando el trabajador cambie turno con otra persona y/o ese dia labore 2 turnos por horas de permiso, NO GENERA TIEMPO EXTRA',
    type: 'A',
    entryTime: '06:30:00',
    exitTime: '06:30:00+1',
    workMinutes: 960,
    workType: 'Trabajo Normal',
  },
  {
    code: 'GS',
    name: 'Guardia sabatina',
    description: 'Aplica cuando el personal no sindicalizado viene a guardia',
    type: 'Normal',
    entryTime: '09:00:00',
    exitTime: '13:00:00',
    workMinutes: 270,
    workType: 'Trabajo Normal',
  },
  {
    code: 'SA',
    name: 'Horario especial',
    description: 'Para el personal que aplique',
    type: 'Normal',
    entryTime: '07:00:00',
    exitTime: '13:00:00',
    workMinutes: 360,
    workType: 'Trabajo Normal',
  },
  {
    code: 'SG',
    name: 'Horario especial',
    description: 'Para el personal que aplique',
    type: 'Normal',
    entryTime: '06:00:00',
    exitTime: '13:00:00',
    workMinutes: 420,
    workType: 'Trabajo Normal',
  },
];

// Map rápido por código en mayúsculas
const SCHEDULE_MAP = new Map<string, OfficialScheduleItem>();
for (const item of OFFICIAL_SCHEDULES_CATALOG) {
  SCHEDULE_MAP.set(item.code.toUpperCase(), item);
}

/**
 * Busca un horario oficial por código o coincidencia de texto
 */
export function findOfficialSchedule(raw?: string, startTimeStr?: string): OfficialScheduleItem | undefined {
  if (!raw) return undefined;
  const clean = raw.trim().toUpperCase();

  // 1. Coincidencia exacta por nombre del horario
  const byExactName = OFFICIAL_SCHEDULES_CATALOG.find(
    (s) => s.name.toUpperCase() === clean
  );
  if (byExactName) return byExactName;

  // 2. Coincidencia por código
  const matchesByCode = OFFICIAL_SCHEDULES_CATALOG.filter(
    (s) => s.code.toUpperCase() === clean
  );
  if (matchesByCode.length === 1) {
    return matchesByCode[0];
  }
  if (matchesByCode.length > 1) {
    // Desambiguar turnos con igual código (ej. 1P, 2P, 3P) según startTimeStr
    if (startTimeStr) {
      const match = startTimeStr.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        const h = parseInt(match[1], 10);
        let best = matchesByCode[0];
        let minDiff = 999;
        for (const item of matchesByCode) {
          const itemH = parseInt(item.entryTime.split(':')[0], 10);
          const diff = Math.abs(h - itemH);
          if (diff < minDiff) {
            minDiff = diff;
            best = item;
          }
        }
        return best;
      }
    }
    return matchesByCode[0];
  }

  // 3. Coincidencia por inclusión de texto en el nombre
  const byName = OFFICIAL_SCHEDULES_CATALOG.find(
    (s) => s.name.toUpperCase().includes(clean) || clean.includes(s.name.toUpperCase())
  );
  if (byName) return byName;

  return undefined;
}

function formatTimeHHMM(timeStr: string): string {
  if (!timeStr) return '';
  const match = timeStr.match(/^(\d{1,2}:\d{2})/);
  const base = match ? match[1].padStart(5, '0') : timeStr.slice(0, 5);
  return timeStr.includes('+1') ? `${base}+1` : base;
}

/**
 * Formatea la etiqueta oficial del turno con su código, nombre y horas
 */
export function formatOfficialShiftLabel(rawShift?: string, startTimeStr?: string): string {
  const schedule = findOfficialSchedule(rawShift, startTimeStr);
  if (schedule) {
    const entryShort = formatTimeHHMM(schedule.entryTime);
    const exitShort = formatTimeHHMM(schedule.exitTime);
    if (schedule.workMinutes === 0) {
      return `${schedule.code} - ${schedule.name}`;
    }
    return `${schedule.code} - ${schedule.name} (${entryShort} a ${exitShort})`;
  }

  const clean = (rawShift || '').trim();
  if (clean && clean !== '1' && clean !== '2' && clean !== '3') {
    return clean;
  }

  // Deducción por hora si solo se tiene la hora de inicio
  if (startTimeStr) {
    const match = startTimeStr.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      if (h >= 6 && h < 11) {
        return '1 - Primer turno (07:00 a 15:00)';
      }
      if (h >= 11 && h < 14) {
        return '4 - Cuarto turno (11:00 a 19:00)';
      }
      if (h >= 14 && h < 22) {
        return '2 - Segundo turno (15:00 a 23:00)';
      }
      return '3 - Tercer turno (23:00 a 07:00+1)';
    }
  }

  return '1 - Primer turno (07:00 a 15:00)';
}

export { isThirdShift } from './businessRules';

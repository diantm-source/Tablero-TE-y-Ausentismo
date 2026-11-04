import {
  AttendanceAbsenceStatus,
  ReasonCatalogItem,
  ReasonClassification,
} from '../types';

export const ELIGIBLE_SCHEDULES = new Set([
  '1',
  '1S',
  '2',
  '2S',
  '3',
  '3S',
  'CM',
  'C',
]);

/**
 * Empresas autorizadas para el reporte de Total de Asistencia:
 * Únicamente "Polaquimia, MLBM y Barteleu"
 */
export const ATTENDANCE_ALLOWED_COMPANIES = new Set([
  'POLAQUIMIA',
  'MLBM',
  'BARTELEU',
]);

/**
 * Lista maestra de empresas que siempre deben figurar en el filtro de Empresa:
 * MLBM, POLAQUIMIA, POLATECNIA, BARTELEU, BECARIOS y EXTERNOS
 */
export const OFFICIAL_COMPANIES_LIST = [
  'POLAQUIMIA',
  'MLBM',
  'BARTELEU',
  'POLATECNIA',
  'BECARIOS',
  'EXTERNOS',
];

export function isAttendanceEligibleCompany(company: string): boolean {
  if (!company) return false;
  const norm = company.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  return norm.includes('POLAQUIMIA') || norm.includes('MLBM') || norm.includes('BARTELEU');
}


import { getISOWeek, getISOWeekYear, format, isValid } from 'date-fns';

/**
 * Returns ISO 8601 week number and ISO year for a given date using date-fns.
 * ISO week starts on Monday (ISO 8601 compliant).
 */
export function getISOWeekAndYear(date: Date): { isoYear: number; isoWeek: number } {
  if (!isValid(date)) {
    const now = new Date();
    return { isoYear: getISOWeekYear(now), isoWeek: getISOWeek(now) };
  }
  return {
    isoYear: getISOWeekYear(date),
    isoWeek: getISOWeek(date),
  };
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  if (!isValid(date)) return '';
  return format(date, 'yyyy-MM-dd');
}

const SPANISH_MONTHS: Record<string, number> = {
  ene: 0, enero: 0,
  feb: 1, febrero: 1,
  mar: 2, marzo: 2,
  abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5,
  jul: 6, julio: 6,
  ago: 7, agosto: 7,
  sep: 8, sept: 8, set: 8, septiembre: 8, setiembre: 8,
  oct: 9, octubre: 9,
  nov: 10, noviembre: 10,
  dic: 11, diciembre: 11,
};

/**
 * Returns human-readable label and date range for an ISO week key (e.g. "2026-W36").
 * Formats: "Semana 36: 31 de agosto al 6 de septiembre de 2026"
 * Supports current, past and future weeks dynamically (Semana 44, 45, etc.).
 */
export function getISOWeekDateRange(isoKey: string): { start: string; end: string; label: string; weekNum: number; year: number } {
  const match = String(isoKey || '').match(/^(\d{4})-?W?(\d{1,2})$/i);
  if (!match) return { start: '', end: '', label: isoKey, weekNum: 0, year: 0 };
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // In ISO 8601: Jan 4 is always in week 1.
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // 1 = Monday, 7 = Sunday
  const monWeek1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);

  // Monday of target week
  const mon = new Date(monWeek1.getTime() + (week - 1) * 7 * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);

  const monthNames = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const startDay = mon.getDate();
  const startMonth = monthNames[mon.getMonth()];
  const endDay = sun.getDate();
  const endMonth = monthNames[sun.getMonth()];
  const endYear = sun.getFullYear();

  let rangeText = '';
  if (mon.getMonth() === sun.getMonth() && mon.getFullYear() === sun.getFullYear()) {
    rangeText = `${startDay} al ${endDay} de ${startMonth} de ${endYear}`;
  } else if (mon.getFullYear() === sun.getFullYear()) {
    rangeText = `${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${endYear}`;
  } else {
    rangeText = `${startDay} de ${startMonth} de ${mon.getFullYear()} al ${endDay} de ${endMonth} de ${endYear}`;
  }

  return {
    start: formatDateISO(mon),
    end: formatDateISO(sun),
    label: `Semana ${week}: ${rangeText}`,
    weekNum: week,
    year,
  };
}

/**
 * Robust duration-to-hours parser:
 * Handles numbers, Excel date/time durations, strings like "04:00", "02:30:00", "4,50 hrs", "4 hrs".
 */
export function parseDurationToHours(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (isNaN(val)) return 0;
    return Math.round(val * 100) / 100;
  }
  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    const s = val.getSeconds();
    return Math.round((h + m / 60 + s / 3600) * 100) / 100;
  }
  const str = String(val).trim();
  if (!str) return 0;

  // Check HH:mm or HH:mm:ss format (e.g. "04:00", "02:30", "04:00:00", "4:00")
  const timeMatch = str.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const mins = parseInt(timeMatch[2], 10);
    const secs = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    return Math.round((hours + mins / 60 + secs / 3600) * 100) / 100;
  }

  // Clean comma to dot and strip units like "hrs", "horas", etc.
  const cleaned = str.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

/**
 * Parses diverse Excel / BioTime date formats safely:
 * - "YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD"
 * - "DD/MM/YYYY", "DD-MM-YYYY", "DD.MM.YYYY"
 * - "MM/DD/YYYY", "MM-DD-YYYY" (auto-detected when unambiguous)
 * - "DD/MM/YY" or "DD-MM-YY" (2-digit year)
 * - Datetime strings: "31/08/2026 18:00:00", "2026-08-31 18:00:00", "31/08/2026 06:00:00 p.m."
 * - Spanish dates: "31-ago-2026", "31/ago/2026", "31 de agosto de 2026"
 * - Excel serial numbers
 */
export function parseDateString(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    // If it was stored as UTC midnight (common in Excel date cells),
    // preserve UTC day/month/year with noon local time to avoid timezone offset shifts:
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0) {
      return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate(), 12, 0, 0);
    }
    return val;
  }
  if (typeof val === 'number') {
    // Excel serial date: days since 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const millis = excelEpoch.getTime() + Math.round(val * 86400000);
    const d = new Date(millis);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
  }
  if (typeof val === 'string') {
    let s = val.replace(/^["']|["']$/g, '').trim();
    if (!s || s === '-' || s.toLowerCase() === 'null') return null;

    // Check Spanish textual month: "31-ago-2026", "31/ago/2026", "31 de agosto de 2026", "31-ago-26"
    const spanishMatch = s.match(/^(\d{1,2})[-/ ]+(?:de\s+)?([a-záéíóú]+)[-/ ]+(?:de\s+)?(\d{2,4})/i);
    if (spanishMatch) {
      const day = parseInt(spanishMatch[1], 10);
      const mText = spanishMatch[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3);
      if (SPANISH_MONTHS[mText] !== undefined) {
        let year = parseInt(spanishMatch[3], 10);
        if (year < 100) year += 2000;
        const d = new Date(year, SPANISH_MONTHS[mText], day, 12, 0, 0);
        return isNaN(d.getTime()) ? null : d;
      }
    }
    
    // Check YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (with optional time after)
    const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const d = new Date(year, month, day, 12, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    // Check DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY or DD.MM.YYYY (with optional time after)
    const dateSepMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dateSepMatch) {
      const p1 = parseInt(dateSepMatch[1], 10);
      const p2 = parseInt(dateSepMatch[2], 10);
      let year = parseInt(dateSepMatch[3], 10);
      if (year < 100) year += 2000;

      let day = p1;
      let month = p2 - 1;

      // If p1 <= 12 and p2 > 12, it is definitely MM/DD/YYYY (e.g. 08/31/2026)
      if (p1 <= 12 && p2 > 12) {
        month = p1 - 1;
        day = p2;
      }

      const d = new Date(year, month, day, 12, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    const standard = new Date(s);
    return isNaN(standard.getTime()) ? null : standard;
  }
  return null;
}

/**
 * Parses time format HH:mm or HH:mm:ss or Excel fraction
 */
export function parseTimeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    // Excel time fraction (0.5 = 12:00:00)
    const totalSeconds = Math.round((val % 1) * 86400);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  const str = String(val).trim();
  if (!str || str === '-' || str.toLowerCase() === 'null') return '';

  // Extract HH:mm(:ss)
  const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const h = String(parseInt(match[1], 10)).padStart(2, '0');
    const m = match[2];
    const s = match[3] || '00';
    return `${h}:${m}:${s}`;
  }
  return str;
}

/**
 * Calculates real duration in hours between startDate+startTime and endDate+endTime,
 * correctly handling midnight crossings (e.g., 22:00 to 06:00).
 */
export function calculateOvertimeHours(
  startDateStr: string,
  startTimeStr: string,
  endDateStr: string,
  endTimeStr: string
): number {
  if (!startDateStr || !startTimeStr || !endTimeStr) return 0;
  
  const startD = parseDateString(startDateStr);
  const endD = parseDateString(endDateStr || startDateStr);
  if (!startD || !endD) return 0;

  const [sH, sM] = startTimeStr.split(':').map((v) => parseInt(v || '0', 10));
  const [eH, eM] = endTimeStr.split(':').map((v) => parseInt(v || '0', 10));

  const startMillis = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate(), sH, sM, 0).getTime();
  let endMillis = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate(), eH, eM, 0).getTime();

  // If start and end date are the same but end time < start time, it crossed midnight into next day
  if (startDateStr === endDateStr && endMillis <= startMillis) {
    endMillis += 24 * 60 * 60 * 1000;
  }

  const diffMillis = endMillis - startMillis;
  if (diffMillis <= 0) return 0;

  const hours = diffMillis / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

/**
 * Classifies an attendance record based on business rules:
 * 1. Eligible schedule (1, 1s, 2, 2s, 3, 3s, CM, C)
 * 2. Has active exception (Vacaciones, Incapacidad, Permiso) => JUSTIFICADO_EXCEPCION
 * 3. Real punches:
 *    - Both empty => AUSENCIA_CONFIRMADA / AUSENCIA_PROBABLE
 *    - Only one empty => INCIDENCIA_MARCAJE
 *    - Both present => PRESENTE
 */
export function evaluateAttendance(
  scheduleCode: string,
  exceptionVal: string,
  realIn: string | null,
  realOut: string | null
): {
  absenceStatus: AttendanceAbsenceStatus;
  isScheduleEligible: boolean;
  hasException: boolean;
} {
  const cleanSchedule = (scheduleCode || '').trim().toUpperCase();
  const isScheduleEligible = ELIGIBLE_SCHEDULES.has(cleanSchedule);

  const cleanException = (exceptionVal || '').trim();
  const hasException =
    cleanException !== '' &&
    cleanException !== '-' &&
    cleanException !== '0' &&
    cleanException.toLowerCase() !== 'ninguna';

  const hasIn = Boolean(realIn && realIn.trim() !== '' && realIn.trim() !== '-');
  const hasOut = Boolean(realOut && realOut.trim() !== '' && realOut.trim() !== '-');

  if (!isScheduleEligible) {
    return {
      absenceStatus: 'EXCLUIDO_HORARIO',
      isScheduleEligible: false,
      hasException,
    };
  }

  if (hasException) {
    return {
      absenceStatus: 'JUSTIFICADO_EXCEPCION',
      isScheduleEligible: true,
      hasException: true,
    };
  }

  if (!hasIn && !hasOut) {
    // Both marks missing on eligible scheduled shift with no exception -> Absence
    return {
      absenceStatus: 'AUSENCIA_CONFIRMADA',
      isScheduleEligible: true,
      hasException: false,
    };
  }

  if (!hasIn || !hasOut) {
    // Only one punch missing -> Attendance marking incident (requires review, NOT absence)
    return {
      absenceStatus: 'INCIDENCIA_MARCAJE',
      isScheduleEligible: true,
      hasException: false,
    };
  }

  return {
    absenceStatus: 'PRESENTE',
    isScheduleEligible: true,
    hasException: false,
  };
}

/**
 * Normalize text: remove accents, lowercase, trim and collapse spaces
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein distance between two normalized strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * String similarity ratio (0 to 1)
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeText(s1);
  const norm2 = normalizeText(s2);
  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0;
  const dist = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  return 1 - dist / maxLen;
}

/**
 * Validates written Overtime reason against official catalog
 */
export function validateOvertimeReason(
  reason: string,
  catalog: ReasonCatalogItem[]
): {
  classification: ReasonClassification;
  suggestedOfficialReason?: string;
  category?: string;
  score: number;
} {
  const raw = (reason || '').trim();
  if (!raw) {
    return { classification: 'REVISION', score: 0 };
  }

  const norm = normalizeText(raw);

  // 1. Exact match with official catalog reason
  for (const item of catalog) {
    if (!item.isActive) continue;
    const catNorm = normalizeText(item.officialReason);
    if (norm === catNorm) {
      return {
        classification: 'CORRECTO',
        suggestedOfficialReason: item.officialReason,
        category: item.category,
        score: 1.0,
      };
    }
  }

  // 2. Check for official Category format: "[Categoría] - [Explicación]"
  const parts = raw.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    const rawCategory = parts[0].trim();
    const rawDetail = parts.slice(1).join(' - ').trim();
    const normCategory = normalizeText(rawCategory);

    const matchingCategoryItem = catalog.find(
      (c) => normalizeText(c.category) === normCategory
    );

    if (matchingCategoryItem && rawDetail.length > 0) {
      // Recognized valid category and structure
      return {
        classification: 'CORRECTO',
        suggestedOfficialReason: `${matchingCategoryItem.category} - ${rawDetail}`,
        category: matchingCategoryItem.category,
        score: 0.95,
      };
    }
  }

  // 3. High similarity match (Possible typo >= 0.75 against official list)
  let bestMatch: ReasonCatalogItem | null = null;
  let highestScore = 0;

  for (const item of catalog) {
    if (!item.isActive) continue;
    const score = calculateSimilarity(raw, item.officialReason);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore >= 0.72) {
    return {
      classification: 'POSIBLE_ERROR',
      suggestedOfficialReason: bestMatch.officialReason,
      category: bestMatch.category,
      score: highestScore,
    };
  }

  // 4. Keyword / partial substring containment
  for (const item of catalog) {
    if (!item.isActive) continue;
    const matchesKeyword = item.keywords.some((k) => norm.includes(normalizeText(k)));
    if (matchesKeyword) {
      return {
        classification: 'REVISION',
        suggestedOfficialReason: item.officialReason,
        category: item.category,
        score: highestScore,
      };
    }
  }

  return {
    classification: 'NO_RECONOCIDO',
    score: highestScore,
  };
}

/**
 * Determines whether employee is syndicated based on company, nickname, or catalog
 */
export function determineSyndicatedStatus(
  company: string,
  nickname: string,
  department: string
): boolean {
  const nick = normalizeText(nickname);
  const comp = normalizeText(company);
  const dept = normalizeText(department);

  // Rules:
  // Becarios are not syndicated
  if (nick.includes('becario') || comp.includes('becario') || dept.includes('becario')) {
    return false;
  }
  // Polatecnia typically not syndicated or specific rule
  if (comp.includes('polatecnia')) {
    return false;
  }
  // Polaquimia plant / operational workers with specific nickname patterns
  if (nick.includes('sind') || nick.includes('sindicalizado') || nick.includes('planta') || nick.includes('operativo')) {
    return true;
  }
  // Default Polaquimia operations
  if (comp.includes('polaquimia') && (dept.includes('produccion') || dept.includes('mantenimiento') || dept.includes('almacen'))) {
    return true;
  }

  return false;
}

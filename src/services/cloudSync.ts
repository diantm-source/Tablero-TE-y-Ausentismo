import * as XLSX from 'xlsx';
import {
  AbsenceRecord,
  AnnualOvertimeRecord,
  OvertimeRecord,
  ReasonCatalogItem,
  WeeklyMatrixRecord,
} from '../types';
import { AbsenceRecordSchema, OvertimeRecordSchema } from '../schemas';
import {
  calculateOvertimeHours,
  determineSyndicatedStatus,
  formatDateISO,
  getISOWeekAndYear,
  normalizeText,
  parseDateString,
  parseDurationToHours,
  parseTimeString,
  validateOvertimeReason,
} from './businessRules';
import {
  calculateDurationHours,
  formatShiftLabel,
  normalizeApprovalStatus,
  parseDateTime,
  parseWeeklyMatrixWorkbook,
  splitFullName,
} from './overtimeParser';
import {
  AppStorage,
  CLOUD_BATCH_ID,
  CLOUD_ATTENDANCE_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  CLOUD_MATRIZ_BATCH_ID,
  MATRIZ_FILE_NAME,
  MATRIZ_BATCH_SOURCE,
} from './storage';

export {
  CLOUD_BATCH_ID,
  CLOUD_ATTENDANCE_BATCH_ID,
  CLOUD_BATCH_SOURCE,
  CLOUD_MATRIZ_BATCH_ID,
  MATRIZ_FILE_NAME,
  MATRIZ_BATCH_SOURCE,
};

export const STORAGE_KEY_SHEETS_URL = 'pcat_sheets_csv_url';
export const STORAGE_KEY_ABSENCE_SHEETS_URL = 'pcat_absence_sheets_csv_url';
export const STORAGE_KEY_MATRIZ_SHEETS_URL = 'pcat_matriz_sheets_url';
export const STORAGE_KEY_LAST_SYNC = 'pcat_last_sync_timestamp';

// Default fallback URL configurado (Tiempo Extra Concentrado Anual)
export const DEFAULT_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQB-L3Tzyt1IA9t8Ifmjp4z1QVSIvkToguAcoTipw0SZ-WaZp2g5c3dCyWxQQKB95mFQQPYkrRFlrm3/pub?output=csv';

// Default fallback URL configurado (Concentrado de Ausentismo)
export const DEFAULT_ABSENCE_SHEETS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQBrwUDfzZ94wGnudb02K1U2ZRZSeJlCVlabUQRoAfE4p6Y4hnreTwYgIc7oKKtNIX64HJPyLkpxujg/pub?output=csv';

// Default fallback URL configurado (Registro_Prolongacion - Matriz Semanal de Tiempo Extra y Prolongación de Jornada en Excel)
export const DEFAULT_MATRIZ_SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRA6U41IpBZZdoxc7lsOi3dTdE6fvIWJvtxZQnSDfsvKnixxX0K9fmb31poiAB31w/pub?output=xlsx';

const LEGACY_DEFAULT_SHEET_ID = '2PACX-1vTVqi_S5C8i3grKwYGFhzDk18kv9Drzzt73enXdNVuIhF8eINeAaSEJyV0frxJ8Bw';

/**
 * Normalizes Google Sheets URLs to direct CSV export format.
 * Automatically converts:
 * - /pubhtml -> /pub?output=csv
 * - /pub -> /pub?output=csv
 * - /spreadsheets/d/{id}/edit -> /spreadsheets/d/{id}/export?format=csv
 */
export function normalizeSheetsUrl(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';

  // 1. Google Sheets "Publicado en la web" con /pubhtml
  if (url.includes('/pubhtml')) {
    // Preserve any existing query parameters like gid
    if (url.includes('?')) {
      const [base, query] = url.split('?');
      const params = new URLSearchParams(query);
      params.set('output', 'csv');
      return `${base.replace(/\/pubhtml$/, '/pub')}?${params.toString()}`;
    }
    return url.replace(/\/pubhtml$/, '/pub?output=csv');
  }

  // 2. Google Sheets /pub without output=csv
  if (url.includes('/pub') && !url.includes('output=csv')) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}output=csv`;
  }

  // 3. Standard Google Sheet /edit link (Sharing link)
  if (url.includes('/spreadsheets/d/') && url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/export?format=csv');
  }

  return url;
}

/**
 * Resolves the active Google Sheets CSV URL using priority:
 * 1. Explicit passed parameter
 * 2. localStorage saved by user in CatalogsConfigView
 * 3. Environment variable VITE_SHEETS_CSV_URL
 * 4. Default Google Sheets CSV URL
 */
export function getEffectiveCloudSyncUrl(explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim()) {
    return normalizeSheetsUrl(explicitUrl);
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY_SHEETS_URL);
    if (local && local.trim()) {
      if (local.includes(LEGACY_DEFAULT_SHEET_ID)) {
        localStorage.setItem(STORAGE_KEY_SHEETS_URL, DEFAULT_SHEETS_CSV_URL);
        return DEFAULT_SHEETS_CSV_URL;
      }
      return normalizeSheetsUrl(local);
    }
  } catch {
    // LocalStorage unavailable
  }

  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SHEETS_CSV_URL;
  if (envUrl && envUrl.trim()) {
    return normalizeSheetsUrl(envUrl);
  }

  return DEFAULT_SHEETS_CSV_URL;
}

/**
 * Saves the configured Sheets URL into localStorage
 */
export function setStoredCloudSyncUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHEETS_URL, url.trim());
  } catch {
    // LocalStorage unavailable
  }
}

/**
 * Resolves the active Google Sheets CSV URL for AUSENTISMO (Concentrado de Ausencias) using priority:
 * 1. Explicit passed parameter
 * 2. localStorage saved by user in CatalogsConfigView
 * 3. Environment variable VITE_SHEETS_AUSENTISMO_CSV_URL
 * 4. Default Ausentismo Google Sheets CSV URL
 */
export function getEffectiveAbsenceCloudSyncUrl(explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim()) {
    return normalizeSheetsUrl(explicitUrl);
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY_ABSENCE_SHEETS_URL);
    if (local && local.trim()) {
      return normalizeSheetsUrl(local);
    }
  } catch {
    // LocalStorage unavailable
  }

  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SHEETS_AUSENTISMO_CSV_URL;
  if (envUrl && envUrl.trim()) {
    return normalizeSheetsUrl(envUrl);
  }

  return DEFAULT_ABSENCE_SHEETS_CSV_URL;
}

/**
 * Saves the configured Ausentismo Sheets URL into localStorage
 */
export function setStoredAbsenceCloudSyncUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ABSENCE_SHEETS_URL, url.trim());
  } catch {
    // LocalStorage unavailable
  }
}

/**
 * Normaliza la URL de Google Sheets publicada para descargar el libro completo de Excel (.xlsx).
 * Soporta /pubhtml, /pub, /edit, garantizando el parámetro output=xlsx o format=xlsx.
 */
export function normalizeMatrizSheetsUrl(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';

  // 1. Google Sheets "Publicado en la web" con /pubhtml
  if (url.includes('/pubhtml')) {
    if (url.includes('?')) {
      const [base, query] = url.split('?');
      const params = new URLSearchParams(query);
      params.set('output', 'xlsx');
      return `${base.replace(/\/pubhtml$/, '/pub')}?${params.toString()}`;
    }
    return url.replace(/\/pubhtml$/, '/pub?output=xlsx');
  }

  // 2. Google Sheets /pub
  if (url.includes('/pub')) {
    if (url.includes('output=csv')) {
      return url.replace('output=csv', 'output=xlsx');
    }
    if (!url.includes('output=xlsx')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}output=xlsx`;
    }
    return url;
  }

  // 3. Enlace de edición o compartición de Google Drive
  if (url.includes('/spreadsheets/d/') && url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/export?format=xlsx');
  }

  return url;
}

/**
 * Resuelve la URL activa para Registro_Prolongacion (Matriz Semanal de Tiempo Extra .xlsx):
 * 1. Parámetro explícito pasado a la función
 * 2. Guardada en localStorage por el usuario
 * 3. Variables de entorno VITE_SHEETS_REGISTRO_PROLONGACION_URL o VITE_SHEETS_MATRIZ_URL
 * 4. URL por defecto oficial
 */
export function getEffectiveMatrizCloudSyncUrl(explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim()) {
    return normalizeMatrizSheetsUrl(explicitUrl);
  }

  try {
    const local = localStorage.getItem(STORAGE_KEY_MATRIZ_SHEETS_URL);
    if (local && local.trim()) {
      return normalizeMatrizSheetsUrl(local);
    }
  } catch {
    // LocalStorage no disponible
  }

  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const envUrl =
    env?.VITE_SHEETS_REGISTRO_PROLONGACION_URL ||
    env?.VITE_SHEETS_MATRIZ_URL ||
    env?.VITE_REGISTRO_PROLONGACION_URL;

  if (envUrl && envUrl.trim()) {
    return normalizeMatrizSheetsUrl(envUrl);
  }

  return DEFAULT_MATRIZ_SHEETS_URL;
}

/**
 * Guarda la URL de la Matriz Semanal en localStorage
 */
export function setStoredMatrizCloudSyncUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_MATRIZ_SHEETS_URL, url.trim());
  } catch {
    // LocalStorage no disponible
  }
}

/**
 * Gets the ISO timestamp of the last successful synchronization
 */
export function getLastSyncTimestamp(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_LAST_SYNC);
  } catch {
    return null;
  }
}

/**
 * Sets the ISO timestamp of the last successful synchronization
 */
export function setLastSyncTimestamp(isoTimestamp: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_SYNC, isoTimestamp);
  } catch {
    // LocalStorage unavailable
  }
}

/**
 * Formats an ISO date/time string to DD/MM/AAAA HH:mm for user display
 */
export function formatSyncTimestampDisplay(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return 'Sin sincronizar';
  try {
    const date = new Date(isoTimestamp);
    if (isNaN(date.getTime())) return 'Sin sincronizar';
    const pad = (n: number) => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return 'Sin sincronizar';
  }
}

/**
 * Finds value in a row dictionary using alias matching
 */
function findRowValue(
  row: Record<string, unknown>,
  aliases: string[],
  excludeSubstrings: string[] = []
): unknown {
  const entries = Object.entries(row);

  // Exact normalized match
  for (const alias of aliases) {
    const normAlias = normalizeText(alias);
    for (const [key, val] of entries) {
      if (normalizeText(key) === normAlias && val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
  }

  // Substring normalized match
  for (const alias of aliases) {
    const normAlias = normalizeText(alias);
    for (const [key, val] of entries) {
      const normKey = normalizeText(key);
      if (excludeSubstrings.some((ex) => normKey.includes(ex))) {
        continue;
      }
      if (normKey.includes(normAlias) && val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
  }

  return undefined;
}

const SPANISH_MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/**
 * Parses currency strings like "$1,250.50", "$ 450", "1,250.00", "450,50" into a number
 */
export function parseCurrencyAmount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100;
  }

  let str = String(val).replace(/[$\sMXNmxn]/g, '').trim();
  if (!str || str === '-') return 0;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
      // Format 1,234.56
      str = str.replace(/,/g, '');
    } else {
      // Format 1.234,56
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    // Decide between thousand separator (1,250) and decimal comma (45,50)
    if (/,\d{3}(?:,\d{3})*$/.test(str)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/,/g, '.');
    }
  }

  const cleaned = str.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Extracts week number from formats like "W43", "Semana 43", "43", "2026-W43"
 */
export function parseWeekNumber(rawWeek: unknown, fallbackDate: Date | null): number {
  if (rawWeek !== undefined && rawWeek !== null && String(rawWeek).trim() !== '') {
    const str = String(rawWeek).trim();
    const isoMatch = str.match(/^\d{4}-W(\d{1,2})$/i);
    if (isoMatch) {
      const n = parseInt(isoMatch[1], 10);
      if (n >= 1 && n <= 53) return n;
    }
    const numMatch = str.match(/(\d{1,2})/);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 1 && n <= 53) return n;
    }
  }
  if (fallbackDate) {
    return getISOWeekAndYear(fallbackDate).isoWeek;
  }
  return 1;
}

/**
 * Formats Date as DD/MM/AAAA
 */
function formatDateDDMMYYYY(date: Date | null, fallback = ''): string {
  if (!date || isNaN(date.getTime())) return fallback;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Dynamically detects the header row index (0-indexed) in a 2D sheet array
 */
function detectHeaderRowIndex(rows: unknown[][]): number {
  const keywords = [
    'id',
    'empleado',
    'nombre',
    'apellido',
    'departamento',
    'area',
    'inicio',
    'fin',
    'horas',
    'solicit',
    'aprob',
    'motivo',
    'estado',
    'status',
    'te',
  ];

  let bestIndex = 0;
  let maxMatches = -1;

  const maxRowsToCheck = Math.min(rows.length, 10);
  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const rowText = row
      .map((cell) => normalizeText(String(cell || '')))
      .join(' ');

    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) {
        score++;
      }
    }

    if (score > maxMatches && score >= 2) {
      maxMatches = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Parses raw CSV text into a validated array of OvertimeRecord objects
 */
export function parseCSVToOvertimeRecords(
  csvText: string,
  fileName = 'GoogleSheets_Sync.csv',
  reasonsCatalog: ReasonCatalogItem[] = []
): OvertimeRecord[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('El archivo CSV está vacío.');
  }

  // Parse CSV via SheetJS
  const workbook = XLSX.read(csvText, { type: 'string', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo CSV no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('No se pudo acceder al contenido del archivo CSV.');
  }

  // Convert to 2D array to accurately detect the BioTime header row
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawMatrix.length === 0) {
    throw new Error('El archivo CSV no contiene datos.');
  }

  const headerRowIdx = detectHeaderRowIndex(rawMatrix);

  // Convert using detected header row
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: headerRowIdx,
    defval: '',
  });

  const records: OvertimeRecord[] = [];

  rawRows.forEach((row) => {
    const rawId = findRowValue(
      row,
      [
        'id del empleado',
        'id de empleado',
        'id empleado',
        'no empleado',
        'no. empleado',
        'no de empleado',
        'no. de empleado',
        'id',
        'clave',
        'codigo',
        'código',
        'colaborador id',
      ],
      ['lider']
    );
    const employeeId = String(rawId || '').trim();
    if (!employeeId || employeeId.toLowerCase() === 'total') return; // Skip empty or total rows

    const rawNombre = String(
      findRowValue(row, [
        'nombre del empleado',
        'nombre de empleado',
        'nombre empleado',
        'nombre completo',
        'nombre',
        'nombres',
        'empleado',
        'colaborador',
      ]) || ''
    ).trim();

    const rawApellido = String(
      findRowValue(row, [
        'apellido',
        'apellidos',
        'primer apellido',
        'segundo apellido',
        'apellido paterno',
        'apellido materno',
      ]) || ''
    ).trim();

    let firstName = rawNombre;
    let lastName = rawApellido;

    if (!lastName && firstName.includes(' ')) {
      const split = splitFullName(firstName);
      firstName = split.firstName;
      lastName = split.lastName;
    }

    const employeeName = [firstName, lastName].filter(Boolean).join(' ') || `Empleado ${employeeId}`;

    const rawCompany = String(
      findRowValue(row, ['empresa', 'compania', 'compañia', 'compañía', 'razon social']) || 'Polaquimia'
    ).trim();

    const rawDept = String(
      findRowValue(row, ['departamento', 'depto', 'area', 'área', 'seccion', 'centro de costos'], ['lider']) ||
        'Sin Departamento'
    ).trim();

    const rawLeader = String(
      findRowValue(row, [
        'lider de area',
        'líder de área',
        'lider del area',
        'lider de departamento',
        'lider',
        'líder',
        'supervisor',
        'jefe',
        'jefe inmediato',
        'aprobador',
        'autorizador',
      ]) || 'Sin Líder Asignado'
    ).trim();

    // Work / start dates and times
    const rawStartTimeVal = findRowValue(row, [
      'hora de inicio de t.e.',
      'hora de inicio de te',
      'hora de inicio',
      'hora inicio t.e.',
      'hora inicio te',
      'hora inicio',
      'fecha/hora inicio',
      'fecha inicio',
      'inicio',
      'fecha',
    ]);

    const rawEndTimeVal = findRowValue(row, [
      'hora de fin de t.e.',
      'hora de fin de te',
      'hora de fin',
      'hora fin t.e.',
      'hora fin te',
      'hora fin',
      'fecha/hora fin',
      'fecha fin',
      'fin',
      'termino',
    ]);

    const { dateObj: startObj, formatted: formattedStart } = parseDateTime(rawStartTimeVal);
    const { dateObj: endObj, formatted: formattedEnd } = parseDateTime(rawEndTimeVal);
    const parsedFallbackDate = startObj || parseDateString(rawStartTimeVal);

    // Date strings (YYYY-MM-DD)
    const startDate = parsedFallbackDate ? formatDateISO(parsedFallbackDate) : formatDateISO(new Date());
    const endDate = endObj ? formatDateISO(endObj) : startDate;

    // Time strings (HH:mm:ss)
    const startTime = parseTimeString(formattedStart || rawStartTimeVal) || '00:00:00';
    const endTime = parseTimeString(formattedEnd || rawEndTimeVal) || '00:00:00';

    // Durations
    let requestedHours = 0;
    const rawReqHours = findRowValue(row, [
      'horas solicitadas',
      'horas te',
      'duracion',
      'duración',
      'horas calculadas',
      'horas',
    ]);

    if (rawReqHours !== undefined && rawReqHours !== null && rawReqHours !== '') {
      requestedHours = parseDurationToHours(rawReqHours);
    }
    if (requestedHours <= 0 && startObj && endObj) {
      requestedHours = calculateDurationHours(startObj, endObj);
    }
    if (requestedHours <= 0) {
      requestedHours = calculateOvertimeHours(startDate, startTime, endDate, endTime);
    }

    // Status
    const rawStatusVal = findRowValue(row, [
      'estado de aprobación',
      'estado de aprobacion',
      'estado aprobacion',
      'estado',
      'estatus',
      'status',
      'aprobacion',
    ]);

    const isAnnualSheetRow =
      rawStatusVal === undefined &&
      (findRowValue(row, ['importe', 'tipo de te', 'tipo de t.e.']) !== undefined);

    const normStatus = normalizeApprovalStatus(rawStatusVal);
    const status: OvertimeRecord['status'] =
      isAnnualSheetRow || normStatus === 'Aprobado' ? 'APROBADO' : 'PENDIENTE';

    // Approved & Pending hours
    let approvedHours = 0;
    if (status === 'APROBADO') {
      const rawApprHours = findRowValue(row, ['horas aprobadas', 'horas autorizadas', 'aprobadas']);
      const parsedAppr = parseDurationToHours(rawApprHours);
      approvedHours = parsedAppr > 0 ? parsedAppr : requestedHours;
    }

    const pendingHours = status === 'PENDIENTE' ? requestedHours : 0;

    // Reason
    const rawReason = String(
      findRowValue(row, [
        'motivo de tiempo extra',
        'motivo te',
        'motivo',
        'razon',
        'justificacion',
        'descripcion',
        'comentarios',
        'tipo de te',
      ]) || ''
    ).trim();

    const reasonValidation = validateOvertimeReason(rawReason, reasonsCatalog);

    // ISO Week and Year
    const baseDate = parsedFallbackDate || new Date();
    const { isoYear, isoWeek } = getISOWeekAndYear(baseDate);

    // Business key for anti-duplicate idempotency
    const reasonPart = normalizeText(rawReason).slice(0, 30);
    const businessKey = `${normalizeText(rawCompany)}_${normalizeText(employeeId)}_${startDate}_${startTime.slice(0, 5)}_${endTime.slice(0, 5)}_${requestedHours}_${reasonPart}`;

    const rawTipo = findRowValue(row, [
      'tipo de colaborador',
      'tipo colaborador',
      'tipo',
      'sindicalizado',
      'estatus colaborador',
    ]);
    const isSyndicated = rawTipo
      ? String(rawTipo).toUpperCase().includes('SIND') && !String(rawTipo).toUpperCase().includes('NO')
      : determineSyndicatedStatus(rawCompany, '', rawDept);

    const candidate: OvertimeRecord = {
      id: businessKey,
      employeeId,
      employeeName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      company: rawCompany,
      department: rawDept,
      leader: rawLeader,
      isSyndicated,
      startDate,
      startTime,
      endDate,
      endTime,
      requestedHours,
      approvedHours,
      pendingHours,
      status,
      reason: rawReason,
      reasonNormalized: normalizeText(rawReason),
      reasonClassification: reasonValidation.classification,
      reasonCategory: reasonValidation.category,
      suggestedOfficialReason: reasonValidation.suggestedOfficialReason,
      requestDate: startDate,
      reviewFormatStatus: reasonValidation.classification === 'CORRECTO' ? 'CORRECTO' : 'INCORRECTO',
      isoYear,
      isoWeek,
      dateOnly: startDate,
      sourceFile: fileName,
      updatedAt: new Date().toISOString(),
    };

    const valid = OvertimeRecordSchema.safeParse(candidate);
    if (valid.success) {
      records.push(valid.data);
    } else {
      records.push(candidate);
    }
  });

  return records;
}

/**
 * Detects header row index for the Concentrado Anual Google Sheets CSV
 */
function detectAnnualHeaderRowIndex(rows: unknown[][]): number {
  const keywords = [
    'fecha',
    'id',
    'nombre',
    'departamento',
    'tipo',
    'horas',
    'importe',
    'semana',
    'mes',
    'lider',
  ];

  let bestIndex = 0;
  let maxMatches = -1;
  const maxRowsToCheck = Math.min(rows.length, 15);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const rowText = row.map((cell) => normalizeText(String(cell || ''))).join(' ');
    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) score++;
    }
    if (score > maxMatches && score >= 3) {
      maxMatches = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Parses raw CSV text from the Concentrado Anual Google Sheets export
 * into typed AnnualOvertimeRecord objects.
 */
export function parseCSVToAnnualOvertimeRecords(csvText: string): AnnualOvertimeRecord[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('El archivo CSV está vacío.');
  }

  const workbook = XLSX.read(csvText, { type: 'string', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo CSV no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('No se pudo acceder al contenido del archivo CSV.');
  }

  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawMatrix.length === 0) {
    throw new Error('El archivo CSV no contiene datos.');
  }

  const headerRowIdx = detectAnnualHeaderRowIndex(rawMatrix);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: headerRowIdx,
    defval: '',
  });

  const records: AnnualOvertimeRecord[] = [];

  rawRows.forEach((row, idx) => {
    const rawId = findRowValue(
      row,
      [
        'id',
        'id del empleado',
        'id de empleado',
        'id empleado',
        'no empleado',
        'no. empleado',
        'no de empleado',
        'clave',
        'codigo',
        'código',
      ],
      ['lider']
    );
    const employeeId = String(rawId || '').trim();
    if (!employeeId || employeeId.toLowerCase() === 'total') return;

    const rawName = String(
      findRowValue(row, [
        'nombre del empleado',
        'nombre de empleado',
        'nombre empleado',
        'nombre completo',
        'empleado',
        'colaborador',
        'nombre',
      ]) || ''
    ).trim();

    if (!rawName && !employeeId) return;

    const rawFecha = findRowValue(row, ['fecha', 'date', 'dia', 'día']);
    const parsedDate = parseDateString(rawFecha);
    const fecha = parsedDate ? formatDateISO(parsedDate) : String(rawFecha || '').trim();
    const fechaDisplay = parsedDate
      ? formatDateDDMMYYYY(parsedDate)
      : String(rawFecha || '').trim() || '-';

    const department = String(
      findRowValue(row, ['departamento', 'depto', 'area', 'área', 'seccion'], ['lider']) ||
        'Sin Departamento'
    ).trim();

    const leader = String(
      findRowValue(row, [
        'lider de area',
        'líder de área',
        'lider del area',
        'lider de departamento',
        'lider',
        'líder',
        'supervisor',
        'jefe',
      ]) || 'Sin Líder Asignado'
    ).trim();

    const overtimeType = String(
      findRowValue(
        row,
        ['tipo de te', 'tipo de t.e.', 'tipo te', 'tipo tiempo extra', 'tipo'],
        ['colaborador']
      ) || 'Normal'
    ).trim();

    const rawHours = findRowValue(row, ['horas', 'horas te', 'hrs', 'total horas', 'cantidad horas']);
    const hours = parseDurationToHours(rawHours);

    const rawAmount = findRowValue(row, ['importe', 'monto', 'costo', 'pago', 'total']);
    const amount = parseCurrencyAmount(rawAmount);

    const rawWeek = findRowValue(row, ['semana', 'sem', 'semana iso', 'num semana']);
    const weekNumber = parseWeekNumber(rawWeek, parsedDate);
    const week = `W${String(weekNumber).padStart(2, '0')}`;

    const isoYear = parsedDate ? getISOWeekAndYear(parsedDate).isoYear : new Date().getFullYear();

    const rawMonthNum = findRowValue(row, [
      'mes numero',
      'mes número',
      'num mes',
      'numero mes',
      'mes num',
      'no mes',
    ]);
    const parsedMonthNum = rawMonthNum !== undefined ? parseInt(String(rawMonthNum).replace(/\D/g, ''), 10) : NaN;
    const monthNumber =
      !isNaN(parsedMonthNum) && parsedMonthNum >= 1 && parsedMonthNum <= 12
        ? parsedMonthNum
        : parsedDate
        ? parsedDate.getMonth() + 1
        : 1;

    const rawMonthLetter = String(
      findRowValue(row, ['mes letra', 'nombre mes', 'mes nombre', 'mes'], ['numero', 'num']) || ''
    ).trim();
    const monthName = rawMonthLetter || SPANISH_MONTH_NAMES[monthNumber - 1] || `Mes ${monthNumber}`;

    const rawCompany = findRowValue(row, ['empresa', 'compania', 'compañia', 'compañía', 'razon social']);
    const company = rawCompany ? String(rawCompany).trim() : undefined;

    const rawTipoColab = findRowValue(row, [
      'tipo de colaborador',
      'tipo colaborador',
      'sindicalizado',
      'estatus colaborador',
    ]);
    const isSyndicated =
      rawTipoColab !== undefined
        ? String(rawTipoColab).toUpperCase().includes('SIND') &&
          !String(rawTipoColab).toUpperCase().includes('NO')
        : undefined;

    records.push({
      id: `ann_${fecha || 'nodate'}_${employeeId}_${idx}`,
      fecha,
      fechaDisplay,
      employeeId,
      employeeName: rawName || `Empleado ${employeeId}`,
      department,
      overtimeType,
      hours,
      amount,
      week,
      weekNumber,
      isoYear,
      monthNumber,
      monthName,
      leader,
      ...(isSyndicated !== undefined ? { isSyndicated } : {}),
      ...(company ? { company } : {}),
    });
  });

  return records;
}

/**
 * Detects header row index for the Concentrado de Ausencias Google Sheets CSV
 */
function detectAbsenceHeaderRowIndex(rows: unknown[][]): number {
  const keywords = [
    'id',
    'nombre',
    'puesto',
    'departamento',
    'ausentismo',
    'ausencias',
    'importe',
    'fecha inicial',
    'fecha final',
    'semana',
    'lider',
  ];

  let bestIndex = 0;
  let maxMatches = -1;
  const maxRowsToCheck = Math.min(rows.length, 15);

  for (let i = 0; i < maxRowsToCheck; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const rowText = row.map((cell) => normalizeText(String(cell || ''))).join(' ');
    let score = 0;
    for (const kw of keywords) {
      if (rowText.includes(kw)) score++;
    }
    if (score > maxMatches && score >= 3) {
      maxMatches = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Matches exact normalized column key first (even if cell value is empty),
 * preventing collisions between similar column names like "Tipo de ausentismo" and "Tipo Ausentismo".
 */
function findExactOrAliasRowValue(
  row: Record<string, unknown>,
  exactNames: string[],
  fallbackAliases: string[] = [],
  excludeSubstrings: string[] = []
): unknown {
  const entries = Object.entries(row);

  for (const exact of exactNames) {
    const normExact = normalizeText(exact);
    const match = entries.find(([key]) => normalizeText(key) === normExact);
    if (match) {
      return match[1];
    }
  }

  if (fallbackAliases.length > 0) {
    return findRowValue(row, fallbackAliases, excludeSubstrings);
  }

  return undefined;
}

/**
 * Parses numeric absence day/incident count safely
 */
function parseAbsenceCount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) || val < 0 ? 0 : Math.round(val * 100) / 100;
  }
  const str = String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '').trim();
  if (!str) return 0;
  const parsed = parseFloat(str);
  return isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100) / 100;
}

/**
 * Parses raw CSV text from the Concentrado de Ausencias Google Sheets export
 * into typed AbsenceRecord objects (12 source columns + normalized metadata).
 */
export function parseCSVToAbsenceRecords(csvText: string): AbsenceRecord[] {
  if (!csvText || !csvText.trim()) {
    throw new Error('El archivo CSV de ausentismo está vacío.');
  }

  // Keep raw: true so DD/MM/YYYY dates are preserved as strings and parsed with Mexican date order
  const workbook = XLSX.read(csvText, { type: 'string', raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('El archivo CSV de ausentismo no contiene hojas de cálculo legibles.');
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error('No se pudo acceder al contenido del archivo CSV de ausentismo.');
  }

  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawMatrix.length === 0) {
    throw new Error('El archivo CSV de ausentismo no contiene datos.');
  }

  const headerRowIdx = detectAbsenceHeaderRowIndex(rawMatrix);
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: headerRowIdx,
    defval: '',
  });

  const records: AbsenceRecord[] = [];

  rawRows.forEach((row, idx) => {
    const rawId = findExactOrAliasRowValue(
      row,
      ['id'],
      [
        'id del empleado',
        'id de empleado',
        'id empleado',
        'no empleado',
        'no. empleado',
        'clave',
        'codigo',
        'código',
      ],
      ['lider']
    );
    const employeeId = String(rawId || '').trim();
    const idNorm = employeeId.toLowerCase();
    if (!employeeId || idNorm === 'total' || idNorm === 'totales' || idNorm.includes('gran total')) {
      return;
    }

    const rawName = String(
      findExactOrAliasRowValue(row, ['nombre'], [
        'nombre del empleado',
        'nombre de empleado',
        'nombre empleado',
        'nombre completo',
        'empleado',
        'colaborador',
      ]) || ''
    ).trim();

    if (!rawName && !employeeId) return;

    const position = String(
      findExactOrAliasRowValue(row, ['puesto'], ['puesto', 'cargo', 'posicion', 'posición', 'categoria']) ||
        'Sin Puesto'
    ).trim();

    const department = String(
      findExactOrAliasRowValue(row, ['departamento'], ['depto', 'area', 'área', 'seccion'], ['lider']) ||
        'Sin Departamento'
    ).trim();

    const absenceType = String(
      findExactOrAliasRowValue(
        row,
        ['tipo de ausentismo'],
        ['tipo de ausencia', 'motivo ausentismo', 'causa ausentismo']
      ) || 'Sin Especificar'
    ).trim();

    const absenceCategory = String(
      findExactOrAliasRowValue(
        row,
        ['tipo ausentismo'],
        ['clasificacion ausentismo', 'categoria ausentismo'],
        ['tipo de ausentismo']
      ) || ''
    ).trim();

    const rawAbsences = findExactOrAliasRowValue(
      row,
      ['ausencias'],
      ['dias ausentes', 'días ausentes', 'dias', 'días', 'faltas', 'incidencias']
    );
    const absences = parseAbsenceCount(rawAbsences);

    const rawAmount = findExactOrAliasRowValue(row, ['importe'], ['monto', 'costo', 'pago', 'total']);
    const amount = parseCurrencyAmount(rawAmount);

    const rawStartDate = findExactOrAliasRowValue(
      row,
      ['fecha inicial'],
      ['fecha inicio', 'inicio', 'fecha de inicio', 'fecha']
    );
    const parsedStart = parseDateString(rawStartDate);
    const startDate = parsedStart ? formatDateISO(parsedStart) : String(rawStartDate || '').trim();
    const startDateDisplay = parsedStart
      ? formatDateDDMMYYYY(parsedStart)
      : String(rawStartDate || '').trim() || '-';

    const rawEndDate = findExactOrAliasRowValue(
      row,
      ['fecha final'],
      ['fecha fin', 'fin', 'fecha termino', 'fecha término']
    );
    const parsedEnd = parseDateString(rawEndDate) || parsedStart;
    const endDate = parsedEnd ? formatDateISO(parsedEnd) : startDate;
    const endDateDisplay = parsedEnd
      ? formatDateDDMMYYYY(parsedEnd)
      : String(rawEndDate || '').trim() || startDateDisplay;

    const rawWeek = findExactOrAliasRowValue(row, ['semana'], ['sem', 'semana iso', 'num semana']);
    const fallbackWeekDate = parsedStart || parsedEnd;
    const weekNumber = parseWeekNumber(rawWeek, fallbackWeekDate);
    const week = `W${String(weekNumber).padStart(2, '0')}`;
    const isoYear = fallbackWeekDate
      ? getISOWeekAndYear(fallbackWeekDate).isoYear
      : new Date().getFullYear();

    const leader = String(
      findExactOrAliasRowValue(row, ['líder de área', 'lider de area'], [
        'lider del area',
        'lider de departamento',
        'lider',
        'líder',
        'supervisor',
        'jefe',
      ]) || 'Sin Líder Asignado'
    ).trim();

    const rawCompany = findRowValue(row, ['empresa', 'compania', 'compañia', 'compañía', 'razon social']);
    const company = rawCompany ? String(rawCompany).trim() : undefined;

    const rawTipoColab = findRowValue(row, [
      'tipo de colaborador',
      'tipo colaborador',
      'sindicalizado',
      'estatus colaborador',
    ]);
    const isSyndicated =
      rawTipoColab !== undefined
        ? String(rawTipoColab).toUpperCase().includes('SIND') &&
          !String(rawTipoColab).toUpperCase().includes('NO')
        : undefined;

    const candidate: AbsenceRecord = {
      id: `abs_${startDate || 'nodate'}_${employeeId}_${idx}`,
      employeeId,
      employeeName: rawName || `Empleado ${employeeId}`,
      position,
      department,
      absenceType,
      absenceCategory,
      absences,
      amount,
      startDate,
      startDateDisplay,
      endDate,
      endDateDisplay,
      week,
      weekNumber,
      isoYear,
      leader,
      ...(isSyndicated !== undefined ? { isSyndicated } : {}),
      ...(company ? { company } : {}),
    };

    const valid = AbsenceRecordSchema.safeParse(candidate);
    if (valid.success) {
      records.push(valid.data);
    } else {
      records.push(candidate);
    }
  });

  return records;
}

/**
 * Downloads raw CSV text from the remote Google Sheets URL
 */
export async function fetchRemoteCSVText(
  url?: string
): Promise<{ csvText: string; targetUrl: string }> {
  const targetUrl = getEffectiveCloudSyncUrl(url);

  if (!targetUrl || (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://'))) {
    throw new Error('No se ha configurado ninguna URL remota válida (HTTP/HTTPS) para la sincronización.');
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/csv, text/plain, */*',
      },
      cache: 'no-cache',
    });
  } catch (netErr) {
    throw new Error(
      `Error de red o CORS al intentar conectar con la hoja en la nube: ${
        netErr instanceof Error ? netErr.message : String(netErr)
      }`
    );
  }

  if (!response.ok) {
    throw new Error(
      `El servidor remoto respondió con estado HTTP ${response.status} (${response.statusText || 'Error'}). Verifique que la hoja esté publicada en la web.`
    );
  }

  const csvText = await response.text();

  // Guard against HTML error pages returned with 200 OK
  if (csvText.trim().startsWith('<!DOCTYPE html') || csvText.trim().startsWith('<html')) {
    throw new Error(
      'La URL remota devolvió una página web HTML en lugar de datos CSV. Verifique que la hoja esté publicada con formato CSV (Archivo > Compartir > Publicar en la web > Valores separados por comas .csv).'
    );
  }

  return { csvText, targetUrl };
}

/**
 * Downloads and parses remote Overtime data from the specified or configured URL
 */
export async function fetchRemoteOvertimeData(
  url?: string,
  reasonsCatalog: ReasonCatalogItem[] = []
): Promise<OvertimeRecord[]> {
  const { csvText } = await fetchRemoteCSVText(url);

  const records = parseCSVToOvertimeRecords(csvText, 'GoogleSheets_BioTime_TE.csv', reasonsCatalog);

  if (records.length === 0) {
    throw new Error(
      'La hoja remota fue descargada pero no se encontraron filas de Tiempo Extra válidas. Verifique los encabezados de columna.'
    );
  }

  return records;
}

/**
 * Downloads and parses Concentrado Anual data from Google Sheets
 */
export async function fetchRemoteAnnualOvertimeData(url?: string): Promise<AnnualOvertimeRecord[]> {
  const { csvText } = await fetchRemoteCSVText(url);
  const records = parseCSVToAnnualOvertimeRecords(csvText);

  if (records.length === 0) {
    throw new Error(
      'La hoja remota fue descargada pero no se encontraron filas válidas para el Concentrado Anual.'
    );
  }

  return records;
}

/**
 * Downloads and parses Concentrado de Ausencias (AUSENTISMO) data from Google Sheets
 */
export async function fetchRemoteAbsenceData(url?: string): Promise<AbsenceRecord[]> {
  const resolvedUrl = getEffectiveAbsenceCloudSyncUrl(url);
  const { csvText } = await fetchRemoteCSVText(resolvedUrl);
  const records = parseCSVToAbsenceRecords(csvText);

  if (records.length === 0) {
    throw new Error(
      'La hoja remota de Ausentismo fue descargada pero no se encontraron registros válidos. Verifique los encabezados de columna.'
    );
  }

  return records;
}

export interface SyncResult {
  success: boolean;
  records: OvertimeRecord[];
  newCount: number;
  updatedCount: number;
  ignoredCount: number;
  syncTime: string;
  sourceUrl: string;
}

export interface FullCloudSyncResult extends SyncResult {
  annualRecords: AnnualOvertimeRecord[];
}

export interface AbsenceSyncResult {
  success: boolean;
  absenceRecords: AbsenceRecord[];
  syncTime: string;
  sourceUrl: string;
}

/**
 * Full synchronization pipeline:
 * 1. Downloads and parses data from cloud URL
 * 2. Persists records and upserts the single fixed CLOUD_BATCH_ID batch in IndexedDB
 * 3. Saves last sync timestamp
 */
export async function syncRemoteOvertime(
  url?: string,
  reasonsCatalog: ReasonCatalogItem[] = []
): Promise<SyncResult> {
  const targetUrl = getEffectiveCloudSyncUrl(url);
  const records = await fetchRemoteOvertimeData(targetUrl, reasonsCatalog);

  const syncTime = new Date().toISOString();

  // Save records and upsert single fixed cloud batch in IndexedDB
  const { newCount, updatedCount, ignoredCount } = await AppStorage.upsertCloudOvertimeBatch(
    records,
    syncTime
  );

  // Persist last sync timestamp
  setLastSyncTimestamp(syncTime);
  await AppStorage.saveLastSyncTimestamp(syncTime);

  return {
    success: true,
    records,
    newCount,
    updatedCount,
    ignoredCount,
    syncTime,
    sourceUrl: targetUrl,
  };
}

/**
 * Downloads the Google Sheets CSV once and synchronizes both Concentrado Anual records
 * and OvertimeRecord summaries in IndexedDB.
 */
export async function syncRemoteAll(
  url?: string,
  reasonsCatalog: ReasonCatalogItem[] = []
): Promise<FullCloudSyncResult> {
  const { csvText, targetUrl } = await fetchRemoteCSVText(url);

  const annualRecords = parseCSVToAnnualOvertimeRecords(csvText);
  const records = parseCSVToOvertimeRecords(csvText, 'GoogleSheets_BioTime_TE.csv', reasonsCatalog);

  if (annualRecords.length === 0 && records.length === 0) {
    throw new Error(
      'La hoja remota fue descargada pero no se encontraron registros válidos. Verifique los encabezados de columna.'
    );
  }

  const syncTime = new Date().toISOString();

  await AppStorage.saveAnnualOvertimeRecords(annualRecords);

  let newCount = 0;
  let updatedCount = 0;
  let ignoredCount = 0;

  if (records.length > 0) {
    const upsertRes = await AppStorage.upsertCloudOvertimeBatch(records, syncTime);
    newCount = upsertRes.newCount;
    updatedCount = upsertRes.updatedCount;
    ignoredCount = upsertRes.ignoredCount;
  }

  setLastSyncTimestamp(syncTime);
  await AppStorage.saveLastSyncTimestamp(syncTime);

  return {
    success: true,
    records,
    annualRecords,
    newCount,
    updatedCount,
    ignoredCount,
    syncTime,
    sourceUrl: targetUrl,
  };
}

/**
 * Downloads and persists the Concentrado de Ausencias (AUSENTISMO) from Google Sheets
 */
export async function syncRemoteAbsences(url?: string): Promise<AbsenceSyncResult> {
  const targetUrl = getEffectiveAbsenceCloudSyncUrl(url);
  const { csvText } = await fetchRemoteCSVText(targetUrl);
  const absenceRecords = parseCSVToAbsenceRecords(csvText);

  if (absenceRecords.length === 0) {
    throw new Error(
      'La hoja remota de Ausentismo fue descargada pero no se encontraron registros válidos. Verifique los encabezados de columna.'
    );
  }

  const syncTime = new Date().toISOString();
  await AppStorage.saveAbsenceRecords(absenceRecords);
  setLastSyncTimestamp(syncTime);
  await AppStorage.saveLastSyncTimestamp(syncTime);

  return {
    success: true,
    absenceRecords,
    syncTime,
    sourceUrl: targetUrl,
  };
}

/**
 * Tests connection to the remote Ausentismo Sheets CSV URL without altering the database
 */
export async function testRemoteAbsenceConnection(
  url?: string
): Promise<{ success: boolean; rowCount?: number; preview?: AbsenceRecord[]; message: string }> {
  try {
    const targetUrl = getEffectiveAbsenceCloudSyncUrl(url);
    const records = await fetchRemoteAbsenceData(targetUrl);
    return {
      success: true,
      rowCount: records.length,
      preview: records.slice(0, 3),
      message: `Conexión exitosa (Ausentismo). Se leyeron ${records.length} registros válidos desde Google Sheets.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tests connection to the remote Sheets CSV URL without altering the database
 */
export async function testRemoteConnection(
  url?: string
): Promise<{ success: boolean; rowCount?: number; preview?: OvertimeRecord[]; message: string }> {
  try {
    const targetUrl = getEffectiveCloudSyncUrl(url);
    const records = await fetchRemoteOvertimeData(targetUrl);
    return {
      success: true,
      rowCount: records.length,
      preview: records.slice(0, 3),
      message: `Conexión exitosa. Se leyeron ${records.length} registros válidos desde la hoja en la nube.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface MatrizSyncResult {
  success: boolean;
  records: WeeklyMatrixRecord[];
  overtimeRecords: OvertimeRecord[];
  sheetCount: number;
  activeEmployees: number;
  totalNormales: number;
  totalProlongacion: number;
  totalHoras: number;
  mismatchCount: number;
  syncTime: string;
  sourceUrl: string;
}

/**
 * Descarga el archivo Excel binario de la Matriz Semanal desde Google Sheets y retorna el libro SheetJS con cellStyles: true
 */
export async function fetchRemoteMatrizWorkbook(
  url?: string
): Promise<{ workbook: XLSX.WorkBook; targetUrl: string }> {
  const targetUrl = getEffectiveMatrizCloudSyncUrl(url);
  if (!targetUrl || (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://'))) {
    throw new Error('No se ha configurado ninguna URL remota válida (HTTP/HTTPS) para la Matriz Semanal.');
  }
  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(
      `Error de red al descargar la Matriz Semanal (${response.status}: ${response.statusText}). Verifique la URL pública.`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
  return { workbook, targetUrl };
}

/**
 * Sincronización completa de la Matriz Semanal de Tiempo Extra y Prolongación de Jornada:
 * 1. Descarga el libro Excel binario desde Google Sheets con estilos habilitados.
 * 2. Procesa todas las pestañas con desglose celda por celda de Horas Normales y Prolongación.
 * 3. Guarda el lote bajo el identificador fijo CLOUD_BATCH_ID = 'BATCH_CLOUD_MATRIZ_TE' sin duplicar historial.
 * 4. Actualiza la fecha/hora de última sincronización.
 */
export async function syncRemoteMatriz(url?: string): Promise<MatrizSyncResult> {
  const { workbook, targetUrl } = await fetchRemoteMatrizWorkbook(url);
  const baseTeRecords = await AppStorage.getAnnualOvertimeRecords().catch(() => []);
  const { records, overtimeRecords, stats } = parseWeeklyMatrixWorkbook(
    workbook,
    "Google Sheets (Nube) + 'Registro_Prolongacion.xlsx'",
    baseTeRecords
  );

  if (records.length === 0) {
    throw new Error(
      'La Matriz Semanal fue descargada pero no se encontraron registros válidos de colaboradores activos. Verifique la estructura de las hojas.'
    );
  }

  const syncTime = new Date().toISOString();

  // Guardar registros y upsert del lote fijo CLOUD_MATRIZ_BATCH_ID ('BATCH_CLOUD_MATRIZ_TE')
  await AppStorage.upsertWeeklyMatrixBatch(records, overtimeRecords, syncTime);

  setLastSyncTimestamp(syncTime);
  await AppStorage.saveLastSyncTimestamp(syncTime);

  return {
    success: true,
    records,
    overtimeRecords,
    sheetCount: stats.sheetCount,
    activeEmployees: stats.activeEmployees,
    totalNormales: stats.totalNormales,
    totalProlongacion: stats.totalProlongacion,
    totalHoras: stats.totalHoras,
    mismatchCount: stats.mismatchCount,
    syncTime,
    sourceUrl: targetUrl,
  };
}

/**
 * Prueba la conexión con la URL de la Matriz Semanal (Registro_Prolongacion.xlsx) sin alterar la base de datos
 */
export async function testRemoteMatrizConnection(
  url?: string
): Promise<{
  success: boolean;
  sheetCount?: number;
  rowCount?: number;
  totalNormales?: number;
  totalProlongacion?: number;
  preview?: WeeklyMatrixRecord[];
  message: string;
}> {
  try {
    const { workbook } = await fetchRemoteMatrizWorkbook(url);
    const baseTeRecords = await AppStorage.getAnnualOvertimeRecords().catch(() => []);
    const { records, stats } = parseWeeklyMatrixWorkbook(workbook, undefined, baseTeRecords);

    return {
      success: true,
      sheetCount: stats.sheetCount,
      rowCount: records.length,
      totalNormales: stats.totalNormales,
      totalProlongacion: stats.totalProlongacion,
      preview: records.slice(0, 3),
      message: `Conexión exitosa. Se procesaron ${stats.sheetCount} semanas y ${records.length} registros (${stats.totalNormales} hrs TE Normal / ${stats.totalProlongacion} hrs Prolongación).`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}


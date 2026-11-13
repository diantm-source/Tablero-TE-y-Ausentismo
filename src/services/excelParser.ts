import ExcelJS from 'exceljs';
import {
  AttendanceRecord,
  AuditIncident,
  OvertimeRecord,
  ReasonCatalogItem,
} from '../types';
import {
  calculateOvertimeHours,
  determineSyndicatedStatus,
  evaluateAttendance,
  formatDateISO,
  getISOWeekAndYear,
  normalizeText,
  parseDateString,
  parseDurationToHours,
  parseTimeString,
  validateOvertimeReason,
} from './businessRules';
import {
  OvertimeRecordSchema,
  AttendanceRecordSchema,
} from '../schemas';
import { parseCSVToOvertimeRecords } from './cloudSync';

export interface ParseResult<T> {
  fileType: 'overtime' | 'attendance' | 'reasons_catalog' | 'unknown';
  detectedHeaderRow: number;
  sheetName: string;
  totalRowsRead: number;
  records: T[];
  incidents: AuditIncident[];
  dateRange: { start: string; end: string } | null;
  columnsFound: string[];
}

/**
 * Safely extracts raw value from ExcelJS cell (handles primitives, formulas, richText, hyperLinks)
 */
function extractCellValue(cellValue: ExcelJS.CellValue): unknown {
  if (cellValue === null || cellValue === undefined) return '';
  if (cellValue instanceof Date) return cellValue;
  if (typeof cellValue === 'object') {
    const obj = cellValue as unknown as Record<string, unknown>;
    if ('result' in obj && obj.result !== undefined) {
      return obj.result;
    }
    if ('text' in obj && typeof obj.text === 'string') {
      return obj.text;
    }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((t) => t.text).join('');
    }
  }
  return cellValue;
}

/**
 * Searches the first 8 rows of a worksheet to locate the real BioTime header row.
 */
function findHeaderRowExcelJS(worksheet: ExcelJS.Worksheet): { rowIndex: number; headers: string[] } {
  let bestRow = 3; // Default BioTime header row (1-indexed)
  let maxScore = -1;
  let bestHeaders: string[] = [];

  const knownHeaderKeywords = [
    'id',
    'empleado',
    'nombre',
    'apellido',
    'departamento',
    'compania',
    'empresa',
    'horario',
    'entrada',
    'salida',
    'excepcion',
    'fecha',
    'motivo',
    'estado',
    'solicitud',
    'aprob',
    'horas',
  ];

  const maxRowToCheck = Math.min(worksheet.rowCount, 8);

  for (let r = 1; r <= maxRowToCheck; r++) {
    const row = worksheet.getRow(r);
    const rowValues: string[] = [];
    let score = 0;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const val = String(extractCellValue(cell.value) || '').trim();
      if (val) {
        rowValues.push(val);
        const norm = normalizeText(val);
        for (const kw of knownHeaderKeywords) {
          if (norm.includes(kw)) {
            score++;
            break;
          }
        }
      }
    });

    if (score > maxScore && score >= 2) {
      maxScore = score;
      bestRow = r;
      bestHeaders = rowValues;
    }
  }

  return { rowIndex: bestRow, headers: bestHeaders };
}

/**
 * Determines file type by analyzing header names
 */
function detectReportType(headers: string[]): 'overtime' | 'attendance' | 'reasons_catalog' | 'unknown' {
  const allHeadersStr = headers.map(normalizeText).join(' ');

  if (allHeadersStr.includes('motivo oficial') || allHeadersStr.includes('categoria motivo')) {
    return 'reasons_catalog';
  }

  const overtimeKeywords = [
    'horas solicitadas',
    'horas aprobadas',
    'horas autorizadas',
    'horas calculadas',
    'horas te',
    'horas de te',
    'horas',
    'duracion',
    'duración',
    'motivo',
    'hora inicio',
    'hora fin',
    'aprobado',
    'tiempo extra',
    'tiempo extraordinario',
    'solicitud',
  ];
  const attendanceKeywords = [
    'horario',
    'entrada',
    'salida',
    'excepcion',
    'asistencia',
    'primer marcaje',
    'ultimo marcaje',
  ];

  let otScore = 0;
  for (const kw of overtimeKeywords) {
    if (allHeadersStr.includes(kw)) otScore += 2;
  }

  let attScore = 0;
  for (const kw of attendanceKeywords) {
    if (allHeadersStr.includes(kw)) attScore += 2;
  }

  if (otScore > attScore && otScore >= 2) return 'overtime';
  if (attScore > otScore && attScore >= 2) return 'attendance';
  if (attScore >= 2) return 'attendance';
  if (otScore >= 2) return 'overtime';

  return 'unknown';
}

/**
 * Finds matching column value from a row object using multiple synonymous keys,
 * with optional exclusions to prevent false positive substring matches.
 */
function getColumnValue(
  row: Record<string, unknown>,
  synonyms: string[],
  excludeSubstrings: string[] = []
): unknown {
  const keys = Object.keys(row);
  const filteredKeys =
    excludeSubstrings.length > 0
      ? keys.filter((k) => {
          const norm = normalizeText(k);
          return !excludeSubstrings.some((ex) => norm.includes(normalizeText(ex)));
        })
      : keys;

  // 1. First priority: exact normalized match
  for (const syn of synonyms) {
    const synNorm = normalizeText(syn);
    for (const key of filteredKeys) {
      const keyNorm = normalizeText(key);
      if (keyNorm === synNorm) {
        if (row[key] !== undefined && row[key] !== null) {
          return row[key];
        }
      }
    }
  }

  // 2. Second priority: substring inclusion (only if no exact match was found)
  for (const syn of synonyms) {
    const synNorm = normalizeText(syn);
    for (const key of filteredKeys) {
      const keyNorm = normalizeText(key);
      if (keyNorm.includes(synNorm)) {
        if (row[key] !== undefined && row[key] !== null) {
          return row[key];
        }
      }
    }
  }
  return undefined;
}

/**
 * Convert ExcelJS worksheet into row dictionaries using detected header row
 */
function worksheetToRowObjects(
  worksheet: ExcelJS.Worksheet,
  headerRowIndex: number
): { rows: Record<string, unknown>[]; headers: string[] } {
  const headerRow = worksheet.getRow(headerRowIndex);
  const columnMap = new Map<number, string>();
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = String(extractCellValue(cell.value) || '').trim();
    if (val) {
      columnMap.set(colNumber, val);
      headers.push(val);
    }
  });

  const rows: Record<string, unknown>[] = [];

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const rowObj: Record<string, unknown> = {};
    let hasAnyData = false;

    columnMap.forEach((headerName, colNumber) => {
      const cell = row.getCell(colNumber);
      const val = extractCellValue(cell.value);
      if (val !== '' && val !== null && val !== undefined) {
        hasAnyData = true;
      }
      rowObj[headerName] = val;
    });

    if (hasAnyData) {
      rows.push(rowObj);
    }
  }

  return { rows, headers };
}

/**
 * Parse Overtime BioTime report using ExcelJS
 */
export function parseOvertimeWorksheet(
  worksheet: ExcelJS.Worksheet,
  fileName: string,
  reasonsCatalog: ReasonCatalogItem[]
): ParseResult<OvertimeRecord> {
  const { rowIndex: headerRowIndex } = findHeaderRowExcelJS(worksheet);
  const { rows: rawRows, headers } = worksheetToRowObjects(worksheet, headerRowIndex);

  const records: OvertimeRecord[] = [];
  const incidents: AuditIncident[] = [];
  let minDate = '';
  let maxDate = '';

  rawRows.forEach((row, idx) => {
    const lineNum = headerRowIndex + 1 + idx;

    const rawEmpId = String(
      getColumnValue(row, [
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
        'codigo de empleado',
        'código de empleado',
        'id colaborador',
        'no colaborador',
      ]) || ''
    ).trim();
    const rawEmpName = String(
      getColumnValue(row, [
        'nombre completo',
        'nombre y apellido',
        'nombre de empleado',
        'nombre empleado',
        'nombre',
        'empleado',
        'colaborador',
      ]) || ''
    ).trim();
    const rawEmpLastName = String(
      getColumnValue(row, [
        'apellido',
        'apellidos',
        'primer apellido',
        'segundo apellido',
        'apellido paterno',
      ]) || ''
    ).trim();
    const combinedEmpName =
      rawEmpLastName && !rawEmpName.toLowerCase().includes(rawEmpLastName.toLowerCase())
        ? `${rawEmpName} ${rawEmpLastName}`.trim()
        : rawEmpName;

    const rawCompany = String(
      getColumnValue(row, [
        'empresa',
        'compania',
        'compañia',
        'compañía',
        'razon social',
        'razón social',
      ]) || 'Polaquimia'
    ).trim();
    const rawDept = String(
      getColumnValue(row, [
        'departamento',
        'area',
        'área',
        'seccion',
        'sección',
        'centro de costos',
      ]) || 'Sin Departamento'
    ).trim();
    const rawLeader = String(
      getColumnValue(row, [
        'lider',
        'líder',
        'supervisor',
        'jefe',
        'jefe inmediato',
        'aprobador',
        'autorizador',
        'responsable',
      ]) || ''
    ).trim();

    // Request / Folio ID if provided by BioTime export
    const rawRequestId = getColumnValue(row, [
      'id de solicitud',
      'id solicitud',
      'no. de solicitud',
      'no. solicitud',
      'no de solicitud',
      'no solicitud',
      'folio',
      'id transaccion',
      'transaccion',
      'id registro',
      'consecutivo',
      'id te',
    ]);

    // Dates and times
    // 1. Prioritize explicit work date columns (where overtime was worked)
    // Exclude request/creation/end columns to prevent false positive substring matching with "fecha"
    const rawWorkDate = getColumnValue(
      row,
      [
        'fecha inicio',
        'fecha de inicio',
        'fecha inicial',
        'fecha/hora inicio',
        'fecha/hora de inicio',
        'fecha y hora inicio',
        'fecha del te',
        'fecha de te',
        'fecha te',
        'fecha tiempo extra',
        'fecha de tiempo extra',
        'fecha de aplicacion',
        'fecha aplicacion',
        'fecha de trabajo',
        'fecha trabajo',
        'fecha marcaje',
        'fecha evento',
        'fecha',
        'desde',
        'dia',
        'día',
        'date',
      ],
      ['solicitud', 'registro', 'creacion', 'autorizacion', 'fin', 'termino', 'salida']
    );

    // 2. Start time column (in BioTime, "Hora Inicio" often contains the full datetime: "31/08/2026 18:00:00")
    const rawStartTime = getColumnValue(
      row,
      [
        'hora inicio',
        'hora de inicio',
        'hora inicial',
        'tiempo inicial',
        'tiempo inicio',
        'fecha/hora inicio',
        'fecha y hora inicio',
        'inicio',
        'hora entrada',
        'entrada',
        'hora de entrada',
        'hora desde',
        'primer marcaje',
      ],
      ['solicitud', 'fin', 'termino', 'salida']
    );

    // 3. End date and time columns
    const rawWorkEndDate = getColumnValue(
      row,
      [
        'fecha fin',
        'fecha de fin',
        'fecha final',
        'fecha finalizacion',
        'fecha de finalizacion',
        'fecha termino',
        'fecha de termino',
        'fecha/hora fin',
        'fecha y hora fin',
        'hasta',
      ],
      ['solicitud', 'registro', 'creacion', 'inicio']
    );

    const rawEndTime = getColumnValue(row, [
      'hora fin',
      'hora de fin',
      'hora de finalizacion',
      'hora final',
      'tiempo final',
      'tiempo fin',
      'fecha/hora fin',
      'fecha y hora fin',
      'fin',
      'termino',
      'hora salida',
      'salida',
      'hora de salida',
      'hora hasta',
      'ultimo marcaje',
    ]);

    // 4. Request / Registration date (when the request was created in BioTime)
    const rawRequestDate = getColumnValue(row, [
      'fecha solicitud',
      'fecha de solicitud',
      'fecha registro',
      'fecha de registro',
      'fecha creacion',
      'fecha de creacion',
      'fecha autorizacion',
      'fecha de autorizacion',
    ]);

    // Determine actual overtime start date:
    // a) From explicit work date column
    let startDateObj = parseDateString(rawWorkDate);
    // b) If not found or if rawWorkDate was only a time, extract date from rawStartTime
    if (!startDateObj && rawStartTime) {
      startDateObj = parseDateString(rawStartTime);
    }
    // c) Fallback to rawRequestDate ONLY if no other date was found
    if (!startDateObj && rawRequestDate) {
      startDateObj = parseDateString(rawRequestDate);
    }

    let endDateObj = parseDateString(rawWorkEndDate);
    if (!endDateObj && rawEndTime) {
      endDateObj = parseDateString(rawEndTime);
    }
    if (!endDateObj) {
      endDateObj = startDateObj;
    }

    const startDate = startDateObj ? formatDateISO(startDateObj) : '';
    const endDate = endDateObj ? formatDateISO(endDateObj) : startDate;

    const startTime = parseTimeString(rawStartTime);
    const endTime = parseTimeString(rawEndTime);

    const reqDateObj = parseDateString(rawRequestDate) || startDateObj;
    const requestDate = reqDateObj ? formatDateISO(reqDateObj) : startDate;

    if (startDate) {
      if (!minDate || startDate < minDate) minDate = startDate;
      if (!maxDate || startDate > maxDate) maxDate = startDate;
    }

    // Status
    const rawStatus = String(
      getColumnValue(row, [
        'estado de aprobacion',
        'estado aprobacion',
        'estado',
        'estatus',
        'aprobacion',
        'status',
        'autorizacion',
        'situacion',
      ]) || 'PENDIENTE'
    )
      .trim()
      .toUpperCase();

    let status: OvertimeRecord['status'] = 'PENDIENTE';
    if (
      rawStatus.includes('APROB') ||
      rawStatus.includes('AUTORIZ') ||
      rawStatus.includes('ACEPT') ||
      rawStatus.includes('VALID') ||
      rawStatus.includes('PAGAD') ||
      rawStatus === 'SI' ||
      rawStatus === '1'
    ) {
      status = 'APROBADO';
    } else if (
      rawStatus.includes('RECHAZ') ||
      rawStatus.includes('DENEG') ||
      rawStatus === 'NO' ||
      rawStatus === '0'
    ) {
      status = 'RECHAZADO';
    } else if (rawStatus.includes('CANCEL')) {
      status = 'CANCELADO';
    }

    // Hours
    const rawReqHours = getColumnValue(row, [
      'horas solicitadas',
      'horas te',
      'horas tiempo extra',
      'horas autorizadas',
      'horas calculadas',
      'horas de te',
      'horas',
      'duracion',
      'duración',
      'tiempo extra',
      'total te',
      'hrs',
    ]);
    let requestedHours = parseDurationToHours(rawReqHours);
    if (requestedHours <= 0) {
      requestedHours = calculateOvertimeHours(startDate, startTime, endDate, endTime);
    }

    const rawApprHours = getColumnValue(row, [
      'horas aprobadas',
      'horas te aprobadas',
      'aprobadas',
      'horas autorizadas',
      'autorizadas',
    ]);
    let approvedHours = parseDurationToHours(rawApprHours);
    if (status === 'APROBADO') {
      if (approvedHours <= 0) {
        approvedHours = requestedHours;
      }
    } else {
      approvedHours = 0;
    }

    const pendingHours = status === 'PENDIENTE' ? requestedHours : 0;

    // Reason
    const rawReason = String(
      getColumnValue(row, [
        'motivo de tiempo extra',
        'motivo te',
        'motivo',
        'razon',
        'justificacion',
        'descripcion',
        'comentarios',
        'observaciones',
      ]) || ''
    ).trim();
    const reasonValidation = validateOvertimeReason(rawReason, reasonsCatalog);

    // ISO Week and Year
    const baseDate = startDateObj || new Date();
    const { isoYear, isoWeek } = getISOWeekAndYear(baseDate);

    // Business key for anti-duplicate idempotency
    let businessKey = '';
    if (rawRequestId !== undefined && String(rawRequestId).trim() !== '') {
      businessKey = `${normalizeText(rawCompany)}_${normalizeText(rawEmpId)}_${normalizeText(String(rawRequestId))}`;
    } else {
      const reasonPart = normalizeText(rawReason).slice(0, 30);
      businessKey = `${normalizeText(rawCompany)}_${normalizeText(rawEmpId)}_${startDate}_${startTime || '00:00'}_${endTime || '00:00'}_${requestedHours}_${reasonPart}`;
    }

    // Audit validations
    if (!rawEmpId) {
      incidents.push({
        id: `aud_ot_${lineNum}_1`,
        type: 'EMPTY_ID',
        severity: 'alta',
        recordType: 'overtime',
        sourceFile: fileName,
        employeeName: combinedEmpName,
        department: rawDept,
        date: startDate,
        message: `Fila ${lineNum}: ID de colaborador vacío o inválido`,
        detectedAt: new Date().toISOString(),
      });
    }

    if (!startDate || !startTime || !endTime) {
      incidents.push({
        id: `aud_ot_${lineNum}_2`,
        type: 'INCONSISTENT_HOURS',
        severity: 'alta',
        recordType: 'overtime',
        sourceFile: fileName,
        employeeId: rawEmpId,
        date: startDate,
        message: `Fila ${lineNum}: Horarios incompletos (Inicio: "${startTime}", Fin: "${endTime}")`,
        detectedAt: new Date().toISOString(),
      });
    }

    if (requestedHours <= 0) {
      incidents.push({
        id: `aud_ot_${lineNum}_3`,
        type: 'NEGATIVE_DURATION',
        severity: 'media',
        recordType: 'overtime',
        sourceFile: fileName,
        employeeId: rawEmpId,
        date: startDate,
        message: `Fila ${lineNum}: Duración de tiempo extra menor o igual a cero`,
        detectedAt: new Date().toISOString(),
      });
    }

    if (
      reasonValidation.classification === 'NO_RECONOCIDO' ||
      reasonValidation.classification === 'POSIBLE_ERROR'
    ) {
      incidents.push({
        id: `aud_ot_${lineNum}_4`,
        type: 'INVALID_REASON',
        severity: reasonValidation.classification === 'POSIBLE_ERROR' ? 'baja' : 'media',
        recordType: 'overtime',
        sourceFile: fileName,
        employeeId: rawEmpId,
        date: startDate,
        message: `Fila ${lineNum}: Motivo "${rawReason}" ${
          reasonValidation.classification === 'POSIBLE_ERROR'
            ? `sugiere "${reasonValidation.suggestedOfficialReason}"`
            : 'no reconocido en catálogo oficial'
        }`,
        detectedAt: new Date().toISOString(),
      });
    }

    const isSyndicated = determineSyndicatedStatus(rawCompany, '', rawDept);

    const recordCandidate: OvertimeRecord = {
      id: businessKey,
      employeeId: rawEmpId || `EMP_${idx + 1}`,
      employeeName: combinedEmpName || 'Colaborador Sin Nombre',
      firstName: rawEmpName || undefined,
      lastName: rawEmpLastName || undefined,
      company: rawCompany,
      department: rawDept,
      leader: rawLeader || 'Sin Líder Asignado',
      isSyndicated,
      startDate: startDate || formatDateISO(new Date()),
      startTime: startTime || '00:00:00',
      endDate: endDate || startDate || formatDateISO(new Date()),
      endTime: endTime || '00:00:00',
      requestedHours,
      approvedHours,
      pendingHours,
      status,
      reason: rawReason,
      reasonNormalized: normalizeText(rawReason),
      reasonClassification: reasonValidation.classification,
      reasonCategory: reasonValidation.category,
      suggestedOfficialReason: reasonValidation.suggestedOfficialReason,
      requestDate: requestDate || startDate || formatDateISO(new Date()),
      reviewFormatStatus:
        reasonValidation.classification === 'CORRECTO' ? 'CORRECTO' : 'INCORRECTO',
      isoYear,
      isoWeek,
      dateOnly: startDate || formatDateISO(new Date()),
      sourceFile: fileName,
      updatedAt: new Date().toISOString(),
    };

    // Zod validation check
    const validResult = OvertimeRecordSchema.safeParse(recordCandidate);
    if (validResult.success) {
      records.push(validResult.data);
    } else {
      records.push(recordCandidate);
    }
  });

  return {
    fileType: 'overtime',
    detectedHeaderRow: headerRowIndex,
    sheetName: worksheet.name,
    totalRowsRead: rawRows.length,
    records,
    incidents,
    dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
    columnsFound: headers,
  };
}

/**
 * Parse Attendance BioTime report using ExcelJS
 */
export function parseAttendanceWorksheet(
  worksheet: ExcelJS.Worksheet,
  fileName: string
): ParseResult<AttendanceRecord> {
  const { rowIndex: headerRowIndex } = findHeaderRowExcelJS(worksheet);
  const { rows: rawRows, headers } = worksheetToRowObjects(worksheet, headerRowIndex);

  const records: AttendanceRecord[] = [];
  const incidents: AuditIncident[] = [];
  let minDate = '';
  let maxDate = '';

  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  rawRows.forEach((row, idx) => {
    const lineNum = headerRowIndex + 1 + idx;

    const rawEmpId = String(
      getColumnValue(row, ['id de empleado', 'id empleado', 'no empleado', 'id', 'clave']) || ''
    ).trim();
    const rawEmpName = String(
      getColumnValue(row, ['nombre completo', 'nombre', 'empleado']) || ''
    ).trim();
    const rawEmpLastName = String(
      getColumnValue(row, ['apellido', 'apellidos', 'primer apellido', 'segundo apellido']) || ''
    ).trim();
    const combinedEmpName =
      rawEmpLastName && !rawEmpName.toLowerCase().includes(rawEmpLastName.toLowerCase())
        ? `${rawEmpName} ${rawEmpLastName}`.trim()
        : rawEmpName;

    const rawCompany = String(
      getColumnValue(row, ['empresa', 'compania', 'razon social']) || 'Polaquimia'
    ).trim();
    const rawNickname = String(
      getColumnValue(row, ['apodo', 'alias', 'tipo']) || ''
    ).trim();
    const rawDept = String(
      getColumnValue(row, ['departamento', 'area']) || 'Sin Departamento'
    ).trim();
    const rawLeader = String(
      getColumnValue(row, ['lider', 'supervisor', 'jefe']) || ''
    ).trim();

    // Date
    const rawDateVal = getColumnValue(row, ['fecha', 'dia', 'fecha asistencia']);
    const dateObj = parseDateString(rawDateVal);
    const dateStr = dateObj ? formatDateISO(dateObj) : '';

    if (dateStr) {
      if (!minDate || dateStr < minDate) minDate = dateStr;
      if (!maxDate || dateStr > maxDate) maxDate = dateStr;
    }

    const dayOfWeek = dateObj ? dayNames[dateObj.getDay()] : 'Desconocido';

    // Shift / Schedule code
    const rawSchedule = String(
      getColumnValue(row, ['horario', 'codigo horario', 'turno']) || ''
    ).trim();

    // Exceptions
    const rawException = String(
      getColumnValue(row, ['excepcion', 'incidencia', 'justificacion', 'permiso']) || ''
    ).trim();

    // Scheduled vs Real Punch Times
    const schedIn = parseTimeString(
      getColumnValue(row, ['hora de entrada', 'hora entrada programada', 'h entrada prog'])
    );
    const schedOut = parseTimeString(
      getColumnValue(row, ['hora de salida', 'hora salida programada', 'h salida prog'])
    );
    const rawRealIn = getColumnValue(
      row,
      ['entrada', 'primer marcaje', 'marcacion entrada'],
      ['programada', 'prog', 'hora de', 'hora programada']
    );
    const rawRealOut = getColumnValue(
      row,
      ['salida', 'ultimo marcaje', 'marcacion salida'],
      ['programada', 'prog', 'hora de', 'hora programada']
    );

    const realIn = parseTimeString(rawRealIn) || null;
    const realOut = parseTimeString(rawRealOut) || null;

    // Evaluate Attendance
    const { absenceStatus, isScheduleEligible, hasException } = evaluateAttendance(
      rawSchedule,
      rawException,
      realIn,
      realOut
    );

    const isSyndicated = determineSyndicatedStatus(rawCompany, rawNickname, rawDept);

    const baseDate = dateObj || new Date();
    const { isoYear, isoWeek } = getISOWeekAndYear(baseDate);

    // Business key for anti-duplicate idempotency
    const businessKey = `${normalizeText(rawCompany)}_${normalizeText(rawEmpId)}_${dateStr}_${normalizeText(rawSchedule)}`;

    // Auditing
    if (!rawEmpId) {
      incidents.push({
        id: `aud_att_${lineNum}_1`,
        type: 'EMPTY_ID',
        severity: 'alta',
        recordType: 'attendance',
        sourceFile: fileName,
        employeeName: combinedEmpName,
        department: rawDept,
        date: dateStr,
        message: `Fila ${lineNum}: ID de colaborador vacío`,
        detectedAt: new Date().toISOString(),
      });
    }

    if (absenceStatus === 'INCIDENCIA_MARCAJE') {
      incidents.push({
        id: `aud_att_${lineNum}_2`,
        type: 'INCONSISTENT_HOURS',
        severity: 'media',
        recordType: 'attendance',
        sourceFile: fileName,
        employeeId: rawEmpId,
        date: dateStr,
        message: `Fila ${lineNum}: Marcaje incompleto (Entrada: ${realIn || 'VACÍA'}, Salida: ${realOut || 'VACÍA'})`,
        detectedAt: new Date().toISOString(),
      });
    }

    const recordCandidate: AttendanceRecord = {
      id: businessKey,
      employeeId: rawEmpId || `EMP_${idx + 1}`,
      employeeName: combinedEmpName || 'Colaborador Sin Nombre',
      firstName: rawEmpName || undefined,
      lastName: rawEmpLastName || undefined,
      company: rawCompany,
      nickname: rawNickname,
      isSyndicated,
      department: rawDept,
      leader: rawLeader || 'Sin Líder Asignado',
      date: dateStr || formatDateISO(new Date()),
      dayOfWeek,
      schedule: rawSchedule || 'N/A',
      isScheduleEligible,
      exception: rawException,
      hasException,
      schedIn,
      schedOut,
      realIn,
      realOut,
      absenceStatus,
      reviewStatus: absenceStatus === 'INCIDENCIA_MARCAJE' ? 'PENDIENTE_REVISION' : 'REVISADO',
      isoYear,
      isoWeek,
      sourceFile: fileName,
      updatedAt: new Date().toISOString(),
    };

    // Zod validation check
    const validResult = AttendanceRecordSchema.safeParse(recordCandidate);
    if (validResult.success) {
      records.push(validResult.data);
    } else {
      records.push(recordCandidate);
    }
  });

  return {
    fileType: 'attendance',
    detectedHeaderRow: headerRowIndex,
    sheetName: worksheet.name,
    totalRowsRead: rawRows.length,
    records,
    incidents,
    dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
    columnsFound: headers,
  };
}

/**
 * Main auto-detect and parser entry point for uploaded Excel or CSV files
 */
export async function parseUploadedExcelFile(
  file: File,
  reasonsCatalog: ReasonCatalogItem[]
): Promise<ParseResult<OvertimeRecord | AttendanceRecord>> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const csvText = await file.text();
    const records = parseCSVToOvertimeRecords(csvText, file.name, reasonsCatalog);
    const minDate = records.length > 0 ? records[0].startDate : '';
    const maxDate = records.length > 0 ? records[records.length - 1].endDate : '';
    return {
      fileType: 'overtime',
      detectedHeaderRow: 3,
      sheetName: file.name,
      totalRowsRead: records.length,
      records,
      incidents: [],
      dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
      columnsFound: [
        'ID del Empleado',
        'Nombre',
        'Apellido',
        'Departamento',
        'Hora de Inicio de T.E.',
        'Hora de Fin de T.E.',
        'Estado de aprobación',
      ],
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('El archivo Excel no contiene hojas de cálculo legibles.');
  }

  const { headers } = findHeaderRowExcelJS(worksheet);
  const detectedType = detectReportType(headers);

  if (detectedType === 'overtime') {
    return parseOvertimeWorksheet(worksheet, file.name, reasonsCatalog);
  } else if (detectedType === 'attendance') {
    return parseAttendanceWorksheet(worksheet, file.name);
  } else {
    // If ambiguous, check which one yields valid structure
    const otAttempt = parseOvertimeWorksheet(worksheet, file.name, reasonsCatalog);
    if (otAttempt.records.some((r) => r.requestedHours > 0 || r.reason)) {
      return otAttempt;
    }
    return parseAttendanceWorksheet(worksheet, file.name);
  }
}

/**
 * Generates official downloadable sample BioTime Excel file templates using ExcelJS
 */
export async function generateSampleBioTimeFile(type: 'overtime' | 'attendance'): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BioTime Analytics Local Enterprise';
  workbook.created = new Date();

  if (type === 'overtime') {
    const ws = workbook.addWorksheet('Tiempo Extra');

    // Title rows
    ws.addRow(['GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.']);
    ws.addRow(['REPORTE OFICIAL BIOTIME - SOLICITUDES DE TIEMPO EXTRA - PERIODO SEMANAL VIGENTE']);

    // Headers
    const headers = [
      'ID de Empleado',
      'Nombre Completo',
      'Empresa',
      'Departamento',
      'Líder',
      'Fecha Inicio',
      'Hora Inicio',
      'Fecha Fin',
      'Hora Fin',
      'Horas Solicitadas',
      'Horas Aprobadas',
      'Estado',
      'Motivo',
    ];
    ws.addRow(headers);

    // Sample data rows
    ws.addRow([
      '1042',
      'Hernández Gómez Carlos',
      'Polaquimia',
      'Producción',
      'Ing. Roberto Saldaña',
      '2024-10-14',
      '14:00',
      '2024-10-14',
      '18:00',
      4.0,
      4.0,
      'APROBADO',
      'Mantenimiento correctivo bomba reactor 4',
    ]);
    ws.addRow([
      '1055',
      'Martínez Pérez Juan',
      'Polaquimia',
      'Mantenimiento',
      'Ing. Sofía Morales',
      '2024-10-14',
      '22:00',
      '2024-10-15',
      '04:00',
      6.0,
      6.0,
      'APROBADO',
      'Atención de fuga y cambio de empaques',
    ]);
    ws.addRow([
      '1120',
      'López Ramírez Miguel',
      'Polaquimia',
      'Almacén',
      'Lic. Fernando Cruz',
      '2024-10-15',
      '16:00',
      '2024-10-15',
      '19:30',
      3.5,
      0.0,
      'PENDIENTE',
      'Carga y descarga contenedor materias primas',
    ]);
    ws.addRow([
      '2014',
      'Ramírez Silva Laura',
      'Polatecnia',
      'Control de Calidad',
      'QFB. Patricia Mendoza',
      '2024-10-16',
      '17:00',
      '2024-10-16',
      '20:00',
      3.0,
      3.0,
      'APROBADO',
      'Analisis fisicoquimico lote especial',
    ]);

    // Style header row
    const headerRow = ws.getRow(3);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, 'Plantilla_BioTime_Tiempo_Extra.xlsx');
  } else {
    const ws = workbook.addWorksheet('Total de Asistencia');

    ws.addRow(['GRUPO INDUSTRIAL POLAQUIMIA S.A. DE C.V.']);
    ws.addRow(['REPORTE OFICIAL BIOTIME - TOTAL DE ASISTENCIA Y MARCAJES BIOMETRICOS']);

    const headers = [
      'ID de Empleado',
      'Nombre Completo',
      'Empresa',
      'Apodo',
      'Departamento',
      'Líder',
      'Fecha',
      'Horario',
      'Excepción',
      'Hora de Entrada',
      'Hora de Salida',
      'Entrada',
      'Salida',
    ];
    ws.addRow(headers);

    ws.addRow([
      '1042',
      'Hernández Gómez Carlos',
      'Polaquimia',
      'Planta Operativa',
      'Producción',
      'Ing. Roberto Saldaña',
      '2024-10-14',
      '1',
      '',
      '07:00:00',
      '15:00:00',
      '06:55:00',
      '15:05:00',
    ]);
    ws.addRow([
      '1055',
      'Martínez Pérez Juan',
      'Polaquimia',
      'Planta Operativa',
      'Mantenimiento',
      'Ing. Sofía Morales',
      '2024-10-14',
      '2',
      '',
      '15:00:00',
      '23:00:00',
      '',
      '',
    ]);
    ws.addRow([
      '1120',
      'López Ramírez Miguel',
      'Polaquimia',
      'Sindicalizado',
      'Almacén',
      'Lic. Fernando Cruz',
      '2024-10-14',
      '1',
      'Incapacidad Médica',
      '07:00:00',
      '15:00:00',
      '',
      '',
    ]);
    ws.addRow([
      '1088',
      'García Soto Andrés',
      'Polaquimia',
      'Planta Operativa',
      'Producción',
      'Ing. Roberto Saldaña',
      '2024-10-14',
      '1',
      '',
      '07:00:00',
      '15:00:00',
      '06:58:00',
      '',
    ]);

    const headerRow = ws.getRow(3);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(buffer, 'Plantilla_BioTime_Total_Asistencia.xlsx');
  }
}

/**
 * Export arbitrary dataset to Excel file using ExcelJS
 */
export async function exportToExcel(
  data: Record<string, unknown>[],
  fileName: string,
  sheetName = 'Datos'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const columns = Object.keys(data[0]).map((key) => ({
      header: key,
      key,
      width: Math.max(key.length + 4, 15),
    }));
    ws.columns = columns;

    data.forEach((item) => {
      ws.addRow(item);
    });

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // slate-800
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, `${fileName}.xlsx`);
}

/**
 * Helper to trigger client-side download of ArrayBuffer/Uint8Array
 */
function downloadBlob(buffer: ExcelJS.Buffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { parseOvertimeExcel } from './overtimeParser';


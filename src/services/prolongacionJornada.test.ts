import { describe, it, expect } from 'vitest';
import {
  isThirdShift,
  calculateOvertimeEquivalence,
} from './businessRules';
import {
  aggregateOvertimeData,
  NormalizedOvertimeRow,
} from './overtimeParser';

describe('Prolongación de Jornada / Equivalencia Horaria', () => {
  describe('Detección de 3er Turno (isThirdShift)', () => {
    it('detecta 3er turno por etiqueta o código oficial', () => {
      expect(isThirdShift('3 - Tercer turno (23:00 a 07:00+1)')).toBe(true);
      expect(isThirdShift('3')).toBe(true);
      expect(isThirdShift('3P')).toBe(true);
      expect(isThirdShift('3S')).toBe(true);
      expect(isThirdShift('Tercer turno nocturno')).toBe(true);
      expect(isThirdShift('3er Turno')).toBe(true);
    });

    it('detecta 3er turno por horario nocturno (22:00 a 06:00)', () => {
      expect(isThirdShift(undefined, '22:00:00', '06:00:00')).toBe(true);
      expect(isThirdShift(undefined, '23:00:00', '07:00:00')).toBe(true);
      expect(isThirdShift(undefined, '00:00:00', '08:00:00')).toBe(true);
    });

    it('detecta 3er turno cuando se especifica en el motivo de tiempo extra', () => {
      expect(isThirdShift('2 - Segundo turno (15:00 a 23:00)', '15:00', '23:00', 'Cubre 3er turno de Humberto')).toBe(true);
      expect(isThirdShift(undefined, undefined, undefined, 'Cobertura 3er turno por falta de personal')).toBe(true);
    });

    it('retorna false para 1er y 2do turno regulares diurnos', () => {
      expect(isThirdShift('1 - Primer turno (07:00 a 15:00)', '07:00', '15:00')).toBe(false);
      expect(isThirdShift('2 - Segundo turno (15:00 a 23:00)', '15:00', '21:00')).toBe(false);
      expect(isThirdShift('C - Central (08:00 a 17:30)', '08:00', '17:30')).toBe(false);
    });
  });

  describe('Cálculo de Equivalencia Horaria (calculateOvertimeEquivalence)', () => {
    it('Caso Oficial de Validación: Juan Pérez (SINDICALIZADO) con 2 días en 3er Turno', () => {
      // Juan Pérez (SINDICALIZADO):
      // Lunes: 8.0 hrs en 3er Turno -> +1.0 hr
      // Jueves: 8.0 hrs en 3er Turno -> +1.0 hr
      // Horas nominales: 16.0 hrs
      // Total días laborados: 2 días (ambos en 3er turno)
      const res = calculateOvertimeEquivalence(16.0, 2, 2, true);

      expect(res.horasBase).toBe(16.0);
      expect(res.diasLaborados).toBe(2);
      expect(res.diasTercerTurno).toBe(2);
      expect(res.diasTurnosRestantes).toBe(0);
      expect(res.horasProlongacion3erTurno).toBe(2.0); // 2 días * 1.0 hr = 2.0 hrs
      expect(res.horasProlongacionRestantes).toBe(0.0);
      expect(res.horasAdicionalesPorDia).toBe(2.0);
      expect(res.equivalenciaHoraria).toBe(18.0); // 16.0 + 2.0 = 18.0 hrs
    });

    it('Caso Oficial de Validación: Mismo escenario para NO SINDICALIZADO (Confianza)', () => {
      // Mismo caso de 16.0 hrs y 2 días en 3er turno, pero NO SINDICALIZADO:
      // Compensación = 0 hrs
      // Equivalencia Horaria = Horas Base (16.0 hrs)
      const res = calculateOvertimeEquivalence(16.0, 2, 2, false);

      expect(res.horasBase).toBe(16.0);
      expect(res.diasLaborados).toBe(2);
      expect(res.diasTercerTurno).toBe(2);
      expect(res.horasProlongacion3erTurno).toBe(0.0); // NO aplica compensación
      expect(res.horasProlongacionRestantes).toBe(0.0);
      expect(res.horasAdicionalesPorDia).toBe(0.0);
      expect(res.equivalenciaHoraria).toBe(16.0); // Permanece idéntico a las horas nominales
    });

    it('Turnos Mixtos: Sindicalizado con 2 días en 3er Turno y 3 días en turnos regulares (1er/2do)', () => {
      // 5 días laborados:
      // 2 días en 3er Turno -> 2 * 1.0 = 2.0 hrs
      // 3 días restantes -> 3 * 0.5 = 1.5 hrs
      // Total prolongación = 3.5 hrs
      // Horas base = 20.0 hrs -> Equivalencia = 23.5 hrs
      const res = calculateOvertimeEquivalence(20.0, 5, 2, true);

      expect(res.diasLaborados).toBe(5);
      expect(res.diasTercerTurno).toBe(2);
      expect(res.diasTurnosRestantes).toBe(3);
      expect(res.horasProlongacion3erTurno).toBe(2.0);
      expect(res.horasProlongacionRestantes).toBe(1.5);
      expect(res.horasAdicionalesPorDia).toBe(3.5);
      expect(res.equivalenciaHoraria).toBe(23.5);
    });
  });

  describe('Integración en Agregación de Tiempo Extra (aggregateOvertimeData)', () => {
    it('Agrega correctamente registros de Juan Pérez Sindicalizado vs No Sindicalizado', () => {
      const recordsSindicalizado: NormalizedOvertimeRow[] = [
        {
          idEmpleado: 'EMP-001',
          nombre: 'Juan',
          apellido: 'Pérez',
          colaborador: 'Juan Pérez',
          departamento: 'Producción',
          horaInicio: '2026-10-12 22:00:00', // Lunes (3er Turno nocturno)
          horaFin: '2026-10-13 06:00:00',
          duracionHoras: 8.0,
          estado: 'Aprobado',
          turno: '3 - Tercer turno (23:00 a 07:00+1)',
          isSyndicated: true,
          isThirdShift: true,
          isoYear: 2026,
          isoWeek: 42,
          semanaIso: '2026-W42',
        },
        {
          idEmpleado: 'EMP-001',
          nombre: 'Juan',
          apellido: 'Pérez',
          colaborador: 'Juan Pérez',
          departamento: 'Producción',
          horaInicio: '2026-10-15 22:00:00', // Jueves (3er Turno nocturno)
          horaFin: '2026-10-16 06:00:00',
          duracionHoras: 8.0,
          estado: 'Aprobado',
          turno: '3 - Tercer turno (23:00 a 07:00+1)',
          isSyndicated: true,
          isThirdShift: true,
          isoYear: 2026,
          isoWeek: 42,
          semanaIso: '2026-W42',
        },
      ];

      const { aggregated, kpis } = aggregateOvertimeData(recordsSindicalizado);
      expect(aggregated.length).toBe(1);

      const juan = aggregated[0];
      expect(juan.id).toBe('EMP-001');
      expect(juan.colaborador).toBe('Juan Pérez');
      expect(juan.isSyndicated).toBe(true);
      expect(juan.tipoColaborador).toBe('SINDICALIZADO');
      expect(juan.horasBase).toBe(16.0);
      expect(juan.diasLaborados).toBe(2);
      expect(juan.diasTercerTurno).toBe(2);
      expect(juan.diasTurnosRestantes).toBe(0);
      expect(juan.horasProlongacion3erTurno).toBe(2.0);
      expect(juan.horasAdicionalesPorDia).toBe(2.0);
      expect(juan.equivalenciaHoraria).toBe(18.0);
      expect(juan.semaforo).toBe('ROJO'); // 18.0 > 9h

      expect(kpis.sindicalizadosCount).toBe(1);
      expect(kpis.noSindicalizadosCount).toBe(0);
      expect(kpis.totalDiasTercerTurno).toBe(2);
      expect(kpis.totalHorasProlongacion).toBe(2.0);
      expect(kpis.totalEquivalenciaHoraria).toBe(18.0);
      expect(kpis.totalAcumulado).toBe(16.0);

      // Ahora el mismo colaborador si fuera NO SINDICALIZADO
      const recordsNoSindicalizado: NormalizedOvertimeRow[] = recordsSindicalizado.map((r) => ({
        ...r,
        isSyndicated: false,
      }));

      const resNoSind = aggregateOvertimeData(recordsNoSindicalizado);
      const juanNoSind = resNoSind.aggregated[0];

      expect(juanNoSind.isSyndicated).toBe(false);
      expect(juanNoSind.tipoColaborador).toBe('NO SIND.');
      expect(juanNoSind.horasBase).toBe(16.0);
      expect(juanNoSind.horasAdicionalesPorDia).toBe(0.0);
      expect(juanNoSind.equivalenciaHoraria).toBe(16.0); // Exactamente 16.0 hrs
      expect(resNoSind.kpis.sindicalizadosCount).toBe(0);
      expect(resNoSind.kpis.noSindicalizadosCount).toBe(1);
      expect(resNoSind.kpis.totalHorasProlongacion).toBe(0.0);
    });
  });
});


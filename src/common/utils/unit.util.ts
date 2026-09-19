import { BadRequestException } from '@nestjs/common';
import { D, Decimal, toQuantity } from './money.util';

/**
 * Unit handling.
 *
 * Every ingredient is stored internally in a BASE unit so that quantities from
 * different units can be compared and deducted safely:
 *
 *   WEIGHT -> g      (1 kg = 1000 g)
 *   VOLUME -> ml     (1 ltr = 1000 ml)
 *   COUNT  -> piece  (1 dozen = 12 pieces)
 */
export enum UnitType {
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  COUNT = 'COUNT',
}

export const BASE_UNIT: Record<UnitType, string> = {
  [UnitType.WEIGHT]: 'g',
  [UnitType.VOLUME]: 'ml',
  [UnitType.COUNT]: 'piece',
};

interface UnitDefinition {
  type: UnitType;
  /** How many base units one of this unit represents. */
  factor: string;
}

export const UNITS: Record<string, UnitDefinition> = {
  mg: { type: UnitType.WEIGHT, factor: '0.001' },
  g: { type: UnitType.WEIGHT, factor: '1' },
  gram: { type: UnitType.WEIGHT, factor: '1' },
  kg: { type: UnitType.WEIGHT, factor: '1000' },

  ml: { type: UnitType.VOLUME, factor: '1' },
  l: { type: UnitType.VOLUME, factor: '1000' },
  ltr: { type: UnitType.VOLUME, factor: '1000' },
  litre: { type: UnitType.VOLUME, factor: '1000' },

  piece: { type: UnitType.COUNT, factor: '1' },
  pcs: { type: UnitType.COUNT, factor: '1' },
  unit: { type: UnitType.COUNT, factor: '1' },
  dozen: { type: UnitType.COUNT, factor: '12' },
};

export const SUPPORTED_UNITS = Object.keys(UNITS);

export function normalizeUnit(unit: string): string {
  const key = (unit || '').trim().toLowerCase();
  if (!UNITS[key]) {
    throw new BadRequestException(
      `Unsupported unit "${unit}". Supported units: ${SUPPORTED_UNITS.join(', ')}`,
    );
  }
  return key;
}

export function getUnitType(unit: string): UnitType {
  return UNITS[normalizeUnit(unit)].type;
}

export function getBaseUnit(unit: string): string {
  return BASE_UNIT[getUnitType(unit)];
}

/** Convert a quantity expressed in `unit` into base units (g / ml / piece). */
export function toBaseQuantity(quantity: number | string, unit: string): Decimal {
  const def = UNITS[normalizeUnit(unit)];
  return D(quantity).times(def.factor);
}

/** Convert a quantity expressed in base units back into `unit`. */
export function fromBaseQuantity(baseQuantity: number | string, unit: string): number {
  const def = UNITS[normalizeUnit(unit)];
  return toQuantity(D(baseQuantity).dividedBy(def.factor));
}

/** Throws unless both units belong to the same measurement family. */
export function assertCompatibleUnits(unitA: string, unitB: string): void {
  if (getUnitType(unitA) !== getUnitType(unitB)) {
    throw new BadRequestException(
      `Unit "${unitA}" (${getUnitType(unitA)}) is not compatible with "${unitB}" (${getUnitType(unitB)})`,
    );
  }
}

/** Human friendly quantity, e.g. 1500 g -> "1.5 kg". */
export function humanizeBaseQuantity(baseQuantity: number | string, type: UnitType): string {
  const value = D(baseQuantity);
  if (type === UnitType.WEIGHT && value.greaterThanOrEqualTo(1000)) {
    return `${toQuantity(value.dividedBy(1000))} kg`;
  }
  if (type === UnitType.VOLUME && value.greaterThanOrEqualTo(1000)) {
    return `${toQuantity(value.dividedBy(1000))} ltr`;
  }
  return `${toQuantity(value)} ${BASE_UNIT[type]}`;
}

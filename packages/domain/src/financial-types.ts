declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & {
  readonly [brand]: Name;
};

export type DecimalString = Brand<string, "DecimalString">;
export type Price = Brand<DecimalString, "Price">;
export type Quantity = Brand<DecimalString, "Quantity">;
export type UsdcAmount = Brand<DecimalString, "UsdcAmount">;
export type Leverage = Brand<DecimalString, "Leverage">;
export type BasisPoints = Brand<number, "BasisPoints">;
export type MarketId = Brand<string, "MarketId">;

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const MARKET = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export function decimalString(value: unknown, field: string): DecimalString {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new DomainValidationError(
      field,
      "must be a non-negative decimal string",
    );
  }
  return value as DecimalString;
}

export function positiveDecimal(value: unknown, field: string): DecimalString {
  const parsed = decimalString(value, field);
  if (/^0(?:\.0+)?$/.test(parsed)) {
    throw new DomainValidationError(field, "must be greater than zero");
  }
  return parsed;
}

export function price(value: unknown): Price {
  return positiveDecimal(value, "limitPrice") as Price;
}

export function quantity(value: unknown): Quantity {
  return positiveDecimal(value, "quantity") as Quantity;
}

export function basisPoints(
  value: unknown,
  field: string,
  max = 10_000,
): BasisPoints {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > max
  ) {
    throw new DomainValidationError(
      field,
      `must be an integer between 0 and ${max}`,
    );
  }
  return value as BasisPoints;
}

export function marketId(value: unknown): MarketId {
  if (typeof value !== "string" || !MARKET.test(value)) {
    throw new DomainValidationError("marketId", "has an invalid format");
  }
  return value as MarketId;
}

export class DomainValidationError extends Error {
  readonly code = "DOMAIN_VALIDATION_ERROR";

  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field} ${message}`);
    this.name = "DomainValidationError";
  }
}

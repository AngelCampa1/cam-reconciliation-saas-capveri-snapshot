const CENT_SCALE = 100n;
const RATE_SCALE = 100_000_000n;

export class Money {
  private constructor(private readonly cents: bigint) {}

  static zero(): Money {
    return new Money(0n);
  }

  static fromCents(cents: bigint): Money {
    return new Money(cents);
  }

  static parse(value: string | number | bigint | null | undefined): Money {
    if (value === null || value === undefined) {
      return Money.zero();
    }

    const text = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
      throw new Error(`Invalid money value: ${text}`);
    }

    const negative = text.startsWith("-");
    const unsigned = negative ? text.slice(1) : text;
    const parts = unsigned.split(".");
    const whole = parts[0] ?? "0";
    const fraction = parts[1] ?? "";
    const padded = `${fraction}000`;
    const cents =
      BigInt(whole) * CENT_SCALE +
      BigInt(padded.slice(0, 2)) +
      (Number(padded[2]) >= 5 ? 1n : 0n);

    return new Money(negative ? -cents : cents);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  multiplyRate(rate: Rate): Money {
    return new Money(roundDivide(this.cents * rate.scaledValue, RATE_SCALE));
  }

  min(other: Money): Money {
    return this.cents <= other.cents ? this : other;
  }

  max(other: Money): Money {
    return this.cents >= other.cents ? this : other;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isNegative(): boolean {
    return this.cents < 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  gt(other: Money): boolean {
    return this.cents > other.cents;
  }

  gte(other: Money): boolean {
    return this.cents >= other.cents;
  }

  toCents(): bigint {
    return this.cents;
  }

  toString(): string {
    const negative = this.cents < 0n;
    const absolute = negative ? -this.cents : this.cents;
    const whole = absolute / CENT_SCALE;
    const cents = absolute % CENT_SCALE;

    return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
  }
}

export class Rate {
  private constructor(readonly scaledValue: bigint) {}

  static zero(): Rate {
    return new Rate(0n);
  }

  static one(): Rate {
    return new Rate(RATE_SCALE);
  }

  static parse(value: string | number | bigint | null | undefined): Rate {
    if (value === null || value === undefined) {
      return Rate.zero();
    }

    const text = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
      throw new Error(`Invalid rate value: ${text}`);
    }

    const negative = text.startsWith("-");
    const unsigned = negative ? text.slice(1) : text;
    const parts = unsigned.split(".");
    const whole = parts[0] ?? "0";
    const fraction = parts[1] ?? "";
    const padded = `${fraction}${"0".repeat(9)}`;
    const scaled =
      BigInt(whole) * RATE_SCALE +
      BigInt(padded.slice(0, 8)) +
      (Number(padded[8]) >= 5 ? 1n : 0n);

    return new Rate(negative ? -scaled : scaled);
  }

  multiply(other: Rate): Rate {
    return new Rate(
      roundDivide(this.scaledValue * other.scaledValue, RATE_SCALE),
    );
  }

  add(other: Rate): Rate {
    return new Rate(this.scaledValue + other.scaledValue);
  }

  subtract(other: Rate): Rate {
    return new Rate(this.scaledValue - other.scaledValue);
  }

  divide(other: Rate): Rate {
    if (other.scaledValue === 0n) {
      throw new Error("Cannot divide by zero rate");
    }

    return new Rate(
      roundDivide(this.scaledValue * RATE_SCALE, other.scaledValue),
    );
  }

  /**
   * Round to `decimals` decimal places, half-up — mirrors Python's
   * Decimal.quantize(..., ROUND_HALF_UP). The gross-up oracle
   * (backend/app/services/calculation/gross_up.py) quantizes the gross-up
   * factor to 4 dp before applying it, so the Worker must do the same to stay
   * penny-for-penny with the source of truth.
   */
  quantize(decimals: number): Rate {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
      throw new Error(`Rate.quantize supports 0..8 decimals, got ${decimals}`);
    }
    const step = 10n ** BigInt(8 - decimals);
    if (step === 1n) {
      return this;
    }
    return new Rate(roundDivide(this.scaledValue, step) * step);
  }

  min(other: Rate): Rate {
    return this.scaledValue <= other.scaledValue ? this : other;
  }

  lt(other: Rate): boolean {
    return this.scaledValue < other.scaledValue;
  }

  gt(other: Rate): boolean {
    return this.scaledValue > other.scaledValue;
  }

  gte(other: Rate): boolean {
    return this.scaledValue >= other.scaledValue;
  }

  isZero(): boolean {
    return this.scaledValue === 0n;
  }

  toString(): string {
    const negative = this.scaledValue < 0n;
    const absolute = negative ? -this.scaledValue : this.scaledValue;
    const whole = absolute / RATE_SCALE;
    const fraction = (absolute % RATE_SCALE).toString().padStart(8, "0");

    return `${negative ? "-" : ""}${whole}.${fraction}`
      .replace(/0+$/, "")
      .replace(/\.$/, "");
  }
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = Money.zero();
  for (const value of values) {
    total = total.add(value);
  }

  return total;
}

export function roundDivide(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;
  const rounded =
    remainder * 2n >= absoluteDenominator ? quotient + 1n : quotient;

  return negative ? -rounded : rounded;
}

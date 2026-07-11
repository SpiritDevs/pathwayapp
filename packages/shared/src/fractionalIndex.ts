const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = BigInt(DIGITS.length);
const MIDPOINT_DIGIT = DIGITS[Math.floor((DIGITS.length - 1) / 2)]!;

const assertOrderKey = (key: string): void => {
  if (key.length === 0) throw new RangeError("Order keys must not be empty");
  for (const character of key) {
    if (!DIGITS.includes(character)) {
      throw new RangeError(`Invalid order key character: ${character}`);
    }
  }
};

const keyBefore = (upper: string): string => {
  if (upper.length === 0) {
    throw new RangeError("No base-62 order key exists before this bound");
  }

  const first = DIGITS.indexOf(upper[0]!);
  if (first === 0) return `${DIGITS[0]}${keyBefore(upper.slice(1))}`;
  if (first === 1) return `${DIGITS[0]}${MIDPOINT_DIGIT}`;
  return DIGITS[Math.floor(first / 2)]!;
};

const midpoint = (lower: string, upper: string | null): string => {
  if (upper === null) return `${lower}${MIDPOINT_DIGIT}`;

  let sharedLength = 0;
  while (
    sharedLength < lower.length &&
    sharedLength < upper.length &&
    lower[sharedLength] === upper[sharedLength]
  ) {
    sharedLength += 1;
  }

  const prefix = lower.slice(0, sharedLength);
  const lowerRest = lower.slice(sharedLength);
  const upperRest = upper.slice(sharedLength);

  if (lowerRest.length === 0) return `${prefix}${keyBefore(upperRest)}`;

  const lowerDigit = DIGITS.indexOf(lowerRest[0]!);
  const upperDigit = DIGITS.indexOf(upperRest[0]!);
  if (upperDigit - lowerDigit > 1) {
    return `${prefix}${DIGITS[Math.floor((lowerDigit + upperDigit) / 2)]}`;
  }

  return `${prefix}${lowerRest[0]}${lowerRest.slice(1)}${MIDPOINT_DIGIT}`;
};

export const orderKeyBetween = (a: string | null, b: string | null): string => {
  if (a !== null) assertOrderKey(a);
  if (b !== null) assertOrderKey(b);
  if (a !== null && b !== null && a >= b) {
    throw new RangeError("Lower order key must sort before upper order key");
  }

  const result = a === null ? (b === null ? MIDPOINT_DIGIT : keyBefore(b)) : midpoint(a, b);
  if ((a !== null && result <= a) || (b !== null && result >= b)) {
    throw new RangeError("No base-62 order key exists between the supplied bounds");
  }
  return result;
};

export const orderKeyInitial = (): string => MIDPOINT_DIGIT;

const encodeFixedWidth = (value: bigint, width: number): string => {
  let remainder = value;
  let encoded = "";
  for (let index = 0; index < width; index += 1) {
    encoded = `${DIGITS[Number(remainder % BASE)]}${encoded}`;
    remainder /= BASE;
  }
  return encoded;
};

export const orderKeysForCount = (n: number): string[] => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError("Order key count must be a non-negative safe integer");
  }
  if (n === 0) return [];

  const denominator = BigInt(n + 1);
  let width = 1;
  let capacity = BASE;
  while (capacity < denominator) {
    capacity *= BASE;
    width += 1;
  }

  return Array.from({ length: n }, (_, index) =>
    encodeFixedWidth((BigInt(index + 1) * capacity) / denominator, width),
  );
};

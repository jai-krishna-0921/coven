/**
 * Monotonic, lexicographically-sortable ids: <prefix>_<time base36><counter><random>.
 * Sortable by creation time so message ordering falls out of string ordering.
 */
let lastTime = 0;
let counter = 0;

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomSuffix(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function createId(prefix: "ses" | "msg" | "prt" | "call" | "perm" | "plan"): string {
  const now = Date.now();
  if (now === lastTime) {
    counter++;
  } else {
    lastTime = now;
    counter = 0;
  }
  const time = now.toString(36).padStart(9, "0");
  const seq = counter.toString(36).padStart(3, "0");
  return `${prefix}_${time}${seq}${randomSuffix(6)}`;
}

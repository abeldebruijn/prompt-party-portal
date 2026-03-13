export function validateStarCount(stars: number) {
  return Number.isInteger(stars) && stars >= 0 && stars <= 5;
}

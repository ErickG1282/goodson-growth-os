const unitDefinitions: Record<string, { family: "mass" | "volume" | "count"; factor: number }> = {
  g: { family: "mass", factor: 1 }, kg: { family: "mass", factor: 1000 }, oz: { family: "mass", factor: 28.349523125 }, lb: { family: "mass", factor: 453.59237 },
  ml: { family: "volume", factor: 1 }, L: { family: "volume", factor: 1000 }, tsp: { family: "volume", factor: 4.92892159375 }, tbsp: { family: "volume", factor: 14.78676478125 }, cup: { family: "volume", factor: 236.5882365 },
  each: { family: "count", factor: 1 }, slice: { family: "count", factor: 1 }, piece: { family: "count", factor: 1 }, package: { family: "count", factor: 1 },
};

export function convertUnit(value: number, fromUnit: string, toUnit: string) {
  if (fromUnit === toUnit) return value;
  const from = unitDefinitions[fromUnit];
  const to = unitDefinitions[toUnit];
  if (!from || !to || from.family !== to.family) return null;
  return value * from.factor / to.factor;
}

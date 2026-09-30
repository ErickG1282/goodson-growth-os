export type FdcNutrient = {
  nutrientId?: number
  nutrientNumber?: string
  nutrientName?: string
  unitName?: string
  value?: number
}

export type FdcDetailedNutrient = {
  amount?: number
  nutrient?: {
    id?: number
    number?: string
    name?: string
    unitName?: string
  }
}

function finiteValue(nutrient: FdcNutrient | undefined) {
  const value = Number(nutrient?.value)
  return Number.isFinite(value) ? value : 0
}

export function nutrientValue(nutrients: FdcNutrient[] | undefined, nutrientId: number, name: RegExp) {
  return finiteValue(nutrients?.find((item) => Number(item.nutrientId) === nutrientId || name.test(item.nutrientName ?? "")))
}

export function caloriesPer100g(nutrients: FdcNutrient[] | undefined) {
  const kcalIds = new Set([1008, 2047, 2048])
  const energy = nutrients?.find((item) => {
    const unit = (item.unitName ?? "").trim().toLowerCase()
    return kcalIds.has(Number(item.nutrientId)) && (unit === "kcal" || unit === "kilocalorie" || unit === "kilocalories")
  })
  return finiteValue(energy)
}

export function normalizeDetailedNutrients(nutrients: FdcDetailedNutrient[] | undefined): FdcNutrient[] {
  return (nutrients ?? []).map((item) => ({
    nutrientId: item.nutrient?.id,
    nutrientNumber: item.nutrient?.number,
    nutrientName: item.nutrient?.name,
    unitName: item.nutrient?.unitName,
    value: item.amount,
  }))
}

export function nutritionPer100g(nutrients: FdcNutrient[] | undefined) {
  return {
    proteinPer100g: nutrientValue(nutrients?.filter((item) => (item.unitName ?? "").toLowerCase() === "g"), 1003, /^Protein$/i),
    carbsPer100g: nutrientValue(nutrients?.filter((item) => (item.unitName ?? "").toLowerCase() === "g"), 1005, /Carbohydrate, by difference/i),
    fatPer100g: nutrientValue(nutrients?.filter((item) => (item.unitName ?? "").toLowerCase() === "g"), 1004, /^Total lipid \(fat\)$/i),
    caloriesPer100g: caloriesPer100g(nutrients),
  }
}

export type NutritionPortion={id:string;label:string;amount:number;gramWeight:number}

export const UNIVERSAL_NUTRITION_UNITS=["g","oz","lb"] as const
export const MANUAL_NUTRITION_UNITS=["g","oz","lb","fl oz","cup","tsp","tbsp","each"] as const

export function isManualNutritionUnit(unit:string){return(MANUAL_NUTRITION_UNITS as readonly string[]).includes(unit)}

export function quantityForNutritionUnitChange(quantity:string,fromUnit:string,toUnit:string){
  const weightUnits=new Set<string>(UNIVERSAL_NUTRITION_UNITS)
  return weightUnits.has(fromUnit)&&weightUnits.has(toUnit)?quantity:"1"
}

export function nutritionPortionAmount(value:string|undefined){
  const text=value?.trim()??"",mixed=text.match(/^(\d+)\s+(\d+)\/(\d+)(?:\s+|$)/),fraction=text.match(/^(\d+)\/(\d+)(?:\s+|$)/),decimal=text.match(/^(\d+(?:\.\d+)?)(?:\s+|$)/)
  if(mixed){const denominator=Number(mixed[3]);return denominator?Number(mixed[1])+Number(mixed[2])/denominator:null}
  if(fraction){const denominator=Number(fraction[2]);return denominator?Number(fraction[1])/denominator:null}
  return decimal?Number(decimal[1]):null
}

export function stripNutritionPortionAmount(value:string|undefined){
  return(value??"").trim().replace(/^(?:(?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*/,"").trim()
}

export function nutritionPortionGramsPerUnit(gramWeight:number,amount:number|undefined,description:string|undefined){
  const divisor=nutritionPortionAmount(description)??(Number(amount)>0?Number(amount):1)
  return gramWeight/divisor
}

export function simpleNutritionPortions(portions:NutritionPortion[]){
  const each=portions.find(portion=>portion.label==="each"),sourceId=each?.id.startsWith("each-")?each.id.slice(5):null
  return portions.filter(portion=>portion.id!==sourceId)
}

export function gramsForNutritionServing(amount:string|number,unit:string,portions:NutritionPortion[]){
  const quantity=Number(amount)
  if(!Number.isFinite(quantity)||quantity<0)return null
  if(unit==="g")return quantity
  if(unit==="oz")return quantity*28.349523125
  if(unit==="lb")return quantity*453.59237
  const portion=portions.find(item=>item.label===unit)
  return portion?quantity*portion.gramWeight:null
}

export function nutritionMacrosForGrams(values:{proteinPer100g:string|number;carbsPer100g:string|number;fatPer100g:string|number;caloriesPer100g:string|number},grams:number,precision=2){
  const factor=grams/100,multiplier=10**precision,rounded=(value:number)=>Math.round(value*multiplier)/multiplier
  return{protein:String(rounded(Number(values.proteinPer100g||0)*factor)),carbs:String(rounded(Number(values.carbsPer100g||0)*factor)),fat:String(rounded(Number(values.fatPer100g||0)*factor)),calories:String(rounded(Number(values.caloriesPer100g||0)*factor))}
}

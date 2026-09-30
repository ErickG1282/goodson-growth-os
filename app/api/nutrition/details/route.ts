import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { nutritionPortionAmount, nutritionPortionGramsPerUnit, stripNutritionPortionAmount } from "@/lib/nutrition-portions"
import { normalizeDetailedNutrients, nutritionPer100g, type FdcDetailedNutrient } from "@/lib/fdc-nutrients"

type MeasureUnit={name?:string;abbreviation?:string}
type FoodPortion={id?:number;amount?:number;gramWeight?:number;modifier?:string;portionDescription?:string;measureUnit?:MeasureUnit}
type FdcDetails={fdcId?:number;description?:string;foodPortions?:FoodPortion[];servingSize?:number;servingSizeUnit?:string;householdServingFullText?:string;foodNutrients?:FdcDetailedNutrient[]}

function clean(value:string|undefined){return value?.replace(/\s+/g," ").trim()??""}
function canonicalLabel(value:string,food:FdcDetails){
  let label=stripNutritionPortionAmount(clean(value)).toLowerCase().replace(/\bteaspoons?\b/g,"tsp").replace(/\btablespoons?\b/g,"tbsp").replace(/\bcups?\b/g,"cup").replace(/\bpieces?\b/g,"piece").replace(/\bslices?\b/g,"slice").replace(/\bservings?\b/g,"serving").replace(/^(whole item|one item)$/,"each")
  const description=clean(food.description).toLowerCase()
  if(/^(small|medium|large|extra large|jumbo)$/.test(label)&&description.includes("egg"))label=`${label} egg`
  if(label==="egg"&&description.includes("large"))label="large egg"
  return label
}
function portionLabel(portion:FoodPortion,food:FdcDetails){
  const description=stripNutritionPortionAmount(clean(portion.portionDescription))
  if(description&&!/^(quantity not specified|not specified|unknown)$/i.test(description))return canonicalLabel(description,food)
  const modifier=clean(portion.modifier),rawUnit=clean(portion.measureUnit?.abbreviation)||clean(portion.measureUnit?.name),unit=/^(undetermined|unknown)$/i.test(rawUnit)?"":rawUnit
  if(modifier&&unit&&!modifier.toLowerCase().includes(unit.toLowerCase()))return canonicalLabel(`${modifier} ${unit}`,food)
  return canonicalLabel(modifier||unit,food)
}

export function normalizePortions(food:FdcDetails){
  const normalized=(food.foodPortions??[]).flatMap((portion,index)=>{
    const totalGramWeight=Number(portion.gramWeight),label=portionLabel(portion,food),gramWeight=nutritionPortionGramsPerUnit(totalGramWeight,portion.amount,portion.portionDescription||portion.modifier)
    if(!label||!Number.isFinite(gramWeight)||gramWeight<=0)return[]
    return[{id:String(portion.id??index),label,amount:1,gramWeight}]
  })
  const servingSize=Number(food.servingSize),servingUnit=clean(food.servingSizeUnit).toLowerCase(),household=clean(food.householdServingFullText)
  if(household&&Number.isFinite(servingSize)&&servingSize>0&&["g","grm","gram","grams"].includes(servingUnit)){const householdAmount=nutritionPortionAmount(household)??1;normalized.push({id:"branded-serving",label:canonicalLabel(household,food),amount:1,gramWeight:servingSize/householdAmount})}
  const byLabel=new Map<string,(typeof normalized)[number]|null>()
  for(const portion of normalized){const key=portion.label.toLowerCase(),existing=byLabel.get(key);if(existing===undefined)byLabel.set(key,portion);else if(existing&&Math.abs(existing.gramWeight-portion.gramWeight)>0.01)byLabel.set(key,null)}
  const deduplicated=[...byLabel.values()].filter((portion):portion is (typeof normalized)[number]=>portion!==null)
  const itemPortions=deduplicated.filter(portion=>/\b(egg|each|item|piece|slice|scoop|serving|fruit|cookie|muffin|pancake|patty|fillet|link)\b/i.test(portion.label))
  if(itemPortions.length===1&&!deduplicated.some(portion=>portion.label==="each"))deduplicated.push({id:`each-${itemPortions[0].id}`,label:"each",amount:1,gramWeight:itemPortions[0].gramWeight})
  return deduplicated
}

function foodWords(value:string){return new Set((value.toLowerCase().match(/[a-z0-9]+/g)??[]).map(word=>word.endsWith("s")&&word.length>3?word.slice(0,-1):word).filter(word=>!["and","with","the","grade","whole"].includes(word)))}
function matchScore(selectedName:string,candidateName:string){const selected=foodWords(selectedName),candidate=foodWords(candidateName);if(!selected.size)return 0;return [...selected].filter(word=>candidate.has(word)).length/selected.size}

async function fallbackPortions(name:string,apiKey:string){
  if(name.trim().length<2)return null
  const response=await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:name,pageSize:25}),cache:"no-store"})
  if(!response.ok)return null
  const payload=await response.json() as{foods?:FdcDetails[]}
  const matches=(payload.foods??[]).map(food=>({food,score:matchScore(name,food.description??""),portions:normalizePortions(food)})).filter(item=>item.score>=0.6&&item.portions.length).sort((a,b)=>b.score-a.score)
  return matches[0]??null
}

export async function GET(request:NextRequest){
  const fdcId=request.nextUrl.searchParams.get("fdcId")?.trim()??""
  const selectedName=request.nextUrl.searchParams.get("name")?.trim()??""
  if(!/^\d+$/.test(fdcId))return NextResponse.json({error:"A valid FDC ID is required."},{status:400})
  const authHeader=request.headers.get("authorization"),token=authHeader?.startsWith("Bearer ")?authHeader.slice(7):""
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if(!token||!supabaseUrl||!supabaseKey)return NextResponse.json({error:"Authentication required."},{status:401})
  const supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}}),{data:userData,error:userError}=await supabase.auth.getUser(token)
  if(userError||!userData.user)return NextResponse.json({error:"Authentication required."},{status:401})
  const apiKey=process.env.FDC_API_KEY
  if(!apiKey)return NextResponse.json({error:"USDA FoodData Central is not configured."},{status:503})
  try{
    const response=await fetch(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(apiKey)}`,{cache:"no-store"})
    if(response.status===429)return NextResponse.json({error:"USDA lookup limit reached. Try again later."},{status:429})
    if(response.ok){const food=await response.json() as FdcDetails,portions=normalizePortions(food),nutrition=nutritionPer100g(normalizeDetailedNutrients(food.foodNutrients));return NextResponse.json({externalFoodId:fdcId,portionSourceFdcId:String(food.fdcId??fdcId),portions,nutrition})}
    const fallback=await fallbackPortions(selectedName,apiKey)
    if(fallback)return NextResponse.json({externalFoodId:fdcId,portionSourceFdcId:String(fallback.food.fdcId??""),portions:fallback.portions})
    return NextResponse.json({error:"USDA does not provide a reliable household portion for this food."},{status:404})
  }catch{return NextResponse.json({error:"Unable to reach USDA FoodData Central."},{status:502})}
}

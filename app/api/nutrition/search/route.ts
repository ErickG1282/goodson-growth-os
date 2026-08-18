import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type FdcNutrient = { nutrientId?: number; nutrientNumber?: string; nutrientName?: string; unitName?: string; value?: number }
type FdcFood = { fdcId: number; description: string; dataType?: string; brandOwner?: string; brandName?: string; foodCategory?: string | { description?: string }; foodNutrients?: FdcNutrient[] }

function words(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? []
}

function typeWeight(dataType: string) {
  const normalized = dataType.toLowerCase()
  if (normalized.includes("foundation")) return 40
  if (normalized.includes("sr legacy")) return 30
  if (normalized.includes("survey") || normalized.includes("fndds")) return 20
  if (normalized.includes("branded")) return 0
  return 10
}

function rankFood(query: string, food: FdcFood) {
  const queryWords = [...new Set(words(query))]
  const description = food.description.toLowerCase()
  const descriptionWords = new Set(words(food.description))
  const matchedWords = queryWords.filter((word) => descriptionWords.has(word)).length
  const coverage = queryWords.length ? matchedWords / queryWords.length : 0
  const exactPhrase = description.includes(query.toLowerCase()) ? 60 : 0
  const startsWithQuery = description.startsWith(query.toLowerCase()) ? 20 : 0
  const brandedPenalty = food.brandOwner || food.brandName || food.dataType?.toLowerCase().includes("branded") ? 10 : 0
  return coverage * 100 + exactPhrase + startsWithQuery + typeWeight(food.dataType ?? "") - brandedPenalty
}

function nutrientValue(nutrients: FdcNutrient[] | undefined, ids: number[], name: RegExp) {
  const nutrient = nutrients?.find((item) => ids.includes(Number(item.nutrientId)) || name.test(item.nutrientName ?? ""))
  const value = Number(nutrient?.value)
  return Number.isFinite(value) ? value : 0
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (query.length < 2) return NextResponse.json({ error: "Enter at least two characters." }, { status: 400 })

  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : ""
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !supabaseUrl || !supabaseKey) return NextResponse.json({ error: "Authentication required." }, { status: 401 })
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 })

  const apiKey = process.env.FDC_API_KEY
  if (!apiKey) return NextResponse.json({ error: "USDA FoodData Central is not configured. Add FDC_API_KEY to the server environment." }, { status: 503 })

  try {
    const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, pageSize: 30 }),
      cache: "no-store",
    })
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? "USDA lookup limit reached. Try again later." : "USDA FoodData Central lookup failed." }, { status: response.status })
    const payload = await response.json() as { foods?: FdcFood[] }
    const foods = (payload.foods ?? []).sort((a, b) => rankFood(query, b) - rankFood(query, a)).map((food) => {
      const nutrients = food.foodNutrients
      const foodCategory = typeof food.foodCategory === "string" ? food.foodCategory : food.foodCategory?.description ?? ""
      return {
        externalFoodId: String(food.fdcId),
        name: food.description,
        dataType: food.dataType ?? "USDA",
        brandOwner: food.brandOwner ?? "",
        brandName: food.brandName ?? "",
        foodCategory,
        proteinPer100g: nutrientValue(nutrients, [1003], /^Protein$/i),
        carbsPer100g: nutrientValue(nutrients, [1005], /Carbohydrate, by difference/i),
        fatPer100g: nutrientValue(nutrients, [1004], /^Total lipid \(fat\)$/i),
        caloriesPer100g: nutrientValue(nutrients, [1008, 2047, 2048], /^Energy$/i),
      }
    })
    return NextResponse.json({ source: "USDA FoodData Central", foods })
  } catch {
    return NextResponse.json({ error: "Unable to reach USDA FoodData Central." }, { status: 502 })
  }
}

export type NormalizedLaneLocation = {
  originCity?: string | null
  originState?: string | null
  originZip?: string | null
  destinationCity?: string | null
  destinationState?: string | null
  destinationZip?: string | null
}

const stateCodes: Record<string, string> = {
  ALABAMA: "AL", FLORIDA: "FL", GEORGIA: "GA", KENTUCKY: "KY", LOUISIANA: "LA",
  MISSISSIPPI: "MS", "NORTH CAROLINA": "NC", "SOUTH CAROLINA": "SC", TENNESSEE: "TN", VIRGINIA: "VA",
}

const destinationRegions: Record<string, string> = {
  GA: "Georgia", TN: "Tennessee", NC: "North Carolina", SC: "South Carolina", KY: "Kentucky",
  VA: "Virginia", AL: "Alabama", MS: "Mississippi", LA: "Louisiana",
}

const floridaCities: Record<string, string> = {
  JACKSONVILLE: "North Florida", TALLAHASSEE: "North Florida", GAINESVILLE: "North Florida",
  PENSACOLA: "North Florida", "LAKE CITY": "North Florida",
  ORLANDO: "Central Florida", TAMPA: "Central Florida", LAKELAND: "Central Florida",
  OCALA: "Central Florida", "DAYTONA BEACH": "Central Florida",
  MIAMI: "South Florida", "FORT LAUDERDALE": "South Florida", "WEST PALM BEACH": "South Florida",
  HOLLYWOOD: "South Florida", HIALEAH: "South Florida",
}

export function normalizeState(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? ""
  if (/^[A-Z]{2}$/.test(normalized)) return normalized
  return stateCodes[normalized] ?? null
}

export function classifyFloridaZip(zip?: string | null) {
  const digits = zip?.replace(/\D/g, "") ?? ""
  if (digits.length < 5) return null
  const prefix = Number(digits.slice(0, 3))
  if (prefix === 321 || (prefix >= 327 && prefix <= 329) || (prefix >= 335 && prefix <= 348)) return "Central Florida"
  if ((prefix >= 330 && prefix <= 334) || prefix === 349) return "South Florida"
  if (prefix === 320 || (prefix >= 322 && prefix <= 326)) return "North Florida"
  return null
}

export function classifyDestinationPricingRegion(location: NormalizedLaneLocation) {
  const destinationState = normalizeState(location.destinationState)
  if (!destinationState) return null
  if (destinationState !== "FL") return destinationRegions[destinationState] ?? null

  const suppliedZip = Boolean(location.destinationZip?.trim())
  if (suppliedZip) return classifyFloridaZip(location.destinationZip)

  const city = location.destinationCity?.trim().toUpperCase() ?? ""
  return floridaCities[city] ?? null
}

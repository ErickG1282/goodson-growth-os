export type RouteEndpoint = { city: string | null; state: string | null; zip: string | null; streetAddress?: string | null }
export type MileageProvider = "TRIMBLE" | "PTV" | "UNSUPPORTED"
export type MileageResult = { status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE"; miles: number | null; provider: MileageProvider; routeType: "COMMERCIAL_TRUCK"; vehicleProfile: string; warnings: string[]; providerMetadata: Record<string, unknown>; reason?: string }
export interface MileageService { calculateRouteMiles(origin: RouteEndpoint, destination: RouteEndpoint): Promise<MileageResult> }
type Fetch = typeof fetch
const trimbleEndpoint = "https://pcmiler.alk.com/apis/rest/v1.0/Service.svc/route/routeReports?dataVersion=Current"
const ptvGeocodingEndpoint = "https://api.myptv.com/geocoding/v1/locations/by-text", ptvRoutingEndpoint = "https://api.myptv.com/routing/v1/routes"
const profile = (weight?: number) => `Class 8 Tractor-Trailer; 53 ft Dry Van; 13 ft 6 in; 102 in; 5 axles; ${weight ? `${weight} lb GVW` : "GVW not configured"}; non-hazmat`
function usable(stop: RouteEndpoint) { return Boolean(stop.zip?.trim() || (stop.city?.trim() && stop.state?.trim())) }
function address(stop: RouteEndpoint) { return { City: stop.city?.trim() || "", State: stop.state?.trim() || "", Zip: stop.zip?.trim() || "", Country: "US" } }
function searchText(stop: RouteEndpoint) { return [stop.streetAddress, stop.city, stop.state, stop.zip, "USA"].map((v) => v?.trim()).filter(Boolean).join(", ") }
function totalMiles(payload: unknown) { if (!Array.isArray(payload)) return null; for (const report of payload) { if (!report || typeof report !== "object") continue; const lines = (report as { ReportLines?: unknown }).ReportLines; if (!Array.isArray(lines) || !lines.length) continue; const raw = (lines.at(-1) as { TMiles?: unknown } | null)?.TMiles; const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN; if (Number.isFinite(value) && value >= 0) return Math.round(value) } return null }

export class TrimbleMapsMileageService implements MileageService {
  constructor(private readonly apiKey: string | undefined, private readonly request: Fetch = fetch, private readonly grossWeightLbs?: number) {}
  async calculateRouteMiles(origin: RouteEndpoint, destination: RouteEndpoint): Promise<MileageResult> {
    const warnings = this.grossWeightLbs ? [] : ["Gross vehicle weight is not configured; cargo weight was not substituted."]
    const audit = { provider: "TRIMBLE" as const, routeType: "COMMERCIAL_TRUCK" as const, vehicleProfile: profile(this.grossWeightLbs), warnings, providerMetadata: { dataVersion: "Current", vehicleType: "Truck", routingType: "Practical", highwayOnly: false, overrideRestrictions: false, distanceUnits: "Miles" } }
    if (!this.apiKey?.trim()) return { ...audit, status: "NOT_CONFIGURED", miles: null, reason: "TRIMBLE_MAPS_API_KEY is not configured." }
    if (!usable(origin) || !usable(destination)) return { ...audit, status: "UNAVAILABLE", miles: null, reason: "Origin and destination require a ZIP code or city and state." }
    try { const response = await this.request(trimbleEndpoint, { method: "POST", headers: { Authorization: this.apiKey.trim(), "Content-Type": "application/json" }, body: JSON.stringify({ ReportRoutes: [{ RouteId: "gbgs-email-intake", ReportTypes: [{ __type: "MileageReportType:http://pcmiler.alk.com/APIs/v1.0" }], Stops: [{ Address: address(origin), Region: 4 }, { Address: address(destination), Region: 4 }], Options: { VehicleType: 0, RoutingType: 0, HighwayOnly: false, OverrideRestrict: false, DistanceUnits: 0, TruckCfg: { Units: 0, Height: "162", Width: "102", Length: "636", Axles: 5, LCV: false, ...(this.grossWeightLbs ? { Weight: String(this.grossWeightLbs) } : {}) } } }] }), signal: AbortSignal.timeout(15_000) }); if (!response.ok) return { ...audit, status: "UNAVAILABLE", miles: null, reason: `Trimble Maps returned HTTP ${response.status}.` }; const miles = totalMiles(await response.json()); return miles === null ? { ...audit, status: "UNAVAILABLE", miles: null, reason: "Trimble Maps returned no valid truck mileage." } : { ...audit, status: "AVAILABLE", miles } } catch { return { ...audit, status: "UNAVAILABLE", miles: null, reason: "Trimble Maps mileage request failed." } }
  }
}

type Coordinate = { latitude: number; longitude: number }
type GeocodedStop = { referencePosition: Coordinate; roadAccessPosition?: Coordinate; address?: Record<string, unknown>; locationType?: string; precision: "EXACT_ADDRESS" | "LOCALITY"; safe: boolean; issue?: string }
function normalized(value: unknown) { return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") }
function waypoint(stop: GeocodedStop) {
  const reference = `${stop.referencePosition.latitude},${stop.referencePosition.longitude}`
  if (stop.precision === "LOCALITY") return reference
  const roadAccess = stop.roadAccessPosition ? `;roadAccessPosition=${stop.roadAccessPosition.latitude},${stop.roadAccessPosition.longitude}` : ""
  return `${reference}${roadAccess};includeLastMeters`
}
export class PtvTruckMileageProvider implements MileageService {
  constructor(private readonly apiKey: string | undefined, private readonly request: Fetch = fetch, private readonly grossWeightLbs = 80_000) {}
  private async geocode(stop: RouteEndpoint): Promise<GeocodedStop | null> {
    const url = new URL(ptvGeocodingEndpoint); url.searchParams.set("searchText", searchText(stop))
    const response = await this.request(url, { headers: { ApiKey: this.apiKey!.trim() }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json() as { locations?: Array<{ roadAccessPosition?: Coordinate; referencePosition?: Coordinate; address?: Record<string, unknown>; locationType?: string }> }
    const location = payload.locations?.[0], reference = location?.referencePosition
    if (!reference || !Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)) return null
    const requestedExact = Boolean(stop.streetAddress?.trim())
    const returnedZip = normalized(location.address?.postalCode), requestedZip = normalized(stop.zip)
    const returnedCity = normalized(location.address?.city), requestedCity = normalized(stop.city)
    const localityMatches = requestedZip ? returnedZip.startsWith(requestedZip.slice(0, 5)) : Boolean(requestedCity && returnedCity === requestedCity)
    const exactMatch = !requestedExact || (location.locationType === "EXACT_ADDRESS" && Boolean(normalized(location.address?.street)))
    return { referencePosition: reference, roadAccessPosition: location.roadAccessPosition, address: location.address, locationType: location.locationType, precision: requestedExact ? "EXACT_ADDRESS" : "LOCALITY", safe: localityMatches && exactMatch, issue: !localityMatches ? "Geocoder result does not match the requested city/postal code." : !exactMatch ? "Exact street address could not be resolved precisely." : undefined }
  }
  async calculateRouteMiles(origin: RouteEndpoint, destination: RouteEndpoint): Promise<MileageResult> {
    const weightKg = Math.round(this.grossWeightLbs * 0.45359237)
    const vehicle = { heightCm: 411, lengthCm: 1615, widthCm: 259, totalPermittedWeightKg: weightKg, numberOfAxles: 5, hazardousMaterials: "NONE", commercial: true }
    const audit = { provider: "PTV" as const, routeType: "COMMERCIAL_TRUCK" as const, vehicleProfile: profile(this.grossWeightLbs), warnings: [] as string[], providerMetadata: { profile: "USA_8_SEMITRAILER_5AXLE", routingMode: "FAST", trafficMode: "AVERAGE", distanceUnits: "meters", vehicle } }
    if (!this.apiKey?.trim()) return { ...audit, status: "NOT_CONFIGURED", miles: null, reason: "PTV_API_KEY is not configured." }
    if (!usable(origin) || !usable(destination)) return { ...audit, status: "UNAVAILABLE", miles: null, reason: "Origin and destination require a ZIP code or city and state." }
    try {
      const from = await this.geocode(origin), to = await this.geocode(destination)
      if (!from || !to) return { ...audit, status: "UNAVAILABLE", miles: null, reason: !from ? "PTV could not resolve the origin." : "PTV could not resolve the destination." }
      if (!from.safe || !to.safe) return { ...audit, providerMetadata: { ...audit.providerMetadata, geocoding: { origin: from, destination: to }, locationReviewRequired: true }, status: "UNAVAILABLE", miles: null, reason: `NEEDS_LOCATION_REVIEW: ${!from.safe ? `origin — ${from.issue}` : `destination — ${to.issue}`}` }
      const geocoding = { origin: from, destination: to }
      const url = new URL(ptvRoutingEndpoint)
      for (const stop of [from, to]) url.searchParams.append("waypoints", waypoint(stop))
      for (const [key, value] of Object.entries({ results: "VIOLATION_EVENTS", profile: "USA_8_SEMITRAILER_5AXLE", "options[routingMode]": "FAST", "options[trafficMode]": "AVERAGE", "vehicle[height]": "411", "vehicle[length]": "1615", "vehicle[width]": "259", "vehicle[totalPermittedWeight]": String(weightKg), "vehicle[numberOfAxles]": "5", "vehicle[hazardousMaterials]": "NONE", "vehicle[commercial]": "true" })) url.searchParams.set(key, value)
      const response = await this.request(url, { headers: { ApiKey: this.apiKey.trim() }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return { ...audit, providerMetadata: { ...audit.providerMetadata, geocoding, httpStatus: response.status }, status: "UNAVAILABLE", miles: null, reason: `PTV returned HTTP ${response.status}.` }
      const payload = await response.json() as { distance?: unknown; violated?: unknown; warnings?: unknown[]; events?: unknown[] }
      const meters = typeof payload.distance === "number" ? payload.distance : NaN
      const exactMiles = Number.isFinite(meters) && meters >= 0 ? meters / 1609.344 : null
      const warnings = (payload.warnings ?? []).map((warning) => typeof warning === "string" ? warning : warning && typeof warning === "object" && "warningCode" in warning ? String((warning as { warningCode: unknown }).warningCode) : JSON.stringify(warning))
      const violationEvents = payload.events ?? []
      const impreciseEndpointViolation = payload.violated === true && violationEvents.some((event) => { if (!event || typeof event !== "object") return false; const distance = Number((event as { distanceFromStart?: unknown }).distanceFromStart); return (!Number.isFinite(distance) ? false : (from.precision === "LOCALITY" && distance <= 5_000) || (to.precision === "LOCALITY" && Number.isFinite(meters) && meters - distance <= 5_000)) })
      const providerMetadata = { ...audit.providerMetadata, geocoding, waypointStrategy: { origin: from.precision === "LOCALITY" ? "ON_ROAD_REFERENCE_POSITION" : "EXACT_ADDRESS_OFF_ROAD", destination: to.precision === "LOCALITY" ? "ON_ROAD_REFERENCE_POSITION" : "EXACT_ADDRESS_OFF_ROAD" }, violated: payload.violated, distanceMeters: Number.isFinite(meters) ? meters : null, exactMiles, violationEvents, locationReviewRequired: impreciseEndpointViolation }
      if (!Number.isFinite(meters) || meters < 0 || payload.violated !== false) return { ...audit, warnings, providerMetadata, status: "UNAVAILABLE", miles: null, reason: payload.violated === true ? impreciseEndpointViolation ? "NEEDS_LOCATION_REVIEW: a locality-only endpoint matched to restricted truck access; provide the exact facility address." : "PTV returned a route containing truck-restriction violations." : "PTV returned no valid commercial truck mileage." }
      return { ...audit, warnings, providerMetadata, status: "AVAILABLE", miles: Math.round(exactMiles!) }
    } catch { return { ...audit, status: "UNAVAILABLE", miles: null, reason: "PTV commercial truck mileage request failed." } }
  }
}

class UnsupportedMileageProvider implements MileageService { async calculateRouteMiles(): Promise<MileageResult> { return { status: "NOT_CONFIGURED", miles: null, provider: "UNSUPPORTED", routeType: "COMMERCIAL_TRUCK", vehicleProfile: profile(), warnings: [], providerMetadata: {}, reason: "TRUCK_MILEAGE_PROVIDER must be set to PTV or TRIMBLE." } } }
export type MileageServiceOptions = { provider?: string; ptvApiKey?: string; trimbleApiKey?: string; request?: Fetch; grossWeightLbs?: number }
export function createMileageService(options: MileageServiceOptions = {}): MileageService { const provider = (options.provider ?? process.env.TRUCK_MILEAGE_PROVIDER)?.trim().toUpperCase(); const configuredWeight = options.grossWeightLbs ?? Number(process.env.TRIMBLE_TRUCK_GROSS_WEIGHT_LBS); const weight = Number.isFinite(configuredWeight) && configuredWeight >= 1500 ? configuredWeight : undefined; if (provider === "PTV") return new PtvTruckMileageProvider(options.ptvApiKey ?? process.env.PTV_API_KEY, options.request ?? fetch, weight ?? 80_000); if (provider === "TRIMBLE") return new TrimbleMapsMileageService(options.trimbleApiKey ?? process.env.TRIMBLE_MAPS_API_KEY, options.request ?? fetch, weight); return new UnsupportedMileageProvider() }

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createMileageService, PtvTruckMileageProvider, TrimbleMapsMileageService } from "../lib/freight-email/mileage-service"

const origin = { city: "Atlanta", state: "GA", zip: "30303" }
const destination = { city: "Jacksonville", state: "FL", zip: "32202" }
const locality = (latitude: number, longitude: number, city: string, postalCode: string) => ({ referencePosition: { latitude, longitude }, roadAccessPosition: { latitude: latitude + 0.001, longitude: longitude + 0.001 }, locationType: "LOCALITY", address: { city, postalCode } })

test("Trimble provider is safely not configured without an API key", async () => {
  let called = false
  const service = new TrimbleMapsMileageService(undefined, async () => { called = true; throw new Error("must not call") })
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(result.status, "NOT_CONFIGURED"); assert.equal(result.miles, null); assert.equal(result.reason, "TRIMBLE_MAPS_API_KEY is not configured.")
  assert.equal(called, false)
})

test("Trimble provider requests practical commercial-truck miles and parses a mocked response", async () => {
  const service = new TrimbleMapsMileageService("mock-key", async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, "mock-key")
    const request = JSON.parse(String(init?.body))
    assert.deepEqual(request.ReportRoutes[0].Options, { VehicleType: 0, RoutingType: 0, HighwayOnly: false, OverrideRestrict: false, DistanceUnits: 0, TruckCfg: { Units: 0, Height: "162", Width: "102", Length: "636", Axles: 5, LCV: false } })
    assert.equal(request.ReportRoutes[0].Stops[0].Address.Zip, "30303")
    return new Response(JSON.stringify([{ ReportLines: [{ TMiles: "0.000" }, { TMiles: "346.621" }] }]), { status: 200 })
  })
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(result.status, "AVAILABLE"); assert.equal(result.miles, 347); assert.equal(result.provider, "TRIMBLE"); assert.match(result.vehicleProfile, /53 ft Dry Van/)
})

test("Trimble provider returns unavailable for incomplete locations without calling the provider", async () => {
  let called = false
  const service = new TrimbleMapsMileageService("mock-key", async () => { called = true; throw new Error("must not call") })
  assert.equal((await service.calculateRouteMiles({ city: null, state: null, zip: null }, destination)).status, "UNAVAILABLE")
  assert.equal(called, false)
  assert.equal((await service.calculateRouteMiles(origin, { city: null, state: null, zip: null })).status, "UNAVAILABLE")
})

test("Trimble provider safely handles HTTP, malformed-response, and network failures", async () => {
  const http = new TrimbleMapsMileageService("mock-key", async () => new Response("denied", { status: 401 }))
  const auth = await http.calculateRouteMiles(origin, destination)
  assert.equal(auth.status, "UNAVAILABLE"); assert.equal(auth.miles, null); assert.equal(auth.reason, "Trimble Maps returned HTTP 401.")
  const malformed = new TrimbleMapsMileageService("mock-key", async () => new Response(JSON.stringify([{ ReportLines: [] }]), { status: 200 }))
  assert.equal((await malformed.calculateRouteMiles(origin, destination)).status, "UNAVAILABLE")
  const network = new TrimbleMapsMileageService("mock-key", async () => { throw new Error("offline") })
  assert.equal((await network.calculateRouteMiles(origin, destination)).status, "UNAVAILABLE")
  const timeout = new TrimbleMapsMileageService("mock-key", async () => { throw new DOMException("timed out", "TimeoutError") })
  assert.equal((await timeout.calculateRouteMiles(origin, destination)).miles, null)
  const notFound = new TrimbleMapsMileageService("mock-key", async () => new Response("route not found", { status: 404 }))
  assert.equal((await notFound.calculateRouteMiles(origin, destination)).miles, null)
})

test("configured gross weight is sent independently from cargo weight", async () => {
  const service = new TrimbleMapsMileageService("mock-key", async (_url, init) => {
    const request = JSON.parse(String(init?.body))
    assert.equal(request.ReportRoutes[0].Options.TruckCfg.Weight, "80000")
    return new Response(JSON.stringify([{ ReportLines: [{ TMiles: "347" }] }]), { status: 200 })
  }, 80000)
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(result.status, "AVAILABLE"); assert.match(result.vehicleProfile, /80000 lb GVW/)
})

test("PTV provider is safely not configured and makes no request without a key", async () => {
  let called = false
  const result = await new PtvTruckMileageProvider(undefined, async () => { called = true; throw new Error("must not call") }).calculateRouteMiles(origin, destination)
  assert.equal(result.status, "NOT_CONFIGURED"); assert.equal(result.miles, null); assert.equal(called, false)
})

test("PTV resolves stops, requests a legal Class 8 truck route, and converts meters", async () => {
  let call = 0
  const service = new PtvTruckMileageProvider("server-secret", async (input, init) => {
    const url = new URL(String(input)); assert.equal((init?.headers as Record<string, string>).ApiKey, "server-secret")
    if (++call <= 2) return new Response(JSON.stringify({ locations: [call === 1 ? locality(33.75, -84.39, "Atlanta", "30303") : locality(30.33, -81.66, "Jacksonville", "32202")] }), { status: 200 })
    assert.equal(url.origin + url.pathname, "https://api.myptv.com/routing/v1/routes")
    assert.equal(url.searchParams.get("results"), "VIOLATION_EVENTS")
    assert.equal(url.searchParams.get("profile"), "USA_8_SEMITRAILER_5AXLE")
    assert.equal(url.searchParams.get("options[routingMode]"), "FAST")
    assert.deepEqual(url.searchParams.getAll("waypoints"), ["33.75,-84.39", "30.33,-81.66"])
    assert.equal(url.searchParams.get("vehicle[height]"), "411"); assert.equal(url.searchParams.get("vehicle[length]"), "1615"); assert.equal(url.searchParams.get("vehicle[width]"), "259")
    assert.equal(url.searchParams.get("vehicle[totalPermittedWeight]"), "36287"); assert.equal(url.searchParams.get("vehicle[numberOfAxles]"), "5"); assert.equal(url.searchParams.get("vehicle[hazardousMaterials]"), "NONE"); assert.equal(url.searchParams.get("vehicle[commercial]"), "true")
    return new Response(JSON.stringify({ distance: 558_630.912, violated: false, warnings: [] }), { status: 200 })
  })
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(call, 3); assert.equal(result.status, "AVAILABLE"); assert.equal(result.miles, 347); assert.equal(result.provider, "PTV"); assert.equal(result.routeType, "COMMERCIAL_TRUCK")
  assert.ok(Math.abs(Number(result.providerMetadata.exactMiles) - 347.117) < 0.001)
})

test("PTV returns null with no fallback for invalid stops, route violations, errors, and malformed responses", async () => {
  let called = false
  assert.equal((await new PtvTruckMileageProvider("key", async () => { called = true; throw new Error() }).calculateRouteMiles({ city: null, state: null, zip: null }, destination)).miles, null); assert.equal(called, false)
  const responses = [{ distance: 1000, violated: true }, { violated: false }, { distance: "1000", violated: false }]
  for (const route of responses) { let n = 0; const service = new PtvTruckMileageProvider("key", async () => ++n < 3 ? new Response(JSON.stringify({ locations: [n === 1 ? locality(1, 2, "Atlanta", "30303") : locality(3, 4, "Jacksonville", "32202")] })) : new Response(JSON.stringify(route))); const result = await service.calculateRouteMiles(origin, destination); assert.equal(result.status, "UNAVAILABLE"); assert.equal(result.miles, null) }
  const auth = new PtvTruckMileageProvider("key", async () => new Response("denied", { status: 401 })); assert.equal((await auth.calculateRouteMiles(origin, destination)).miles, null)
  const rate = new PtvTruckMileageProvider("key", async () => new Response("limited", { status: 429 })); assert.equal((await rate.calculateRouteMiles(origin, destination)).miles, null)
  const network = new PtvTruckMileageProvider("key", async () => { throw new Error("offline") }); assert.equal((await network.calculateRouteMiles(origin, destination)).miles, null)
})

test("PTV preserves violated-route distance, geocodes, and violation events without accepting the mileage", async () => {
  let call = 0
  const event = { latitude: 39.9, longitude: -83.0, distanceFromStart: 900000, violation: { type: "VEHICLE_PROPERTY", accessType: "ENTER" } }
  const service = new PtvTruckMileageProvider("key", async () => {
    if (++call === 1) return new Response(JSON.stringify({ locations: [locality(34.12, -84.00, "Atlanta", "30303")] }))
    if (call === 2) return new Response(JSON.stringify({ locations: [locality(39.85, -82.89, "Jacksonville", "32202")] }))
    return new Response(JSON.stringify({ distance: 957560, violated: true, events: [event], warnings: [{ warningCode: "ROUTING_TEST_WARNING" }] }))
  })
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(result.status, "UNAVAILABLE"); assert.equal(result.miles, null)
  assert.equal(result.providerMetadata.distanceMeters, 957560); assert.ok(Number(result.providerMetadata.exactMiles) > 594)
  assert.deepEqual(result.providerMetadata.violationEvents, [event]); assert.equal((result.providerMetadata.geocoding as { origin: { address: { postalCode: string } } }).origin.address.postalCode, "30303")
  assert.deepEqual(result.warnings, ["ROUTING_TEST_WARNING"])
})

test("PTV exact addresses use off-road last-meter routing with the geocoded road access", async () => {
  let call = 0
  const exactOrigin = { ...origin, streetAddress: "100 Freight Way" }, exactDestination = { ...destination, streetAddress: "200 Logistics Blvd" }
  const service = new PtvTruckMileageProvider("key", async (input) => {
    if (++call <= 2) { const first = call === 1; return new Response(JSON.stringify({ locations: [{ referencePosition: { latitude: first ? 33.7 : 30.3, longitude: first ? -84.3 : -81.6 }, roadAccessPosition: { latitude: first ? 33.71 : 30.31, longitude: first ? -84.31 : -81.61 }, locationType: "EXACT_ADDRESS", address: { city: first ? "Atlanta" : "Jacksonville", postalCode: first ? "30303" : "32202", street: first ? "Freight Way" : "Logistics Blvd" } }] })) }
    const url = new URL(String(input)); assert.deepEqual(url.searchParams.getAll("waypoints"), ["33.7,-84.3;roadAccessPosition=33.71,-84.31;includeLastMeters", "30.3,-81.6;roadAccessPosition=30.31,-81.61;includeLastMeters"])
    return new Response(JSON.stringify({ distance: 500000, violated: false }))
  })
  const result = await service.calculateRouteMiles(exactOrigin, exactDestination)
  assert.equal(result.status, "AVAILABLE"); assert.deepEqual(result.providerMetadata.waypointStrategy, { origin: "EXACT_ADDRESS_OFF_ROAD", destination: "EXACT_ADDRESS_OFF_ROAD" })
})

test("PTV locality endpoint restriction requires location review and never accepts the distance", async () => {
  let call = 0
  const service = new PtvTruckMileageProvider("key", async () => ++call === 1 ? new Response(JSON.stringify({ locations: [locality(34.08, -83.95, "Atlanta", "30303")] })) : call === 2 ? new Response(JSON.stringify({ locations: [locality(39.85, -82.90, "Jacksonville", "32202")] })) : new Response(JSON.stringify({ distance: 963237, violated: true, events: [{ distanceFromStart: 0, violation: { type: "VEHICLE_PROPERTY", violatedVehicleProperties: [{ property: "WEIGHT", limit: 16329 }] } }] })))
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(result.status, "UNAVAILABLE"); assert.equal(result.miles, null); assert.match(result.reason ?? "", /^NEEDS_LOCATION_REVIEW:/); assert.equal(result.providerMetadata.locationReviewRequired, true)
})

test("PTV mismatched or imprecise geocode is unsafe and routing is not attempted", async () => {
  let calls = 0
  const service = new PtvTruckMileageProvider("key", async () => { calls++; return new Response(JSON.stringify({ locations: [locality(1, 2, "Wrong City", "99999")] })) })
  const result = await service.calculateRouteMiles(origin, destination)
  assert.equal(calls, 2); assert.equal(result.status, "UNAVAILABLE"); assert.equal(result.miles, null); assert.match(result.reason ?? "", /^NEEDS_LOCATION_REVIEW:/)
})

test("provider selection supports PTV and Trimble and rejects invalid configuration", async () => {
  assert.ok(createMileageService({ provider: "PTV", ptvApiKey: "key" }) instanceof PtvTruckMileageProvider)
  assert.ok(createMileageService({ provider: "TRIMBLE", trimbleApiKey: "key" }) instanceof TrimbleMapsMileageService)
  const invalid = await createMileageService({ provider: "CAR" }).calculateRouteMiles(origin, destination)
  assert.equal(invalid.status, "NOT_CONFIGURED"); assert.equal(invalid.provider, "UNSUPPORTED"); assert.equal(invalid.miles, null)
})

test("mileage history migration is append-only and owner scoped", () => {
  const sql = readFileSync("supabase/migrations/20260831_create_truck_mileage_calculations.sql", "utf8")
  assert.match(sql, /foreign key \(load_opportunity_id, user_id\)/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /for select to authenticated/)
  assert.match(sql, /for insert to authenticated/)
  assert.doesNotMatch(sql, /for (?:update|delete) to authenticated/i)
})

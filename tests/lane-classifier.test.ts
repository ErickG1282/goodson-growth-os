import test from "node:test"
import assert from "node:assert/strict"
import { classifyDestinationPricingRegion } from "../lib/freight-quoting/lane-classifier"

test("ordinary destination states map deterministically", () => {
  assert.equal(classifyDestinationPricingRegion({ destinationState: "AL" }), "Alabama")
  assert.equal(classifyDestinationPricingRegion({ destinationState: "North Carolina" }), "North Carolina")
})

test("Florida ZIP is preferred and classifies each region", () => {
  assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: "Miami", destinationZip: "33101" }), "South Florida")
  assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: "Orlando", destinationZip: "32801" }), "Central Florida")
  assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: "Jacksonville", destinationZip: "32202" }), "North Florida")
})

test("maintained Florida city mapping is used when ZIP is absent", () => {
  for (const city of ["Jacksonville", "Tallahassee", "Gainesville", "Pensacola", "Lake City"]) assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: city }), "North Florida")
  for (const city of ["Orlando", "Tampa", "Lakeland", "Ocala", "Daytona Beach"]) assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: city }), "Central Florida")
  for (const city of ["Miami", "Fort Lauderdale", "West Palm Beach", "Hollywood", "Hialeah"]) assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: city }), "South Florida")
})

test("unclassified destination returns null", () => {
  assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: "Unknown Place" }), null)
  assert.equal(classifyDestinationPricingRegion({ destinationState: "FL", destinationCity: "Miami", destinationZip: "99999" }), null)
})

# OpenGripsWebFormulas

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Language-agnostic mathematical specification and canonical JSON test vectors for the **OpenGrips Ideal Force Curve** and related training utilities.

Instead of manually porting and maintaining copies of logic across services, each project implements the equations from [`SPEC.md`](./SPEC.md) in its own idiomatic language and runs [`test-vectors.json`](./test-vectors.json) directly inside its unit test suite.

This spec is an export of the [OpenGrips web](https://opengrips.xyz/) app's force curve implementation.

---

## Repository Contents

| File                                                             | Description                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`SPEC.md`](./SPEC.md)                                           | Mathematical specification: constants, formulas, rounding semantics, and edge cases.                                                                                                                                                                           |
| [`test-vectors.json`](./test-vectors.json)                       | Canonical JSON test vectors covering `minWeight`, `k`, `W(t)`, `t(W)`, `deriveBenchmarkWeight`, section classification, section bounds & suggestions, rep targets per section, manual energy curve rep targets, and dataset aggregation (all weights in `kg`). |
| [`test-vectors.schema.json`](./test-vectors.schema.json)         | JSON Schema (Draft 2020-12) describing the structure of `test-vectors.json`.                                                                                                                                                                                   |
| [`reference/workoutCurve.ts`](./reference/workoutCurve.ts)       | Standalone TypeScript reference implementation matching `OpenGripsWeb/utils/functions/workoutCurve.ts` and related helpers.                                                                                                                                    |
| [`scripts/generate-vectors.mjs`](./scripts/generate-vectors.mjs) | Zero-dependency Node.js generator and self-verification script that builds `test-vectors.json`.                                                                                                                                                                |
| [`LICENSE`](./LICENSE)                                           | MIT License.                                                                                                                                                                                                                                                   |

---

## What Is Covered

1. **Ideal Force Curve (`idealForceCurve`)**
    - `minWeight(benchmarkWeight)`
    - Decay constant `k(benchmarkWeight)`
    - Weight at time `W(t, benchmarkWeight)`
    - Continuous and integer-rounded ideal hang times `calculateIdealTimeContinuous(W, W5)` and `calculateIdealTime(W, W5)`
2. **Benchmark Derivation (`deriveBenchmarkWeight`)**
    - Binary-search inversion from an observed `(weightKg, timeHeldSeconds)` hold to theoretical 5-second max weight `W5`, plus round-trip and edge-case vectors.
3. **Section Classification & Boundaries (`sectionClassification`)**
    - Benchmark-driven band classification (`getCurveSectionByBenchmarkWeight`)
    - Normalized-X fallback classification (`getCurveSectionByNormalizedX`)
    - Combined `getCurveSection`, `getSectionProgress`, per-section `suggestedWeightKg`, and section lower/upper weight boundaries.
4. **Repetition Targets Per Section (`repTargetsPerSection`)**
    - Section model rep ratios (`SECTION_CURVE_MODEL[section].repRatios`) across reps `1..8`
5. **Manual Energy System Curve (`manualEnergyCurve`)**
    - Coupled slider bounds (`getPowerEnduranceMin`, `getPowerMin`, `getPowerMax`)
    - Exponential tail-blended rep targets (`power`, `powerEndurance`, `endurance`)
6. **Force Curve Dataset Aggregation (`forceCurveDataset`)**
    - End-to-end `buildForceCurveDataset` vectors (all weights in `kg`) including fallback from `actual_result_times` to `target_times`, tool-specific benchmark lookup, and section coverage counts.

---

## Using the Test Vectors in Your Project

Copy `test-vectors.json` (or include this repository as a git submodule / CI fetch) into your project's test fixtures and iterate over the suites:

### TypeScript / JavaScript (`node:test` or Vitest / Jest)

```ts
import assert from "node:assert/strict"
import vectors from "./test-vectors.json" assert { type: "json" }

const tol = vectors.metadata.tolerances.floatTolerance

for (const curve of vectors.idealForceCurve) {
	assert.ok(Math.abs(myMinWeight(curve.benchmarkWeightKg) - curve.minWeightKg) <= tol)
	assert.ok(Math.abs(myDecayConstant(curve.benchmarkWeightKg) - curve.k) <= tol)

	for (const sample of curve.idealTimeSamples) {
		assert.ok(
			Math.abs(
				myIdealTimeContinuous(sample.weightKg, curve.benchmarkWeightKg) - sample.idealTimeContinuousSeconds,
			) <= tol,
		)
		assert.equal(myIdealTime(sample.weightKg, curve.benchmarkWeightKg), sample.idealTimeSeconds)
	}
}
```

### Python (`pytest`)

```python
import json
from pathlib import Path

vectors = json.loads(Path("test-vectors.json").read_text(encoding="utf-8"))
tol = vectors["metadata"]["tolerances"]["floatTolerance"]
bench_tol = vectors["metadata"]["tolerances"]["benchmarkDerivationTolerance"]

def test_ideal_force_curve():
    for curve in vectors["idealForceCurve"]:
        w5 = curve["benchmarkWeightKg"]
        assert abs(min_weight(w5) - curve["minWeightKg"]) <= tol
        assert abs(decay_k(w5) - curve["k"]) <= tol
        for s in curve["idealTimeSamples"]:
            assert abs(ideal_time_continuous(s["weightKg"], w5) - s["idealTimeContinuousSeconds"]) <= tol
            assert ideal_time(s["weightKg"], w5) == s["idealTimeSeconds"]

def test_derive_benchmark():
    for case in vectors["deriveBenchmarkWeight"]:
        got = derive_benchmark_weight(case["weightKg"], case["timeHeldSeconds"])
        assert abs(got - case["expectedBenchmarkWeightKg"]) <= bench_tol
```

### Swift (`XCTest` / Swift Testing) & Kotlin (`JUnit`)

- Decode `test-vectors.json` with `JSONDecoder` (`Codable`) in Swift or `kotlinx.serialization` / `Gson` / `Moshi` in Kotlin.
- Use `XCTAssertEqual(actual, expected, accuracy: floatTolerance)` in Swift or `assertEquals(expected, actual, floatTolerance)` in JUnit for floating-point values, and equality for integer rep/time targets and section names.

---

## Regenerating and Verifying Vectors

Requires **Node.js 24+** (no external packages needed):

```bash
node scripts/generate-vectors.mjs
```

The script writes `test-vectors.json` and runs built-in invariant checks before exiting.

---

## License

This project is licensed under the [MIT License](./LICENSE).


# OpenGripsWeb Force Curve Specification

**Version:** `1.0.0`

This document specifies the mathematical models, constants, edge-case rules, and utility algorithms used by OpenGripsWeb for the **Ideal Force Curve**, **5-Second Benchmark Derivation**, **Curve Section Classification**, and **Workout Calculations**. All weights in this specification are in kilograms (`kg`).

Any client or backend application (TypeScript, Swift, Kotlin, Python, Rust, Go, etc.) should implement against this specification and validate its behavior against [`test-vectors.json`](./test-vectors.json) in its own test suite rather than copying and drifting manual ports of code.

---

## Table of Contents

1. [Conventions & Primitive Helpers](#1-conventions--primitive-helpers)
2. [Constants & Section Tables](#2-constants--section-tables)
3. [Ideal Force Curve Mathematical Model](#3-ideal-force-curve-mathematical-model)
4. [Deriving 5-Second Benchmark Weight (`deriveBenchmarkWeight`)](#4-deriving-5-second-benchmark-weight-derivebenchmarkweight)
5. [Section Classification, Boundaries & Suggested Weights](#5-section-classification-boundaries--suggested-weights)
6. [Workout Calculations](#6-workout-calculations)
7. [Test Vector Tolerances & Verification Guide](#7-test-vector-tolerances--verification-guide)

---

## 1. Conventions & Primitive Helpers

### 1.1 Units & Precision

- **Weight:** Kilograms (`kg`) for all calculations.
- **Time:** Seconds (`s`).
- **Numeric Representation:** IEEE 754 double-precision floating-point
  (`float64`).

### 1.2 Rounding Semantics

- **`round(x)` (integer rounding):** Matches JavaScript `Math.round(x)`, i.e. `floor(x + 0.5)`. For non-negative values, half-way `.5` values round up (away from zero).
- **`roundToTwo(x)`:** Matches JavaScript `Number(x.toFixed(2))` - rounds `x` to 2 decimal places as a `float64`.

### 1.3 Primitive Helpers

```text
clamp(value, minVal, maxVal) = min(max(value, minVal), maxVal)

normalize(value, minVal, maxVal):
  if maxVal == minVal: return 0
  return (clamp(value, minVal, maxVal) - minVal) / (maxVal - minVal)

lerp(start, end, t) = start + (end - start) * t

average(values):
  if length(values) == 0: return null
  return sum(values) / length(values)
```

---

## 2. Constants & Section Tables

### 2.1 Core Scalar Constants

| Constant                               | Value / Expression | Float64 Value        | Description                                                                                         |
| -------------------------------------- | ------------------ | -------------------- | --------------------------------------------------------------------------------------------------- |
| `BALANCED_RATIO`                       | `2 / 3`            | `0.6666666666666666` | Balanced anchor weight relative to 5s max benchmark ($W_{\text{balanced}} = W_5 \cdot \frac{2}{3}$) |
| `CURVE_T0_SECONDS`                     | `5`                | `5`                  | Anchor time $t_0$ for 5-second max power benchmark                                                  |
| `CURVE_T_END_SECONDS`                  | `193`              | `193`                | Anchor time $t_{\text{end}}$ where the curve reaches `minWeight`                                    |
| `ENDURANCE_MIN_WEIGHT_OFFSET_KG`       | `10`               | `10`                 | Offset subtracted from Endurance balanced weight to form `minWeight`                                |
| `MIN_CURVE_WEIGHT_FLOOR_KG`            | `1`                | `1`                  | Hard lower bound (`kg`) for `minWeight`                                                             |
| `EPSILON`                              | `1e-6`             | `0.000001`           | Numerical stability floor for division and logarithms                                               |
| `DEFAULT_FIRST_HANG_TARGET`            | `40`               | `40`                 | Default first-rep target (`s`)                                                                      |
| `DEFAULT_REPS`                         | `6`                | `6`                  | Default rep count                                                                                   |
| `DEFAULT_REST`                         | `20`               | `20`                 | Default rest between reps (`s`)                                                                     |
| `DEFAULT_POWER`                        | `0.4`              | `0.4`                | Default manual energy slider: power                                                                 |
| `DEFAULT_POWER_ENDURANCE`              | `0.25`             | `0.25`               | Default manual energy slider: power-endurance                                                       |
| `DEFAULT_ENDURANCE`                    | `0.15`             | `0.15`               | Default manual energy slider: endurance                                                             |
| `MIN_ENDURANCE`                        | `0.05`             | `0.05`               | Minimum manual endurance slider value                                                               |
| `MAX_ENDURANCE`                        | `0.2`              | `0.2`                | Maximum manual endurance slider value                                                               |
| `MIN_POWER_ENDURANCE`                  | `0.17`             | `0.17`               | Minimum manual power-endurance slider value                                                         |
| `MAX_POWER_ENDURANCE`                  | `0.37`             | `0.37`               | Maximum manual power-endurance slider value                                                         |
| `MIN_POWER`                            | `0.22`             | `0.22`               | Minimum manual power slider value                                                                   |
| `MAX_POWER`                            | `0.85`             | `0.85`               | Maximum manual power slider value                                                                   |
| `ENDURANCE_WEIGHT_FROM_BALANCED_RATIO` | `0.3`              | `0.3`                | Fallback endurance weight ratio relative to balanced weight                                         |
| `POWER_FIRST_REP_SECONDS`              | `40`               | `40`                 | Continuum baseline first-rep time (`s`) at Power end                                                |
| `ENDURANCE_FIRST_REP_SECONDS`          | `195`              | `195`                | Continuum baseline first-rep time (`s`) at Endurance end                                            |
| `SECTION_WEIGHT_CURVE_EXPONENT`        | `1.25`             | `1.25`               | Exponent for fallback weight progress interpolation                                                 |
| `SECTION_TIME_CURVE_EXPONENT`          | `0.72`             | `0.72`               | Exponent for fallback time progress interpolation                                                   |

### 2.2 Ordered Curve Sections (`CURVE_SECTIONS`)

The five curve sections are ordered strictly from lowest weight / longest duration to highest weight / shortest duration:

```json
["Endurance", "Strength/Endurance", "Strength", "Power/Strength", "Power"]
```

### 2.3 Section Curve Model (`SECTION_CURVE_MODEL`)

Each section defines its target weight ratio relative to `balancedPowerWeight` ($W_{\text{balanced}} = W_5 \cdot \frac{2}{3}$), section classification boundaries (`ratioOfSectionBottom`, `ratioOfSectionTop`), nominal first-rep target duration (`firstRepTargetSeconds`), and per-rep target duration ratios (`repRatios`):

| Section              | `weightRatioOfBalanced` | `ratioOfSectionBottom` | `ratioOfSectionTop` | `firstRepTargetSeconds` | `repRatios`                         |
| -------------------- | ----------------------- | ---------------------- | ------------------- | ----------------------- | ----------------------------------- |
| `Endurance`          | `0.3409091`             | `0`                    | `0.3901515`         | `193`                   | `[1, 0.285, 0.223, 0.202]`          |
| `Strength/Endurance` | `0.4393939`             | `0.3901515`            | `0.51893935`        | `146`                   | `[1, 0.342, 0.295, 0.24]`           |
| `Strength`           | `0.5984848`             | `0.51893935`           | `0.7310606`         | `101`                   | `[1, 0.356, 0.287, 0.257, 0.228]`   |
| `Power/Strength`     | `0.8636364`             | `0.7310606`            | `0.9318182`         | `56`                    | `[1, 0.357, 0.232, 0.214, 0.196]`   |
| `Power`              | `1`                     | `0.9318182`            | `100`               | `40`                    | `[1, 0.375, 0.25, 0.225, 0.2, 0.2]` |

> **Derivation note:** Interior section boundaries are midpoints between
> adjacent `weightRatioOfBalanced` values:
>
> - `0.3409091 + (0.4393939 - 0.3409091) / 2 = 0.3901515`
> - `0.4393939 + (0.5984848 - 0.4393939) / 2 = 0.51893935`
> - `0.5984848 + (0.8636364 - 0.5984848) / 2 = 0.7310606`
> - `0.8636364 + (1 - 0.8636364) / 2 = 0.9318182`

### 2.4 Session Templates (`SESSION_TEMPLATES`)

| Section              | `reps` | `rest` | `power` | `powerEndurance` | `endurance` | `defaultFirstHangTarget` |
| -------------------- | ------ | ------ | ------- | ---------------- | ----------- | ------------------------ |
| `Endurance`          | `4`    | `20`   | `0.74`  | `0.37`           | `0.2`       | `90`                     |
| `Strength/Endurance` | `4`    | `20`   | `0.62`  | `0.31`           | `0.17`      | `72`                     |
| `Strength`           | `5`    | `20`   | `0.52`  | `0.27`           | `0.15`      | `56`                     |
| `Power/Strength`     | `5`    | `20`   | `0.41`  | `0.22`           | `0.12`      | `42`                     |
| `Power`              | `6`    | `20`   | `0.3`   | `0.17`           | `0.05`      | `30`                     |

---

## 3. Ideal Force Curve Mathematical Model

The ideal force curve models maximum sustainable hang weight $W(t)$ as a single exponential decay anchored at two points:

1. **5-second max power benchmark** $(t_0 = 5,\; W_5 = \text{benchmarkWeight})$.
2. **Endurance tail anchor**
   $(t_{\text{end}} = 193,\; W_{\text{min}} = \text{minWeight}(W_5))$.

### 3.1 Minimum Curve Weight (`minWeight`)

```math
\text{minWeight}(W_5) = \max\left(1,\; W_5 \cdot \text{BALANCED\_RATIO} \cdot 0.3409091 - 10\right)
```

Where:

- $\text{BALANCED\_RATIO} = \frac{2}{3}$
- $0.3409091 = \text{SECTION\_CURVE\_MODEL.Endurance.weightRatioOfBalanced}$

**Domain behavior:**

- When $W_5 \cdot \frac{2}{3} \cdot 0.3409091 - 10 \le 1$ (which occurs for
  $W_5 \le 48.399998\text{ kg}$), `minWeight` clamps to `1` kg.
- Above $48.4\text{ kg}$, `minWeight` scales linearly with $W_5$.

### 3.2 Exponential Decay Constant (`k`)

Solving $W(t_{\text{end}}) = \text{minWeight}$ in
$W(t) = W_5 \cdot e^{-k(t - t_0)}$:

```math
k(W_5) = -\frac{\ln\left(\max\left(\frac{\text{minWeight}(W_5)}{\max(W_5,\; 10^{-6})},\; 10^{-6}\right)\right)}{193 - 5}
```

Equivalently:

- `t0 = 5`, `tEnd = 193` (so `tEnd - t0 = 188`).
- `denom = max(W_5, 1e-6)`
- `ratio = max(minWeight(W_5) / denom, 1e-6)`
- `k = -ln(ratio) / 188`

> **Edge case:** If $W_5 = 1\text{ kg}$, then $\text{minWeight}(1) = 1$, $\text{ratio} = 1$, $\ln(1) = 0$, so $k = -0 / 188$ (evaluates to `0` when compared with `k === 0`).

### 3.3 Weight as a Function of Time (`W(t)`)

Given $t \ge t_0$ and benchmark $W_5$:

```math
W(t, W_5) = W_5 \cdot e^{-k(W_5) \cdot (t - 5)}
```

**Graph sampling convention (used in UI rendering):**

- Sample $t = 5, 7, 9, \dots, t_{\max}$ (step of `2` seconds).
- Stop sampling immediately if $W(t, W_5) < \text{minWeight}(W_5)$.

### 3.4 Ideal Target Time (`t(W)`): `calculateIdealTimeContinuous` and `calculateIdealTime`

Inverting $W(t) = W_5 \cdot e^{-k(t - 5)}$ for $t$:

```math
t_{\text{raw}}(W, W_5) = 5 - \frac{\ln\left(\frac{W}{\max(W_5,\; 10^{-6})}\right)}{k(W_5)}
```

**Algorithm:**

```text
calculateIdealTimeContinuous(weightKg, benchmarkWeight):
  t0 = 5
  tEnd = 193
  minWeight = max(1, benchmarkWeight * (2 / 3) * 0.3409091 - 10)
  k = -ln(max(minWeight / max(benchmarkWeight, 1e-6), 1e-6)) / (tEnd - t0)
  if k == 0:
    return 0
  idealTime = t0 - ln(weightKg / max(benchmarkWeight, 1e-6)) / k
  return max(1, idealTime)

calculateIdealTime(weightKg, benchmarkWeight):
  // Same computation as above, except:
  return max(1, round(idealTime))
```

**Important edge cases:**

- If $k = 0$, both functions return `0`.
- If $W = W_5$ and $k > 0$, `idealTime = 5`.
- If $W = \text{minWeight}(W_5)$ and
  $\frac{\text{minWeight}(W_5)}{\max(W_5, 10^{-6})} \ge 10^{-6}$,
  `idealTime = 193`.
- If $W > W_5$ sufficiently far that $t_{\text{raw}} < 1$, both functions clamp
  up to `1`.

---

## 4. Deriving 5-Second Benchmark Weight (`deriveBenchmarkWeight`)

Given an observed hang at weight `weightKg` ($W$) held for duration `timeHeld` ($T$ seconds), `deriveBenchmarkWeight(weightKg, timeHeld)` finds the theoretical 5-second max power benchmark $W_5$ such that `calculateIdealTimeContinuous(W, W_5) ≈ T`.

Because `calculateIdealTimeContinuous(W, W_5)` is strictly increasing with respect to $W_5$ (in the non-clamped domain), OpenGrips uses a **fixed 100-iteration binary search**:

```text
deriveBenchmarkWeight(weightKg, timeHeld):
  if weightKg <= 0 or timeHeld <= 5:
    return weightKg

  low = weightKg
  high = max(weightKg * 100, 1000)

  for i = 0 to 99:
    mid = (low + high) / 2
    computedTime = calculateIdealTimeContinuous(weightKg, mid)
    if computedTime > timeHeld:
      high = mid
    else:
      low = mid

  return (low + high) / 2
```

**Notes for implementers:**

- Use the same `low`, `high`, and `100` iterations (or stop only within $< 10^{-12}$, though 100 bisections already reaches machine epsilon $\approx 2^{-100} \cdot \text{high}$) so outputs match up to IEEE 754 precision.
- Notice `deriveBenchmarkWeight` has an upper search bound of `max(weightKg * 100, 1000)`. If a user holds a weight for longer than `calculateIdealTimeContinuous(weightKg, high)`, `low` converges to `high` and returns `high`.

---

## 5. Section Classification, Boundaries & Suggested Weights

### 5.1 Balanced Power Weight

```math
W_{\text{balanced}} = W_5 \cdot \text{BALANCED\_RATIO} = W_5 \cdot \frac{2}{3}
```

### 5.2 Benchmark-Driven Classification (`getCurveSectionByBenchmarkWeight`)

```text
getCurveSectionByBenchmarkWeight(usedWeightKg, maxPowerBenchmarkKg):
  if !isFinite(usedWeightKg) or maxPowerBenchmarkKg <= 0:
    return "Power"

  if !isFinite(maxPowerBenchmarkKg) or usedWeightKg <= 0:
    return "Endurance"

  balancedPowerWeight = maxPowerBenchmarkKg * (2 / 3)
  ratioToBalanced = usedWeightKg / balancedPowerWeight

  for section in CURVE_SECTIONS: // ["Endurance", "Strength/Endurance", "Strength", "Power/Strength", "Power"]
    if ratioToBalanced <= SECTION_CURVE_MODEL[section].ratioOfSectionTop:
      return section

  return "Power"
```

### 5.3 Normalized-X Classification (`getCurveSectionByNormalizedX`)

Used as a fallback when no benchmark is available:

```text
getCurveSectionByNormalizedX(normalizedX):
  index = min(4, max(0, floor(normalizedX * 5)))
  return CURVE_SECTIONS[index]
```

> Note: When `normalizedX == 1.0`, `floor(1.0 * 5) = 5`, which clamps to index `4` (`"Power"`).

### 5.4 Combined Classification (`getCurveSection`)

```text
getCurveSection(usedWeightKg, benchmarkWeightKg = null, weightMin = null, weightMax = null):
  if benchmarkWeightKg is truthy and benchmarkWeightKg > 0:
    return getCurveSectionByBenchmarkWeight(usedWeightKg, benchmarkWeightKg)

  minW = weightMin ?? 20
  maxW = weightMax ?? max(minW + 1, usedWeightKg)
  normalizedX = normalize(usedWeightKg, minW, maxW)
  return getCurveSectionByNormalizedX(normalizedX)
```

### 5.5 Section Progress (`getSectionProgress`)

```text
getSectionProgress(section):
  sectionIndex = indexOf(CURVE_SECTIONS, section) // 0..4 (or -1 if invalid)
  return clamp(sectionIndex / 4, 0, 1)
```

Maps the 5 sections to `[0, 0.25, 0.5, 0.75, 1.0]`.

### 5.6 Section Suggested Weight & Graph Boundaries

For a known benchmark $W_5$ (with `minWeight` from Section 3.1 and
`balancedPowerWeight = W_5 * (2 / 3)`):

- **Suggested weight for section $S$ (`kg`):**
    ```text
    suggestedWeightKg(S, W5) = roundToTwo(W5 * (2 / 3) * SECTION_CURVE_MODEL[S].weightRatioOfBalanced)
    ```
- **Lower & upper weight boundaries for section index $i \in \{0, 1, 2, 3, 4\}$
  (`kg`):**

    ```text
    lowerBoundaryWeight = (i == 0)
      ? minWeight(W5)
      : balancedPowerWeight * SECTION_CURVE_MODEL[section].ratioOfSectionBottom

    upperBoundaryWeight = (i == 4)
      ? W5
      : balancedPowerWeight * SECTION_CURVE_MODEL[section].ratioOfSectionTop
    ```

---

## 6. Workout Calculations

OpenGripsWeb supports two modes for computing target hang durations across repetitions (`rep = 1, 2, 3, ...`):

1. **Section Model Mode (default, `useManualEnergyCurve = false`)** - uses the section's `repRatios` table.
2. **Manual Energy System Curve Mode (`useManualEnergyCurve = true`)** - uses the `power`, `powerEndurance`, and `endurance` energy system sliders.

### 6.1 Section Model Rep Targets

```text
getModelRatioForRep(repRatios, rep):
  if length(repRatios) == 0: return 1
  if rep <= 1: return repRatios[0]
  index = min(rep - 1, length(repRatios) - 1)
  return repRatios[index]

getSectionTargetTimeForRep(section, rep, baseFirstHangTarget):
  repRatios = SECTION_CURVE_MODEL[section].repRatios
  ratio = getModelRatioForRep(repRatios, rep)
  return max(1, round(baseFirstHangTarget * ratio))
```

Notice that if `rep` exceeds `length(repRatios)` (for example rep 5 or 6 in `Endurance`, where `repRatios` has length 4), the last ratio in `repRatios` is reused.

### 6.2 Manual Energy System Slider Bounds

When configuring energy system sliders manually, the sliders constrain one another:

```text
getPowerEnduranceMin(endurance):
  raw = 0.2 * endurance + 0.16
  return clamp(roundToTwo(raw), MIN_POWER_ENDURANCE, 0.2)
  // Anchors: endurance 0.05 => 0.17, endurance 0.20 => 0.20

getPowerMin(powerEndurance):
  slope = (0.4 - 0.22) / (0.37 - 0.2)
  raw = 0.22 + slope * (powerEndurance - 0.2)
  return clamp(roundToTwo(raw), MIN_POWER, 0.4)
  // Anchors: PE 0.20 => 0.22, PE 0.37 => 0.40

getPowerMax(powerEndurance):
  raw = 0.6 * powerEndurance + 0.628
  return clamp(roundToTwo(raw), 0.73, MAX_POWER)
  // Anchors: PE 0.17 => 0.73, PE 0.37 => 0.85
```

### 6.3 Manual Energy System Rep Targets

```text
getManualEnergyTargetTimeForRep(rep, baseFirstHangTarget, power, powerEndurance, endurance):
  if rep == 1:
    return baseFirstHangTarget

  rep2Time = round(baseFirstHangTarget * power) + 1
  if rep == 2:
    return rep2Time

  enduranceNormalized = normalize(endurance, 0.05, 0.2)
  powerEnduranceNormalized = normalize(powerEndurance, 0.17, 0.37)

  tailBlend = enduranceNormalized * powerEnduranceNormalized
  tailRatio = lerp(0.18, 0.72, tailBlend)

  rep2Ratio = rep2Time / baseFirstHangTarget

  decayFactor = clamp(
    0.5 + ((power - 0.45) * (0.6087 - 0.5)) / (0.7 - 0.45),
    0.4,
    0.75
  )
  stepFromRep2 = max(rep - 2, 0)
  targetRatio = tailRatio + (rep2Ratio - tailRatio) * pow(decayFactor, stepFromRep2)
  return round(baseFirstHangTarget * targetRatio)
```

---

## 7. Test Vector Tolerances & Verification Guide

When loading [`test-vectors.json`](./test-vectors.json) in another language's test suite:

| Value Type                                                                                                              | Recommended Comparison                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Integer outputs (`idealTimeSeconds`, `repTargets`, `avgTimeSeconds`, `count`, etc.)                                     | **Exact equality** (`actual == expected`)                                                                       |
| Section names (`CurveSection`) & booleans                                                                               | **Exact equality**                                                                                              |
| Continuous float64 outputs (`minWeightKg`, `k`, `weightKg`, `idealTimeContinuousSeconds`, `ratio`, `suggestedWeightKg`) | **`abs(actual - expected) <= 1e-9`** (or `<= 1e-12` for IEEE 754 `float64`)                                     |
| Binary-search outputs (`deriveBenchmarkWeight`)                                                                         | **`abs(actual - expected) <= 1e-6`** (or exact within `1e-9` when running 100 bisections in IEEE 754 `float64`) |

See [`README.md`](./README.md) for language-agnostic test runner examples and [`test-vectors.schema.json`](./test-vectors.schema.json) for the JSON schema of [`test-vectors.json`](./test-vectors.json).

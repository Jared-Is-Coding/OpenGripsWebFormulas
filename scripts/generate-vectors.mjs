import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_PATH = path.resolve(__dirname, "..", "test-vectors.json")

// ---------------------------------------------------------------------------
// Constants (must stay 1:1 with OpenGripsWeb/utils/functions/workoutCurve.ts)
// ---------------------------------------------------------------------------

const BALANCED_RATIO = 2 / 3

const CURVE_T0_SECONDS = 5
const CURVE_T_END_SECONDS = 193
const ENDURANCE_MIN_WEIGHT_OFFSET_KG = 10
const MIN_CURVE_WEIGHT_FLOOR_KG = 1
const CURVE_EPSILON = 1e-6

const DEFAULT_FIRST_HANG_TARGET = 40
const DEFAULT_REPS = 6
const DEFAULT_REST = 20
const DEFAULT_POWER = 0.4
const DEFAULT_POWER_ENDURANCE = 0.25
const DEFAULT_ENDURANCE = 0.15

const MIN_ENDURANCE = 0.05
const MAX_ENDURANCE = 0.2
const MIN_POWER_ENDURANCE = 0.17
const MAX_POWER_ENDURANCE = 0.37
const MIN_POWER = 0.22
const MAX_POWER = 0.85
const ENDURANCE_WEIGHT_FROM_BALANCED_RATIO = 0.3
const POWER_FIRST_REP_SECONDS = 40
const ENDURANCE_FIRST_REP_SECONDS = 195
const SECTION_WEIGHT_CURVE_EXPONENT = 1.25
const SECTION_TIME_CURVE_EXPONENT = 0.72

const CURVE_SECTIONS = ["Endurance", "Strength/Endurance", "Strength", "Power/Strength", "Power"]

const SESSION_TEMPLATES = {
	Endurance: {
		section: "Endurance",
		reps: 4,
		rest: 20,
		power: 0.74,
		powerEndurance: 0.37,
		endurance: 0.2,
		defaultFirstHangTarget: 90,
	},
	"Strength/Endurance": {
		section: "Strength/Endurance",
		reps: 4,
		rest: 20,
		power: 0.62,
		powerEndurance: 0.31,
		endurance: 0.17,
		defaultFirstHangTarget: 72,
	},
	Strength: {
		section: "Strength",
		reps: 5,
		rest: 20,
		power: 0.52,
		powerEndurance: 0.27,
		endurance: 0.15,
		defaultFirstHangTarget: 56,
	},
	"Power/Strength": {
		section: "Power/Strength",
		reps: 5,
		rest: 20,
		power: 0.41,
		powerEndurance: 0.22,
		endurance: 0.12,
		defaultFirstHangTarget: 42,
	},
	Power: {
		section: "Power",
		reps: 6,
		rest: 20,
		power: 0.3,
		powerEndurance: 0.17,
		endurance: 0.05,
		defaultFirstHangTarget: 30,
	},
}

const SECTION_CURVE_MODEL = {
	Endurance: {
		weightRatioOfBalanced: 0.3409091,
		ratioOfSectionTop: 0.3409091 + (0.4393939 - 0.3409091) / 2,
		ratioOfSectionBottom: 0,
		firstRepTargetSeconds: 193,
		repRatios: [1, 0.285, 0.223, 0.202],
	},
	"Strength/Endurance": {
		weightRatioOfBalanced: 0.4393939,
		ratioOfSectionTop: 0.4393939 + (0.5984848 - 0.4393939) / 2,
		ratioOfSectionBottom: 0.3409091 + (0.4393939 - 0.3409091) / 2,
		firstRepTargetSeconds: 146,
		repRatios: [1, 0.342, 0.295, 0.24],
	},
	Strength: {
		weightRatioOfBalanced: 0.5984848,
		ratioOfSectionTop: 0.5984848 + (0.8636364 - 0.5984848) / 2,
		ratioOfSectionBottom: 0.4393939 + (0.5984848 - 0.4393939) / 2,
		firstRepTargetSeconds: 101,
		repRatios: [1, 0.356, 0.287, 0.257, 0.228],
	},
	"Power/Strength": {
		weightRatioOfBalanced: 0.8636364,
		ratioOfSectionTop: 0.8636364 + (1 - 0.8636364) / 2,
		ratioOfSectionBottom: 0.5984848 + (0.8636364 - 0.5984848) / 2,
		firstRepTargetSeconds: 56,
		repRatios: [1, 0.357, 0.232, 0.214, 0.196],
	},
	Power: {
		weightRatioOfBalanced: 1,
		ratioOfSectionTop: 100,
		ratioOfSectionBottom: 0.8636364 + (1 - 0.8636364) / 2,
		firstRepTargetSeconds: 40,
		repRatios: [1, 0.375, 0.25, 0.225, 0.2, 0.2],
	},
}

const SECTION_STROKE_COLORS = {
	Endurance: "#22c55e",
	"Strength/Endurance": "#3b82f6",
	Strength: "#eab308",
	"Power/Strength": "#f97316",
	Power: "#ef4444",
}

// ---------------------------------------------------------------------------
// Reference Formula Functions
// ---------------------------------------------------------------------------

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const lerp = (start, end, t) => start + (end - start) * t
const roundToTwo = (value) => Number(value.toFixed(2))

const normalize = (value, min, max) => {
	if (max === min) return 0
	return (clamp(value, min, max) - min) / (max - min)
}

const calculateMinWeight = (benchmarkWeight) => {
	return Math.max(
		MIN_CURVE_WEIGHT_FLOOR_KG,
		benchmarkWeight * BALANCED_RATIO * SECTION_CURVE_MODEL.Endurance.weightRatioOfBalanced -
			ENDURANCE_MIN_WEIGHT_OFFSET_KG,
	)
}

const calculateDecayConstant = (benchmarkWeight) => {
	const minWeight = calculateMinWeight(benchmarkWeight)
	const k =
		-Math.log(Math.max(minWeight / Math.max(benchmarkWeight, CURVE_EPSILON), CURVE_EPSILON)) /
		(CURVE_T_END_SECONDS - CURVE_T0_SECONDS)
	return k === 0 ? 0 : k
}

const calculateWeightAtTime = (timeSeconds, benchmarkWeight) => {
	const k = calculateDecayConstant(benchmarkWeight)
	return benchmarkWeight * Math.exp(-k * (timeSeconds - CURVE_T0_SECONDS))
}

const calculateIdealTime = (weightKg, benchmarkWeight) => {
	const k = calculateDecayConstant(benchmarkWeight)
	if (k === 0) return 0
	const idealTime = CURVE_T0_SECONDS - Math.log(weightKg / Math.max(benchmarkWeight, CURVE_EPSILON)) / k
	return Math.max(1, Math.round(idealTime))
}

const calculateIdealTimeContinuous = (weightKg, benchmarkWeight) => {
	const k = calculateDecayConstant(benchmarkWeight)
	if (k === 0) return 0
	const idealTime = CURVE_T0_SECONDS - Math.log(weightKg / Math.max(benchmarkWeight, CURVE_EPSILON)) / k
	return Math.max(1, idealTime)
}

const deriveBenchmarkWeight = (weightKg, timeHeld) => {
	if (weightKg <= 0 || timeHeld <= 5) return weightKg

	let low = weightKg
	let high = Math.max(weightKg * 100, 1000)

	for (let i = 0; i < 100; i++) {
		const mid = (low + high) / 2
		const computedTime = calculateIdealTimeContinuous(weightKg, mid)
		if (computedTime > timeHeld) {
			high = mid
		} else {
			low = mid
		}
	}
	return (low + high) / 2
}

const getCurveSectionByNormalizedX = (normalizedX) => {
	const index = Math.min(CURVE_SECTIONS.length - 1, Math.max(0, Math.floor(normalizedX * CURVE_SECTIONS.length)))
	return CURVE_SECTIONS[index]
}

const getCurveSectionByBenchmarkWeight = (usedWeightKg, maxPowerBenchmarkKg) => {
	if (!Number.isFinite(usedWeightKg) || maxPowerBenchmarkKg <= 0) {
		return "Power"
	}

	if (!Number.isFinite(maxPowerBenchmarkKg) || usedWeightKg <= 0) {
		return "Endurance"
	}

	const balancedPowerWeight = maxPowerBenchmarkKg * BALANCED_RATIO
	const ratioToBalanced = usedWeightKg / balancedPowerWeight

	for (const section of CURVE_SECTIONS) {
		if (ratioToBalanced <= SECTION_CURVE_MODEL[section].ratioOfSectionTop) {
			return section
		}
	}

	return "Power"
}

const getSectionProgress = (section) => {
	const sectionIndex = CURVE_SECTIONS.indexOf(section)
	return clamp(sectionIndex / Math.max(CURVE_SECTIONS.length - 1, 1), 0, 1)
}

const getCurveSection = (usedWeightKg, benchmarkWeightKg, weightMin, weightMax) => {
	if (benchmarkWeightKg && benchmarkWeightKg > 0) {
		return getCurveSectionByBenchmarkWeight(usedWeightKg, benchmarkWeightKg)
	}
	const min = weightMin ?? 20
	const max = weightMax ?? Math.max(min + 1, usedWeightKg)
	const normalizedX = normalize(usedWeightKg, min, max)
	return getCurveSectionByNormalizedX(normalizedX)
}

const getSuggestedSectionWeightKg = (section, benchmarkWeightKg) => {
	const balancedPowerWeight = benchmarkWeightKg * BALANCED_RATIO
	return roundToTwo(balancedPowerWeight * SECTION_CURVE_MODEL[section].weightRatioOfBalanced)
}

const getSectionWeightBounds = (section, benchmarkWeightKg) => {
	const sectionIndex = CURVE_SECTIONS.indexOf(section)
	const minWeight = calculateMinWeight(benchmarkWeightKg)
	const balancedAnchorWeight = benchmarkWeightKg * BALANCED_RATIO

	const lowerBoundaryWeightKg =
		sectionIndex > 0 ? balancedAnchorWeight * SECTION_CURVE_MODEL[section].ratioOfSectionBottom : minWeight

	const upperBoundaryWeightKg =
		sectionIndex < CURVE_SECTIONS.length - 1
			? balancedAnchorWeight * SECTION_CURVE_MODEL[section].ratioOfSectionTop
			: benchmarkWeightKg

	return { lowerBoundaryWeightKg, upperBoundaryWeightKg }
}

const getModelRatioForRep = (ratios, rep) => {
	if (ratios.length === 0) return 1
	if (rep <= 1) return ratios[0]
	const index = Math.min(rep - 1, ratios.length - 1)
	return ratios[index]
}

const getSectionTargetTimeForRep = (section, rep, baseFirstHangTarget) => {
	const ratio = getModelRatioForRep(SECTION_CURVE_MODEL[section].repRatios, rep)
	return Math.max(1, Math.round(baseFirstHangTarget * ratio))
}

const getPowerEnduranceMin = (enduranceValue) => {
	const raw = 0.2 * enduranceValue + 0.16
	return clamp(roundToTwo(raw), MIN_POWER_ENDURANCE, 0.2)
}

const getPowerMax = (powerEnduranceValue) => {
	const raw = 0.6 * powerEnduranceValue + 0.628
	return clamp(roundToTwo(raw), 0.73, MAX_POWER)
}

const getPowerMin = (powerEnduranceValue) => {
	const slope = (0.4 - 0.22) / (0.37 - 0.2)
	const raw = 0.22 + slope * (powerEnduranceValue - 0.2)
	return clamp(roundToTwo(raw), MIN_POWER, 0.4)
}

const getManualEnergyTargetTimeForRep = (rep, baseFirstHangTarget, power, powerEndurance, endurance) => {
	if (rep === 1) return baseFirstHangTarget
	const rep2Time = Math.round(baseFirstHangTarget * power) + 1
	if (rep === 2) return rep2Time

	const enduranceNormalized = normalize(endurance, MIN_ENDURANCE, MAX_ENDURANCE)
	const powerEnduranceNormalized = normalize(powerEndurance, MIN_POWER_ENDURANCE, MAX_POWER_ENDURANCE)
	const tailBlend = enduranceNormalized * powerEnduranceNormalized
	const tailRatio = lerp(0.18, 0.72, tailBlend)

	const rep2Ratio = rep2Time / baseFirstHangTarget
	const decayFactor = clamp(0.5 + ((power - 0.45) * (0.6087 - 0.5)) / (0.7 - 0.45), 0.4, 0.75)
	const stepFromRep2 = Math.max(rep - 2, 0)
	const targetRatio = tailRatio + (rep2Ratio - tailRatio) * Math.pow(decayFactor, stepFromRep2)
	return Math.round(baseFirstHangTarget * targetRatio)
}

const buildForceCurveDataset = (workoutHistory, maxPowerBenchmarks) => {
	const rows = workoutHistory
		.map((row) => {
			const weightKg = parseFloat(row.used_weight?.toString() || "0")

			const actualTimes = (row.actual_result_times || []).filter(
				(time) => typeof time === "number" && Number.isFinite(time) && time > 0,
			)
			const targetTimes = (row.target_times || []).filter(
				(time) => typeof time === "number" && Number.isFinite(time) && time > 0,
			)
			const validTimes = actualTimes.length > 0 ? actualTimes : targetTimes
			const avgTime = validTimes.length > 0 ? validTimes.reduce((sum, val) => sum + val, 0) / validTimes.length : null

			if (!Number.isFinite(weightKg) || weightKg <= 0 || avgTime === null) {
				return null
			}

			return {
				id: row.id,
				weightKg,
				avgTimeSeconds: Math.round(avgTime),
				firstRepActualTimeSeconds: Math.round(validTimes[0] || 0),
				trainingToolTypeId: row.training_tool_type_id,
				workoutDate: row.workout_date,
				handSide: row.hand_side,
			}
		})
		.filter(Boolean)

	if (rows.length === 0) {
		return {
			points: [],
			weightMin: 20,
			weightMax: 80,
			timeMin: 20,
			timeMax: 120,
			coverage: CURVE_SECTIONS.map((section) => ({
				section,
				count: 0,
			})),
		}
	}

	const weightMin = Math.min(...rows.map((row) => row.weightKg))
	const weightMax = Math.max(...rows.map((row) => row.weightKg))
	const timeMin = Math.min(...rows.map((row) => row.avgTimeSeconds))
	const timeMax = Math.max(...rows.map((row) => row.avgTimeSeconds))

	const strongestBenchmarkByTool = new Map()
	let strongestBenchmarkOverall = 0
	maxPowerBenchmarks.forEach((benchmarkRow) => {
		const benchmarkWeight = Number(benchmarkRow.used_weight)
		if (!Number.isFinite(benchmarkWeight) || benchmarkWeight <= 0) {
			return
		}

		if (benchmarkWeight > strongestBenchmarkOverall) {
			strongestBenchmarkOverall = benchmarkWeight
		}

		const toolId = benchmarkRow.training_tool_type_id
		const currentToolBest = strongestBenchmarkByTool.get(toolId) ?? 0
		if (benchmarkWeight > currentToolBest) {
			strongestBenchmarkByTool.set(toolId, benchmarkWeight)
		}
	})

	const points = rows.map((row) => {
		const benchmarkForTool = row.trainingToolTypeId
			? (strongestBenchmarkByTool.get(row.trainingToolTypeId) ?? null)
			: null
		const benchmarkForRow =
			benchmarkForTool ?? (strongestBenchmarkOverall > 0 ? strongestBenchmarkOverall : null)
		return {
			...row,
			section: getCurveSection(row.weightKg, benchmarkForRow, weightMin, weightMax),
		}
	})

	const coverageMap = new Map()
	CURVE_SECTIONS.forEach((section) => coverageMap.set(section, 0))
	points.forEach((point) => {
		const current = coverageMap.get(point.section) ?? 0
		coverageMap.set(point.section, current + 1)
	})

	return {
		points,
		weightMin,
		weightMax,
		timeMin,
		timeMax,
		coverage: CURVE_SECTIONS.map((section) => ({
			section,
			count: coverageMap.get(section) ?? 0,
		})),
	}
}

// ---------------------------------------------------------------------------
// Vector Generation
// ---------------------------------------------------------------------------

const benchmarkWeights = [15, 25, 40, 50, 60, 75, 90, 100, 120, 150]
const sampleTimes = [5, 10, 20, 30, 40, 56, 75, 101, 146, 193]

const idealForceCurve = benchmarkWeights.map((benchmarkWeightKg) => {
	const balancedPowerWeightKg = benchmarkWeightKg * BALANCED_RATIO
	const minWeightKg = calculateMinWeight(benchmarkWeightKg)
	const k = calculateDecayConstant(benchmarkWeightKg)

	const weightAtTimeSamples = sampleTimes.map((tSeconds) => ({
		tSeconds,
		weightKg: calculateWeightAtTime(tSeconds, benchmarkWeightKg),
	}))

	const candidateWeights = [
		benchmarkWeightKg * 1.15,
		benchmarkWeightKg,
		...CURVE_SECTIONS.slice()
			.reverse()
			.map((section) => balancedPowerWeightKg * SECTION_CURVE_MODEL[section].weightRatioOfBalanced),
		minWeightKg,
		Math.max(0.5, minWeightKg * 0.5),
	]

	const uniqueWeights = []
	for (const w of candidateWeights) {
		if (!uniqueWeights.some((existing) => Math.abs(existing - w) < 1e-12)) {
			uniqueWeights.push(w)
		}
	}

	const idealTimeSamples = uniqueWeights.map((weightKg) => ({
		weightKg,
		idealTimeContinuousSeconds: calculateIdealTimeContinuous(weightKg, benchmarkWeightKg),
		idealTimeSeconds: calculateIdealTime(weightKg, benchmarkWeightKg),
	}))

	return {
		benchmarkWeightKg,
		balancedPowerWeightKg,
		minWeightKg,
		k,
		weightAtTimeSamples,
		idealTimeSamples,
	}
})

const deriveBenchmarkWeightCases = [
	{ label: "standard-40kg-40s", weightKg: 40, timeHeldSeconds: 40 },
	{ label: "standard-30kg-101s", weightKg: 30, timeHeldSeconds: 101 },
	{ label: "standard-20kg-193s", weightKg: 20, timeHeldSeconds: 193 },
	{ label: "standard-50kg-15s", weightKg: 50, timeHeldSeconds: 15 },
	{ label: "standard-60kg-60s", weightKg: 60, timeHeldSeconds: 60 },
	{ label: "standard-80kg-25s", weightKg: 80, timeHeldSeconds: 25 },
	{ label: "edge-at-5s", weightKg: 50, timeHeldSeconds: 5 },
	{ label: "edge-under-5s", weightKg: 50, timeHeldSeconds: 3 },
	{ label: "edge-zero-weight", weightKg: 0, timeHeldSeconds: 40 },
	{ label: "edge-negative-weight", weightKg: -5, timeHeldSeconds: 20 },
	...[
		{ w5: 40, t: 20 },
		{ w5: 60, t: 56 },
		{ w5: 90, t: 101 },
		{ w5: 120, t: 146 },
		{ w5: 100, t: 193 },
	].map(({ w5, t }) => ({
		label: `roundtrip-w5-${w5}-t-${t}`,
		weightKg: calculateWeightAtTime(t, w5),
		timeHeldSeconds: t,
		sourceBenchmarkWeightKg: w5,
	})),
].map((entry) => ({
	...entry,
	expectedBenchmarkWeightKg: deriveBenchmarkWeight(entry.weightKg, entry.timeHeldSeconds),
}))

const benchmark90Balanced = 90 * BALANCED_RATIO // 60
const byBenchmarkWeightCases = [
	// Edge cases
	{ usedWeightKg: 50, maxPowerBenchmarkKg: 0 },
	{ usedWeightKg: 50, maxPowerBenchmarkKg: -10 },
	{ usedWeightKg: 0, maxPowerBenchmarkKg: 90 },
	{ usedWeightKg: -5, maxPowerBenchmarkKg: 90 },
	// Boundary transitions around 90 kg benchmark (balanced = 60 kg)
	{ usedWeightKg: benchmark90Balanced * 0.3409091, maxPowerBenchmarkKg: 90 },
	{ usedWeightKg: benchmark90Balanced * SECTION_CURVE_MODEL.Endurance.ratioOfSectionTop, maxPowerBenchmarkKg: 90 },
	{
		usedWeightKg: benchmark90Balanced * (SECTION_CURVE_MODEL.Endurance.ratioOfSectionTop + 1e-6),
		maxPowerBenchmarkKg: 90,
	},
	{ usedWeightKg: benchmark90Balanced * 0.4393939, maxPowerBenchmarkKg: 90 },
	{
		usedWeightKg: benchmark90Balanced * SECTION_CURVE_MODEL["Strength/Endurance"].ratioOfSectionTop,
		maxPowerBenchmarkKg: 90,
	},
	{
		usedWeightKg: benchmark90Balanced * (SECTION_CURVE_MODEL["Strength/Endurance"].ratioOfSectionTop + 1e-6),
		maxPowerBenchmarkKg: 90,
	},
	{ usedWeightKg: benchmark90Balanced * 0.5984848, maxPowerBenchmarkKg: 90 },
	{ usedWeightKg: benchmark90Balanced * SECTION_CURVE_MODEL.Strength.ratioOfSectionTop, maxPowerBenchmarkKg: 90 },
	{
		usedWeightKg: benchmark90Balanced * (SECTION_CURVE_MODEL.Strength.ratioOfSectionTop + 1e-6),
		maxPowerBenchmarkKg: 90,
	},
	{ usedWeightKg: benchmark90Balanced * 0.8636364, maxPowerBenchmarkKg: 90 },
	{
		usedWeightKg: benchmark90Balanced * SECTION_CURVE_MODEL["Power/Strength"].ratioOfSectionTop,
		maxPowerBenchmarkKg: 90,
	},
	{
		usedWeightKg: benchmark90Balanced * (SECTION_CURVE_MODEL["Power/Strength"].ratioOfSectionTop + 1e-6),
		maxPowerBenchmarkKg: 90,
	},
	{ usedWeightKg: 60, maxPowerBenchmarkKg: 90 },
	{ usedWeightKg: 90, maxPowerBenchmarkKg: 90 },
	{ usedWeightKg: 110, maxPowerBenchmarkKg: 90 },
	// Non-round balanced benchmark (100 kg -> 66.6666... kg)
	{ usedWeightKg: 25, maxPowerBenchmarkKg: 100 },
	{ usedWeightKg: 40, maxPowerBenchmarkKg: 100 },
	{ usedWeightKg: 66.67, maxPowerBenchmarkKg: 100 },
].map((input) => ({
	...input,
	expectedSection: getCurveSectionByBenchmarkWeight(input.usedWeightKg, input.maxPowerBenchmarkKg),
}))

const byNormalizedXCases = [-0.2, 0, 0.199999, 0.2, 0.399999, 0.4, 0.599999, 0.6, 0.799999, 0.8, 1.0, 1.2].map(
	(normalizedX) => ({
		normalizedX,
		expectedSection: getCurveSectionByNormalizedX(normalizedX),
	}),
)

const getCurveSectionCases = [
	{ usedWeightKg: 35, benchmarkWeightKg: 90, weightMin: 20, weightMax: 90 },
	{ usedWeightKg: 35, benchmarkWeightKg: null, weightMin: 20, weightMax: 70 },
	{ usedWeightKg: 45, benchmarkWeightKg: 0, weightMin: 20, weightMax: 70 },
	{ usedWeightKg: 25, benchmarkWeightKg: null, weightMin: null, weightMax: null },
].map((input) => ({
	...input,
	expectedSection: getCurveSection(
		input.usedWeightKg,
		input.benchmarkWeightKg,
		input.weightMin ?? undefined,
		input.weightMax ?? undefined,
	),
}))

const sectionProgressCases = CURVE_SECTIONS.map((section) => ({
	section,
	expectedProgress: getSectionProgress(section),
}))

const sectionBoundsAndSuggestions = [40, 60, 75, 90, 120].map((benchmarkWeightKg) => ({
	benchmarkWeightKg,
	balancedPowerWeightKg: benchmarkWeightKg * BALANCED_RATIO,
	minWeightKg: calculateMinWeight(benchmarkWeightKg),
	sections: CURVE_SECTIONS.map((section) => ({
		section,
		suggestedWeightKg: getSuggestedSectionWeightKg(section, benchmarkWeightKg),
		...getSectionWeightBounds(section, benchmarkWeightKg),
	})),
}))

const repTargetsPerSection = {
	sectionModels: CURVE_SECTIONS.map((section) => {
		const modelFirstRep = SECTION_CURVE_MODEL[section].firstRepTargetSeconds
		const templateFirstRep = SESSION_TEMPLATES[section].defaultFirstHangTarget
		const firstHangTargets = [modelFirstRep, templateFirstRep, 60, 120]
		const reps = [1, 2, 3, 4, 5, 6, 7, 8]

		return {
			section,
			cases: firstHangTargets.map((firstHangTarget) => ({
				firstHangTarget,
				reps: reps.map((rep) => ({
					rep,
					targetTimeSeconds: getSectionTargetTimeForRep(section, rep, firstHangTarget),
				})),
			})),
		}
	}),
}

const manualEnergyCurve = {
	sliderBounds: {
		powerEnduranceMin: [0.01, 0.05, 0.1, 0.15, 0.2, 0.25].map((endurance) => ({
			endurance,
			expectedMin: getPowerEnduranceMin(endurance),
		})),
		powerMin: [0.15, 0.17, 0.2, 0.25, 0.31, 0.37, 0.4].map((powerEndurance) => ({
			powerEndurance,
			expectedMin: getPowerMin(powerEndurance),
		})),
		powerMax: [0.15, 0.17, 0.2, 0.25, 0.31, 0.37, 0.4].map((powerEndurance) => ({
			powerEndurance,
			expectedMax: getPowerMax(powerEndurance),
		})),
	},
	repTargetCases: [
		...CURVE_SECTIONS.map((section) => {
			const tpl = SESSION_TEMPLATES[section]
			return {
				label: `template-${section}`,
				firstHangTarget: tpl.defaultFirstHangTarget,
				power: tpl.power,
				powerEndurance: tpl.powerEndurance,
				endurance: tpl.endurance,
			}
		}),
		{
			label: "defaults",
			firstHangTarget: DEFAULT_FIRST_HANG_TARGET,
			power: DEFAULT_POWER,
			powerEndurance: DEFAULT_POWER_ENDURANCE,
			endurance: DEFAULT_ENDURANCE,
		},
		{
			label: "high-tail-endurance",
			firstHangTarget: 120,
			power: 0.7,
			powerEndurance: 0.37,
			endurance: 0.2,
		},
		{
			label: "low-tail-power",
			firstHangTarget: 35,
			power: 0.3,
			powerEndurance: 0.17,
			endurance: 0.05,
		},
	].map((cfg) => ({
		...cfg,
		reps: [1, 2, 3, 4, 5, 6, 7, 8].map((rep) => ({
			rep,
			targetTimeSeconds: getManualEnergyTargetTimeForRep(
				rep,
				cfg.firstHangTarget,
				cfg.power,
				cfg.powerEndurance,
				cfg.endurance,
			),
		})),
	})),
}

const datasetCasesRaw = [
	{
		label: "empty-history",
		workoutHistory: [],
		maxPowerBenchmarks: [],
	},
	{
		label: "kg-workouts-and-benchmark-resolution",
		workoutHistory: [
			{
				id: "w1",
				used_weight: 20,
				target_times: [190, 55, 42, 38],
				actual_result_times: [193, 55, 43, 39],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-01-10",
				hand_side: "Right",
			},
			{
				id: "w2",
				used_weight: "60",
				target_times: [40, 15, 10, 9, 8, 8],
				actual_result_times: [],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-01-12",
				hand_side: "Right",
			},
			{
				id: "w3",
				used_weight: 36,
				target_times: [100, 35, 28, 25, 22],
				actual_result_times: [101, 36, 29, 26, 23],
				training_tool_type_id: "pinch-block",
				workout_date: "2026-01-15",
				hand_side: "Left",
			},
			{
				id: "w4-invalid-weight",
				used_weight: 0,
				target_times: [40],
				actual_result_times: [40],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-01-16",
			},
			{
				id: "w5-invalid-times",
				used_weight: 40,
				target_times: [],
				actual_result_times: [-1, 0],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-01-17",
			},
		],
		maxPowerBenchmarks: [
			{
				id: "b1",
				training_tool_type_id: "edge-20mm",
				used_weight: 85,
				hand_side: "Right",
				created_at: "2026-01-01T00:00:00Z",
			},
			{
				id: "b2",
				training_tool_type_id: "edge-20mm",
				used_weight: 90,
				hand_side: "Right",
				created_at: "2026-01-05T00:00:00Z",
			},
		],
	},
	{
		label: "no-benchmarks-normalized-fallback",
		workoutHistory: [
			{
				id: "n1",
				used_weight: 20,
				target_times: [120],
				actual_result_times: [120],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-02-01",
				hand_side: null,
			},
			{
				id: "n2",
				used_weight: 45,
				target_times: [70],
				actual_result_times: [70],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-02-02",
				hand_side: null,
			},
			{
				id: "n3",
				used_weight: 70,
				target_times: [35],
				actual_result_times: [35],
				training_tool_type_id: "edge-20mm",
				workout_date: "2026-02-03",
				hand_side: null,
			},
		],
		maxPowerBenchmarks: [],
	},
]

const forceCurveDataset = datasetCasesRaw.map((entry) => ({
	...entry,
	expected: buildForceCurveDataset(entry.workoutHistory, entry.maxPowerBenchmarks),
}))

const testVectors = {
	$schema: "./test-vectors.schema.json",
	version: "1.0.0",
	metadata: {
		description: "Canonical language-agnostic test vectors for OpenGrips Force Curve formulas (all weights in kg)",
		sourceRepository: "OpenGripsWeb",
		sourceFiles: [
			"utils/functions/workoutCurve.ts",
			"app/workout/WorkoutClient.tsx",
		],
		tolerances: {
			floatTolerance: 1e-9,
			benchmarkDerivationTolerance: 1e-6,
		},
	},
	constants: {
		BALANCED_RATIO,
		CURVE_T0_SECONDS,
		CURVE_T_END_SECONDS,
		ENDURANCE_MIN_WEIGHT_OFFSET_KG,
		MIN_CURVE_WEIGHT_FLOOR_KG,
		CURVE_EPSILON,
		DEFAULT_FIRST_HANG_TARGET,
		DEFAULT_REPS,
		DEFAULT_REST,
		DEFAULT_POWER,
		DEFAULT_POWER_ENDURANCE,
		DEFAULT_ENDURANCE,
		MIN_ENDURANCE,
		MAX_ENDURANCE,
		MIN_POWER_ENDURANCE,
		MAX_POWER_ENDURANCE,
		MIN_POWER,
		MAX_POWER,
		ENDURANCE_WEIGHT_FROM_BALANCED_RATIO,
		POWER_FIRST_REP_SECONDS,
		ENDURANCE_FIRST_REP_SECONDS,
		SECTION_WEIGHT_CURVE_EXPONENT,
		SECTION_TIME_CURVE_EXPONENT,
		CURVE_SECTIONS,
		SECTION_CURVE_MODEL,
		SESSION_TEMPLATES,
		SECTION_STROKE_COLORS,
	},
	idealForceCurve,
	deriveBenchmarkWeight: deriveBenchmarkWeightCases,
	sectionClassification: {
		byBenchmarkWeight: byBenchmarkWeightCases,
		byNormalizedX: byNormalizedXCases,
		getCurveSection: getCurveSectionCases,
		sectionProgress: sectionProgressCases,
		sectionBoundsAndSuggestions,
	},
	repTargetsPerSection,
	manualEnergyCurve,
	forceCurveDataset,
}

// ---------------------------------------------------------------------------
// Self-Verification Assertions
// ---------------------------------------------------------------------------

const assertApprox = (actual, expected, tol, message) => {
	assert.ok(Math.abs(actual - expected) <= tol, `${message}: expected ${expected}, got ${actual} (tol=${tol})`)
}

for (const curve of testVectors.idealForceCurve) {
	const t5 = curve.weightAtTimeSamples.find((s) => s.tSeconds === 5)
	assertApprox(t5.weightKg, curve.benchmarkWeightKg, 1e-12, `W(5) for benchmark ${curve.benchmarkWeightKg}`)

	const t193 = curve.weightAtTimeSamples.find((s) => s.tSeconds === 193)
	assertApprox(t193.weightKg, curve.minWeightKg, 1e-9, `W(193) for benchmark ${curve.benchmarkWeightKg}`)

	const atBenchmark = curve.idealTimeSamples.find((s) => Math.abs(s.weightKg - curve.benchmarkWeightKg) < 1e-12)
	assert.equal(atBenchmark.idealTimeSeconds, 5, `t(W5) integer for ${curve.benchmarkWeightKg}`)
	assertApprox(atBenchmark.idealTimeContinuousSeconds, 5, 1e-12, `t(W5) continuous for ${curve.benchmarkWeightKg}`)

	const atMinWeight = curve.idealTimeSamples.find((s) => Math.abs(s.weightKg - curve.minWeightKg) < 1e-12)
	assert.equal(atMinWeight.idealTimeSeconds, 193, `t(minWeight) integer for ${curve.benchmarkWeightKg}`)
	assertApprox(atMinWeight.idealTimeContinuousSeconds, 193, 1e-9, `t(minWeight) continuous for ${curve.benchmarkWeightKg}`)
}

for (const entry of testVectors.deriveBenchmarkWeight) {
	if (entry.sourceBenchmarkWeightKg !== undefined) {
		assertApprox(
			entry.expectedBenchmarkWeightKg,
			entry.sourceBenchmarkWeightKg,
			1e-6,
			`Round-trip deriveBenchmarkWeight for ${entry.label}`,
		)
	}
}

for (const entry of testVectors.sectionClassification.sectionBoundsAndSuggestions) {
	assert.equal(entry.sections.length, 5)
	assertApprox(entry.sections[0].lowerBoundaryWeightKg, entry.minWeightKg, 1e-12, "Endurance lower boundary")
	assertApprox(entry.sections[4].upperBoundaryWeightKg, entry.benchmarkWeightKg, 1e-12, "Power upper boundary")
	for (let i = 0; i < 4; i++) {
		assertApprox(
			entry.sections[i].upperBoundaryWeightKg,
			entry.sections[i + 1].lowerBoundaryWeightKg,
			1e-12,
			`Contiguous boundary between ${entry.sections[i].section} and ${entry.sections[i + 1].section}`,
		)
	}
}

for (const sec of testVectors.repTargetsPerSection.sectionModels) {
	for (const c of sec.cases) {
		assert.equal(c.reps[0].targetTimeSeconds, Math.max(1, Math.round(c.firstHangTarget)), "Rep 1 equals firstHangTarget")
		for (const r of c.reps) {
			assert.ok(Number.isInteger(r.targetTimeSeconds) && r.targetTimeSeconds >= 1)
		}
	}
}

assert.equal(testVectors.forceCurveDataset[0].expected.points.length, 0)
assert.equal(testVectors.forceCurveDataset[1].expected.points.length, 3)
assert.equal(
	testVectors.forceCurveDataset[1].expected.coverage.reduce((acc, item) => acc + item.count, 0),
	3,
)

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(testVectors, null, 2)}\n`, "utf8")
console.log(`Generated and verified ${OUTPUT_PATH}`)

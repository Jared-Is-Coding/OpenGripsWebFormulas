export const BALANCED_RATIO = 2 / 3

export const CURVE_T0_SECONDS = 5
export const CURVE_T_END_SECONDS = 193
export const ENDURANCE_MIN_WEIGHT_OFFSET_KG = 10
export const MIN_CURVE_WEIGHT_FLOOR_KG = 1
export const CURVE_EPSILON = 1e-6

export const DEFAULT_FIRST_HANG_TARGET = 40
export const DEFAULT_REPS = 6
export const DEFAULT_REST = 20
export const DEFAULT_POWER = 0.4
export const DEFAULT_POWER_ENDURANCE = 0.25
export const DEFAULT_ENDURANCE = 0.15

export const MIN_ENDURANCE = 0.05
export const MAX_ENDURANCE = 0.2
export const MIN_POWER_ENDURANCE = 0.17
export const MAX_POWER_ENDURANCE = 0.37
export const MIN_POWER = 0.22
export const MAX_POWER = 0.85
export const ENDURANCE_WEIGHT_FROM_BALANCED_RATIO = 0.3
export const POWER_FIRST_REP_SECONDS = 40
export const ENDURANCE_FIRST_REP_SECONDS = 195
export const SECTION_WEIGHT_CURVE_EXPONENT = 1.25
export const SECTION_TIME_CURVE_EXPONENT = 0.72

export type CurveSection = "Endurance" | "Strength/Endurance" | "Strength" | "Power/Strength" | "Power"

export const CURVE_SECTIONS: CurveSection[] = [
	"Endurance",
	"Strength/Endurance",
	"Strength",
	"Power/Strength",
	"Power",
]

export type SessionSuggestionTemplate = {
	section: CurveSection
	reps: number
	rest: number
	power: number
	powerEndurance: number
	endurance: number
	defaultFirstHangTarget: number
}

export const SESSION_TEMPLATES: Record<CurveSection, SessionSuggestionTemplate> = {
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

export type SectionCurveModel = {
	weightRatioOfBalanced: number
	ratioOfSectionTop: number
	ratioOfSectionBottom: number
	firstRepTargetSeconds: number
	repRatios: number[]
}

export const SECTION_CURVE_MODEL: Record<CurveSection, SectionCurveModel> = {
	Endurance: {
		weightRatioOfBalanced: 0.3409091, // 45 / 132
		ratioOfSectionTop: 0.3409091 + (0.4393939 - 0.3409091) / 2,
		ratioOfSectionBottom: 0,
		firstRepTargetSeconds: 193,
		repRatios: [1, 0.285, 0.223, 0.202],
	},
	"Strength/Endurance": {
		weightRatioOfBalanced: 0.4393939, // 58 / 132
		ratioOfSectionTop: 0.4393939 + (0.5984848 - 0.4393939) / 2,
		ratioOfSectionBottom: 0.3409091 + (0.4393939 - 0.3409091) / 2,
		firstRepTargetSeconds: 146,
		repRatios: [1, 0.342, 0.295, 0.24],
	},
	Strength: {
		weightRatioOfBalanced: 0.5984848, // 79 / 132
		ratioOfSectionTop: 0.5984848 + (0.8636364 - 0.5984848) / 2,
		ratioOfSectionBottom: 0.4393939 + (0.5984848 - 0.4393939) / 2,
		firstRepTargetSeconds: 101,
		repRatios: [1, 0.356, 0.287, 0.257, 0.228],
	},
	"Power/Strength": {
		weightRatioOfBalanced: 0.8636364, // 114 / 132
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

export const SECTION_STROKE_COLORS: Record<CurveSection, string> = {
	Endurance: "#22c55e",
	"Strength/Endurance": "#3b82f6",
	Strength: "#eab308",
	"Power/Strength": "#f97316",
	Power: "#ef4444",
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const lerp = (start: number, end: number, t: number) => start + (end - start) * t
const roundToTwo = (value: number) => Number(value.toFixed(2))

export const isFiniteNumberArray = (value: unknown): value is number[] => {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((item) => typeof item === "number" && Number.isFinite(item))
	)
}

export const average = (values: number[]) => {
	if (values.length === 0) return null
	return values.reduce((sum, value) => sum + value, 0) / values.length
}

export const normalize = (value: number, min: number, max: number) => {
	if (max === min) return 0
	return (clamp(value, min, max) - min) / (max - min)
}

export const getCurveSectionByNormalizedX = (normalizedX: number): CurveSection => {
	const index = Math.min(CURVE_SECTIONS.length - 1, Math.max(0, Math.floor(normalizedX * CURVE_SECTIONS.length)))
	return CURVE_SECTIONS[index]
}

export const getCurveSectionByBenchmarkWeight = (usedWeightKg: number, maxPowerBenchmarkKg: number): CurveSection => {
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

export const getSectionProgress = (section: CurveSection) => {
	const sectionIndex = CURVE_SECTIONS.indexOf(section)
	return clamp(sectionIndex / Math.max(CURVE_SECTIONS.length - 1, 1), 0, 1)
}

export const getCurveSection = (
	usedWeightKg: number,
	benchmarkWeightKg?: number | null,
	weightMin?: number,
	weightMax?: number,
): CurveSection => {
	if (benchmarkWeightKg && benchmarkWeightKg > 0) {
		return getCurveSectionByBenchmarkWeight(usedWeightKg, benchmarkWeightKg)
	}
	const min = weightMin ?? 20
	const max = weightMax ?? Math.max(min + 1, usedWeightKg)
	const normalizedX = normalize(usedWeightKg, min, max)
	return getCurveSectionByNormalizedX(normalizedX)
}

export type MaxPowerBenchmarkRow = {
	id: string
	training_tool_type_id: string
	used_weight: number
	hand_side: string
	created_at: string
}

export type ForceCurveWorkoutInput = {
	id: string
	used_weight?: number | string | null
	target_times?: number[] | null
	actual_result_times?: number[] | null
	training_tool_type_id: string | null
	workout_date: string
	hand_side?: string | null
}

export type ForceCurvePoint = {
	id: string
	weightKg: number
	avgTimeSeconds: number
	firstRepActualTimeSeconds: number
	section: CurveSection
	trainingToolTypeId: string | null
	workoutDate: string
	handSide?: string | null
}

export type ForceCurveDataset = {
	points: ForceCurvePoint[]
	weightMin: number
	weightMax: number
	timeMin: number
	timeMax: number
	coverage: { section: CurveSection; count: number }[]
}

export const buildForceCurveDataset = (
	workoutHistory: ForceCurveWorkoutInput[],
	maxPowerBenchmarks: MaxPowerBenchmarkRow[],
): ForceCurveDataset => {
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
		.filter((item): item is NonNullable<typeof item> => Boolean(item))

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

	const strongestBenchmarkByTool = new Map<string, number>()
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

	const coverageMap = new Map<CurveSection, number>()
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

export const calculateMinWeight = (benchmarkWeight: number): number => {
	return Math.max(
		MIN_CURVE_WEIGHT_FLOOR_KG,
		benchmarkWeight * BALANCED_RATIO * SECTION_CURVE_MODEL.Endurance.weightRatioOfBalanced -
			ENDURANCE_MIN_WEIGHT_OFFSET_KG,
	)
}

export const calculateDecayConstant = (benchmarkWeight: number): number => {
	const minWeight = calculateMinWeight(benchmarkWeight)
	const k =
		-Math.log(Math.max(minWeight / Math.max(benchmarkWeight, CURVE_EPSILON), CURVE_EPSILON)) /
		(CURVE_T_END_SECONDS - CURVE_T0_SECONDS)
	return k === 0 ? 0 : k
}

export const calculateWeightAtTime = (timeSeconds: number, benchmarkWeight: number): number => {
	const k = calculateDecayConstant(benchmarkWeight)
	return benchmarkWeight * Math.exp(-k * (timeSeconds - CURVE_T0_SECONDS))
}

export const calculateIdealTime = (weightKg: number, benchmarkWeight: number): number => {
	const k = calculateDecayConstant(benchmarkWeight)
	if (k === 0) return 0
	const idealTime = CURVE_T0_SECONDS - Math.log(weightKg / Math.max(benchmarkWeight, CURVE_EPSILON)) / k
	return Math.max(1, Math.round(idealTime))
}

export const calculateIdealTimeContinuous = (weightKg: number, benchmarkWeight: number): number => {
	const k = calculateDecayConstant(benchmarkWeight)
	if (k === 0) return 0
	const idealTime = CURVE_T0_SECONDS - Math.log(weightKg / Math.max(benchmarkWeight, CURVE_EPSILON)) / k
	return Math.max(1, idealTime)
}

export const deriveBenchmarkWeight = (weightKg: number, timeHeld: number): number => {
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

export const getSuggestedSectionWeightKg = (section: CurveSection, benchmarkWeightKg: number): number => {
	const balancedPowerWeight = benchmarkWeightKg * BALANCED_RATIO
	return roundToTwo(balancedPowerWeight * SECTION_CURVE_MODEL[section].weightRatioOfBalanced)
}

export const getSectionWeightBounds = (
	section: CurveSection,
	benchmarkWeightKg: number,
): { lowerBoundaryWeightKg: number; upperBoundaryWeightKg: number } => {
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

export const getModelRatioForRep = (ratios: number[], rep: number): number => {
	if (ratios.length === 0) return 1
	if (rep <= 1) return ratios[0]
	const index = Math.min(rep - 1, ratios.length - 1)
	return ratios[index]
}

export const getSectionTargetTimeForRep = (
	section: CurveSection,
	rep: number,
	baseFirstHangTarget: number = SECTION_CURVE_MODEL[section].firstRepTargetSeconds,
): number => {
	const ratio = getModelRatioForRep(SECTION_CURVE_MODEL[section].repRatios, rep)
	return Math.max(1, Math.round(baseFirstHangTarget * ratio))
}

export const getPowerEnduranceMin = (enduranceValue: number): number => {
	const raw = 0.2 * enduranceValue + 0.16
	return clamp(roundToTwo(raw), MIN_POWER_ENDURANCE, 0.2)
}

export const getPowerMax = (powerEnduranceValue: number): number => {
	const raw = 0.6 * powerEnduranceValue + 0.628
	return clamp(roundToTwo(raw), 0.73, MAX_POWER)
}

export const getPowerMin = (powerEnduranceValue: number): number => {
	const slope = (0.4 - 0.22) / (0.37 - 0.2)
	const raw = 0.22 + slope * (powerEnduranceValue - 0.2)
	return clamp(roundToTwo(raw), MIN_POWER, 0.4)
}

export const getManualEnergyTargetTimeForRep = (
	rep: number,
	baseFirstHangTarget: number,
	power: number,
	powerEndurance: number,
	endurance: number,
): number => {
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

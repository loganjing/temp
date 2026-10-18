/**
 * 前端契约类型镜像：字段形状来自 docs/wi-t1000062/technical-contract.md（字段级契约唯一来源）。
 * decimal 一律 string（服务端全精度，显示层四舍五入且不回写）；前端不实现业务公式（契约第 14 节）。
 */
export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number }
export type ValidationDetail = { field: string; reason: string }

// —— 认证与用户（契约第 1 节） ——
export type CurrentUser = { id: string; username: string; displayName: string; roles: string[]; permissions?: string[] }
export type LoginResponse = { token: string; user: CurrentUser }

// —— 地块（契约第 2 节） ——
export type ParcelStatus = 'processing' | 'in_review' | 'completed' | 'abandoned'
export type ParcelSummary = { gdv: string | null; tdc: string | null; pbt: string | null; pm: string | null; sourcePlanId: string | null }
export type Parcel = {
  id: string; name: string; internalNo: string | null; state: string | null; city: string | null; district: string | null
  areaSqft: string | null; status: ParcelStatus; currentStageNote: string | null; adoptedPlanId: string | null
  summary: ParcelSummary; summaryIncomplete: boolean; ownerName: string | null; ownerId: string | null; updatedAt: string
}
export type ParcelProgress = { profileCollected: boolean; marketResearched: boolean; assessmentDone: boolean; planFormalized: boolean; approvalDone: boolean }
export type ParcelDetail = Parcel & { progress: ParcelProgress }
export type StatusChangeResponse = { status: ParcelStatus; change: { id: string; fromStatus: string; toStatus: string; actor: string; reason: string; note: string | null; at: string } }
export type AuditEntry = { id: string; actor: string | null; action: string; objectType: string | null; objectId: string | null; at: string; summary: string | null }

// —— 地块档案（契约第 3 节） ——
export type ChecklistStatus = 'confirmed' | 'assumed' | 'pending'
export type ChecklistEntry = { item: string; status: ChecklistStatus; note: string | null }
export type ParcelProfile = {
  name: string; internalNo: string | null; state: string | null; city: string | null; district: string | null
  address: string | null; lotInfo: string | null; tenure: 'freehold' | 'leasehold' | null; tenureYears: number | null
  totalLandAreaSqft: string | null; currentUse: string | null; plannedUse: string | null; zoning: string | null; allowedDevelopment: string | null
  vendorAskingPrice: string | null; totalLandPrice: string | null; unitLandPrice: string | null
  landPriceLastEditedBasis: 'total' | 'unit' | null; paymentTerms: string | null; landFinancingNote: string | null
  needsConversion: boolean; conversionPremium: string | null; developmentCharges: string | null; otherGovChargesNote: string | null
  checklist: ChecklistEntry[]; ownershipCompany: string | null; assetAttribution: string | null; defaultAreaConventionId: string | null
}
export type Attachment = { id: string; category: string; fileName: string; size: number; note: string | null; uploadedBy: string | null; uploadedAt: string }

// —— 地图（契约第 4 节） ——
export type MapMarkerKind = 'parcel' | 'competitor' | 'land-deal' | 'poi'
export type MapMarker = { id: string; kind: MapMarkerKind; refId: string | null; label: string; color: string | null; note: string | null }
export type MapLink = { provider: 'google-maps' | 'other'; url: string }
export type MapData = { parcelId: string; location: { lat: string; lng: string } | null; boundaryGeojson: unknown; markers: MapMarker[]; externalMapLinks: MapLink[] }
export type MapViewPayload = { center?: { lat?: unknown; lng?: unknown } | null; zoom: number; layers: string[]; markerIds: string[]; boundaryIncluded: boolean }
export type MapViewListItem = { id: string; name: string; createdAt: string }
export type MapViewDetail = { id: string; parcelId: string; name: string; view: MapViewPayload | null; createdAt: string }

// —— 市场研究（契约第 5 节） ——
export type Confidence = 'verified' | 'probable' | 'unverified'
export type SourceType = 'government' | 'historical-project' | 'market-judgment' | 'client-input' | 'manual-estimate'
export type LandRef = {
  id: string; parcelId: string; projectName: string; distanceKm: string | null; dealPrice: string | null; pricePerSqft: string | null
  priceToRevenueRatio: string | null; transactedAt: string | null; dealCondition: string | null
  listingStatus: 'transacted' | 'listing' | 'unknown'; source: string; sourceType: SourceType
  collectedAt: string; confidence: Confidence; note: string | null
}
export type CompFormat = 'residential' | 'apartment' | 'service-apartment' | 'hotel' | 'office' | 'retail' | 'other'
export type Comp = {
  id: string; parcelId: string; projectName: string; distanceKm: string | null; format: CompFormat; typeTier: string | null
  unitAreaFrom: string | null; unitAreaTo: string | null; askingPrice: string | null; pricePerSqft: string | null
  totalUnits: number | null; soldUnits: number | null; absorptionRate: string | null; positioning: string | null; incentives: string | null
  affordableFlag: boolean; projectStatus: string | null; source: string; sourceType: SourceType; collectedAt: string; confidence: Confidence; note: string | null
}

// —— 快速评估（契约第 6 节） ——
export type QuickVerdict = 'PASS' | 'REJECT' | 'DROP' | 'INSUFFICIENT'
export type NextAction = 'market-research' | 'title-verification' | 'site-visit' | 'price-negotiation' | 'jv' | 'abandon'
export type QuickPolicyAssumptions = { bumiQuotaPct?: string; bumiDiscountPct?: string; affordableRatio?: string; targetPm?: string }
export type QuickAssessmentInputs = {
  locationNote: string | null; landAreaSqft: string; useOrZoning: string | null; plotRatioOrDensity: string
  productMixNote: string | null; estimatedUnitsOrSaleableArea: string; unitPriceOrPricePerSqft: string
  landCostTotal: string | null; landCostPerSqft: string | null; landCostLastEditedBasis: 'total' | 'per-sqft' | null
  constructionCostPerSqft: string; miscGovPerSqft: string | null; professionalFeePct: string | null
  salesMarketingPct: string | null; financeCostPct: string | null; policyAssumptions: QuickPolicyAssumptions | null; costPackageId: string | null
}
export type QuickResults = {
  gdv: string; bumiQuotaDiscount: string; netGdv: string; constructionCost: string; miscGov: string; professionalFee: string
  salesMarketing: string; financeCost: string; tdc: string; pbt: string; pm: string
  landCostPerSqft: string; landCostToNetRevenueRatio: string; tdcToRevenueRatio: string
}
export type QuickAssessment = {
  id: string; parcelId: string; inputs: QuickAssessmentInputs; results: QuickResults | null
  verdict: QuickVerdict | null; verdictNote: string | null; nextAction: NextAction | null; nextActionNote: string | null
  createdBy: string; createdAt: string; updatedAt: string
}
export type QuickAssessmentRow = { id: string; parcelId: string; parcelName: string; state: string | null; verdict: QuickVerdict | null; results: QuickResults | null; updatedAt: string }

// —— 方案（契约第 7 节） ——
export type PlanKind = 'baseline' | 'candidate'
export type PlanStatus = 'draft' | 'saved' | 'formalized' | 'in_review' | 'adopted' | 'not_selected' | 'returned'
export type ProductFormat = 'residential' | 'apartment' | 'service-apartment' | 'hotel' | 'office' | 'retail' | 'other' | 'mixed-use'
export type PriceBasis = 'unit-price' | 'per-sqft' | 'policy-fixed'
export type CostCategory = 'land' | 'construction' | 'infrastructure' | 'furniture-equipment' | 'contingency-tax' | 'misc-gov' | 'professional-pm' | 'sales-marketing' | 'finance'
export type CostBasis = 'fixed' | 'per-land-area' | 'per-gfa' | 'per-saleable' | 'pct-revenue' | 'pct-cost' | 'per-unit' | 'per-parking' | 'per-year'
export type AllocationBasis = 'saleable-area' | 'gfa' | 'units' | 'custom-ratio'
export type PlanProductInput = {
  id: string; format: ProductFormat; tier: string | null; sharePct: string; units: number; unitAreaSqft: string; saleableAreaSqft: string
  price: string | null; pricePerSqft: string | null; priceBasis: PriceBasis
  bumiQuotaPct: string | null; bumiDiscountPct: string | null
  affordableQuota: { units?: number; price?: string; ratio?: string } | null; parkingPerUnit: string | null
}
export type PlanPhaseInput = {
  id: string; name: string; seq: number
  landAllocation: { method: 'by-land-area' | 'by-gfa' | 'manual'; value: string | null }
  products: PlanProductInput[]; gfaBreakdown: Record<string, string> | null
}
export type PlanCostInput = {
  id: string; phaseId: string | null; category: CostCategory; itemName: string; basis: CostBasis; value: string
  sourceType: SourceType; status: 'confirmed' | 'zero' | 'pending'; note: string | null
}
export type PlanCommonPoolInput = {
  id: string; category: CostCategory; amount: string; allocationBasis: AllocationBasis
  customRatios: Record<string, string> | null; ruleNote: string | null
}
export type PlanInputs = {
  areaBasis: {
    landAreaSqft: string; plotRatioOrDensity: string; densityBasis: 'plot-ratio' | 'units-per-acre'
    areaConventionId: string | null; areaConventionReason: string | null
    gfaIncludesParking: boolean; nfaMode: 'convention-default' | 'manual'; manualEfficiency: string | null
  }
  phases: PlanPhaseInput[]
  parking: { govMin: number; internalTarget: number; usedBasis: 'gov' | 'internal'; visitorSlots: number | null; extraInternalSlots: number | null; areaPerSlotSqft: string }
  costs: PlanCostInput[]
  commonPools: PlanCommonPoolInput[]
  landPrice: { total: string | null; perSqft: string | null; lastEditedBasis: 'total' | 'per-sqft' }
}
export type PlanResults = {
  gfaTotal: string; gfaExParking: string; nfaTotal: string; efficiencyExParking: string; efficiencyInclParking: string
  totalUnits: number; unitsPerAcre: string
  revenue: {
    byProduct: Array<{ productId: string; format: ProductFormat; revenue: string; bumiAdjustment: string }>
    gdv: string; bumiQuotaDiscount: string; netGdv: string; parkingRevenue: string; otherSaleableRevenue: string
  }
  costs: {
    byCategory: Array<{ category: CostCategory; amount: string; items: Array<{ costItemId: string; itemName: string; amount: string; sourceType: SourceType; status: string }> }>
    commonPoolAllocations: Array<{ poolId: string; phaseId: string; amount: string; basis: string }>
    tdc: string
  }
  profit: { pbt: string; pat: string | null; pm: string; perUnit: Record<string, string>; perSqft: Record<string, string>; perAcre: Record<string, string> }
  computedAt: string
  basis: { areaConventionId: string | null; landPriceBasis: string | null }
}
export type PlanMeta = {
  id: string; parcelId: string; phaseCount: number; name: string; kind: PlanKind; status: PlanStatus
  sourcePlanId: string | null; copiedAt: string | null; copiedBy: string | null; changeNote: string | null; ownerId: string
  assumptionTags: string[]; parameterRefs: { areaConventionId: string | null; costPackageIds: string[] | null; policyRefs: string[] | null }
  createdAt: string; updatedAt: string
}
export type PlanResource = PlanMeta & { inputs: PlanInputs; results: PlanResults | null; snapshotId?: string | null }
export type PlanResultsResponse = { results: PlanResults | null; basis: { areaConventionId: string | null; landPriceBasis: string | null } }

// —— 分析（契约第 8 节） ——
export type SensitivityVariable = 'land-price' | 'unit-price' | 'construction-cost' | 'plot-ratio' | 'efficiency' | 'conversion-premium' | 'finance-rate' | 'finance-term' | 'affordable-ratio' | 'parking-count' | 'product-mix'
export type ZoneKey = 'ok' | 'warning' | 'danger'
export type ColorRule = { targetLine: string; zones: { aboveTarget: string; nearTarget: string; belowTarget: string } } | null
export type MatrixCell = { coord: string[]; pm: string; pbt: string; tdc: string; netGdv: string; feasibility: 'feasible' | 'marginal' | 'infeasible'; riskNote: string | null }
export type SensitivityResponse = { matrix: MatrixCell[]; colorRuleApplied: ColorRule }
export type BackSolveResponse = { targetPm: string; solveFor: 'max-land-price' | 'min-unit-price' | 'max-construction-cost'; resultValue: string; basisNote: string }
export type CompareResponse = { plans: Array<{ id: string; name: string; kind: string; status: string; parcelId: string; updatedAt: string }>; rows: Array<{ dimension: string; values: Array<string | number | null> }> }

// —— 审批（契约第 9 节） ——
export type Submission = { id: string; parcelId: string; submittedBy: string; submittedAt: string; status: 'pending' | 'approved' | 'returned'; note: string | null }
export type SubmissionPlan = { id: string; name: string; kind: string; status: string; parcelId: string; assumptionTags: string[]; formalizedSnapshot: { snapshotId: string; results: unknown; formalizedAt: string } | null }
export type SubmissionAction = { id: string; actor: string; action: 'approve' | 'return'; reason: string | null; selectedPlanId: string | null; at: string }
export type SubmissionDetail = Submission & { plans: SubmissionPlan[]; actions: SubmissionAction[]; returnCount: number }
export type DecisionRecord = { parcelId: string; adoptedPlanId: string | null; action: 'continue' | 'abandon' | 'negotiate' | 'site-visit' | 'jv' | null; reason: string | null; decidedAt: string | null; decidedBy: string | null; handoffTo: string | null }

// —— 报告与交接（契约第 10 节） ——
export type DashboardRisk = { text: string; source: string }
export type Dashboard = {
  conclusion: { recommendation: string; oneLineReason: string } | null
  incomplete: boolean
  coreMetrics: { gdv: string | null; netGdv: string | null; tdc: string | null; pbt: string | null; pm: string | null; landCostRatio: string | null } | null
  recommendedPlan: { id: string; name: string; kind: string; status: string } | null
  risks: DashboardRisk[]
  nextSteps: Array<{ action: string; owner: string | null; doneWhen: string }>
  links: { planDetail: string | null; report: string; marketBasis: string }
}
export type ReportSection = { key: string; data: Record<string, unknown> }
export type HandoffContent = {
  parcel?: { id?: string; name?: string; state?: string | null; areaSqft?: string | null }
  adoptedPlan?: { id?: string; name?: string; version?: string; status?: string }
  results?: PlanResults | null
  assumptions?: { assumptionTags?: string[]; inputs?: unknown }
  approvals?: { decision?: { action?: string; reason?: string; decidedAt?: string; decidedBy?: string } | null }
  pendingItems?: Array<{ itemName: string; category: string }>
  attachments?: Array<{ id: string; category: string; fileName: string; uploadedAt: string }>
  basisNote?: string
}
export type HandoffLatest = { id: string; parcelId: string; adoptedPlanId: string; version: string; content: HandoffContent | null; generatedAt: string; readOnly: boolean }

// —— 参数（契约第 11 节） ——
export type ParameterKind = 'area-convention' | 'cost-package' | 'policy' | 'fee-item' | 'option-list'
export type ParameterSet = {
  id: string; kind: ParameterKind | string; region: string | null; version: number; effectiveAt: string; createdBy: string
  scope: Record<string, unknown> | null; content: Record<string, unknown> | null; changeNote: string; createdAt: string
}

// —— AI 建议（契约第 12 节） ——
export type AiSuggestion = {
  id: string; status: 'pending' | 'confirmed' | 'dismissed'; kind: 'market-summary' | 'plan-adjustment'; parcelId: string
  targetPlanId: string | null; prompt: string | null; content: Record<string, unknown> | null
  sources: Array<{ refType: string; refId: string | null; confidence: string; note: string | null }>
  createdBy: string; createdAt: string
}

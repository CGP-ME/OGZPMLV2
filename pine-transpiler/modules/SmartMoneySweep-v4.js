/**
 * Auto-generated from SmartMoneySweep-v4.pine - DO NOT EDIT MANUALLY
 * Requires: pine-transpiler/core/*
 */
const PineRuntime = require('../core/PineRuntime');

const SOURCE = `//@version=5
strategy("SmartMoneySweep v4 [OGZPrime]", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=5, initial_capital=10000, commission_type=strategy.commission.percent, commission_value=0.0, slippage=1, calc_on_every_tick=false, process_orders_on_close=true)

// ══════════════════════════════════════════════════════════════════════════════
// INPUTS
// ══════════════════════════════════════════════════════════════════════════════

// --- Step 1: Profile Framing (Daily Bias) ---
vpDays          = input.int(5, "VP Lookback (trading days)", minval=1, maxval=20, tooltip="Volume profile built from this many trading days. Auto-scales to any timeframe.")
vpBins          = input.int(50, "VP Bin Count", minval=20, maxval=200)
valueAreaPct    = input.float(70, "Value Area %", minval=50, maxval=90, step=5)
bodyWeightPct   = input.float(70, "Body Volume Weight %", minval=50, maxval=90, step=5)
lvnPctile       = input.float(20, "LVN Percentile", minval=5, maxval=40, step=5)

// Auto-calculate VP lookback in bars based on timeframe
barsPerDay      = math.round(390 / timeframe.multiplier)  // 390 min in US trading day
vpLookback      = vpDays * barsPerDay

// --- Step 2: IVB (Initial Volume Breakout) ---
ivbMinutes      = input.int(30, "IVB Period (minutes)", minval=15, maxval=60, step=15, tooltip="First N minutes of cash session define the initial balance range.")
cashSessionStart = input.session("0930-1600", "Cash Session (RTH)")

// --- Step 4: Entry Confirmation ---
volAvgLen       = input.int(20, "Volume Average Length", minval=5, maxval=50)
absorbBodyPct   = input.float(35, "Absorption Max Body %", minval=10, maxval=50, step=5)
absorbWickPct   = input.float(60, "Absorption Min Wick %", minval=40, maxval=80, step=5)
absorbVolMult   = input.float(1.2, "Absorption Vol Multiplier", minval=0.8, maxval=2.0, step=0.1)
initBodyPct     = input.float(60, "Initiative Min Body %", minval=40, maxval=80, step=5)
absorbBodyProgPct  = input.float(50, "Absorption Body % (Progress)", minval=20, maxval=65, step=5)
absorbWickProgPct  = input.float(40, "Absorption Wick % (Progress)", minval=20, maxval=60, step=5)
absorbVolProgMult  = input.float(0.9, "Absorption Vol Mult (Progress)", minval=0.5, maxval=1.2, step=0.1)
initBodyProgPct    = input.float(45, "Initiative Body % (Progress)", minval=25, maxval=60, step=5)

// --- Step 5: Position Sizing ---
minPositionPct  = input.float(5.0, "Min Position %", minval=1.0, maxval=10.0, step=0.5)
midPositionPct  = input.float(8.0, "Mid Position %", minval=3.0, maxval=15.0, step=0.5)
maxPositionPct  = input.float(12.0, "Max Position %", minval=5.0, maxval=20.0, step=0.5)

// --- Step 6-7: Trade Management & Exits ---
atrLen          = input.int(14, "ATR Length", minval=5, maxval=50)
lowConvATRMult  = input.float(0.5, "Low Conviction TP (ATR mult)", minval=0.1, maxval=2.0, step=0.05)
midConvATRMult  = input.float(1.0, "Mid Conviction TP (ATR mult)", minval=0.25, maxval=3.0, step=0.1)
highConvATRMult = input.float(1.5, "High Conviction TP (ATR mult or VA)", minval=0.5, maxval=5.0, step=0.25)
slBufferPct     = input.float(0.15, "SL Buffer %", minval=0.0, maxval=0.5, step=0.05)
maxLossPct      = input.float(0.3, "Max Loss % Per Trade (hard cap)", minval=0.1, maxval=2.0, step=0.1, tooltip="Lose fast. 0.3% on \$380 = \$1.14/share max loss.")
trailAfterRR    = input.float(0.5, "Trail Activation R:R", minval=0.25, maxval=3.0, step=0.25)
trailBars       = input.int(2, "Trail Bar Lookback", minval=1, maxval=10)
maxHoldBars     = input.int(60, "Max Hold (candles)", minval=5, maxval=200, tooltip="Let runners run. Stop loss does the cutting, not max hold.")
maxDailyLosses  = input.int(3, "Max Losing Trades Per Day", minval=1, maxval=10, tooltip="Fabio: 'Three losing trades to stop'")

// --- Session Edge Filter ---
useSessionFilter = input.bool(true, "Filter First/Last Candle of Session")
sessionStart    = input.session("0945-1545", "Valid Trading Session")

// --- Step 10: CVD ---
cvdDivLen       = input.int(10, "CVD Divergence Lookback", minval=5, maxval=30)

// --- Visuals ---
showVPLines     = input.bool(true, "Show VAH/VAL/POC")
showIVB         = input.bool(true, "Show IVB Range")
showVWAP        = input.bool(true, "Show VWAP")
showSweepHL     = input.bool(true, "Highlight Sweeps")
showEntryArrows = input.bool(true, "Show Entries")
showSLTP        = input.bool(true, "Show SL/TP")
showConfidence  = input.bool(true, "Show Info Table")


// ══════════════════════════════════════════════════════════════════════════════
// STEP 1: VOLUME PROFILE — VAH / VAL / POC
// ══════════════════════════════════════════════════════════════════════════════

var float vpHigh = na
var float vpLow  = na
vpHigh := ta.highest(high, vpLookback)
vpLow  := ta.lowest(low, vpLookback)
vpRange = vpHigh - vpLow
binSize = vpRange / vpBins

var float[] vpVolume = array.new_float(vpBins, 0.0)

if bar_index >= vpLookback and binSize > 0
    for i = 0 to vpBins - 1
        array.set(vpVolume, i, 0.0)
    for j = 0 to vpLookback - 1
        cH = high[j]
        cL = low[j]
        cO = open[j]
        cC = close[j]
        cV = volume[j]
        bTop = math.max(cO, cC)
        bBot = math.min(cO, cC)
        cRng = cH - cL
        if cRng <= 0
            continue
        sBin = math.max(0, math.min(math.floor((cL - vpLow) / binSize), vpBins - 1))
        eBin = math.max(0, math.min(math.floor((cH - vpLow) / binSize), vpBins - 1))
        bsBin = math.max(0, math.min(math.floor((bBot - vpLow) / binSize), vpBins - 1))
        beBin = math.max(0, math.min(math.floor((bTop - vpLow) / binSize), vpBins - 1))
        tBins = eBin - sBin + 1
        bBins = beBin - bsBin + 1
        wBins = tBins - bBins
        if tBins <= 0
            continue
        bW = bodyWeightPct / 100.0
        vpbb = bBins > 0 ? (cV * bW) / bBins : 0.0
        vpwb = wBins > 0 ? (cV * (1.0 - bW)) / wBins : cV / tBins
        if wBins <= 0
            vpbb := cV / tBins
        for k = sBin to eBin
            isBB = k >= bsBin and k <= beBin
            array.set(vpVolume, k, array.get(vpVolume, k) + (isBB ? vpbb : vpwb))

// POC
var int pocBin = 0
var float pocVol = 0.0
if array.size(vpVolume) >= vpBins
    pocVol := 0.0
    pocBin := 0
    for i = 0 to vpBins - 1
        v = array.get(vpVolume, i)
        if v > pocVol
            pocVol := v
            pocBin := i

float pocPrice = vpLow + (pocBin + 0.5) * binSize

// Value Area
float totalVol = 0.0
if array.size(vpVolume) >= vpBins
    for i = 0 to vpBins - 1
        totalVol += array.get(vpVolume, i)

float vaTargetVol = totalVol * (valueAreaPct / 100.0)
var int vahBin = pocBin
var int valBin = pocBin
var float vaVol = pocVol

if totalVol > 0
    vaVol := pocVol
    vahBin := pocBin
    valBin := pocBin
    while vaVol < vaTargetVol
        eUp = vahBin < vpBins - 1
        eDn = valBin > 0
        if not eUp and not eDn
            break
        uV = eUp ? array.get(vpVolume, vahBin + 1) : 0.0
        dV = eDn ? array.get(vpVolume, valBin - 1) : 0.0
        if eUp and (uV >= dV or not eDn)
            vahBin += 1
            vaVol += uV
        else if eDn
            valBin -= 1
            vaVol += dV
        else
            break

float vahPrice = vpLow + (vahBin + 1) * binSize
float valPrice = vpLow + valBin * binSize

// Profile shape detection (Step 1)
// P-shape: POC in upper half = buyers aggressive = long bias
// b-shape: POC in lower half = sellers aggressive = short bias
vpMid = (vpHigh + vpLow) / 2
profileBias = pocPrice > vpMid ? 1 : pocPrice < vpMid ? -1 : 0

// Low Volume Nodes — Fabio: "the most important levels"
var float lvnThreshold = 0.0
if array.size(vpVolume) >= vpBins and totalVol > 0
    float[] sortedVols = array.copy(vpVolume)
    array.sort(sortedVols, order.ascending)
    int pIdx = math.max(0, math.min(math.floor(vpBins * (lvnPctile / 100.0)), vpBins - 1))
    lvnThreshold := array.get(sortedVols, pIdx)

var float[] lvnLevels = array.new_float(0)
array.clear(lvnLevels)
if array.size(vpVolume) >= vpBins
    for i = 0 to vpBins - 1
        if array.get(vpVolume, i) <= lvnThreshold and array.get(vpVolume, i) > 0
            lp = vpLow + (i + 0.5) * binSize
            if (lp < valPrice or lp > vahPrice) and array.size(lvnLevels) < 10
                array.push(lvnLevels, lp)


// ══════════════════════════════════════════════════════════════════════════════
// STEP 2: IVB — INITIAL VOLUME BREAKOUT (First 30 Min Range)
// ══════════════════════════════════════════════════════════════════════════════

// Detect if we're in the cash session
inCashSession = not na(time(timeframe.period, cashSessionStart))

// Track the IVB range — high and low of first N minutes of each session
var float ivbHigh = na
var float ivbLow = na
var bool ivbLocked = false
var int ivbBarCount = 0
var int sessionDay = -1

// Detect new session day
currentDay = dayofweek
newSession = currentDay != sessionDay and inCashSession
if newSession
    sessionDay := currentDay
    ivbHigh := high
    ivbLow := low
    ivbLocked := false
    ivbBarCount := 1

// Build IVB during first N minutes
ivbBarsNeeded = math.round(ivbMinutes / timeframe.multiplier)
if inCashSession and not ivbLocked and not newSession
    ivbBarCount += 1
    if high > ivbHigh or na(ivbHigh)
        ivbHigh := high
    if low < ivbLow or na(ivbLow)
        ivbLow := low
    if ivbBarCount >= ivbBarsNeeded
        ivbLocked := true

// IVB breakout detection
ivbBrokenLong = ivbLocked and close > ivbHigh
ivbBrokenShort = ivbLocked and close < ivbLow

// Track which direction broke first for the day
var int ivbDirection = 0  // 0=no breakout, 1=long, -1=short
if newSession
    ivbDirection := 0
if ivbDirection == 0 and ivbBrokenLong
    ivbDirection := 1
if ivbDirection == 0 and ivbBrokenShort
    ivbDirection := -1

// Market condition: inside IVB = consolidation, outside = directional
insideIVB = ivbLocked and close >= ivbLow and close <= ivbHigh
outsideIVB = ivbLocked and not insideIVB

// IVB midpoint for mean reversion inside range
ivbMid = ivbLocked ? (ivbHigh + ivbLow) / 2 : na


// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

volAvg = ta.sma(volume, volAvgLen)
atrVal = ta.atr(atrLen)

// Session edge filter — avoid first/last candle auction distortion
inSession = useSessionFilter ? not na(time(timeframe.period, sessionStart)) : true

// VWAP — Fabio uses this for profit targets
vwapVal = ta.vwap(close)
vwapUpper = vwapVal + ta.stdev(close, 20)
vwapLower = vwapVal - ta.stdev(close, 20)

candleRange() => high - low
candleBody() => math.abs(close - open)
isBullish() => close > open
isBearish() => close < open

isInsideVA(float price) =>
    price >= valPrice and price <= vahPrice

// Daily loss counter
var int dailyLosses = 0
if newSession
    dailyLosses := 0

canTrade = dailyLosses < maxDailyLosses


// ══════════════════════════════════════════════════════════════════════════════
// STEP 3 & 4: SWEEP DETECTION + ENTRY CONFIRMATION
// Only after IVB is locked and we have a direction
// ══════════════════════════════════════════════════════════════════════════════

// Candle classification
cRange = candleRange()
cBody = candleBody()
uWick = high - math.max(open, close)
lWick = math.min(open, close) - low
bodyPct = cRange > 0 ? (cBody / cRange) * 100 : 0
lWickPct = cRange > 0 ? (lWick / cRange) * 100 : 0
uWickPct = cRange > 0 ? (uWick / cRange) * 100 : 0

// Absorption — MET
absorb_met_body = volume > volAvg * absorbVolMult and bodyPct < absorbBodyPct
absorb_met_lwick = volume > volAvg * absorbVolMult and lWickPct > absorbWickPct
absorb_met_uwick = volume > volAvg * absorbVolMult and uWickPct > absorbWickPct
absorptionMet = absorb_met_body or absorb_met_lwick or absorb_met_uwick

// Absorption — IN PROGRESS
absorb_prog_body = volume > volAvg * absorbVolProgMult and bodyPct < absorbBodyProgPct
absorb_prog_lwick = volume > volAvg * absorbVolProgMult and lWickPct > absorbWickProgPct
absorb_prog_uwick = volume > volAvg * absorbVolProgMult and uWickPct > absorbWickProgPct
absorptionProgress = (absorb_prog_body or absorb_prog_lwick or absorb_prog_uwick) and not absorptionMet

// Initiative — MET
initBullMet = volume > volAvg and bodyPct > initBodyPct and isBullish()
initBearMet = volume > volAvg and bodyPct > initBodyPct and isBearish()

// Initiative — IN PROGRESS
initBullProg = volume > volAvg * 0.8 and bodyPct > initBodyProgPct and isBullish() and not initBullMet
initBearProg = volume > volAvg * 0.8 and bodyPct > initBodyProgPct and isBearish() and not initBearMet

// Prior close inside VA
priorInsideMet = isInsideVA(close[1])
nearVAH = math.abs(close[1] - vahPrice) / vahPrice * 100 < 0.5
nearVAL = math.abs(close[1] - valPrice) / valPrice * 100 < 0.5
priorInsideProgress = (nearVAH or nearVAL) and not priorInsideMet

// CVD
float cvdDelta = isBullish() ? volume : isBearish() ? -volume : 0
var float cvd = 0.0
cvd += cvdDelta
cvdHi = ta.highest(cvd, cvdDivLen)
cvdLo = ta.lowest(cvd, cvdDivLen)
prHi = ta.highest(high, cvdDivLen)
prLo = ta.lowest(low, cvdDivLen)
cvdBullMet = low <= prLo and cvd > cvdLo
cvdBearMet = high >= prHi and cvd < cvdHi
cvdSlope3 = cvd - cvd[3]
priceSlope3 = close - close[3]
cvdBullProg = priceSlope3 < 0 and cvdSlope3 > -math.abs(priceSlope3) * 0.3 and not cvdBullMet
cvdBearProg = priceSlope3 > 0 and cvdSlope3 < math.abs(priceSlope3) * 0.3 and not cvdBearMet

// Exhaustion
exhBullMet = isBearish()[1] and isBearish()[2] and isBearish()[3] and volume[1] < volume[2] and volume[2] < volume[3]
exhBearMet = isBullish()[1] and isBullish()[2] and isBullish()[3] and volume[1] < volume[2] and volume[2] < volume[3]
exhBullProg = isBearish()[1] and isBearish()[2] and volume[1] < volume[2] and not exhBullMet
exhBearProg = isBullish()[1] and isBullish()[2] and volume[1] < volume[2] and not exhBearMet


// ══════════════════════════════════════════════════════════════════════════════
// SWEEP DETECTION — FIRES ON PRICE ACTION, CONTEXT ADDS CONFIDENCE
// No binary gates. The sweep is the signal. IVB/bias scale the trade.
// Sweeps at VAH, VAL, IVB levels, AND LVN levels
// ══════════════════════════════════════════════════════════════════════════════

// LONG sweeps: price wicks below a level and closes back above
sweepLong = false
if close > valPrice and low < valPrice
    sweepLong := true
if ivbLocked and close > ivbLow and low < ivbLow and not na(ivbLow)
    sweepLong := true
if array.size(lvnLevels) > 0
    for i = 0 to array.size(lvnLevels) - 1
        lvn = array.get(lvnLevels, i)
        if lvn < pocPrice and low < lvn and close > lvn
            sweepLong := true
            break

// SHORT sweeps: price wicks above a level and closes back below
sweepShort = false
if close < vahPrice and high > vahPrice
    sweepShort := true
if ivbLocked and close < ivbHigh and high > ivbHigh and not na(ivbHigh)
    sweepShort := true
if array.size(lvnLevels) > 0
    for i = 0 to array.size(lvnLevels) - 1
        lvn = array.get(lvnLevels, i)
        if lvn > pocPrice and high > lvn and close < lvn
            sweepShort := true
            break


// ══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE + CONDITIONS SCORING
// ══════════════════════════════════════════════════════════════════════════════

var float longConfidence = 0.0
var int longConditionsMet = 0

sweepLongAny = (sweepLong[1] or sweepLong[2] or sweepLong[3]) and inCashSession and inSession and canTrade
sweepBarAbsorbL = sweepLong[1] ? absorptionMet[1] : sweepLong[2] ? absorptionMet[2] : sweepLong[3] ? absorptionMet[3] : false
sweepBarAbsorbProgL = sweepLong[1] ? absorptionProgress[1] : sweepLong[2] ? absorptionProgress[2] : sweepLong[3] ? absorptionProgress[3] : false

if sweepLongAny
    longConditionsMet := 0
    longConfidence := 0.0
    // IVB direction alignment — adds confidence or conditions met
    if ivbDirection == 1
        longConditionsMet += 1
    else if ivbDirection == 0 and ivbLocked
        longConfidence += 10.0
    // Profile bias alignment
    if profileBias == 1
        longConditionsMet += 1
    else if profileBias == 0
        longConfidence += 10.0
    // Absorption on sweep candle
    if sweepBarAbsorbL
        longConditionsMet += 1
    else if sweepBarAbsorbProgL
        longConfidence += 20.0
    if initBullMet
        longConditionsMet += 1
    else if initBullProg
        longConfidence += 20.0
    if priorInsideMet[1]
        longConditionsMet += 1
    else if priorInsideProgress[1]
        longConfidence += 15.0
    if cvdBullMet
        longConditionsMet += 1
    else if cvdBullProg
        longConfidence += 15.0
    if exhBullMet
        longConditionsMet += 1
    else if exhBullProg
        longConfidence += 10.0
else
    longConfidence := 0.0
    longConditionsMet := 0

var float shortConfidence = 0.0
var int shortConditionsMet = 0

sweepShortAny = (sweepShort[1] or sweepShort[2] or sweepShort[3]) and inCashSession and inSession and canTrade
sweepBarAbsorbS = sweepShort[1] ? absorptionMet[1] : sweepShort[2] ? absorptionMet[2] : sweepShort[3] ? absorptionMet[3] : false
sweepBarAbsorbProgS = sweepShort[1] ? absorptionProgress[1] : sweepShort[2] ? absorptionProgress[2] : sweepShort[3] ? absorptionProgress[3] : false

if sweepShortAny
    shortConditionsMet := 0
    shortConfidence := 0.0
    // IVB direction alignment
    if ivbDirection == -1
        shortConditionsMet += 1
    else if ivbDirection == 0 and ivbLocked
        shortConfidence += 10.0
    // Profile bias alignment
    if profileBias == -1
        shortConditionsMet += 1
    else if profileBias == 0
        shortConfidence += 10.0
    // Absorption on sweep candle
    if sweepBarAbsorbS
        shortConditionsMet += 1
    else if sweepBarAbsorbProgS
        shortConfidence += 20.0
    if initBearMet
        shortConditionsMet += 1
    else if initBearProg
        shortConfidence += 20.0
    if priorInsideMet[1]
        shortConditionsMet += 1
    else if priorInsideProgress[1]
        shortConfidence += 15.0
    if cvdBearMet
        shortConditionsMet += 1
    else if cvdBearProg
        shortConfidence += 15.0
    if exhBearMet
        shortConditionsMet += 1
    else if exhBearProg
        shortConfidence += 10.0
else
    shortConfidence := 0.0
    shortConditionsMet := 0


// ══════════════════════════════════════════════════════════════════════════════
// ENTRY LOGIC — IVB must be locked, direction must be set, sweep must be fresh
// ══════════════════════════════════════════════════════════════════════════════

var int lastLongSweepBar = -1
var int lastShortSweepBar = -1

currentLongSweepBar = sweepLong[1] ? bar_index - 1 : sweepLong[2] ? bar_index - 2 : sweepLong[3] ? bar_index - 3 : -1
currentShortSweepBar = sweepShort[1] ? bar_index - 1 : sweepShort[2] ? bar_index - 2 : sweepShort[3] ? bar_index - 3 : -1

sweepLongFresh = sweepLongAny and currentLongSweepBar != lastLongSweepBar
sweepShortFresh = sweepShortAny and currentShortSweepBar != lastShortSweepBar

// Sweep is fresh + at least one condition showing life = trade
// IVB locked status already added confidence in scoring above
longValid = sweepLongFresh and (longConditionsMet >= 1 or longConfidence > 0)
shortValid = sweepShortFresh and (shortConditionsMet >= 1 or shortConfidence > 0)

// Position sizing — only scale up with initiative confirmed
getLongSize() =>
    hasInit = initBullMet
    longConditionsMet >= 3 and hasInit ? maxPositionPct : longConditionsMet >= 2 and hasInit ? midPositionPct : minPositionPct

getShortSize() =>
    hasInit = initBearMet
    shortConditionsMet >= 3 and hasInit ? maxPositionPct : shortConditionsMet >= 2 and hasInit ? midPositionPct : minPositionPct

// Take profit: ATR-based scaled by conviction, with VP/VWAP as structural targets
// Low conviction = quick ATR scalp
// Mid conviction = ATR mid or POC/VWAP, whichever is closer
// High conviction = ATR high or VAH/VWAP, whichever is closer
// This merges v3's ATR scaling with v4's VWAP awareness
getLongTP(float entry) =>
    total = longConditionsMet
    atrTP_low = entry + atrVal * lowConvATRMult
    atrTP_mid = entry + atrVal * midConvATRMult
    atrTP_high = entry + atrVal * highConvATRMult
    vpTP = pocPrice > entry ? pocPrice : vahPrice > entry ? vahPrice : atrTP_mid
    vwTP = vwapVal > entry ? vwapVal : vwapUpper > entry ? vwapUpper : atrTP_mid
    midTarget = math.min(math.min(vpTP, vwTP), atrTP_mid)
    highTarget = vahPrice > entry ? math.min(vahPrice, atrTP_high) : atrTP_high
    total >= 3 ? highTarget : total >= 2 ? midTarget : atrTP_low

getShortTP(float entry) =>
    total = shortConditionsMet
    atrTP_low = entry - atrVal * lowConvATRMult
    atrTP_mid = entry - atrVal * midConvATRMult
    atrTP_high = entry - atrVal * highConvATRMult
    vpTP = pocPrice < entry ? pocPrice : valPrice < entry ? valPrice : atrTP_mid
    vwTP = vwapVal < entry ? vwapVal : vwapLower < entry ? vwapLower : atrTP_mid
    midTarget = math.max(math.max(vpTP, vwTP), atrTP_mid)
    highTarget = valPrice < entry ? math.max(valPrice, atrTP_high) : atrTP_high
    total >= 3 ? highTarget : total >= 2 ? midTarget : atrTP_low


// ══════════════════════════════════════════════════════════════════════════════
// POSITION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

var float entryPrice = na
var float stopLoss = na
var float takeProfit = na
var float trailStop = na
var int barsInTrade = 0
var bool trailActive = false
var float posSize = na
var int entryCondsMet = 0
var float entryConfidence = 0.0

if longValid
    posSize := getLongSize()
    entryPrice := close
    slBuffer = close * (slBufferPct / 100.0)
    sweepLow = math.min(low[1], math.min(low[2], low[3]))
    wickSL = sweepLow - slBuffer
    maxLossSL = close - (close * maxLossPct / 100.0)
    stopLoss := math.max(wickSL, maxLossSL)
    takeProfit := getLongTP(close)
    trailActive := false
    trailStop := na
    barsInTrade := 0
    entryCondsMet := longConditionsMet
    entryConfidence := longConfidence
    lastLongSweepBar := currentLongSweepBar
    strategy.entry("Long", strategy.long, qty=math.round(strategy.equity * (posSize / 100.0) / close, 2))

if shortValid
    posSize := getShortSize()
    entryPrice := close
    slBuffer = close * (slBufferPct / 100.0)
    sweepHigh = math.max(high[1], math.max(high[2], high[3]))
    wickSL = sweepHigh + slBuffer
    maxLossSL = close + (close * maxLossPct / 100.0)
    stopLoss := math.min(wickSL, maxLossSL)
    takeProfit := getShortTP(close)
    trailActive := false
    trailStop := na
    barsInTrade := 0
    entryCondsMet := shortConditionsMet
    entryConfidence := shortConfidence
    lastShortSweepBar := currentShortSweepBar
    strategy.entry("Short", strategy.short, qty=math.round(strategy.equity * (posSize / 100.0) / close, 2))

// Track bars in trade
if strategy.position_size != 0
    barsInTrade += 1
else
    barsInTrade := 0
    trailActive := false

// Trailing stop — get to risk-free ASAP (Fabio: "In 1 minute the position is risk-free")
if strategy.position_size > 0
    if na(entryPrice) or entryPrice == 0
        entryPrice := strategy.position_avg_price
    riskAmt = entryPrice - stopLoss
    if riskAmt > 0 and (close - entryPrice) >= riskAmt * trailAfterRR
        trailActive := true
    if trailActive
        tl = ta.lowest(low, trailBars)
        if na(trailStop) or tl > trailStop
            trailStop := tl
        trailStop := math.max(trailStop, stopLoss)

if strategy.position_size < 0
    if na(entryPrice) or entryPrice == 0
        entryPrice := strategy.position_avg_price
    riskAmt = stopLoss - entryPrice
    if riskAmt > 0 and (entryPrice - close) >= riskAmt * trailAfterRR
        trailActive := true
    if trailActive
        tl = ta.highest(high, trailBars)
        if na(trailStop) or tl < trailStop
            trailStop := tl
        trailStop := math.min(trailStop, stopLoss)

activeSL = trailActive and not na(trailStop) ? trailStop : stopLoss

// Dynamic max hold
activeMaxHold = entryCondsMet >= 2 ? maxHoldBars : math.round(maxHoldBars / 2)

if strategy.position_size > 0
    strategy.exit("Long Exit", "Long", stop=activeSL, limit=takeProfit)
    if barsInTrade >= activeMaxHold
        strategy.close("Long", comment="Max Hold")

if strategy.position_size < 0
    strategy.exit("Short Exit", "Short", stop=activeSL, limit=takeProfit)
    if barsInTrade >= activeMaxHold
        strategy.close("Short", comment="Max Hold")

// Track daily losses for 3-loss stop rule
if strategy.position_size == 0
    entryPrice := na
    stopLoss := na
    takeProfit := na
    trailStop := na

// Count a loss when trade closes with negative P&L
if strategy.closedtrades > 0
    lastTradeProfit = strategy.closedtrades.profit(strategy.closedtrades - 1)
    if lastTradeProfit < 0 and barstate.isconfirmed
        dailyLosses += 1


// ══════════════════════════════════════════════════════════════════════════════
// VISUALS
// ══════════════════════════════════════════════════════════════════════════════

// VP lines
plot(showVPLines ? vahPrice : na, "VAH", color=color.new(color.red, 30), linewidth=2, style=plot.style_stepline)
plot(showVPLines ? valPrice : na, "VAL", color=color.new(color.green, 30), linewidth=2, style=plot.style_stepline)
plot(showVPLines ? pocPrice : na, "POC", color=color.new(color.orange, 30), linewidth=2, style=plot.style_stepline)

// LVN lines
plot(showVPLines and array.size(lvnLevels) > 0 ? array.get(lvnLevels, 0) : na, "LVN 1", color=color.new(color.gray, 50), linewidth=1, style=plot.style_cross)
plot(showVPLines and array.size(lvnLevels) > 1 ? array.get(lvnLevels, 1) : na, "LVN 2", color=color.new(color.gray, 50), linewidth=1, style=plot.style_cross)
plot(showVPLines and array.size(lvnLevels) > 2 ? array.get(lvnLevels, 2) : na, "LVN 3", color=color.new(color.gray, 50), linewidth=1, style=plot.style_cross)
plot(showVPLines and array.size(lvnLevels) > 3 ? array.get(lvnLevels, 3) : na, "LVN 4", color=color.new(color.gray, 50), linewidth=1, style=plot.style_cross)
plot(showVPLines and array.size(lvnLevels) > 4 ? array.get(lvnLevels, 4) : na, "LVN 5", color=color.new(color.gray, 50), linewidth=1, style=plot.style_cross)

// IVB range
plot(showIVB and ivbLocked ? ivbHigh : na, "IVB High", color=color.new(color.blue, 30), linewidth=2, style=plot.style_stepline)
plot(showIVB and ivbLocked ? ivbLow : na, "IVB Low", color=color.new(color.blue, 30), linewidth=2, style=plot.style_stepline)
plot(showIVB and ivbLocked ? ivbMid : na, "IVB Mid", color=color.new(color.blue, 60), linewidth=1, style=plot.style_cross)

// VWAP
plot(showVWAP ? vwapVal : na, "VWAP", color=color.new(color.purple, 30), linewidth=1)
plot(showVWAP ? vwapUpper : na, "VWAP+1σ", color=color.new(color.purple, 60), linewidth=1, style=plot.style_cross)
plot(showVWAP ? vwapLower : na, "VWAP-1σ", color=color.new(color.purple, 60), linewidth=1, style=plot.style_cross)

// Sweep highlights
sweepLongColor = showSweepHL and sweepLong ? color.new(color.green, 85) : na
sweepShortColor = showSweepHL and sweepShort ? color.new(color.red, 85) : na
bgcolor(sweepLongColor, title="Sweep Long Setup")
bgcolor(sweepShortColor, title="Sweep Short Setup")

// IVB forming period
bgcolor(inCashSession and not ivbLocked ? color.new(color.blue, 95) : na, title="IVB Forming")

// Entry arrows
plotshape(showEntryArrows and longValid, title="Long", location=location.belowbar, color=color.green, style=shape.triangleup, size=size.normal, text="LONG")
plotshape(showEntryArrows and shortValid, title="Short", location=location.abovebar, color=color.red, style=shape.triangledown, size=size.normal, text="SHORT")

// SL/TP lines
plot(showSLTP and strategy.position_size > 0 ? activeSL : na, "Long SL", color=color.red, linewidth=1, style=plot.style_linebr)
plot(showSLTP and strategy.position_size > 0 ? takeProfit : na, "Long TP", color=color.green, linewidth=1, style=plot.style_linebr)
plot(showSLTP and strategy.position_size < 0 ? activeSL : na, "Short SL", color=color.red, linewidth=1, style=plot.style_linebr)
plot(showSLTP and strategy.position_size < 0 ? takeProfit : na, "Short TP", color=color.green, linewidth=1, style=plot.style_linebr)

// Info table
var table cTable = table.new(position.top_right, 2, 12, bgcolor=color.new(color.black, 80), border_width=1)
if barstate.islast and showConfidence
    table.cell(cTable, 0, 0, "VAH", text_color=color.red, text_size=size.small)
    table.cell(cTable, 1, 0, str.tostring(vahPrice, format.mintick), text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 1, "POC", text_color=color.orange, text_size=size.small)
    table.cell(cTable, 1, 1, str.tostring(pocPrice, format.mintick), text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 2, "VAL", text_color=color.green, text_size=size.small)
    table.cell(cTable, 1, 2, str.tostring(valPrice, format.mintick), text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 3, "IVB Hi", text_color=color.blue, text_size=size.small)
    table.cell(cTable, 1, 3, ivbLocked ? str.tostring(ivbHigh, format.mintick) : "forming", text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 4, "IVB Lo", text_color=color.blue, text_size=size.small)
    table.cell(cTable, 1, 4, ivbLocked ? str.tostring(ivbLow, format.mintick) : "forming", text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 5, "IVB Dir", text_color=color.blue, text_size=size.small)
    table.cell(cTable, 1, 5, ivbDirection == 1 ? "LONG" : ivbDirection == -1 ? "SHORT" : "NONE", text_color=ivbDirection == 1 ? color.green : ivbDirection == -1 ? color.red : color.gray, text_size=size.small)
    table.cell(cTable, 0, 6, "Bias", text_color=color.white, text_size=size.small)
    table.cell(cTable, 1, 6, profileBias == 1 ? "LONG" : profileBias == -1 ? "SHORT" : "NEUTRAL", text_color=profileBias == 1 ? color.green : profileBias == -1 ? color.red : color.gray, text_size=size.small)
    table.cell(cTable, 0, 7, "─────", text_color=color.gray, text_size=size.small)
    table.cell(cTable, 1, 7, "─────", text_color=color.gray, text_size=size.small)
    table.cell(cTable, 0, 8, "Conds", text_color=color.yellow, text_size=size.small)
    table.cell(cTable, 1, 8, str.tostring(entryCondsMet), text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 9, "Conf", text_color=color.aqua, text_size=size.small)
    table.cell(cTable, 1, 9, str.tostring(entryConfidence, "#.0"), text_color=color.white, text_size=size.small)
    table.cell(cTable, 0, 10, "Losses", text_color=color.red, text_size=size.small)
    table.cell(cTable, 1, 10, str.tostring(dailyLosses) + "/" + str.tostring(maxDailyLosses), text_color=dailyLosses >= maxDailyLosses ? color.red : color.white, text_size=size.small)
    table.cell(cTable, 0, 11, "VWAP", text_color=color.purple, text_size=size.small)
    table.cell(cTable, 1, 11, str.tostring(vwapVal, format.mintick), text_color=color.white, text_size=size.small)


// ══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ══════════════════════════════════════════════════════════════════════════════

alertcondition(longValid, title="SMS Long", message="SMS Long Entry Signal")
alertcondition(shortValid, title="SMS Short", message="SMS Short Entry Signal")
alertcondition(ivbBrokenLong, title="IVB Breakout Long", message="IVB broke to the upside")
alertcondition(ivbBrokenShort, title="IVB Breakout Short", message="IVB broke to the downside")
`;

const runtime = new PineRuntime(SOURCE);

module.exports = {
  name: 'SmartMoneySweep-v4',

  /**
   * @param {Object} ctx - { priceHistory: [{open,high,low,close,volume,timestamp}] }
   * @returns {Object} - { direction, confidence, overrideLevels, sizingMultiplier, reason }
   */
  evaluate(ctx) {
    // feed the newest candle to the runtime
    const candle = ctx.priceHistory[ctx.priceHistory.length - 1];
    return runtime.evaluate(candle);
  }
};

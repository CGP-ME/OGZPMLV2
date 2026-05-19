# Emoji Cleanup Manifest

**Ledger range:** Fix 41 through Fix 133
**Ledger path:** `ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md`
**Manifest path:** `ogz-meta/codex-design/EMOJI-CLEANUP-MANIFEST.md`
**Files with authored Fix entries:** 93
**Emoji/symbol sites covered:** 1389
**Explicit str_replace edits authored:** 1314
**Hot-path files:** 65
**Cold-path files:** 28
**P0 anchor for hot-path verification:** `$13,213.042341608163`

## Authored Fix Entries

| Fix | File | Class | Sites | Edits | Line ranges |
|---:|---|---|---:|---:|---|
| 41 | `run-empire-v2.js` | HOT | 18 | 18 | 24, 419, 608, 918, 933, 1084, 1094, 1280, 1300, 1393, 1505, 1527, 1537, 1542, 1895, 2024, 2030, 2042 |
| 42 | `core/AdaptiveTimeframeSelector.js` | HOT | 2 | 2 | 117, 296 |
| 43 | `core/AssetConfigManager.js` | HOT | 4 | 4 | 20, 366, 538, 549 |
| 44 | `core/BacktestRecorder.js` | HOT | 17 | 17 | 216, 293, 426, 431, 434, 440, 448, 455, 461, 481, 484, 492, 498, 504, 509, 514, 519 |
| 45 | `core/BacktestRunner.js` | HOT | 36 | 36 | 34, 47, 53, 61, 62, 63, 107, 113, 128, 132, 168, 169, 170, 171, 172, 173, 174, 175, 184, 185, 186, 187, 188, 189, 190, 269, 270, 275, 277, 283, 286, 289, 293... |
| 46 | `core/CandleProcessor.js` | HOT | 7 | 7 | 192, 409, 426, 430, 442, 483, 504 |
| 47 | `core/DashboardBroadcaster.js` | HOT | 1 | 1 | 250 |
| 48 | `core/EnhancedPatternRecognition.js` | HOT | 8 | 7 | 22, 460, 468, 480, 522, 539, 687 |
| 49 | `core/ErrorHandler.js` | HOT | 5 | 5 | 65, 77, 99, 113, 132 |
| 50 | `core/EventLoopMonitor.js` | HOT | 11 | 11 | 38, 48, 52, 71, 149, 163, 185, 194, 280, 285, 301 |
| 51 | `core/ExchangeReconciler.js` | HOT | 26 | 26 | 33, 41, 49, 52, 56, 62, 70, 80, 90, 95, 103, 119, 120, 124, 133, 146, 165, 192, 242, 250, 261, 272, 287, 352, 370, 378 |
| 52 | `core/FeatureFlagManager.js` | HOT | 4 | 4 | 75, 76, 119, 130 |
| 53 | `core/invariants.js` | HOT | 3 | 3 | 10, 22, 29 |
| 54 | `core/KillSwitch.js` | HOT | 3 | 3 | 101, 126, 128 |
| 55 | `core/MAExtensionFilter.js` | HOT | 9 | 9 | 57, 162, 171, 189, 209, 299, 315, 323, 417 |
| 56 | `core/MarketRegimeDetector.js` | HOT | 9 | 8 | 142, 143, 144, 145, 302, 648, 683, 687 |
| 57 | `core/MaxProfitManager.js` | HOT | 17 | 16 | 231, 1258, 1262, 1265, 1268, 1271, 1287, 1386, 1391, 1392, 1393, 1394, 1395, 1396, 1397, 1405 |
| 58 | `core/MemoryManager.js` | HOT | 3 | 3 | 131, 190, 209 |
| 59 | `core/MessageQueue.js` | HOT | 2 | 2 | 48, 69 |
| 60 | `core/ModuleAutoLoader.js` | HOT | 17 | 17 | 65, 66, 143, 178, 180, 191, 195, 247, 257, 261, 262, 283, 314, 323, 331, 352, 382 |
| 61 | `core/MultiAssetManager.js` | HOT | 12 | 12 | 7, 179, 185, 190, 195, 207, 210, 215, 227, 242, 257, 299 |
| 62 | `core/OgzTpoIntegration.js` | HOT | 9 | 8 | 41, 48, 57, 117, 272, 275, 276, 421 |
| 63 | `core/OptimizedIndicators.js` | HOT | 11 | 11 | 51, 52, 122, 164, 177, 435, 439, 452, 470, 482, 502 |
| 64 | `core/OrderExecutor.js` | HOT | 64 | 60 | 57, 60, 100, 108, 111, 119, 122, 135, 146, 194, 200, 203, 230, 238, 241, 243, 247, 262, 283, 360, 370, 381, 390-394, 431, 450, 488, 551, 557, 567, 575-579, 6... |
| 65 | `core/PatternBasedExitModel.js` | HOT | 3 | 3 | 87, 121, 545 |
| 66 | `core/PatternMemoryBank.js` | HOT | 22 | 22 | 118, 134, 144, 148, 236, 302, 306, 357, 449, 468, 490, 564, 606, 646, 650, 669, 676, 733, 748, 751, 768, 818 |
| 67 | `core/PerformanceAnalyzer.js` | HOT | 14 | 14 | 120, 121, 122, 123, 124, 125, 394, 851, 1135, 1139, 1142, 1145, 1148, 1205 |
| 68 | `core/PerformanceDashboardIntegration.js` | HOT | 13 | 13 | 2, 61, 65, 92, 97, 174, 180, 208, 217, 233, 240, 252, 262 |
| 69 | `core/PerformanceValidator.js` | HOT | 18 | 18 | 2, 13, 19, 25, 88, 92, 154, 159, 197, 220, 244, 254, 287, 295, 349, 396, 406, 414 |
| 70 | `core/PerformanceVisualizer.js` | HOT | 7 | 7 | 150, 173, 331, 416, 509, 753, 847 |
| 71 | `core/persistent_llm_client.js` | HOT | 14 | 14 | 102, 109, 124, 128, 130, 131, 178, 185, 193, 436, 440, 447, 450, 543 |
| 72 | `core/PipelineSnapshot.js` | HOT | 5 | 5 | 49, 50, 71, 74, 331 |
| 73 | `core/SingletonLock.js` | HOT | 26 | 21 | 41, 46, 56, 64, 75, 80, 84, 109, 114, 158, 164, 178, 184, 188, 210, 212, 216, 268, 274, 287, 330 |
| 74 | `core/StateManager.js` | HOT | 27 | 27 | 293, 301, 305, 385, 471, 603, 604, 610, 612, 679, 864, 886, 899, 912, 925, 962, 966, 983, 989, 990, 991, 994, 997, 1002, 1015, 1063, 1401 |
| 75 | `core/StrategyOrchestrator.js` | HOT | 13 | 13 | 775, 943, 950, 953, 1073, 1078, 1079, 1080, 1085, 1091, 1126, 1150, 1158 |
| 76 | `core/Telemetry.js` | HOT | 4 | 4 | 196, 199, 205, 212 |
| 77 | `core/TimeFrameManager.js` | HOT | 20 | 20 | 3, 121, 162, 206, 218, 223, 240, 252, 512, 521, 524, 537, 564, 573, 740, 760, 810, 831, 879, 924 |
| 78 | `core/TradeJournal.js` | HOT | 15 | 14 | 93, 119, 152, 171, 178, 234, 235, 584, 622, 867, 881, 891, 941, 944 |
| 79 | `core/TradeJournalBridge.js` | HOT | 11 | 11 | 63, 127, 179, 214, 238, 260, 288, 322, 334, 366, 419 |
| 80 | `core/tradeLogger.js` | HOT | 9 | 9 | 71, 74, 100, 119, 340, 351, 478, 500, 505 |
| 81 | `core/TradeNarrator.js` | HOT | 19 | 16 | 220, 271, 289, 308, 315, 341, 370, 372, 398, 456, 479, 509, 528, 570, 588, 616 |
| 82 | `core/TradeReplayCapture.js` | HOT | 3 | 3 | 48, 152, 154 |
| 83 | `core/TradingConfig.js` | HOT | 19 | 4 | 1091, 1097, 1103, 1111 |
| 84 | `core/TradingLoop.js` | HOT | 12 | 12 | 148, 153, 163, 164, 466, 477, 481, 483, 496-498, 604, 624, 626 |
| 85 | `core/trai_core.js` | HOT | 43 | 43 | 144, 153, 156, 159, 162, 166, 168, 169, 174, 177, 185, 192, 204, 211, 225, 229, 231, 242, 245, 247, 257, 281, 320, 425, 494, 499, 589, 595, 724, 746, 863, 86... |
| 86 | `core/TRAIDecisionModule.js` | HOT | 18 | 18 | 100, 108, 127, 129, 133, 141, 162, 271, 289, 335, 381, 407, 412, 726, 977, 1006, 1012, 1014 |
| 87 | `core/TRAIPatternIntegration.js` | HOT | 4 | 4 | 41, 57, 61, 215 |
| 88 | `core/TRAIWebContext.js` | HOT | 6 | 6 | 131, 135, 152, 156, 179, 202 |
| 89 | `core/TwoPoleOscillator.js` | HOT | 22 | 16 | 43, 44, 45, 46, 187, 188-190, 197, 226, 227-229, 236, 261, 279, 323, 342, 366, 378 |
| 90 | `core/UnifiedPatternMemory.js` | HOT | 7 | 6 | 22, 27, 32, 37, 431, 438 |
| 91 | `core/WebSocketManager.js` | HOT | 25 | 25 | 34, 40, 44, 47, 54, 60, 65, 91, 119, 130, 144, 172, 207, 218, 229, 233, 238, 270, 277, 284, 288, 297, 312, 316, 321 |
| 92 | `modules/BreakAndRetest.js` | HOT | 1 | 1 | 602 |
| 93 | `modules/LiquiditySweepDetector.js` | HOT | 2 | 2 | 259, 375 |
| 94 | `modules/MADynamicSR.js` | HOT | 1 | 1 | 98 |
| 95 | `modules/SmartMoneySweep.js` | HOT | 10 | 10 | 699-709, 713-715, 724-728, 740-742, 749-751, 782-792, 796-798, 807-811, 822-824, 831-833 |
| 96 | `brokers/BinanceAdapter.js` | HOT | 7 | 7 | 44, 49, 67, 97, 113, 429, 546 |
| 97 | `brokers/CMEAdapter.js` | HOT | 7 | 7 | 39, 42, 49, 116, 132, 137, 170 |
| 98 | `brokers/CoinbaseAdapter.js` | HOT | 4 | 4 | 43, 48, 59, 379 |
| 99 | `brokers/GeminiAdapter.js` | HOT | 19 | 19 | 47, 88, 101, 116, 119, 129, 138, 143, 171, 183, 223, 269, 312, 324, 344, 362, 370, 390, 440 |
| 100 | `brokers/InteractiveBrokersAdapter.js` | HOT | 4 | 4 | 47, 52, 59, 199 |
| 101 | `brokers/KrakenIBrokerAdapter.js` | HOT | 7 | 7 | 35, 42, 54, 282, 313, 356, 370 |
| 102 | `brokers/OandaAdapter.js` | HOT | 3 | 3 | 43, 48, 59 |
| 103 | `brokers/SchwabAdapter.js` | HOT | 18 | 18 | 51, 83, 111, 127, 136, 157, 166, 171, 203, 232, 255, 281, 338, 351, 371, 393, 420, 427 |
| 104 | `brokers/TastyworksAdapter.js` | HOT | 4 | 4 | 44, 47, 62, 66 |
| 105 | `brokers/UpholdAdapter.js` | HOT | 16 | 16 | 43, 67, 80, 94, 100, 107, 155, 234, 257, 276, 283, 289, 300, 356, 431, 434 |
| 106 | `ogz-meta/approve.js` | COLD | 5 | 5 | 31, 41, 49, 78, 93 |
| 107 | `ogz-meta/ast/property-to-function.js` | COLD | 2 | 2 | 81, 85 |
| 108 | `ogz-meta/ast/scan-dto-violations.js` | COLD | 3 | 3 | 14, 64, 68 |
| 109 | `ogz-meta/audit-features.js` | COLD | 14 | 13 | 12, 25, 33, 39, 45, 58, 64, 72, 78, 83, 88, 98, 101 |
| 110 | `ogz-meta/bombardier.js` | COLD | 8 | 8 | 824, 835, 840, 850, 1029, 1034, 1042, 1050 |
| 111 | `ogz-meta/build-claudito-context.js` | COLD | 13 | 11 | 90, 93, 105, 163, 176, 184, 185, 186, 187, 188, 191 |
| 112 | `ogz-meta/claudito-logger.js` | COLD | 21 | 18 | 57, 80, 101, 119, 142, 143, 144, 145, 146, 148, 230, 515, 548, 550, 577, 629, 637, 685 |
| 113 | `ogz-meta/commander.js` | COLD | 17 | 17 | 127, 133, 140, 147, 239, 243, 250, 254, 258, 262, 269, 273, 279, 288, 300, 306, 324 |
| 114 | `ogz-meta/dep-scanner.js` | COLD | 13 | 13 | 290, 296, 305, 313, 321, 326, 333, 343, 349, 356, 377, 383, 386 |
| 115 | `ogz-meta/execute-mission.js` | COLD | 60 | 60 | 69, 77, 83, 93, 106, 109, 114, 118, 121, 125, 138, 146, 151, 156, 157, 158, 160, 163, 169, 190, 200, 208, 221, 228, 238, 241, 252, 256, 265, 280, 291, 298, 3... |
| 116 | `ogz-meta/janitor.js` | COLD | 22 | 22 | 25-27, 34, 57, 61, 73, 101, 122, 133, 138, 146, 153, 156, 165, 167, 181, 200, 206, 220, 246, 252, 259, 270 |
| 117 | `ogz-meta/ogz-close.js` | COLD | 2 | 2 | 89, 302 |
| 118 | `ogz-meta/ogz-run.js` | COLD | 41 | 35 | 250, 251, 252, 257, 258, 259, 265, 267, 272, 287, 288, 290, 295, 297, 348, 351, 403, 405, 427, 429, 442, 451, 483, 486, 504, 563, 566, 609, 636, 638, 662, 67... |
| 119 | `ogz-meta/pipeline-audit.js` | COLD | 12 | 9 | 63, 75, 915, 916, 917, 922, 934, 940, 948 |
| 120 | `ogz-meta/pipeline-phase10-statemachine.js` | COLD | 17 | 12 | 411, 412, 421, 427, 440, 442, 445, 458, 480, 489, 491, 494 |
| 121 | `ogz-meta/pipeline-phase12-fuzz.js` | COLD | 29 | 29 | 51, 98, 102, 118, 124, 146-148, 179-187, 188-190, 215-223, 224-226, 247-255, 256-258, 285-293, 302, 330, 346, 347, 348, 357, 375, 382, 383, 403, 410-412, 433... |
| 122 | `ogz-meta/pipeline-phase7-handoff.js` | COLD | 13 | 12 | 71, 75, 86, 295, 916, 917, 918, 929, 931, 955, 956, 965 |
| 123 | `ogz-meta/pipeline-phase7b-connectionmap_1.js` | COLD | 13 | 13 | 430, 496, 498, 507, 509, 533, 536, 540, 558, 567, 575, 604, 629 |
| 124 | `ogz-meta/pipeline-phase9-invariants.js` | COLD | 14 | 10 | 82, 431, 436, 438, 440, 456, 459, 462, 468, 477 |
| 125 | `ogz-meta/pipeline-supervisor.js` | COLD | 47 | 44 | 19, 81, 249, 256, 257, 258, 263-265, 272-274, 315, 324, 337, 348, 370, 372, 384, 394, 400, 419, 426, 483, 492, 494, 495, 496, 497, 498, 517, 527, 536, 544, 5... |
| 126 | `ogz-meta/pipeline.js` | COLD | 19 | 19 | 192, 194, 195, 197, 211, 233, 237, 254, 255, 268, 271, 284, 298, 302, 318, 324, 339, 377, 383 |
| 127 | `ogz-meta/rag-embeddings.js` | COLD | 20 | 20 | 34, 42, 44, 51, 52, 64, 69, 89, 102, 111, 185, 207, 231, 320, 324, 327, 356, 361, 421, 428 |
| 128 | `ogz-meta/rag-query.js` | COLD | 9 | 9 | 193, 202, 218, 232, 246, 247, 269, 272, 315 |
| 129 | `ogz-meta/reject.js` | COLD | 5 | 5 | 31, 37, 61, 76, 85 |
| 130 | `ogz-meta/session-form.js` | COLD | 1 | 1 | 318 |
| 131 | `ogz-meta/slash-router.js` | COLD | 144 | 138 | 40, 49, 82, 87, 105, 135, 138, 165, 183, 197, 209, 246, 257, 290, 318, 456, 506, 803, 822, 840, 905, 907, 938-941, 944, 973, 995, 1004, 1019, 1044-1048, 1065... |
| 132 | `ogz-meta/support.js` | COLD | 9 | 9 | 143, 186, 190, 195, 203, 211, 224, 230, 249 |
| 133 | `ogz-meta/update-ledger.js` | COLD | 16 | 14 | 82, 83, 151, 171, 176, 198, 217, 221, 249, 256, 260, 263, 293, 299 |

## Replacement Map

| Token | Replacement | Reasoning |
|---|---|---|
| "↔" | `<->` | ASCII equivalent for bidirectional arrow in code comments/output. |
| "↩️" | `ROLLBACK:` | Quant log convention: rollback/revert action. |
| "⏭️" | `SKIP:` | Prompt table: skipped operation. |
| "⏰" | `TIMER:` | Prompt table: time-based log. |
| "⏱️" | `TIMER:` | Quant log convention: elapsed timing. |
| "⏳" | `WAIT:` | Prompt table: blocking wait/warmup. |
| "⏸️" | `PAUSE:` | Quant log convention: pause/halt without hard fail. |
| "▶" | `->` | ASCII equivalent for arrow-like visual marker, especially diagrams/comments. |
| "▶️" | `START:` | Quant log convention: stage start marker. |
| "◀" | `<-` | ASCII equivalent for reverse arrow visual marker. |
| "⚖️" | `BALANCE:` | Quant log convention: sizing/balance/evaluation stance. |
| "⚠️" | `WARN:` | Prompt table: warning/advisory condition. |
| "⚠" | `WARN:` | Same glyph as prompt-table warning without variation selector. |
| "⚡" | `FAST:` | Quant log convention: fast path/performance marker. |
| "⚪" | `OPTIONAL:` | Quant log convention: neutral/optional stage marker. |
| "⛔" | `BLOCKED:` | Quant log convention: blocked/no-entry marker. |
| "✅" | `OK:` | Prompt table: success/completion. |
| "✏️" | `EDIT:` | Quant log convention: edit/write operation. |
| "✓" | `OK` | Plain status symbol converted to ASCII success text. |
| "✗" | `FAIL` | Plain status symbol converted to ASCII failure text. |
| "✨" | `NOTE:` | Quant log convention: decorative emphasis reduced to plain note marker. |
| "❌" | `FAIL:` | Prompt table: failure/error. |
| "❓" | `UNKNOWN:` | Quant log convention: unknown/unclassified state. |
| "⬆️" | `UP:` | Quant log convention: upstream/up direction. |
| "⬇️" | `DOWN:` | Quant log convention: downstream/down direction. |
| "⭐" | `STAR:` | Quant log convention: highlighted/high-probability marker. |
| "🌐" | `WEB:` | Quant log convention: web/global context. |
| "🌪️" | `VOLATILITY:` | Quant log convention: volatility/turbulence marker. |
| "🎉" | `OK:` | Quant log convention: celebratory success becomes plain success. |
| "🎖️" | `RANK:` | Quant log convention: ranking/medal score. |
| "🎙️" | `NARRATOR:` | Quant log convention: narrator/voice subsystem. |
| "🎛️" | `CONFIG:` | Quant log convention: configuration/control surface. |
| "🎤" | `VOICE:` | Quant log convention: speech/voice marker. |
| "🎬" | `START:` | Quant log convention: begin replay/session. |
| "🎭" | `MODE:` | Quant log convention: mode/persona marker. |
| "🎯" | `TARGET:` | Prompt table: target/goal. |
| "🏆" | `WINNER:` | Quant log convention: winning/best result marker. |
| "🏥" | `HEALTH:` | Quant log convention: health/status marker. |
| "🏦" | `BROKER:` | Quant log convention: broker/bank integration marker. |
| "👆" | `NOTE:` | Quant log convention: pointer/note marker. |
| "👻" | `ORPHAN:` | Quant log convention: orphan/dangling item. |
| "💀" | `GARBAGE:` | Quant log convention: dead/garbage fuzz artifact. |
| "💎" | `PREMIUM:` | Quant log convention: premium/high-value marker. |
| "💓" | `HEARTBEAT:` | Quant log convention: heartbeat/liveness marker. |
| "💔" | `LOSS:` | Quant log convention: loss/failure health marker. |
| "💡" | `INFO:` | Quant log convention: informational hint. |
| "💥" | `CRASH:` | Quant log convention: crash/explosion marker. |
| "💬" | `CHAT:` | Quant log convention: chat/message marker. |
| "💭" | `THINK:` | Quant log convention: reasoning/thought marker. |
| "💰" | `PNL:` | Quant log convention: money/PnL marker. |
| "💵" | `PRICE:` | Quant log convention: price/cash marker. |
| "💾" | `SAVE:` | Quant log convention: persistence/write action. |
| "📁" | `FILE:` | Quant log convention: filesystem path or directory. |
| "📂" | `FILE:` | Quant log convention: file/directory context. |
| "📄" | `DOC:` | Prompt table: document reference. |
| "📅" | `DATE:` | Quant log convention: date/calendar marker. |
| "📈" | `STATS:` | Quant log convention: metrics/upward stat. |
| "📉" | `STATS:` | Quant log convention: metrics/downward stat. |
| "📊" | `STATS:` | Prompt table: metrics/reporting. |
| "📋" | `LIST:` | Prompt table: listings/queues. |
| "📌" | `PIN:` | Quant log convention: pinned item/marker. |
| "📍" | `POINT:` | Quant log convention: location/checkpoint marker. |
| "📏" | `MEASURE:` | Quant log convention: measurement/rule marker. |
| "📐" | `MEASURE:` | Quant log convention: sizing/measurement. |
| "📒" | `LOG:` | Prompt table: log write. |
| "📚" | `DOCS:` | Quant log convention: documentation/knowledge base. |
| "📝" | `LOG:` | Quant log convention: note/log entry. |
| "📡" | `FEED:` | Quant log convention: data feed/signal transport. |
| "📥" | `IMPORT:` | Quant log convention: ingest/import action. |
| "📦" | `PACKAGE:` | Quant log convention: bundle/package/artifact. |
| "📰" | `NEWS:` | Quant log convention: news event marker. |
| "📱" | `NOTIFY:` | Quant log convention: notification/mobile alert. |
| "📴" | `DISCONNECT:` | Quant log convention: closed/offline connection state. |
| "📸" | `SNAPSHOT:` | Quant log convention: captured snapshot. |
| "🔀" | `ROUTE:` | Quant log convention: routing/switching marker. |
| "🔄" | `RUN:` | Quant log convention: refresh/retry/restart operation. |
| "🔌" | `CONNECT:` | Quant log convention: connection/plugin state. |
| "🔍" | `SCAN:` | Prompt table: search/inspection/audit. |
| "🔎" | `SCAN:` | Quant log convention: alternate search glyph. |
| "🔐" | `GUARD:` | Quant log convention: security/guard marker. |
| "🔒" | `LOCK:` | Quant log convention: lock/guarded state. |
| "🔓" | `UNLOCK:` | Quant log convention: unlocked state. |
| "🔗" | `HOOK:` | Prompt table: hook invocation/linkage. |
| "🔥" | `START:` | Quant log convention: hot/active startup marker. |
| "🔧" | `RUN:` | Prompt table: executing/running operation. |
| "🔨" | `BUILD:` | Quant log convention: build/fix action. |
| "🔬" | `TEST:` | Quant log convention: detailed inspection/test. |
| "🔴" | `FAIL:` | Quant log convention: red status means failing/required-bad state. |
| "🔺" | `UP:` | Quant log convention: upward direction. |
| "🔻" | `DOWN:` | Quant log convention: downward direction. |
| "🕐" | `TIMER:` | Quant log convention: clock/time marker. |
| "🕯️" | `CANDLE:` | Quant log convention: candle/market bar marker. |
| "🕵️" | `AUDIT:` | Quant log convention: investigation/audit marker. |
| "🗑️" | `CLEANUP:` | Quant log convention: deletion/garbage cleanup. |
| "🤖" | `BOT:` | Quant log convention: bot/automation identity. |
| "🤝" | `SYNC:` | Quant log convention: handshake/sync marker. |
| "🧠" | `BRAIN:` | Quant log convention: model/decision-brain context. |
| "🧪" | `TEST:` | Quant log convention: test/fuzz/check operation. |
| "🧭" | `SIGNAL:` | Quant log convention: direction/signal marker. |
| "🧹" | `CLEANUP:` | Quant log convention: cleanup/prune action. |
| "🚀" | `START:` | Prompt table: boot/initialization. |
| "🚨" | `ALERT:` | Quant log convention: urgent alert distinct from hard BLOCKED halt. |
| "🚪" | `EXIT:` | Quant log convention: exit/door marker. |
| "🚫" | `BLOCKED:` | Quant log convention: rejected/blocked action. |
| "🛑" | `BLOCKED:` | Prompt table: hard stop, halt, kill switch, or blocking condition. |
| "🛡️" | `GUARD:` | Prompt table: safety/protection check. |
| "🟠" | `HIGH:` | Quant log convention: orange severity/high priority. |
| "🟡" | `PENDING:` | Prompt table: pending/waiting state. |
| "🟢" | `OK:` | Quant log convention: green status means healthy/success. |
| "â†’" | `->` | Mojibake arrow artifact; converted to ASCII arrow. |
| "â°" | `TIMER:` | Mojibake clock artifact; converted to timer text. |
| "â³" | `WAIT:` | Mojibake hourglass artifact; converted to wait/warmup text. |
| "âŒ" | `FAIL:` | Mojibake cross artifact; converted to failure text. |
| "âœ…" | `OK:` | Mojibake check artifact; converted to success text. |
| "âš ï¸" | `WARN:` | Mojibake warning artifact; converted to warning text. |
| "âš¡" | `FAST:` | Mojibake lightning artifact; converted to fast-path/performance text. |
| "ðŸ’°" | `PNL:` | Mojibake emoji artifact; original money marker reduced to PnL text. |
| "ðŸ”„" | `RUN:` | Mojibake emoji artifact; original repeat marker reduced to restart/run text. |
| "ðŸ“‰" | `STATS:` | Mojibake emoji artifact; original chart-down marker reduced to metrics text. |
| "ðŸ”®" | `SCAN:` | Mojibake emoji artifact; original crystal-ball marker reduced to detector scan/status text. |
| "ðŸ“Š" | `STATS:` | Mojibake emoji artifact; original chart marker reduced to metrics text. |
| "ðŸ§ " | `BRAIN:` | Mojibake emoji artifact; original brain marker reduced to decision-brain text. |
| "ðŸŒ" | `GLOBAL:` | Mojibake emoji artifact; original globe marker reduced to macro/global text. |
| "ðŸš€" | `START:` | Mojibake emoji artifact; original rocket marker reduced to startup/fast-path text. |
| "ℹ️" | `INFO:` | Quant log convention: informational status. |
| "🆔" | `ID:` | Quant log convention: identifier marker. |

## Scope Notes

- In scope: `.js` files under `core/`, `modules/`, `brokers/`, `foundation/`, eligible `ogz-meta/` pipeline/tooling files, and `run-empire-v2.js`.
- Out of scope and intentionally skipped: `public/`, `node_modules/`, `.git/`, `data/`, `backtest-results/`, untracked markdown specs/session docs, fixtures/sample data/screenshots, and archived/reference JavaScript under `ogz-meta/ledger`, `ogz-meta/backups`, `ogz-meta/prodlock-portable`, and `ogz-meta/replacements`.
- Slash-router committer function body lines 1917-2002 were excluded because Fix 37a owns that replacement block. Token sites observed there and intentionally not counted in this manifest: 5.
- `foundation/TradingConfig.js` from the prompt does not exist in this checkout; live `core/TradingConfig.js` was classified HOT because it is the actual config path with emoji sites.
- Emoji-like ASCII/Unicode status symbols such as `✓`, `✗`, arrows, `ℹ️`, and mojibake emoji artifacts were included when they appeared in in-scope JS because they behave as operator-facing log/status markers or source-visible emoji residue.

## WHAT I DID DO
- Read the task prompt, confirmed the live ledger currently ended before Fix 41, and authored Fix 41 through Fix 133.
- Scanned in-scope JavaScript with the prompt grep family plus an explicit token scan for table emojis, emoji-like status symbols, and mojibake emoji artifacts.
- Appended one Fix entry per source file with emoji/symbol sites: 93 files, 1389 sites, 1314 explicit str_replace edits.
- Wrote this manifest with every Fix number, file, hot/cold classification, site count, edit count, scope assumption, and replacement reasoning.

## WHAT I DID NOT DO
- Did not edit production source files directly; only the ledger and this manifest were written.
- Did not use or prescribe sed/mass-replace/global regex replacement across source files; every future source change is expressed as an explicit str_replace target/replacement pair.
- Did not touch slash-router committer function body lines 1917-2002; Fix 37a owns that block.
- Did not include archived/reference JS, frontend public assets, node_modules, git internals, data/backtest artifacts, markdown specs, screenshots, fixtures, or sample data.

## WHAT I ASSUMED
- Hot path means every file on the prompt list plus all `core/`, `modules/`, `brokers/`, and `run-empire-v2.js` files found with emoji sites; these require P0 anchor rerun after their individual Fix lands.
- Cold path means eligible `ogz-meta/` pipeline/tooling files outside the excluded archive/reference directories; these require grep and `node --check` but no P0 rerun.
- Mojibake tokens like `âŒ` and `ðŸ“Š` are stale emoji artifacts and should be stripped alongside valid emoji glyphs.
- Comment/diagram arrow symbols in in-scope JS were converted only to plain ASCII equivalents where encountered by the token scan; this is source hygiene and does not alter runtime behavior.

## OPEN QUESTIONS FOR OPERATOR
- None.

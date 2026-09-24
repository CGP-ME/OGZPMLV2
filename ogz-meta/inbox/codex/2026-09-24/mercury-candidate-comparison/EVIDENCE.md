# Evidence

prompt-delivery.json records the actual primary/recheck prompt assembly observed with a synthetic transport. Root Mercury config SHA-256: e95f32e3db9344e92f061ee5eff73d0fa89872f83e775d026d83737582fd2db5. Loaded system text SHA-256: 8d92faf62ca358bc09712f857883c0178cd798b88c2bc25b3d690c0494a4ce02. Both entry points use config.AGENTIC_SYSTEM_PROMPT through react-loop.js:831; initial dispatch also passes it at ask.js:1112, while recheck uses the same loop at ask.js:333.

JSON parsing and an object comparison excluding agentic.systemPrompt confirm every other configuration value is unchanged. No model/provider result, complete coverage, config-consumer behavior, bot operation or Stop 1 acceptance is established by this observation.

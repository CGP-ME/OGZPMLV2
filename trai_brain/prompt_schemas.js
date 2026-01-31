const missionSchema = `{
  "schema": "mission",
  "summary": "1-2 sentence summary",
  "objectives": ["ordered, measurable objectives"],
  "constraints": ["key constraints or blockers"],
  "timeline": {"start": "ISO", "milestones": ["YYYY-MM-DD: milestone"]},
  "risks": [{"item": "risk description", "mitigation": "step"}],
  "metrics": ["success metric"],
  "decision": "next decision or owner"
}`;

const proposalSchema = `{
  "schema": "proposal",
  "title": "descriptive title",
  "problem": "what problem we are solving",
  "approach": ["ordered approach steps"],
  "scope": {"included": ["in scope"], "excluded": ["out of scope"]},
  "dependencies": ["hard dependencies"],
  "deliverables": ["artifacts to produce"],
  "success_criteria": ["how we will measure success"],
  "open_questions": ["questions to resolve"]
}`;

// CHANGE 2026-01-31: Added chat schema for conversational responses (no JSON required)
const chatSchema = null;  // Signals to use conversational mode, not JSON

function chooseSchema(query = '') {
    const normalized = query.toLowerCase();

    // CHANGE 2026-01-31: Detect conversational queries (most chat messages)
    // Only use structured JSON for explicit planning/strategy requests
    const planningKeywords = ['plan', 'proposal', 'strategy', 'roadmap', 'timeline', 'milestone'];
    const isPlanningQuery = planningKeywords.some(kw => normalized.includes(kw));

    // Default to CHAT mode for normal conversational queries
    if (!isPlanningQuery) {
        return { type: 'chat', shape: chatSchema };
    }

    if (normalized.includes('proposal')) {
        return { type: 'proposal', shape: proposalSchema };
    }

    return { type: 'mission', shape: missionSchema };
}

module.exports = {
    chooseSchema,
    missionSchema,
    proposalSchema
};

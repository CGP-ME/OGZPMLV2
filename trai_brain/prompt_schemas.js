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

function chooseSchema(query = '') {
    const normalized = query.toLowerCase();
    if (normalized.includes('plan') || normalized.includes('proposal') || normalized.includes('strategy')) {
        return { type: 'proposal', shape: proposalSchema };
    }

    return { type: 'mission', shape: missionSchema };
}

module.exports = {
    chooseSchema,
    missionSchema,
    proposalSchema
};

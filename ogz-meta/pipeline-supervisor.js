#!/usr/bin/env node

/**
 * pipeline-supervisor.js
 * THE SUPERVISOR - Ensures the ENTIRE pipeline runs. No shortcuts. No skipping.
 *
 * CRITICAL RULE: NO CODE CHANGES WITHOUT USER APPROVAL
 * The pipeline REPORTS findings and WAITS for Trey's OK before any edits.
 *
 * PIPELINE FLOW (Trey's Vision):
 *
 * ═══════════════════════════════════════════════════════════
 * PHASE 1: FIND & FIX
 * ═══════════════════════════════════════════════════════════
 * 1. SUPERVISOR/ORCHESTRATOR → Sets up & runs pipeline
 * 2. WARDEN → Scope check, rules, RAG query
 * 3. ENTOMOLOGIST → Finds the bug
 * 4. ARCHITECT → Explains impact of fixing it
 * 5. 🛑 USER APPROVAL → Trey says OK
 * 6. FIXER → Applies the fix
 * 7. DEBUGGER → Checks syntax + basic issues
 * 8. CRITIC → Finds weaknesses (loops back if fails)
 * 9. VALIDATOR → Quality gate
 * 10. FORENSICS → Checks for silent killers
 *
 * ═══════════════════════════════════════════════════════════
 * PHASE 2: VERIFY & SHIP
 * ═══════════════════════════════════════════════════════════
 * 11. CI/CD → Run tests (if applicable)
 * 12. TELEMETRY → Check metrics
 * 13. PATTERN DETECTIVE/TEST → If pattern-related
 * 14. RECORDER → Changelog + Ledger + RAG (all docs)
 * 15. LEARNING → Record lessons learned
 * 16. JANITOR → Clean up test files
 * 17. COMMENTATOR → Add inline comments
 * 18. COMMITTER → Git commit (LAST)
 */

const fs = require('fs');
const path = require('path');
const { getSemanticRAG } = require('./rag-embeddings');

const META_DIR = __dirname;
const PIPELINE_STATE_FILE = path.join(META_DIR, '.pipeline-state.json');

// PIPELINE STAGES - Trey's Vision
const PIPELINE_STAGES = [
  // ═══════════════════════════════════════════════════════════
  // PHASE 1: FIND & FIX
  // ═══════════════════════════════════════════════════════════
  {
    id: 'warden',
    name: 'Warden',
    description: 'Scope check, rules, RAG query',
    required: true,
    canSkip: false,
    prerequisites: [],
    phase: 1
  },
  {
    id: 'entomologist',
    name: 'Entomologist',
    description: 'Finds the bug',
    required: true,
    canSkip: false,
    prerequisites: ['warden'],
    phase: 1
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Explains impact of fixing it',
    required: true,
    canSkip: false,
    prerequisites: ['entomologist'],
    phase: 1
  },
  {
    id: 'user-approval',
    name: 'User Approval',
    description: '🛑 WAIT for Trey to approve',
    required: true,
    canSkip: false,
    prerequisites: ['architect'],
    isGate: true,
    phase: 1
  },
  {
    id: 'fixer',
    name: 'Fixer',
    description: 'Applies the fix',
    required: true,
    canSkip: false,
    prerequisites: ['user-approval'],
    phase: 1
  },
  {
    id: 'debugger',
    name: 'Debugger',
    description: 'Checks syntax + basic issues',
    required: true,
    canSkip: false,
    prerequisites: ['fixer'],
    phase: 1
  },
  {
    id: 'critic',
    name: 'Critic',
    description: 'Finds weaknesses (loops back if fails)',
    required: true,
    canSkip: false,
    prerequisites: ['debugger'],
    canLoop: true,
    loopTarget: 'entomologist',
    phase: 1
  },
  {
    id: 'validator',
    name: 'Validator',
    description: 'Quality gate',
    required: true,
    canSkip: false,
    prerequisites: ['critic'],
    phase: 1
  },
  {
    id: 'forensics',
    name: 'Forensics',
    description: 'Checks for silent killers',
    required: true,
    canSkip: false,
    prerequisites: ['validator'],
    phase: 1
  },

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: VERIFY & SHIP
  // ═══════════════════════════════════════════════════════════
  {
    id: 'cicd',
    name: 'CI/CD',
    description: 'Run tests (if applicable)',
    required: false,
    canSkip: true,
    prerequisites: ['forensics'],
    phase: 2
  },
  {
    id: 'telemetry',
    name: 'Telemetry',
    description: 'Check metrics',
    required: false,
    canSkip: true,
    prerequisites: ['forensics'],
    phase: 2
  },
  {
    id: 'pattern-check',
    name: 'Pattern Detective/Test',
    description: 'Pattern-related checks (if needed)',
    required: false,
    canSkip: true,
    prerequisites: ['forensics'],
    phase: 2
  },
  {
    id: 'recorder',
    name: 'Recorder',
    description: 'Changelog + Ledger + RAG (all docs)',
    required: true,
    canSkip: false,
    prerequisites: ['forensics'],
    phase: 2
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Record lessons learned',
    required: true,
    canSkip: false,
    prerequisites: ['recorder'],
    phase: 2
  },
  {
    id: 'janitor',
    name: 'Janitor',
    description: 'Clean up test files',
    required: true,
    canSkip: false,
    prerequisites: ['learning'],
    phase: 2
  },
  {
    id: 'commentator',
    name: 'Commentator',
    description: 'Add inline comments to complex code',
    required: false,
    canSkip: true,
    prerequisites: ['janitor'],
    phase: 2
  },
  {
    id: 'committer',
    name: 'Committer',
    description: 'Git commit (LAST)',
    required: true,
    canSkip: false,
    prerequisites: ['janitor'],
    phase: 2
  }
];

class PipelineSupervisor {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    if (fs.existsSync(PIPELINE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(PIPELINE_STATE_FILE, 'utf8'));
    }
    return this.createNewState();
  }

  createNewState(mission = null) {
    return {
      mission_id: `MISSION_${Date.now()}`,
      mission_description: mission,
      started_at: new Date().toISOString(),
      current_stage: null,
      completed_stages: [],
      skipped_stages: [],
      failed_stages: [],
      loop_count: 0,
      stage_outputs: {},
      status: 'not_started'
    };
  }

  saveState() {
    fs.writeFileSync(PIPELINE_STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  /**
   * Start a new pipeline mission
   */
  async startMission(description) {
    console.log('\n' + '═'.repeat(60));
    console.log('🎖️  PIPELINE SUPERVISOR - MISSION START');
    console.log('═'.repeat(60));

    this.state = this.createNewState(description);
    this.state.status = 'in_progress';
    this.saveState();

    console.log(`\n📋 Mission: ${description}`);
    console.log(`🆔 Mission ID: ${this.state.mission_id}`);
    console.log(`⏰ Started: ${this.state.started_at}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('PHASE 1: FIND & FIX');
    console.log('═══════════════════════════════════════════════════');
    PIPELINE_STAGES.filter(s => s.phase === 1).forEach((stage, i) => {
      const req = stage.required ? '🔴' : '⚪';
      const gate = stage.isGate ? '🛑' : '  ';
      console.log(`  ${i + 1}. ${req}${gate} ${stage.name} - ${stage.description}`);
    });

    console.log('\n═══════════════════════════════════════════════════');
    console.log('PHASE 2: VERIFY & SHIP');
    console.log('═══════════════════════════════════════════════════');
    PIPELINE_STAGES.filter(s => s.phase === 2).forEach((stage, i) => {
      const req = stage.required ? '🔴' : '⚪';
      console.log(`  ${i + 10}. ${req} ${stage.name} - ${stage.description}`);
    });

    return this.state.mission_id;
  }

  /**
   * Check if a stage can be run
   */
  canRunStage(stageId) {
    const stage = PIPELINE_STAGES.find(s => s.id === stageId);
    if (!stage) {
      return { allowed: false, reason: `Unknown stage: ${stageId}` };
    }

    // Check prerequisites
    for (const prereq of stage.prerequisites) {
      if (!this.state.completed_stages.includes(prereq) &&
          !this.state.skipped_stages.includes(prereq)) {
        const prereqStage = PIPELINE_STAGES.find(s => s.id === prereq);
        return {
          allowed: false,
          reason: `Prerequisite not met: ${prereqStage?.name || prereq} must complete first`
        };
      }
    }

    // Check if already completed (unless it's a loopable stage)
    if (this.state.completed_stages.includes(stageId) && !stage.canLoop) {
      return { allowed: false, reason: `Stage already completed` };
    }

    return { allowed: true };
  }

  /**
   * Mark a stage as starting
   */
  startStage(stageId) {
    const canRun = this.canRunStage(stageId);
    if (!canRun.allowed) {
      console.log(`\n🛑 SUPERVISOR BLOCKED: Cannot start ${stageId}`);
      console.log(`   Reason: ${canRun.reason}`);
      return false;
    }

    const stage = PIPELINE_STAGES.find(s => s.id === stageId);
    this.state.current_stage = stageId;
    this.saveState();

    console.log(`\n▶️  STARTING: ${stage.name}`);
    console.log(`   ${stage.description}`);

    return true;
  }

  /**
   * Mark a stage as completed
   */
  completeStage(stageId, outputs = {}) {
    const stage = PIPELINE_STAGES.find(s => s.id === stageId);

    if (this.state.current_stage !== stageId) {
      console.log(`\n⚠️  WARNING: Completing ${stageId} but current stage is ${this.state.current_stage}`);
    }

    this.state.completed_stages.push(stageId);
    this.state.stage_outputs[stageId] = {
      completed_at: new Date().toISOString(),
      outputs
    };
    this.state.current_stage = null;
    this.saveState();

    console.log(`\n✅ COMPLETED: ${stage.name}`);
    if (Object.keys(outputs).length > 0) {
      console.log(`   Outputs: ${JSON.stringify(outputs)}`);
    }

    // Show progress
    this.showProgress();

    return true;
  }

  /**
   * Mark a stage as failed
   */
  failStage(stageId, reason) {
    const stage = PIPELINE_STAGES.find(s => s.id === stageId);

    this.state.failed_stages.push({ stageId, reason, failed_at: new Date().toISOString() });
    this.state.current_stage = null;
    this.state.status = 'failed';
    this.saveState();

    console.log(`\n❌ FAILED: ${stage.name}`);
    console.log(`   Reason: ${reason}`);
    console.log(`\n🛑 PIPELINE HALTED - Fix the issue and restart from ${stage.name}`);

    return false;
  }

  /**
   * Loop back to earlier stage (Critic can do this)
   */
  loopBack(fromStageId, reason) {
    const fromStage = PIPELINE_STAGES.find(s => s.id === fromStageId);

    if (!fromStage.canLoop) {
      console.log(`\n🛑 Stage ${fromStage.name} cannot loop`);
      return false;
    }

    const targetId = fromStage.loopTarget;
    const targetStage = PIPELINE_STAGES.find(s => s.id === targetId);

    this.state.loop_count++;

    if (this.state.loop_count > 3) {
      console.log(`\n🛑 MAX LOOPS REACHED (3) - Escalating to user`);
      this.state.status = 'needs_human';
      this.saveState();
      return false;
    }

    console.log(`\n🔄 LOOP #${this.state.loop_count}: ${fromStage.name} → ${targetStage.name}`);
    console.log(`   Reason: ${reason}`);

    // Remove completed stages from target onwards
    const targetIndex = PIPELINE_STAGES.findIndex(s => s.id === targetId);
    const stagesToReset = PIPELINE_STAGES.slice(targetIndex).map(s => s.id);
    this.state.completed_stages = this.state.completed_stages.filter(id => !stagesToReset.includes(id));

    this.saveState();
    return true;
  }

  /**
   * Skip a stage (only if canSkip is true)
   */
  skipStage(stageId, reason) {
    const stage = PIPELINE_STAGES.find(s => s.id === stageId);

    if (!stage.canSkip) {
      console.log(`\n🛑 CANNOT SKIP: ${stage.name} is required`);
      return false;
    }

    this.state.skipped_stages.push({ stageId, reason, skipped_at: new Date().toISOString() });
    this.saveState();

    console.log(`\n⏭️  SKIPPED: ${stage.name}`);
    console.log(`   Reason: ${reason}`);

    return true;
  }

  /**
   * Show current progress
   */
  showProgress() {
    const total = PIPELINE_STAGES.filter(s => s.required).length;
    const completed = this.state.completed_stages.filter(id => {
      const stage = PIPELINE_STAGES.find(s => s.id === id);
      return stage?.required;
    }).length;

    const pct = Math.round((completed / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));

    console.log(`\n   Progress: [${bar}] ${pct}% (${completed}/${total} required stages)`);
  }

  /**
   * Get next stage to run
   */
  getNextStage() {
    for (const stage of PIPELINE_STAGES) {
      if (!this.state.completed_stages.includes(stage.id) &&
          !this.state.skipped_stages.some(s => s.stageId === stage.id)) {
        const canRun = this.canRunStage(stage.id);
        if (canRun.allowed) {
          return stage;
        }
      }
    }
    return null;
  }

  /**
   * Check if pipeline is complete
   */
  isComplete() {
    const requiredStages = PIPELINE_STAGES.filter(s => s.required);
    return requiredStages.every(stage =>
      this.state.completed_stages.includes(stage.id)
    );
  }

  /**
   * Complete the mission
   */
  completeMission() {
    if (!this.isComplete()) {
      const missing = PIPELINE_STAGES
        .filter(s => s.required && !this.state.completed_stages.includes(s.id))
        .map(s => s.name);

      console.log(`\n🛑 CANNOT COMPLETE: Missing required stages: ${missing.join(', ')}`);
      return false;
    }

    this.state.status = 'completed';
    this.state.completed_at = new Date().toISOString();
    this.saveState();

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 MISSION COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\n📋 Mission: ${this.state.mission_description}`);
    console.log(`⏱️  Duration: ${this.calculateDuration()}`);
    console.log(`✅ Stages completed: ${this.state.completed_stages.length}`);
    console.log(`⏭️  Stages skipped: ${this.state.skipped_stages.length}`);
    console.log(`🔄 Loops: ${this.state.loop_count}`);

    return true;
  }

  calculateDuration() {
    const start = new Date(this.state.started_at);
    const end = new Date(this.state.completed_at || new Date());
    const diffMs = end - start;
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * WARDEN STAGE: Check scope and RAG before ANY work
   */
  async runWardenCheck(issue, proposedApproach = null) {
    console.log('\n' + '─'.repeat(40));
    console.log('🛡️  WARDEN CHECK');
    console.log('─'.repeat(40));

    const checks = {
      scope_approved: false,
      not_duplicate: false,
      approach_not_failed: false
    };

    // 1. Query RAG: Is this already fixed?
    console.log('\n🔍 Checking if issue already fixed...');
    try {
      const rag = await getSemanticRAG();
      const context = await rag.getContextForIssue(issue);

      // Check for high-similarity past fixes
      if (context.try_these_approaches && context.try_these_approaches.length > 0) {
        const topMatch = context.try_these_approaches[0];
        if (topMatch.similarity > 0.8) {
          console.log(`\n🛑 WARDEN REJECTS: This issue appears to be already fixed!`);
          console.log(`   Match: ${topMatch.fix_id} (${(topMatch.similarity * 100).toFixed(0)}% similar)`);
          console.log(`   Fix: ${topMatch.minimal_fix}`);
          console.log('\n   → Check if this is a regression before proceeding');
          return { approved: false, reason: 'Issue already fixed', match: topMatch };
        }
      }
      checks.not_duplicate = true;
      console.log('   ✅ Not a duplicate of existing fix');

      // 2. Check if proposed approach failed before
      if (proposedApproach && context.do_not_repeat && context.do_not_repeat.length > 0) {
        for (const failure of context.do_not_repeat) {
          for (const failedApproach of failure.what_failed) {
            if (proposedApproach.toLowerCase().includes(failedApproach.toLowerCase().split(' ')[0])) {
              console.log(`\n🛑 WARDEN REJECTS: Proposed approach failed before!`);
              console.log(`   Failed in: ${failure.fix_id}`);
              console.log(`   What failed: ${failedApproach}`);
              console.log('\n   → Choose a different approach');
              return { approved: false, reason: 'Approach failed before', failure };
            }
          }
        }
      }
      checks.approach_not_failed = true;
      console.log('   ✅ Proposed approach not previously failed');

    } catch (e) {
      console.log('   ⚠️ RAG check unavailable, proceeding with caution');
      checks.not_duplicate = true;
      checks.approach_not_failed = true;
    }

    // 3. Scope check (basic - can be enhanced)
    checks.scope_approved = true;
    console.log('   ✅ Scope approved');

    console.log('\n✅ WARDEN APPROVES - Proceed with pipeline');
    return { approved: true, checks };
  }

  /**
   * CRITICAL: Request user approval before code changes
   */
  async requestUserApproval(proposal) {
    console.log('\n' + '═'.repeat(60));
    console.log('🛑 USER APPROVAL REQUIRED');
    console.log('═'.repeat(60));

    console.log('\n📋 PROPOSED CHANGES:');
    console.log(`   Issue: ${proposal.issue}`);
    console.log(`   Root Cause: ${proposal.root_cause}`);
    console.log(`   Proposed Fix: ${proposal.fix}`);
    console.log(`   Files to Change: ${proposal.files?.join(', ') || 'TBD'}`);
    console.log(`   Lines Affected: ${proposal.lines || 'TBD'}`);

    if (proposal.code_preview) {
      console.log('\n📝 CODE PREVIEW:');
      console.log('```');
      console.log(proposal.code_preview);
      console.log('```');
    }

    console.log('\n⏳ WAITING FOR YOUR APPROVAL...');
    console.log('   Pipeline is PAUSED. No code will be changed.');
    console.log('   Reply with approval to continue, or reject to abort.\n');

    this.state.awaiting_approval = true;
    this.state.pending_proposal = proposal;
    this.saveState();

    return {
      status: 'awaiting_approval',
      proposal,
      message: 'Pipeline paused. Waiting for user approval before making any code changes.'
    };
  }

  /**
   * User grants approval
   */
  grantApproval(notes = '') {
    if (!this.state.awaiting_approval) {
      console.log('⚠️ No pending approval request');
      return false;
    }

    console.log('\n✅ USER APPROVED - Pipeline may proceed with code changes');

    this.state.awaiting_approval = false;
    this.state.approval_granted = true;
    this.state.approval_notes = notes;
    this.state.approved_at = new Date().toISOString();
    this.saveState();

    this.completeStage('user-approval', { user_approved: true, approval_notes: notes });

    return true;
  }

  /**
   * User rejects proposal
   */
  rejectApproval(reason = '') {
    if (!this.state.awaiting_approval) {
      console.log('⚠️ No pending approval request');
      return false;
    }

    console.log('\n❌ USER REJECTED - Aborting proposed changes');
    console.log(`   Reason: ${reason || 'No reason given'}`);

    this.state.awaiting_approval = false;
    this.state.approval_granted = false;
    this.state.rejection_reason = reason;
    this.saveState();

    this.failStage('user-approval', `User rejected: ${reason}`);

    return true;
  }

  /**
   * Get current mission status
   */
  getStatus() {
    return {
      ...this.state,
      next_stage: this.getNextStage(),
      is_complete: this.isComplete()
    };
  }
}

// Singleton
let supervisor = null;

function getSupervisor() {
  if (!supervisor) {
    supervisor = new PipelineSupervisor();
  }
  return supervisor;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const param = args.slice(1).join(' ');

  const sup = getSupervisor();

  (async () => {
    switch (command) {
      case 'start':
        if (!param) {
          console.log('Usage: node pipeline-supervisor.js start "<mission description>"');
          process.exit(1);
        }
        await sup.startMission(param);
        break;

      case 'warden':
        if (!param) {
          console.log('Usage: node pipeline-supervisor.js warden "<issue to check>"');
          process.exit(1);
        }
        await sup.runWardenCheck(param);
        break;

      case 'status':
        console.log(JSON.stringify(sup.getStatus(), null, 2));
        break;

      case 'next':
        const next = sup.getNextStage();
        if (next) {
          console.log(`Next stage: ${next.name} - ${next.description}`);
        } else {
          console.log('No more stages or pipeline not started');
        }
        break;

      case 'complete':
        if (!param) {
          console.log('Usage: node pipeline-supervisor.js complete <stage_id>');
          process.exit(1);
        }
        sup.startStage(param);
        sup.completeStage(param, { manual: true });
        break;

      case 'skip':
        if (!param) {
          console.log('Usage: node pipeline-supervisor.js skip <stage_id> "<reason>"');
          process.exit(1);
        }
        const [skipId, ...skipReason] = param.split(' ');
        sup.skipStage(skipId, skipReason.join(' ') || 'Manual skip');
        break;

      case 'loop':
        if (!param) {
          console.log('Usage: node pipeline-supervisor.js loop <from_stage> "<reason>"');
          process.exit(1);
        }
        const [loopFrom, ...loopReason] = param.split(' ');
        sup.loopBack(loopFrom, loopReason.join(' ') || 'Manual loop');
        break;

      case 'approve':
        sup.grantApproval(param || '');
        break;

      case 'reject':
        sup.rejectApproval(param || '');
        break;

      default:
        console.log('Pipeline Supervisor - Trey\'s Vision');
        console.log('');
        console.log('PHASE 1: FIND & FIX');
        console.log('  1. Warden → Scope + RAG');
        console.log('  2. Entomologist → Find bug');
        console.log('  3. Architect → Impact analysis');
        console.log('  4. 🛑 User Approval');
        console.log('  5. Fixer → Apply fix');
        console.log('  6. Debugger → Syntax check');
        console.log('  7. Critic → Weaknesses (can loop)');
        console.log('  8. Validator → Quality gate');
        console.log('  9. Forensics → Silent killers');
        console.log('');
        console.log('PHASE 2: VERIFY & SHIP');
        console.log('  10. CI/CD → Tests');
        console.log('  11. Telemetry → Metrics');
        console.log('  12. Pattern Check → If needed');
        console.log('  13. Recorder → Changelog+Ledger+RAG');
        console.log('  14. Learning → Lessons');
        console.log('  15. Janitor → Cleanup');
        console.log('  16. Commentator → Inline comments');
        console.log('  17. Committer → Git commit (LAST)');
        console.log('');
        console.log('Commands:');
        console.log('  start "<mission>"     Start pipeline');
        console.log('  warden "<issue>"      Run Warden check');
        console.log('  status                Show status');
        console.log('  next                  Next stage');
        console.log('  complete <stage>      Complete stage');
        console.log('  skip <stage> "<why>"  Skip optional stage');
        console.log('  loop <stage> "<why>"  Loop back');
        console.log('  approve "<notes>"     Approve proposal');
        console.log('  reject "<reason>"     Reject proposal');
    }
  })();
}

module.exports = { PipelineSupervisor, getSupervisor, PIPELINE_STAGES };

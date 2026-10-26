import type { TogetherSession, TogetherState } from "@fiyu/contracts";

export const pendingTogetherSession: TogetherSession = {
  session_id: "session-1", status: "pending", role: "initiator", expires_at: "2099-01-01T00:00:00Z", cycle_expires_at: "2099-01-02T00:00:00Z", partner: null, restaurants: [], consumed_trial: false, invite_url: null, revealed_at: null, active_for_current_user: false, reveal_pending: false, pick_count: 0,
};

export const eligibleTogetherState: TogetherState = {
  rated_visit_count: 5, ratings_required: 5, premium: false, trial_consumed: false, can_initiate: true, block_reason: null, session: null, current_sessions: [], generated_session_count: 0, cycle_limit: 3,
};

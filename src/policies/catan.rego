# Catangent - Main Policy Bundle
# Entry point for all Catan game rule validation
#
# Usage:
#   opa eval -d src/policies/ -i action.json "data.catan.decision"
#
# Returns:
#   {
#     "allowed": true/false,
#     "hard_violations": [...],  // Action blocked if non-empty
#     "soft_violations": [...]   // Logged for cheat detection
#   }

package catan

import data.catan.hard.spatial
import data.catan.hard.resources
import data.catan.hard.turn
import data.catan.soft.actions
import data.catan.soft.resources as soft_resources
import data.catan.soft.dev_cards

# =============================================================================
# MAIN DECISION
# =============================================================================

# Default: action is allowed if no hard violations
default decision := {
    "allowed": true,
    "hard_violations": [],
    "soft_violations": []
}

# Main decision aggregates all rules
decision := result {
    # Collect all hard violations (auto-reject)
    hard := array.concat(
        array.concat(
            to_array(spatial.deny),
            to_array(resources.deny)
        ),
        to_array(turn.deny)
    )

    # Collect all soft violations (log for detection)
    soft := array.concat(
        array.concat(
            to_array(actions.soft_violation),
            to_array(soft_resources.soft_violation)
        ),
        to_array(dev_cards.soft_violation)
    )

    result := {
        "allowed": count(hard) == 0,
        "hard_violations": hard,
        "soft_violations": soft
    }
}

# =============================================================================
# CONVENIENCE QUERIES
# =============================================================================

# Check if action is allowed (simple boolean)
allowed {
    decision.allowed
}

# Get just hard violations
hard_violations := decision.hard_violations

# Get just soft violations
soft_violations := decision.soft_violations

# Check if there are any violations at all
has_violations {
    count(decision.hard_violations) > 0
}

has_violations {
    count(decision.soft_violations) > 0
}

# =============================================================================
# CHEAT DETECTION SUMMARY
# =============================================================================

# Group soft violations by suspected cheat type
violations_by_cheat_type[cheat_type] := violations {
    violations := [v |
        v := decision.soft_violations[_]
        v.cheat_type == cheat_type
    ]
    count(violations) > 0
}

# Get suspicion score for a player (count of soft violations)
player_suspicion[player_id] := score {
    violations := [v |
        v := decision.soft_violations[_]
        v.player == player_id
    ]
    score := count(violations)
}

# Get the most suspicious player
most_suspicious := player_id {
    max_score := max([score | score := player_suspicion[_]])
    player_suspicion[player_id] == max_score
}

# =============================================================================
# ACTION VALIDATION HELPERS
# =============================================================================

# Validate a specific action type
validate_build_settlement := result {
    input.action == "build_settlement"
    result := decision
}

validate_build_road := result {
    input.action == "build_road"
    result := decision
}

validate_trade := result {
    input.action in {"propose_trade", "accept_trade", "bank_trade"}
    result := decision
}

# =============================================================================
# BATCH VALIDATION
# =============================================================================

# Validate multiple actions (for planning)
# Input: {"actions": [...array of actions...]}
batch_validation := results {
    results := [result |
        action := input.actions[i]
        result := {
            "index": i,
            "action": action,
            "decision": evaluate_action(action)
        }
    ]
}

# Evaluate a single action (helper for batch)
evaluate_action(action) := result {
    # This would need to be called with the action as input
    # For batch mode, we'd need to restructure
    result := decision with input as action
}

# =============================================================================
# DEBUG / INTROSPECTION
# =============================================================================

# List all rules that were evaluated
evaluated_rules := {
    "hard": {
        "spatial": count(spatial.deny),
        "resources": count(resources.deny),
        "turn": count(turn.deny)
    },
    "soft": {
        "actions": count(actions.soft_violation),
        "resources": count(soft_resources.soft_violation),
        "dev_cards": count(dev_cards.soft_violation)
    }
}

# Get the input action type
action_type := input.action

# Get the acting player
acting_player := input.player

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Convert set to array (OPA sets are unordered)
to_array(s) := arr {
    arr := [x | x := s[_]]
}

# Max helper
max(arr) := m {
    m := arr[_]
    not arr[_] > m
}

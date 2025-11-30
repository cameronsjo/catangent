# Catangent - SOFT Action Rules
# These rules LOG potential violations but DO NOT block the action
# Used for cheat detection - agents must notice and accuse

package catan.soft.actions

import data.catan.types

# =============================================================================
# MULTIPLE BUILD DETECTION
# =============================================================================

# SOFT: Multiple builds in a single turn (might be extra_build cheat)
soft_violation[violation] {
    input.action in {"build_settlement", "build_city", "build_road"}
    count(data.turn_state.builds) > 0
    violation := {
        "type": "multiple_builds",
        "player": input.player,
        "turn": data.game.turn,
        "count": count(data.turn_state.builds) + 1,
        "message": sprintf("Multiple builds in turn %d (count: %d)", [data.game.turn, count(data.turn_state.builds) + 1]),
        "cheat_type": "extra_build",
        "severity": "medium"
    }
}

# SOFT: Building without visible resource expenditure
soft_violation[violation] {
    input.action in {"build_settlement", "build_city", "build_road"}
    not data.game.phase in setup_phases
    not is_free_build
    cost := types.building_cost[get_building_type(input.action)]
    not resources_decreased_by(input.player, cost)
    violation := {
        "type": "build_without_spend",
        "player": input.player,
        "turn": data.game.turn,
        "action": input.action,
        "message": sprintf("%s built without corresponding resource decrease", [input.player]),
        "cheat_type": "resource_inflation",
        "severity": "high"
    }
}

# =============================================================================
# MULTIPLE TRADE DETECTION
# =============================================================================

# SOFT: Unusually many trades in a single turn
soft_violation[violation] {
    input.action in {"propose_trade", "bank_trade"}
    count(data.turn_state.trades) >= 3
    violation := {
        "type": "many_trades",
        "player": input.player,
        "turn": data.game.turn,
        "count": count(data.turn_state.trades) + 1,
        "message": sprintf("Many trades in turn %d (count: %d)", [data.game.turn, count(data.turn_state.trades) + 1]),
        "cheat_type": "extra_trade",
        "severity": "low"
    }
}

# =============================================================================
# DEV CARD ANOMALIES
# =============================================================================

# SOFT: Playing dev card that was bought this turn (should be blocked by HARD, but log anyway)
soft_violation[violation] {
    input.action == "play_dev_card"
    data.turn_state.dev_cards_bought[_] == input.card_id
    violation := {
        "type": "same_turn_dev_card",
        "player": input.player,
        "turn": data.game.turn,
        "card_id": input.card_id,
        "message": sprintf("%s played dev card bought same turn", [input.player]),
        "cheat_type": "double_dev_card",
        "severity": "high"
    }
}

# SOFT: Second dev card play in a turn
soft_violation[violation] {
    input.action == "play_dev_card"
    data.turn_state.dev_card_played
    violation := {
        "type": "multiple_dev_cards",
        "player": input.player,
        "turn": data.game.turn,
        "message": sprintf("%s played multiple dev cards in turn %d", [input.player, data.game.turn]),
        "cheat_type": "double_dev_card",
        "severity": "high"
    }
}

# =============================================================================
# ROBBER EVASION
# =============================================================================

# SOFT: Player with 8+ cards didn't discard after 7
soft_violation[violation] {
    input.action == "end_turn"
    data.turn_state.dice_roll == 7
    some player_id
    player_should_have_discarded(player_id)
    not data.turn_state.discarded[player_id]
    violation := {
        "type": "skipped_discard",
        "player": player_id,
        "turn": data.game.turn,
        "hand_size": get_hand_size_at_roll(player_id),
        "message": sprintf("%s did not discard after 7 (had %d cards)", [player_id, get_hand_size_at_roll(player_id)]),
        "cheat_type": "robber_dodge",
        "severity": "medium"
    }
}

# =============================================================================
# SUSPICIOUS TIMING
# =============================================================================

# SOFT: Action taken during someone else's turn (should be blocked, but log)
soft_violation[violation] {
    input.action in active_player_only_actions
    input.player != data.game.current_player
    violation := {
        "type": "out_of_turn_action",
        "player": input.player,
        "turn": data.game.turn,
        "current_player": data.game.current_player,
        "message": sprintf("%s acted out of turn", [input.player]),
        "cheat_type": "extra_action",
        "severity": "critical"
    }
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

setup_phases := {"setup_settlement_1", "setup_road_1", "setup_settlement_2", "setup_road_2"}

active_player_only_actions := {
    "roll_dice", "build_settlement", "build_city", "build_road",
    "buy_dev_card", "play_dev_card", "propose_trade", "bank_trade",
    "move_robber", "steal_resource", "end_turn"
}

# Check if this is a free build (Road Building card effect)
is_free_build {
    input.action == "build_road"
    data.game.active_effect == "road_building"
}

# Map action to building type
get_building_type(action) := "settlement" { action == "build_settlement" }
get_building_type(action) := "city" { action == "build_city" }
get_building_type(action) := "road" { action == "build_road" }

# Check if player's resources decreased by the expected cost
# This requires tracking resource changes during the turn
resources_decreased_by(player_id, cost) {
    # Compare turn_start resources with current (pre-action) resources
    start := data.turn_state.resources_at_turn_start[player_id]
    current := data.players[player_id].resources

    # For each resource type in cost, check decrease
    every r in types.resource_types {
        req := object.get(cost, r, 0)
        started := object.get(start, r, 0)
        now := object.get(current, r, 0)
        # Allow for resources gained during turn (production)
        # So we check: started + gained - now >= required
        gained := object.get(data.turn_state.resources_gained[player_id], r, 0)
        (started + gained - now) >= req
    }
}

# Check if player should have discarded
player_should_have_discarded(player_id) {
    # Hand size at time of roll was > 7
    hand_size := get_hand_size_at_roll(player_id)
    hand_size > 7
}

# Get hand size at time dice were rolled
get_hand_size_at_roll(player_id) := size {
    resources := data.turn_state.resources_at_dice_roll[player_id]
    size := types.sum_resources(resources)
}

# Default if not tracked
get_hand_size_at_roll(player_id) := 0 {
    not data.turn_state.resources_at_dice_roll[player_id]
}

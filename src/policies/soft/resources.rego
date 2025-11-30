# Catangent - SOFT Resource Rules
# Detect resource anomalies that might indicate cheating
# These don't block actions - they flag for investigation

package catan.soft.resources

import data.catan.types

# =============================================================================
# RESOURCE INFLATION DETECTION
# =============================================================================

# SOFT: Player has more resources than expected at end of turn
soft_violation[violation] {
    input.action == "end_turn"

    # Calculate expected resources
    player_id := input.player
    expected := calculate_expected_resources(player_id)
    actual := types.sum_resources(data.players[player_id].resources)

    # Flag if actual > expected (allowing small margin for tracking errors)
    actual > expected + 1

    violation := {
        "type": "resource_surplus",
        "player": player_id,
        "turn": data.game.turn,
        "expected": expected,
        "actual": actual,
        "difference": actual - expected,
        "message": sprintf("%s has %d more resources than expected", [player_id, actual - expected]),
        "cheat_type": "resource_inflation",
        "severity": "high"
    }
}

# SOFT: Sudden large resource gain without production
soft_violation[violation] {
    input.action == "end_turn"
    player_id := input.player

    # Resources gained that weren't from production or trades
    unexplained := get_unexplained_resource_gain(player_id)
    unexplained > 2

    violation := {
        "type": "unexplained_gain",
        "player": player_id,
        "turn": data.game.turn,
        "unexplained_amount": unexplained,
        "message": sprintf("%s gained %d unexplained resources", [player_id, unexplained]),
        "cheat_type": "resource_inflation",
        "severity": "high"
    }
}

# =============================================================================
# TRADE ANOMALIES
# =============================================================================

# SOFT: Trade where resources don't balance
soft_violation[violation] {
    input.action == "accept_trade"

    trade := data.pending_trades[input.trade_id]

    # Get actual resource changes for both parties
    proposer_change := get_resource_change(trade.proposer)
    accepter_change := get_resource_change(input.player)

    # They should be inverses of each other (within the trade)
    not resources_balance(trade.offer, trade.request, proposer_change, accepter_change)

    violation := {
        "type": "trade_imbalance",
        "player": input.player,
        "trade_id": input.trade_id,
        "turn": data.game.turn,
        "message": sprintf("Trade %s did not balance correctly", [input.trade_id]),
        "cheat_type": "trade_shortchange",
        "severity": "high"
    }
}

# SOFT: Trade partner received less than agreed
soft_violation[violation] {
    input.action == "accept_trade"

    trade := data.pending_trades[input.trade_id]

    # Accepter should receive trade.offer
    # Check if they actually got it
    accepter_received := data.turn_state.trade_receipts[input.player][input.trade_id]
    not resources_match(accepter_received, trade.offer)

    violation := {
        "type": "shortchanged",
        "player": input.player,
        "shortchanger": trade.proposer,
        "turn": data.game.turn,
        "expected": trade.offer,
        "received": accepter_received,
        "message": sprintf("%s was shortchanged in trade by %s", [input.player, trade.proposer]),
        "cheat_type": "trade_shortchange",
        "severity": "critical"
    }
}

# =============================================================================
# RESOURCE HIDING
# =============================================================================

# SOFT: Player's resource count suddenly dropped more than spent
soft_violation[violation] {
    input.action == "end_turn"
    player_id := input.player

    # Calculate what they should have lost
    expected_spent := calculate_expected_spent(player_id)
    actual_lost := calculate_actual_lost(player_id)

    # If they lost more than expected, they might be hiding resources
    actual_lost > expected_spent + 1

    violation := {
        "type": "resource_hiding",
        "player": player_id,
        "turn": data.game.turn,
        "expected_spent": expected_spent,
        "actual_lost": actual_lost,
        "message": sprintf("%s lost %d more resources than expected", [player_id, actual_lost - expected_spent]),
        "cheat_type": "resource_manipulation",
        "severity": "medium"
    }
}

# =============================================================================
# STEAL ANOMALIES
# =============================================================================

# SOFT: Steal result doesn't match expectations
soft_violation[violation] {
    input.action == "steal_resource"

    # If we're tracking steal results
    steal_result := data.turn_state.last_steal
    steal_result.stealer == input.player

    # Target should have lost 1 resource
    target_lost := resource_lost(steal_result.target)
    target_lost != 1

    violation := {
        "type": "steal_anomaly",
        "player": input.player,
        "target": steal_result.target,
        "turn": data.game.turn,
        "target_lost": target_lost,
        "message": sprintf("Steal from %s resulted in %d resources lost (expected 1)", [steal_result.target, target_lost]),
        "cheat_type": "resource_manipulation",
        "severity": "medium"
    }
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Calculate expected resources for a player at end of turn
calculate_expected_resources(player_id) := expected {
    # Start of turn
    start := types.sum_resources(data.turn_state.resources_at_turn_start[player_id])

    # Add: production from dice roll
    produced := object.get(data.turn_state.resources_produced, player_id, 0)

    # Add: received from trades
    trade_received := sum_trade_receipts(player_id)

    # Add: received from steal
    steal_received := count_steals_received(player_id)

    # Subtract: spent on buildings
    building_spent := calculate_building_costs(player_id)

    # Subtract: given in trades
    trade_given := sum_trade_gives(player_id)

    # Subtract: stolen from us
    stolen_from := count_stolen_from(player_id)

    # Subtract: discarded
    discarded := types.sum_resources(object.get(data.turn_state.discarded_resources, player_id, {}))

    expected := start + produced + trade_received + steal_received - building_spent - trade_given - stolen_from - discarded
}

# Get unexplained resource gains
get_unexplained_resource_gain(player_id) := unexplained {
    actual := types.sum_resources(data.players[player_id].resources)
    expected := calculate_expected_resources(player_id)
    unexplained := actual - expected
}

# Check if resources balance in a trade
resources_balance(offer, request, proposer_change, accepter_change) {
    # Proposer should: -offer, +request
    # Accepter should: +offer, -request
    every r in types.resource_types {
        offer_amt := object.get(offer, r, 0)
        request_amt := object.get(request, r, 0)
        proposer_delta := object.get(proposer_change, r, 0)
        accepter_delta := object.get(accepter_change, r, 0)

        # Proposer: loses offer, gains request
        proposer_delta == request_amt - offer_amt

        # Accepter: gains offer, loses request
        accepter_delta == offer_amt - request_amt
    }
}

# Check if two resource counts match
resources_match(a, b) {
    every r in types.resource_types {
        object.get(a, r, 0) == object.get(b, r, 0)
    }
}

# Get resource change for a player during current action
get_resource_change(player_id) := change {
    before := data.turn_state.resources_before_action[player_id]
    after := data.players[player_id].resources
    change := {r: after_amt - before_amt |
        r := types.resource_types[_]
        before_amt := object.get(before, r, 0)
        after_amt := object.get(after, r, 0)
    }
}

# Calculate expected spent on buildings this turn
calculate_expected_spent(player_id) := spent {
    builds := [b | b := data.turn_state.builds[_]; b.player == player_id]
    spent := sum([cost |
        build := builds[_]
        building_cost := types.building_cost[build.type]
        cost := types.sum_resources(building_cost)
    ])
}

# Calculate actual resources lost this turn
calculate_actual_lost(player_id) := lost {
    start := types.sum_resources(data.turn_state.resources_at_turn_start[player_id])
    current := types.sum_resources(data.players[player_id].resources)
    gained := object.get(data.turn_state.resources_produced, player_id, 0) +
              sum_trade_receipts(player_id) +
              count_steals_received(player_id)
    # lost = start + gained - current
    lost := start + gained - current
}

# Sum resources received from trades
sum_trade_receipts(player_id) := total {
    receipts := object.get(data.turn_state.trade_receipts, player_id, {})
    total := sum([amt |
        trade_id := receipts[_]
        trade := receipts[trade_id]
        amt := types.sum_resources(trade)
    ])
}

# Sum resources given in trades
sum_trade_gives(player_id) := total {
    gives := object.get(data.turn_state.trade_gives, player_id, {})
    total := sum([amt |
        trade_id := gives[_]
        trade := gives[trade_id]
        amt := types.sum_resources(trade)
    ])
}

# Count resources received from steals
count_steals_received(player_id) := count {
    steals := [s | s := data.turn_state.steals[_]; s.stealer == player_id]
    count := count(steals)
}

# Count resources stolen from player
count_stolen_from(player_id) := count {
    steals := [s | s := data.turn_state.steals[_]; s.target == player_id]
    count := count(steals)
}

# Calculate building costs for a player's builds this turn
calculate_building_costs(player_id) := total {
    builds := [b | b := data.turn_state.builds[_]; b.player == player_id]
    costs := [types.sum_resources(types.building_cost[b.type]) | b := builds[_]]
    total := sum(costs)
}

# Resources lost by a player
resource_lost(player_id) := lost {
    before := data.turn_state.resources_before_steal[player_id]
    after := data.players[player_id].resources
    before_total := types.sum_resources(before)
    after_total := types.sum_resources(after)
    lost := before_total - after_total
}

# Default value if not tracked
resource_lost(player_id) := 0 {
    not data.turn_state.resources_before_steal[player_id]
}

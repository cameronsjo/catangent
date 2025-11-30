# Catangent - SOFT Development Card Rules
# Detect dev card anomalies that might indicate cheating

package catan.soft.dev_cards

import data.catan.types

# =============================================================================
# DEV CARD PLAY ANOMALIES
# =============================================================================

# SOFT: Knight played but robber wasn't moved
soft_violation[violation] {
    input.action == "end_turn"

    # Knight was played this turn
    "knight" in data.turn_state.dev_cards_played

    # But robber didn't move
    not data.turn_state.robber_moved

    violation := {
        "type": "knight_no_robber",
        "player": input.player,
        "turn": data.game.turn,
        "message": sprintf("%s played Knight but did not move robber", [input.player]),
        "cheat_type": "action_skip",
        "severity": "medium"
    }
}

# SOFT: Road Building used but no/wrong number of roads built
soft_violation[violation] {
    input.action == "end_turn"

    # Road Building was played this turn
    "road_building" in data.turn_state.dev_cards_played

    # Count roads built after card was played
    roads_built := count_roads_after_road_building

    # Should be exactly 2 (or less if player is at limit)
    expected := min([2, remaining_roads(input.player)])
    roads_built != expected

    violation := {
        "type": "road_building_mismatch",
        "player": input.player,
        "turn": data.game.turn,
        "roads_built": roads_built,
        "expected": expected,
        "message": sprintf("%s played Road Building but built %d roads (expected %d)", [input.player, roads_built, expected]),
        "cheat_type": "extra_build",
        "severity": "medium"
    }
}

# SOFT: Year of Plenty resources not properly tracked
soft_violation[violation] {
    input.action == "end_turn"

    # Year of Plenty was played
    "year_of_plenty" in data.turn_state.dev_cards_played

    # Check that exactly 2 resources were gained from it
    yop_gain := types.sum_resources(data.turn_state.year_of_plenty_resources)
    yop_gain != 2

    violation := {
        "type": "year_of_plenty_mismatch",
        "player": input.player,
        "turn": data.game.turn,
        "resources_gained": yop_gain,
        "message": sprintf("%s played Year of Plenty but gained %d resources (expected 2)", [input.player, yop_gain]),
        "cheat_type": "resource_inflation",
        "severity": "high"
    }
}

# SOFT: Monopoly didn't collect from all players
soft_violation[violation] {
    input.action == "end_turn"

    # Monopoly was played
    "monopoly" in data.turn_state.dev_cards_played

    # Get the resource type that was monopolized
    monopoly_resource := data.turn_state.monopoly_resource

    # Calculate how much should have been collected
    expected_collection := calculate_monopoly_expected(input.player, monopoly_resource)
    actual_collection := data.turn_state.monopoly_collected

    # Flag if there's a discrepancy
    actual_collection != expected_collection

    violation := {
        "type": "monopoly_mismatch",
        "player": input.player,
        "turn": data.game.turn,
        "resource": monopoly_resource,
        "expected": expected_collection,
        "actual": actual_collection,
        "message": sprintf("%s played Monopoly on %s but collected %d (expected %d)", [input.player, monopoly_resource, actual_collection, expected_collection]),
        "cheat_type": "resource_inflation",
        "severity": "high"
    }
}

# =============================================================================
# DEV CARD ACQUISITION ANOMALIES
# =============================================================================

# SOFT: Player has more dev cards than purchased
soft_violation[violation] {
    input.action == "end_turn"
    player_id := input.player

    # Count dev cards purchased this game
    total_purchased := count_dev_cards_purchased(player_id)

    # Count dev cards currently held + played
    total_held := count_dev_cards_held(player_id)
    total_played := count_dev_cards_played(player_id)

    # Flag if they have more than purchased
    total_held + total_played > total_purchased

    violation := {
        "type": "dev_card_surplus",
        "player": player_id,
        "turn": data.game.turn,
        "purchased": total_purchased,
        "held": total_held,
        "played": total_played,
        "message": sprintf("%s has %d dev cards but only purchased %d", [player_id, total_held + total_played, total_purchased]),
        "cheat_type": "peek_dev_cards",
        "severity": "critical"
    }
}

# SOFT: Player played a card type they never purchased
soft_violation[violation] {
    input.action == "play_dev_card"

    card := get_card(input.card_id)

    # Check purchase history for this card type
    not purchased_card_type(input.player, card.type)

    violation := {
        "type": "unpurchased_card_type",
        "player": input.player,
        "turn": data.game.turn,
        "card_type": card.type,
        "message": sprintf("%s played %s but never purchased one", [input.player, card.type]),
        "cheat_type": "peek_dev_cards",
        "severity": "critical"
    }
}

# =============================================================================
# INFORMATION PEEK DETECTION
# =============================================================================

# SOFT: Player acted with knowledge they shouldn't have
# (e.g., knowing what card they'd draw, knowing opponent's hand)
# This is hard to detect directly - we look for suspicious patterns

# Player avoided robber on a 7 when they had 8+ cards by discarding exactly right
soft_violation[violation] {
    input.action == "discard"

    # Player had exactly 8 cards before
    before_count := types.sum_resources(data.turn_state.resources_before_discard[input.player])
    before_count == 8

    # They discarded exactly 4 (half)
    discard_count := types.sum_resources(input.resources)
    discard_count == 4

    # And discarded the "worst" resources (kept the expensive ones)
    kept_expensive_resources(input.player, input.resources)

    violation := {
        "type": "optimal_discard",
        "player": input.player,
        "turn": data.game.turn,
        "message": sprintf("%s made suspiciously optimal discard choices", [input.player]),
        "cheat_type": "peek_hand",
        "severity": "low"
    }
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Count roads built after Road Building card was played
count_roads_after_road_building := count {
    road_building_time := data.turn_state.dev_card_play_times["road_building"]
    roads := [r |
        r := data.turn_state.builds[_]
        r.type == "road"
        r.timestamp > road_building_time
    ]
    count := count(roads)
}

# Remaining roads a player can build
remaining_roads(player_id) := remaining {
    current := types.count_player_buildings(data.board.roads, player_id, "road")
    remaining := types.building_limit["road"] - current
}

# Calculate expected monopoly collection
calculate_monopoly_expected(player_id, resource) := expected {
    other_players := [p | p := data.players[_]; p.id != player_id]
    expected := sum([object.get(p.resources, resource, 0) | p := other_players[_]])
}

# Count dev cards purchased by player (lifetime)
count_dev_cards_purchased(player_id) := count {
    purchases := [p | p := data.game.dev_card_purchases[_]; p.player == player_id]
    count := count(purchases)
}

# Count dev cards currently held
count_dev_cards_held(player_id) := count {
    cards := [c | c := data.players[player_id].dev_cards[_]; not c.played]
    count := count(cards)
}

# Count dev cards played (lifetime)
count_dev_cards_played(player_id) := count {
    cards := [c | c := data.players[player_id].dev_cards[_]; c.played]
    count := count(cards)
}

# Get card by ID
get_card(card_id) := card {
    some player_id
    card := data.players[player_id].dev_cards[_]
    card.id == card_id
}

# Check if player ever purchased this card type
purchased_card_type(player_id, card_type) {
    purchase := data.game.dev_card_purchases[_]
    purchase.player == player_id
    purchase.card_type == card_type
}

# Check if player kept expensive resources (ore, wheat for cities)
kept_expensive_resources(player_id, discarded) {
    current := data.players[player_id].resources
    ore_kept := object.get(current, "ore", 0)
    wheat_kept := object.get(current, "wheat", 0)

    # Kept at least 2 ore and 2 wheat (city materials)
    ore_kept >= 2
    wheat_kept >= 2

    # And discarded the cheaper stuff
    ore_discarded := object.get(discarded, "ore", 0)
    wheat_discarded := object.get(discarded, "wheat", 0)
    ore_discarded == 0
    wheat_discarded == 0
}

# Min helper
min(arr) := m {
    m := arr[_]
    not arr[_] < m
}

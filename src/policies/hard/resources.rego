# Catangent - HARD Resource Rules
# These rules auto-reject actions that violate resource constraints
# Cannot spend resources you don't have

package catan.hard.resources

import data.catan.types

# =============================================================================
# BUILDING COST VALIDATION
# =============================================================================

# RULE: Must have resources to build a road
deny[msg] {
    input.action == "build_road"
    not is_free_road
    player_resources := data.players[input.player].resources
    not types.can_afford(player_resources, "road")
    msg := sprintf("HARD: %s cannot afford road (need 1 wood, 1 brick)", [input.player])
}

# RULE: Must have resources to build a settlement
deny[msg] {
    input.action == "build_settlement"
    not is_setup_phase
    player_resources := data.players[input.player].resources
    not types.can_afford(player_resources, "settlement")
    msg := sprintf("HARD: %s cannot afford settlement (need 1 wood, 1 brick, 1 wheat, 1 sheep)", [input.player])
}

# RULE: Must have resources to build a city
deny[msg] {
    input.action == "build_city"
    player_resources := data.players[input.player].resources
    not types.can_afford(player_resources, "city")
    msg := sprintf("HARD: %s cannot afford city (need 2 wheat, 3 ore)", [input.player])
}

# RULE: Must have resources to buy a development card
deny[msg] {
    input.action == "buy_dev_card"
    player_resources := data.players[input.player].resources
    not types.can_afford(player_resources, "dev_card")
    msg := sprintf("HARD: %s cannot afford development card (need 1 wheat, 1 sheep, 1 ore)", [input.player])
}

# =============================================================================
# TRADE VALIDATION
# =============================================================================

# RULE: Cannot offer resources you don't have
deny[msg] {
    input.action == "propose_trade"
    player_resources := data.players[input.player].resources
    some resource, amount in input.offer
    have := object.get(player_resources, resource, 0)
    have < amount
    msg := sprintf("HARD: %s cannot offer %d %s (only has %d)", [input.player, amount, resource, have])
}

# RULE: Bank trade must follow correct ratio
deny[msg] {
    input.action == "bank_trade"
    not valid_bank_trade(input.player, input.offer, input.request)
    msg := sprintf("HARD: Invalid bank trade ratio for %s", [input.player])
}

# RULE: Cannot bank trade resources you don't have
deny[msg] {
    input.action == "bank_trade"
    player_resources := data.players[input.player].resources
    some resource, amount in input.offer
    have := object.get(player_resources, resource, 0)
    have < amount
    msg := sprintf("HARD: %s cannot bank trade %d %s (only has %d)", [input.player, amount, resource, have])
}

# =============================================================================
# DISCARD VALIDATION
# =============================================================================

# RULE: Must discard correct number of cards when over 7
deny[msg] {
    input.action == "discard"
    player_resources := data.players[input.player].resources
    hand_size := types.sum_resources(player_resources)
    required_discard := div(hand_size, 2)
    actual_discard := types.sum_resources(input.resources)
    actual_discard != required_discard
    msg := sprintf("HARD: %s must discard %d cards (discarded %d)", [input.player, required_discard, actual_discard])
}

# RULE: Cannot discard resources you don't have
deny[msg] {
    input.action == "discard"
    player_resources := data.players[input.player].resources
    some resource, amount in input.resources
    have := object.get(player_resources, resource, 0)
    have < amount
    msg := sprintf("HARD: %s cannot discard %d %s (only has %d)", [input.player, amount, resource, have])
}

# =============================================================================
# BUILDING LIMITS
# =============================================================================

# RULE: Cannot exceed settlement limit (5)
deny[msg] {
    input.action == "build_settlement"
    types.at_building_limit(data.board.buildings, input.player, "settlement")
    msg := sprintf("HARD: %s has reached settlement limit (5)", [input.player])
}

# RULE: Cannot exceed city limit (4)
deny[msg] {
    input.action == "build_city"
    types.at_building_limit(data.board.buildings, input.player, "city")
    msg := sprintf("HARD: %s has reached city limit (4)", [input.player])
}

# RULE: Cannot exceed road limit (15)
deny[msg] {
    input.action == "build_road"
    types.at_building_limit(data.board.roads, input.player, "road")
    msg := sprintf("HARD: %s has reached road limit (15)", [input.player])
}

# =============================================================================
# DEVELOPMENT CARD VALIDATION
# =============================================================================

# RULE: Cannot buy dev card if deck is empty
deny[msg] {
    input.action == "buy_dev_card"
    count(data.bank.dev_cards) == 0
    msg := "HARD: Development card deck is empty"
}

# RULE: Must own the dev card to play it
deny[msg] {
    input.action == "play_dev_card"
    not player_owns_card(input.player, input.card_id)
    msg := sprintf("HARD: %s does not own dev card %s", [input.player, input.card_id])
}

# RULE: Cannot play dev card bought this turn
deny[msg] {
    input.action == "play_dev_card"
    card_bought_this_turn(input.card_id)
    msg := "HARD: Cannot play development card on the turn it was purchased"
}

# RULE: Cannot play victory point cards (they're automatic)
deny[msg] {
    input.action == "play_dev_card"
    card := data.players[input.player].dev_cards[_]
    card.id == input.card_id
    card.type == "victory_point"
    msg := "HARD: Victory point cards cannot be played - they count automatically"
}

# =============================================================================
# BANK RESOURCE VALIDATION
# =============================================================================

# RULE: Bank must have resources to give
deny[msg] {
    input.action == "bank_trade"
    some resource, amount in input.request
    bank_has := object.get(data.bank.resources, resource, 0)
    bank_has < amount
    msg := sprintf("HARD: Bank does not have %d %s", [amount, resource])
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if we're in setup phase (free buildings)
is_setup_phase {
    data.game.phase in {"setup_settlement_1", "setup_settlement_2", "setup_road_1", "setup_road_2"}
}

# Check if this is a free road (from Road Building card)
is_free_road {
    data.game.active_effect == "road_building"
    data.game.free_roads_remaining > 0
}

# Validate bank trade ratio
valid_bank_trade(player_id, offer, request) {
    # Get total offered and requested
    offered := types.sum_resources(offer)
    requested := types.sum_resources(request)

    # Must request exactly 1 resource type
    requested == 1

    # Get the best ratio available to this player
    ratio := get_best_trade_ratio(player_id, offer)

    # Offered must equal ratio * requested
    offered == ratio * requested
}

# Get the best trade ratio for a resource based on ports
get_best_trade_ratio(player_id, offer) := ratio {
    # Get the resource being offered (assume single type for simplicity)
    some resource, _ in offer

    # Check for 2:1 port for this specific resource
    has_specific_port(player_id, resource)
    ratio := 2
}

get_best_trade_ratio(player_id, offer) := ratio {
    some resource, _ in offer
    not has_specific_port(player_id, resource)
    has_generic_port(player_id)
    ratio := 3
}

get_best_trade_ratio(player_id, offer) := ratio {
    some resource, _ in offer
    not has_specific_port(player_id, resource)
    not has_generic_port(player_id)
    ratio := 4
}

# Check if player has a 2:1 port for a specific resource
has_specific_port(player_id, resource) {
    port := data.board.ports[_]
    port.type == sprintf("2:1_%s", [resource])
    port_vertex := port.vertices[_]
    some building in data.board.buildings
    building.vertex == port_vertex
    building.player == player_id
}

# Check if player has a 3:1 generic port
has_generic_port(player_id) {
    port := data.board.ports[_]
    port.type == "3:1"
    port_vertex := port.vertices[_]
    some building in data.board.buildings
    building.vertex == port_vertex
    building.player == player_id
}

# Check if player owns a specific card
player_owns_card(player_id, card_id) {
    card := data.players[player_id].dev_cards[_]
    card.id == card_id
    not card.played
}

# Check if card was bought this turn
card_bought_this_turn(card_id) {
    bought := data.turn_state.dev_cards_bought[_]
    bought == card_id
}

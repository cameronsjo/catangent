# Catangent - HARD Turn Rules
# These rules auto-reject actions that violate turn order and phase constraints
# Game flow must be respected

package catan.hard.turn

import data.catan.types

# =============================================================================
# TURN ORDER RULES
# =============================================================================

# RULE: Must be your turn to take most actions
deny[msg] {
    input.action in active_player_actions
    input.player != data.game.current_player
    msg := sprintf("HARD: Not %s's turn (current player: %s)", [input.player, data.game.current_player])
}

# RULE: Trade responses can come from non-active players
# (accept_trade, reject_trade are excluded from active_player_actions)

# =============================================================================
# PHASE RULES
# =============================================================================

# RULE: Must roll dice before other main phase actions
deny[msg] {
    input.action in post_roll_actions
    data.game.phase == "pre_roll"
    msg := sprintf("HARD: Must roll dice before %s", [input.action])
}

# RULE: Cannot roll dice if already rolled
deny[msg] {
    input.action == "roll_dice"
    data.game.phase != "pre_roll"
    msg := "HARD: Already rolled dice this turn"
}

# RULE: Building only allowed in correct phases
deny[msg] {
    input.action in build_actions
    not data.game.phase in types.build_phases
    msg := sprintf("HARD: Cannot %s during %s phase", [input.action, data.game.phase])
}

# RULE: Trading only allowed in main phase
deny[msg] {
    input.action in trade_actions
    not data.game.phase in types.trade_phases
    msg := sprintf("HARD: Cannot trade during %s phase", [data.game.phase])
}

# RULE: Dev cards can be played pre-roll or main phase
deny[msg] {
    input.action == "play_dev_card"
    not data.game.phase in types.dev_card_phases
    msg := sprintf("HARD: Cannot play dev card during %s phase", [data.game.phase])
}

# =============================================================================
# ROBBER PHASE RULES
# =============================================================================

# RULE: Must discard when in robber_discard phase and over 7 cards
deny[msg] {
    input.action != "discard"
    data.game.phase == "robber_discard"
    player_must_discard(input.player)
    msg := sprintf("HARD: %s must discard before taking other actions", [input.player])
}

# RULE: Cannot discard if not required
deny[msg] {
    input.action == "discard"
    not player_must_discard(input.player)
    msg := sprintf("HARD: %s does not need to discard", [input.player])
}

# RULE: Must move robber when in robber_move phase
deny[msg] {
    input.action != "move_robber"
    input.action in active_player_actions
    data.game.phase == "robber_move"
    input.player == data.game.current_player
    msg := "HARD: Must move robber"
}

# RULE: Can only move robber in robber_move phase (or with knight)
deny[msg] {
    input.action == "move_robber"
    data.game.phase != "robber_move"
    not playing_knight
    msg := "HARD: Can only move robber during robber phase or with Knight card"
}

# RULE: Must steal after moving robber (if possible)
deny[msg] {
    input.action != "steal_resource"
    input.action in active_player_actions
    data.game.phase == "robber_steal"
    can_steal_from_anyone
    msg := "HARD: Must steal after moving robber"
}

# =============================================================================
# SETUP PHASE RULES
# =============================================================================

# RULE: Setup phase settlement placement
deny[msg] {
    input.action == "build_settlement"
    data.game.phase == "setup_settlement_1"
    types.count_player_buildings(data.board.buildings, input.player, "settlement") >= 1
    msg := "HARD: Already placed first setup settlement"
}

deny[msg] {
    input.action == "build_settlement"
    data.game.phase == "setup_settlement_2"
    types.count_player_buildings(data.board.buildings, input.player, "settlement") >= 2
    msg := "HARD: Already placed second setup settlement"
}

# RULE: Setup phase road placement
deny[msg] {
    input.action == "build_road"
    data.game.phase == "setup_road_1"
    not road_connects_to_last_settlement(input.edge, input.player, 1)
    msg := "HARD: Setup road must connect to your settlement"
}

deny[msg] {
    input.action == "build_road"
    data.game.phase == "setup_road_2"
    not road_connects_to_last_settlement(input.edge, input.player, 2)
    msg := "HARD: Setup road must connect to your second settlement"
}

# RULE: Only settlement allowed in setup_settlement phases
deny[msg] {
    data.game.phase in {"setup_settlement_1", "setup_settlement_2"}
    input.action in active_player_actions
    input.action != "build_settlement"
    msg := "HARD: Must place settlement during setup"
}

# RULE: Only road allowed in setup_road phases
deny[msg] {
    data.game.phase in {"setup_road_1", "setup_road_2"}
    input.action in active_player_actions
    input.action != "build_road"
    msg := "HARD: Must place road during setup"
}

# =============================================================================
# END TURN RULES
# =============================================================================

# RULE: Cannot end turn during mandatory phases
deny[msg] {
    input.action == "end_turn"
    data.game.phase in mandatory_phases
    msg := sprintf("HARD: Cannot end turn during %s phase", [data.game.phase])
}

# RULE: Cannot end turn without rolling
deny[msg] {
    input.action == "end_turn"
    data.game.phase == "pre_roll"
    msg := "HARD: Must roll dice before ending turn"
}

# =============================================================================
# DEV CARD PLAY LIMITS
# =============================================================================

# RULE: Can only play one dev card per turn (except VP which are automatic)
deny[msg] {
    input.action == "play_dev_card"
    data.turn_state.dev_card_played
    msg := "HARD: Already played a development card this turn"
}

# =============================================================================
# GAME OVER
# =============================================================================

# RULE: No actions after game over
deny[msg] {
    data.game.phase == "game_over"
    msg := "HARD: Game is over"
}

# =============================================================================
# ACTION CATEGORIZATION
# =============================================================================

# Actions that require it to be your turn
active_player_actions := {
    "roll_dice",
    "build_settlement",
    "build_city",
    "build_road",
    "buy_dev_card",
    "play_dev_card",
    "propose_trade",
    "bank_trade",
    "move_robber",
    "steal_resource",
    "end_turn"
}

# Actions only available after rolling
post_roll_actions := {
    "build_settlement",
    "build_city",
    "build_road",
    "buy_dev_card",
    "propose_trade",
    "bank_trade",
    "end_turn"
}

# Build actions
build_actions := {
    "build_settlement",
    "build_city",
    "build_road"
}

# Trade actions
trade_actions := {
    "propose_trade",
    "accept_trade",
    "reject_trade",
    "bank_trade"
}

# Phases where turn cannot end
mandatory_phases := {
    "setup_settlement_1",
    "setup_road_1",
    "setup_settlement_2",
    "setup_road_2",
    "robber_discard",
    "robber_move",
    "robber_steal"
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if player must discard
player_must_discard(player_id) {
    player_resources := data.players[player_id].resources
    hand_size := types.sum_resources(player_resources)
    hand_size > 7
    not player_discarded(player_id)
}

# Check if player has already discarded this robber phase
player_discarded(player_id) {
    data.turn_state.discarded[player_id]
}

# Check if a knight card is being played
playing_knight {
    data.game.active_effect == "knight"
}

# Check if there's anyone to steal from
can_steal_from_anyone {
    robber_hex := data.board.robber_location
    hex_vertex := data.board.adjacency.hex_vertices[robber_hex][_]
    some building in data.board.buildings
    building.vertex == hex_vertex
    building.player != data.game.current_player
    # And they have resources
    target_resources := data.players[building.player].resources
    types.sum_resources(target_resources) > 0
}

# Check if road connects to the Nth settlement placed by player
road_connects_to_last_settlement(edge_id, player_id, settlement_number) {
    # Get player's settlements in order placed
    settlements := [s |
        s := data.board.buildings[_]
        s.player == player_id
        s.type == "settlement"
    ]

    # Get the specific settlement
    count(settlements) >= settlement_number
    target_settlement := settlements[settlement_number - 1]

    # Check if edge connects to that settlement
    edge_vertex := data.board.adjacency.edge_vertices[edge_id][_]
    edge_vertex == target_settlement.vertex
}

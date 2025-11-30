# Catangent - Core Types and Helpers
# Shared data structures and utility functions for Catan policy validation

package catan.types

# =============================================================================
# RESOURCE TYPES
# =============================================================================

resource_types := {"wood", "brick", "wheat", "sheep", "ore"}

# =============================================================================
# BUILDING COSTS
# =============================================================================

building_cost["road"] := {"wood": 1, "brick": 1}
building_cost["settlement"] := {"wood": 1, "brick": 1, "wheat": 1, "sheep": 1}
building_cost["city"] := {"wheat": 2, "ore": 3}
building_cost["dev_card"] := {"wheat": 1, "sheep": 1, "ore": 1}

# =============================================================================
# BUILDING LIMITS PER PLAYER
# =============================================================================

building_limit["road"] := 15
building_limit["settlement"] := 5
building_limit["city"] := 4

# =============================================================================
# DEVELOPMENT CARD TYPES
# =============================================================================

dev_card_types := {
    "knight",
    "victory_point",
    "road_building",
    "year_of_plenty",
    "monopoly"
}

playable_dev_cards := {
    "knight",
    "road_building",
    "year_of_plenty",
    "monopoly"
}

# =============================================================================
# GAME PHASES
# =============================================================================

valid_phases := {
    "setup_settlement_1",
    "setup_road_1",
    "setup_settlement_2",
    "setup_road_2",
    "pre_roll",
    "robber_discard",
    "robber_move",
    "robber_steal",
    "main",
    "game_over"
}

# Phases where building is allowed
build_phases := {"main", "setup_settlement_1", "setup_settlement_2", "setup_road_1", "setup_road_2"}

# Phases where trading is allowed
trade_phases := {"main"}

# Phases where dev cards can be played
dev_card_phases := {"pre_roll", "main"}

# =============================================================================
# ACTION TYPES
# =============================================================================

valid_actions := {
    "roll_dice",
    "build_settlement",
    "build_city",
    "build_road",
    "buy_dev_card",
    "play_dev_card",
    "propose_trade",
    "accept_trade",
    "reject_trade",
    "bank_trade",
    "move_robber",
    "steal_resource",
    "discard",
    "end_turn"
}

# =============================================================================
# HEX GRID HELPERS
# =============================================================================

# Standard Catan board has 19 hexes arranged in a specific pattern
# We use axial coordinates (q, r) for hex addressing
# Vertices are identified by hex + direction (N, NE, SE, S, SW, NW)
# Edges are identified by hex + direction (NE, E, SE)

vertex_directions := {"N", "NE", "SE", "S", "SW", "NW"}
edge_directions := {"NE", "E", "SE"}

# Get the 6 vertices of a hex
hex_vertices(hex_id) := vertices {
    vertices := {v |
        dir := vertex_directions[_]
        v := sprintf("%s_%s", [hex_id, dir])
    }
}

# Get the 6 edges of a hex
hex_edges(hex_id) := edges {
    edges := {e |
        dir := edge_directions[_]
        e := sprintf("%s_%s", [hex_id, dir])
    }
}

# =============================================================================
# VERTEX ADJACENCY
# =============================================================================

# Two vertices are adjacent if they share an edge (distance = 1)
# Settlement distance rule: no settlements within distance 1

# This is a simplified adjacency model
# In reality, vertex adjacency depends on the hex grid topology
# The actual adjacency map should be computed from board geometry

# Check if two vertices are the same
same_vertex(v1, v2) {
    v1 == v2
}

# =============================================================================
# RESOURCE COUNTING HELPERS
# =============================================================================

# Sum all resources in a resource count object
sum_resources(resources) := total {
    total := sum([count |
        resource_types[r]
        count := object.get(resources, r, 0)
    ])
}

# Check if player has at least the required resources
has_resources(player_resources, required) {
    every r in resource_types {
        req := object.get(required, r, 0)
        have := object.get(player_resources, r, 0)
        have >= req
    }
}

# Check if player can afford a building
can_afford(player_resources, building_type) {
    cost := building_cost[building_type]
    has_resources(player_resources, cost)
}

# =============================================================================
# PLAYER STATE HELPERS
# =============================================================================

# Count buildings of a specific type for a player
count_player_buildings(buildings, player_id, building_type) := count {
    count := count([b |
        b := buildings[_]
        b.player == player_id
        b.type == building_type
    ])
}

# Check if player has reached building limit
at_building_limit(buildings, player_id, building_type) {
    current := count_player_buildings(buildings, player_id, building_type)
    limit := building_limit[building_type]
    current >= limit
}

# Get player's settlements at a specific vertex
player_settlement_at(buildings, player_id, vertex_id) {
    some b in buildings
    b.player == player_id
    b.vertex == vertex_id
    b.type == "settlement"
}

# Get any building at a vertex
building_at_vertex(buildings, vertex_id) := building {
    some b in buildings
    b.vertex == vertex_id
    building := b
}

# Check if vertex is occupied
vertex_occupied(buildings, vertex_id) {
    some b in buildings
    b.vertex == vertex_id
    b.type in {"settlement", "city"}
}

# Check if edge has a road
edge_has_road(roads, edge_id) {
    some r in roads
    r.edge == edge_id
}

# Get all roads belonging to a player
player_roads(roads, player_id) := player_road_set {
    player_road_set := {r |
        r := roads[_]
        r.player == player_id
    }
}

# =============================================================================
# TRADE VALIDATION HELPERS
# =============================================================================

# Validate trade offer is non-empty
valid_trade_offer(offer, request) {
    sum_resources(offer) > 0
    sum_resources(request) > 0
}

# Bank trade ratios
bank_trade_ratio["default"] := 4
bank_trade_ratio["3:1_port"] := 3
bank_trade_ratio["2:1_wood"] := 2
bank_trade_ratio["2:1_brick"] := 2
bank_trade_ratio["2:1_wheat"] := 2
bank_trade_ratio["2:1_sheep"] := 2
bank_trade_ratio["2:1_ore"] := 2

# =============================================================================
# DEVELOPMENT CARD HELPERS
# =============================================================================

# Check if player owns a specific dev card
player_has_dev_card(dev_cards, player_id, card_type) {
    some card in dev_cards
    card.owner == player_id
    card.type == card_type
    not card.played
}

# Count unplayed dev cards of a type for a player
count_unplayed_dev_cards(dev_cards, player_id, card_type) := count {
    count := count([c |
        c := dev_cards[_]
        c.owner == player_id
        c.type == card_type
        not c.played
    ])
}

# =============================================================================
# VICTORY POINT CALCULATION
# =============================================================================

base_vp_per_settlement := 1
base_vp_per_city := 2
longest_road_vp := 2
largest_army_vp := 2
vp_card_value := 1

# Calculate visible (public) victory points for a player
calculate_public_vp(buildings, player_id, longest_road_holder, largest_army_holder) := vp {
    settlements := count_player_buildings(buildings, player_id, "settlement")
    cities := count_player_buildings(buildings, player_id, "city")

    base := (settlements * base_vp_per_settlement) + (cities * base_vp_per_city)

    road_bonus := longest_road_vp if longest_road_holder == player_id else 0
    army_bonus := largest_army_vp if largest_army_holder == player_id else 0

    vp := base + road_bonus + army_bonus
}

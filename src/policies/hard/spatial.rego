# Catangent - HARD Spatial Rules
# These rules auto-reject actions that violate Catan's spatial constraints
# Violations here are IMPOSSIBLE in legal play - no exceptions

package catan.hard.spatial

import data.catan.types

# =============================================================================
# SETTLEMENT PLACEMENT RULES
# =============================================================================

# RULE: Settlement must be placed on a valid vertex
deny[msg] {
    input.action == "build_settlement"
    not valid_vertex(input.vertex)
    msg := sprintf("HARD: Invalid vertex '%s' - does not exist on board", [input.vertex])
}

# RULE: Settlement vertex must not be occupied
deny[msg] {
    input.action == "build_settlement"
    types.vertex_occupied(data.board.buildings, input.vertex)
    msg := sprintf("HARD: Vertex '%s' is already occupied", [input.vertex])
}

# RULE: Settlement must respect distance rule (no adjacent settlements)
deny[msg] {
    input.action == "build_settlement"
    adjacent := data.board.adjacency.vertices[input.vertex][_]
    types.vertex_occupied(data.board.buildings, adjacent)
    msg := sprintf("HARD: Settlement at '%s' violates distance rule - adjacent to settlement at '%s'", [input.vertex, adjacent])
}

# RULE: Settlement must connect to player's road network (except setup phase)
deny[msg] {
    input.action == "build_settlement"
    not is_setup_phase
    not connects_to_road_network(input.vertex, input.player)
    msg := sprintf("HARD: Settlement at '%s' does not connect to %s's road network", [input.vertex, input.player])
}

# =============================================================================
# CITY UPGRADE RULES
# =============================================================================

# RULE: City must upgrade an existing settlement owned by the player
deny[msg] {
    input.action == "build_city"
    not types.player_settlement_at(data.board.buildings, input.player, input.vertex)
    msg := sprintf("HARD: Cannot build city at '%s' - no settlement to upgrade", [input.vertex])
}

# =============================================================================
# ROAD PLACEMENT RULES
# =============================================================================

# RULE: Road must be placed on a valid edge
deny[msg] {
    input.action == "build_road"
    not valid_edge(input.edge)
    msg := sprintf("HARD: Invalid edge '%s' - does not exist on board", [input.edge])
}

# RULE: Road edge must not be occupied
deny[msg] {
    input.action == "build_road"
    types.edge_has_road(data.board.roads, input.edge)
    msg := sprintf("HARD: Edge '%s' already has a road", [input.edge])
}

# RULE: Road must connect to player's network (road, settlement, or city)
deny[msg] {
    input.action == "build_road"
    not connects_to_network(input.edge, input.player)
    msg := sprintf("HARD: Road at '%s' does not connect to %s's network", [input.edge, input.player])
}

# RULE: Road cannot pass through opponent's settlement/city
deny[msg] {
    input.action == "build_road"
    blocked_by_opponent(input.edge, input.player)
    msg := sprintf("HARD: Road at '%s' blocked by opponent's building", [input.edge])
}

# =============================================================================
# ROBBER PLACEMENT RULES
# =============================================================================

# RULE: Robber must move to a different hex
deny[msg] {
    input.action == "move_robber"
    input.hex == data.board.robber_location
    msg := "HARD: Robber must move to a different hex"
}

# RULE: Robber cannot be placed on desert (after initial placement)
deny[msg] {
    input.action == "move_robber"
    data.board.hexes[input.hex].terrain == "desert"
    not initial_robber_placement
    msg := "HARD: Robber cannot return to desert"
}

# RULE: Target hex must exist
deny[msg] {
    input.action == "move_robber"
    not valid_hex(input.hex)
    msg := sprintf("HARD: Invalid hex '%s'", [input.hex])
}

# =============================================================================
# STEALING RULES
# =============================================================================

# RULE: Can only steal from player with building on robber hex
deny[msg] {
    input.action == "steal_resource"
    not player_on_robber_hex(input.target)
    msg := sprintf("HARD: Cannot steal from %s - no building on robber hex", [input.target])
}

# RULE: Cannot steal from yourself
deny[msg] {
    input.action == "steal_resource"
    input.target == input.player
    msg := "HARD: Cannot steal from yourself"
}

# RULE: Cannot steal from player with no resources
deny[msg] {
    input.action == "steal_resource"
    target_resources := data.players[input.target].resources
    types.sum_resources(target_resources) == 0
    msg := sprintf("HARD: Cannot steal from %s - they have no resources", [input.target])
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

# Check if we're in setup phase
is_setup_phase {
    data.game.phase in {"setup_settlement_1", "setup_settlement_2", "setup_road_1", "setup_road_2"}
}

# Check if this is initial robber placement (start of game)
initial_robber_placement {
    data.game.turn == 0
}

# Check if a vertex ID is valid on this board
valid_vertex(vertex_id) {
    data.board.vertices[vertex_id]
}

# Check if an edge ID is valid on this board
valid_edge(edge_id) {
    data.board.edges[edge_id]
}

# Check if a hex ID is valid on this board
valid_hex(hex_id) {
    data.board.hexes[hex_id]
}

# Check if a vertex connects to the player's road network
connects_to_road_network(vertex_id, player_id) {
    # Get edges adjacent to this vertex
    adjacent_edge := data.board.adjacency.vertex_edges[vertex_id][_]
    # Check if player has a road on any adjacent edge
    some road in data.board.roads
    road.edge == adjacent_edge
    road.player == player_id
}

# Check if an edge connects to the player's network
connects_to_network(edge_id, player_id) {
    # Option 1: Connects to player's existing road
    connects_to_road(edge_id, player_id)
}

connects_to_network(edge_id, player_id) {
    # Option 2: Connects to player's settlement/city
    connects_to_building(edge_id, player_id)
}

# Check if edge connects to player's existing road
connects_to_road(edge_id, player_id) {
    # Get vertices of this edge
    edge_vertex := data.board.adjacency.edge_vertices[edge_id][_]
    # Get other edges sharing that vertex
    other_edge := data.board.adjacency.vertex_edges[edge_vertex][_]
    other_edge != edge_id
    # Check if player has a road on the other edge
    some road in data.board.roads
    road.edge == other_edge
    road.player == player_id
    # Check no opponent blocks the connection at this vertex
    not opponent_building_blocks(edge_vertex, player_id)
}

# Check if edge connects to player's building
connects_to_building(edge_id, player_id) {
    edge_vertex := data.board.adjacency.edge_vertices[edge_id][_]
    some building in data.board.buildings
    building.vertex == edge_vertex
    building.player == player_id
}

# Check if opponent's building blocks connection at vertex
opponent_building_blocks(vertex_id, player_id) {
    some building in data.board.buildings
    building.vertex == vertex_id
    building.player != player_id
}

# Check if road is blocked by opponent's building
blocked_by_opponent(edge_id, player_id) {
    # For both vertices of the edge
    vertex := data.board.adjacency.edge_vertices[edge_id][_]
    # Check if opponent has a building there
    some building in data.board.buildings
    building.vertex == vertex
    building.player != player_id
    # And player doesn't have a road already connecting through
    not has_road_to_vertex(vertex, player_id)
}

# Check if player has a road leading to a vertex
has_road_to_vertex(vertex_id, player_id) {
    adjacent_edge := data.board.adjacency.vertex_edges[vertex_id][_]
    some road in data.board.roads
    road.edge == adjacent_edge
    road.player == player_id
}

# Check if player has building on the hex where robber is
player_on_robber_hex(player_id) {
    robber_hex := data.board.robber_location
    hex_vertex := data.board.adjacency.hex_vertices[robber_hex][_]
    some building in data.board.buildings
    building.vertex == hex_vertex
    building.player == player_id
}

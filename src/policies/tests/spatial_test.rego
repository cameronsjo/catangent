# Catangent - Spatial Rules Tests
# Tests for settlement, road, and robber placement validation

package catan.hard.spatial_test

import data.catan.hard.spatial

# =============================================================================
# TEST DATA
# =============================================================================

# Mock board with some existing buildings
mock_board := {
    "vertices": {
        "v1": true, "v2": true, "v3": true, "v4": true, "v5": true,
        "v6": true, "v7": true, "v8": true, "v9": true, "v10": true
    },
    "edges": {
        "e1": true, "e2": true, "e3": true, "e4": true, "e5": true
    },
    "hexes": {
        "h1": {"terrain": "forest"},
        "h2": {"terrain": "hills"},
        "h3": {"terrain": "desert"}
    },
    "buildings": [
        {"type": "settlement", "vertex": "v1", "player": "alice"},
        {"type": "settlement", "vertex": "v5", "player": "bob"}
    ],
    "roads": [
        {"edge": "e1", "player": "alice"},
        {"edge": "e3", "player": "bob"}
    ],
    "robber_location": "h3",
    "adjacency": {
        "vertices": {
            "v1": ["v2"],
            "v2": ["v1", "v3"],
            "v3": ["v2", "v4"],
            "v4": ["v3"],
            "v5": ["v6"],
            "v6": ["v5"]
        },
        "vertex_edges": {
            "v1": ["e1", "e2"],
            "v2": ["e1", "e3"],
            "v3": ["e2", "e4"],
            "v4": ["e4", "e5"]
        },
        "edge_vertices": {
            "e1": ["v1", "v2"],
            "e2": ["v1", "v3"],
            "e3": ["v2", "v5"],
            "e4": ["v3", "v4"],
            "e5": ["v4", "v6"]
        },
        "hex_vertices": {
            "h1": ["v1", "v2", "v3"],
            "h2": ["v4", "v5", "v6"]
        }
    }
}

mock_game := {
    "phase": "main",
    "turn": 5,
    "current_player": "alice"
}

# =============================================================================
# SETTLEMENT PLACEMENT TESTS
# =============================================================================

# Test: Valid settlement placement
test_settlement_valid {
    count(spatial.deny) == 0 with input as {
        "action": "build_settlement",
        "vertex": "v4",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game
}

# Test: Settlement on invalid vertex
test_settlement_invalid_vertex {
    result := spatial.deny with input as {
        "action": "build_settlement",
        "vertex": "v_nonexistent",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "Invalid vertex")
}

# Test: Settlement on occupied vertex
test_settlement_occupied {
    result := spatial.deny with input as {
        "action": "build_settlement",
        "vertex": "v1",
        "player": "bob"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "already occupied")
}

# Test: Settlement too close to another
test_settlement_distance_rule {
    result := spatial.deny with input as {
        "action": "build_settlement",
        "vertex": "v2",
        "player": "bob"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "distance rule")
}

# =============================================================================
# ROAD PLACEMENT TESTS
# =============================================================================

# Test: Valid road placement (connects to existing road)
test_road_valid_connects_to_road {
    count(spatial.deny) == 0 with input as {
        "action": "build_road",
        "edge": "e2",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game
}

# Test: Road on invalid edge
test_road_invalid_edge {
    result := spatial.deny with input as {
        "action": "build_road",
        "edge": "e_nonexistent",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "Invalid edge")
}

# Test: Road on occupied edge
test_road_occupied {
    result := spatial.deny with input as {
        "action": "build_road",
        "edge": "e1",
        "player": "bob"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "already has a road")
}

# Test: Road not connected to network
test_road_not_connected {
    result := spatial.deny with input as {
        "action": "build_road",
        "edge": "e5",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "does not connect")
}

# =============================================================================
# CITY UPGRADE TESTS
# =============================================================================

# Test: Valid city upgrade
test_city_valid {
    count(spatial.deny) == 0 with input as {
        "action": "build_city",
        "vertex": "v1",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game
}

# Test: City upgrade on non-owned settlement
test_city_not_owned {
    result := spatial.deny with input as {
        "action": "build_city",
        "vertex": "v5",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "no settlement to upgrade")
}

# Test: City upgrade on empty vertex
test_city_no_settlement {
    result := spatial.deny with input as {
        "action": "build_city",
        "vertex": "v3",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "no settlement to upgrade")
}

# =============================================================================
# ROBBER TESTS
# =============================================================================

# Test: Valid robber move
test_robber_valid {
    count(spatial.deny) == 0 with input as {
        "action": "move_robber",
        "hex": "h1",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game
}

# Test: Robber must move to different hex
test_robber_same_hex {
    result := spatial.deny with input as {
        "action": "move_robber",
        "hex": "h3",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "must move to a different hex")
}

# Test: Robber to invalid hex
test_robber_invalid_hex {
    result := spatial.deny with input as {
        "action": "move_robber",
        "hex": "h_nonexistent",
        "player": "alice"
    } with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "Invalid hex")
}

# =============================================================================
# HELPER
# =============================================================================

contains(str, substr) {
    indexof(str, substr) >= 0
}

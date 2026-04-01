# Catangent - Turn Rules Tests
# Tests for turn order, phase, and timing validation

package catan.hard.turn_test

import data.catan.hard.turn

# =============================================================================
# TEST DATA
# =============================================================================

mock_players := {
    "alice": {
        "resources": {"wood": 5, "brick": 5, "wheat": 5, "sheep": 5, "ore": 5}
    },
    "bob": {
        "resources": {"wood": 5, "brick": 5, "wheat": 5, "sheep": 5, "ore": 5}
    }
}

# =============================================================================
# TURN ORDER TESTS
# =============================================================================

# Test: Can act on your turn
test_your_turn_allowed {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "alice"
    }

    count(turn.deny) == 0 with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game
      with data.players as mock_players
}

# Test: Cannot act on opponent's turn
test_not_your_turn {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "bob"
    }

    result := turn.deny with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game
      with data.players as mock_players

    count(result) > 0
    contains(result[_], "Not alice's turn")
}

# =============================================================================
# PHASE TESTS
# =============================================================================

# Test: Must roll before building
test_must_roll_first {
    game := {
        "phase": "pre_roll",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "build_settlement",
        "player": "alice"
    } with data.game as game
      with data.players as mock_players

    count(result) > 0
    contains(result[_], "Must roll dice")
}

# Test: Cannot roll twice
test_cannot_roll_twice {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "roll_dice",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Already rolled")
}

# Test: Cannot trade before rolling
test_cannot_trade_pre_roll {
    game := {
        "phase": "pre_roll",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "propose_trade",
        "player": "alice",
        "offer": {"wood": 1},
        "request": {"brick": 1}
    } with data.game as game
      with data.players as mock_players

    count(result) > 0
    contains(result[_], "Must roll dice")
}

# =============================================================================
# ROBBER PHASE TESTS
# =============================================================================

# Test: Must discard when required
test_must_discard {
    game := {
        "phase": "robber_discard",
        "turn": 5,
        "current_player": "alice"
    }

    players_with_many := {
        "alice": {
            "resources": {"wood": 3, "brick": 3, "wheat": 3, "sheep": 0, "ore": 0}
        }
    }

    turn_state := {
        "discarded": {}
    }

    result := turn.deny with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game
      with data.players as players_with_many
      with data.turn_state as turn_state

    count(result) > 0
    contains(result[_], "must discard")
}

# Test: Must move robber when required
test_must_move_robber {
    game := {
        "phase": "robber_move",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game
      with data.players as mock_players

    count(result) > 0
    contains(result[_], "Must move robber")
}

# Test: Cannot move robber outside robber phase
test_cannot_move_robber_wrong_phase {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "alice",
        "active_effect": null
    }

    result := turn.deny with input as {
        "action": "move_robber",
        "hex": "h1",
        "player": "alice"
    } with data.game as game
      with data.players as mock_players

    count(result) > 0
    contains(result[_], "Can only move robber during robber phase")
}

# =============================================================================
# SETUP PHASE TESTS
# =============================================================================

# Test: Only settlement allowed in setup_settlement phase
test_setup_settlement_phase {
    game := {
        "phase": "setup_settlement_1",
        "turn": 0,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Must place settlement")
}

# Test: Only road allowed in setup_road phase
test_setup_road_phase {
    game := {
        "phase": "setup_road_1",
        "turn": 0,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "build_settlement",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Must place road")
}

# =============================================================================
# END TURN TESTS
# =============================================================================

# Test: Can end turn in main phase
test_end_turn_main_phase {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "alice"
    }

    count(turn.deny) == 0 with input as {
        "action": "end_turn",
        "player": "alice"
    } with data.game as game
}

# Test: Cannot end turn without rolling
test_cannot_end_before_roll {
    game := {
        "phase": "pre_roll",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "end_turn",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Must roll dice")
}

# Test: Cannot end turn during mandatory phase
test_cannot_end_mandatory_phase {
    game := {
        "phase": "robber_move",
        "turn": 5,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "end_turn",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Cannot end turn during")
}

# =============================================================================
# DEV CARD TESTS
# =============================================================================

# Test: Only one dev card per turn
test_one_dev_card_per_turn {
    game := {
        "phase": "main",
        "turn": 5,
        "current_player": "alice"
    }

    turn_state := {
        "dev_card_played": true
    }

    result := turn.deny with input as {
        "action": "play_dev_card",
        "card_id": "d1",
        "player": "alice"
    } with data.game as game
      with data.turn_state as turn_state

    count(result) > 0
    contains(result[_], "Already played a development card")
}

# =============================================================================
# GAME OVER TEST
# =============================================================================

# Test: No actions after game over
test_game_over {
    game := {
        "phase": "game_over",
        "turn": 50,
        "current_player": "alice"
    }

    result := turn.deny with input as {
        "action": "build_road",
        "player": "alice"
    } with data.game as game

    count(result) > 0
    contains(result[_], "Game is over")
}

# =============================================================================
# HELPER
# =============================================================================

contains(str, substr) {
    indexof(str, substr) >= 0
}

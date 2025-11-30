# Catangent - Resource Rules Tests
# Tests for cost validation, trade validation, and building limits

package catan.hard.resources_test

import data.catan.hard.resources

# =============================================================================
# TEST DATA
# =============================================================================

mock_players := {
    "alice": {
        "resources": {
            "wood": 2,
            "brick": 2,
            "wheat": 1,
            "sheep": 1,
            "ore": 0
        },
        "dev_cards": []
    },
    "bob": {
        "resources": {
            "wood": 0,
            "brick": 0,
            "wheat": 3,
            "sheep": 2,
            "ore": 4
        },
        "dev_cards": []
    },
    "charlie": {
        "resources": {
            "wood": 0,
            "brick": 0,
            "wheat": 0,
            "sheep": 0,
            "ore": 0
        },
        "dev_cards": []
    }
}

mock_board := {
    "buildings": [],
    "roads": [],
    "ports": []
}

mock_bank := {
    "resources": {
        "wood": 19,
        "brick": 19,
        "wheat": 19,
        "sheep": 19,
        "ore": 19
    },
    "dev_cards": [
        {"id": "d1", "type": "knight"}
    ]
}

mock_game := {
    "phase": "main",
    "turn": 5,
    "current_player": "alice"
}

mock_turn_state := {
    "dev_cards_bought": []
}

# =============================================================================
# BUILDING COST TESTS
# =============================================================================

# Test: Can afford road (1 wood, 1 brick)
test_road_affordable {
    count(resources.deny) == 0 with input as {
        "action": "build_road",
        "player": "alice"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game
}

# Test: Cannot afford road
test_road_not_affordable {
    result := resources.deny with input as {
        "action": "build_road",
        "player": "charlie"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot afford road")
}

# Test: Can afford settlement (1 wood, 1 brick, 1 wheat, 1 sheep)
test_settlement_affordable {
    count(resources.deny) == 0 with input as {
        "action": "build_settlement",
        "player": "alice"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game
}

# Test: Cannot afford settlement
test_settlement_not_affordable {
    result := resources.deny with input as {
        "action": "build_settlement",
        "player": "bob"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot afford settlement")
}

# Test: Can afford city (2 wheat, 3 ore)
test_city_affordable {
    count(resources.deny) == 0 with input as {
        "action": "build_city",
        "player": "bob"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game
}

# Test: Cannot afford city
test_city_not_affordable {
    result := resources.deny with input as {
        "action": "build_city",
        "player": "alice"
    } with data.players as mock_players
      with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot afford city")
}

# Test: Can afford dev card (1 wheat, 1 sheep, 1 ore)
test_dev_card_affordable {
    players_with_ore := {
        "alice": {
            "resources": {"wood": 1, "brick": 1, "wheat": 1, "sheep": 1, "ore": 1},
            "dev_cards": []
        }
    }

    count(resources.deny) == 0 with input as {
        "action": "buy_dev_card",
        "player": "alice"
    } with data.players as players_with_ore
      with data.bank as mock_bank
      with data.game as mock_game
}

# Test: Cannot afford dev card
test_dev_card_not_affordable {
    result := resources.deny with input as {
        "action": "buy_dev_card",
        "player": "alice"
    } with data.players as mock_players
      with data.bank as mock_bank
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot afford development card")
}

# =============================================================================
# TRADE VALIDATION TESTS
# =============================================================================

# Test: Valid trade offer (have the resources)
test_trade_offer_valid {
    count(resources.deny) == 0 with input as {
        "action": "propose_trade",
        "player": "alice",
        "offer": {"wood": 1, "brick": 1},
        "request": {"ore": 1}
    } with data.players as mock_players
      with data.game as mock_game
}

# Test: Invalid trade offer (don't have the resources)
test_trade_offer_invalid {
    result := resources.deny with input as {
        "action": "propose_trade",
        "player": "alice",
        "offer": {"ore": 2},
        "request": {"wood": 1}
    } with data.players as mock_players
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot offer")
}

# =============================================================================
# BANK TRADE TESTS
# =============================================================================

# Test: Valid 4:1 bank trade
test_bank_trade_4_1_valid {
    players_for_bank := {
        "alice": {
            "resources": {"wood": 4, "brick": 0, "wheat": 0, "sheep": 0, "ore": 0}
        }
    }

    count(resources.deny) == 0 with input as {
        "action": "bank_trade",
        "player": "alice",
        "offer": {"wood": 4},
        "request": {"brick": 1}
    } with data.players as players_for_bank
      with data.bank as mock_bank
      with data.board as mock_board
      with data.game as mock_game
}

# Test: Invalid bank trade ratio
test_bank_trade_bad_ratio {
    players_for_bank := {
        "alice": {
            "resources": {"wood": 3, "brick": 0, "wheat": 0, "sheep": 0, "ore": 0}
        }
    }

    result := resources.deny with input as {
        "action": "bank_trade",
        "player": "alice",
        "offer": {"wood": 3},
        "request": {"brick": 1}
    } with data.players as players_for_bank
      with data.bank as mock_bank
      with data.board as mock_board
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "Invalid bank trade ratio")
}

# =============================================================================
# DISCARD TESTS
# =============================================================================

# Test: Valid discard (half of 8 = 4)
test_discard_valid {
    players_over_7 := {
        "alice": {
            "resources": {"wood": 2, "brick": 2, "wheat": 2, "sheep": 1, "ore": 1}
        }
    }

    count(resources.deny) == 0 with input as {
        "action": "discard",
        "player": "alice",
        "resources": {"wood": 2, "brick": 2}
    } with data.players as players_over_7
      with data.game as mock_game
}

# Test: Invalid discard amount
test_discard_wrong_amount {
    players_over_7 := {
        "alice": {
            "resources": {"wood": 2, "brick": 2, "wheat": 2, "sheep": 1, "ore": 1}
        }
    }

    result := resources.deny with input as {
        "action": "discard",
        "player": "alice",
        "resources": {"wood": 1}
    } with data.players as players_over_7
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "must discard")
}

# Test: Cannot discard resources you don't have
test_discard_dont_have {
    players_over_7 := {
        "alice": {
            "resources": {"wood": 2, "brick": 2, "wheat": 2, "sheep": 1, "ore": 1}
        }
    }

    result := resources.deny with input as {
        "action": "discard",
        "player": "alice",
        "resources": {"ore": 4}
    } with data.players as players_over_7
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "cannot discard")
}

# =============================================================================
# DEV CARD DECK TESTS
# =============================================================================

# Test: Cannot buy dev card if deck empty
test_dev_card_deck_empty {
    empty_bank := {
        "resources": mock_bank.resources,
        "dev_cards": []
    }

    rich_player := {
        "alice": {
            "resources": {"wheat": 5, "sheep": 5, "ore": 5},
            "dev_cards": []
        }
    }

    result := resources.deny with input as {
        "action": "buy_dev_card",
        "player": "alice"
    } with data.players as rich_player
      with data.bank as empty_bank
      with data.game as mock_game

    count(result) > 0
    contains(result[_], "deck is empty")
}

# =============================================================================
# HELPER
# =============================================================================

contains(str, substr) {
    indexof(str, substr) >= 0
}

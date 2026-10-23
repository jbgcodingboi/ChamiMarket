/** Display names for every game, keyed by the id used in round records. */
export const GAME_NAME = {
  // Roulette and Blackjack go by plain names on the site.
  roulette: 'Spin',
  blackjack: '21',
  plinko: 'Plinko',
  dice: 'Dice',
  mines: 'Mines',
  chicken: 'Chicken Cross',
  limbo: 'Limbo',
  crash: 'Crash',
  // Retired; past rounds keep their name.
  boneyard: 'Boneyard',
  slots: 'Golden Sevens',
}

/**
 * Each game's address, keyed the same way. The words are deliberately plain;
 * the old addresses (#/games/roulette and so on) still work and redirect here.
 */
export const GAME_PATH = {
  roulette: '/games/spin',
  blackjack: '/games/21',
  plinko: '/games/balls',
  dice: '/games/roll',
  mines: '/games/gems',
  chicken: '/games/cross',
  limbo: '/games/target',
  crash: '/games/rocket',
  slots: '/games/reels',
  boneyard: '/games/reels',
}

/** The page for a game id, or the lobby for an unknown one. */
export const gamePath = (game) => GAME_PATH[game] ?? '/games'

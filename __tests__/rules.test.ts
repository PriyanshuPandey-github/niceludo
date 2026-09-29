import {
  ColorId,
  FINISHED,
  GameState,
  IN_BASE,
  Move,
  SeatConfig,
  applyMove,
  chooseMove,
  createGame,
  legalMoves,
  ringIndex,
  START_INDEX,
  roll,
  standings,
} from '../src/engine';

const seats = (
  types: Array<'human' | 'cpu'>,
  colors: ColorId[],
): SeatConfig[] =>
  colors.map((color, index) => ({
    color,
    type: types[index],
    name: `P${index}`,
  }));

const twoPlayer = (): GameState =>
  createGame(
    seats(['human', 'cpu'], [ColorId.Red, ColorId.Yellow]),
    'hard',
    [1, 2, 3, 4],
  );

/** Force a die value without touching the generator, for deterministic setups. */
const withDie = (state: GameState, die: number): GameState => ({
  ...state,
  die,
  phase: 'select',
});

const placeToken = (
  state: GameState,
  player: number,
  token: number,
  steps: number,
): GameState => ({
  ...state,
  players: state.players.map((p, index) =>
    index === player
      ? { ...p, tokens: p.tokens.map((s, i) => (i === token ? steps : s)) }
      : p,
  ),
});

describe('movement rules', () => {
  it('only lets a token leave the base on a six', () => {
    const state = twoPlayer();
    expect(legalMoves(state, 3)).toHaveLength(0);
    expect(legalMoves(state, 5)).toHaveLength(0);
    const sixes = legalMoves(state, 6);
    expect(sixes).toHaveLength(4);
    sixes.forEach(move => {
      expect(move.from).toBe(IN_BASE);
      expect(move.to).toBe(0);
      expect(move.leavesBase).toBe(true);
    });
  });

  it('requires an exact count to reach the centre', () => {
    let state = twoPlayer();
    state = placeToken(state, 0, 0, 54); // two short of home
    expect(legalMoves(state, 3).some(m => m.token === 0 && m.finishes)).toBe(
      false,
    );
    expect(legalMoves(state, 2).some(m => m.token === 0 && m.finishes)).toBe(
      true,
    );
    // Overshooting is not a legal move at all.
    expect(legalMoves(state, 4).some(m => m.token === 0)).toBe(false);
  });

  it('sends a captured token back to its base and grants another roll', () => {
    let state = twoPlayer();
    // Red 4 steps along, Yellow parked where Red will land (a non-safe cell).
    state = placeToken(state, 0, 0, 4);
    const target = ringIndex(ColorId.Red, 7);
    const yellowSteps = (target - START_INDEX[ColorId.Yellow] + 52) % 52;
    state = placeToken(state, 1, 2, yellowSteps);
    state = withDie(state, 3);

    const move = legalMoves(state, 3).find(m => m.token === 0) as Move;
    expect(move.captures).toEqual([[1, 2]]);

    const result = applyMove(state, move);
    expect(result.state.players[1].tokens[2]).toBe(IN_BASE);
    expect(result.state.turn).toBe(0); // capture keeps the turn
    expect(result.state.phase).toBe('roll');
    expect(result.events.some(e => e.type === 'capture')).toBe(true);
  });

  it('never captures on a protected cell', () => {
    let state = twoPlayer();
    // Red lands exactly on the star cell 8 steps past its own start.
    state = placeToken(state, 0, 0, 5);
    const star = ringIndex(ColorId.Red, 8);
    const yellowSteps = (star - START_INDEX[ColorId.Yellow] + 52) % 52;
    state = placeToken(state, 1, 1, yellowSteps);
    const move = legalMoves(state, 3).find(m => m.token === 0) as Move;
    expect(move.to).toBe(8);
    expect(move.captures).toHaveLength(0);
  });

  it('lets a colour stack its own tokens without capturing itself', () => {
    let state = twoPlayer();
    state = placeToken(state, 0, 0, 10);
    state = placeToken(state, 0, 1, 7);
    const move = legalMoves(state, 3).find(m => m.token === 1) as Move;
    expect(move.to).toBe(10);
    expect(move.captures).toHaveLength(0);
    const result = applyMove(withDie(state, 3), move);
    expect(result.state.players[0].tokens[0]).toBe(10);
    expect(result.state.players[0].tokens[1]).toBe(10);
  });

  it('passes the turn on a plain move', () => {
    let state = twoPlayer();
    state = placeToken(state, 0, 0, 10);
    state = withDie(state, 3);
    const move = legalMoves(state, 3).find(m => m.token === 0) as Move;
    const result = applyMove(state, move);
    expect(result.state.turn).toBe(1);
    expect(result.state.die).toBeNull();
  });

  it('grants another roll for a six and for a token brought home', () => {
    let state = twoPlayer();
    state = placeToken(state, 0, 0, 10);
    let result = applyMove(withDie(state, 6), {
      token: 0,
      from: 10,
      to: 16,
      captures: [],
      finishes: false,
      leavesBase: false,
    });
    expect(result.state.turn).toBe(0);

    state = placeToken(twoPlayer(), 0, 0, 53);
    result = applyMove(withDie(state, 3), {
      token: 0,
      from: 53,
      to: FINISHED,
      captures: [],
      finishes: true,
      leavesBase: false,
    });
    expect(result.state.turn).toBe(0);
    expect(result.state.players[0].tokens[0]).toBe(FINISHED);
  });

  it('burns the turn after three sixes in a row', () => {
    let state = twoPlayer();
    state = { ...state, sixStreak: 2 };
    // Drive the generator until it yields a six so the streak trips.
    let guard = 0;
    let result = roll(state);
    while (result.state.die !== 6 && guard < 200) {
      state = { ...result.state, sixStreak: 2, phase: 'roll', turn: 0 };
      result = roll(state);
      guard += 1;
    }
    expect(result.events.some(e => e.type === 'forfeit')).toBe(true);
    expect(result.moves).toHaveLength(0);
    expect(result.state.turn).toBe(1);
    expect(result.state.sixStreak).toBe(0);
  });

  it('skips a player who has no legal move', () => {
    const state = twoPlayer();
    let attempt = roll(state);
    let guard = 0;
    while (attempt.state.die === 6 && guard < 200) {
      attempt = roll({ ...state, rng: attempt.state.rng });
      guard += 1;
    }
    expect(attempt.moves).toHaveLength(0);
    expect(attempt.state.turn).toBe(1);
    expect(attempt.state.phase).toBe('roll');
  });

  it('orders seats clockwise regardless of setup order', () => {
    const state = createGame(
      seats(
        ['cpu', 'human', 'cpu'],
        [ColorId.Blue, ColorId.Green, ColorId.Yellow],
      ),
      'normal',
      [7, 7, 7, 7],
    );
    expect(state.players.map(p => p.color)).toEqual([
      ColorId.Green,
      ColorId.Yellow,
      ColorId.Blue,
    ]);
  });

  it('ranks every player once the game ends', () => {
    let state = createGame(
      seats(['cpu', 'cpu'], [ColorId.Red, ColorId.Yellow]),
      'hard',
      [3, 1, 4, 1],
    );
    state = {
      ...state,
      players: state.players.map((player, index) => ({
        ...player,
        tokens: index === 0 ? [FINISHED, FINISHED, FINISHED, 53] : [0, 0, 0, 0],
      })),
    };
    const result = applyMove(withDie(state, 3), {
      token: 3,
      from: 53,
      to: FINISHED,
      captures: [],
      finishes: true,
      leavesBase: false,
    });
    expect(result.state.phase).toBe('over');
    expect(result.state.players[0].rank).toBe(1);
    expect(result.state.players[1].rank).toBe(2);
    expect(standings(result.state)[0].color).toBe(ColorId.Red);
  });
});

/** Play a whole game with CPU logic on both sides. */
const playOut = (state: GameState, maxTurns = 20000): GameState => {
  let current = state;
  let guard = 0;
  while (current.phase !== 'over' && guard < maxTurns) {
    guard += 1;
    const rolled = roll(current);
    current = rolled.state;
    if (rolled.moves.length === 0) {
      continue;
    }
    const choice = chooseMove(
      current,
      rolled.moves,
      current.die ?? 1,
      current.rng,
    );
    current = applyMove({ ...current, rng: choice.rng }, choice.move).state;
  }
  return current;
};

describe('full games', () => {
  it('always terminates with a complete ranking', () => {
    for (let game = 0; game < 60; game++) {
      const state = createGame(
        seats(
          ['cpu', 'cpu', 'cpu', 'cpu'],
          [ColorId.Red, ColorId.Green, ColorId.Yellow, ColorId.Blue],
        ),
        'normal',
        [game + 1, game * 7 + 3, game * 13 + 5, game * 29 + 11],
      );
      const finished = playOut(state);
      expect(finished.phase).toBe('over');
      const ranks = finished.players.map(p => p.rank).sort();
      expect(ranks).toEqual([1, 2, 3, 4]);
      const winner = finished.players.find(p => p.rank === 1);
      expect(winner?.tokens).toEqual([FINISHED, FINISHED, FINISHED, FINISHED]);
    }
  });

  it('gives no seat a structural edge beyond moving first', () => {
    const wins = [0, 0, 0, 0];
    const games = 400;
    for (let game = 0; game < games; game++) {
      const state = createGame(
        seats(
          ['cpu', 'cpu', 'cpu', 'cpu'],
          [ColorId.Red, ColorId.Green, ColorId.Yellow, ColorId.Blue],
        ),
        'hard',
        [game * 2654435761, game * 40503 + 7, game * 69069 + 13, game + 101],
      );
      const finished = playOut(state);
      const winner = finished.players.findIndex(p => p.rank === 1);
      wins[winner] += 1;
    }
    const share = wins.map(count => count / games);
    share.forEach(value => {
      expect(value).toBeGreaterThan(0.17);
      expect(value).toBeLessThan(0.34);
    });
  });

  it('keeps the same difficulty on equal footing head to head', () => {
    const wins = [0, 0];
    const games = 300;
    for (let game = 0; game < games; game++) {
      const state = createGame(
        seats(['cpu', 'cpu'], [ColorId.Red, ColorId.Yellow]),
        'normal',
        [game * 97 + 1, game * 131 + 5, game * 17 + 3, game * 7919 + 11],
      );
      const finished = playOut(state);
      wins[finished.players.findIndex(p => p.rank === 1)] += 1;
    }
    expect(wins[0] / games).toBeGreaterThan(0.4);
    expect(wins[0] / games).toBeLessThan(0.6);
  });
});

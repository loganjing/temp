import { describe, it, expect } from 'vitest';
import {
  changeDirection,
  createInitialState,
  getStateSnapshot,
  setFoodOverride,
  spawnFood,
  tick,
} from '../src/engine';
import type { Point, SnakeState } from '../src/engine';
import { GRID_SIZE } from '../src/engine';

describe('createInitialState', () => {
  it('creates a running game with score 0, 3-segment snake, and food present', () => {
    const state = createInitialState();
    expect(state.gameState).toBe('running');
    expect(state.score).toBe(0);
    expect(state.snake.length).toBe(3);
    expect(state.food).not.toBeNull();
    expect(state.direction).toBe('RIGHT');
  });

  it('places food on a cell not occupied by the snake', () => {
    const state = createInitialState();
    const occupied = new Set(state.snake.map((p) => `${p.x},${p.y}`));
    expect(state.food).not.toBeNull();
    expect(occupied.has(`${state.food!.x},${state.food!.y}`)).toBe(false);
  });
});

describe('changeDirection', () => {
  it('accepts a valid perpendicular direction', () => {
    const state = createInitialState();
    const newState = changeDirection(state, 'UP');
    expect(newState.pendingDirections).toContain('UP');
  });

  it('rejects direct reverse (180°) direction', () => {
    const state = createInitialState();
    // Initial direction is RIGHT, LEFT is opposite
    const newState = changeDirection(state, 'LEFT');
    expect(newState.pendingDirections.length).toBe(0);
  });

  it('rejects same direction as current (no-op)', () => {
    const state = createInitialState();
    const newState = changeDirection(state, 'RIGHT');
    expect(newState.pendingDirections.length).toBe(0);
  });

  it('does not change direction when game is over', () => {
    const state = { ...createInitialState(), gameState: 'over' as const };
    const newState = changeDirection(state, 'UP');
    expect(newState).toBe(state);
  });

  it('prevents reverse relative to last pending direction', () => {
    const state = createInitialState();
    // Queue UP first
    let s = changeDirection(state, 'UP');
    // Now DOWN is opposite to the last pending (UP) — should be rejected
    s = changeDirection(s, 'DOWN');
    expect(s.pendingDirections).toEqual(['UP']);
  });
});

describe('tick', () => {
  it('moves snake head forward by one cell in current direction', () => {
    const state = createInitialState();
    const initialHead = { ...state.snake[0] };
    const newState = tick(state);
    // Moving RIGHT: x increases by 1
    expect(newState.snake[0].x).toBe(initialHead.x + 1);
    expect(newState.snake[0].y).toBe(initialHead.y);
    expect(newState.snake.length).toBe(state.snake.length);
  });

  it('grows snake and increases score when eating food', () => {
    let state = createInitialState();
    const head = state.snake[0];
    // Place food directly in front of the head (moving RIGHT)
    state = setFoodOverride(state, head.x + 1, head.y);
    const newState = tick(state);
    expect(newState.snake.length).toBe(state.snake.length + 1);
    expect(newState.score).toBe(1);
    expect(newState.food).not.toBeNull();
  });

  it('does not grow snake when not eating food', () => {
    const state = createInitialState();
    // Ensure food is NOT in front of the snake head
    const s: SnakeState = {
      ...state,
      food: { x: 0, y: 0 },
      nextFoodOverride: { x: 0, y: 0 },
    };
    const newState = tick(s);
    expect(newState.snake.length).toBe(s.snake.length);
    expect(newState.score).toBe(0);
  });

  it('ends game on boundary collision (right wall)', () => {
    let state = createInitialState();
    state = {
      ...state,
      snake: [
        { x: GRID_SIZE - 1, y: 10 },
        { x: GRID_SIZE - 2, y: 10 },
      ],
      direction: 'RIGHT',
      pendingDirections: [],
    };
    const newState = tick(state);
    expect(newState.gameState).toBe('over');
  });

  it('ends game on boundary collision (top wall)', () => {
    let state = createInitialState();
    state = {
      ...state,
      snake: [
        { x: 5, y: 0 },
        { x: 4, y: 0 },
      ],
      direction: 'UP',
      pendingDirections: [],
    };
    const newState = tick(state);
    expect(newState.gameState).toBe('over');
  });

  it('ends game on self collision', () => {
    // snake = [(1,0), (0,0), (0,1), (1,1), (2,1)]
    // Moving DOWN: head → (1,1). bodyToCheck = [(1,0),(0,0),(0,1),(1,1)]
    // (1,1) IS in bodyToCheck (index 3) → collision!
    let state = createInitialState();
    state = {
      ...state,
      snake: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      direction: 'DOWN',
      pendingDirections: [],
      food: { x: 5, y: 5 },
      nextFoodOverride: null,
    };
    const newState = tick(state);
    expect(newState.gameState).toBe('over');
  });

  it('allows head to move into the position the tail just vacated', () => {
    // snake = [(1,0), (0,0), (0,1), (1,1)]
    // Moving DOWN: head → (1,1). (1,1) is the tail (index 3).
    // bodyToCheck (not eating) = snake.slice(0,-1) = [(1,0),(0,0),(0,1)]
    // (1,1) is NOT in bodyToCheck → no collision.
    let state = createInitialState();
    state = {
      ...state,
      snake: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      direction: 'DOWN',
      pendingDirections: [],
      food: { x: 5, y: 5 },
      nextFoodOverride: null,
    };
    const newState = tick(state);
    expect(newState.gameState).toBe('running');
    expect(newState.snake.length).toBe(4);
    expect(newState.snake[0]).toEqual({ x: 1, y: 1 });
  });

  it('consumes one pending direction per tick', () => {
    let state = createInitialState();
    state = changeDirection(state, 'UP');
    expect(state.pendingDirections.length).toBe(1);
    const newState = tick(state);
    expect(newState.direction).toBe('UP');
    expect(newState.pendingDirections.length).toBe(0);
    // Head moved UP (y decreased)
    expect(newState.snake[0].y).toBe(state.snake[0].y - 1);
  });

  it('does not tick when game is over', () => {
    const state = { ...createInitialState(), gameState: 'over' as const };
    const newState = tick(state);
    expect(newState).toBe(state);
  });

  it('does not tick when game is won', () => {
    const state = { ...createInitialState(), gameState: 'won' as const };
    const newState = tick(state);
    expect(newState).toBe(state);
  });
});

describe('setFoodOverride', () => {
  it('sets food to the specified position', () => {
    const state = createInitialState();
    const newState = setFoodOverride(state, 5, 7);
    expect(newState.food).toEqual({ x: 5, y: 7 });
    expect(newState.nextFoodOverride).toEqual({ x: 5, y: 7 });
  });

  it('next spawned food uses override when position is free', () => {
    let state = createInitialState();
    const head = state.snake[0]; // (10,10)
    // Set current food in front, override for next spawn at (3,3)
    state = {
      ...state,
      food: { x: head.x + 1, y: head.y },
      nextFoodOverride: { x: 3, y: 3 },
    };
    const newState = tick(state);
    // Should have eaten food at (11,10)
    expect(newState.score).toBe(1);
    // New food should be at (3,3) via override
    expect(newState.food).toEqual({ x: 3, y: 3 });
  });

  it('falls back to random when override position is occupied', () => {
    let state = createInitialState();
    const head = state.snake[0]; // (10,10)
    // Set override at the head's next position — after eating, head moves there
    // so the override cell will be occupied by the new head
    state = {
      ...state,
      food: { x: head.x + 1, y: head.y },
      nextFoodOverride: { x: head.x + 1, y: head.y },
    };
    const newState = tick(state);
    expect(newState.score).toBe(1);
    // Food should NOT be at the override (occupied), should be random but not on snake
    expect(newState.food).not.toBeNull();
    const occupied = new Set(newState.snake.map((p) => `${p.x},${p.y}`));
    expect(occupied.has(`${newState.food!.x},${newState.food!.y}`)).toBe(false);
  });
});

describe('spawnFood', () => {
  it('returns null when grid is full', () => {
    const full: Point[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        full.push({ x, y });
      }
    }
    const state: SnakeState = {
      snake: full,
      direction: 'RIGHT',
      pendingDirections: [],
      food: null,
      score: 0,
      gameState: 'running',
      nextFoodOverride: null,
    };
    expect(spawnFood(state)).toBeNull();
  });
});

describe('getStateSnapshot', () => {
  it('returns a defensive copy of the state', () => {
    const state = createInitialState();
    const snap = getStateSnapshot(state);
    expect(snap.score).toBe(state.score);
    expect(snap.gameState).toBe(state.gameState);
    expect(snap.direction).toBe(state.direction);
    // Verify it's a copy, not a reference
    expect(snap.snake).not.toBe(state.snake);
    expect(snap.snake[0]).not.toBe(state.snake[0]);
  });
});

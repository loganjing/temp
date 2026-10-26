import type { Direction, Point, SnakeState } from './types';
import {
  GRID_SIZE,
  INITIAL_DIRECTION,
  INITIAL_SNAKE,
  OPPOSITE,
  DIRECTION_DELTA,
} from './constants';

function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function spawnFood(state: SnakeState): Point | null {
  const occupied = new Set(state.snake.map((p) => `${p.x},${p.y}`));

  if (state.nextFoodOverride) {
    const pos = state.nextFoodOverride;
    if (!occupied.has(`${pos.x},${pos.y}`)) {
      return { ...pos };
    }
  }

  const empty: Point[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!occupied.has(`${x},${y}`)) {
        empty.push({ x, y });
      }
    }
  }
  if (empty.length === 0) return null;
  return empty[getRandomInt(empty.length)];
}

export function createInitialState(): SnakeState {
  const state: SnakeState = {
    snake: INITIAL_SNAKE.map((p) => ({ ...p })),
    direction: INITIAL_DIRECTION,
    pendingDirections: [],
    food: null,
    score: 0,
    gameState: 'idle',
    nextFoodOverride: null,
  };
  state.food = spawnFood(state);
  state.gameState = 'running';
  return state;
}

export function changeDirection(state: SnakeState, dir: Direction): SnakeState {
  if (state.gameState !== 'running') return state;

  const lastDir =
    state.pendingDirections.length > 0
      ? state.pendingDirections[state.pendingDirections.length - 1]
      : state.direction;

  if (dir === OPPOSITE[lastDir]) return state;
  if (dir === lastDir) return state;
  if (state.pendingDirections.length >= 2) return state;

  return {
    ...state,
    pendingDirections: [...state.pendingDirections, dir],
  };
}

export function tick(state: SnakeState): SnakeState {
  if (state.gameState !== 'running') return state;

  let direction = state.direction;
  let pending = state.pendingDirections;
  if (pending.length > 0) {
    direction = pending[0];
    pending = pending.slice(1);
  }

  const delta = DIRECTION_DELTA[direction];
  const head = state.snake[0];
  const newHead: Point = { x: head.x + delta.x, y: head.y + delta.y };

  if (
    newHead.x < 0 ||
    newHead.x >= GRID_SIZE ||
    newHead.y < 0 ||
    newHead.y >= GRID_SIZE
  ) {
    return { ...state, direction, pendingDirections: pending, gameState: 'over' };
  }

  const ateFood =
    state.food !== null &&
    newHead.x === state.food.x &&
    newHead.y === state.food.y;

  const bodyToCheck = ateFood
    ? state.snake
    : state.snake.slice(0, -1);

  if (bodyToCheck.some((p) => p.x === newHead.x && p.y === newHead.y)) {
    return { ...state, direction, pendingDirections: pending, gameState: 'over' };
  }

  const newSnake = [newHead, ...state.snake];

  if (ateFood) {
    const newScore = state.score + 1;
    if (newSnake.length === GRID_SIZE * GRID_SIZE) {
      return {
        ...state,
        snake: newSnake,
        direction,
        pendingDirections: pending,
        food: null,
        score: newScore,
        gameState: 'won',
      };
    }
    const withNewSnake: SnakeState = {
      ...state,
      snake: newSnake,
      direction,
      pendingDirections: pending,
      score: newScore,
    };
    const newFood = spawnFood(withNewSnake);
    return { ...withNewSnake, food: newFood };
  } else {
    newSnake.pop();
    return {
      ...state,
      snake: newSnake,
      direction,
      pendingDirections: pending,
    };
  }
}

export function setFoodOverride(
  state: SnakeState,
  x: number,
  y: number,
): SnakeState {
  return {
    ...state,
    nextFoodOverride: { x, y },
    food: { x, y },
  };
}

export function getStateSnapshot(state: SnakeState) {
  return {
    snake: state.snake.map((p) => ({ ...p })),
    direction: state.direction,
    food: state.food ? { ...state.food } : null,
    score: state.score,
    gameState: state.gameState,
  };
}

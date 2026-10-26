// ===== Types =====

export type Point = { x: number; y: number };
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export type GameState = 'idle' | 'running' | 'over' | 'won';

export interface SnakeState {
  snake: Point[];
  direction: Direction;
  pendingDirections: Direction[];
  food: Point | null;
  score: number;
  gameState: GameState;
  nextFoodOverride: Point | null;
}

export interface TestControl {
  step: () => void;
  setFood: (x: number, y: number) => void;
  getState: () => {
    snake: Point[];
    direction: Direction;
    food: Point | null;
    score: number;
    gameState: GameState;
  };
}

declare global {
  interface Window {
    __snakeTest?: TestControl;
  }
}

// ===== Constants =====

export const GRID_SIZE = 20;
export const CELL_SIZE = 20;
export const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;
export const TICK_INTERVAL = 150;

const INITIAL_DIRECTION: Direction = 'RIGHT';
const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];

const OPPOSITE: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

const DIRECTION_DELTA: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

// ===== Engine =====

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

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

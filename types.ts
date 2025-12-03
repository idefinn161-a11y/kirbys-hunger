export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

export interface Point {
  x: number;
  y: number;
}

export interface Entity extends Point {
  id: number;
  radius: number;
  vx: number;
  vy: number;
  type: 'food' | 'bomb';
  visual: string;
  rotation: number;
  rotationSpeed: number;
}

export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface FloatingText extends Point {
  text: string;
  life: number;
  color: string;
  vy: number;
}

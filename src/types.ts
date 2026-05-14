export interface Entity {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  type: 'player' | 'bot' | 'food';
  candyType?: 'chocolate' | 'lollipop' | 'soda' | 'gum' | 'sweet' | 'rabbit' | 'cookie' | 'red_lollipop';
  name?: string;
  targetX?: number;
  targetY?: number;
}

export interface GameState {
  player: Entity;
  entities: Entity[];
  worldSize: number;
}

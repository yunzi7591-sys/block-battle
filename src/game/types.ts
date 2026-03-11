export type Cell = string | 0; // 0 = empty, string = color
export type Board = Cell[][];

export type BlockShape = {
    id: string; // for easier debugging
    cells: [number, number][]; // [rowOffset, colOffset][]
    color: string;
};

export interface GameState {
    board: Board;
    score: number;
    comboCount: number;
    currentBlocks: (BlockShape | null)[];
    placedFlags: boolean[];
    isGameOver: boolean;
    movesSinceLastClear: number;
    isPerfectBonusTime: boolean;
    perfectClearCount: number;
    hospitalityEndTarget: number;
}

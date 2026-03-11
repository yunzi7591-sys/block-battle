import { BlockShape } from './types';

// 1. 単体 (Dot): 1x1 (1種)
export const Dot: BlockShape = { id: 'Dot', cells: [[0, 0]], color: '#FFD700' };

// 2. 直線 (Line): 長さ2, 3, 4, 5の縦・横 (8種)
export const Line2H: BlockShape = { id: 'Line2H', cells: [[0, 0], [0, 1]], color: '#00FFFF' };
export const Line2V: BlockShape = { id: 'Line2V', cells: [[0, 0], [1, 0]], color: '#00FFFF' };

export const Line3H: BlockShape = { id: 'Line3H', cells: [[0, 0], [0, 1], [0, 2]], color: '#00FFFF' };
export const Line3V: BlockShape = { id: 'Line3V', cells: [[0, 0], [1, 0], [2, 0]], color: '#00FFFF' };

export const Line4H: BlockShape = { id: 'Line4H', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], color: '#00FFFF' };
export const Line4V: BlockShape = { id: 'Line4V', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: '#00FFFF' };

export const Line5H: BlockShape = { id: 'Line5H', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], color: '#00FFFF' };
export const Line5V: BlockShape = { id: 'Line5V', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], color: '#00FFFF' };

// 3. 正方形 (Square): 2x2, 3x3 (2種)
export const Square2x2: BlockShape = {
    id: 'Square2x2',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1]], color: '#FF00FF'
};
export const Square3x3: BlockShape = {
    id: 'Square3x3',
    cells: [
        [0, 0], [0, 1], [0, 2],
        [1, 0], [1, 1], [1, 2],
        [2, 0], [2, 1], [2, 2],
    ], color: '#FF00FF'
};

// 4. L字 小: 2x2サイズのL字（4方向 = 4種）
export const SmallL_BR: BlockShape = { id: 'SmallL_BR', cells: [[0, 0], [1, 0], [1, 1]], color: '#FF4500' }; // 右下に出っ張り
export const SmallL_BL: BlockShape = { id: 'SmallL_BL', cells: [[0, 1], [1, 0], [1, 1]], color: '#FF4500' }; // 左下
export const SmallL_TR: BlockShape = { id: 'SmallL_TR', cells: [[0, 0], [0, 1], [1, 0]], color: '#FF4500' }; // 右上
export const SmallL_TL: BlockShape = { id: 'SmallL_TL', cells: [[0, 0], [0, 1], [1, 1]], color: '#FF4500' }; // 左上

// 5. L字 大: 3x3サイズのL字（4方向 = 4種）
export const BigL_BR: BlockShape = {
    id: 'BigL_BR',
    cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], color: '#FF1493'
};
export const BigL_BL: BlockShape = {
    id: 'BigL_BL',
    cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], color: '#FF1493'
};
export const BigL_TR: BlockShape = {
    id: 'BigL_TR',
    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], color: '#FF1493'
};
export const BigL_TL: BlockShape = {
    id: 'BigL_TL',
    cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], color: '#FF1493'
};

// 6. T字: （上下左右4方向 = 4種）
export const T_Up: BlockShape = {
    id: 'T_Up',
    cells: [[0, 0], [0, 1], [0, 2], [1, 1]], color: '#8A2BE2'
};
export const T_Down: BlockShape = {
    id: 'T_Down',
    cells: [[0, 1], [1, 0], [1, 1], [1, 2]], color: '#8A2BE2'
};
export const T_Left: BlockShape = {
    id: 'T_Left',
    cells: [[0, 1], [1, 0], [1, 1], [2, 1]], color: '#8A2BE2'
};
export const T_Right: BlockShape = {
    id: 'T_Right',
    cells: [[0, 0], [1, 0], [1, 1], [2, 0]], color: '#8A2BE2'
};

// 7. S字・Z字: （縦・横それぞれ = 計4種）
export const S_H: BlockShape = {
    id: 'S_H',
    cells: [[0, 1], [0, 2], [1, 0], [1, 1]], color: '#32CD32'
};
export const S_V: BlockShape = {
    id: 'S_V',
    cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#32CD32'
};
export const Z_H: BlockShape = {
    id: 'Z_H',
    cells: [[0, 0], [0, 1], [1, 1], [1, 2]], color: '#32CD32'
};
export const Z_V: BlockShape = {
    id: 'Z_V',
    cells: [[0, 1], [1, 0], [1, 1], [2, 0]], color: '#32CD32'
};

// 8. 斜め2マス: 角で接する配置（右下がり、左下がりの2種）
export const Diag2_DownRight: BlockShape = {
    id: 'Diag2_DownRight',
    cells: [[0, 0], [1, 1]], color: '#1E90FF'
};
export const Diag2_DownLeft: BlockShape = {
    id: 'Diag2_DownLeft',
    cells: [[0, 1], [1, 0]], color: '#1E90FF'
};

// 9. 斜め3マス: 角で接する配置（右下がり、左下がりの2種）
export const Diag3_DownRight: BlockShape = {
    id: 'Diag3_DownRight',
    cells: [[0, 0], [1, 1], [2, 2]], color: '#1E90FF'
};
export const Diag3_DownLeft: BlockShape = {
    id: 'Diag3_DownLeft',
    cells: [[0, 2], [1, 1], [2, 0]], color: '#1E90FF'
};

// 10. 長方形 (Rectangle): 2x3, 3x2 (計2種)
export const Rect2x3: BlockShape = {
    id: 'Rect2x3',
    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], color: '#FFD700'
};
export const Rect3x2: BlockShape = {
    id: 'Rect3x2',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]], color: '#FFD700'
};

// 全ブロック型のリスト
export const ALL_BLOCKS: BlockShape[] = [
    Dot,
    Line2H, Line2V, Line3H, Line3V, Line4H, Line4V, Line5H, Line5V,
    Square2x2, Square3x3,
    SmallL_BR, SmallL_BL, SmallL_TR, SmallL_TL,
    BigL_BR, BigL_BL, BigL_TR, BigL_TL,
    T_Up, T_Down, T_Left, T_Right,
    S_H, S_V, Z_H, Z_V,
    Diag2_DownRight, Diag2_DownLeft,
    Diag3_DownRight, Diag3_DownLeft,
    Rect2x3, Rect3x2,
];

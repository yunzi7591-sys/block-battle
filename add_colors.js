const fs = require('fs');

const path = 'src/game/blocks.ts';
let code = fs.readFileSync(path, 'utf8');

const colors = {
    Dot: '#FFD700', // Gold
    Line: '#00FFFF', // Cyan
    Square: '#FF00FF', // Magenta
    SmallL: '#FF4500', // OrangeRed
    BigL: '#FF1493', // DeepPink
    T_: '#8A2BE2', // BlueViolet
    S_: '#32CD32', // LimeGreen
    Z_: '#32CD32', // LimeGreen
    Diag: '#1E90FF', // DodgerBlue
};

function getColorForId(id) {
    for (const [key, val] of Object.entries(colors)) {
        if (id.startsWith(key)) return val;
    }
    return '#FFFFFF';
}

code = code.replace(/export const ([A-Za-z0-9_]+): BlockShape = {([\s\S]*?)};/g, (match, id, inner) => {
    // Check if color already exists
    if (inner.includes('color:')) return match;

    // For multiline blocks like Square3x3, the inner content might have a trailing comma
    const color = getColorForId(id);
    return `export const ${id}: BlockShape = {${inner.replace(/,\s*$/, '')}, color: '${color}' };`;
});

fs.writeFileSync(path, code);
console.log('Colors added to blocks.ts');

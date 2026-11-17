// First-party standalone QR code generator (QR version 6-L), no third-party calls.
function polarisQrMatrix(text){
const data=typeof TextEncoder==='undefined'?Uint8Array.from(text,c=>c.charCodeAt(0)):new TextEncoder().encode(text);
if(data.length>133)throw Error('Sign-in URL too long for QR rendering');
const bits=[];const append=(value,length)=>{for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1)};
append(4,4);append(data.length,8);for(const b of data)append(b,8);
append(0,Math.min(4,1088-bits.length));while(bits.length%8)bits.push(0);
const bytes=[];for(let i=0;i<bits.length;i+=8){let n=0;for(let j=0;j<8;j++)n=(n<<1)|bits[i+j];bytes.push(n)}
while(bytes.length<136)bytes.push(bytes.length%2===0?0xec:0x11);
const mul=(a,b)=>{let n=0;for(let i=7;i>=0;i--){n=(n<<1)^((n>>>7)*0x11d);n^=((-((b>>>i)&1))&a)}return n&255};
const divisor=new Uint8Array(18);divisor[17]=1;let root=1;
for(let i=0;i<18;i++){for(let j=0;j<18;j++){divisor[j]=mul(divisor[j],root);if(j+1<18)divisor[j]^=divisor[j+1]}root=mul(root,2)}
const blocks=[];
for(let k=0;k<2;k++){const block=bytes.slice(k*68,k*68+68),rem=new Uint8Array(18);
for(const b of block){const factor=b^rem[0];rem.copyWithin(0,1);rem[17]=0;for(let i=0;i<18;i++)rem[i]^=mul(divisor[i],factor)}blocks.push({block,rem})}
const all=[];for(let i=0;i<68;i++)for(const b of blocks)all.push(b.block[i]);for(let i=0;i<18;i++)for(const b of blocks)all.push(b.rem[i]);
const size=41,grid=Array.from({length:size},()=>Array(size).fill(false)),fn=Array.from({length:size},()=>Array(size).fill(false));
const set=(x,y,dark)=>{if(x>=0&&x<size&&y>=0&&y<size){grid[y][x]=!!dark;fn[y][x]=true}};
const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const dist=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,dist!==2&&dist!==4)}};
finder(3,3);finder(size-4,3);finder(3,size-4);
for(let i=8;i<size-8;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(34+dx,34+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
let fmt=8,rem=fmt;for(let i=0;i<10;i++)rem=(rem<<1)^(((rem>>>9)&1)*0x537);fmt=((fmt<<10)|rem)^0x5412;
for(let i=0;i<=5;i++)set(8,i,(fmt>>>i)&1);
set(8,7,(fmt>>>6)&1);set(8,8,(fmt>>>7)&1);set(7,8,(fmt>>>8)&1);
for(let i=9;i<15;i++)set(14-i,8,(fmt>>>i)&1);
for(let i=0;i<8;i++)set(size-1-i,8,(fmt>>>i)&1);
for(let i=8;i<15;i++)set(8,size-15+i,(fmt>>>i)&1);
set(8,size-8,true);
let idx=0;for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++){const y=((right+1)&2)===0?size-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(fn[y][x])continue;const bit=idx<all.length*8?((all[idx>>>3]>>>(7-(idx&7)))&1):0;grid[y][x]=Boolean(bit^((x+y)%2===0));idx++}}}
return grid;
}
function polarisQrSvg(text){const matrix=polarisQrMatrix(text),n=matrix.length,rects=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(matrix[y][x])rects.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');return '<svg viewBox="0 0 '+(n+8)+' '+(n+8)+'" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="'+rects.join('')+'"/></svg>'}

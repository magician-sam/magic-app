export type FestiveRect={left:number;top:number;right:number;bottom:number;weight?:number};
export function festivePosition(width:number,height:number,spriteWidth:number,spriteHeight:number,protectedAreas:FestiveRect[],previous?:{x:number;y:number},random:()=>number=Math.random,readingAreas:FestiveRect[]=[],varyRegions=false){
  const minX=10,maxX=width-spriteWidth-10,minY=varyRegions?10:90,maxY=height-spriteHeight-(varyRegions?10:90);
  if(maxX<minX||maxY<minY)return null;
  const candidates:Array<{x:number;y:number;score:number}>=[];
  for(let row=0;row<8;row++)for(let col=0;col<7;col++){
    const x=minX+(maxX-minX)*col/6,y=minY+(maxY-minY)*row/7;
    if(previous&&Math.hypot(x-previous.x,y-previous.y)<Math.min(width*.25,120))continue;
    if(protectedAreas.some(r=>x<r.right+6&&x+spriteWidth>r.left-6&&y<r.bottom+6&&y+spriteHeight>r.top-6))continue;
    const score=readingAreas.reduce((sum,r)=>sum+Math.max(0,Math.min(x+spriteWidth,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+spriteHeight,r.bottom)-Math.max(y,r.top))*(r.weight??1),0);
    candidates.push({x:Math.round(x),y:Math.round(y),score});
  }
  // On phones, choosing only the global lowest text-overlap score repeatedly
  // picked the same central gap. Vary the safe screen region first, then
  // favour less text overlap without locking every appearance to one height.
  let pool=candidates;
  if(varyRegions&&pool.length){
    const region=(point:{x:number;y:number})=>Math.min(2,Math.floor((point.x+spriteWidth/2)/width*3))+','+Math.min(2,Math.floor((point.y+spriteHeight/2)/height*3));
    const groups=new Map<string,typeof candidates>();
    for(const candidate of pool){const key=region(candidate);groups.set(key,[...(groups.get(key)??[]),candidate]);}
    const alternatives=[...groups.entries()].filter(([key])=>!previous||key!==region(previous));
    const choices=alternatives.length?alternatives:[...groups.entries()];
    pool=choices[Math.min(choices.length-1,Math.floor(Math.max(0,random())*choices.length))][1];
    const weights=pool.map(point=>1/(1+point.score/(spriteWidth*spriteHeight)));
    let choice=Math.max(0,Math.min(1,random()))*weights.reduce((sum,weight)=>sum+weight,0);
    for(let i=0;i<pool.length;i++){choice-=weights[i];if(choice<=0||i===pool.length-1)return{x:pool[i].x,y:pool[i].y};}
  }
  const best=Math.min(...pool.map(c=>c.score)),clear=pool.filter(c=>c.score<=best+.01);
  if(!clear.length)return null;
  const {x,y}=clear[Math.min(clear.length-1,Math.floor(Math.max(0,random())*clear.length))];return{x,y};
}

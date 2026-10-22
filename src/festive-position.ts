export type FestiveRect={left:number;top:number;right:number;bottom:number;weight?:number};
export function festivePosition(width:number,height:number,spriteWidth:number,spriteHeight:number,protectedAreas:FestiveRect[],previous?:{x:number;y:number},random:()=>number=Math.random,readingAreas:FestiveRect[]=[]){
  const minX=10,maxX=width-spriteWidth-10,minY=90,maxY=height-spriteHeight-90;
  if(maxX<minX||maxY<minY)return null;
  const candidates:Array<{x:number;y:number;score:number}>=[];
  for(let row=0;row<8;row++)for(let col=0;col<7;col++){
    const x=minX+(maxX-minX)*col/6,y=minY+(maxY-minY)*row/7;
    if(previous&&Math.hypot(x-previous.x,y-previous.y)<Math.min(width*.25,120))continue;
    if(protectedAreas.some(r=>x<r.right+6&&x+spriteWidth>r.left-6&&y<r.bottom+6&&y+spriteHeight>r.top-6))continue;
    const score=readingAreas.reduce((sum,r)=>sum+Math.max(0,Math.min(x+spriteWidth,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+spriteHeight,r.bottom)-Math.max(y,r.top))*(r.weight??1),0);
    candidates.push({x:Math.round(x),y:Math.round(y),score});
  }
  const best=Math.min(...candidates.map(c=>c.score)),clear=candidates.filter(c=>c.score<=best+.01);
  if(!clear.length)return null;
  const {x,y}=clear[Math.min(clear.length-1,Math.floor(Math.max(0,random())*clear.length))];return{x,y};
}

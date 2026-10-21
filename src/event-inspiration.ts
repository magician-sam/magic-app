import {z} from 'zod';
function boundedJpeg(bytes:Buffer){
  let position=2,hasFrame=false;
  while(position<bytes.length-2){
    if(bytes[position++]!==255)return false;
    while(bytes[position]===255)position++;
    const marker=bytes[position++];
    if(marker===0xd9||marker===undefined)return false;
    if(position+2>bytes.length)return false;
    const length=bytes.readUInt16BE(position);
    if(length<2||position+length>bytes.length)return false;
    if(marker===0xc0||marker===0xc2){
      if(length<8)return false;
      const height=bytes.readUInt16BE(position+3),width=bytes.readUInt16BE(position+5);
      if(!width||!height||width>1600||height>1600)return false;
      hasFrame=true;
    }
    if(marker===0xda)return hasFrame;
    position+=length;
  }
  return false;
}
/** Private reference images only; never published to the portfolio or a CDN. */
export const inspirationPhotoSchema=z.object({mime:z.literal('image/jpeg'),data:z.string().min(1).max(400000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict().refine(value=>{
  const bytes=Buffer.from(value.data,'base64');
  return bytes.length<=300000&&bytes.length>=4&&bytes.toString('base64')===value.data&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217&&boundedJpeg(bytes);
},'Choose a JPEG reference photo under 300 KB after resizing.');
export type InspirationPhoto=z.infer<typeof inspirationPhotoSchema>;

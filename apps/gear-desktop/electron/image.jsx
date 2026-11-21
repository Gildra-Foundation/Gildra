import React from 'react';
export default function Image({fill,priority,unoptimized,quality,loader,placeholder,blurDataURL,...p}){
  return <img {...p} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',...p.style}:p.style}/>;
}

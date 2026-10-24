import test from 'node:test';
import assert from 'node:assert/strict';
import {epigraphTiming,inkDuration} from '../../components/platform/home/epigraphTiming.ts';

const gap=(text,letter)=>{const t=epigraphTiming(text),letters=Array.from(text),i=letters.indexOf(letter);return t.delays[i]-t.delays[i-1]};
test('commas pause the pen, sentences pause longer, in Russian and English',()=>{
  for(const [a,b,c] of [['А, б','А. б','А! б'],['A, b','A. b','A! b']]){
    const last=Array.from(a).at(-1);assert(gap(a,last)>=420);assert(gap(b,last)>gap(a,last)+300);assert(gap(c,last)>gap(b,last)+100);
  }
});
test('closing quotes arrive with punctuation; the pause precedes the next thought',()=>{
  const text='«Да.» Потом',t=epigraphTiming(text),letters=Array.from(text);assert(t.delays[letters.indexOf('»')]-t.delays[letters.indexOf('.')]<100);
  assert(gap(text,'П')>=1600);
});
test('punctuation clusters and ellipsis use one thoughtful pause',()=>{
  assert(gap('Да?! А','А')>=1800);assert(gap('Да?! А','А')<2000);
  assert(gap('Да... А','А')>=2200);assert(gap('Да... А','А')<2400);
  assert(gap('Да… А','А')>=2200);
});
test('Unicode characters keep a monotonic stable timeline and a complete final stroke',()=>{
  for(const text of ['Я 🧊 пишу, значит, помню.','I write; I remember.']){
    const a=epigraphTiming(text);assert.equal(a.delays.length,Array.from(text).length);assert.deepEqual(a,epigraphTiming(text));assert(a.delays.every((x,i)=>i===0||x>a.delays[i-1]));assert.equal(a.finish,a.delays.at(-1)+inkDuration);assert.equal(a.pauseAfter,1600);
  }
});
test('signature starts after the full quote and its final sentence pause',()=>{
  const quote=epigraphTiming('Это моя история!'),start=quote.finish+Math.max(800,quote.pauseAfter),author=epigraphTiming('Артас Менетил',start);assert.equal(author.delays[0],start);assert(start>=quote.finish+1800);assert(author.finish>start);
});

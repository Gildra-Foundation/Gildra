// Adapted from the supplied HomeBook, OpenBook and PhoneBook components.
const $ = selector => document.querySelector(selector);
const intro=$('#intro'), reader=$('#reader'), book=$('.book'), artwork=$('.book-artwork');
const viewport=$('.book-viewport'), story=$('#story'), cover=$('#openBook'), dialog=$('#phoneBook');
const closeButton=$('#closeBook'), readerHome=reader.parentNode;
const holdButton=$('#holdBook'), heldDialog=$('#heldBook');
const libraryDialog=$('#libraryReading'), libraryMode=Boolean(libraryDialog);
const en=document.documentElement.lang==='en';
const closeLabel=en?'Return to shelf':'Вернуть на полку';
if(en){holdButton.textContent='Pick up the book';$('#phoneContents').textContent='Contents';$('#phoneStory').textContent='Read';$('#prev').setAttribute('aria-label','Previous chapter');$('#next').setAttribute('aria-label','Next chapter');$('#showContents').setAttribute('aria-label','Open contents');dialog.setAttribute('aria-label','Anduin Wrynn: story in Russian');heldDialog.setAttribute('aria-label','Reading the book');reader.setAttribute('aria-label','Anduin Wrynn: story in Russian');}
closeButton.textContent=closeLabel;
let liftBusy=false;
const chapters=[...document.querySelectorAll('.chapter')], links=[...document.querySelectorAll('.chapter-link')];
const tabs=[$('#phoneContents'),$('#phoneStory')];
const phoneQuery=matchMedia('(max-width:820px)'), reduced={get matches(){return window.libraryReducedMotion()}};
let current=0, phase='closed', phoneMode=false, loading=false, running=[], timers=[], finishMotion=null, savedOverflow='', phonePage=0;
const motion=document.createElement('div');
motion.className='leaf-motion'; motion.hidden=true; motion.setAttribute('aria-hidden','true');
motion.innerHTML='<div class="turning-leaf"><div class="leaf-front"><div class="motion-cover"></div><span class="leaf-shade"></span></div><div class="leaf-back"><span class="leaf-shade"></span></div></div>';
book.append(motion);
const leaf=motion.firstElementChild, frontShade=leaf.querySelector('.leaf-front .leaf-shade'), backShade=leaf.querySelector('.leaf-back .leaf-shade');
const face=leaf.querySelector('.motion-cover'); face.innerHTML=cover.innerHTML;
if(libraryMode){const print=cover.querySelector('.cover-print').cloneNode(true);print.setAttribute('preserveAspectRatio','none');face.replaceChildren(print);}
const turningTome=face.querySelector('.shelf-tome');
const pages=[book.querySelector('.left-page'),book.querySelector('.right-page')], decoded=new Map();
for(let i=0;i<2;i++){const snap=document.createElement('span');snap.className='page-snap';snap.setAttribute('aria-hidden','true');snap.style.left=`${i*50}%`;book.append(snap);}
function warmBook(){
  return Promise.all([artwork.getAttribute('src'),(cover.querySelector('img')?.getAttribute('src')||cover.querySelector('image')?.getAttribute('href'))].map(src=>{
    if(!decoded.has(src)){const image=new Image();image.src=src;decoded.set(src,image.decode().catch(()=>{}));}
    return decoded.get(src);
  }));
}
function setPhase(value){phase=value;document.body.dataset.bookState=value;cover.setAttribute('aria-expanded',String(value!=='closed'));reader.inert=!['open','held'].includes(value);}
// Compose the actual cover tilt, rather than estimating it from a bounding box.
function coverPose(){
  if(libraryMode){
    const model=cover.querySelector('.shelf-tome'), rect=cover.getBoundingClientRect();
    const size=getComputedStyle(model), width=parseFloat(size.width), height=parseFloat(size.height);
    return {x:rect.left+rect.width/2-width/2,y:rect.top,width,height,visual:new DOMMatrix()};
  }
  const parent=cover.offsetParent, rect=parent.getBoundingClientRect(), style=getComputedStyle(cover);
  const [ox,oy]=style.transformOrigin.split(' ').map(parseFloat);
  const x=rect.left+parent.clientLeft+cover.offsetLeft, y=rect.top+parent.clientTop+cover.offsetTop;
  const tilt=new DOMMatrix(style.transform==='none'?undefined:style.transform);
  return {x,y,width:cover.offsetWidth,height:cover.offsetHeight,visual:new DOMMatrix().translate(x+ox,y+oy).multiply(tilt).translate(-x-ox,-y-oy)};
}
function fromCover(pose,rect){const scale=pose.height/rect.height;return new DOMMatrix().translate(-rect.left,-rect.top).multiply(pose.visual).translate(pose.x-scale*rect.width/2,pose.y).scale(scale).toString();}
function shelfPull(pose,rect,base){
  const cx=pose.x+pose.width/2-rect.left, cy=pose.y+pose.height/2-rect.top;
  return new DOMMatrix().translate(cx,cy-42).scale(1.16).translate(-cx,-cy).multiply(new DOMMatrix(base)).toString();
}
function fitLeaf(pose){if(libraryMode){face.style.width='100%';face.style.height='100%';face.style.transform='none';return;}face.style.width=`${pose.width}px`;face.style.height=`${pose.height}px`;face.style.transform=`scale(${book.getBoundingClientRect().height/pose.height})`;}
function play(element,frames,options){const animation=element.animate(frames,{fill:'both',...options});running.push(animation);return animation;}
function clearMotion(){window.libraryJourney?.cleanup();running.forEach(a=>a.cancel());running=[];timers.forEach(clearTimeout);timers=[];artwork.style.clipPath='';motion.hidden=true;viewport.classList.remove('moving');finishMotion=null;}
function finishOpen(){clearMotion();setPhase('open');if(phoneMode){viewport.scrollLeft=0;updatePhonePage();links[current].focus({preventScroll:true});}else story.focus({preventScroll:true});}
function finishClosed(){clearMotion();if(dialog.open)dialog.close();if(heldDialog.open)heldDialog.close();if(libraryDialog?.open)libraryDialog.close();readerHome.append(reader);document.body.style.overflow=savedOverflow;reader.hidden=true;intro.hidden=false;setPhase('closed');if(!libraryMode||window.libraryJourney?.keyboardOpened)cover.focus({preventScroll:true});}
function waitMotion(finish){finishMotion=finish;Promise.all(running.map(a=>a.finished)).then(()=>{if(finishMotion===finish)finish();}).catch(()=>{});}
async function openBook(){
  if(libraryMode)return window.libraryJourney?.open();
  if(phase!=='closed'||loading)return;
  loading=true;cover.setAttribute('aria-busy','true');
  await Promise.race([warmBook(),new Promise(resolve=>setTimeout(resolve,400))]);
  const readingScroll={left:window.scrollX,top:window.scrollY,behavior:'instant'};
  const pose=coverPose();phoneMode=phoneQuery.matches;savedOverflow=document.body.style.overflow;
  reader.hidden=false;
  if(phoneMode){dialog.append(reader);dialog.showModal();document.body.style.overflow='hidden';}else if(libraryMode){libraryDialog.showModal();document.body.style.overflow='hidden';}else intro.hidden=true;
  if(libraryMode)window.scrollTo(readingScroll);
  setPhase('opening');loading=false;cover.removeAttribute('aria-busy');viewport.scrollLeft=0;
  if(reduced.matches){finishOpen();return;}
  motion.hidden=false;viewport.classList.add('moving');
  const rect=book.getBoundingClientRect(), start=fromCover(pose,rect);fitLeaf(pose);
  const glide=libraryMode?1420:(phoneMode?620:720), delay=libraryMode?1280:(phoneMode?340:360), swing=phoneMode?1000:1100, opened=delay+swing;
  const ease='cubic-bezier(.42,0,.18,1)';
  if(libraryMode){
    const pulled=shelfPull(pose,rect,start);
    const pan=phoneMode?`translateX(${-rect.width/2}px)`:'none';
    const frames=[
      {transform:start,easing:'cubic-bezier(.2,.6,.25,1)'},
      {transform:pulled,offset:360/opened},
      {transform:pulled,offset:980/opened,easing:'cubic-bezier(.4,0,.2,1)'},
      {transform:pan,offset:glide/opened}
    ];
    if(phoneMode)frames.push({transform:pan,offset:(delay+swing*.3)/opened,easing:ease});
    frames.push({transform:'none'});
    play(book,frames,{duration:opened});
    play(turningTome,[
      {transform:'rotateY(90deg)'},
      {transform:'rotateY(90deg)',offset:360/opened,easing:'cubic-bezier(.4,0,.2,1)'},
      {transform:'rotateY(0deg)',offset:980/opened},
      {transform:'rotateY(0deg)'}
    ],{duration:opened});
  }
  else if(phoneMode){const pan=`translateX(${-rect.width/2}px)`;play(book,[{transform:start,easing:'cubic-bezier(.4,0,.2,1)'},{transform:pan,offset:glide/opened},{transform:pan,offset:(delay+swing*.3)/opened,easing:ease},{transform:'none'}],{duration:opened});}
  else play(book,[{transform:start},{transform:'none'}],{duration:glide,easing:'cubic-bezier(.4,0,.2,1)'});
  play(leaf,[{transform:'rotateY(0deg)'},{transform:'rotateY(0deg)',offset:delay/opened,easing:ease},{transform:'rotateY(-180deg)'}],{duration:opened});
  artwork.style.clipPath='inset(0 0 0 50%)';
  timers.push(setTimeout(()=>{artwork.style.clipPath='';},opened));
  play(artwork,[{opacity:0},{opacity:0,offset:delay/opened},{opacity:1,offset:(delay+300)/opened},{opacity:1}],{duration:opened});
  play(pages[1],[{opacity:0},{opacity:0,offset:(delay+60)/opened},{opacity:1,offset:(delay+460)/opened},{opacity:1}],{duration:opened});
  play(pages[0],[{opacity:0},{opacity:0,offset:opened/(opened+320)},{opacity:1}],{duration:opened+320});
  play(frontShade,[{opacity:0},{opacity:0,offset:delay/opened},{opacity:.55,offset:(delay+swing/2)/opened},{opacity:.55}],{duration:opened});
  play(backShade,[{opacity:.55},{opacity:.55,offset:(delay+swing/2)/opened},{opacity:0}],{duration:opened});
  play(motion,[{opacity:1},{opacity:1,offset:.999},{opacity:0}],{duration:opened});
  [closeButton,holdButton,...tabs].forEach(part=>play(part,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:360,delay:opened-180}));
  waitMotion(finishOpen);
}
function closeBook(){
  if(phase==='held'){releaseBook();return;}
  if(phase!=='open')return;
  if(libraryMode)return window.libraryJourney?.close();
  setPhase('closing');if(reduced.matches){finishClosed();return;}
  // Read the destination in its real layout, then restore the spread in this same frame.
  reader.hidden=true;intro.hidden=false;const pose=coverPose();reader.hidden=false;if(!phoneMode&&!libraryMode)intro.hidden=true;
  const from=viewport.scrollLeft;viewport.scrollLeft=0;viewport.classList.add('moving');motion.hidden=false;fitLeaf(pose);
  const rect=book.getBoundingClientRect(), target=fromCover(pose,rect);
  const swing=phoneMode?1000:1100, fade=180, shut=fade+swing, total=shut+(libraryMode?1400:520), ease='cubic-bezier(.42,0,.18,1)';
  play(pages[0],[{opacity:1},{opacity:0}],{duration:fade});
  play(leaf,[{transform:'rotateY(-180deg)'},{transform:'rotateY(-180deg)',offset:fade/total,easing:ease},{transform:'rotateY(0deg)',offset:shut/total},{transform:'rotateY(0deg)'}],{duration:total});
  play(motion,[{opacity:0},{opacity:0,offset:(fade-1)/total},{opacity:1,offset:fade/total},{opacity:1}],{duration:total});
  timers.push(setTimeout(()=>{artwork.style.clipPath='inset(0 0 0 50%)';},fade));
  play(frontShade,[{opacity:.55},{opacity:.55,offset:(fade+swing/2)/total},{opacity:0,offset:shut/total},{opacity:0}],{duration:total});
  play(backShade,[{opacity:0},{opacity:0,offset:fade/total},{opacity:.55,offset:(fade+swing/2)/total},{opacity:.55}],{duration:total});
  play(artwork,[{opacity:1},{opacity:1,offset:(shut-160)/total},{opacity:0,offset:(shut+80)/total},{opacity:0}],{duration:total});
  play(pages[1],[{opacity:1},{opacity:1,offset:(shut-260)/total},{opacity:0,offset:shut/total},{opacity:0}],{duration:total});
  if(libraryMode){
    const pulled=shelfPull(pose,rect,target);
    const pan=phoneMode?`translateX(${-rect.width/2}px)`:'none';
    const frames=[
      {transform:phoneMode?`translateX(${-from}px)`:'none'},
      {transform:pan,offset:shut/total,easing:'cubic-bezier(.4,0,.2,1)'},
      {transform:pulled,offset:(shut+620)/total},
      {transform:pulled,offset:(shut+1120)/total,easing:'cubic-bezier(.2,.6,.25,1)'},
      {transform:target}
    ];
    play(book,frames,{duration:total});
    play(turningTome,[
      {transform:'rotateY(0deg)'},
      {transform:'rotateY(0deg)',offset:(shut+620)/total,easing:'cubic-bezier(.4,0,.2,1)'},
      {transform:'rotateY(90deg)',offset:(shut+1120)/total},
      {transform:'rotateY(90deg)'}
    ],{duration:total});
  }
  else if(phoneMode)play(book,[{transform:`translateX(${-from}px)`},{transform:`translateX(${-from}px)`,offset:fade/total},{transform:`translateX(${-rect.width/2}px)`,offset:(shut-180)/total,easing:'cubic-bezier(.4,0,.2,1)'},{transform:target}],{duration:total});
  else play(book,[{transform:'none'},{transform:'none',offset:(shut-180)/total,easing:'cubic-bezier(.4,0,.2,1)'},{transform:target}],{duration:total});
  [closeButton,holdButton,...tabs].forEach(part=>play(part,[{opacity:1},{opacity:0}],{duration:fade}));
  waitMotion(finishClosed);
}
function liftTransform(from,to){return `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width})`;}
function liftBook(){
  if(phase!=='open'||phoneMode||liftBusy)return;
  const from=book.getBoundingClientRect();
  heldDialog.append(reader);heldDialog.showModal();document.body.style.overflow='hidden';
  setPhase('held');closeButton.textContent=en?'Put down the book':'Положить книгу';
  if(!reduced.matches){liftBusy=true;const a=book.animate([{transform:liftTransform(from,book.getBoundingClientRect())},{transform:'none'}],{duration:560,easing:'cubic-bezier(.4,0,.2,1)'});a.finished.finally(()=>{liftBusy=false;}).catch(()=>{});}
  story.focus({preventScroll:true});
}
function releaseBook(){
  if(phase!=='held'||liftBusy)return;
  const from=book.getBoundingClientRect();
  readerHome.append(reader);heldDialog.close();document.body.style.overflow=libraryMode?'hidden':savedOverflow;
  closeButton.textContent=closeLabel;setPhase('open');
  if(!reduced.matches){liftBusy=true;const a=book.animate([{transform:liftTransform(from,book.getBoundingClientRect())},{transform:'none'}],{duration:460,easing:'cubic-bezier(.4,0,.2,1)'});a.finished.finally(()=>{liftBusy=false;}).catch(()=>{});}
  holdButton.focus({preventScroll:true});
}
function updatePhonePage(){phonePage=viewport.scrollLeft>viewport.clientWidth/2?1:0;tabs.forEach((tab,i)=>tab.setAttribute('aria-current',i===phonePage?'page':'false'));}
function turnTo(index){if(phase==='open')viewport.scrollTo({left:index*viewport.clientWidth,behavior:reduced.matches?'instant':'smooth'});}
function selectChapter(index,focus=true){
  current=Math.max(0,Math.min(chapters.length-1,index));chapters.forEach((c,i)=>c.hidden=i!==current);links.forEach((a,i)=>a.setAttribute('aria-current',i===current?'page':'false'));story.scrollTop=0;
  $('#prev').disabled=current===0;$('#next').disabled=current===chapters.length-1;$('#counter').textContent=current===0?(en?'Preface':'Предисловие'):(en?`Chapter ${current} of ${chapters.length-1}`:`Глава ${current} из ${chapters.length-1}`);$('#chapterLabel').textContent=links[current].querySelector('span:last-child').textContent;
  if(!focus)return;if(phoneMode)turnTo(1);story.focus({preventScroll:true});
  if(!reduced.matches)story.animate([{opacity:.3,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
}
cover.onclick=openBook;closeButton.onclick=closeBook;holdButton.onclick=liftBook;
$('#showContents').onclick=()=>turnTo(0);tabs.forEach((tab,i)=>tab.onclick=()=>turnTo(i));links.forEach((a,i)=>a.onclick=()=>selectChapter(i));$('#prev').onclick=()=>selectChapter(current-1);$('#next').onclick=()=>selectChapter(current+1);
// The brand returns to the library; the close button returns to this cover.
viewport.addEventListener('scroll',updatePhonePage,{passive:true});
libraryDialog?.addEventListener('cancel',event=>{event.preventDefault();if(!['open','held','closed'].includes(phase)&&finishMotion)finishMotion();closeBook();});
window.addEventListener('library:open',openBook);
dialog.addEventListener('cancel',event=>{event.preventDefault();if(libraryMode&&!['open','held','closed'].includes(phase)&&finishMotion)finishMotion();closeBook();});
heldDialog.addEventListener('cancel',event=>{event.preventDefault();releaseBook();});
dialog.addEventListener('close',()=>{if(phoneMode&&phase!=='closed')finishClosed();});
heldDialog.addEventListener('close',()=>{if(phase==='held'){readerHome.append(reader);document.body.style.overflow=savedOverflow;closeButton.textContent=closeLabel;setPhase('open');holdButton.focus({preventScroll:true});}});
document.addEventListener('keydown',event=>{if(libraryMode&&event.key==='Escape'){event.preventDefault();window.libraryJourney?.escape();return;}if(event.key==='Escape'&&phase==='opening'&&finishMotion){event.preventDefault();finishMotion();closeBook();return;}if(event.key==='Escape'&&(phase==='open'||phase==='held')){event.preventDefault();closeBook();}});
window.addEventListener('resize',()=>{if(finishMotion)finishMotion();if(phase==='open'&&phoneMode!==phoneQuery.matches){if(libraryMode)window.libraryJourney?.reset();else finishClosed();}if(phase==='open'&&phoneMode)viewport.scrollLeft=phonePage*viewport.clientWidth;});
['pointerenter','pointerdown','focus'].forEach(event=>cover.addEventListener(event,warmBook,{passive:true}));
const idleWarm=()=>window.requestIdleCallback?requestIdleCallback(warmBook,{timeout:1200}):setTimeout(warmBook,300);
if(document.readyState==='complete')idleWarm();else window.addEventListener('load',idleWarm,{once:true});
selectChapter(0,false);setPhase('closed');

if(new URLSearchParams(location.search).get('read')==='1'){
  if(document.readyState==='complete')openBook();
  else window.addEventListener('load',openBook,{once:true});
}

(() => {
  let serial = 0, ghost = null, cancelScroll = null, returnScroll = 0;
  let keyboardOpened = false;
  const root = document.documentElement;
  let savedScrollBehavior = '';

  function cleanup() {
    serial++;
    cancelScroll?.();
    cancelScroll = null;
    ghost?.remove();
    ghost = null;
    reader.style.visibility = '';
    book.style.transform = '';

  }
  function atScroll(top) { window.scrollTo({top, left: 0, behavior: 'instant'}); }
  function scrollScene(target, duration) {
    if (reduced.matches || Math.abs(scrollY - target) < 1) {
      atScroll(target);
      return Promise.resolve();
    }
    const start = scrollY;
    return new Promise(resolve => {
      let frame, beginning;
      cancelScroll = () => { cancelAnimationFrame(frame); resolve(); };
      function step(now) {
        beginning ??= now;
        const t = Math.min(1, (now - beginning) / duration);
        const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        atScroll(start + (target - start) * ease);
        if (t < 1) frame = requestAnimationFrame(step);
        else { cancelScroll = null; resolve(); }
      }
      frame = requestAnimationFrame(step);
    });
  }
  function transform(from, to) {
    return `translate3d(${to.x - from.x}px,${to.y - from.y}px,0) scale(${to.width / from.width},${to.height / from.height})`;
  }
  function lifted(pose) {
    return {...pose, x: pose.x - pose.width * .04, y: pose.y - 24,
      width: pose.width * 1.08, height: pose.height * 1.08};
  }
  function makeGhost(pose, rotation) {
    ghost = document.createElement('div');
    ghost.className = 'travelling-volume';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = `left:${pose.x}px;top:${pose.y}px;width:${pose.width}px;height:${pose.height}px;--book-width:${pose.width}px`;
    ghost.innerHTML = cover.innerHTML;
    ghost.querySelector('.shelf-tome').style.transform = `rotateY(${rotation}deg)`;
    (phoneMode ? dialog : libraryDialog).append(ghost);
    return ghost;
  }
  function deskPose(rect) {
    return {x: rect.left + (phoneMode ? 0 : rect.width / 2), y: rect.top,
      width: rect.width / 2, height: rect.height, visual: new DOMMatrix()};
  }
  function shelfPose() {
    const pose = coverPose();
    pose.y += scrollY - returnScroll;
    return pose;
  }
  async function finished(animation) { try { await animation.finished; } catch {} }
  function animateGhost(origin, frames, duration) {
    return finished(play(ghost, frames.map(pose => ({transform: transform(origin, pose)})),
      {duration, easing: 'cubic-bezier(.4,0,.2,1)'}));
  }
  function snapOpen() {
    atScroll(0);
    finishOpen();
  }
  function snapClosed() {
    atScroll(returnScroll);
    root.style.scrollBehavior = savedScrollBehavior;
    finishClosed();
  }

  async function open() {
    if (phase !== 'closed' || loading) return;
    loading = true;
    keyboardOpened = cover.matches(':focus-visible');
    cover.setAttribute('aria-busy', 'true');
    await Promise.race([warmBook(),new Promise(resolve=>setTimeout(resolve,700))]);
    const ticket = ++serial;
    returnScroll = scrollY;
    savedOverflow = document.body.style.overflow;
    savedScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    document.body.style.overflow = 'hidden';
    const origin = coverPose();
    phoneMode = phoneQuery.matches;
    reader.hidden = false;
    reader.style.visibility = 'hidden';
    setPhase('taking');
    if (phoneMode) { dialog.append(reader); dialog.showModal(); }
    else libraryDialog.showModal();
    atScroll(returnScroll);
    viewport.scrollLeft = 0;
    const rect = book.getBoundingClientRect(), destination = deskPose(rect);
    loading = false;
    cover.removeAttribute('aria-busy');
    finishMotion = snapOpen;
    if (reduced.matches) { snapOpen(); return; }

    makeGhost(origin, 88);
    const extracted = lifted(origin);
    await animateGhost(origin, [origin, extracted], 260);
    if (ticket !== serial) return;
    setPhase('travelling');
    await Promise.all([
      animateGhost(origin, [extracted, destination], 1120),
      finished(play(ghost.querySelector('.shelf-tome'), [
        {transform: 'rotateY(88deg)'},
        {transform: 'rotateY(88deg)', offset: .15},
        {transform: 'rotateY(0deg)', offset: .85},
        {transform: 'rotateY(0deg)'}
      ], {duration: 1120, easing: 'cubic-bezier(.4,0,.2,1)'})),
      scrollScene(0, 1120)
    ]);
    if (ticket !== serial) return;
    atScroll(0);

    // Both representations meet at the same physical cover before it opens.
    fitLeaf(origin);

    motion.hidden = false;
    viewport.classList.add('moving');
    artwork.style.clipPath = 'inset(0 0 0 50%)';
    const pan = phoneMode ? `translateX(${-rect.width / 2}px)` : 'none';
    book.style.transform = pan;
    setPhase('opening');
    const duration = 860;
    const opening = [
      play(leaf.querySelector('.leaf-front'),[{opacity:1},{opacity:1,offset:.499},{opacity:0,offset:.5},{opacity:0}],{duration}),
      play(leaf.querySelector('.leaf-back'),[{opacity:0},{opacity:0,offset:.5},{opacity:1,offset:.501},{opacity:1}],{duration}),
      play(leaf, [{transform: 'rotateY(0deg)'}, {transform: 'rotateY(-180deg)'}],
        {duration, easing: 'cubic-bezier(.45,0,.55,1)'}),
      play(artwork, [{opacity: 0}, {opacity: 0, offset: .12}, {opacity: 1, offset: .48}, {opacity: 1}], {duration}),
      play(pages[0], [{opacity: 0}, {opacity: 0, offset: .83}, {opacity: 1}], {duration}),
      play(pages[1], [{opacity: 0}, {opacity: 0, offset: .23}, {opacity: 1, offset: .67}, {opacity: 1}], {duration}),
      play(frontShade, [{opacity: 0}, {opacity: .55}], {duration}),
      play(backShade, [{opacity: .55}, {opacity: 0}], {duration})
    ];
    if (phoneMode) opening.push(play(book, [{transform: pan}, {transform: pan, offset: .3}, {transform: 'none'}], {duration}));
    [closeButton, holdButton, ...tabs].forEach(part => opening.push(play(part,
      [{opacity: 0}, {opacity: 0, offset: .75}, {opacity: 1}], {duration})));
    reader.style.visibility = '';
    ghost.remove(); ghost = null;
    await Promise.all(opening.map(finished));
    if (ticket === serial) finishOpen();
  }

  async function close() {
    if (phase !== 'open') return;
    const ticket = ++serial;
    setPhase('closing');
    finishMotion = snapClosed;
    if (reduced.matches) { snapClosed(); return; }
    const from = viewport.scrollLeft;
    viewport.scrollLeft = 0;
    const rect = book.getBoundingClientRect(), origin = deskPose(rect);
    const destination = shelfPose(), extracted = lifted(destination);
    fitLeaf(destination);

    motion.hidden = false;
    viewport.classList.add('moving');
    const pan = phoneMode ? `translateX(${-rect.width / 2}px)` : 'none';
    const duration = 860;
    const closing = [
      play(leaf.querySelector('.leaf-front'),[{opacity:0},{opacity:0,offset:.5},{opacity:1,offset:.501},{opacity:1}],{duration}),
      play(leaf.querySelector('.leaf-back'),[{opacity:1},{opacity:1,offset:.499},{opacity:0,offset:.5},{opacity:0}],{duration}),
      play(leaf, [{transform: 'rotateY(-180deg)'}, {transform: 'rotateY(0deg)'}],
        {duration, easing: 'cubic-bezier(.45,0,.55,1)'}),
      play(pages[0], [{opacity: 1}, {opacity: 0}], {duration: 150}),
      play(pages[1], [{opacity: 1}, {opacity: 1, offset: .5}, {opacity: 0, offset: .8}, {opacity: 0}], {duration}),
      play(artwork, [{opacity: 1}, {opacity: 1, offset: .7}, {opacity: 0}], {duration}),
      play(frontShade, [{opacity: .55}, {opacity: 0}], {duration}),
      play(backShade, [{opacity: 0}, {opacity: .55}], {duration})
    ];
    timers.push(setTimeout(() => { artwork.style.clipPath = 'inset(0 0 0 50%)'; }, 160));
    if (phoneMode) closing.push(play(book, [{transform: `translateX(${-from}px)`}, {transform: pan}], {duration}));
    [closeButton, holdButton, ...tabs].forEach(part => closing.push(play(part, [{opacity: 1}, {opacity: 0}], {duration: 130})));
    await Promise.all(closing.map(finished));
    if (ticket !== serial) return;
    makeGhost(origin, 0);
    reader.style.visibility = 'hidden';
    motion.hidden = true;
    setPhase('returning');
    await Promise.all([
      animateGhost(origin, [origin, extracted], 1120),
      finished(play(ghost.querySelector('.shelf-tome'), [
        {transform: 'rotateY(0deg)'},
        {transform: 'rotateY(0deg)', offset: .15},
        {transform: 'rotateY(88deg)', offset: .85},
        {transform: 'rotateY(88deg)'}
      ], {duration: 1120, easing: 'cubic-bezier(.4,0,.2,1)'})),
      scrollScene(returnScroll, 1120)
    ]);
    if (ticket !== serial) return;
    setPhase('shelving');
    await animateGhost(origin, [extracted, destination], 260);
    if (ticket === serial) snapClosed();
  }
  function escape() {
    if (phase === 'held') { releaseBook(); return; }
    if (phase === 'open') { close(); return; }
    const wasOpening = ['taking', 'travelling', 'opening'].includes(phase);
    finishMotion?.();
    if (wasOpening && phase === 'open') close();
  }
  window.libraryJourney = {open, close, cleanup, escape, reset: snapClosed,
    settle: () => finishMotion?.(),
    get keyboardOpened() { return keyboardOpened; }};
})();

'use client';

import {useEffect,useRef} from 'react';

type BurstStyle='peony'|'chrysanthemum'|'willow'|'palm'|'ring';

type Particle={
  x:number;
  y:number;
  vx:number;
  vy:number;
  age:number;
  duration:number;
  radius:number;
  color:string;
  drag:number;
  gravity:number;
  tailLength:number;
  phase:number;
  crackleAt?:number;
  cracked?:boolean;
};

type Rocket={
  x:number;
  y:number;
  previousX:number;
  previousY:number;
  targetY:number;
  vx:number;
  vy:number;
  age:number;
  duration:number;
  trailTimer:number;
  color:string;
  palette:string[];
  style:BurstStyle;
};

type Flash={x:number;y:number;age:number;duration:number;radius:number};

const PALETTES=[
  {core:'#f5f2ea',colors:['#fffdf8','#faf8ef','#e6ddc6','#f2eee4','#bcae8b']},
  {core:'#eeeae1',colors:['#fffefa','#f5f1e8','#ded5bf','#ebe7dd','#b6a782']},
  {core:'#f5f1e6',colors:['#fffefa','#faf6eb','#e2d7b7','#f3eee1','#c0ad76']},
  {core:'#f1ebdd',colors:['#fffbf2','#f4eedf','#ddd1af','#f8f4e9','#b6a47d']},
];

const BURST_STYLES:BurstStyle[]=['chrysanthemum','peony','willow','palm','ring'];
const STATIC_BURSTS=[
  {x:.14,y:.31,radius:.19},
  {x:.35,y:.22,radius:.2},
  {x:.57,y:.34,radius:.21},
  {x:.81,y:.2,radius:.2},
  {x:.27,y:.55,radius:.17},
  {x:.67,y:.54,radius:.18},
];

export default function FireworksCanvas(){
  const canvasRef=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const context=canvas?.getContext('2d',{alpha:true});
    if(!canvas||!context)return;

    const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion=motionPreference.matches;
    const particles:Particle[]=[];
    const rockets:Rocket[]=[];
    const flashes:Flash[]=[];
    let width=1;
    let height=1;
    let ratio=1;
    let frame=0;
    let elapsed=0;
    let previousFrame=0;
    let nextCenterLaunchAt=0;
    let nextOuterLaunchAt=360;
    let centerShotIndex=0;
    let outerShotIndex=0;
    let burstIndex=0;

    const particleLimit=()=>width<560?1120:1900;
    const trimParticleCapacity=(needed:number)=>{
      const excess=particles.length+needed-particleLimit();
      if(excess>0)particles.splice(0,excess);
    };

    const addParticle=(particle:Particle)=>{
      if(particles.length<particleLimit())particles.push(particle);
    };

    const drawStill=()=>{
      context.clearRect(0,0,width,height);
      context.save();
      context.globalCompositeOperation='lighter';
      for(const [index,burst] of STATIC_BURSTS.entries()){
        const x=width*burst.x;
        const y=height*burst.y;
        const palette=PALETTES[index%PALETTES.length];
        context.globalAlpha=.7;
        context.strokeStyle=palette.colors[index%palette.colors.length];
        for(let ray=0;ray<112;ray+=1){
          const angle=Math.PI*2*ray/112;
          const outer=Math.min(width,height)*burst.radius*(.7+(ray%7)*.055);
          context.lineWidth=.7+(ray%4)*.25;
          context.beginPath();
          context.moveTo(x+Math.cos(angle)*4,y+Math.sin(angle)*4);
          context.lineTo(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer);
          context.stroke();
        }
        context.globalAlpha=.95;
        context.fillStyle=palette.core;
        context.beginPath();
        context.arc(x,y,2.5,0,Math.PI*2);
        context.fill();
      }
      context.restore();
    };

    const resize=()=>{
      const bounds=canvas.getBoundingClientRect();
      width=Math.max(1,bounds.width);
      height=Math.max(1,bounds.height);
      ratio=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=Math.round(width*ratio);
      canvas.height=Math.round(height*ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
      if(reduceMotion)drawStill();
    };

    const addTrailSpark=(rocket:Rocket)=>{
      const jitter=(Math.random()-.5)*1.15;
      addParticle({
        x:rocket.x+(Math.random()-.5)*2.4,
        y:rocket.y+(Math.random()-.5)*2.4,
        vx:rocket.vx*.04+jitter,
        vy:Math.random()*.75+.25,
        age:0,
        duration:390+Math.random()*360,
        radius:.65+Math.random()*.9,
        color:rocket.palette[Math.floor(Math.random()*rocket.palette.length)],
        drag:.94,
        gravity:.02,
        tailLength:1.8,
        phase:Math.random()*Math.PI*2,
      });
    };

    const emitBurst=(rocket:Rocket)=>{
      const style=rocket.style;
      const count=width<560?86:122;
      const scale=Math.min(1.25,Math.max(.68,Math.min(width,height)/560));
      trimParticleCapacity(count);
      flashes.push({x:rocket.x,y:rocket.y,age:0,duration:190,radius:58*scale});

      for(let index=0;index<count;index+=1){
        const spokeCount=style==='palm'?17:style==='ring'?count:0;
        const angle=spokeCount
          ?Math.PI*2*(style==='ring'?index/count:Math.floor(index/(count/spokeCount))/spokeCount)+(Math.random()-.5)*(style==='ring'?.018:.105)
          :(Math.PI*2*index)/count+(Math.random()-.5)*.035;
        const rings=[2.2,3.05,3.8,4.55];
        const speed=(style==='ring'?4.15:style==='palm'?3.7:rings[index%rings.length])+(Math.random()-.5)*.9;
        const willow=style==='willow';
        const color=willow&&index%4===0?'#fff8e7':rocket.palette[(index+Math.floor(Math.random()*rocket.palette.length))%rocket.palette.length];
        const crackle=(style==='chrysanthemum'||style==='peony')&&index%13===0;
        const duration=willow?3300+Math.random()*850:2600+Math.random()*850;
        const drag=willow?.989:.983;
        const gravity=willow?.052:.035;

        particles.push({
          x:rocket.x,
          y:rocket.y,
          vx:Math.cos(angle)*speed*scale+rocket.vx*.035,
          vy:Math.sin(angle)*speed*scale-.15,
          age:0,
          duration,
          radius:.7+Math.random()*1.35,
          color,
          drag,
          gravity,
          tailLength:willow?6.2:4,
          phase:Math.random()*Math.PI*2,
          crackleAt:crackle?310+Math.random()*560:undefined,
          cracked:false,
        });
      }
    };

    const launchRocket=(xRatio:number,targetYRatio:number)=>{
      const startX=width*xRatio;
      const targetY=height*targetYRatio;
      const duration=620+(1-targetYRatio)*420+Math.random()*150;
      const framesToBurst=duration/16.667;
      const startY=height+14;
      const gravity=.075;
      const palette=PALETTES[Math.floor(Math.random()*PALETTES.length)];
      const style=BURST_STYLES[burstIndex%BURST_STYLES.length];
      burstIndex+=1;

      rockets.push({
        x:startX,
        y:startY,
        previousX:startX,
        previousY:startY,
        targetY,
        vx:0,
        vy:(targetY-startY)/framesToBurst-gravity*framesToBurst*.5,
        age:0,
        duration,
        trailTimer:0,
        color:palette.core,
        palette:palette.colors,
        style,
      });
    };

    const scheduleLaunches=()=>{
      if(elapsed>=nextCenterLaunchAt){
        const centerSlots=[.39,.5,.61];
        const centerHeights=[.18,.32,.48,.25,.56,.4];
        const xRatio=centerSlots[centerShotIndex%centerSlots.length]+(Math.random()-.5)*.035;
        const targetYRatio=Math.max(.14,Math.min(.59,centerHeights[centerShotIndex%centerHeights.length]+(Math.random()-.5)*.045));
        launchRocket(xRatio,targetYRatio);
        centerShotIndex+=1;
        nextCenterLaunchAt=elapsed+180+Math.random()*65;
      }

      if(elapsed>=nextOuterLaunchAt){
        const outerSlots=[.09,.24,.76,.91];
        const outerHeights=[.2,.46,.29,.56,.37];
        const xRatio=outerSlots[outerShotIndex%outerSlots.length]+(Math.random()-.5)*.025;
        const targetYRatio=Math.max(.14,Math.min(.59,outerHeights[outerShotIndex%outerHeights.length]+(Math.random()-.5)*.04));
        launchRocket(xRatio,targetYRatio);
        outerShotIndex+=1;
        nextOuterLaunchAt=elapsed+650+Math.random()*250;
      }
    };

    const animate=(timestamp:number)=>{
      const step=previousFrame?Math.min(2.4,(timestamp-previousFrame)/16.667):1;
      const delta=step*16.667;
      previousFrame=timestamp;
      elapsed+=delta;

      scheduleLaunches();

      for(let index=rockets.length-1;index>=0;index-=1){
        const rocket=rockets[index];
        rocket.previousX=rocket.x;
        rocket.previousY=rocket.y;
        rocket.age+=delta;
        rocket.x+=rocket.vx*step;
        rocket.y+=rocket.vy*step;
        rocket.vy+=.075*step;
        rocket.trailTimer-=step;
        if(rocket.trailTimer<=0){
          addTrailSpark(rocket);
          rocket.trailTimer=1.5+Math.random()*1.6;
        }
        if(rocket.age>=rocket.duration||rocket.y<=rocket.targetY){
          emitBurst(rocket);
          rockets.splice(index,1);
        }
      }

      context.clearRect(0,0,width,height);
      context.globalCompositeOperation='lighter';

      for(let index=flashes.length-1;index>=0;index-=1){
        const flash=flashes[index];
        flash.age+=delta;
        const life=1-flash.age/flash.duration;
        if(life<=0){flashes.splice(index,1);continue;}
        const radius=flash.radius*(1.35-life*.45);
        const glow=context.createRadialGradient(flash.x,flash.y,0,flash.x,flash.y,radius);
        glow.addColorStop(0,`rgba(255,255,250,${life*.88})`);
        glow.addColorStop(.12,`rgba(255,244,215,${life*.64})`);
        glow.addColorStop(.42,`rgba(255,220,164,${life*.2})`);
        glow.addColorStop(1,'rgba(255,220,164,0)');
        context.globalAlpha=1;
        context.fillStyle=glow;
        context.beginPath();
        context.arc(flash.x,flash.y,radius,0,Math.PI*2);
        context.fill();
      }

      for(let index=particles.length-1;index>=0;index-=1){
        const particle=particles[index];
        particle.age+=delta;
        const life=1-particle.age/particle.duration;
        if(life<=0){particles.splice(index,1);continue;}

        particle.x+=particle.vx*step;
        particle.y+=particle.vy*step;
        const drag=Math.pow(particle.drag,step);
        particle.vx*=drag;
        particle.vy=particle.vy*drag+particle.gravity*step;

        if(particle.crackleAt&&particle.age>=particle.crackleAt&&!particle.cracked){
          particle.cracked=true;
          for(let spark=0;spark<3;spark+=1){
            const angle=Math.random()*Math.PI*2;
            const speed=.7+Math.random()*1.45;
            addParticle({
              x:particle.x,
              y:particle.y,
              vx:Math.cos(angle)*speed,
              vy:Math.sin(angle)*speed,
              age:0,
              duration:380+Math.random()*260,
              radius:.55+Math.random()*.55,
              color:particle.color,
              drag:.93,
              gravity:.02,
              tailLength:1.3,
              phase:Math.random()*Math.PI*2,
            });
          }
        }

        const twinkle=.73+.27*Math.abs(Math.sin(particle.age*.024+particle.phase));
        context.globalAlpha=Math.min(1,life*2.4)*twinkle;
        context.strokeStyle=particle.color;
        context.lineWidth=Math.max(.65,particle.radius*(.45+life*.55));
        context.beginPath();
        context.moveTo(particle.x-particle.vx*particle.tailLength,particle.y-particle.vy*particle.tailLength);
        context.lineTo(particle.x,particle.y);
        context.stroke();
        context.fillStyle=particle.color;
        context.beginPath();
        context.arc(particle.x,particle.y,particle.radius*(.62+life*.38),0,Math.PI*2);
        context.fill();
      }

      for(const rocket of rockets){
        context.globalAlpha=.92;
        context.strokeStyle=rocket.color;
        context.lineWidth=2.1;
        context.shadowColor=rocket.color;
        context.shadowBlur=11;
        context.beginPath();
        context.moveTo(rocket.previousX,rocket.previousY);
        context.lineTo(rocket.x,rocket.y);
        context.stroke();
        context.shadowBlur=0;
        context.fillStyle='#fffdf6';
        context.beginPath();
        context.arc(rocket.x,rocket.y,1.7,0,Math.PI*2);
        context.fill();
      }

      context.globalAlpha=1;
      context.globalCompositeOperation='source-over';
      frame=window.requestAnimationFrame(animate);
    };

    const startLoop=()=>{
      if(reduceMotion||document.hidden||frame)return;
      previousFrame=0;
      frame=window.requestAnimationFrame(animate);
    };

    const stopLoop=()=>{
      if(frame)window.cancelAnimationFrame(frame);
      frame=0;
      previousFrame=0;
    };

    const onVisibilityChange=()=>{
      if(document.hidden)stopLoop();
      else startLoop();
    };

    const onMotionPreferenceChange=(event:MediaQueryListEvent)=>{
      reduceMotion=event.matches;
      stopLoop();
      particles.length=0;
      rockets.length=0;
      flashes.length=0;
      elapsed=0;
      nextCenterLaunchAt=0;
      nextOuterLaunchAt=360;
      centerShotIndex=0;
      outerShotIndex=0;
      burstIndex=0;
      context.clearRect(0,0,width,height);
      if(reduceMotion)drawStill();
      else startLoop();
    };

    resize();
    window.addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',onVisibilityChange);
    motionPreference.addEventListener('change',onMotionPreferenceChange);
    if(reduceMotion)drawStill();
    else startLoop();

    return()=>{
      stopLoop();
      window.removeEventListener('resize',resize);
      document.removeEventListener('visibilitychange',onVisibilityChange);
      motionPreference.removeEventListener('change',onMotionPreferenceChange);
    };
  },[]);

  return <canvas className="fireworks-canvas" ref={canvasRef} aria-hidden="true"/>;
}

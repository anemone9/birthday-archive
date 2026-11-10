'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,ImageIcon,RotateCcw,Box,LoaderCircle} from 'lucide-react';
import type {Gift} from '@/lib/archive';
import type * as THREE from 'three';
import type {OrbitControls as OrbitControlsType} from 'three/addons/controls/OrbitControls.js';

type ModelStatus='empty'|'loading'|'ready'|'error';

function PhotoPlaceholder({failed=false,readOnly=false}:{failed?:boolean;readOnly?:boolean}){
  return <div className="model-empty-state"><div className="model-empty-card">
    <ImageIcon aria-hidden="true"/>
    <strong>{failed?'照片暂时无法显示':readOnly?'这份礼物没有照片':'这份礼物的照片还没放进来'}</strong>
    <span>{failed?'请检查图片，或重新打开这份心意。':readOnly?'没有上传实物照片。':'在「编辑我的礼物」中上传实物照片，这里就会展示。'}</span>
  </div></div>;
}

export default function GiftModel({gift,readOnly=false}:{gift:Gift;readOnly?:boolean}) {
  const mount=useRef<HTMLDivElement>(null);
  const command=useRef<{rotate:(angle:number)=>void;reset:()=>void}|null>(null);
  const [status,setStatus]=useState<ModelStatus>('empty');
  const [photo,setPhoto]=useState(()=>Boolean(gift.image));
  const [photoError,setPhotoError]=useState(false);
  const [attempt,setAttempt]=useState(0);

  useEffect(()=>{
    if(photo||!gift.model){setStatus('empty');return;}
    let disposed=false;
    let cleanup=()=>{};
    setStatus('loading');

    const run=async()=>{
      const [T,{OrbitControls},{GLTFLoader}]=await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/loaders/GLTFLoader.js'),
      ]);
      if(disposed||!mount.current)return;

      const host=mount.current;
      let renderer:THREE.WebGLRenderer|undefined;
      let controls:OrbitControlsType|undefined;
      let scene:THREE.Scene|undefined;
      let environment:THREE.WebGLRenderTarget|undefined;
      let observer:ResizeObserver|undefined;
      let resize=()=>{};
      let onContextLost:((event:Event)=>void)|undefined;
      const disposeObject=(object:THREE.Object3D)=>object.traverse(node=>{
        const mesh=node as THREE.Mesh;
        mesh.geometry?.dispose();
        const value=mesh.material;
        const materials=Array.isArray(value)?value:value?[value]:[];
        for(const material of materials){
          for(const item of Object.values(material))if(item instanceof T.Texture)item.dispose();
          material.dispose();
        }
      });

      cleanup=()=>{
        observer?.disconnect();
        window.removeEventListener('resize',resize);
        renderer?.setAnimationLoop(null);
        controls?.dispose();
        environment?.dispose();
        if(scene)disposeObject(scene);
        if(renderer){
          if(onContextLost)renderer.domElement.removeEventListener('webglcontextlost',onContextLost);
          renderer.dispose();
          renderer.domElement.remove();
        }
        command.current=null;
      };

      try{
        const pixelRatio=window.devicePixelRatio||1;
        renderer=new T.WebGLRenderer({antialias:pixelRatio<=1.25,alpha:true,powerPreference:'low-power',failIfMajorPerformanceCaveat:false});
        renderer.setPixelRatio(Math.min(pixelRatio,1.4));
        renderer.toneMapping=T.ACESFilmicToneMapping;
        renderer.toneMappingExposure=1.15;

        scene=new T.Scene();
        const camera=new T.PerspectiveCamera(34,1,.1,100);
        camera.position.set(3.6,2.1,5.7);
        controls=new OrbitControls(camera,renderer.domElement);
        controls.enableDamping=!(window.matchMedia?.('(prefers-reduced-motion:reduce)').matches??false);
        controls.enablePan=false;
        controls.minDistance=3.4;
        controls.maxDistance=9;
        controls.maxPolarAngle=Math.PI*.82;

        scene.add(new T.HemisphereLight('#fff9ee','#c6b3d6',2));
        const light=new T.DirectionalLight('#fff5e5',3);
        light.position.set(4,7,5);
        scene.add(light);

        if(window.matchMedia?.('(min-width:700px)').matches){
          const {RoomEnvironment}=await import('three/addons/environments/RoomEnvironment.js');
          if(disposed)return;
          const room=new RoomEnvironment();
          const pmrem=new T.PMREMGenerator(renderer);
          try{
            environment=pmrem.fromScene(room,.04);
            scene.environment=environment.texture;
          }finally{
            room.dispose();
            pmrem.dispose();
          }
        }

        const lost=(event:Event)=>{event.preventDefault();if(!disposed)setStatus('error');};
        onContextLost=lost;
        renderer.domElement.addEventListener('webglcontextlost',lost);
        host.appendChild(renderer.domElement);

        let modelBuffer:ArrayBuffer;
        if(gift.model!.startsWith('data:')){
          const raw=atob(gift.model!.split(',')[1]);
          const bytes=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
          modelBuffer=bytes.buffer;
        }else{
          const modelUrl=new URL(gift.model!,window.location.href);
          if(modelUrl.origin!==window.location.origin||!modelUrl.pathname.startsWith('/api/share/'))throw new Error('外部模型资源已阻止。');
          const response=await fetch(modelUrl,{cache:'force-cache'});
          if(!response.ok)throw new Error('模型暂时无法加载。');
          modelBuffer=await response.arrayBuffer();
        }

        const manager=new T.LoadingManager();
        manager.setURLModifier(url=>{
          if(url.startsWith('data:')||url.startsWith('blob:'))return url;
          throw new Error('外部模型资源已阻止。');
        });
        const result=await new GLTFLoader(manager).parseAsync(modelBuffer,'');
        let object:THREE.Object3D=result.scene;
        if(disposed){disposeObject(object);return;}
        const bounds=new T.Box3().setFromObject(object);
        const size=bounds.getSize(new T.Vector3());
        const scale=2.4/Math.max(size.x,size.y,size.z);
        if(!Number.isFinite(scale)||scale<=0)throw new Error('empty model');
        const center=bounds.getCenter(new T.Vector3());
        object.position.sub(center);
        const holder=new T.Group();
        holder.add(object);
        holder.scale.setScalar(scale);
        object=holder;
        scene.add(object);
        renderer.domElement.setAttribute('aria-label',gift.name+'的可旋转模型');
        renderer.domElement.setAttribute('role','img');

        resize=()=>{
          if(!renderer)return;
          const w=host.clientWidth;
          const h=host.clientHeight;
          if(!w||!h)return;
          renderer.setSize(w,h);
          camera.aspect=w/h;
          camera.updateProjectionMatrix();
        };
        if(typeof ResizeObserver!=='undefined'){
          observer=new ResizeObserver(resize);
          observer.observe(host);
        }else window.addEventListener('resize',resize);
        resize();

        renderer.setAnimationLoop(()=>{
          controls?.update();
          if(scene&&renderer)renderer.render(scene,camera);
        });
        const initial=camera.position.clone();
        command.current={
          rotate:(angle)=>{
            const target=controls?.target??new T.Vector3();
            const offset=camera.position.clone().sub(target);
            offset.applyAxisAngle(new T.Vector3(0,1,0),angle);
            camera.position.copy(target.clone().add(offset));
            controls?.update();
          },
          reset:()=>{
            camera.position.copy(initial);
            controls?.target.set(0,0,0);
            controls?.update();
          },
        };
        setStatus('ready');
      }catch(error){
        cleanup();
        console.error('礼物模型初始化失败',error);
        throw error;
      }
    };

    run().catch(()=>{if(!disposed)setStatus('error');});
    return()=>{disposed=true;cleanup();};
  },[gift.id,gift.model,photo,attempt]);

  const hasPhoto=Boolean(gift.image);
  const showingModel=Boolean(gift.model)&&!photo;

  return <div className="model-panel">
    {hasPhoto&&gift.model&&<div className="model-caption"><button className="text-button small" onClick={()=>{setPhoto(!photo);setPhotoError(false);}}><ImageIcon size={14}/>{photo?'查看模型':'查看照片'}</button></div>}
    <div className="model-stage">
      {photo&&gift.image
        ?photoError?<PhotoPlaceholder failed readOnly={readOnly}/>:<img className="gift-photo" src={gift.image} alt={gift.name+'的实物照片'} onError={()=>setPhotoError(true)}/>
        :gift.model
          ?<><div className="model-canvas" ref={mount}/>{status==='loading'&&<div className="model-fallback"><LoaderCircle className="spin"/><span>正在打开这份心意…</span></div>}{status==='error'&&<div className="model-fallback">{hasPhoto&&!photoError?<img src={gift.image} alt={gift.name+'的实物照片'} onError={()=>setPhotoError(true)}/>:<Box size={48}/>}<span>{hasPhoto&&!photoError?'3D 暂时无法显示，先为你展示实物照片。':readOnly?'3D 模型暂时无法显示。':'模型暂时没能打开，可以重新加载或上传实物照片。'}</span><button className="text-button" onClick={()=>setAttempt(x=>x+1)}>重新加载模型</button></div>}</>
          :<PhotoPlaceholder readOnly={readOnly}/>}
    </div>
    {showingModel&&status==='ready'&&<div className="model-tools"><button className="icon-button" aria-label="向左旋转模型" onClick={()=>command.current?.rotate(-Math.PI/6)}><ArrowLeft size={17}/></button><span>拖动旋转 · 双指缩放</span><button className="icon-button" aria-label="向右旋转模型" onClick={()=>command.current?.rotate(Math.PI/6)}><ArrowRight size={17}/></button><button className="icon-button" aria-label="恢复模型视角" onClick={()=>command.current?.reset()}><RotateCcw size={16}/></button></div>}
  </div>;
}

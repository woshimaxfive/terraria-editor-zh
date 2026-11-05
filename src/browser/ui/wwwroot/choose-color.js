// HTML Standard color state, opaque sRGB. Original player fields are RGB.
let closePicker;
export function chooseColor(json,changed){
 closePicker?.();const p=JSON.parse(json),input=document.createElement('input');input.type='color';input.value=/^#[0-9a-f]{6}$/i.test(p.value||'')?p.value:'#000000';input.dataset.teditColor=p.target;
 Object.assign(input.style,{position:'fixed',left:'50%',top:'50%',width:'1px',height:'1px',opacity:'0'});document.body.append(input);
 const close=()=>{input.remove();window.removeEventListener('pointerdown',close,true);window.removeEventListener('keydown',escape,true);if(closePicker===close)closePicker=null;};
 const escape=e=>{if(e.key==='Escape')close();};closePicker=close;
 input.oninput=()=>changed(p.target,input.value.toUpperCase());input.onchange=()=>{changed(p.target,input.value.toUpperCase());close();};input.oncancel=close;
 input.click();setTimeout(()=>{if(input.isConnected){window.addEventListener('pointerdown',close,{capture:true,once:true});window.addEventListener('keydown',escape,true);}},0);return '{}';
}

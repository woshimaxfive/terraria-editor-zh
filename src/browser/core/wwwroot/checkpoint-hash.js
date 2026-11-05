import {sha256} from './vendor/noble-sha256.js';

const states=new Map();let next=0;
function state(token){const hash=states.get(token);if(!hash)throw new Error('历史校验状态已释放');return hash;}
export const checkpointHashImports={
 begin(){const token=++next;states.set(token,sha256.create());return token;},
 append(token,bytes,count){
  if(!Number.isInteger(count)||count<0||count>bytes.length||count>65536)throw new Error('历史校验区块长度无效');
  const input=bytes instanceof Uint8Array?bytes:Uint8Array.from(bytes);
  state(token).update(input.subarray(0,count));
 },
 finish(token){const hash=state(token);try{return hash.digest();}finally{hash.destroy();states.delete(token);}},
 dispose(token){const hash=states.get(token);if(hash){hash.destroy();states.delete(token);}}
};

export function activeCheckpointHashStates(){return states.size;}

// Original PlayerFile AES-CBC key, IV and zero padding. Native WebCrypto only.
// WebCrypto's obligatory PKCS#7 block is removed on encrypt. On decrypt a valid
// terminal PKCS#7 block is constructed with the last ciphertext block as its IV.
const raw=new Uint8Array(Array.from('h3y_gUyZ').flatMap(c=>[c.charCodeAt(0),0]));
const key=()=>crypto.subtle.importKey('raw',raw,{name:'AES-CBC'},false,['encrypt','decrypt']);
export async function encryptPlayer(bytes){
 const padded=new Uint8Array(Math.ceil(bytes.length/16)*16);padded.set(bytes);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:raw},await key(),padded));return encrypted.slice(0,-16);
}
export async function decryptPlayer(bytes){
 if(bytes.length<16||bytes.length%16||bytes.length>8*1024*1024)throw new Error('玩家文件长度无效');
 const k=await key(),tail=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:bytes.slice(-16)},k,new Uint8Array(16).fill(16)));
 const framed=new Uint8Array(bytes.length+16);framed.set(bytes);framed.set(tail.slice(0,16),bytes.length);
 return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:raw},k,framed));
}

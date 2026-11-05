// Keep the SDK's existing retry policy and integrity checks. Converting a

// rejected binary fetch into a failed HTTP response also keeps the SDK progress

// callback from creating an unobserved rejected child promise on a retry.

export function bootResource(type,name,uri,integrity){

 if(!['assembly','dotnetwasm','globalization','pdb'].includes(type))return null;

 return fetch(uri,{cache:'no-cache',...(integrity?{integrity}:{})}).catch(error=>{

  console.warn('启动资源网络请求失败，交由框架重试：'+name,error.message);

  return new Response('启动资源暂时不可用，请重试',{status:503,statusText:'Boot resource network failure'});

 });

}


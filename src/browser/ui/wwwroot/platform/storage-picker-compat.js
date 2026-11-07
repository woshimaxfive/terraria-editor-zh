// Adapt the pinned Avalonia storage polyfill without changing vendor code.

// Its fallback resolves on change but leaves cancel and temporary inputs behind.

export function installPickerCompatibility(StorageProvider,StorageItems){

 const open=StorageProvider.openFileDialog;

 StorageProvider.openFileDialog=async function(...args){

  const previous=new Set(document.querySelectorAll('input[type=file]'));

  const owned=input=>input instanceof HTMLInputElement&&input.type==='file'&&!previous.has(input);

  const cancel=event=>{const input=event.target;if(owned(input)&&input.files.length===0)input.dispatchEvent(new Event('change'));};

  document.addEventListener('cancel',cancel,true);

  try{return await open.apply(this,args);}

  catch(error){

   if(error?.name==='AbortError')return new StorageItems([]);

   throw error;

  }

  finally{

   document.removeEventListener('cancel',cancel,true);

   for(const input of document.querySelectorAll('input[type=file]'))if(owned(input))input.remove();

  }

 };

}


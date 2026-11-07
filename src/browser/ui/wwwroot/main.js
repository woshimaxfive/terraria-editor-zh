import {dotnet} from './_framework/dotnet.js';

import {diagnostics,inspectHash,inspectMemory} from './bridge.js';

import {bootResource} from './platform/boot-resource-loader.js';

import {installPickerCompatibility} from './platform/storage-picker-compat.js';

try{

const host=dotnet.withDiagnosticTracing(false).withResourceLoader(bootResource).withConfig({enableDownloadRetry:true});

await host.download();

const runtime=await host.create();

const config=runtime.getConfig();

const {StorageProvider,StorageItems}=await import('./_framework/storage.js');

installPickerCompatibility(StorageProvider,StorageItems);

window.r2=(await runtime.getAssemblyExports(config.mainAssemblyName)).TEditBrowser.UiHooks;

window.r2Probe={diagnostics,inspectHash,inspectMemory};

await runtime.runMain(config.mainAssemblyName,[globalThis.location.href]);

window.r2Ready=true;

}catch(error){document.getElementById('out').textContent='编辑器启动失败，请刷新重试。原始存档仍在你的设备上。';throw error;}


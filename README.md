# 泰拉瑞亚地图编辑器

[访问网页](https://woshimaxfive.github.io/terraria-editor-zh/)

一个独立实现的泰拉瑞亚网页地图编辑器，目前提供世界文件的只读预览。

## 当前功能

- 在本机浏览器中打开 `.wld`，查看世界名称、尺寸、种子、出生点、难度和对象数量。
- 导出未经编辑的副本：实际重新生成文件，与原文件逐字节一致后才提供下载；存在差异时停止导出。
- 首次成功缓存网站后，可以断网打开与导出文件。存档不会上传，也不会写入网站离线缓存；关闭或刷新页面后需要重新选择文件。

当前读取范围为文件格式版本 194–326，且受上游解析器的标准世界尺寸限制。格式范围不代表所有存档均经过游戏验证。不支持 `.twld` 模组配套文件，尚未提供地图显示与编辑。请保留原始存档，使用更新的浏览器。

## 本地运行

使用 Node.js 22.12 或更新的兼容版本：

~~~sh
npm ci
npm run dev
~~~

构建：

~~~sh
npm run build
~~~

测试：

~~~sh
npm test
~~~

测试首次运行会下载固定上游提交的 7 个世界样例，并验证 SHA-256。样例只保存在本地忽略目录中，不会打包到网站。

项目子目录部署时设置 VITE_BASE_PATH=/仓库名/，仅需托管 dist/，无需服务器端程序。

## 开源来源

文件格式与功能研究参考 [TEdit](https://github.com/TEdit/Terraria-Map-Editor) 和 [TEdit Web](https://github.com/TEdit/terraria-map-editor-web)。世界文件读写通过项目适配层接入 [terraria-world-file-ts](https://github.com/TEdit/terraria-world-file-ts)，固定来源和局部修改见 [vendor/terraria-world-file](vendor/terraria-world-file/README.md)。界面只接收基本信息，完整世界留在 Worker 中处理。

静态资源缓存与构建支持沿用并适配此前基于 TEdit Web 的实现。复用部分保留原有许可与署名，详见 [开源声明](public/THIRD_PARTY_NOTICES.txt)。新增代码采用 [MIT 许可证](LICENSE)。

# 泰拉瑞亚地图编辑器

[访问网页](https://woshimaxfive.github.io/terraria-editor-zh/)

一个独立实现的泰拉瑞亚网页地图编辑器。当前暂未开放地图编辑。

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

项目子目录部署时设置 VITE_BASE_PATH=/仓库名/，仅需托管 dist/，无需服务器端程序。

## 开源来源

文件格式与功能研究参考 [TEdit](https://github.com/TEdit/Terraria-Map-Editor)、[TEdit Web](https://github.com/TEdit/terraria-map-editor-web) 和 [terraria-world-file-ts](https://github.com/TEdit/terraria-world-file-ts)。当前尚未接入世界文件读写模块。

静态资源缓存与构建支持沿用并适配此前基于 TEdit Web 的实现。复用部分保留原有许可与署名，详见 [开源声明](public/THIRD_PARTY_NOTICES.txt)。新增代码采用 [MIT 许可证](LICENSE)。

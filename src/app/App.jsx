import React from 'react';
import './App.css';

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Terraria Editor</span>
        </a>
        <span className="language">简体中文</span>
      </header>
      <main className="welcome" aria-labelledby="page-title">
        <p className="availability" role="status">暂未开放</p>
        <h1 id="page-title">泰拉瑞亚地图编辑器</h1>
        <p className="description">新版暂未开放地图编辑。请保留原始世界文件，等待功能开放后再使用。</p>
      </main>
      <footer className="app-footer">
        <a href="https://github.com/woshimaxfive/terraria-editor-zh" target="_blank" rel="noreferrer">项目源码</a>
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`} target="_blank" rel="noreferrer">开源许可</a>
      </footer>
    </div>
  );
}

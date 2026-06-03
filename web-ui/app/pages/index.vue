<template>
  <div class="page active">
    <div class="page-header-hero">
      <div class="hero-content">
        <div class="hero-title">CG Toolbox</div>
        <div class="hero-subtitle">欢迎回来，开发者</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <NuxtLink to="/scripts" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">脚本运行器</div>
          <div class="card-desc">并在本地环境中执行 Python/Bat/Ps1 脚本</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <a href="/table-viewer" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2"></rect>
            <line x1="3" y1="10" x2="21" y2="10"></line>
            <line x1="9" y1="4" x2="9" y2="20"></line>
            <line x1="15" y1="4" x2="15" y2="20"></line>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">配置表浏览器</div>
          <div class="card-desc">直接打开 trunk/xls/table_viewer 的单文件配置表查看器</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </a>

      <NuxtLink to="/claude" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"></rect>
            <circle cx="12" cy="5" r="2"></circle>
            <path d="M12 7v4"></path>
            <line x1="8" y1="16" x2="8" y2="16"></line>
            <line x1="16" y1="16" x2="16" y2="16"></line>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">Claude 配置</div>
          <div class="card-desc">管理 API 密钥、Base URL 和环境变量</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/svn" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">SVN Patch 操作</div>
          <div class="card-desc">快速跨分支生成并应用补丁文件</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/android-so" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a4 4 0 0 0-4 4v1H7a2 2 0 0 0-2 2v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4z"></path>
            <path d="M9 11h6"></path>
            <path d="M9 15h6"></path>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">Android SO Tooling</div>
          <div class="card-desc">Build libUE4.so, replace into APK, and run AndroidInject flow with live logs.</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/inspector" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M12 2v2"></path>
            <path d="M12 20v2"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">Runtime Actor Inspector</div>
          <div class="card-desc">通过 adb forward 连接手机包，按屏幕坐标选中 Actor 并查看属性树。</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/pak-tool" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
            <path d="m3.3 7 8.7 5 8.7-5"></path>
            <path d="M12 22V12"></path>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">Pak Tool</div>
          <div class="card-desc">启动 trunk 下的 CookAndPakAsset，并快速打开工具目录和输出目录</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/knowledge" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">知识卡片</div>
          <div class="card-desc">浏览、搜索和管理从对话中提取的结构化知识卡片</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>

      <NuxtLink to="/prompt" class="dashboard-card">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03442 19.176 5.09912 19.431 5.02102 19.667L4.62991 20.854C4.50295 21.239 4.85305 21.602 5.23905 21.488L6.47391 21.124C6.70291 21.057 6.94991 21.11 7.12691 21.267C8.52891 21.744 10.2319 22 12 22Z"></path>
            <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"></circle>
            <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"></circle>
            <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"></circle>
            <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor"></circle>
          </svg>
        </div>
        <div class="card-content">
          <div class="card-title">提示词管理器</div>
          <div class="card-desc">角色、场景、特效等美术 AI 图片生成提示词模板，支持一键复制与自定义管理。</div>
        </div>
        <div class="card-action">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  const cards = document.querySelectorAll('.dashboard-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  });
});
</script>

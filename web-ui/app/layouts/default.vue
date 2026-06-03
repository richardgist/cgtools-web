<template>
  <div class="app-container">
    <!-- Navigation Sidebar -->
    <nav class="navigation-view">
      <div class="nav-header">
        <div class="nav-toggle session-drag-region">
          <span class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </span>
        </div>
      </div>

      <div class="nav-items">
        <NuxtLink to="/" class="nav-item" exact-active-class="active" title="主页">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </span>
          <span class="nav-label">主页</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <div class="nav-separator"></div>
        <div class="nav-group-title">工具</div>

        <NuxtLink to="/scripts" class="nav-item" exact-active-class="active" title="脚本运行器">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
          </span>
          <span class="nav-label">脚本运行器</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <a href="/table-viewer" class="nav-item" title="配置表浏览器">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2"></rect>
              <line x1="3" y1="10" x2="21" y2="10"></line>
              <line x1="9" y1="4" x2="9" y2="20"></line>
              <line x1="15" y1="4" x2="15" y2="20"></line>
            </svg>
          </span>
          <span class="nav-label">配置表浏览器</span>
          <div class="nav-indicator"></div>
        </a>

        <NuxtLink to="/claude" class="nav-item" exact-active-class="active" title="Claude 配置">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="12" cy="5" r="2"></circle>
              <path d="M12 7v4"></path>
              <line x1="8" y1="16" x2="8" y2="16"></line>
              <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
          </span>
          <span class="nav-label">Claude 配置</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/svn" class="nav-item" exact-active-class="active" title="SVN Patch">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </span>
          <span class="nav-label">SVN Patch</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/bridge" class="nav-item" exact-active-class="active" title="Bridge API">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          </span>
          <span class="nav-label">Bridge API</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/inspector" class="nav-item" exact-active-class="active" title="Actor Inspector">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 2v2"></path>
              <path d="M12 20v2"></path>
              <path d="M2 12h2"></path>
              <path d="M20 12h2"></path>
            </svg>
          </span>
          <span class="nav-label">Actor Inspector</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/android-so" class="nav-item" exact-active-class="active" title="Android SO">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a4 4 0 0 0-4 4v1H7a2 2 0 0 0-2 2v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4z"></path>
              <path d="M9 11h6"></path>
              <path d="M9 15h6"></path>
            </svg>
          </span>
          <span class="nav-label">Android SO</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/pak-tool" class="nav-item" exact-active-class="active" title="Pak Tool">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
              <path d="m3.3 7 8.7 5 8.7-5"></path>
              <path d="M12 22V12"></path>
            </svg>
          </span>
          <span class="nav-label">Pak Tool</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <NuxtLink to="/prompt" class="nav-item" exact-active-class="active" title="提示词管理">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03442 19.176 5.09912 19.431 5.02102 19.667L4.62991 20.854C4.50295 21.239 4.85305 21.602 5.23905 21.488L6.47391 21.124C6.70291 21.057 6.94991 21.11 7.12691 21.267C8.52891 21.744 10.2319 22 12 22Z"></path>
              <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"></circle>
              <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"></circle>
              <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"></circle>
              <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor"></circle>
            </svg>
          </span>
          <span class="nav-label">提示词管理</span>
          <div class="nav-indicator"></div>
        </NuxtLink>

        <div class="nav-separator"></div>
        <div class="nav-group-title">知识库</div>

        <NuxtLink to="/knowledge" class="nav-item" exact-active-class="active" title="知识卡片">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </span>
          <span class="nav-label">知识卡片</span>
          <div class="nav-indicator"></div>
        </NuxtLink>
      </div>

      <div class="nav-footer">
        <NuxtLink to="/settings" class="nav-item" exact-active-class="active" title="设置">
          <span class="nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </span>
          <span class="nav-label">设置</span>
          <div class="nav-indicator"></div>
        </NuxtLink>
      </div>
    </nav>

    <!-- Main Content Area -->
    <main class="content-view">
      <slot />

      <!-- Global Status Bar -->
      <div class="app-status-bar">
        <div id="status-text">就绪</div>
        <div class="version-tag">v2.0.0-nuxt</div>
      </div>
    </main>
  </div>
</template>

<script setup>
</script>

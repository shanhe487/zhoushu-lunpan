/**
 * 咒术轮盘 - 概率编辑器
 * 离线版增强功能：可随时修改当前轮盘各选项的抽取权重
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'zhoushu_lunpan_custom_weights_v1';
  const ORIGINAL_KEY = 'zhoushu_lunpan_original_weights_v1';

  // 自定义权重 {wheelId: {optionId: weight}}
  let customWeights = {};
  // 原始权重备份 {wheelId: {optionId: weight}}
  let originalWeights = {};
  // 当前显示的轮盘ID
  let currentWheelId = null;
  // 面板DOM引用
  let panel, listEl, wheelNameEl;

  // ========== 存储 ==========
  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) customWeights = JSON.parse(raw) || {};
    } catch (e) { console.warn('读取自定义权重失败', e); }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customWeights));
    } catch (e) { console.warn('保存自定义权重失败', e); }
  }

  function backupOriginalWeights() {
    try {
      const raw = localStorage.getItem(ORIGINAL_KEY);
      if (raw) {
        originalWeights = JSON.parse(raw) || {};
        return;
      }
    } catch (e) {}
    // 从游戏规则文档中备份所有轮盘权重
    const roulette = window.roulette;
    if (!roulette || !roulette._de) return;
    const doc = roulette._de;
    if (!doc || !Array.isArray(doc.wheels)) return;
    doc.wheels.forEach(wheel => {
      if (!wheel.id || !Array.isArray(wheel.options)) return;
      originalWeights[wheel.id] = {};
      wheel.options.forEach(opt => {
        if (opt.id != null) originalWeights[wheel.id][opt.id] = opt.weight;
      });
    });
    try {
      localStorage.setItem(ORIGINAL_KEY, JSON.stringify(originalWeights));
    } catch (e) {}
  }

  // ========== 应用自定义权重到游戏 ==========
  function applyCustomWeightsToGame() {
    const roulette = window.roulette;
    if (!roulette || !roulette._de) return;
    const doc = roulette._de;
    if (!doc || !Array.isArray(doc.wheels)) return;

    doc.wheels.forEach(wheel => {
      const custom = customWeights[wheel.id];
      if (!custom) return;
      wheel.options.forEach(opt => {
        if (custom[opt.id] != null) {
          opt.weight = Number(custom[opt.id]);
        }
      });
    });

    // 如果当前轮盘有自定义权重，刷新显示
    const info = roulette.getCurrentWheelInfo ? roulette.getCurrentWheelInfo() : null;
    if (info && customWeights[info.id]) {
      roulette.refreshWheelDisplay();
    }
  }

  // ========== UI 渲染 ==========
  function initPanel() {
    panel = document.getElementById('prob-panel');
    listEl = document.getElementById('prob-list');
    wheelNameEl = document.getElementById('prob-wheel-name');

    if (!panel) return;

    const overlay = document.getElementById('prob-overlay');
    const fab = document.getElementById('prob-fab');
    const closeBtn = document.getElementById('prob-panel-close');

    function openPanel() {
      panel.classList.add('show');
      if (overlay) overlay.classList.add('show');
      renderPanel();
    }
    function closePanel() {
      panel.classList.remove('show');
      if (overlay) overlay.classList.remove('show');
    }

    if (fab) fab.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });

    // 应用按钮
    document.getElementById('prob-apply').addEventListener('click', applyFromInputs);
    // 重置按钮
    document.getElementById('prob-reset').addEventListener('click', resetCurrentWheel);

    // 清理存档按钮
    const clearFab = document.getElementById('clear-fab');
    if (clearFab) {
      clearFab.addEventListener('click', () => {
        if (!confirm('确定要清理所有存档吗？\n\n这将删除：\n· 当前人生记录\n· 所有历史归档\n· 自定义权重设置\n· 游戏设置\n\n此操作不可恢复！')) return;
        try {
          // 清除所有 localStorage
          localStorage.clear();
          showToast('存档已清理，正在刷新…');
          setTimeout(() => location.reload(), 800);
        } catch (e) {
          alert('清理失败：' + e.message);
        }
      });
    }
  }

  function renderPanel() {
    const roulette = window.roulette;
    if (!roulette || typeof roulette.getCurrentWheelInfo !== 'function') return;

    const info = roulette.getCurrentWheelInfo();
    if (!info || !info.id) {
      wheelNameEl.textContent = '等待轮盘加载…';
      listEl.innerHTML = '';
      return;
    }

    currentWheelId = info.id;
    wheelNameEl.textContent = '当前轮盘：' + info.name;

    const totalWeight = info.options.reduce((s, o) => s + Number(o.weight || 0), 0);
    const custom = customWeights[info.id] || {};

    listEl.innerHTML = info.options.map((opt, idx) => {
      const isModified = custom[opt.id] != null;
      const pct = totalWeight > 0 ? (opt.weight / totalWeight * 100).toFixed(1) : '0.0';
      return `
        <div class="prob-row ${isModified ? 'modified' : ''}" data-option-id="${escapeHtml(opt.id)}">
          <span class="row-num">${String(idx + 1).padStart(2, '0')}</span>
          <span class="prob-label" title="${escapeHtml(opt.label)}">${escapeHtml(opt.label)}</span>
          <input type="number" class="prob-input" value="${Number(opt.weight)}" min="0" step="0.5" data-option-id="${escapeHtml(opt.id)}">
          <span class="prob-pct">${pct}%</span>
          <div class="prob-bar-wrap"><div class="prob-bar" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');

    // 输入变化时实时更新百分比显示
    listEl.querySelectorAll('.prob-input').forEach(input => {
      input.addEventListener('input', updatePercentages);
    });
  }

  function updatePercentages() {
    const rows = listEl.querySelectorAll('.prob-row');
    let total = 0;
    const values = [];
    rows.forEach(row => {
      const input = row.querySelector('.prob-input');
      const v = Math.max(0, Number(input.value) || 0);
      values.push(v);
      total += v;
    });
    rows.forEach((row, idx) => {
      const pctEl = row.querySelector('.prob-pct');
      const barEl = row.querySelector('.prob-bar');
      const pct = total > 0 ? (values[idx] / total * 100).toFixed(1) : '0.0';
      if (pctEl) pctEl.textContent = pct + '%';
      if (barEl) barEl.style.width = pct + '%';
    });
  }

  function applyFromInputs() {
    const roulette = window.roulette;
    if (!roulette || !currentWheelId) return;

    const inputs = listEl.querySelectorAll('.prob-input');
    let hasChange = false;

    inputs.forEach(input => {
      const optId = input.dataset.optionId;
      const newWeight = Math.max(0, Number(input.value) || 0);
      const orig = originalWeights[currentWheelId]?.[optId];

      // 如果和原始值相同，从自定义表中移除
      if (orig != null && Math.abs(newWeight - Number(orig)) < 0.001) {
        if (customWeights[currentWheelId] && customWeights[currentWheelId][optId] != null) {
          delete customWeights[currentWheelId][optId];
          hasChange = true;
        }
      } else {
        if (!customWeights[currentWheelId]) customWeights[currentWheelId] = {};
        if (customWeights[currentWheelId][optId] !== newWeight) {
          customWeights[currentWheelId][optId] = newWeight;
          hasChange = true;
        }
      }

      // 立即应用到游戏
      roulette.setOptionWeight(currentWheelId, optId, newWeight);
    });

    // 清理空的轮盘条目
    if (customWeights[currentWheelId] && Object.keys(customWeights[currentWheelId]).length === 0) {
      delete customWeights[currentWheelId];
    }

    if (hasChange) {
      saveStorage();
    }

    // 重新渲染以更新modified标记
    renderPanel();
    showToast('权重已应用');
  }

  function resetCurrentWheel() {
    if (!currentWheelId) return;
    const roulette = window.roulette;
    if (!roulette) return;

    const orig = originalWeights[currentWheelId];
    if (!orig) {
      showToast('未找到原始权重备份');
      return;
    }

    // 恢复所有选项
    Object.entries(orig).forEach(([optId, weight]) => {
      roulette.setOptionWeight(currentWheelId, optId, weight);
    });

    // 从自定义表中移除
    delete customWeights[currentWheelId];
    saveStorage();
    renderPanel();
    showToast('已恢复默认权重');
  }

  // ========== 工具 ==========
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  let toastTimer = null;
  function showToast(msg) {
    let toast = document.getElementById('prob-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'prob-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(40,30,60,0.95);color:#d4c4ff;padding:10px 24px;border-radius:8px;font-size:13px;z-index:100000;border:1px solid rgba(180,140,255,0.3);box-shadow:0 4px 16px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
  }

  // ========== 主循环 ==========
  let lastWheelId = null;
  let initDone = false;

  function tick() {
    const roulette = window.roulette;
    if (!roulette || typeof roulette.getCurrentWheelInfo !== 'function') {
      requestAnimationFrame(tick);
      return;
    }

    if (!initDone) {
      initDone = true;
      backupOriginalWeights();
      loadStorage();
      applyCustomWeightsToGame();
      initPanel();
    }

    const info = roulette.getCurrentWheelInfo();
    const wheelId = info ? info.id : null;

    // 轮盘切换时重新渲染面板
    if (wheelId !== lastWheelId) {
      lastWheelId = wheelId;
      renderPanel();
    }
  }

  // 启动
  function start() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick));
    } else {
      requestAnimationFrame(tick);
    }
    // 持续检查轮盘变化
    setInterval(tick, 500);
  }

  start();
})();

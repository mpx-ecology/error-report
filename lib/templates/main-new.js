// SPA路由管理器
class SPARouter {
    constructor() {
        this.currentPage = 'main';
        this.params = {};
        this.pageHandlers = {};
        this.init();
    }

    init() {
        // 监听浏览器前进后退
        window.addEventListener('popstate', (e) => {
            if (e.state) {
                this.navigateTo(e.state.page, e.state.params, false);
            }
        });

        // 初始化路由 - 延迟执行以确保DOM完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.parseRoute();
            });
        } else {
            // DOM已经加载完成，立即解析路由
            this.parseRoute();
        }
    }

    parseRoute() {
        const hash = window.location.hash.slice(1) || 'main';
        const [page, paramString] = hash.split('?');
        
        const params = {};
        if (paramString) {
            paramString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key && value !== undefined) {
                    params[key] = decodeURIComponent(value);
                }
            });
        }

        this.navigateTo(page, params, false);
    }

    navigateTo(page, params = {}, pushState = true) {
        console.log(`SPA导航到: ${page}`, { params, pushState });
        
        this.currentPage = page;
        this.params = params;

        // 更新URL
        const paramString = Object.keys(params).length > 0 
            ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            : '';
        
        const hash = `#${page}${paramString}`;
        console.log(`更新URL为: ${hash}`);
        
        if (pushState) {
            window.history.pushState({ page, params }, '', hash);
        } else {
            window.history.replaceState({ page, params }, '', hash);
        }

        // 切换页面显示
        this.showPage(page);
        
        // 根据页面类型预加载脚本并调用处理器
        this.handlePageNavigation(page, params);
    }

    async handlePageNavigation(page, params) {
        console.log(`处理页面导航: ${page}`, params);
        
        try {
            let scriptLoaded = false;
            
            switch (page) {
                case 'error-detail':
                    // 检查 error-detail.js 是否已加载
                    if (!window.ErrorDetailPage) {
                        console.log('加载 error-detail.js...');
                        await this.loadScript('error-detail.js');
                        scriptLoaded = true;
                        console.log('error-detail.js 加载完成');
                    }
                    
                    // 验证组件是否正确加载
                    if (!window.ErrorDetailPage || typeof window.ErrorDetailPage.init !== 'function') {
                        throw new Error('ErrorDetailPage 组件加载失败或 init 方法不存在');
                    }
                    break;
                case 'file-detail':
                    // 检查 file-detail.js 是否已加载
                    if (!window.FileDetailPage) {
                        console.log('加载 file-detail.js...');
                        await this.loadScript('file-detail.js');
                        scriptLoaded = true;
                        console.log('file-detail.js 加载完成');
                    }
                    
                    // 验证组件是否正确加载
                    if (!window.FileDetailPage || typeof window.FileDetailPage.init !== 'function') {
                        throw new Error('FileDetailPage 组件加载失败或 init 方法不存在');
                    }
                    break;
            }
            
            // 如果刚加载了脚本，等待更长时间确保脚本完全初始化
            const waitTime = scriptLoaded ? 200 : 50;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // 调用页面处理器
            if (this.pageHandlers[page]) {
                console.log(`调用页面处理器: ${page}`);
                try {
                    await this.pageHandlers[page](params);
                    console.log(`页面处理器 ${page} 执行完成`);
                } catch (handlerError) {
                    console.error(`页面处理器执行失败 (${page}):`, handlerError);
                    throw handlerError;
                }
            } else {
                console.warn(`页面处理器未找到: ${page}`);
            }
        } catch (error) {
            console.error(`处理页面导航失败 (${page}):`, error);
            
            // 显示具体的错误信息而不是直接跳转
            if (page !== 'main') {
                const errorMessage = error.message || '未知错误';
                const shouldReturnToMain = confirm(`页面加载失败: ${errorMessage}\n\n是否返回主页面？`);
                if (shouldReturnToMain) {
                    this.navigateTo('main');
                } else {
                    // 用户选择不返回，显示错误状态
                    const container = document.getElementById(page === 'error-detail' ? 'errorDetailContent' : 'fileDetailContent');
                    if (container) {
                        container.innerHTML = `
                            <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                                <h3>页面加载失败</h3>
                                <p>${errorMessage}</p>
                                <button onclick="window.SPA.navigateTo('main')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                    返回主页面
                                </button>
                            </div>
                        `;
                    }
                }
            }
        }
    }

    async loadScript(src) {
        return new Promise((resolve, reject) => {
            // 检查脚本是否已经存在
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                console.log(`脚本 ${src} 已存在，跳过加载`);
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            
            // 设置超时机制（10秒）
            const timeout = setTimeout(() => {
                reject(new Error(`脚本加载超时: ${src}`));
            }, 10000);
            
            script.onload = () => {
                clearTimeout(timeout);
                console.log(`脚本加载成功: ${src}`);
                resolve();
            };
            
            script.onerror = (error) => {
                clearTimeout(timeout);
                console.error(`脚本加载失败: ${src}`, error);
                reject(new Error(`脚本加载失败: ${src}`));
            };
            
            document.head.appendChild(script);
        });
    }

    showPage(page) {
        console.log(`SPA显示页面: ${page}`);
        
        // 隐藏所有页面
        document.querySelectorAll('.spa-page').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        // 显示目标页面
        const pageMap = {
            'main': 'mainPageContainer',
            'error-detail': 'errorDetailContainer',
            'file-detail': 'fileDetailContainer'
        };

        const containerId = pageMap[page] || 'mainPageContainer';
        const container = document.getElementById(containerId);
        if (container) {
            container.classList.add('active');
            container.style.display = 'block';
            console.log(`成功显示页面容器: ${containerId}`);
        } else {
            console.error(`页面容器未找到: ${containerId}`);
        }

        // 更新面包屑
        this.updateBreadcrumb(page);
        
        // 更新页面特定的UI元素显示状态
        this.updatePageSpecificUI(page);
    }

    updateBreadcrumb(page) {
        const breadcrumb = document.getElementById('spaBreadcrumb');
        const breadcrumbContent = document.getElementById('breadcrumbContent');
        
        if (page === 'main') {
            breadcrumb.classList.remove('show');
        } else {
            breadcrumb.classList.add('show');
            
            if (page === 'error-detail') {
                breadcrumbContent.innerHTML = `
                    <span class="spa-breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
                    <span class="spa-breadcrumb-item">错误详情</span>
                `;
            } else if (page === 'file-detail') {
                breadcrumbContent.innerHTML = `
                    <span class="spa-breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
                    <span class="spa-breadcrumb-item">文件详情</span>
                `;
            }
        }
    }

    updatePageSpecificUI(page) {
        const lastUpdate = document.getElementById('lastUpdate');
        const groupTabs = document.getElementById('groupTabs');
        
        if (page === 'main') {
            // 主页面：显示lastUpdate和groupTabs
            if (lastUpdate) lastUpdate.style.display = 'block';
            if (groupTabs) groupTabs.style.display = 'block';
        } else {
            // 详情页面：隐藏lastUpdate和groupTabs
            if (lastUpdate) lastUpdate.style.display = 'none';
            if (groupTabs) groupTabs.style.display = 'none';
        }
    }

    registerPageHandler(page, handler) {
        this.pageHandlers[page] = handler;
    }
}

// 创建全局SPA实例
const SPA = new SPARouter();

// 全局数据缓存
let reportDataCache = null;
let errorDataCache = new Map();

// WebSocket连接管理
let ws = null;
let currentReport = null;
let currentView = 'modules'; // 'modules' 或 'files'
let activeFilters = new Set(['errors', 'warnings']); // 当前激活的过滤器
let activeCategoryFilters = new Set(); // 当前激活的错误类型过滤器

// 当前选中的分组
let currentGroup = null;

// 缓存的分组数据（用于固定 group-tab）
let cachedGroupData = null;

// 错误类型映射
const ERROR_TYPE_MAPPING = {
    'styleError': '样式错误',
    'templateError': '模板错误', 
    'syntaxError': '语法错误',
    'jsonError': 'JSON配置错误',
    'moduleNotFound': '资源加载错误',
    'modulesBuildError': '编译错误',
    'eslintError': 'eslint错误',
    'TSError': 'TS类型错误',
    'lackOfLoader': '缺少loader',
    'unknown': '未知错误'
};

// DOM元素
const elements = {
    errorList: document.getElementById('errorList'),
    totalErrors: document.getElementById('totalErrors'),
    warnings: document.getElementById('warnings'),
    lastUpdate: document.getElementById('lastUpdate'),
    searchInput: document.getElementById('searchInput'),
    tabButtons: document.querySelectorAll('.tab-button'),
    groupTabs: document.getElementById('groupTabs'),
    filterButtons: document.querySelectorAll('.filter-button')
};

// 初始化WebSocket连接
function initWebSocket() {
    fetch('/server-info')
        .then(response => response.json())
        .then(info => {
            const port = info.port;
            const host = window.location.hostname;
            ws = new WebSocket(`ws://${host}:${port}`);
            
            ws.onopen = () => {
                console.log('WebSocket连接已建立');
            };
            
            ws.onclose = () => {
                console.log('WebSocket连接已关闭');
                setTimeout(initWebSocket, 5000);
            };
            
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
        })
        .catch(error => {
            console.error('获取服务器信息失败:', error);
            setTimeout(initWebSocket, 5000);
        });
}

// 处理WebSocket消息
function handleWebSocketMessage(message) {
    if (message.type === 'report-update') {
        try {
            const currentTimestamp = message.data.timestamp || new Date().toISOString();
            const originalErrors = message.data.errors || {};
            const originalWarnings = message.data.warnings || {};

            currentReport = {
                timestamp: currentTimestamp,
                errors: originalErrors,
                warnings: originalWarnings
            };
            
            // 缓存报告数据
            reportDataCache = currentReport;
            
            // 保存到会话存储
            try {
                sessionStorage.setItem('report-data-cache', JSON.stringify(currentReport));
                console.log('报告数据已保存到 sessionStorage');
            } catch (e) {
                console.warn('保存数据到会话存储失败:', e);
            }
            
            // 清除分组缓存，因为数据已更新
            cachedGroupData = null;
            console.log('New report loaded, clearing group cache');
            
            // 重新构建错误数据缓存
            rebuildErrorCache();
            
            updateUI();
        } catch (error) {
            console.error('处理数据时出错:', error);
        }
    }
}

// 重新构建错误数据缓存
function rebuildErrorCache() {
    errorDataCache.clear();
    console.log('重新构建错误数据缓存...');
    
    if (currentReport) {
        let globalIndex = 0;  // 统一的全局索引，包括错误和警告
        let totalErrors = 0;
        let totalWarnings = 0;
        
        // 首先处理错误数据
        if (currentReport.errors) {
            Object.entries(currentReport.errors).forEach(([group, errors]) => {
                if (Array.isArray(errors)) {
                    errors.forEach((error, localIndex) => {
                        // 创建URL友好的安全ID
                        const safeGroupName = group.replace(/[^a-zA-Z0-9]/g, '_'); // 替换特殊字符为下划线
                        const baseId = error.id || error.uuid || `${safeGroupName}_${localIndex}`;
                        const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]/g, '_'); // 确保ID只包含安全字符
                        
                        const errorId = `err_${safeBaseId}`;  // 错误类型前缀
                        const flatId = `flat_${globalIndex}`;  // 简化的全局索引ID
                        const urlSafeId = `e${globalIndex}`; // 最简洁的URL安全ID
                        
                        const errorData = {
                            ...error,
                            _type: 'error',
                            _group: group,
                            _id: errorId,
                            _flatId: flatId,
                            _urlSafeId: urlSafeId,  // 新增：URL安全的简洁ID
                            _prefixedId: errorId,   // 保持兼容性
                            _localIndex: localIndex,
                            _globalIndex: globalIndex
                        };
                        
                        // 使用多个ID存储同一个错误数据，优先使用URL安全的ID
                        errorDataCache.set(urlSafeId, errorData);  // 主要ID：最简洁的URL安全ID
                        errorDataCache.set(errorId, errorData);
                        errorDataCache.set(flatId, errorData);
                        errorDataCache.set(`error_${globalIndex}`, errorData);
                        if (error.id) errorDataCache.set(error.id, errorData);
                        if (error.uuid) errorDataCache.set(error.uuid, errorData);
                        
                        console.log(`缓存错误: ${urlSafeId} -> ${error.message || 'No message'} (group: ${group}, local: ${localIndex})`);
                        
                        globalIndex++; // 统一递增
                        totalErrors++;
                    });
                }
            });
        }
        
        // 然后处理警告数据，继续使用同一个全局索引
        if (currentReport.warnings) {
            Object.entries(currentReport.warnings).forEach(([group, warnings]) => {
                if (Array.isArray(warnings)) {
                    warnings.forEach((warning, localIndex) => {
                        // 创建URL友好的安全ID
                        const safeGroupName = group.replace(/[^a-zA-Z0-9]/g, '_'); // 替换特殊字符为下划线
                        const baseId = warning.id || warning.uuid || `${safeGroupName}_${localIndex}`;
                        const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]/g, '_'); // 确保ID只包含安全字符
                        
                        const warningId = `warn_${safeBaseId}`;  // 警告类型前缀
                        const flatId = `flat_${globalIndex}`;  // 简化的全局索引ID
                        const urlSafeId = `w${globalIndex}`; // 最简洁的URL安全ID
                        
                        const warningData = {
                            ...warning,
                            _type: 'warning',
                            _group: group,
                            _id: warningId,
                            _flatId: flatId,
                            _urlSafeId: urlSafeId,  // 新增：URL安全的简洁ID
                            _prefixedId: warningId, // 保持兼容性
                            _localIndex: localIndex,
                            _globalIndex: globalIndex
                        };
                        
                        // 使用多个ID存储同一个警告数据，优先使用URL安全的ID
                        errorDataCache.set(urlSafeId, warningData);  // 主要ID：最简洁的URL安全ID
                        errorDataCache.set(warningId, warningData);
                        errorDataCache.set(flatId, warningData);
                        errorDataCache.set(`warning_${globalIndex}`, warningData);
                        if (warning.id) errorDataCache.set(warning.id, warningData);
                        if (warning.uuid) errorDataCache.set(warning.uuid, warningData);
                        
                        console.log(`缓存警告: ${urlSafeId} -> ${warning.message || 'No message'} (group: ${group}, local: ${localIndex})`);
                        
                        globalIndex++; // 统一递增
                        totalWarnings++;
                    });
                }
            });
        }
        
        console.log(`缓存重建完成: ${totalErrors} 个错误, ${totalWarnings} 个警告, 总计 ${globalIndex} 项, 缓存大小: ${errorDataCache.size}`);
        
        // 将错误缓存保存到 sessionStorage
        try {
            const cacheData = {};
            errorDataCache.forEach((value, key) => {
                cacheData[key] = value;
            });
            sessionStorage.setItem('error-data-cache', JSON.stringify(cacheData));
            console.log('错误缓存已保存到 sessionStorage');
        } catch (e) {
            console.warn('保存错误缓存失败:', e);
        }
    } else {
        console.log('没有报告数据，无法重建缓存');
    }
}

// 更新UI
function updateUI() {
    if (!currentReport) return;
    
    console.log('更新UI - 当前视图:', currentView, '活动过滤器:', Array.from(activeFilters));
    
    updateStats();
    updateLastUpdateTime();
    // 初始化时第一次计算分组数据，后续使用缓存
    updateGroupTabs(cachedGroupData !== null);
    
    const searchTerm = elements.searchInput?.value.toLowerCase() || '';
    if (currentView === 'modules') {
        renderModulesList(searchTerm);
    } else {
        renderFilesList(searchTerm);
    }
}

// 更新错误类型过滤器
function updateErrorCategoryFilters(categoryFiltersContainer, categoryButtonsContainer, currentErrors = [], currentWarnings = []) {
    if (!categoryFiltersContainer || !categoryButtonsContainer || !currentReport) return;
    
    // 统计当前分组下各类型错误数量
    const categoryStats = {};
    
    // 如果没有传入当前分组的数据，则使用全部数据
    let errorsToProcess = currentErrors;
    let warningsToProcess = currentWarnings;
    
    if (errorsToProcess.length === 0 && warningsToProcess.length === 0) {
        // 统计所有错误
        if (activeFilters.has('errors')) {
            Object.entries(currentReport.errors || {}).forEach(([group, items]) => {
                errorsToProcess.push(...items);
            });
        }
        
        // 统计所有警告
        if (activeFilters.has('warnings')) {
            Object.entries(currentReport.warnings || {}).forEach(([group, items]) => {
                warningsToProcess.push(...items);
            });
        }
    }
    
    // 统计错误类型
    errorsToProcess.forEach(item => {
        const type = item.type || 'unknown';
        if (!categoryStats[type]) {
            categoryStats[type] = { errors: 0, warnings: 0 };
        }
        categoryStats[type].errors++;
    });
    
    // 统计警告类型
    warningsToProcess.forEach(item => {
        const type = item.type || 'unknown';
        if (!categoryStats[type]) {
            categoryStats[type] = { errors: 0, warnings: 0 };
        }
        categoryStats[type].warnings++;
    });
    
    // 清空现有按钮
    categoryButtonsContainer.innerHTML = '';
    
    // 如果没有数据，显示提示
    if (Object.keys(categoryStats).length === 0) {
        categoryButtonsContainer.innerHTML = '<div class="empty-category-state">暂无错误类型数据</div>';
        return;
    }
    
    // 创建"全部类型"按钮
    const allButton = document.createElement('button');
    allButton.className = `category-button ${activeCategoryFilters.size === 0 ? 'active' : ''}`;
    allButton.setAttribute('data-category', 'all');
    const totalCount = Object.values(categoryStats).reduce((sum, stat) => sum + stat.errors + stat.warnings, 0);
    allButton.innerHTML = `
        <span class="icon">📁</span>
        <span>全部类型</span>
        <span class="count">${totalCount}</span>
    `;
    allButton.addEventListener('click', () => {
        activeCategoryFilters.clear();
        updateActiveCategoryButtons();
        // 分类过滤器改变时使用缓存的分组数据
        updateGroupTabs(true);
        renderModulesList(elements.searchInput?.value.toLowerCase() || '');
    });
    categoryButtonsContainer.appendChild(allButton);
    
    // 按错误+警告总数排序，然后创建各类型按钮
    const sortedTypes = Object.entries(categoryStats).sort(([, a], [, b]) => {
        return (b.errors + b.warnings) - (a.errors + a.warnings);
    });
    
    sortedTypes.forEach(([type, stats]) => {
        const button = document.createElement('button');
        button.className = `category-button ${activeCategoryFilters.has(type) ? 'active' : ''}`;
        button.setAttribute('data-category', type);
        
        const typeName = ERROR_TYPE_MAPPING[type] || type;
        const totalCount = stats.errors + stats.warnings;
        
        button.innerHTML = `
            <span class="icon"></span>
            <span>${typeName}</span>
            <span class="count">${totalCount}</span>
        `;
        
        button.addEventListener('click', () => {
            if (activeCategoryFilters.has(type)) {
                activeCategoryFilters.delete(type);
            } else {
                activeCategoryFilters.add(type);
            }
            updateActiveCategoryButtons();
            // 分类过滤器改变时使用缓存的分组数据
            updateGroupTabs(true);
            renderModulesList(elements.searchInput?.value.toLowerCase() || '');
        });
        
        categoryButtonsContainer.appendChild(button);
    });
}

// 更新活动错误类型按钮状态
function updateActiveCategoryButtons() {
    const buttons = document.querySelectorAll('.category-button');
    buttons.forEach(button => {
        const category = button.getAttribute('data-category');
        if (category === 'all') {
            button.classList.toggle('active', activeCategoryFilters.size === 0);
        } else {
            button.classList.toggle('active', activeCategoryFilters.has(category));
        }
    });
}

// 更新统计信息
function updateStats() {
    const totalErrors = Object.values(currentReport.errors)
        .reduce((total, group) => total + group.length, 0);
    const totalWarnings = Object.values(currentReport.warnings)
        .reduce((total, group) => total + group.length, 0);

    if (elements.totalErrors) {
        elements.totalErrors.textContent = totalErrors;
    }
    if (elements.warnings) {
        elements.warnings.textContent = totalWarnings;
    }
}

// 更新最后更新时间
function updateLastUpdateTime() {
    const date = new Date(currentReport.timestamp);
    elements.lastUpdate.textContent = `最后更新: ${date.toLocaleString()}`;
}

// 更新分组导航栏 - 支持缓存模式
function updateGroupTabs(useCache = false) {
    const groupTabsContainer = document.getElementById('groupTabs');
    if (!groupTabsContainer || !currentReport) return;

    groupTabsContainer.innerHTML = '';
    
    // 只在模块视图下显示分组标签
    if (currentView !== 'modules') {
        groupTabsContainer.style.display = 'none';
        return;
    } else {
        groupTabsContainer.style.display = 'block';
    }

    let allData;

    if (useCache && cachedGroupData) {
        // 使用缓存的分组数据
        console.log('Using cached group data for tabs');
        allData = cachedGroupData;
    } else {
        // 重新计算分组数据
        console.log('Calculating new group data for tabs');
        allData = calculateGroupDataForTabs();
        
        // 第一次计算时缓存数据（仅在初始化时）
        if (!cachedGroupData) {
            cachedGroupData = allData;
            console.log('Cached group data for tabs:', Object.keys(cachedGroupData));
        }
    }

    // 总是添加"全部"标签，即使没有数据
    const allTab = document.createElement('button');
    allTab.className = `group-tab ${!currentGroup ? 'active' : ''}`;
    const totalCount = Object.values(allData).reduce((total, group) => total + group.length, 0);
    allTab.innerHTML = `全部 <span class="count">${totalCount}</span>`;
    allTab.addEventListener('click', () => {
        currentGroup = null;
        updateActiveGroupTab();
        renderModulesList(elements.searchInput?.value.toLowerCase() || '');
    });
    groupTabsContainer.appendChild(allTab);

    // 如果有分组数据，添加各个分组的标签
    if (Object.keys(allData).length > 0) {
        const sortedGroups = Object.entries(allData).sort(([keyA], [keyB]) => {
            if (keyA === '其他') return 1;
            if (keyB === '其他') return -1;
            return 0;
        });

        sortedGroups.forEach(([group, items]) => {
            const tab = document.createElement('button');
            tab.className = `group-tab ${currentGroup === group ? 'active' : ''}`;
            const cleanedGroupName = group.split('?')[0];
            tab.innerHTML = `${cleanedGroupName} <span class="count">${items.length}</span>`;
            tab.addEventListener('click', () => {
                currentGroup = group;
                updateActiveGroupTab();
                renderModulesList(elements.searchInput?.value.toLowerCase() || '');
            });
            groupTabsContainer.appendChild(tab);
        });
    }
}

// 计算分组数据（用于标签页）
function calculateGroupDataForTabs() {
    const allData = {};
    
    // 合并错误和警告数据用于分组显示（不受当前过滤器限制）
    if (currentReport.errors) {
        Object.entries(currentReport.errors).forEach(([group, items]) => {
            if (!allData[group]) allData[group] = [];
            allData[group].push(...items.map(item => ({...item, _type: 'error'})));
        });
    }
    
    if (currentReport.warnings) {
        Object.entries(currentReport.warnings).forEach(([group, items]) => {
            if (!allData[group]) allData[group] = [];
            allData[group].push(...items.map(item => ({...item, _type: 'warning'})));
        });
    }

    return allData;
}

// 更新活动标签状态
function updateActiveGroupTab() {
    const tabs = document.querySelectorAll('.group-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', 
            (!currentGroup && tab.textContent.includes('全部')) ||
            (currentGroup && tab.textContent.includes(currentGroup.split('?')[0]))
        );
    });
}

// 渲染模块列表
function renderModulesList(searchTerm = '') {
    if (!currentReport || !elements.errorList) return;

    elements.errorList.innerHTML = '';

    // 合并错误和警告数据
    const allData = {};
    
    if (activeFilters.has('errors')) {
        Object.entries(currentReport.errors || {}).forEach(([group, items]) => {
            if (!allData[group]) allData[group] = [];
            allData[group].push(...items.map(item => ({...item, _type: 'error'})));
        });
    }
    
    if (activeFilters.has('warnings')) {
        Object.entries(currentReport.warnings || {}).forEach(([group, items]) => {
            if (!allData[group]) allData[group] = [];
            allData[group].push(...items.map(item => ({...item, _type: 'warning'})));
        });
    }

    // 计算当前视图下的错误和警告数量（用于显示固定的总数）
    let totalErrorsInView = [];
    let totalWarningsInView = [];
    
    if (!currentGroup) {
        // 全部视图：计算所有分组的总数（不受过滤器影响）
        Object.entries(currentReport.errors || {}).forEach(([groupName, items]) => {
            totalErrorsInView.push(...items);
        });
        Object.entries(currentReport.warnings || {}).forEach(([groupName, items]) => {
            totalWarningsInView.push(...items);
        });
    } else {
        // 特定分组视图：只计算当前分组的总数（不受过滤器影响）
        if (currentReport.errors[currentGroup]) {
            totalErrorsInView = currentReport.errors[currentGroup];
        }
        if (currentReport.warnings[currentGroup]) {
            totalWarningsInView = currentReport.warnings[currentGroup];
        }
    }

    // 计算当前激活过滤器下的错误和警告数量（用于内部逻辑）
    let currentErrors = [];
    let currentWarnings = [];
    
    if (!currentGroup) {
        // 全部视图：计算所有分组的数量
        Object.values(allData).forEach(items => {
            currentErrors.push(...items.filter(item => item._type === 'error'));
            currentWarnings.push(...items.filter(item => item._type === 'warning'));
        });
    } else {
        // 特定分组视图：只计算当前分组的数量
        const groupItems = allData[currentGroup] || [];
        currentErrors = groupItems.filter(item => item._type === 'error');
        currentWarnings = groupItems.filter(item => item._type === 'warning');
    }

    // 始终使用"全部"视图的拍平显示格式，但根据当前分组过滤数据
    // 关键修复：从缓存中获取已处理的数据，确保ID一致性
    const allItems = [];
    
    errorDataCache.forEach(cachedItem => {
        // 应用分组过滤
        if (currentGroup && cachedItem._group !== currentGroup) {
            return; // 跳过不匹配的分组
        }
        
        // 应用错误/警告类型过滤
        if (cachedItem._type === 'error' && !activeFilters.has('errors')) {
            return; // 跳过错误类型
        }
        if (cachedItem._type === 'warning' && !activeFilters.has('warnings')) {
            return; // 跳过警告类型
        }
        
        // 添加到显示列表（使用缓存中已经处理过的完整数据）
        allItems.push(cachedItem);
    });

    // 计算固定的总数（用于 total-count，不受过滤器影响）
    let fixedTotalCount = 0;
    if (!currentGroup) {
        // 全部视图：计算所有分组的总数
        Object.entries(currentReport.errors || {}).forEach(([groupName, items]) => {
            fixedTotalCount += items.length;
        });
        Object.entries(currentReport.warnings || {}).forEach(([groupName, items]) => {
            fixedTotalCount += items.length;
        });
    } else {
        // 特定分组视图：只计算当前分组的总数
        if (currentReport.errors[currentGroup]) {
            fixedTotalCount += currentReport.errors[currentGroup].length;
        }
        if (currentReport.warnings[currentGroup]) {
            fixedTotalCount += currentReport.warnings[currentGroup].length;
        }
    }

    // 应用搜索过滤
    const filteredItems = filterItems(allItems, searchTerm);

    console.log('视图数据:', {
        currentGroup: currentGroup || '全部',
        totalItems: allItems.length,
        filteredItems: filteredItems.length,
        fixedTotalCount: fixedTotalCount,
        activeFilters: Array.from(activeFilters),
        hasErrors: activeFilters.has('errors'),
        hasWarnings: activeFilters.has('warnings')
    });

    // 创建拍平的错误列表容器
    const flatContainer = document.createElement('div');
    flatContainer.className = 'flat-error-list';

    // 添加头部信息
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flat-list-header';
    
    const groupDisplayName = currentGroup ? currentGroup.split('?')[0] : '全部';
    headerDiv.innerHTML = `
        <div class="flat-header-left">
            <h3>
                <i class="fas fa-list"></i>
                ${groupDisplayName}项目
                <span class="total-count">${fixedTotalCount}</span>
            </h3>
            <div class="error-type-filters">
                <button class="filter-button ${activeFilters.has('errors') ? 'active' : ''}" data-filter="errors">
                    <i class="fas fa-exclamation-circle"></i>
                    错误
                    <span class="count">${totalErrorsInView.length}</span>
                </button>
                <button class="filter-button ${activeFilters.has('warnings') ? 'active' : ''}" data-filter="warnings">
                    <i class="fas fa-exclamation-triangle"></i>
                    警告
                    <span class="count">${totalWarningsInView.length}</span>
                </button>
            </div>
        </div>
        <div class="flat-header-right">
            <div class="error-category-filters">
                <span class="filter-section-title">错误类型筛选:</span>
                <div class="category-buttons"></div>
            </div>
        </div>
    `;
    
    // 为错误/警告过滤按钮添加事件监听器
    const headerFilterButtons = headerDiv.querySelectorAll('.filter-button');
    headerFilterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const filter = button.getAttribute('data-filter');
            
            if (activeFilters.has(filter)) {
                activeFilters.delete(filter);
                button.classList.remove('active');
            } else {
                activeFilters.add(filter);
                button.classList.add('active');
            }
            
            console.log('头部过滤器状态:', Array.from(activeFilters));
            
            // 重新渲染
            updateGroupTabs(true);
            renderModulesList(elements.searchInput?.value.toLowerCase() || '');
        });
    });
    
    // 更新错误类型过滤器到头部右侧
    const headerCategoryButtonsContainer = headerDiv.querySelector('.category-buttons');
    updateErrorCategoryFilters(headerDiv.querySelector('.error-category-filters'), headerCategoryButtonsContainer, currentErrors, currentWarnings);
    
    flatContainer.appendChild(headerDiv);

    // 如果有数据，渲染项目；如果没有数据，显示兜底文案
    if (filteredItems.length > 0) {
        // 按类型和时间排序（错误在前，然后按时间排序）
        filteredItems.sort((a, b) => {
            if (a._type !== b._type) {
                return a._type === 'error' ? -1 : 1;
            }
            // 如果有时间戳，按时间排序
            if (a.timestamp && b.timestamp) {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
            return 0;
        });

        // 渲染所有项目
        filteredItems.forEach((item, index) => {
            const errorItem = createErrorItem(item, index);
            flatContainer.appendChild(errorItem);
        });
    } else {
        // 显示兜底文案
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state-in-flat';
        
        let emptyMessage = '';
        if (currentGroup) {
            // 特定分组的兜底信息
            const hasGroupData = (currentReport.errors[currentGroup] && currentReport.errors[currentGroup].length > 0) ||
                                 (currentReport.warnings[currentGroup] && currentReport.warnings[currentGroup].length > 0);
            
            if (!hasGroupData) {
                emptyMessage = `"${currentGroup.split('?')[0]}" 分组暂无错误和警告信息`;
            } else if (!activeFilters.has('errors') && !activeFilters.has('warnings')) {
                emptyMessage = '请选择要查看的错误或警告类型';
            } else if (searchTerm) {
                emptyMessage = `在 "${currentGroup.split('?')[0]}" 分组中没有找到包含"${searchTerm}"的项目`;
            } else {
                emptyMessage = `"${currentGroup.split('?')[0]}" 分组在当前过滤条件下暂无数据`;
            }
        } else {
            // 全部分组的兜底信息
            if (currentErrors.length === 0 && currentWarnings.length === 0) {
                emptyMessage = '暂无错误和警告信息';
            } else if (!activeFilters.has('errors') && !activeFilters.has('warnings')) {
                emptyMessage = '请选择要查看的错误或警告类型';
            } else if (searchTerm) {
                emptyMessage = `没有找到包含"${searchTerm}"的项目`;
            } else {
                emptyMessage = '当前过滤条件下暂无数据';
            }
        }
        
        emptyDiv.innerHTML = `
            <div class="empty-content">
                <i class="fas fa-search"></i>
                <h4>${emptyMessage}</h4>
                <p>请尝试调整搜索条件或过滤器设置</p>
            </div>
        `;
        flatContainer.appendChild(emptyDiv);
    }

    elements.errorList.appendChild(flatContainer);
}

// 渲染文件列表
function renderFilesList(searchTerm = '') {
    if (!currentReport || !elements.errorList) return;

    console.log('渲染文件列表 - 活动过滤器:', Array.from(activeFilters), '搜索词:', searchTerm);

    elements.errorList.innerHTML = '';

    // 计算总的错误和警告数量
    let totalErrors = 0;
    let totalWarnings = 0;
    
    Object.values(currentReport.errors || {}).forEach(group => {
        totalErrors += group.length;
    });
    
    Object.values(currentReport.warnings || {}).forEach(group => {
        totalWarnings += group.length;
    });

    // 收集所有文件路径及其错误/警告统计（用于固定总数显示）
    const allFileStats = new Map();
    
    // 统计所有文件（不受过滤器影响）
    Object.values(currentReport.errors || {}).forEach(group => {
        group.forEach(error => {
            const filePath = error.fileFullPath || error.filePath || '未知文件';
            if (!allFileStats.has(filePath)) {
                allFileStats.set(filePath, { errors: 0, warnings: 0 });
            }
            allFileStats.get(filePath).errors++;
        });
    });
    
    Object.values(currentReport.warnings || {}).forEach(group => {
        group.forEach(warning => {
            const filePath = warning.fileFullPath || warning.filePath || '未知文件';
            if (!allFileStats.has(filePath)) {
                allFileStats.set(filePath, { errors: 0, warnings: 0 });
            }
            allFileStats.get(filePath).warnings++;
        });
    });
    
    const fixedTotalFiles = allFileStats.size;

    // 创建文件列表容器
    const flatContainer = document.createElement('div');
    flatContainer.className = 'flat-error-list';

    // 添加头部信息（统一使用 flat-list-header 布局）
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flat-list-header';
    
    headerDiv.innerHTML = `
        <div class="flat-header-left">
            <h3>
                <i class="fas fa-folder-open"></i>
                文件列表
                <span class="total-count">${fixedTotalFiles}</span>
            </h3>
            <div class="error-type-filters">
                <button class="filter-button ${activeFilters.has('errors') ? 'active' : ''}" data-filter="errors">
                    <i class="fas fa-exclamation-circle"></i>
                    错误
                    <span class="count">${totalErrors}</span>
                </button>
                <button class="filter-button ${activeFilters.has('warnings') ? 'active' : ''}" data-filter="warnings">
                    <i class="fas fa-exclamation-triangle"></i>
                    警告
                    <span class="count">${totalWarnings}</span>
                </button>
            </div>
        </div>
        <div class="flat-header-right">
        </div>
    `;
    
    // 为文件视图的过滤按钮添加事件监听器
    const headerFilterButtons = headerDiv.querySelectorAll('.filter-button');
    headerFilterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const filter = button.getAttribute('data-filter');
            
            if (activeFilters.has(filter)) {
                activeFilters.delete(filter);
                button.classList.remove('active');
            } else {
                activeFilters.add(filter);
                button.classList.add('active');
            }
            
            console.log('文件视图过滤器状态:', Array.from(activeFilters));
            
            // 重新渲染文件列表
            renderFilesList(elements.searchInput?.value.toLowerCase() || '');
        });
    });
    
    flatContainer.appendChild(headerDiv);
    elements.errorList.appendChild(flatContainer);

    // 收集当前过滤器下的文件路径及其错误/警告统计
    const fileStats = new Map();

    if (activeFilters.has('errors')) {
        Object.values(currentReport.errors || {}).forEach(group => {
            group.forEach(error => {
                const filePath = error.fileFullPath || error.filePath || '未知文件';
                if (!fileStats.has(filePath)) {
                    fileStats.set(filePath, { errors: 0, warnings: 0 });
                }
                fileStats.get(filePath).errors++;
            });
        });
    }

    if (activeFilters.has('warnings')) {
        Object.values(currentReport.warnings || {}).forEach(group => {
            group.forEach(warning => {
                const filePath = warning.fileFullPath || warning.filePath || '未知文件';
                if (!fileStats.has(filePath)) {
                    fileStats.set(filePath, { errors: 0, warnings: 0 });
                }
                fileStats.get(filePath).warnings++;
            });
        });
    }

    // 应用搜索过滤
    let filteredFiles = Array.from(fileStats.entries());
    if (searchTerm) {
        filteredFiles = filteredFiles.filter(([filePath]) => 
            filePath.toLowerCase().includes(searchTerm)
        );
    }

    console.log('文件统计结果:', {
        totalFiles: allFileStats.size,
        filteredFiles: filteredFiles.length,
        totalErrors,
        totalWarnings,
        activeFilters: Array.from(activeFilters)
    });

    if (filteredFiles.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        
        let emptyMessage = '';
        if (totalErrors === 0 && totalWarnings === 0) {
            emptyMessage = '暂无错误和警告信息';
        } else if (!activeFilters.has('errors') && !activeFilters.has('warnings')) {
            emptyMessage = '请选择要查看的错误或警告类型';
        } else if (searchTerm) {
            emptyMessage = `没有找到包含"${searchTerm}"的文件`;
        } else {
            emptyMessage = '当前过滤条件下暂无文件';
        }
        
        emptyDiv.innerHTML = `
            <div class="empty-content">
                <i class="fas fa-folder-open"></i>
                <h4>${emptyMessage}</h4>
                <p>请尝试调整搜索条件或过滤器设置</p>
            </div>
        `;
        flatContainer.appendChild(emptyDiv);
        return;
    }

    // 排序并渲染
    filteredFiles.sort(([a], [b]) => a.localeCompare(b));
    
    const filesContainer = document.createElement('div');
    filesContainer.className = 'files-container';

    filteredFiles.forEach(([filePath, stats]) => {
        const fileItem = createFileItem(filePath, stats);
        filesContainer.appendChild(fileItem);
    });

    flatContainer.appendChild(filesContainer);
}

// 创建模块区块
function createModuleSection(groupName, items, errorCount = 0, warningCount = 0) {
    const container = document.createElement('div');
    container.className = 'error-section module';
    
    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `
        <div class="module-header-left">
            <h3 class="module-title">
                <i class="fas fa-folder"></i>
                <span class="module-name">${escapeHtml(groupName.split('?')[0])}</span>
                <span class="error-count">${items.length}</span>
            </h3>
        </div>
        <div class="module-header-right">
            <div class="error-type-filters">
                <button class="filter-button ${activeFilters.has('errors') ? 'active' : ''}" data-filter="errors">
                    <i class="fas fa-exclamation-circle"></i>
                    错误
                    <span class="count">${errorCount}</span>
                </button>
                <button class="filter-button ${activeFilters.has('warnings') ? 'active' : ''}" data-filter="warnings">
                    <i class="fas fa-exclamation-triangle"></i>
                    警告
                    <span class="count">${warningCount}</span>
                </button>
            </div>
        </div>
    `;
    
    // 为过滤按钮添加事件监听器
    const filterButtons = header.querySelectorAll('.filter-button');
    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            const filter = button.getAttribute('data-filter');
            
            if (activeFilters.has(filter)) {
                activeFilters.delete(filter);
                button.classList.remove('active');
            } else {
                activeFilters.add(filter);
                button.classList.add('active');
            }
            
            console.log('模块区块过滤器状态:', Array.from(activeFilters));
            
            // 重新渲染 - 错误/警告过滤器改变时使用缓存的分组数据  
            updateGroupTabs(true);
            renderModulesList(elements.searchInput?.value.toLowerCase() || '');
        });
    });
    
    container.appendChild(header);

    // 添加错误类型过滤器（与模块头部平级）
    const categoryFiltersDiv = document.createElement('div');
    categoryFiltersDiv.className = 'error-category-filters';
    categoryFiltersDiv.innerHTML = `
        <div class="filter-section-title">错误类型筛选</div>
        <div class="category-buttons"></div>
    `;
    
    // 更新错误类型过滤器
    const categoryButtonsContainer = categoryFiltersDiv.querySelector('.category-buttons');
    updateErrorCategoryFilters(categoryFiltersDiv, categoryButtonsContainer, errorCount, warningCount);
    container.appendChild(categoryFiltersDiv);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'error-items';

    items.forEach((item, index) => {
        const errorItem = createErrorItem(item, index);
        itemsContainer.appendChild(errorItem);
    });

    container.appendChild(itemsContainer);
    return container;
}

// 创建错误项
function createErrorItem(item, displayIndex) {
    const template = document.getElementById('error-item-template').content;
    const element = template.cloneNode(true);
    
    const errorItem = element.querySelector('.error-item');
    
    // 确保item有正确的类型信息
    const itemType = item._type || 'error';
    
    // 关键修复：直接使用缓存数据中的URL安全ID
    let uniqueId;
    
    // 1. 最优先：使用URL安全的简洁ID（如 e0, w1 等）
    if (item._urlSafeId) {
        uniqueId = item._urlSafeId;
        console.log(`使用URL安全ID: ${uniqueId}`);
    }
    // 2. 兜底：如果没有URL安全ID，基于_globalIndex生成
    else if (typeof item._globalIndex === 'number') {
        const prefix = itemType === 'error' ? 'e' : 'w';
        uniqueId = `${prefix}${item._globalIndex}`;
        console.log(`基于_globalIndex生成简洁ID: ${uniqueId}`);
        
        // 更新item数据，确保下次使用时有正确的ID
        item._urlSafeId = uniqueId;
        errorDataCache.set(uniqueId, item);
    }
    // 3. 最后兜底：生成一个简单的ID
    else {
        const timestamp = Date.now();
        const prefix = itemType === 'error' ? 'e' : 'w';
        uniqueId = `${prefix}_${timestamp}_${displayIndex}`;
        console.log(`最后兜底生成ID: ${uniqueId}`);
        
        // 更新item数据
        item._urlSafeId = uniqueId;
        errorDataCache.set(uniqueId, item);
    }
    
    console.log(`创建错误项，使用ID: ${uniqueId}`, {
        displayIndex,
        itemType,
        _urlSafeId: item._urlSafeId,
        _globalIndex: item._globalIndex,
        _group: item._group,
        message: item.message
    });
    
    errorItem.setAttribute('data-error-id', uniqueId);
    
    // 确保使用最新的数据，并确保ID字段正确
    const itemData = {
        ...item,
        _id: uniqueId,
        _type: itemType,
        _urlSafeId: uniqueId  // 确保urlSafeId存在且一致
    };
    
    // 确保缓存中有这个错误数据（可能已经存在，但确保ID一致）
    if (!errorDataCache.has(uniqueId)) {
        console.log(`缓存中未找到 ${uniqueId}，添加数据`);
        errorDataCache.set(uniqueId, itemData);
    }
    
    // 设置错误严重程度
    const severityElement = element.querySelector('.error-severity');
    if (severityElement) {
        severityElement.textContent = itemType === 'error' ? '错误' : '警告';
        severityElement.className = `error-severity ${itemType}`;
    }
    
    // 设置错误信息
    const messageElement = element.querySelector('.error-message');
    messageElement.textContent = item.message || '未知错误';
    
    // 设置文件路径信息
    const filePathElement = element.querySelector('.error-file-path');
    if (filePathElement) {
        const filePath = item.fileFullPath || item.filePath || '未知文件';
        filePathElement.textContent = filePath;
    }
    
    // 设置行列号信息
    const locationElement = element.querySelector('.error-location');
    if (locationElement) {
        const line = item.line || '?';
        const column = item.column || '?';
        locationElement.textContent = `第 ${line} 行，第 ${column} 列`;
    }
    
    // 设置规则信息
    const ruleElement = element.querySelector('.error-rule');
    if (ruleElement && item.rule) {
        ruleElement.textContent = item.rule;
    }
    
    // 添加查看详情按钮事件
    const viewDetailsBtn = element.querySelector('.view-details-btn');
    viewDetailsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`点击查看详情，错误ID: ${uniqueId}`);
        console.log(`完整错误数据:`, itemData);
        
        // 确保错误数据在缓存中存在
        const cacheCheck = errorDataCache.get(uniqueId);
        if (!cacheCheck) {
            console.log(`缓存中未找到 ${uniqueId}，重新添加`);
            errorDataCache.set(uniqueId, itemData);
        } else {
            console.log(`缓存中已存在 ${uniqueId}`);
        }
        
        // 同时保存到会话存储
        try {
            const errorCacheKey = `error-detail-${uniqueId}`;
            sessionStorage.setItem(errorCacheKey, JSON.stringify(itemData));
            console.log(`错误数据已保存到会话存储: ${errorCacheKey}`);
        } catch (error) {
            console.error('保存错误数据到会话存储失败:', error);
        }
        
        console.log(`准备跳转到错误详情页，ID: ${uniqueId}`);
        
        // 使用SPA路由跳转
        if (window.SPA && typeof window.SPA.navigateTo === 'function') {
            console.log('使用SPA路由跳转');
            window.SPA.navigateTo('error-detail', { id: uniqueId });
        } else {
            console.log('SPA路由不可用，使用传统跳转');
            window.location.href = `error-detail.html?id=${encodeURIComponent(uniqueId)}`;
        }
    });
    
    return element;
}

// 生成唯一ID
function generateUniqueId() {
    return 'error_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 创建文件项
function createFileItem(filePath, stats) {
    const template = document.getElementById('file-path-item-template').content;
    const element = template.cloneNode(true);
    
    const fileItem = element.querySelector('.file-path-item');
    fileItem.setAttribute('data-file-path', filePath);
    
    // 设置文件信息
    const fileName = filePath.split('/').pop() || filePath;
    const directory = filePath.substring(0, filePath.lastIndexOf('/')) || '';
    
    element.querySelector('.name').textContent = fileName;
    element.querySelector('.file-directory').textContent = directory;
    element.querySelector('.file-full-path').textContent = filePath;
    
    // 设置统计信息
    element.querySelector('.error-count').textContent = `${stats.errors} 错误`;
    element.querySelector('.warning-count').textContent = `${stats.warnings} 警告`;
    
    // 添加查看文件按钮事件
    const viewFileBtn = element.querySelector('.view-file-btn');
    viewFileBtn.addEventListener('click', () => {
        // 使用SPA路由跳转到文件详情页
        if (window.SPA && window.SPA.navigateTo) {
            window.SPA.navigateTo('file-detail', { path: filePath });
        } else {
            // 兜底跳转
            window.location.href = `file-detail.html?path=${encodeURIComponent(filePath)}`;
        }
    });
    
    return element;
}

// 过滤项目
function filterItems(items, searchTerm) {
    return items.filter(item => {
        // 错误类型过滤
        if (activeCategoryFilters.size > 0) {
            const itemType = item.type || 'unknown';
            if (!activeCategoryFilters.has(itemType)) {
                return false;
            }
        }
        
        // 搜索过滤
        if (searchTerm) {
            const searchString = [
                item.message,
                item.filePath,
                item.fileFullPath,
                item.stack
            ].filter(Boolean).join(' ').toLowerCase();
            return searchString.includes(searchTerm);
        }
        
        return true;
    });
}

// HTML转义
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 初始化标签页切换功能
function initTabSwitching() {
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-tab');
            
            // 如果是同一个视图，不做任何处理
            if (currentView === newView) return;
            
            currentView = newView;
            
            // 强制回到主页面
            if (window.SPA && window.SPA.navigateTo) {
                window.SPA.navigateTo('main', {}, false); // 不添加到历史记录
            }
            
            // 更新按钮状态
            elements.tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // 重置分组选择（只在模块视图有分组）
            currentGroup = null;
            
            // 重置错误类型过滤器
            activeCategoryFilters.clear();
            
            // 确保有基本的过滤器激活
            if (activeFilters.size === 0) {
                activeFilters.add('errors');
                activeFilters.add('warnings');
            }
            
            // 更新UI
            updateUI();
        });
    });
}

// 初始化过滤器功能
function initFilterButtons() {
    // 使用事件委托处理动态创建的过滤按钮
    document.addEventListener('click', (e) => {
        if (e.target.closest('.filter-button')) {
            const button = e.target.closest('.filter-button');
            const filter = button.getAttribute('data-filter');
            
            // 阻止事件冒泡
            e.preventDefault();
            e.stopPropagation();
            
            if (filter === 'errors' || filter === 'warnings') {
                if (activeFilters.has(filter)) {
                    activeFilters.delete(filter);
                    button.classList.remove('active');
                } else {
                    activeFilters.add(filter);
                    button.classList.add('active');
                }
                
                console.log('过滤器状态更新:', Array.from(activeFilters));
                
                // 重新渲染 - 过滤器状态改变时使用缓存的分组数据
                updateGroupTabs(true);
                const searchTerm = elements.searchInput?.value.toLowerCase() || '';
                if (currentView === 'modules') {
                    renderModulesList(searchTerm);
                } else {
                    renderFilesList(searchTerm);
                }
            }
        }
    });
}

// 初始化搜索功能
function initSearchInput() {
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce((e) => {
            const searchTerm = e.target.value.toLowerCase();
            if (currentView === 'modules') {
                renderModulesList(searchTerm);
            } else {
                renderFilesList(searchTerm);
            }
        }, 300));
    }
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 返回顶部功能
function initBackToTop() {
    const backToTop = document.getElementById('backToTop');
    if (!backToTop) return;

    const scrollThreshold = 300;

    function toggleBackToTop() {
        if (window.pageYOffset > scrollThreshold) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    }

    window.addEventListener('scroll', toggleBackToTop);
    backToTop.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    toggleBackToTop();
}

// 全局API - 供其他页面调用
window.getErrorData = function(errorId) {
    return errorDataCache.get(errorId);
};

window.getReportData = function() {
    return reportDataCache;
};

window.getFileErrorsData = function(filePath) {
    const errors = [];
    const warnings = [];
    
    errorDataCache.forEach(item => {
        const itemFilePath = item.fileFullPath || item.filePath;
        if (itemFilePath === filePath) {
            if (item._type === 'error') {
                errors.push(item);
            } else {
                warnings.push(item);
            }
        }
    });
    
    return { errors, warnings };
};

// 暴露重建缓存函数
window.rebuildErrorCache = rebuildErrorCache;

// 暴露当前报告数据
Object.defineProperty(window, 'currentReport', {
    get: function() { return currentReport; },
    set: function(value) { currentReport = value; }
});

// SPA页面处理器
SPA.registerPageHandler('main', () => {
    console.log('进入主页面');
    
    // 显示sub-header
    const subHeader = document.querySelector('.sub-header');
    if (subHeader) {
        subHeader.style.display = 'flex';
    }
    
    // 清理其他页面的状态
    if (window.ErrorDetailPage && window.ErrorDetailPage.cleanup) {
        window.ErrorDetailPage.cleanup();
    }
    if (window.FileDetailPage && window.FileDetailPage.cleanup) {
        window.FileDetailPage.cleanup();
    }
    
    // 确保显示主页面的所有元素
    const lastUpdate = document.getElementById('lastUpdate');
    const groupTabs = document.getElementById('groupTabs');
    if (lastUpdate) lastUpdate.style.display = 'block';
    if (groupTabs) groupTabs.style.display = 'block';
    
    // 检查是否有数据，如果没有则显示等待状态
    if (!currentReport) {
        // 先尝试从缓存恢复
        if (!tryRestoreFromCache()) {
            showWaitingState();
        }
    } else {
        // 有数据则更新UI
        updateUI();
    }
});

SPA.registerPageHandler('error-detail', async (params) => {
    console.log('=== 进入错误详情页面处理器 ===');
    console.log('接收到的参数:', params);
    
    const errorId = params ? params.id : null;
    console.log('提取的错误ID:', errorId);
    
    if (!errorId) {
        console.error('错误ID为空');
        const container = document.getElementById('errorDetailContent');
        if (container) {
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                    <h3>参数错误</h3>
                    <p>缺少错误ID参数，请从主页面点击错误项目进入详情页</p>
                    <button onclick="window.SPA.navigateTo('main')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        返回主页面
                    </button>
                </div>
            `;
        }
        return;
    }
    
    // 确保有数据缓存，如果没有则尝试恢复
    if (errorDataCache.size === 0) {
        console.log('错误数据缓存为空，尝试恢复数据...');
        const dataRestored = tryRestoreFromCache();
        console.log('数据恢复结果:', dataRestored, '缓存大小:', errorDataCache.size);
        
        if (!dataRestored && errorDataCache.size === 0) {
            console.warn('无法恢复数据缓存');
            const container = document.getElementById('errorDetailContent');
            if (container) {
                container.innerHTML = `
                    <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                        <i class="fas fa-database" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                        <h3>数据缺失</h3>
                        <p>错误数据缓存为空，请返回主页面重新加载数据</p>
                        <button onclick="window.SPA.navigateTo('main')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            返回主页面
                        </button>
                    </div>
                `;
            }
            return;
        }
    }
    
    // 验证错误数据是否存在
    let errorData = errorDataCache.get(errorId);
    if (!errorData) {
        // 尝试从会话存储恢复
        try {
            const errorCacheKey = `error-detail-${errorId}`;
            const storedData = sessionStorage.getItem(errorCacheKey);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                errorDataCache.set(errorId, parsedData);
                errorData = parsedData;
                console.log(`从会话存储恢复错误数据: ${errorId}`);
            }
        } catch (e) {
            console.error('从会话存储恢复数据失败:', e);
        }
    }
    
    if (!errorData) {
        console.error(`未找到错误数据: ${errorId}`);
        console.log('当前缓存的所有键:', Array.from(errorDataCache.keys()));
        
        const container = document.getElementById('errorDetailContent');
        if (container) {
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                    <i class="fas fa-search" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                    <h3>错误数据未找到</h3>
                    <p>无法找到ID为 "${errorId}" 的错误数据</p>
                    <p style="font-size: 0.9em; color: #999;">请返回主页面重新选择错误项目</p>
                    <button onclick="window.SPA.navigateTo('main')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        返回主页面
                    </button>
                </div>
            `;
        }
        return;
    }
    
    console.log(`找到错误数据 ${errorId}:`, errorData);
    
    // 初始化错误详情页面
    const container = document.getElementById('errorDetailContent');
    if (!container) {
        console.error('错误详情容器未找到');
        return;
    }
    
    if (!window.ErrorDetailPage || typeof window.ErrorDetailPage.init !== 'function') {
        console.error('ErrorDetailPage组件未找到或init方法不存在');
        container.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                <i class="fas fa-cog" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                <h3>组件加载失败</h3>
                <p>错误详情组件未正确加载</p>
                <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    刷新页面
                </button>
            </div>
        `;
        return;
    }
    
    try {
        console.log('调用ErrorDetailPage.init');
        await window.ErrorDetailPage.init(container, errorId);
        console.log('ErrorDetailPage.init 执行完成');
    } catch (initError) {
        console.error('ErrorDetailPage初始化失败:', initError);
        container.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 2rem; color: #666;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #f56565; margin-bottom: 1rem;"></i>
                <h3>初始化失败</h3>
                <p>错误详情页面初始化失败: ${initError.message}</p>
                <button onclick="window.SPA.navigateTo('main')" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    返回主页面
                </button>
            </div>
        `;
    }
});

SPA.registerPageHandler('file-detail', (params) => {
    console.log('进入文件详情页面', params);
    
    // 直接调用文件详情页面初始化
    const container = document.getElementById('fileDetailContent');
    if (container && window.FileDetailPage) {
        window.FileDetailPage.init(container, params ? params.path : null);
    } else {
        console.error('文件详情容器或组件未找到');
    }
});

// 暴露模拟数据加载函数到全局
window.loadMockData = loadMockData;

// 暴露SPA实例到全局
window.SPA = SPA;

// 尝试从会话存储恢复数据
function tryRestoreFromCache() {
    console.log('尝试从会话存储恢复数据...');
    
    try {
        const cachedReport = sessionStorage.getItem('report-data-cache');
        if (!cachedReport) {
            console.log('会话存储中没有报告数据');
            return false;
        }
        
        const parsedReport = JSON.parse(cachedReport);
        console.log('解析会话存储数据成功:', {
            timestamp: parsedReport.timestamp,
            errorGroups: Object.keys(parsedReport.errors || {}),
            warningGroups: Object.keys(parsedReport.warnings || {})
        });
        
        // 检查数据是否在合理时间内（比如8小时）
        const cachedTime = new Date(parsedReport.timestamp);
        const now = new Date();
        const hoursDiff = (now - cachedTime) / (1000 * 60 * 60);
        
        if (hoursDiff >= 8) {
            console.log(`数据过期 (${hoursDiff.toFixed(1)}小时前)，清除缓存`);
            sessionStorage.removeItem('report-data-cache');
            sessionStorage.removeItem('error-data-cache');
            return false;
        }
        
        // 恢复全局报告数据
        currentReport = parsedReport;
        reportDataCache = parsedReport;
        console.log('全局报告数据已恢复');
        
        // 先尝试从会话存储恢复错误数据缓存
        let errorCacheRestored = false;
        try {
            errorCacheRestored = restoreErrorCacheFromStorage();
        } catch (e) {
            console.warn('从会话存储恢复错误缓存失败:', e);
        }
        
        // 如果错误缓存恢复失败，重新构建
        if (!errorCacheRestored || errorDataCache.size === 0) {
            console.log('重新构建错误数据缓存...');
            rebuildErrorCache();
        }
        
        console.log(`数据恢复完成: 报告时间=${parsedReport.timestamp}, 错误缓存大小=${errorDataCache.size}`);
        
        // 如果当前在主页面，更新UI
        if (SPA.currentPage === 'main') {
            updateUI();
        }
        
        return true;
    } catch (error) {
        console.error('从会话存储恢复数据失败:', error);
        // 清理可能损坏的数据
        try {
            sessionStorage.removeItem('report-data-cache');
            sessionStorage.removeItem('error-data-cache');
        } catch (e) {
            console.warn('清理损坏数据失败:', e);
        }
        return false;
    }
}

// 从会话存储恢复错误缓存
function restoreErrorCacheFromStorage() {
    try {
        const cachedErrorData = sessionStorage.getItem('error-data-cache');
        if (cachedErrorData) {
            const cacheData = JSON.parse(cachedErrorData);
            errorDataCache.clear();
            
            Object.entries(cacheData).forEach(([key, value]) => {
                errorDataCache.set(key, value);
            });
            
            console.log('从会话存储恢复错误缓存，大小:', errorDataCache.size);
            return true;
        }
    } catch (error) {
        console.error('恢复错误缓存失败:', error);
        sessionStorage.removeItem('error-data-cache');
    }
    return false;
}

// 显示等待状态
function showWaitingState() {
    if (SPA.currentPage !== 'main') return;
    
    const errorList = document.getElementById('errorList');
    if (errorList) {
        errorList.innerHTML = `
            <div class="waiting-state">
                <div class="loading-spinner"></div>
                <div class="waiting-message">
                    <h3>正在等待数据...</h3>
                    <p>请确保构建过程正在运行，或刷新页面重新连接</p>
                    <button onclick="loadMockData()" class="action-btn primary" style="margin-top: 15px;">
                        <i class="fas fa-database"></i>
                        加载测试数据
                    </button>
                </div>
            </div>
        `;
    }
    
    // 重置统计信息
    if (elements.totalErrors) {
        elements.totalErrors.textContent = '-';
    }
    if (elements.warnings) {
        elements.warnings.textContent = '-';
    }
    if (elements.lastUpdate) {
        elements.lastUpdate.textContent = '等待数据更新...';
    }
}

// 加载模拟数据用于测试
function loadMockData() {
    console.log('加载模拟测试数据...');
    
    const mockReport = {
        timestamp: new Date().toISOString(),
        errors: {
            'flat-all': [
                {
                    id: 'flat-all-0',  // 这个会和自动生成的ID一致
                    message: 'Cannot read property "length" of undefined',
                    filePath: 'src/components/Header.js',
                    fileFullPath: '/Users/project/src/components/Header.js',
                    line: 25,
                    column: 18,
                    severity: 'error',
                    rule: 'no-undefined-property',
                    stack: `TypeError: Cannot read property 'length' of undefined\n    @ render (/Users/project/src/components/Header.js:25:18)\n    @ Component.render (/node_modules/react-dom/lib/ReactCompositeComponent.js:796:21)\n    @ ReactCompositeComponentWrapper._renderValidatedComponentWithoutOwnerOrContext (/node_modules/react-dom/lib/ReactCompositeComponent.js:775:34)`,
                    type: 'TypeError'
                },
                {
                    id: 'flat-all-1',  // 这个会和自动生成的ID一致
                    message: 'Expected semicolon',
                    filePath: 'src/utils/helper.js',
                    fileFullPath: '/Users/project/src/utils/helper.js',
                    line: 42,
                    column: 15,
                    severity: 'error',
                    rule: 'semicolon',
                    stack: `SyntaxError: Expected semicolon\n    @ parseFunction (/Users/project/src/utils/helper.js:42:15)\n    @ Module._compile (/node_modules/babel-core/lib/index.js:123:45)`,
                    type: 'SyntaxError'
                }
            ]
        },
        warnings: {
            'flat-all': [
                {
                    id: 'flat-all-2',  // 警告也使用全局索引，接着错误的索引继续
                    message: 'Unused variable "count"',
                    filePath: 'src/components/Counter.js',
                    fileFullPath: '/Users/project/src/components/Counter.js',
                    line: 10,
                    column: 12,
                    severity: 'warning',
                    rule: 'no-unused-vars',
                    type: 'UnusedVariable'
                }
            ]
        }
    };
    
    // 手动触发数据更新
    currentReport = mockReport;
    reportDataCache = mockReport;
    rebuildErrorCache();
    
    // 保存到会话存储
    try {
        sessionStorage.setItem('report-data-cache', JSON.stringify(mockReport));
        console.log('模拟数据已保存到会话存储');
    } catch (e) {
        console.warn('保存模拟数据失败:', e);
    }
    
    // 更新UI
    updateUI();
    
    console.log('模拟数据加载完成，错误缓存大小:', errorDataCache.size);
    
    // 调试：显示所有缓存的ID
    console.log('缓存的所有ID:');
    errorDataCache.forEach((value, key) => {
        console.log(`  ${key} -> ${value.message || 'No message'} (${value._type})`);
    });
}

// 在文档加载完成后初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 加载完成，开始初始化...');
    
    // 先尝试从本地存储恢复数据
    const dataRestored = tryRestoreFromCache();
    console.log('数据恢复结果:', dataRestored);
    
    // 初始化 WebSocket
    initWebSocket();
    initBackToTop();
    initTabSwitching();
    initFilterButtons();
    if (elements.searchInput) {
        initSearchInput();
    }
    
    // 如果没有数据，显示等待状态
    if (!currentReport && SPA.currentPage === 'main') {
        showWaitingState();
    }
    
    console.log('初始化完成，错误数据缓存大小:', errorDataCache.size);
});

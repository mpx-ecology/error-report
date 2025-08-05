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

        // 初始化路由
        this.parseRoute();
    }

    parseRoute() {
        const hash = window.location.hash.slice(1) || 'main';
        const [page, paramString] = hash.split('?');
        
        const params = {};
        if (paramString) {
            paramString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                params[key] = decodeURIComponent(value);
            });
        }

        this.navigateTo(page, params, false);
    }

    navigateTo(page, params = {}, pushState = true) {
        console.log('SPA导航到:', page, params);
        
        this.currentPage = page;
        this.params = params;

        // 更新URL
        const paramString = Object.keys(params).length > 0 
            ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            : '';
        
        const hash = `#${page}${paramString}`;
        
        if (pushState) {
            history.pushState({ page, params }, '', hash);
        }

        // 显示对应页面
        this.showPage(page);
        
        // 更新面包屑
        this.updateBreadcrumb(page, params);

        // 调用页面处理器
        if (this.pageHandlers[page]) {
            this.pageHandlers[page](params);
        }
    }

    showPage(page) {
        // 隐藏所有页面
        document.querySelectorAll('.spa-page').forEach(p => {
            p.classList.remove('active');
        });

        // 显示目标页面
        const targetPage = document.getElementById(`spa-page-${page}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
    }

    updateBreadcrumb(page, params) {
        const breadcrumb = document.getElementById('spaBreadcrumb');
        if (!breadcrumb) return;

        let breadcrumbHTML = '<span class="spa-nav-link" onclick="SPA.navigateTo(\'main\')">首页</span>';
        
        if (page === 'error-detail') {
            breadcrumbHTML += ' <span class="spa-nav-separator">›</span> 错误详情';
        } else if (page === 'file-detail') {
            breadcrumbHTML += ' <span class="spa-nav-separator">›</span> 文件详情';
        }
        
        breadcrumb.innerHTML = breadcrumbHTML;
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
    
    if (currentReport) {
        // 缓存错误数据
        Object.entries(currentReport.errors).forEach(([group, errors]) => {
            errors.forEach((error, index) => {
                const errorId = error.id || error.uuid || `error-${group}-${index}`;
                errorDataCache.set(errorId, {
                    ...error,
                    _type: 'error',
                    _group: group,
                    _id: errorId
                });
            });
        });
        
        // 缓存警告数据
        Object.entries(currentReport.warnings).forEach(([group, warnings]) => {
            warnings.forEach((warning, index) => {
                const warningId = warning.id || warning.uuid || `warning-${group}-${index}`;
                errorDataCache.set(warningId, {
                    ...warning,
                    _type: 'warning',
                    _group: group,
                    _id: warningId
                });
            });
        });
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
    if (elements.lastUpdate) {
        elements.lastUpdate.textContent = date.toLocaleString();
    }
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

    // 确保至少有一个过滤器是激活的
    if (activeFilters.size === 0) {
        activeFilters.add('errors');
        activeFilters.add('warnings');
    }

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
    const allItems = [];
    
    if (!currentGroup) {
        // 全部分组：收集所有数据
        if (activeFilters.has('errors')) {
            Object.entries(currentReport.errors || {}).forEach(([groupName, items]) => {
                items.forEach(item => {
                    allItems.push({...item, _type: 'error', _group: groupName});
                });
            });
        }
        
        if (activeFilters.has('warnings')) {
            Object.entries(currentReport.warnings || {}).forEach(([groupName, items]) => {
                items.forEach(item => {
                    allItems.push({...item, _type: 'warning', _group: groupName});
                });
            });
        }
    } else {
        // 特定分组：只收集当前分组的数据
        if (activeFilters.has('errors') && currentReport.errors[currentGroup]) {
            currentReport.errors[currentGroup].forEach(item => {
                allItems.push({...item, _type: 'error', _group: currentGroup});
            });
        }
        
        if (activeFilters.has('warnings') && currentReport.warnings[currentGroup]) {
            currentReport.warnings[currentGroup].forEach(item => {
                allItems.push({...item, _type: 'warning', _group: currentGroup});
            });
        }
    }

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
            
            // 确保至少有一个过滤器激活
            if (activeFilters.size === 0) {
                activeFilters.add('errors');
                activeFilters.add('warnings');
                headerFilterButtons.forEach(btn => btn.classList.add('active'));
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
            const errorItem = createErrorItem(item, `flat-${currentGroup || 'all'}-${index}`);
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

    // 确保至少有一个过滤器是激活的
    if (activeFilters.size === 0) {
        activeFilters.add('errors');
        activeFilters.add('warnings');
        console.log('重置过滤器为默认状态');
    }

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
            
            // 确保至少有一个过滤器激活
            if (activeFilters.size === 0) {
                activeFilters.add('errors');
                activeFilters.add('warnings');
                headerFilterButtons.forEach(btn => btn.classList.add('active'));
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

// 创建错误项
function createErrorItem(item, errorId) {
    const template = document.getElementById('error-item-template').content;
    const element = template.cloneNode(true);
    
    const errorItem = element.querySelector('.error-item');
    
    // 生成唯一ID
    const uniqueId = item.id || item.uuid || errorId || generateUniqueId();
    errorItem.setAttribute('data-error-id', uniqueId);
    
    // 缓存错误数据
    errorDataCache.set(uniqueId, {
        ...item,
        _id: uniqueId
    });
    
    // 设置错误图标
    const iconElement = element.querySelector('.error-icon');
    iconElement.className = `error-icon ${item._type}`;
    iconElement.textContent = item._type === 'error' ? '!' : '⚠';
    
    // 设置错误标题
    const titleElement = element.querySelector('.error-title');
    titleElement.textContent = item.message || '未知错误';
    
    // 设置文件路径
    const fileElement = element.querySelector('.error-file');
    fileElement.textContent = item.fileFullPath || item.filePath || '未知文件';
    
    // 设置错误详情
    const detailsElement = element.querySelector('.error-details');
    const details = [];
    if (item.line) details.push(`行 ${item.line}`);
    if (item.column) details.push(`列 ${item.column}`);
    if (item.type) details.push(`类型: ${ERROR_TYPE_MAPPING[item.type] || item.type}`);
    detailsElement.textContent = details.join(' • ');
    
    // 添加点击查看详情事件
    errorItem.style.cursor = 'pointer';
    errorItem.addEventListener('click', () => {
        // 使用SPA路由跳转到错误详情页面
        SPA.navigateTo('error-detail', { id: uniqueId });
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
    
    const fileItem = element.querySelector('.error-item');
    fileItem.setAttribute('data-file-path', filePath);
    
    // 设置文件图标
    const iconElement = element.querySelector('.error-icon');
    iconElement.textContent = '📁';
    
    // 设置文件名
    const titleElement = element.querySelector('.error-title');
    const fileName = filePath.split('/').pop() || filePath;
    titleElement.textContent = fileName;
    
    // 设置文件路径
    const fileElement = element.querySelector('.error-file');
    const directory = filePath.substring(0, filePath.lastIndexOf('/')) || '';
    fileElement.textContent = directory;
    
    // 设置统计信息
    const detailsElement = element.querySelector('.error-details');
    detailsElement.textContent = `${stats.errors} 错误 • ${stats.warnings} 警告`;
    
    // 添加点击查看文件事件
    fileItem.style.cursor = 'pointer';
    fileItem.addEventListener('click', () => {
        // 使用SPA路由跳转到文件详情页面
        SPA.navigateTo('file-detail', { path: filePath });
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
            const newView = button.getAttribute('data-view');
            
            // 如果是同一个视图，不做任何处理
            if (currentView === newView) return;
            
            currentView = newView;
            
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
                
                // 确保至少有一个过滤器激活，如果没有则重新激活所有过滤器
                if (activeFilters.size === 0) {
                    activeFilters.add('errors');
                    activeFilters.add('warnings');
                    // 更新所有过滤按钮的状态
                    document.querySelectorAll('.filter-button').forEach(btn => {
                        const btnFilter = btn.getAttribute('data-filter');
                        if (btnFilter === 'errors' || btnFilter === 'warnings') {
                            btn.classList.add('active');
                        }
                    });
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
            backToTop.style.display = 'flex';
        } else {
            backToTop.style.display = 'none';
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

// 注册SPA页面处理器
SPA.registerPageHandler('main', () => {
    console.log('进入主页面');
    // 主页面逻辑已经在main页面加载时初始化
});

SPA.registerPageHandler('error-detail', (params) => {
    console.log('进入错误详情页面', params);
    loadErrorDetailPage(params.id);
});

SPA.registerPageHandler('file-detail', (params) => {
    console.log('进入文件详情页面', params);
    loadFileDetailPage(params.path);
});

// 加载错误详情页面
function loadErrorDetailPage(errorId) {
    const container = document.getElementById('errorDetailContent');
    if (!container) return;

    // 这里动态加载error-detail.js的逻辑
    if (!window.ErrorDetailPage) {
        // 动态加载error-detail.js脚本
        const script = document.createElement('script');
        script.src = 'error-detail.js';
        script.onload = () => {
            if (window.ErrorDetailPage) {
                window.ErrorDetailPage.init(container, errorId);
            }
        };
        document.head.appendChild(script);
    } else {
        window.ErrorDetailPage.init(container, errorId);
    }
}

// 加载文件详情页面
function loadFileDetailPage(filePath) {
    const container = document.getElementById('fileDetailContent');
    if (!container) return;

    // 这里动态加载file-detail.js的逻辑
    if (!window.FileDetailPage) {
        // 动态加载file-detail.js脚本
        const script = document.createElement('script');
        script.src = 'file-detail.js';
        script.onload = () => {
            if (window.FileDetailPage) {
                window.FileDetailPage.init(container, filePath);
            }
        };
        document.head.appendChild(script);
    } else {
        window.FileDetailPage.init(container, filePath);
    }
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

// 暴露SPA实例到全局
window.SPA = SPA;

// 在文档加载完成后初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initBackToTop();
    initTabSwitching();
    initFilterButtons();
    if (elements.searchInput) {
        initSearchInput();
    }
});

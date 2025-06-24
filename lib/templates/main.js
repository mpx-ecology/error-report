// WebSocket连接管理
let ws = null;
let currentReport = null;
let currentView = 'errors';

// 当前选中的分组
let currentGroup = null;

// DOM元素
const elements = {
    errorList: document.getElementById('errorList'),
    totalErrors: document.getElementById('totalErrors'),
    warnings: document.getElementById('warnings'),
    lastUpdate: document.getElementById('lastUpdate'),
    searchInput: document.getElementById('searchInput'),
    tabButtons: document.querySelectorAll('.tab-button'),
    groupTabs: document.getElementById('groupTabs')
};

// 初始化WebSocket连接
function initWebSocket() {
    fetch('/server-info')
        .then(response => response.json())
        .then(info => {
            const port = info.port;
            // 获取当前页面的主机名，这样就能使用相同的 IP 或域名
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

// 从错误消息中提取src目录下的文件路径
function extractSrcPath(error) {
    if (!error || !error.message) return null;
    
    // 尝试从消息中提取文件路径
    const message = error.message;
    const srcPathPattern = /(?:\/|\\)src(?:\/|\\)((?:components|pages)(?:\/|\\)[^:\s'")\n]+)/;
    const match = message.match(srcPathPattern);
    
    if (match) {
        return match[1].replace(/\\/g, '/'); // 统一使用正斜杠
    }
    
    // 如果消息中没找到，尝试从module对象中获取
    if (error.module?.resource) {
        const moduleMatch = error.module.resource.match(srcPathPattern);
        return moduleMatch ? moduleMatch[1].replace(/\\/g, '/') : null;
    }
    
    return null;
}

// 获取错误的分组名称
function getErrorGroup(error) {
    return error.group?.name || '其他';
}

// 上次更新的时间戳
let lastUpdateTimestamp = null;
const UPDATE_DEBOUNCE_TIME = 1000; // 1秒防抖时间

// 处理WebSocket消息
function handleWebSocketMessage(message) {
    if (message.type === 'report-update') {
        try {
            const currentTimestamp = message.data.timestamp || new Date().toISOString();
            
            // 如果距离上次更新时间太近，则忽略本次更新
            if (lastUpdateTimestamp && 
                (new Date(currentTimestamp) - new Date(lastUpdateTimestamp) < UPDATE_DEBOUNCE_TIME)) {
                console.log('忽略重复更新');
                return;
            }
            
            lastUpdateTimestamp = currentTimestamp;
            const originalErrors = message.data.errors || {};
            const originalWarnings = message.data.warnings || {};

            currentReport = {
                timestamp: currentTimestamp,
                errors: originalErrors,
                warnings: originalWarnings
            };
            updateUI();
        } catch (error) {
            console.error('处理数据时出错:', error);
        }
    }
}

// 按类别和路径分组错误
function groupErrorsByCategory(errors) {
    const grouped = {};
    
    errors.forEach(error => {
        const category = categorizeError(error);
        const groupPath = getErrorGroupPath(error);
        
        if (!grouped[category]) {
            grouped[category] = {};
        }
        
        if (!grouped[category][groupPath]) {
            grouped[category][groupPath] = [];
        }
        
        grouped[category][groupPath].push({
            ...error,
            severity: error.severity || 'error',
            message: error.message || '未知错误',
            stack: error.stack || null,
            location: error.location || null,
            groupPath
        });
    });
    
    return grouped;
}

// 更新UI
function updateUI() {
    if (!currentReport) return;
    
    updateStats();
    updateLastUpdateTime();
    updateGroupTabs();
    
    const searchTerm = elements.searchInput?.value.toLowerCase() || '';
    renderErrorList(searchTerm);
}

// 更新统计信息
function updateStats() {
    // 计算错误总数：所有分组的错误数量之和
    const totalErrors = Object.values(currentReport.errors)
        .reduce((total, group) => total + Object.keys(group).length, 0);

    // 计算警告总数：所有分组的警告数量之和
    const totalWarnings = Object.values(currentReport.warnings)
        .reduce((total, group) => total + Object.keys(group).length, 0);

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

// 更新分组导航栏
function updateGroupTabs() {
    const groupTabsContainer = document.getElementById('groupTabs');
    if (!groupTabsContainer || !currentReport) return;

    groupTabsContainer.innerHTML = '';
    
    // 获取当前视图的数据
    const currentViewData = currentView === 'errors' ? currentReport.errors : currentReport.warnings;
    if (!currentViewData || Object.keys(currentViewData).length === 0) {
        // 如果当前视图没有数据，显示空状态
        groupTabsContainer.innerHTML = `<div class="empty-group-state">暂无${currentView === 'errors' ? '错误' : '警告'}分组</div>`;
        return;
    }

    // 添加"全部"标签
    const allTab = document.createElement('button');
    allTab.className = `group-tab ${!currentGroup ? 'active' : ''}`;
    const totalCount = Object.values(currentViewData).reduce((total, group) => total + group.length, 0);
    allTab.innerHTML = `全部 <span class="count">${totalCount}</span>`;
    allTab.addEventListener('click', () => {
        currentGroup = null;
        updateActiveGroupTab();
        renderErrorList(elements.searchInput?.value.toLowerCase() || '');
    });
    groupTabsContainer.appendChild(allTab);

    // 添加各个分组的标签
    const sortedGroups = Object.entries(currentViewData).sort(([keyA], [keyB]) => {
        if (keyA === '其他') return 1;
        if (keyB === '其他') return -1;
        return 0;
    });

    sortedGroups.forEach(([group, errors]) => {
        const tab = document.createElement('button');
        tab.className = `group-tab ${currentGroup === group ? 'active' : ''}`;
        // 清理分组名称中的query参数
        const cleanedGroupName = group.split('?')[0];
        tab.innerHTML = `${cleanedGroupName} <span class="count">${errors.length}</span>`;
        tab.addEventListener('click', () => {
            currentGroup = group;
            updateActiveGroupTab();
            renderErrorList(elements.searchInput?.value.toLowerCase() || '');
        });
        groupTabsContainer.appendChild(tab);
    });
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

// 定义错误类型
const ERROR_TYPES = {
    ALL: 'all',
    MPX: 'mpx',                 // MPX通用错误
    MPX_STYLE: 'mpx-style',     // MPX样式错误
    MPX_TEMPLATE: 'mpx-template', // MPX模板错误
    MPX_SCRIPT: 'mpx-script',    // MPX脚本错误
    WEBPACK: 'webpack',          // Webpack错误
    SYNTAX: 'syntax',           // 语法错误
    TYPESCRIPT: 'typescript',   // TypeScript错误
    ESLINT: 'eslint',          // ESLint错误
    DEPENDENCY: 'dependency',   // 依赖错误
    IMPORT: 'import',          // 导入错误
    UNKNOWN: 'unknown'         // 未知错误
};

// 获取错误类型
function getErrorType(error) {
    if (!error) return ERROR_TYPES.UNKNOWN;
    
    const message = error.message.toLowerCase();
    const stack = error.stack || '';
    
    // 检查是否是MPX相关错误
    if (stack.includes('@mpxjs/webpack-plugin') || message.includes('@mpxjs')) {
        // MPX错误的具体分类
        if (message.toLowerCase().includes('[style compiler]')) {
            return ERROR_TYPES.MPX_STYLE;
        }
        if (message.toLowerCase().includes('[template compiler]')) {
            return ERROR_TYPES.MPX_TEMPLATE;
        }
        if (message.toLowerCase().includes('[script compiler]')) {
            return ERROR_TYPES.MPX_SCRIPT;
        }
        // 额外检查样式相关错误
        if (message.toLowerCase().includes('style')) {
            return ERROR_TYPES.MPX_STYLE;
        }
        return ERROR_TYPES.MPX;
    }
    
    // 其他错误类型
    if (message.includes('webpack')) return ERROR_TYPES.WEBPACK;
    if (message.includes('syntax error')) return ERROR_TYPES.SYNTAX;
    
    return ERROR_TYPES.UNKNOWN;
}

// 清理模块路径，移除query参数
function cleanModulePath(path, category) {
    // 对于非分类的错误（即"其他"分组），移除query参数
    if (category === '其他') {
        // 移除URL中的query参数
        return path.split('?')[0];
    }
    return path;
}

// 渲染错误列表
function renderErrorList(searchTerm = '') {
    if (!currentReport || !elements.errorList) return;

    const errorTemplate = document.getElementById('error-template').content;
    const errorItemTemplate = document.getElementById('error-item-template').content;
    elements.errorList.innerHTML = '';

    const data = currentView === 'errors' ? currentReport.errors : currentReport.warnings;
    
    // 如果没有数据要显示，显示空状态
    if (!data || Object.keys(data).length === 0) {
        elements.errorList.innerHTML = `<div class="empty-state">暂无${currentView === 'errors' ? '错误' : '警告'}</div>`;
        return;
    }
    
    // 如果选中了特定分组，只显示该分组的错误
    const groupsToRender = currentGroup ? 
        (data[currentGroup] ? [[currentGroup, data[currentGroup]]] : []) :
        Object.entries(data);
    
    // 将分组排序：errorConfig 配置的分组在前，"其他"在最后
    const sortedEntries = groupsToRender.sort(([keyA], [keyB]) => {
        if (keyA === '其他') return 1;
        if (keyB === '其他') return -1;
        return 0;
    });

    // 使用排序后的分组进行渲染
    sortedEntries.forEach(([category, groupItems]) => {
        const filteredItems = filterItems(groupItems, searchTerm);
        if (filteredItems.length === 0) return;

        // 创建分组容器
        const moduleElement = errorTemplate.cloneNode(true);
        const moduleTitle = moduleElement.querySelector('.module-name');
        const errorCount = moduleElement.querySelector('.error-count');
        
        // 显示分组名称和错误数量，清理模块路径
        moduleTitle.textContent = cleanModulePath(category, category);
        errorCount.textContent = filteredItems.length;

        // 创建错误类型过滤器
        const filterTabs = document.createElement('div');
        filterTabs.className = 'error-type-tabs';
        
        // 获取当前分组的错误类型统计
        const typeStats = filteredItems.reduce((acc, error) => {
            const type = getErrorType(error);
            acc[type] = (acc[type] || 0) + 1;
            acc.all = (acc.all || 0) + 1;
            return acc;
        }, {});

        // 创建过滤tab
        Object.entries(ERROR_TYPES).forEach(([key, value]) => {
            if (typeStats[value]) {
                const tab = document.createElement('button');
                tab.className = `error-type-tab ${value}`;
                tab.setAttribute('data-type', value);
                
                // 获取错误类型的显示文本
                const typeText = {
                    all: '全部',
                    mpx: 'MPX框架',
                    'mpx-style': 'MPX样式',
                    'mpx-template': 'MPX模板',
                    'mpx-script': 'MPX脚本',
                    webpack: 'Webpack',
                    syntax: '语法错误',
                    typescript: 'TypeScript',
                    eslint: 'ESLint',
                    dependency: '依赖',
                    import: '导入',
                    unknown: '其他'
                }[value] || value;
                
                tab.textContent = `${typeText} (${typeStats[value]})`;
                
                tab.addEventListener('click', (e) => {
                    // 更新tab状态
                    filterTabs.querySelectorAll('.error-type-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    // 过滤错误项
                    const selectedType = e.target.getAttribute('data-type');
                    errorsContainer.querySelectorAll('.error-item').forEach(item => {
                        const errorType = item.getAttribute('data-error-type');
                        const isVisible = selectedType === 'all' || 
                            errorType === selectedType ||
                            (selectedType === 'mpx' && errorType?.startsWith('mpx-'));
                        
                        item.style.display = isVisible ? '' : 'none';
                        
                        // 更新计数
                        const visibleItems = Array.from(errorsContainer.querySelectorAll('.error-item'))
                            .filter(item => item.style.display !== 'none');
                        errorCount.textContent = visibleItems.length;
                    });
                });

                filterTabs.appendChild(tab);
            }
        });

        // 默认选中"全部"
        filterTabs.querySelector('[data-type="all"]')?.classList.add('active');
        
        // 获取模块实际的DOM元素
        const moduleNode = moduleElement.querySelector('.module');
        
        // 获取或创建错误列表容器
        let errorsContainer = moduleNode.querySelector('.error-items');
        if (!errorsContainer) {
            errorsContainer = document.createElement('div');
            errorsContainer.className = 'error-items';
            moduleNode.appendChild(errorsContainer);
        }
        
        // 将过滤器添加到模块中，放在header之后，error-items之前
        moduleNode.insertBefore(filterTabs, errorsContainer);
        filteredItems.forEach(error => {
            const errorElement = createErrorElement(error, errorItemTemplate);
            errorsContainer.appendChild(errorElement);
        });

        elements.errorList.appendChild(moduleElement);
    });
}

// 渲染单个错误项
function renderErrorItem(error, errorId, group) {
    const errorItem = document.createElement('div');
    errorItem.className = 'error-item';
    errorItem.innerHTML = `
        <div class="error-header">
            <span class="error-group">${group}</span>
            <span class="error-id">#${errorId}</span>
        </div>
        <div class="error-content">
            <div class="error-message">${error.message}</div>
            <div class="error-location">${error.location || ''}</div>
        </div>
    `;
    return errorItem;
}

// 渲染错误分组
function renderErrorGroups(searchTerm = '') {
    elements.errorList.innerHTML = '';

    sortedEntries.forEach(([group, groupErrors]) => {
        // 过滤符合搜索条件的错误
        const filteredErrors = Object.entries(groupErrors).filter(([_, error]) => {
            const searchString = `${error.message} ${error.location || ''}`.toLowerCase();
            return !searchTerm || searchString.includes(searchTerm.toLowerCase());
        });

        if (filteredErrors.length === 0) return;

        // 创建分组容器
        const groupContainer = errorTemplate.cloneNode(true);
        const groupElement = groupContainer.querySelector('.error-group-content');
        groupElement.querySelector('.error-group-title').textContent = group;

        // 渲染每个错误项
        filteredErrors.forEach(([errorId, error]) => {
            groupElement.appendChild(renderErrorItem(error, errorId, group));
        });

        elements.errorList.appendChild(groupContainer);
    });

    updateNoResultsMessage();
}

// 过滤错误项
function filterItems(items, searchTerm) {
    if (!searchTerm) return items;
    return items.filter(item => {
        const searchString = [
            item.message,
            item.filePath,
            item.category,
            item.stack
        ].filter(Boolean).join(' ').toLowerCase();
        return searchString.includes(searchTerm);
    });
}

// 格式化错误信息以更好地展示
function formatErrorContent(error) {
    const message = error.message || '';
    const formattedMessage = message
        .replace(/\[(\w+)\]/g, '<span class="error-code">[$1]</span>')
        .replace(/'([^']+)'/g, '<span class="error-path">\'$1\'</span>')
        .replace(/Module build failed/g, '<span class="error-type">Module build failed</span>');
    
    return `
        <div class="error-details">
            ${formattedMessage}
            ${error.code ? `<div class="error-code-info">[错误代码: ${error.code}]</div>` : ''}
        </div>
    `;
}

// 格式化堆栈信息
function parseStackTrace(stack) {
    if (!stack) return '';
    
    const lines = stack.split('\n');
    return lines.map((line, index) => {
        const match = line.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+)\)?|(.+))/);
        if (!match) return '';

        const [_, fnName, filePath, lineNumber, column, alternative] = match;
        const functionName = fnName || alternative || '<anonymous>';
        const location = filePath || alternative || '';
        
        return `
            <div class="stack-frame">
                <div class="stack-frame-content">
                    <div class="stack-frame-function-line"><span class="stack-frame-at">@</span>${escapeHtml(functionName)}:</div>
                    <div class="stack-frame-location-line">
                        <span class="stack-frame-location">${escapeHtml(location)}${lineNumber ? `<span class="stack-line-col">:${lineNumber}:${column}</span>` : ''}</span>
                    </div>
                </div>
            </div>
        `.trim();
    }).filter(Boolean).join('\n');
}

// 创建错误元素
function createErrorElement(error, template) {
    const element = template.cloneNode(true);
    const errorType = getErrorType(error);
    element.querySelector('.error-item').setAttribute('data-error-type', errorType);
    
    // 从错误消息中提取并分离错误信息和位置信息
    let cleanedMessage = error.message || '';
    let locationFromMessage = null;
    let filePathFromMessage = null;
    
    // 提取文件路径和位置信息的正则模式
    const filePathPatterns = [
        // 匹配路径:/行号:列号 形式 (src/pages/index.mpx:12:34)
        /\b((?:\/[\w.-]+)+\.\w+):(\d+):(\d+)/,
        
        // 匹配 "at 文件路径:行号:列号" 形式
        /at\s+((?:\/[\w.-]+)+\.\w+):(\d+):(\d+)/,
        
        // 匹配带引号的文件路径 ("src/pages/index.mpx")
        /"((?:\/[\w.-]+)+\.\w+)"/,
        
        // 匹配带引号的文件路径，可能有行列号 ("src/pages/index.mpx:12:34")
        /"((?:\/[\w.-]+)+\.\w+)(?::(\d+)(?::(\d+))?)?"/,
        
        // 匹配单引号的文件路径 ('src/pages/index.mpx')
        /'((?:\/[\w.-]+)+\.\w+)'/,
        
        // 匹配单引号的文件路径，可能有行列号 ('src/pages/index.mpx:12:34')
        /'((?:\/[\w.-]+)+\.\w+)(?::(\d+)(?::(\d+))?)?'/
    ];
    
    // 尝试从消息中提取文件路径和位置信息
    for (const pattern of filePathPatterns) {
        const match = cleanedMessage.match(pattern);
        if (match) {
            filePathFromMessage = match[1]; // 文件路径
            
            // 如果正则表达式包含行号和列号信息
            if (match[2]) {
             locationFromMessage = {
                    line: parseInt(match[2], 10),
                    column: match[3] ? parseInt(match[3], 10) : undefined
                };
            }
            
            // 从错误消息中移除文件路径和位置信息
            cleanedMessage = cleanedMessage.replace(match[0], '').trim();
            // 移除可能的额外空格和标点
            cleanedMessage = cleanedMessage.replace(/\s{2,}/g, ' ').trim();
            cleanedMessage = cleanedMessage.replace(/\s*[,.:;]\s*$/, '');
            break;
        }
    }
    
    // 如果上面没找到，则尝试匹配独立的位置模式
    if (!locationFromMessage) {
        const locationPatterns = [
            /\((\d+):(\d+)\)/,                            // (12:34) 格式
            /at line (\d+)(?:, column (\d+))?/i,          // at line 12, column 34 格式
            /Line (\d+):(?:Column (\d+))?/i,              // Line 12:Column 34 格式
            /\[(\d+),\s*(\d+)\]/,                         // [12, 34] 格式
            /:(\d+):(\d+)/                                // :12:34 格式
        ];
        
        for (const pattern of locationPatterns) {
            const match = cleanedMessage.match(pattern);
            if (match) {
                locationFromMessage = {
                    line: parseInt(match[1], 10),
                    column: match[2] ? parseInt(match[2], 10) : undefined
                };
                
                // 从错误消息中移除位置信息
                cleanedMessage = cleanedMessage.replace(pattern, '').trim();
                // 移除可能的额外空格和标点
                cleanedMessage = cleanedMessage.replace(/\s{2,}/g, ' ').trim();
                cleanedMessage = cleanedMessage.replace(/\s*[,.:;]\s*$/, '');
                break;
            }
        }
    }
    
    // 集成位置信息：优先使用error对象中的信息，其次使用从消息中提取的信息
    const errorLocation = error.location || locationFromMessage;
    const errorFilePath = error.filePath || filePathFromMessage;
    
    // 设置错误标题和内容 - 使用清理过的消息
    // element.querySelector('.error-severity').textContent = error.severity.toUpperCase();
    // element.querySelector('.error-severity').classList.add(error.severity);
    // element.querySelector('.error-message').textContent = cleanedMessage;
    
    // 添加错误类型标签
    const errorTypeTag = document.createElement('div');
    errorTypeTag.className = `error-type-tag ${error.category}`;
    errorTypeTag.textContent = getCategoryName(error.category);
    // element.querySelector('.error-item').appendChild(errorTypeTag);
    
    // 设置文件路径信息
    const filePath = errorFilePath || '未知文件';
    const filePathElement = element.querySelector('.file-path');
    const togglePathBtn = element.querySelector('.toggle-path');
    
    filePathElement.textContent = filePath;

    // 检查路径是否需要展开/收起按钮
    setTimeout(() => {
        const isLongPath = filePathElement.scrollHeight > filePathElement.clientHeight;
        if (isLongPath && togglePathBtn) {
            togglePathBtn.style.display = 'flex';
            togglePathBtn.addEventListener('click', () => {
                filePathElement.classList.toggle('expanded');
                togglePathBtn.classList.toggle('expanded');
            });
        }
    }, 0);
    
    // 设置详细错误信息
    // element.querySelector('.error-content').innerHTML = formatErrorContent({...error, message: cleanedMessage});
    
    // 提取并添加详细错误信息和位置到错误详情区域
    const errorDetailsSection = document.createElement('div');
    errorDetailsSection.className = 'error-detail-info';
    
    // 提取更具体的错误信息
    let errorInfo = cleanErrorMessage(cleanedMessage);
    
    // 创建错误信息HTML
    const lines = errorInfo.split('\n').filter(line => line.trim());
    const isLongMessage = lines.length > 3;
    
    errorDetailsSection.innerHTML = `
        <div class="error-specific-info">
            <div class="error-message-container">
                <strong>错误信息：</strong>
                <div class="error-message-content ${isLongMessage ? 'collapsible' : ''}">
                    ${lines.map(line => `<div class="error-line">${escapeHtml(line)}</div>`).join('')}
                </div>
                ${isLongMessage ? `
                    <button class="toggle-message">
                        <span class="expand-text">展开更多</span>
                        <span class="collapse-text">收起</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    // 如果是长消息，添加展开/收起功能
    if (isLongMessage) {
        const container = errorDetailsSection.querySelector('.error-message-content');
        const toggleBtn = errorDetailsSection.querySelector('.toggle-message');
        
        toggleBtn.addEventListener('click', () => {
            container.classList.toggle('expanded');
            toggleBtn.classList.toggle('expanded');
        });
    }
    
    // 将错误详情插入到错误内容区域和堆栈容器之间
    const errorDetailsElement = element.querySelector('.error-details');
    const stackContainer = element.querySelector('.stack-trace-container');
    errorDetailsElement.insertBefore(errorDetailsSection, stackContainer);
    
    // 设置堆栈信息
    const stackTrace = element.querySelector('.stack-trace');
    const stackToggle = element.querySelector('.stack-toggle');
    
    if (error.stack) {
        stackTrace.innerHTML = parseStackTrace(error.stack);
        
        stackToggle.addEventListener('click', () => {
            stackToggle.classList.toggle('expanded');
            stackTrace.classList.toggle('expanded');
            const isExpanded = stackToggle.classList.contains('expanded');
            stackToggle.innerHTML = `
                <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'}"></i>
                ${isExpanded ? '隐藏堆栈' : '显示堆栈'}
                <span class="stack-lines-count">(${countStackLines(error.stack)} 行)</span>
            `;
        });
    } else {
        stackToggle.style.display = 'none';
    }
    
    return element.querySelector('.error-item');
}

// 清理错误信息，去除错误类型前缀和其他干扰信息
function cleanErrorMessage(message) {
    if (!message) return '未知错误';
    
    // 移除错误类型前缀
    message = message.replace(/^(Error|TypeError|SyntaxError|ReferenceError|RangeError|URIError|EvalError):\s*/i, '');
    
    // 移除常见的干扰信息
    message = message.replace(/Module build failed/i, '').trim();
    message = message.replace(/Compilation failed/i, '').trim();
    
    // 秘除空括号
    message = message.replace(/\(\s*\)/g, '').trim();
    
    // 如果过滤后为空，则返回原始消息
    return message || '未知错误';
}

// 获取错误类别显示名称
function getCategoryName(category) {
    const names = {
        business: '业务代码',
        mpx: 'MPX框架',
        webpack: 'Webpack',
        other: '其他错误'
    };
    return names[category] || '未知类型';
}

// 格式化错误位置信息
function formatLocation(error) {
    // 不再显示文件路径信息，直接返回空字符串
    return '<span class="error-location-hidden">错误位置已隐藏</span>';
}

// 计算堆栈行数
function countStackLines(stack) {
    return stack.split('\n').filter(line => line.trim()).length;
}

// HTML转义
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


// 初始化事件监听
function initEventListeners() {
    // 搜索框事件
    elements.searchInput.addEventListener('input', debounce(() => {
        const searchTerm = elements.searchInput.value.toLowerCase();
        renderErrorList(searchTerm);
    }, 300));

    // 标签切换事件
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            elements.tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentView = button.dataset.tab;
            renderErrorList(elements.searchInput.value.toLowerCase());
        });
    });
}

// 初始化标签页切换功能
function initTabSwitching() {
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 更新视图状态
            currentView = button.getAttribute('data-tab');
            
            // 更新按钮状态
            elements.tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // 重置分组选择
            currentGroup = null;
            
            // 更新分组标签
            updateGroupTabs();
            
            // 重新渲染错误列表
            renderErrorList(elements.searchInput?.value.toLowerCase() || '');
        });
    });
}

// 分组标签点击处理
function handleGroupClick(group) {
    currentGroup = currentGroup === group ? null : group;
    
    // 更新 tab 的激活状态
    const groupTabs = document.querySelectorAll('.error-group-tab');
    groupTabs.forEach(tab => {
        if (tab.getAttribute('data-group') === group) {
            tab.classList.toggle('active', currentGroup === group);
        } else {
            tab.classList.remove('active');
        }
    });

    // 重新渲染错误列表
    renderErrorList(elements.searchInput.value);
}

// 渲染分组标签
function renderGroupTabs() {
    if (!currentReport || !elements.groupTabs) return;
    
    elements.groupTabs.innerHTML = '';
    const data = currentView === 'errors' ? currentReport.errors : currentReport.warnings;
    const groups = Object.keys(data);
    
    // 按照配置的顺序排序分组
    groups.sort((a, b) => {
        if (a === '其他') return 1;
        if (b === '其他') return -1;
        return 0;
    });

    groups.forEach(group => {
        const tab = document.createElement('div');
        tab.className = `error-group-tab ${currentGroup === group ? 'active' : ''}`;
        tab.setAttribute('data-group', group);
        tab.textContent = `${group} (${Object.keys(data[group] || {}).length})`;
        tab.onclick = () => handleGroupClick(group);
        elements.groupTabs.appendChild(tab);
    });
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
    const scrollThreshold = 300; // 显示按钮的滚动阈值

    function toggleBackToTop() {
        if (window.pageYOffset > scrollThreshold) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    }

    // 监听滚动事件
    window.addEventListener('scroll', toggleBackToTop);

    // 点击返回顶部
    backToTop.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // 初始检查是否需要显示按钮
    toggleBackToTop();
}

// 在文档加载完成后初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initBackToTop();
    initTabSwitching();
});
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

// 更新UI
function updateUI() {
    if (!currentReport) return;
    
    updateStats();
    updateLastUpdateTime();
    updateGroupTabs();
    
    const searchTerm = elements.searchInput?.value.toLowerCase() || '';
    if (currentView === 'files') {
        renderFilePathList(searchTerm);
    } else {
        renderErrorList(searchTerm);
    }
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
    
    // 如果是文件路径视图，显示文件类型切换按钮
    if (currentView === 'files') {
        // 分别收集错误和警告的文件路径
        const errorFilePaths = new Set();
        const warningFilePaths = new Set();
        
        // 从错误数据中收集文件路径
        if (currentReport.errors) {
            Object.values(currentReport.errors).forEach(group => {
                group.forEach(error => {
                    const filePath = error.fileFullPath || error.filePath;
                    if (filePath) {
                        errorFilePaths.add(filePath);
                    }
                });
            });
        }
        
        // 从警告数据中收集文件路径
        if (currentReport.warnings) {
            Object.values(currentReport.warnings).forEach(group => {
                group.forEach(warning => {
                    const filePath = warning.fileFullPath || warning.filePath;
                    if (filePath) {
                        warningFilePaths.add(filePath);
                    }
                });
            });
        }

        const errorFilePathsArray = Array.from(errorFilePaths).sort();
        const warningFilePathsArray = Array.from(warningFilePaths).sort();

        // 创建错误文件路径按钮
        const errorFileTab = document.createElement('button');
        errorFileTab.className = `group-tab ${currentFileView === 'error-files' ? 'active' : ''}`;
        errorFileTab.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            错误文件路径
            <span class="count">${errorFilePathsArray.length}</span>
        `;
        errorFileTab.addEventListener('click', () => {
            currentFileView = 'error-files';
            updateGroupTabs(); // 重新更新按钮状态
            renderFilePathList(elements.searchInput?.value.toLowerCase() || '');
        });
        groupTabsContainer.appendChild(errorFileTab);

        // 创建警告文件路径按钮
        const warningFileTab = document.createElement('button');
        warningFileTab.className = `group-tab ${currentFileView === 'warning-files' ? 'active' : ''}`;
        warningFileTab.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            警告文件路径
            <span class="count">${warningFilePathsArray.length}</span>
        `;
        warningFileTab.addEventListener('click', () => {
            currentFileView = 'warning-files';
            updateGroupTabs(); // 重新更新按钮状态
            renderFilePathList(elements.searchInput?.value.toLowerCase() || '');
        });
        groupTabsContainer.appendChild(warningFileTab);
        
        return;
    }
    
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
        tab.addEventListener('click', (event) => {
            document.querySelector('.group-tab.active').className = 'group-tab';
            currentGroup = group;
            event.target.className = 'group-tab active';
            // updateActiveGroupTab();
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
    STYLE_ERROR: '样式错误',     // MPX样式错误
    TEMPLATE_ERROR: '模板错误', // MPX模板错误
    MODULE_NOT_FOUND: '资源加载错误', // 模块未找到错误
    LACK_OF_LOADER: '缺少loader',  // 缺少loader
    SYNTAX_ERROR: '语法错误',
    TS_ERROR: 'TS类型错误',           // 类型错误
    ESLINT: 'eslint错误',
    JSONERROR: 'JSON配置错误',         // JSON解析错误
    MPXCOMPILEERROR: 'mpx编译错误',       // 配置错误
    OTHER: '其他错误',
    UNKNOWN: '未知错误'         // ESLint错误
};

// 获取错误类型
function getErrorType(error) {
    if (!error) return ERROR_TYPES.UNKNOWN;
    const stack = error.stack || '';
    switch (error.type) {
        case 'styleError':
            return ERROR_TYPES.STYLE_ERROR;
        case 'templateError':
            return ERROR_TYPES.TEMPLATE_ERROR;
        case 'moduleNotFound':
            return ERROR_TYPES.MODULE_NOT_FOUND;
        case 'LackOfLoader':
            return ERROR_TYPES.LACK_OF_LOADER;
        case 'syntaxError':
            return ERROR_TYPES.SYNTAX_ERROR;
        case 'TSError':
            return ERROR_TYPES.TS_ERROR;
        case 'eslintError':
            return ERROR_TYPES.ESLINT;
        case 'jsonError':
            return ERROR_TYPES.JSONERROR;
        case 'mpxCompileError':
            return ERROR_TYPES.OPTIONSERROR;
    }
    return ERROR_TYPES.OTHER;
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
    
    // 特殊处理：当选择"全部"时，拍平所有错误列表而非按模块分组
    if (!currentGroup) {
        // 创建单一容器
        const container = document.createElement('div');
        container.className = 'error-section module all-errors-container';
        
        // 创建标题
        const header = document.createElement('div');
        header.className = 'module-header';
        
        // 收集所有错误，添加所属分组信息
        let allErrors = [];
        Object.entries(data).forEach(([category, items]) => {
            items.forEach(item => {
                allErrors.push({
                    ...item,
                    _groupName: category // 添加分组信息
                });
            });
        });
        
        // 应用搜索过滤
        const filteredErrors = filterItems(allErrors, searchTerm);
        
        if (filteredErrors.length === 0) {
            elements.errorList.innerHTML = `<div class="empty-state">没有匹配的${currentView === 'errors' ? '错误' : '警告'}</div>`;
            return;
        }
        
        header.innerHTML = `
            <h3 class="module-title">
                <i class="fas fa-folder"></i>
                <span class="module-name">全部错误</span>
                <span class="error-count">${filteredErrors.length}</span>
            </h3>
        `;
        
        container.appendChild(header);
        
        // 创建错误类型过滤器
        const filterTabs = document.createElement('div');
        filterTabs.className = 'error-type-tabs';
        
        // 获取错误类型统计
        const typeStats = filteredErrors.reduce((acc, error) => {
            const type = getErrorType(error);
            acc[type] = (acc[type] || 0) + 1;
            acc.all = (acc.all || 0) + 1;
            return acc;
        }, {});
        
        // 添加类型过滤tab
        Object.entries(ERROR_TYPES).forEach(([key, value]) => {
            if (typeStats[value]) {
                const tab = document.createElement('button');
                tab.className = `error-type-tab ${value}`;
                tab.setAttribute('data-type', value);
                
                // 获取错误类型的显示文本
                const typeText = value === ERROR_TYPES.ALL ? '全部' : value;
                tab.textContent = `${typeText} (${typeStats[value]})`;
                
                tab.addEventListener('click', () => {
                    // 更新tab状态
                    filterTabs.querySelectorAll('.error-type-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    // 过滤错误项
                    const selectedType = tab.getAttribute('data-type');
                    errorsContainer.querySelectorAll('.error-item').forEach(item => {
                        const errorType = item.getAttribute('data-error-type');
                        item.style.display = (selectedType === 'all' || errorType === selectedType) ? '' : 'none';
                    });
                });
                
                filterTabs.appendChild(tab);
            }
        });
        
        // 默认选中"全部"
        filterTabs.querySelector('[data-type="all"]')?.classList.add('active');
        container.appendChild(filterTabs);
        
        // 创建错误列表容器
        const errorsContainer = document.createElement('div');
        errorsContainer.className = 'error-items';
        
        // 添加每个错误项
        filteredErrors.forEach(error => {
            const errorElement = createErrorElement(error, errorItemTemplate);
            errorsContainer.appendChild(errorElement);
        });
        
        container.appendChild(errorsContainer);
        elements.errorList.appendChild(container);
    } else {
        // 选中了特定分组，按原有逻辑处理
        const groupItems = data[currentGroup] || [];
        const filteredItems = filterItems(groupItems, searchTerm);
        if (filteredItems.length === 0) return;

        // 创建分组容器
        const moduleElement = errorTemplate.cloneNode(true);
        const moduleTitle = moduleElement.querySelector('.module-name');
        const errorCount = moduleElement.querySelector('.error-count');
        
        // 显示分组名称和错误数量，清理模块路径
        moduleTitle.textContent = cleanModulePath(currentGroup, currentGroup);
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
                    all: '全部'
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
    }
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

// 过滤错误项
function filterItems(items, searchTerm) {
    if (!searchTerm) return items;
    return items.filter(item => {
        const searchString = [
            item.message,
            item.filePath,
            item.category,
            item._groupName, // 加入分组名称用于搜索
            item.stack
        ].filter(Boolean).join(' ').toLowerCase();
        return searchString.includes(searchTerm);
    });
}

function parseStyleCompiler(message) {
  // 优化后的正则表达式：使用非贪婪匹配确保正确捕获完整路径和错误信息
  const pattern = /\[style compiler\]\[([^\]]+)\]:\s*(.+)/s;
  
  const match = message.match(pattern);
  
  if (match) {
    try {
      const location = decodeURIComponent(match[1]);
      // 直接返回完整错误信息（包含方括号内容）
      const messageStr = match[2].trim();
      
      return {
        location,
        message: messageStr,
        allMessage: message
      };
    } catch (e) {
      console.error("Decoding failed:", e);
      return {
        location: match[1],
        message: match[2].trim(),
        allMessage: message
      };
    }
  }
  
  // 未匹配时返回原始消息
  return { message };
}

// 清理错误信息，去除错误类型前缀和其他干扰信息
function cleanErrorMessage(message) {
    if (!message) return { message: '未知错误' };
    if (message.toLowerCase().includes('[style compiler]')) {
        return parseStyleCompiler(message);
    }
    
    return {
        message: message || '未知错误'
    };
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

// 去掉ANSI转义
function removeAnsiEscapes(text) {
  return text.replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, '');
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
    
     // 提取更具体的错误信息
    let { message: errorInfo, location: messageLocation, allMessage } = cleanErrorMessage(cleanedMessage);

    // 设置文件路径信息
    const filePath = messageLocation || errorFilePath || '未知文件';
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
    // 创建错误信息HTML
    const errorDetailsSection = document.createElement('div');
    const lines = errorInfo.split('\n').filter(line => line.trim());
    errorDetailsSection.className = 'error-detail-info';
    errorDetailsSection.innerHTML = `
        <div class="error-specific-info">
            <div class="error-message-container">
                <strong>错误信息：</strong>
                <div class="error-message-content">
                    ${lines.map(line => `<div class="error-line">${escapeHtml(removeAnsiEscapes(line))}</div>${error.hint ? '<div class="hint">' + error.hint + (error.document ? '<a target="_blank" class="document" href="' + error.document +'">参考文档</a>': '') + '</div>' : ''}`).join('')}
                </div>
                <button class="toggle-message" style="display:none;">
                    <span class="expand-text">展开更多</span>
                    <span class="collapse-text">收起</span>
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        </div>
    `;
    const errorDetails = document.createElement('div');
    // 添加完整错误信息（如果存在）
    if (allMessage) {
        errorDetails.className = 'error-detail-all';
        errorDetails.innerHTML = `
            <div class="error-all-message">
                <strong>完整错误信息：</strong>
                <div class="error-all-message-content">${escapeHtml(allMessage)}</div>
            </div>
        `;
        errorDetailsSection.appendChild(errorDetails);
    }

    // 使用 requestAnimationFrame 确保 DOM 已渲染，添加展开/收起功能
    const container = errorDetailsSection.querySelector('.error-message-content');
    const toggleBtn = errorDetailsSection.querySelector('.toggle-message');
    
    container.classList.add('collapsible');
    requestAnimationFrame(() => {
        // 判断内容是否需要展开/收起（超过72px，大约3行文本的高度）
        if (container.scrollHeight > 72) {
            toggleBtn.style.display = 'flex';
            
            toggleBtn.addEventListener('click', () => {
                container.classList.toggle('expanded');
                toggleBtn.classList.toggle('expanded');
            });
        }
    });
    
    // 将错误详情插入到错误内容区域和堆栈容器之间
    const errorDetailsElement = element.querySelector('.error-details');
    const stackContainer = element.querySelector('.stack-trace-container');
    errorDetailsElement.insertBefore(errorDetailsSection, stackContainer);
    errorDetailsElement.insertBefore(errorDetails, stackContainer);
    
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

// 初始化搜索功能
function initSearchInput() {
    const searchInput = elements.searchInput;
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            const searchTerm = e.target.value.toLowerCase();
            if (currentView === 'files') {
                renderFilePathList(searchTerm);
            } else {
                renderErrorList(searchTerm);
            }
        }, 300));
    }
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
            
            // 重置文件路径视图到默认状态
            if (currentView === 'files') {
                currentFileView = 'error-files';
            }
            
            // 更新分组标签
            updateGroupTabs();
            
            // 根据视图类型渲染不同内容
            if (currentView === 'files') {
                renderFilePathList(elements.searchInput?.value.toLowerCase() || '');
            } else {
                renderErrorList(elements.searchInput?.value.toLowerCase() || '');
            }
        });
    });
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

// 当前文件路径视图的子视图
let currentFileView = 'error-files'; // 'error-files' 或 'warning-files'

// 渲染文件路径列表
function renderFilePathList(searchTerm = '') {
    if (!currentReport || !elements.errorList) return;

    elements.errorList.innerHTML = '';

    // 分别收集错误和警告的文件路径
    const errorFilePaths = new Set();
    const warningFilePaths = new Set();
    
    // 从错误数据中收集文件路径
    if (currentReport.errors) {
        Object.values(currentReport.errors).forEach(group => {
            group.forEach(error => {
                const filePath = error.fileFullPath || error.filePath;
                if (filePath) {
                    errorFilePaths.add(filePath);
                }
            });
        });
    }
    
    // 从警告数据中收集文件路径
    if (currentReport.warnings) {
        Object.values(currentReport.warnings).forEach(group => {
            group.forEach(warning => {
                const filePath = warning.fileFullPath || warning.filePath;
                if (filePath) {
                    warningFilePaths.add(filePath);
                }
            });
        });
    }

    // 转换为数组并排序
    const errorFilePathsArray = Array.from(errorFilePaths).sort();
    const warningFilePathsArray = Array.from(warningFilePaths).sort();

    // 根据当前选择的视图决定显示哪些文件路径
    if (currentFileView === 'error-files') {
        // 显示错误文件路径
        let filteredErrorPaths = errorFilePathsArray;
        if (searchTerm) {
            filteredErrorPaths = errorFilePathsArray.filter(path => 
                path.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filteredErrorPaths.length > 0) {
            const errorContainer = createFilePathSection('错误文件路径', filteredErrorPaths, 'error-files', 'fas fa-exclamation-circle');
            elements.errorList.appendChild(errorContainer);
        } else {
            elements.errorList.innerHTML = `<div class="empty-state">没有找到错误文件路径</div>`;
        }
    } else {
        // 显示警告文件路径
        let filteredWarningPaths = warningFilePathsArray;
        if (searchTerm) {
            filteredWarningPaths = warningFilePathsArray.filter(path => 
                path.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filteredWarningPaths.length > 0) {
            const warningContainer = createFilePathSection('警告文件路径', filteredWarningPaths, 'warning-files', 'fas fa-exclamation-triangle');
            elements.errorList.appendChild(warningContainer);
        } else {
            elements.errorList.innerHTML = `<div class="empty-state">没有找到警告文件路径</div>`;
        }
    }
}

// 渲染文件路径内容的辅助函数
// 创建文件路径区块的辅助函数
function createFilePathSection(title, filePathsArray, className, iconClass) {
    const container = document.createElement('div');
    container.className = `file-paths-container ${className}`;
    
    const listContainer = document.createElement('div');
    listContainer.className = 'file-paths-list';

    filePathsArray.forEach(filePath => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-path-item';
        
        // 获取文件名和目录
        const fileName = filePath.split('/').pop();
        const directory = filePath.substring(0, filePath.lastIndexOf('/'));
        
        fileItem.innerHTML = `
            <div class="file-full-path">${escapeHtml(filePath)}</div>
            <div class="file-actions">
                <button class="copy-path-btn" data-path="${escapeHtml(filePath)}" title="复制路径">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `;
        
        // 添加复制功能
        const copyBtn = fileItem.querySelector('.copy-path-btn');
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(filePath).then(() => {
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            }).catch(() => {
                // 如果复制失败，显示路径
                alert(`文件路径: ${filePath}`);
            });
        });
        
        listContainer.appendChild(fileItem);
    });

    container.appendChild(listContainer);
    return container;
}

// 在文档加载完成后初始化所有功能
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initBackToTop();
    initTabSwitching();
    // 如果存在搜索框，初始化搜索功能
    if (elements.searchInput) {
        initSearchInput();
    }
});
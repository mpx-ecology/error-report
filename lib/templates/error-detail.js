// 错误详情页 SPA 组件
window.ErrorDetailPage = {
    errorData: null,
    container: null,

    // 初始化错误详情页
    init: function(container, errorId) {
        this.container = container;
        this.errorData = null;
        
        // 隐藏sub-header
        this.hideSubHeader();
        
        // 如果没有errorId，尝试从URL中获取
        if (!errorId) {
            errorId = this.getErrorIdFromUrl();
        }
        
        if (!errorId) {
            this.showErrorMessage('缺少错误ID参数，请从主页面点击错误项目进入详情页');
            return;
        }
        
        this.loadErrorDetails(errorId);
    },

    // 从URL中获取错误ID
    getErrorIdFromUrl: function() {
        try {
            const hash = window.location.hash;
            if (hash.includes('?')) {
                const params = new URLSearchParams(hash.split('?')[1]);
                return params.get('id');
            }
        } catch (error) {
            console.error('解析URL参数失败:', error);
        }
        return null;
    },

    // 加载错误详情
    loadErrorDetails: function(errorId) {
        const decodedErrorId = decodeURIComponent(errorId);
        console.log('=== 开始加载错误详情 ===');
        console.log('原始ID:', errorId);
        console.log('解码后ID:', decodedErrorId);
        
        // 识别ID类型
        if (decodedErrorId.startsWith('error-')) {
            console.log('🔴 检测到错误类型ID');
        } else if (decodedErrorId.startsWith('warning-')) {
            console.log('🟡 检测到警告类型ID');
        } else {
            console.log('⚪ 未检测到明确类型标识');
        }
        
        // 尝试从全局缓存获取数据
        if (window.getErrorData) {
            const errorData = window.getErrorData(decodedErrorId);
            if (errorData) {
                console.log('✅ 从全局缓存获取到错误数据:', errorData);
                this.errorData = errorData;
                // 保存到本地存储以防刷新丢失
                this.saveToLocalStorage(decodedErrorId, errorData);
                this.renderErrorDetails();
                return;
            } else {
                console.log('全局缓存中未找到错误数据，尝试其他方法...');
            }
        }
        
        // 如果全局缓存没有数据，尝试重新构建缓存
        if (window.currentReport && window.rebuildErrorCache) {
            console.log('尝试重新构建错误缓存...');
            window.rebuildErrorCache();
            
            // 重新尝试从缓存获取
            if (window.getErrorData) {
                const errorData = window.getErrorData(decodedErrorId);
                if (errorData) {
                    console.log('重新构建缓存后找到错误数据:', errorData);
                    this.errorData = errorData;
                    this.saveToLocalStorage(decodedErrorId, errorData);
                    this.renderErrorDetails();
                    return;
                }
            }
        }
        
        // 从本地存储加载
        console.log('尝试从本地存储加载...');
        this.loadFromLocalStorage(decodedErrorId);
    },

    // 从会话存储加载
    loadFromLocalStorage: function(errorId) {
        console.log('从会话存储加载错误详情，ID:', errorId);
        
        try {
            // 先尝试从专门的错误缓存中获取
            const errorCacheKey = `error-detail-${errorId}`;
            const cachedError = sessionStorage.getItem(errorCacheKey);
            if (cachedError) {
                console.log('从专门缓存找到错误数据');
                this.errorData = JSON.parse(cachedError);
                this.renderErrorDetails();
                return;
            }
            
            // 尝试从错误数据缓存中恢复
            const errorCacheData = sessionStorage.getItem('error-data-cache');
            if (errorCacheData) {
                console.log('尝试从错误数据缓存中查找...');
                const cacheMap = JSON.parse(errorCacheData);
                if (cacheMap[errorId]) {
                    console.log('从错误数据缓存找到数据:', cacheMap[errorId]);
                    this.errorData = cacheMap[errorId];
                    this.saveToLocalStorage(errorId, this.errorData);
                    this.renderErrorDetails();
                    return;
                }
                
                // 如果全局缓存不存在，重新创建
                if (!window.errorDataCache) {
                    console.log('重新创建全局错误缓存...');
                    window.errorDataCache = new Map();
                    Object.entries(cacheMap).forEach(([key, value]) => {
                        window.errorDataCache.set(key, value);
                    });
                    console.log('全局错误缓存已恢复，大小:', window.errorDataCache.size);
                    
                    // 再次尝试获取
                    if (window.errorDataCache.has(errorId)) {
                        this.errorData = window.errorDataCache.get(errorId);
                        this.saveToLocalStorage(errorId, this.errorData);
                        this.renderErrorDetails();
                        return;
                    }
                }
            }
            
            // 如果没有缓存，尝试从完整报告数据中查找
            const savedData = sessionStorage.getItem('report-data-cache');
            if (savedData) {
                console.log('尝试从完整报告数据中查找...');
                const data = JSON.parse(savedData);
                console.log('报告数据结构:', Object.keys(data));
                
                const errorData = this.findErrorInData(data, errorId);
                if (errorData) {
                    console.log('在报告数据中找到错误:', errorData);
                    this.errorData = errorData;
                    // 保存到专门的错误缓存
                    this.saveToLocalStorage(errorId, errorData);
                    this.renderErrorDetails();
                    return;
                } else {
                    console.log('在报告数据中未找到错误，ID:', errorId);
                    // 打印一些调试信息
                    if (data.errors) {
                        console.log('错误分组:', Object.keys(data.errors));
                        Object.entries(data.errors).forEach(([group, errors]) => {
                            console.log(`分组 ${group} 包含 ${errors.length} 个错误`);
                            errors.forEach((error, index) => {
                                console.log(`  错误 ${index}:`, {
                                    id: error.id,
                                    uuid: error.uuid,
                                    _id: error._id,
                                    generatedId: `error-${group}-${index}`,
                                    flatId: `flat-all-${index}`
                                });
                            });
                        });
                    }
                }
            } else {
                console.log('会话存储中没有报告数据');
            }
            
            // 如果本地存储也没有数据，显示提示用户返回主页重新加载的消息
            this.showErrorMessage('数据已过期，请返回主页重新加载数据后再查看详情');
        } catch (error) {
            console.error('读取会话数据失败:', error);
            this.showErrorMessage('数据加载失败，请返回主页重新加载数据');
        }
    },

    // 保存错误数据到会话存储
    saveToLocalStorage: function(errorId, errorData) {
        try {
            const errorCacheKey = `error-detail-${errorId}`;
            sessionStorage.setItem(errorCacheKey, JSON.stringify(errorData));
            console.log('错误数据已保存到会话存储:', errorCacheKey);
        } catch (error) {
            console.error('保存错误数据到会话存储失败:', error);
        }
    },

    // 在数据中查找错误
    findErrorInData: function(data, errorId) {
        let foundError = null;
        let globalIndex = 0; // 统一的全局索引，包括错误和警告
        
        console.log('查找错误ID:', errorId);
        
        // 首先尝试从错误缓存中查找
        if (window.errorDataCache && window.errorDataCache.has && window.errorDataCache.has(errorId)) {
            const cachedError = window.errorDataCache.get(errorId);
            console.log('从缓存中找到错误:', cachedError);
            return cachedError;
        }
        
        // 如果缓存中没有，从原始数据中查找
        console.log('缓存中没有找到，开始从原始数据查找...');
        
        // 识别ID类型和提取信息
        let dataType = null;
        let cleanId = errorId;
        let indexFromId = null;
        
        // 新的URL安全ID格式识别 (e0, e1, w0, w1等)
        if (/^e\d+$/.test(errorId)) {
            dataType = 'error';
            indexFromId = parseInt(errorId.substring(1)); // 提取数字部分
            console.log('检测到错误类型的URL安全ID，索引:', indexFromId);
        } else if (/^w\d+$/.test(errorId)) {
            dataType = 'warning';
            indexFromId = parseInt(errorId.substring(1)); // 提取数字部分
            console.log('检测到警告类型的URL安全ID，索引:', indexFromId);
        }
        // 传统ID格式识别
        else if (errorId.startsWith('err_')) {
            dataType = 'error';
            cleanId = errorId.substring(4); // 移除 'err_' 前缀
            console.log('检测到错误类型ID，清理后的ID:', cleanId);
        } else if (errorId.startsWith('warn_')) {
            dataType = 'warning';
            cleanId = errorId.substring(5); // 移除 'warn_' 前缀
            console.log('检测到警告类型ID，清理后的ID:', cleanId);
        } else if (errorId.startsWith('error-')) {
            dataType = 'error';
            cleanId = errorId.substring(6); // 移除 'error-' 前缀
            console.log('检测到错误类型ID，清理后的ID:', cleanId);
        } else if (errorId.startsWith('warning-')) {
            dataType = 'warning';
            cleanId = errorId.substring(8); // 移除 'warning-' 前缀
            console.log('检测到警告类型ID，清理后的ID:', cleanId);
        } else {
            console.log('未检测到明确的类型前缀，将在所有数据中查找');
        }
        
        // 如果有从ID提取的索引，直接定位查找（最高效）
        if (indexFromId !== null) {
            console.log(`使用索引快速查找: ${indexFromId}`);
            let currentIndex = 0;
            
            // 先遍历错误数据
            if (data.errors) {
                for (const [groupName, group] of Object.entries(data.errors)) {
                    if (Array.isArray(group)) {
                        for (let localIndex = 0; localIndex < group.length; localIndex++) {
                            if (currentIndex === indexFromId && dataType === 'error') {
                                console.log(`在索引 ${indexFromId} 找到错误:`, group[localIndex]);
                                return {
                                    ...group[localIndex],
                                    _type: 'error',
                                    _group: groupName,
                                    _localIndex: localIndex,
                                    _globalIndex: currentIndex,
                                    _urlSafeId: `e${currentIndex}`,
                                    _prefixedId: `err_${group[localIndex].id || group[localIndex].uuid || `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${localIndex}`}`
                                };
                            }
                            currentIndex++;
                        }
                    }
                }
            }
            
            // 然后遍历警告数据
            if (data.warnings) {
                for (const [groupName, group] of Object.entries(data.warnings)) {
                    if (Array.isArray(group)) {
                        for (let localIndex = 0; localIndex < group.length; localIndex++) {
                            if (currentIndex === indexFromId && dataType === 'warning') {
                                console.log(`在索引 ${indexFromId} 找到警告:`, group[localIndex]);
                                return {
                                    ...group[localIndex],
                                    _type: 'warning',
                                    _group: groupName,
                                    _localIndex: localIndex,
                                    _globalIndex: currentIndex,
                                    _urlSafeId: `w${currentIndex}`,
                                    _prefixedId: `warn_${group[localIndex].id || group[localIndex].uuid || `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${localIndex}`}`
                                };
                            }
                            currentIndex++;
                        }
                    }
                }
            }
            
            console.log(`索引 ${indexFromId} 查找失败`);
            return null;
        }
        
        // 回退到传统的遍历查找方式
        console.log('使用传统遍历查找方式...');
        
        // 根据检测到的数据类型进行查找
        if (dataType === 'error' || dataType === null) {
            // 在错误数据中查找
            if (data.errors) {
                Object.entries(data.errors).forEach(([groupName, group]) => {
                    if (Array.isArray(group)) {
                        group.forEach((error, localIndex) => {
                            if (!foundError) {
                                // 扩展可能的ID匹配列表，包含所有可能的ID格式
                                const safeGroupName = groupName.replace(/[^a-zA-Z0-9]/g, '_');
                                const baseId = error.id || error.uuid || `${safeGroupName}_${localIndex}`;
                                const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]/g, '_');
                                
                                const possibleIds = [
                                    error.id,
                                    error.uuid,
                                    error._id,
                                    error._prefixedId,
                                    error._flatId,
                                    error._urlSafeId,
                                    `e${globalIndex}`,  // 新的URL安全ID
                                    `err_${safeBaseId}`, // 新的安全前缀ID
                                    `${groupName}-${localIndex}`,
                                    `error-${groupName}-${localIndex}`,
                                    `flat-all-${globalIndex}`,
                                    `flat_${globalIndex}`,
                                    `error-flat-all-${globalIndex}`,
                                    `error_${globalIndex}`,
                                    cleanId, // 添加清理后的ID
                                    `error-${cleanId}`, // 添加带前缀的清理后ID
                                    `err_${cleanId}`, // 添加新前缀的清理后ID
                                    // 如果是flat相关的ID，也匹配
                                    cleanId.startsWith('flat-all-') ? cleanId : null,
                                    cleanId.startsWith('flat_') ? cleanId : null
                                ].filter(Boolean);
                                
                                console.log(`检查错误 [${groupName}][${localIndex}] (全局索引: ${globalIndex}):`, {
                                    errorData: error,
                                    possibleIds,
                                    targetId: errorId
                                });
                                
                                if (possibleIds.includes(errorId) || possibleIds.includes(cleanId)) {
                                    console.log('找到匹配的错误:', error);
                                    foundError = {
                                        ...error,
                                        _type: 'error',
                                        _group: groupName,
                                        _localIndex: localIndex,
                                        _globalIndex: globalIndex,
                                        _urlSafeId: `e${globalIndex}`,
                                        _prefixedId: `err_${safeBaseId}`,
                                        _flatId: `flat_${globalIndex}`
                                    };
                                }
                            }
                            globalIndex++; // 统一递增
                        });
                    }
                });
            }
        }
        
        // 如果指定查找警告或者没有找到且未指定类型，则在警告数据中查找
        if ((dataType === 'warning' || (dataType === null && !foundError)) && data.warnings) {
            Object.entries(data.warnings).forEach(([groupName, group]) => {
                if (Array.isArray(group)) {
                    group.forEach((warning, localIndex) => {
                        if (!foundError) {
                            // 扩展可能的ID匹配列表，包含所有可能的ID格式
                            const safeGroupName = groupName.replace(/[^a-zA-Z0-9]/g, '_');
                            const baseId = warning.id || warning.uuid || `${safeGroupName}_${localIndex}`;
                            const safeBaseId = baseId.replace(/[^a-zA-Z0-9_-]/g, '_');
                            
                            const possibleIds = [
                                warning.id,
                                warning.uuid,
                                warning._id,
                                warning._prefixedId,
                                warning._flatId,
                                warning._urlSafeId,
                                `w${globalIndex}`,  // 新的URL安全ID
                                `warn_${safeBaseId}`, // 新的安全前缀ID
                                `${groupName}-${localIndex}`,
                                `warning-${groupName}-${localIndex}`,
                                `flat-all-${globalIndex}`,
                                `flat_${globalIndex}`,
                                `warning-flat-all-${globalIndex}`,
                                `warning_${globalIndex}`,
                                cleanId, // 添加清理后的ID
                                `warning-${cleanId}`, // 添加带前缀的清理后ID
                                `warn_${cleanId}`, // 添加新前缀的清理后ID
                                // 如果是flat相关的ID，也匹配
                                cleanId.startsWith('flat-all-') ? cleanId : null,
                                cleanId.startsWith('flat_') ? cleanId : null
                            ].filter(Boolean);
                            
                            console.log(`检查警告 [${groupName}][${localIndex}] (全局索引: ${globalIndex}):`, {
                                warningData: warning,
                                possibleIds,
                                targetId: errorId
                            });
                            
                            if (possibleIds.includes(errorId) || possibleIds.includes(cleanId)) {
                                console.log('找到匹配的警告:', warning);
                                foundError = {
                                    ...warning,
                                    _type: 'warning',
                                    _group: groupName,
                                    _localIndex: localIndex,
                                    _globalIndex: globalIndex,
                                    _urlSafeId: `w${globalIndex}`,
                                    _prefixedId: `warn_${safeBaseId}`,
                                    _flatId: `flat_${globalIndex}`
                                };
                            }
                        }
                        globalIndex++; // 统一递增
                    });
                }
            });
        }
        
        // 如果还没找到，尝试从扁平化的reports数组中查找
        if (!foundError && data.reports && Array.isArray(data.reports)) {
            data.reports.forEach((item, index) => {
                const possibleIds = [
                    item.id,
                    item.uuid,
                    item._id,
                    item._prefixedId,
                    item._flatId,
                    `flat-all-${index}`,
                    `error-flat-all-${index}`,
                    `warning-flat-all-${index}`
                ];
                if (possibleIds.includes(errorId)) {
                    foundError = {
                        ...item,
                        _type: item._type || 'error',
                        _group: 'reports',
                        _index: index
                    };
                }
            });
        }
        
        if (!foundError) {
            console.log('未找到匹配的错误或警告，ID:', errorId);
            console.log('搜索详情:', {
                数据结构: Object.keys(data),
                错误分组: data.errors ? Object.keys(data.errors) : '无',
                警告分组: data.warnings ? Object.keys(data.warnings) : '无'
            });
        }
        
        return foundError;
    },

    // 渲染错误详情
    renderErrorDetails: function() {
        if (!this.errorData) {
            this.showErrorMessage('无法加载错误数据');
            return;
        }

        const errorType = this.errorData._type || 'error';
        const message = this.errorData.message || '无错误描述';
        const filePath = this.errorData.fileFullPath || this.errorData.filePath || '未知文件';
        const fileName = this.getFileName(filePath);
        const line = this.errorData.line || '未知';
        const column = this.errorData.column || '';
        const rule = this.errorData.rule || this.errorData.ruleId || '';
        const stack = this.errorData.stack || '';
        const severity = this.errorData.severity || errorType;

        const html = `
            <div class="error-detail-page">
                <!-- 返回导航栏 -->
                <div class="error-detail-nav">
                    <button class="back-btn" onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()">
                        <i class="fas fa-arrow-left"></i>
                        <span>返回主页</span>
                    </button>
                    <div class="nav-title">错误详情</div>
                </div>
                
                <div class="error-detail-container">
                    <div class="error-header">
                        <div class="error-type-badge ${errorType}">
                            <i class="fas fa-${errorType === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i>
                            ${errorType === 'error' ? '错误' : '警告'}
                        </div>
                        <h1 class="error-title">${message}</h1>
                    </div>

                    <div class="error-meta">
                        <div class="meta-section">
                            <h3><i class="fas fa-file-alt"></i> 文件信息</h3>
                            <div class="meta-item">
                                <span class="label">文件名:</span>
                                <span class="value">${fileName}</span>
                            </div>
                            <div class="meta-item">
                                <span class="label">文件路径:</span>
                                <span class="value">${filePath}</span>
                            </div>
                            <div class="meta-item">
                                <span class="label">位置:</span>
                                <span class="value">第 ${line} 行${column ? `, 第 ${column} 列` : ''}</span>
                            </div>
                            ${rule ? `
                            <div class="meta-item">
                                <span class="label">规则:</span>
                                <span class="value">${rule}</span>
                            </div>
                            ` : ''}
                        </div>

                        <div class="meta-section">
                            <h3><i class="fas fa-info-circle"></i> 错误详情</h3>                        <div class="meta-item">
                            <span class="label">严重程度:</span>
                            <span class="value severity-${severity}">${this.getSeverityLabel(severity)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">错误类型:</span>
                            <span class="value">${errorType}</span>
                        </div>
                        <div class="meta-item">
                            <span class="label">解决方案:</span>
                            <span class="value">
                                <a href="javascript:void(0)" onclick="window.ErrorDetailPage.showSolution('${rule || errorType}')" class="solution-link">
                                    <i class="fas fa-lightbulb"></i> 查看解决方案
                                </a>
                            </span>
                        </div>
                        ${this.errorData.timestamp ? `
                        <div class="meta-item">
                            <span class="label">发生时间:</span>
                            <span class="value">${new Date(this.errorData.timestamp).toLocaleString()}</span>
                        </div>
                        ` : ''}
                        </div>
                    </div>

                    ${message ? `
                    <div class="error-message-section">
                        <h3><i class="fas fa-comment-alt"></i> 错误消息</h3>
                        <div class="error-message-content">
                            <pre>${message}</pre>
                        </div>
                    </div>
                    ` : ''}

                    ${stack ? `
                    <div class="error-stack-section">
                        <h3><i class="fas fa-list"></i> 堆栈信息</h3>
                        <div class="error-stack-content">
                            <div class="stack-trace-container">
                                ${this.formatStackTrace(stack)}
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="action-buttons">
                        <button onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('file-detail', { path: '${encodeURIComponent(filePath)}' }) : history.back()" class="action-btn secondary">
                            <i class="fas fa-file"></i>
                            查看文件详情
                        </button>
                        <button onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()" class="action-btn primary">
                            <i class="fas fa-arrow-left"></i>
                            返回主页
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.initializeEventListeners();
    },

    // 获取严重程度标签
    getSeverityLabel: function(severity) {
        const labels = {
            'error': '错误',
            'warning': '警告',
            'info': '信息',
            'hint': '提示'
        };
        return labels[severity] || severity;
    },

    // 格式化堆栈信息
    formatStackTrace: function(stack) {
        if (!stack) return '';
        
        let stackLines = [];
        
        // 如果stack是字符串，处理换行和at替换
        if (typeof stack === 'string') {
            stackLines = stack
                .replace(/\s*at\s+/g, '\n@ ')  // 将 "at " 替换为 "@ " 并添加换行
                .replace(/^\n/, '')  // 移除开头的换行
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        }
        // 如果stack是数组，格式化后返回
        else if (Array.isArray(stack)) {
            stackLines = stack
                .map(line => typeof line === 'string' ? line.replace(/\s*at\s+/g, '@ ') : String(line))
                .filter(line => line.length > 0);
        }
        // 如果stack是对象，尝试序列化
        else {
            try {
                const stackStr = JSON.stringify(stack, null, 2);
                stackLines = stackStr.replace(/\s*at\s+/g, '@ ').split('\n');
            } catch (e) {
                stackLines = [String(stack).replace(/\s*at\s+/g, '@ ')];
            }
        }
        
        // 返回结构化的HTML
        return stackLines.map((line, index) => {
            const processedLine = this.highlightFileLocation(line);
            return `<div class="stack-line" data-line="${index + 1}">${processedLine}</div>`;
        }).join('');
    },

    // 高亮显示文件位置的行列号
    highlightFileLocation: function(line) {
        if (!line) return line;
        
        // 匹配文件路径和行列号的正则表达式
        // 匹配格式：完整路径:行号:列号
        const locationRegex = /([^\s\(\)]+\.(js|ts|vue|jsx|tsx|css|scss|less|html|json)):(\d+):(\d+)/g;
        
        return line.replace(locationRegex, (match, filePath, ext, lineNum, colNum) => {
            // 保持完整路径，只高亮行列号
            return `${filePath}:<span class="location-highlight">${lineNum}:${colNum}</span>`;
        });
    },

    // 获取文件名
    getFileName: function(filePath) {
        if (!filePath) return '未知文件';
        const parts = filePath.split(/[/\\]/);
        return parts[parts.length - 1];
    },

    // 显示错误消息
    showErrorMessage: function(message) {
        if (this.container) {
            this.container.innerHTML = `
                <div class="error-detail-page">
                    <!-- 返回导航栏 -->
                    <div class="error-detail-nav">
                        <button class="back-btn" onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()">
                            <i class="fas fa-arrow-left"></i>
                            <span>返回主页</span>
                        </button>
                        <div class="nav-title">错误详情</div>
                    </div>
                    
                    <div class="error-detail-container">
                        <div class="error-state">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h3>无法加载错误详情</h3>
                            <p>${message}</p>
                            <div class="error-state-actions">
                                <button onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()" class="action-btn primary">
                                    <i class="fas fa-arrow-left"></i>
                                    返回主页
                                </button>
                                <button onclick="window.location.reload()" class="action-btn secondary">
                                    <i class="fas fa-sync-alt"></i>
                                    刷新页面
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    // 隐藏sub-header
    hideSubHeader: function() {
        const subHeader = document.querySelector('.sub-header');
        if (subHeader) {
            subHeader.style.display = 'none';
        }
    },

    // 显示sub-header (页面切换时恢复)
    showSubHeader: function() {
        const subHeader = document.querySelector('.sub-header');
        if (subHeader) {
            subHeader.style.display = 'flex';
        }
    },

    // 页面清理
    cleanup: function() {
        this.showSubHeader();
    },

    // 显示解决方案
    showSolution: function(ruleOrType) {
        let solutions = this.getSolutionsByRule(ruleOrType);
        const message = this.errorData.message || '';
        if (this.errorData.type === 'styleError') {
            const regex = /Property\s+\[([^\]]+)\]\s+on\s+([\w\s\.\-#]+)\s+is\s+not\s+supported\s+in\s+([\w\s]+)\s+environment!/;
            const notSupported = message.match(regex)
            const propNotSupportedRegex = /Value of\s+([\w-]+)\s+in\b.*?\bshould be\b.*?\breceived\s*(\[?[^,\]]+\]?)\s*,\s*please check again!/
            const propNotSupported = message.match(propNotSupportedRegex);
            if (notSupported?.length) {
                solutions = [{
                    title: '属性不支持',
                    description: `属性 [${notSupported[1]}] 在环境 [${notSupported[3]}] 中不支持，请检查[${notSupported[2]}]样式或使用其他兼容的属性。`
                }];
            } else if (message.includes('Only single class selector is supported in react native mode temporarily')) {
                solutions = [{
                    title: '只支持单个类选择器',
                    description: 'react native模式暂时只支持单个类选择器。',
                    linkText: '查看文档',
                    linkUrl: 'https://mpxjs.cn/guide/platform/rn.html#css%E9%80%89%E6%8B%A9%E5%99%A8'
                }];
            } else if (propNotSupported?.length) {
                solutions = [{
                    title: '属性值不支持',
                    description: `属性 [${propNotSupported[1]}] 的值 ${propNotSupported[2]} 不被支持，请检查样式或使用其他兼容的值。`,
                    linkText: '查看文档',
                    linkUrl: `https://mpxjs.cn/guide/platform/rn.html#${propNotSupported[1]}`
                }];
            }
        }
        // 创建解决方案弹窗
        const modal = document.createElement('div');
        modal.className = 'solution-modal';
        modal.innerHTML = `
            <div class="solution-modal-content">
                <div class="solution-modal-header">
                    <h3><i class="fas fa-lightbulb"></i> 解决方案</h3>
                    <button class="solution-modal-close" onclick="this.closest('.solution-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="solution-modal-body">
                    <div class="solution-content">
                        ${solutions.map(solution => `
                            <div class="solution-item">
                                <h5><i class="fas fa-check-circle"></i> ${solution.title}</h5>
                                <p>${solution.description}</p>
                                ${solution.code ? `<pre class="solution-code"><code>${solution.code}</code></pre>` : ''}
                                ${solution.linkText ? `<a class="solution-link" href="${solution.linkUrl}" target="_blank">${solution.linkText}</a>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    // 根据规则获取解决方案
    getSolutionsByRule: function(ruleOrType) {
        const solutionMap = {
            'eslintError': [
                {
                    title: '检查ESLint配置',
                    description: '确保项目根目录下有正确的.eslintrc配置文件，并且规则设置合理。'
                },
                {
                    title: '自动修复',
                    description: '运行ESLint自动修复命令',
                    code: 'npx eslint --fix <文件路径>'
                }
            ],
            'TSError': [
                {
                    title: '检查TypeScript类型',
                    description: '确保所有变量和函数都有正确的类型声明，检查类型定义文件是否正确引入。'
                },
                {
                    title: '更新类型定义',
                    description: '安装或更新相关的类型定义包',
                    code: 'npm install --save-dev @types/<package-name>'
                }
            ],
            'moduleNotFound': [
                {
                    title: '检查模块路径',
                    description: '确保模块路径正确，检查文件是否存在于指定位置。'
                },
                {
                    title: '安装依赖',
                    description: '如果是第三方模块，确保已正确安装',
                    code: 'npm install <module-name>'
                }
            ],
            'syntaxError': [
                {
                    title: '检查语法',
                    description: '仔细检查代码语法，确保括号、引号等符号正确配对。'
                },
                {
                    title: '使用代码格式化工具',
                    description: '使用Prettier等工具格式化代码',
                    code: 'npx prettier --write <文件路径>'
                }
            ],
            'styleError': [
                {
                    title: '检查CSS语法',
                    description: '确保CSS选择器和属性值语法正确，检查是否有拼写错误。'
                }
            ],
            'templateError': [
                {
                    title: '检查模板语法',
                    description: '确保模板语法正确，检查变量名和指令使用是否正确。'
                }
            ]
        };

        return solutionMap[ruleOrType] || [
            {
                title: '通用解决方案',
                description: '检查代码语法和逻辑，查看官方文档或搜索相关错误信息以获取更多帮助。'
            }
        ];
    },

    // 初始化事件监听
    initializeEventListeners: function() {
        // 在SPA环境中，事件监听主要通过内联onclick处理
        // 可以在这里添加其他需要的事件监听器
    }
};

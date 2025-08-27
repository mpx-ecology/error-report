// 文件详情页 SPA 组件
window.FileDetailPage = {
    fileData: null,
    container: null,
    activeFilters: new Set(['errors', 'warnings']),

    // 初始化文件详情页
    init: function(container, filePath) {
        this.container = container;
        this.fileData = null;
        this.activeFilters = new Set(['errors', 'warnings']);
        
        // 隐藏sub-header
        this.hideSubHeader();
        
        // 如果没有filePath，尝试从URL中获取
        if (!filePath) {
            filePath = this.getFilePathFromUrl();
        }
        
        if (!filePath) {
            this.showErrorMessage('缺少文件路径参数，请从主页面点击文件项目进入详情页');
            return;
        }
        
        this.loadFileDetails(filePath);
    },

    // 从URL中获取文件路径
    getFilePathFromUrl: function() {
        try {
            const hash = window.location.hash;
            if (hash.includes('?')) {
                const params = new URLSearchParams(hash.split('?')[1]);
                return params.get('path');
            }
        } catch (error) {
            console.error('解析URL参数失败:', error);
        }
        return null;
    },

    // 加载文件详情
    loadFileDetails: function(filePath) {
        const decodedFilePath = filePath.path ? decodeURIComponent(filePath.path) : decodeURIComponent(filePath);
        console.log('开始加载文件详情:', decodedFilePath);
        
        // 尝试从全局缓存获取数据
        if (window.getFileErrorsData) {
            console.log('尝试从全局缓存获取数据...');
            const fileErrorsData = window.getFileErrorsData(decodedFilePath);
            console.log('全局缓存数据:', fileErrorsData);
            
            if (fileErrorsData && (fileErrorsData.errors.length > 0 || fileErrorsData.warnings.length > 0)) {
                console.log('从全局缓存成功获取数据');
                this.fileData = {
                    path: decodedFilePath,
                    errors: fileErrorsData.errors,
                    warnings: fileErrorsData.warnings
                };
                // 保存到本地存储以防刷新丢失
                this.saveToLocalStorage(decodedFilePath, this.fileData);
                this.renderFileDetails();
                return;
            }
        } else {
            console.log('全局缓存函数不存在');
        }
        
        // 如果全局函数不存在，尝试从全局报告数据中直接提取
        if (window.reportDataCache) {
            console.log('尝试从全局报告数据中直接提取...');
            const fileData = this.extractFileDataFromReport(window.reportDataCache, decodedFilePath);
            console.log('从报告数据提取结果:', fileData);
            
            if (fileData && (fileData.errors.length > 0 || fileData.warnings.length > 0)) {
                console.log('从报告数据成功获取数据');
                this.fileData = fileData;
                this.saveToLocalStorage(decodedFilePath, fileData);
                this.renderFileDetails();
                return;
            }
        } else {
            console.log('全局报告数据不存在');
        }
        
        console.log('尝试从本地存储加载...');
        // 从本地存储加载
        this.loadFromLocalStorage(decodedFilePath);
    },

    // 从报告数据中直接提取文件信息
    extractFileDataFromReport: function(reportData, filePath) {
        try {
            const fileErrors = [];
            const fileWarnings = [];

            if (reportData && reportData.files) {
                reportData.files.forEach(file => {
                    if (file.path === filePath) {
                        if (file.errors) {
                            fileErrors.push(...file.errors.map(error => ({
                                ...error,
                                _type: 'error',
                                fileFullPath: filePath,
                                id: error.id || `error-${Math.random().toString(36).substr(2, 9)}`
                            })));
                        }
                        if (file.warnings) {
                            fileWarnings.push(...file.warnings.map(warning => ({
                                ...warning,
                                _type: 'warning',
                                fileFullPath: filePath,
                                id: warning.id || `warning-${Math.random().toString(36).substr(2, 9)}`
                            })));
                        }
                    }
                });
            }

            return {
                path: filePath,
                errors: fileErrors,
                warnings: fileWarnings
            };
        } catch (error) {
            console.error('从报告数据提取文件信息失败:', error);
            return null;
        }
    },

    // 从本地存储加载
    loadFromLocalStorage: function(filePath) {
        console.log('从本地存储加载:', filePath);
        try {
            // 先尝试从专门的文件缓存中获取元数据
            const fileCacheKey = `file-detail-${encodeURIComponent(filePath)}`;
            const cachedFileMetadata = sessionStorage.getItem(fileCacheKey);
            console.log('文件缓存键:', fileCacheKey);
            console.log('缓存的元数据:', cachedFileMetadata);
            
            if (cachedFileMetadata) {
                const metadata = JSON.parse(cachedFileMetadata);
                console.log('解析的元数据:', metadata);
                
                // 如果是新格式的轻量级元数据，从全局缓存重建文件数据
                if (metadata.errorIds || metadata.warningIds) {
                    console.log('检测到新格式元数据，尝试重建...');
                    const fileData = this.rebuildFileDataFromMetadata(metadata, filePath);
                    console.log('重建结果:', fileData);
                    
                    if (fileData && (fileData.errors.length > 0 || fileData.warnings.length > 0)) {
                        console.log('从元数据重建成功');
                        this.fileData = fileData;
                        this.renderFileDetails();
                        return;
                    }
                } else if (metadata.errors && metadata.warnings) {
                    // 兼容旧格式的完整数据
                    console.log('使用旧格式的完整数据');
                    this.fileData = metadata;
                    this.renderFileDetails();
                    return;
                }
            }
            
            console.log('尝试从完整报告数据中查找...');
            // 如果没有缓存或重建失败，尝试从完整报告数据中查找
            const savedData = sessionStorage.getItem('report-data-cache');
            console.log('报告数据缓存存在:', !!savedData);
            
            if (savedData) {
                const data = JSON.parse(savedData);
                console.log('解析的报告数据:', data);
                
                // 检查是否是轻量级元数据格式
                if (data.lastUpdate && !data.files) {
                    console.log('检测到轻量级报告缓存');
                    // 新格式只有元数据，无法直接提取文件数据
                    // 尝试从全局错误缓存中查找
                    const fileData = this.extractFileData(null, filePath);
                    if (fileData && (fileData.errors.length > 0 || fileData.warnings.length > 0)) {
                        this.fileData = fileData;
                        // 保存到专门的文件缓存
                        this.saveToLocalStorage(filePath, fileData);
                        this.renderFileDetails();
                        return;
                    }
                } else if (data.files) {
                    console.log('检测到完整报告数据');
                    // 兼容旧格式的完整数据
                    const fileData = this.extractFileData(data, filePath);
                    if (fileData && (fileData.errors.length > 0 || fileData.warnings.length > 0)) {
                        this.fileData = fileData;
                        // 保存到专门的文件缓存
                        this.saveToLocalStorage(filePath, fileData);
                        this.renderFileDetails();
                        return;
                    }
                }
            }
            
            console.log('无法找到任何数据，显示错误消息');
            // 如果本地存储也没有数据，显示提示用户返回主页重新加载的消息
            this.showErrorMessage('数据已过期或该文件暂无错误信息，请返回主页重新加载数据');
        } catch (error) {
            console.error('读取本地数据失败:', error);
            this.showErrorMessage('数据加载失败，请返回主页重新加载数据');
        }
    },

    // 从元数据重建文件数据
    rebuildFileDataFromMetadata: function(metadata, filePath) {
        try {
            const fileErrors = [];
            const fileWarnings = [];

            // 从全局错误缓存中查找对应的错误数据
            if (window.errorDataCache && metadata.errorIds) {
                metadata.errorIds.forEach(errorId => {
                    const errorData = window.errorDataCache.get(errorId);
                    if (errorData && (errorData.fileFullPath === filePath || errorData.filePath === filePath)) {
                        fileErrors.push(errorData);
                    }
                });
            }

            if (window.errorDataCache && metadata.warningIds) {
                metadata.warningIds.forEach(warningId => {
                    const warningData = window.errorDataCache.get(warningId);
                    if (warningData && (warningData.fileFullPath === filePath || warningData.filePath === filePath)) {
                        fileWarnings.push(warningData);
                    }
                });
            }

            // 如果从ID查找失败，回退到传统的遍历方法
            if (fileErrors.length === 0 && fileWarnings.length === 0 && window.errorDataCache) {
                window.errorDataCache.forEach(item => {
                    const itemFilePath = item.fileFullPath || item.filePath;
                    if (itemFilePath === filePath) {
                        if (item._type === 'error') {
                            fileErrors.push(item);
                        } else if (item._type === 'warning') {
                            fileWarnings.push(item);
                        }
                    }
                });
            }

            // 如果仍然没有数据，尝试从全局报告缓存中提取
            if (fileErrors.length === 0 && fileWarnings.length === 0 && window.reportDataCache) {
                const reportFileData = this.extractFileDataFromReport(window.reportDataCache, filePath);
                if (reportFileData) {
                    return reportFileData;
                }
            }

            return {
                path: filePath,
                errors: fileErrors,
                warnings: fileWarnings
            };
        } catch (error) {
            console.error('从元数据重建文件数据失败:', error);
            
            // 作为最后的回退，尝试从全局报告数据中提取
            if (window.reportDataCache) {
                try {
                    return this.extractFileDataFromReport(window.reportDataCache, filePath);
                } catch (fallbackError) {
                    console.error('回退提取也失败:', fallbackError);
                }
            }
            
            return null;
        }
    },

    // 保存文件数据到会话存储(只存储轻量级元数据)
    saveToLocalStorage: function(filePath, fileData) {
        try {
            const fileCacheKey = `file-detail-${encodeURIComponent(filePath)}`;
            
            // 只保存轻量级元数据，避免存储配额超限
            const lightweightData = {
                path: fileData.path,
                errorCount: fileData.errors ? fileData.errors.length : 0,
                warningCount: fileData.warnings ? fileData.warnings.length : 0,
                errorIds: fileData.errors ? fileData.errors.map(e => e.id || e.uuid || e._id).filter(Boolean) : [],
                warningIds: fileData.warnings ? fileData.warnings.map(w => w.id || w.uuid || w._id).filter(Boolean) : [],
                timestamp: Date.now()
            };
            
            sessionStorage.setItem(fileCacheKey, JSON.stringify(lightweightData));
            
            // 清理旧的文件详情缓存，防止无限增长
            this.cleanupOldFileCaches();
        } catch (error) {
            console.error('保存文件数据到会话存储失败:', error);
            // 如果存储失败，尝试清理一些旧缓存后重试
            try {
                this.cleanupOldFileCaches();
                const lightweightData = {
                    path: fileData.path,
                    errorCount: fileData.errors ? fileData.errors.length : 0,
                    warningCount: fileData.warnings ? fileData.warnings.length : 0,
                    timestamp: Date.now()
                };
                sessionStorage.setItem(fileCacheKey, JSON.stringify(lightweightData));
            } catch (retryError) {
                console.warn('重试保存文件缓存也失败，继续运行但可能影响刷新后的数据展示');
            }
        }
    },

    // 清理旧的文件详情缓存
    cleanupOldFileCaches: function() {
        try {
            const keys = Object.keys(sessionStorage);
            const fileCacheKeys = keys.filter(key => key.startsWith('file-detail-'));
            
            // 如果文件缓存超过15个，删除最旧的
            if (fileCacheKeys.length > 15) {
                const cacheData = fileCacheKeys.map(key => {
                    try {
                        const data = JSON.parse(sessionStorage.getItem(key));
                        return { key, timestamp: data.timestamp || 0 };
                    } catch (e) {
                        return { key, timestamp: 0 };
                    }
                }).sort((a, b) => a.timestamp - b.timestamp);
                
                // 删除最旧的5个缓存
                const toDelete = cacheData.slice(0, 5);
                toDelete.forEach(item => {
                    sessionStorage.removeItem(item.key);
                });
            }
        } catch (error) {
            console.error('清理文件缓存失败:', error);
        }
    },

    // 从数据中提取文件信息（优化版，避免重复存储）
    extractFileData: function(data, filePath) {
        const fileErrors = [];
        const fileWarnings = [];

        // 先从全局错误缓存中查找
        if (window.errorDataCache) {
            // 由于现在每个错误只存储一次，不需要去重逻辑
            window.errorDataCache.forEach(item => {
                const itemFilePath = item.fileFullPath || item.filePath;
                if (itemFilePath === filePath) {
                    if (item._type === 'error') {
                        fileErrors.push(item);
                    } else if (item._type === 'warning') {
                        fileWarnings.push(item);
                    }
                }
            });
        }

        // 如果从全局缓存没找到数据，尝试从传入的数据中提取
        if (fileErrors.length === 0 && fileWarnings.length === 0 && data) {
            if (data.files) {
                // 处理完整的报告数据格式
                data.files.forEach(file => {
                    if (file.path === filePath) {
                        if (file.errors) {
                            fileErrors.push(...file.errors.map(error => ({
                                ...error,
                                _type: 'error',
                                fileFullPath: filePath,
                                id: error.id || `error-${Math.random().toString(36).substr(2, 9)}`
                            })));
                        }
                        if (file.warnings) {
                            fileWarnings.push(...file.warnings.map(warning => ({
                                ...warning,
                                _type: 'warning', 
                                fileFullPath: filePath,
                                id: warning.id || `warning-${Math.random().toString(36).substr(2, 9)}`
                            })));
                        }
                    }
                });
            }
        }

        // 最后的回退：如果仍然没有数据，尝试从全局报告缓存中提取
        if (fileErrors.length === 0 && fileWarnings.length === 0 && window.reportDataCache) {
            const fileData = this.extractFileDataFromReport(window.reportDataCache, filePath);
            if (fileData) {
                return fileData;
            }
        }

        return {
            path: filePath,
            errors: fileErrors,
            warnings: fileWarnings
        };
    },

    // 渲染文件详情
    renderFileDetails: function() {
        if (!this.fileData) {
            this.showErrorMessage('无法加载文件数据');
            return;
        }

        const fileName = this.getFileName(this.fileData.path);
        const totalErrors = this.fileData.errors.length;
        const totalWarnings = this.fileData.warnings.length;

        const html = `
            <div class="file-detail-page">
                <!-- 返回导航栏 -->
                <div class="error-detail-nav">
                    <button class="back-btn" onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()">
                        <i class="fas fa-arrow-left"></i>
                        <span>返回主页</span>
                    </button>
                    <div class="nav-title">文件详情</div>
                </div>
                
                <div class="error-detail-container">
                    <div class="file-header">
                        <h1>
                            <i class="fas fa-file-alt"></i>
                            ${fileName}
                        </h1>
                        <p class="file-path">${this.fileData.path}</p>
                        <div class="file-stats">
                            <div class="stat-item error">
                                <i class="fas fa-times-circle"></i>
                                <span class="count">${totalErrors}</span>
                                <span class="label">错误</span>
                            </div>
                            <div class="stat-item warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span class="count">${totalWarnings}</span>
                                <span class="label">警告</span>
                            </div>
                        </div>
                    </div>

                    <div class="filter-controls">
                        <div class="filter-group">
                            <label class="filter-option">
                                <input type="checkbox" class="filter-checkbox" value="errors" ${this.activeFilters.has('errors') ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                显示错误 (${totalErrors})
                            </label>
                            <label class="filter-option">
                                <input type="checkbox" class="filter-checkbox" value="warnings" ${this.activeFilters.has('warnings') ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                显示警告 (${totalWarnings})
                            </label>
                        </div>
                    </div>

                    <div class="issues-container">
                        <div class="issues-list" id="issuesList">
                            ${this.renderIssuesList()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.initializeEventListeners();
    },

    // 渲染问题列表
    renderIssuesList: function() {
        const items = [];
        
        if (this.activeFilters.has('errors')) {
            items.push(...this.fileData.errors.map(error => this.createIssueItem(error, 'error')));
        }
        
        if (this.activeFilters.has('warnings')) {
            items.push(...this.fileData.warnings.map(warning => this.createIssueItem(warning, 'warning')));
        }

        if (items.length === 0) {
            return '<div class="no-results">没有符合条件的问题</div>';
        }

        return items.join('');
    },

    // 创建问题项
    createIssueItem: function(item, type) {
        const uniqueId = item.id || item.uuid || item._id || `${type}-${Math.random().toString(36).substr(2, 9)}`;
        const line = item.line || '未知';
        const column = item.column || '';
        const message = item.message || item.description || '无描述';
        const rule = item.rule || item.ruleId || '';

        // 将数据存储到一个全局映射中，避免在HTML中序列化复杂对象
        if (!window.fileDetailItemsCache) {
            window.fileDetailItemsCache = new Map();
        }
        
        const itemCacheKey = `file-item-${uniqueId}-${Date.now()}`;
        window.fileDetailItemsCache.set(itemCacheKey, item);

        return `
            <div class="issue-item ${type}" onclick="window.FileDetailPage.viewErrorDetailByCacheKey('${itemCacheKey}')">
                <div class="issue-header">
                    <div class="issue-meta">
                        <span class="issue-type ${type}">
                            <i class="fas fa-${type === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i>
                            ${type === 'error' ? '错误' : '警告'}
                        </span>
                        <span class="issue-location">
                            第 ${line} 行${column ? `, 第 ${column} 列` : ''}
                        </span>
                        ${rule ? `<span class="issue-rule">${rule}</span>` : ''}
                    </div>
                    <i class="fas fa-chevron-right issue-arrow"></i>
                </div>
                <div class="issue-message">${ansiToHtml(message)}</div>
            </div>
        `;
    },

    // 通过缓存键查看错误详情
    viewErrorDetailByCacheKey: function(cacheKey) {
        try {
            if (!window.fileDetailItemsCache || !window.fileDetailItemsCache.has(cacheKey)) {
                console.error('未找到缓存的错误数据:', cacheKey);
                return;
            }
            
            const item = window.fileDetailItemsCache.get(cacheKey);
            
            // 调用原来的方法
            this.viewErrorDetail(item.id || cacheKey, item);
        } catch (error) {
            console.error('通过缓存键查看错误详情失败:', error);
        }
    },

    // 查看错误详情
    viewErrorDetail: function(errorId, errorData) {
        try {
            const item = typeof errorData === 'string' ? JSON.parse(errorData) : errorData;
            
            // 生成唯一ID用于跳转
            const uniqueId = item.id || item.uuid || item._id || `file-error-${errorId}`;
            
            // 确定错误类型
            const errorType = item._type || item.type || (item.severity === 'error' ? 'error' : 'warning');
            
            // 获取原始ID (去掉前缀)
            let originalId = item.id;
            if (typeof originalId === 'string') {
                if (originalId.startsWith('error-')) {
                    originalId = originalId.substring(6);
                } else if (originalId.startsWith('warning-')) {
                    originalId = originalId.substring(8);
                }
            }
            
            // 尝试获取分组信息
            const groupName = item._group || item.group || item.groupName || null;
            
            // 在全局缓存数据
            if (!window.errorDataCache) {
                window.errorDataCache = new Map();
            }
            window.errorDataCache.set(uniqueId, item);
            
            // 添加获取数据的API
            window.getErrorData = function(id) {
                return window.errorDataCache.get(id);
            };
            
            // 构造完整的参数对象
            const errorDetailParams = {
                id: uniqueId,
                type: errorType,
                originalId: originalId,
                group: groupName
            };
            
            // 使用SPA路由跳转
            if (window.SPA && window.SPA.navigateTo) {
                window.SPA.navigateTo('error-detail', errorDetailParams);
            }
        } catch (error) {
            console.error('跳转到错误详情失败:', error);
        }
    },

    // 初始化事件监听
    initializeEventListeners: function() {
        // 筛选器事件
        const filterCheckboxes = this.container.querySelectorAll('.filter-checkbox');
        filterCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const value = e.target.value;
                if (e.target.checked) {
                    this.activeFilters.add(value);
                } else {
                    this.activeFilters.delete(value);
                }
                this.updateIssuesList();
            });
        });
    },

    // 更新问题列表
    updateIssuesList: function() {
        const issuesList = this.container.querySelector('#issuesList');
        if (issuesList) {
            issuesList.innerHTML = this.renderIssuesList();
        }
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
                <div class="file-detail-page">
                    <div class="error-detail-nav">
                        <button class="back-btn" onclick="window.SPA && window.SPA.navigateTo ? window.SPA.navigateTo('main') : history.back()">
                            <i class="fas fa-arrow-left"></i>
                            <span>返回主页</span>
                        </button>
                        <div class="nav-title">文件详情</div>
                    </div>
                    
                    <div class="error-detail-container">
                        <div class="error-state">
                            <i class="fas fa-exclamation-triangle"></i>
                            <h3>无法加载文件详情</h3>
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
    }
};

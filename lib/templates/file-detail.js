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
        const decodedFilePath = decodeURIComponent(filePath);
        
        // 尝试从全局缓存获取数据
        if (window.getFileErrorsData) {
            const fileErrorsData = window.getFileErrorsData(decodedFilePath);
            if (fileErrorsData && (fileErrorsData.errors.length > 0 || fileErrorsData.warnings.length > 0)) {
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
        }
        
        // 从本地存储加载
        this.loadFromLocalStorage(decodedFilePath);
    },

    // 从本地存储加载
    loadFromLocalStorage: function(filePath) {
        try {
            // 先尝试从专门的文件缓存中获取
            const fileCacheKey = `file-detail-${encodeURIComponent(filePath)}`;
            const cachedFile = sessionStorage.getItem(fileCacheKey);
            if (cachedFile) {
                this.fileData = JSON.parse(cachedFile);
                this.renderFileDetails();
                return;
            }
            
            // 如果没有缓存，尝试从完整报告数据中查找
            const savedData = sessionStorage.getItem('report-data-cache');
            if (savedData) {
                const data = JSON.parse(savedData);
                const fileData = this.extractFileData(data, filePath);
                if (fileData && (fileData.errors.length > 0 || fileData.warnings.length > 0)) {
                    this.fileData = fileData;
                    // 保存到专门的文件缓存
                    this.saveToLocalStorage(filePath, fileData);
                    this.renderFileDetails();
                    return;
                }
            }
            
            // 如果本地存储也没有数据，显示提示用户返回主页重新加载的消息
            this.showErrorMessage('数据已过期或该文件暂无错误信息，请返回主页重新加载数据');
        } catch (error) {
            console.error('读取本地数据失败:', error);
            this.showErrorMessage('数据加载失败，请返回主页重新加载数据');
        }
    },

    // 保存文件数据到会话存储
    saveToLocalStorage: function(filePath, fileData) {
        try {
            const fileCacheKey = `file-detail-${encodeURIComponent(filePath)}`;
            sessionStorage.setItem(fileCacheKey, JSON.stringify(fileData));
        } catch (error) {
            console.error('保存文件数据到会话存储失败:', error);
        }
    },

    // 从数据中提取文件信息
    extractFileData: function(data, filePath) {
        const fileErrors = [];
        const fileWarnings = [];

        // 从全局错误缓存中查找
        if (window.errorDataCache) {
            window.errorDataCache.forEach(item => {
                const itemFilePath = item.fileFullPath || item.filePath;
                if (itemFilePath === filePath) {
                    if (item._type === 'error') {
                        fileErrors.push(item);
                    } else {
                        fileWarnings.push(item);
                    }
                }
            });
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

        return `
            <div class="issue-item ${type}" onclick="window.FileDetailPage.viewErrorDetail('${uniqueId}', ${JSON.stringify(item).replace(/"/g, '&quot;')})">
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
                <div class="issue-message">${message}</div>
            </div>
        `;
    },

    // 查看错误详情
    viewErrorDetail: function(errorId, errorData) {
        try {
            const item = typeof errorData === 'string' ? JSON.parse(errorData) : errorData;
            
            // 生成唯一ID用于跳转
            const uniqueId = item.id || item.uuid || item._id || `file-error-${errorId}`;
            
            // 在全局缓存数据
            if (!window.errorDataCache) {
                window.errorDataCache = new Map();
            }
            window.errorDataCache.set(uniqueId, item);
            
            // 添加获取数据的API
            window.getErrorData = function(id) {
                return window.errorDataCache.get(id);
            };
            
            // 使用SPA路由跳转
            if (window.SPA && window.SPA.navigateTo) {
                window.SPA.navigateTo('error-detail', { id: uniqueId });
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

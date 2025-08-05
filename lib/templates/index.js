/**
 * SPA 错误分析工具 - 基于原有逻辑的整合版本
 * 整合 main.js, main-new.js, error-detail.js, file-detail.js 的功能
 */

class SPAController {
    constructor() {
        this.currentPage = 'main';
        this.errorAnalyzer = null; // main.js 的实例
        this.errorAnalyzerNew = null; // main-new.js 的功能
        this.currentErrorData = null;
        this.currentFileData = null;
        this.init();
    }

    init() {
        this.setupNavigation();
        this.initializePages();
        console.log('✅ SPA 控制器已初始化');
    }

    // 设置导航功能
    setupNavigation() {
        const navItems = document.querySelectorAll('.spa-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = item.dataset.page;
                this.navigateToPage(targetPage);
            });
        });
    }

    // 页面导航
    navigateToPage(pageName) {
        // 隐藏所有页面
        document.querySelectorAll('.spa-page').forEach(page => {
            page.classList.remove('active');
        });

        // 显示目标页面
        const targetPage = document.getElementById(pageName);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // 更新导航状态
        document.querySelectorAll('.spa-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

        this.currentPage = pageName;

        // 根据页面类型初始化相应功能
        this.initializePage(pageName);
    }

    // 初始化各个页面
    initializePages() {
        // 延迟初始化，确保 DOM 加载完成
        setTimeout(() => {
            this.initializePage('main');
        }, 100);
    }

    // 初始化特定页面
    initializePage(pageName) {
        switch (pageName) {
            case 'main':
                this.initializeMainPage();
                break;
            case 'main-new':
                this.initializeMainNewPage();
                break;
            case 'error-detail':
                this.initializeErrorDetailPage();
                break;
            case 'file-detail':
                this.initializeFileDetailPage();
                break;
            case 'test-tools':
                // iframe 页面不需要特殊初始化
                break;
        }
    }

    // 初始化主页 (基于 main.js)
    initializeMainPage() {
        if (this.errorAnalyzer) {
            return; // 已经初始化过
        }

        // 确保 ErrorAnalyzer 类可用
        if (typeof ErrorAnalyzer !== 'undefined') {
            this.errorAnalyzer = new ErrorAnalyzer();
            console.log('✅ 主页面 (main.js) 已初始化');
        } else {
            console.warn('⚠️ ErrorAnalyzer 类未找到，请确保 main.js 已加载');
        }
    }

    // 初始化错误列表页 (基于 main-new.js)
    initializeMainNewPage() {
        // main-new.js 的功能是自动初始化的，这里只需要确保页面元素正确
        console.log('✅ 错误列表页 (main-new.js) 已初始化');
        
        // 如果有全局的初始化函数，可以在这里调用
        if (typeof initWebSocket !== 'undefined') {
            // 确保 WebSocket 连接正常
            if (!ws) {
                initWebSocket();
            }
        }
    }

    // 初始化错误详情页
    initializeErrorDetailPage() {
        console.log('✅ 错误详情页已初始化');
        
        // 设置错误详情显示
        this.setupErrorDetailHandlers();
    }

    // 初始化文件详情页
    initializeFileDetailPage() {
        console.log('✅ 文件详情页已初始化');
        
        // 设置文件详情显示
        this.setupFileDetailHandlers();
    }

    // 设置错误详情处理器
    setupErrorDetailHandlers() {
        // 添加全局函数，供其他页面调用来显示错误详情
        window.showErrorDetailInSPA = (errorData) => {
            this.currentErrorData = errorData;
            this.navigateToPage('error-detail');
            this.renderErrorDetail(errorData);
        };
    }

    // 设置文件详情处理器
    setupFileDetailHandlers() {
        // 添加全局函数，供其他页面调用来显示文件详情
        window.showFileDetailInSPA = (filePath) => {
            this.navigateToPage('file-detail');
            this.loadFileDetail(filePath);
        };
    }

    // 渲染错误详情
    renderErrorDetail(errorData) {
        if (!errorData) {
            console.warn('没有错误数据可显示');
            return;
        }

        try {
            // 基本信息
            this.updateElement('errorType', errorData.severity || '未知');
            this.updateElement('errorTypeDetail', errorData.type || '-');
            this.updateElement('errorGroup', errorData.group || '-');
            this.updateElement('errorSeverityDetail', errorData.severity || '-');
            this.updateElement('errorTimeDetail', this.formatTime(errorData.timestamp) || '-');
            this.updateElement('filePath', errorData.filePath || '-');
            this.updateElement('errorLocation', `Line ${errorData.line || '?'}:${errorData.column || '?'}`);

            // 错误消息
            this.updateElement('errorMessage', errorData.message || '无错误消息');
            this.updateElement('fullError', errorData.fullError || errorData.description || '无详细错误信息');
            this.updateElement('stackTrace', errorData.stack || '无堆栈信息');
            this.updateElement('rawErrorData', JSON.stringify(errorData, null, 2));

            // 相关文件
            this.renderRelatedFiles(errorData.relatedFiles || []);

            console.log('✅ 错误详情已渲染');
        } catch (error) {
            console.error('渲染错误详情时出错:', error);
        }
    }

    // 渲染相关文件
    renderRelatedFiles(relatedFiles) {
        const container = document.getElementById('relatedFiles');
        if (!container || !relatedFiles.length) {
            if (container) container.innerHTML = '<div class="no-data">无相关文件</div>';
            return;
        }

        const html = relatedFiles.map(file => `
            <div class="related-file-item">
                <div class="file-info">
                    <i class="fas fa-file-code"></i>
                    <span class="file-path">${file.path || file}</span>
                    ${file.line ? `<span class="file-line">:${file.line}</span>` : ''}
                </div>
                <button class="view-file-btn" onclick="spa.viewFileDetail('${file.path || file}')">
                    查看文件
                </button>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    // 加载文件详情
    loadFileDetail(filePath) {
        this.updateElement('fileName', filePath.split('/').pop() || filePath);
        this.updateElement('fileFullPath', filePath);

        // 这里可以调用原有的文件详情加载逻辑
        if (typeof loadFileDataFromServer !== 'undefined') {
            // 模拟加载文件数据
            console.log(`加载文件详情: ${filePath}`);
        }
    }

    // 工具函数
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            if (element.tagName === 'PRE' || element.tagName === 'CODE') {
                element.textContent = value;
            } else {
                element.innerHTML = value;
            }
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            return date.toLocaleString();
        } catch (e) {
            return timestamp;
        }
    }

    // 查看文件详情
    viewFileDetail(filePath) {
        this.loadFileDetail(filePath);
    }

    // 从错误列表查看错误详情
    viewErrorDetail(errorData) {
        this.renderErrorDetail(errorData);
    }
}

// 全局变量
let spa;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    spa = new SPAController();
    
    // 等待其他脚本加载完成后再初始化
    setTimeout(() => {
        console.log('🎉 SPA 错误分析工具已完全加载');
        
        // 提供全局访问接口
        window.spa = spa;
        
        // 重写一些全局函数以支持 SPA 导航
        if (typeof window.showErrorDetail === 'undefined') {
            window.showErrorDetail = (errorData) => {
                spa.renderErrorDetail(errorData);
                spa.navigateToPage('error-detail');
            };
        }
        
        if (typeof window.showFileDetail === 'undefined') {
            window.showFileDetail = (filePath) => {
                spa.loadFileDetail(filePath);
                spa.navigateToPage('file-detail');
            };
        }
    }, 500);
});

// 确保兼容性：如果其他脚本需要访问错误数据
window.getErrorByIndex = function(type, index, group) {
    // 兼容原有的 getErrorByIndex 函数
    if (window.opener && window.opener.getErrorByIndex) {
        return window.opener.getErrorByIndex(type, index, group);
    }
    
    // 从当前页面数据中查找
    if (spa && spa.errorAnalyzer && spa.errorAnalyzer.errorData) {
        const errors = spa.errorAnalyzer.errorData.filter(e => 
            e.type === type && e.group === group
        );
        return errors[index] || null;
    }
    
    return null;
};

console.log('✅ SPA index.js 已加载完成');

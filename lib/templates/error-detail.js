// 处理 ANSI 转义序列的函数
function processAnsiStyles(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // ANSI 颜色代码映射
    const colorMap = {
        // 前景色
        '30': 'color: #000000', '31': 'color: #cd3131', '32': 'color: #0dbc79', '33': 'color: #e5e510',
        '34': 'color: #2472c8', '35': 'color: #bc3fbc', '36': 'color: #11a8cd', '37': 'color: #e5e5e5',
        // 明亮前景色
        '90': 'color: #666666', '91': 'color: #f14c4c', '92': 'color: #23d18b', '93': 'color: #f5f543',
        '94': 'color: #3b8eea', '95': 'color: #d670d6', '96': 'color: #29b8db', '97': 'color: #ffffff',
        // 背景色
        '40': 'background-color: #000000', '41': 'background-color: #cd3131', '42': 'background-color: #0dbc79',
        '43': 'background-color: #e5e510', '44': 'background-color: #2472c8', '45': 'background-color: #bc3fbc',
        '46': 'background-color: #11a8cd', '47': 'background-color: #e5e5e5',
        // 明亮背景色
        '100': 'background-color: #666666', '101': 'background-color: #f14c4c', '102': 'background-color: #23d18b',
        '103': 'background-color: #f5f543', '104': 'background-color: #3b8eea', '105': 'background-color: #d670d6',
        '106': 'background-color: #29b8db', '107': 'background-color: #ffffff'
    };

    // 样式代码映射
    const styleMap = {
        '1': 'font-weight: bold', '2': 'opacity: 0.5', '3': 'font-style: italic',
        '4': 'text-decoration: underline', '9': 'text-decoration: line-through',
        '22': 'font-weight: normal; opacity: 1', '23': 'font-style: normal',
        '24': 'text-decoration: none', '29': 'text-decoration: none'
    };

    // 当前激活的样式
    let currentStyles = new Set();
    let result = '';
    let openTags = [];

    // 分割文本，保留 ANSI 序列
    const parts = text.split(/(\x1b\[[0-9;]*m)/);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // 检查是否是 ANSI 转义序列
        const ansiMatch = part.match(/\x1b\[([0-9;]*)m/);
        
        if (ansiMatch) {
            const codes = ansiMatch[1].split(';').filter(code => code !== '');
            
            // 处理每个代码
            for (const code of codes) {
                if (code === '0' || code === '') {
                    // 重置所有样式
                    if (openTags.length > 0) {
                        result += '</span>';
                        openTags = [];
                        currentStyles.clear();
                    }
                } else if (colorMap[code] || styleMap[code]) {
                    // 处理样式重置
                    if (code === '22') {
                        currentStyles.delete('1');
                        currentStyles.delete('2');
                    } else if (code === '23') {
                        currentStyles.delete('3');
                    } else if (code === '24') {
                        currentStyles.delete('4');
                    } else if (code === '29') {
                        currentStyles.delete('9');
                    } else {
                        currentStyles.add(code);
                    }
                    
                    // 关闭之前的 span
                    if (openTags.length > 0) {
                        result += '</span>';
                        openTags = [];
                    }
                    
                    // 生成新的样式
                    if (currentStyles.size > 0) {
                        const styles = Array.from(currentStyles)
                            .map(code => colorMap[code] || styleMap[code])
                            .filter(Boolean);
                        
                        if (styles.length > 0) {
                            result += `<span style="${styles.join('; ')}">`;
                            openTags.push('span');
                        }
                    }
                }
            }
        } else if (part) {
            // 处理普通文本，转义 HTML 字符
            const processedText = part
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            
            result += processedText;
        }
    }
    
    // 关闭所有未关闭的标签
    if (openTags.length > 0) {
        result += '</span>';
    }
    
    return result;
}

// 处理行列换行的函数
function addLineColumnBreaks(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text
        // 匹配独立的"数字:数字"格式，在后面添加换行
        .replace(/(\d+:\d+)(<\/span>)/g, '$1$2<div class="line-break"></div>')
}

// 主处理函数，先处理样式再处理换行
function ansiToHtml2(text) {
    // 第一步：处理 ANSI 样式
    let processedText = processAnsiStyles(text);
    
    // 第二步：添加行列换行
    processedText = addLineColumnBreaks(processedText);
    
    return processedText;
}

// 错误详情页 SPA 组件
window.ErrorDetailPage = {
    errorData: null,
    container: null,

    // 初始化错误详情页
    init: function(container, errorIdOrInfo) {
        this.container = container || document.getElementById('errorDetailContent');
        this.errorData = null;
        
        // 隐藏sub-header
        this.hideSubHeader();
        
        let idInfo = null;
        let errorId = null;
        
        // 判断传入参数的类型
        if (typeof errorIdOrInfo === 'object' && errorIdOrInfo !== null) {
            // 通过对象形式传递过来的参数
            idInfo = errorIdOrInfo;
            errorId = idInfo.id;
        } else if (typeof errorIdOrInfo === 'string') {
            // 如果传入的是字符串ID，解析其类型
            errorId = errorIdOrInfo;
            if (errorId.startsWith('error-')) {
                idInfo = {
                    id: errorId,
                    type: 'error',
                    originalId: errorId.substring(6)
                };
            } else if (errorId.startsWith('warning-')) {
                idInfo = {
                    id: errorId,
                    type: 'warning', 
                    originalId: errorId.substring(8)
                };
            } else {
                idInfo = {
                    id: errorId,
                    type: null,
                    originalId: errorId,
                    group: null
                };
            }
        } else {
            // 如果没有传入参数，尝试从URL中获取
            idInfo = this.getErrorIdFromUrl();
            if (idInfo) {
                errorId = idInfo.id;
            }
        }
        
        if (!errorId) {
            this.showErrorMessage('缺少错误ID参数，请从主页面点击错误项目进入详情页');
            return;
        }
        
        this.loadErrorDetails(errorId, idInfo);
    },

    // 从URL中获取错误ID、类型和分组
    getErrorIdFromUrl: function() {
        try {
            const hash = window.location.hash;
            if (hash.includes('?')) {
                const params = new URLSearchParams(hash.split('?')[1]);
                const id = params.get('id');
                const type = params.get('type');
                const originalId = params.get('originalId');
                const group = params.get('group');
                
                return {
                    id: id,
                    type: type,
                    originalId: originalId,
                    group: group
                };
            }
        } catch (error) {
            console.error('解析URL参数失败:', error);
        }
        return null;
    },

    // 加载错误详情
    loadErrorDetails: function(errorId, idInfo) {
        const decodedErrorId = decodeURIComponent(errorId);
        
        // 优先从idInfo中获取类型和分组信息
        const errorType = idInfo?.type;
        const originalId = idInfo?.originalId || decodedErrorId;
        const groupName = idInfo?.group;
        
        if (!errorType || !originalId) {
            this.showErrorMessage('无效的错误参数，请从主页面重新进入');
            return;
        }
        
        // 直接从error-report.json加载数据
        this.loadFromErrorReport(errorType, originalId, decodedErrorId, groupName);
    },

    // 渲染错误详情

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
                    <button class="back-btn" onclick="history.back()">
                        <i class="fas fa-arrow-left"></i>
                        <span>返回</span>
                    </button>
                    <div class="nav-title">错误详情</div>
                </div>
                
                <div class="error-detail-container">
                    <div class="error-header">
                        <div class="error-type-badge ${errorType}">
                            <i class="fas fa-${errorType === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i>
                            ${errorType === 'error' ? '错误' : '警告'}
                        </div>
                        <h1 class="error-title">${ansiToHtml2(message)}</h1>
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
                            ${ansiToHtml2(message)}
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
            stackLines = ansiToHtml(stack)
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
        let solutions
        if (this.errorData.typeDesc) {
            solutions = [{
                title: this.errorData.type,
                description: this.errorData.typeDesc
            }]
        } else {
            solutions = this.getSolutionsByRule(ruleOrType);
        }
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
    },

    // 直接从error-report.json查找错误
    loadFromErrorReport: function(errorType, originalId, fullId, groupName) {
        
        // 直接从服务器获取error-report.json数据
        fetch('/error-report.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(reportData => {
                console.log('📊 报告数据统计:', {
                    errors: reportData.errors ? Object.keys(reportData.errors).length : 0,
                    warnings: reportData.warnings ? Object.keys(reportData.warnings).length : 0
                });
                
                // 根据类型选择对应的数据源
                const dataSource = errorType === 'error' ? reportData.errors : reportData.warnings;
                if (!dataSource) {
                    console.log(`❌ 数据源为空: ${errorType}`);
                    this.showErrorMessage(`未找到${errorType === 'error' ? '错误' : '警告'}数据`);
                    return;
                }
                
                let foundError = null;
                let globalIndex = 0;
                
                // 如果有分组信息，直接在指定分组中查找
                if (groupName && dataSource[groupName]) {
                    console.log(`🎯 在指定分组 "${groupName}" 中查找...`);
                    const groupItems = dataSource[groupName];
                    
                    if (Array.isArray(groupItems)) {
                      foundError = groupItems.find((item, localIndex) => item.id === +originalId)
                    }
                }
                
                if (foundError) {
                    console.log('🎉 成功找到错误数据:', foundError);
                    this.errorData = foundError;
                    this.renderErrorDetails();
                } else {
                    console.log('❌ 未找到匹配的错误数据');
                    console.log('调试信息:', {
                        errorType: errorType,
                        originalId: originalId,
                        groupName: groupName,
                        dataSourceKeys: Object.keys(dataSource),
                        totalItems: Object.values(dataSource).reduce((sum, group) => sum + (Array.isArray(group) ? group.length : 0), 0)
                    });
                    this.showErrorMessage(`未找到ID为 "${originalId}" 的${errorType === 'error' ? '错误' : '警告'}数据${groupName ? `（分组: ${groupName}）` : ''}`);
                }
            })
            .catch(error => {
                console.error('从error-report.json加载数据失败:', error);
                this.showErrorMessage('无法加载错误报告数据，请检查服务器连接');
            });
    },
};

const fs = require('fs');
const path = require('path');
const ErrorReportServer = require('./server');
const HtmlGenerator = require('./html-generator');
const { default: open } = require('open');

class WebpackErrorCollector {
  constructor(options = {}) {
    this.options = {
      outputPath: 'dist/errorLog',
      Warnings: { 
        includes: [], 
        excludes: [] 
      },
      errors: { 
        includes: [], 
        excludes: [],
        blocking: [],
        blockingMessage: '存在强阻断错误，编译已停止'
      },
      autoStartServer: false,
      compilePath: [],
      errorConfig: {}, // 新增错误配置文件路径
      ...options
    };
    
    // 初始化错误分组配置
    this.errorGroups = [];
    if (process.env.DEBUG) {
      console.debug('\n=== 初始化错误分组配置 ===');
      console.debug('options:', {
        errorConfigFilePath: this.options.errorConfigFilePath,
        errorConfig: this.options.errorConfig
      });
    }
    
    if (this.options.errorConfig) {
      try {
        this.errorGroups = this.options.errorConfig.groups || [];
        if (process.env.DEBUG) {
          console.debug('已加载错误分组:', this.errorGroups);
        }
      } catch (error) {
        console.error('加载错误配置文件失败:', error);
      }
    } else {
      console.warn('未找到 errorConfig 配置');
    }

    this.errors = [];
    this.warnings = [];
    this.server = null;
    this.errorTypes = {
      'syntax': '语法错误',
      'dependency': '依赖错误',
      'configuration': '配置错误',
      'typescript': 'TypeScript错误',
      'eslint': 'ESLint错误',
      'compilation': '编译错误',
      'runtime': '运行时错误',
      'import': '导入错误',
      'type': '类型错误',
      'reference': '引用错误',
      'unknown': '未知错误'
    };
  }

  // 确保目录存在
  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // 清理旧的报告文件
  cleanOldReports(outputDir) {
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      files.forEach(file => {
        const filePath = path.join(outputDir, file);
        if (file !== 'port-info.json') {
          fs.unlinkSync(filePath);
        }
      });
    }
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('WebpackErrorCollector', (compilation) => {
      compilation.hooks.afterSeal.tap('WebpackErrorCollector', () => {
        this.errors = [...compilation.errors];
        this.warnings = [...compilation.warnings];
      });
    });

    // 使用一个标志位来追踪编译状态
    let isCompiling = false;
    
    compiler.hooks.done.tap('WebpackErrorCollector', async (stats) => {
      // 如果正在处理中，则跳过
      if (isCompiling) {
        return;
      }
      
      isCompiling = true;
      try {
        const { errors, warnings } = stats.toJson();
        // const { warnings } = stats.toJson();
        // const errors = require('./errorinfo.json')
        let processedErrors = errors.map(err => this.processError(err));
        let processedWarnings = warnings.map(warn => this.processError(warn));

      // 根据compilePath过滤错误和警告
      if (this.options.compilePath && this.options.compilePath.length > 0) {
        processedErrors = this.filterByPath(processedErrors);
        processedWarnings = this.filterByPath(processedWarnings);
      }

      // 按错误类型过滤
      processedErrors = this.filterByType(processedErrors, this.options.errors);
      processedWarnings = this.filterByType(processedWarnings, this.options.Warnings);

      // 按配置的路径对错误和警告进行分组
      const errorsByGroup = this.groupByConfiguredPaths(processedErrors);
      const warningsByGroup = this.groupByConfiguredPaths(processedWarnings);

      const report = {
        timestamp: new Date().toISOString(),
        buildStatus: processedErrors.length > 0 ? 'failed' : 'success',
        errors: errorsByGroup,
        warnings: warningsByGroup
      };

      // 清理并写入报告
      const outputDir = path.resolve(process.cwd(), this.options.outputPath);
      this.ensureDirectory(outputDir);
      this.cleanOldReports(outputDir);
      const reportPath = path.join(outputDir, 'error-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      // 处理阻断错误
      const blockingErrors = processedErrors.filter(err => 
        this.options.errors.blocking.includes(err.type)
      );
      if (blockingErrors.length > 0) {
        console.error(`\n${this.options.errors.blockingMessage}`);
        blockingErrors.forEach(err => {
          console.error(`[${err.typeDesc}] ${err.filePath || '未知文件'}: ${err.message}`);
        });
        process.exit(1);
      }

      // 自动启动服务器
      if (this.options.autoStartServer) {
        await this.handleServerStart(reportPath);
      }
      } finally {
        // 重置编译状态
        isCompiling = false;
      }
    });
  }

  // 处理服务器启动
  async handleServerStart(reportPath) {
    try {
      // 确保输出目录存在
      const outputDir = path.resolve(process.cwd(), this.options.outputPath);
      this.ensureDirectory(outputDir);

      // 先生成HTML报告
      const htmlGenerator = new HtmlGenerator(this.options.outputPath);
      await htmlGenerator.generateReportHtml();
      console.log('已生成HTML报告文件');

      // 等待文件写入完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 如果存在旧的服务器实例，先关闭它
      if (this.server) {
        try {
          await new Promise((resolve) => {
            if (this.server.wss) {
              this.server.wss.clients.forEach(client => {
                client.terminate();
              });
              this.server.wss.close();
            }
            if (this.server.server) {
              this.server.server.close(() => {
                setTimeout(resolve, 1000); // 等待端口完全释放
              });
            } else {
              resolve();
            }
          });
        } catch (err) {
          console.warn('关闭旧服务器实例时出错:', err);
        }
        this.server = null;
      }

      // 创建并启动新服务器，或更新现有服务器
      if (!this.server) {
        // 创建新的服务器实例
        this.server = new ErrorReportServer(reportPath, {
          outputDir: outputDir
        });

        try {
          // 启动服务器
          const serverInfo = await this.server.start();
          
          if (serverInfo?.port) {
            // 延迟打开浏览器，避免与服务器启动的日志混淆
            setTimeout(async () => {
              const url = `http://localhost:${serverInfo.port}`;
              console.log(`\n正在打开错误报告页面: ${url}`);
              try {
                // 首先尝试使用 Chrome 打开
                await open(url, {
                  app: {
                    name: ['google chrome', 'chrome']
                  }
                });
              } catch (err) {
                // 如果 Chrome 失败，使用默认浏览器并等待打开完成
                try {
                  await open(url);
                } catch (fallbackErr) {
                  console.error('打开浏览器失败:', fallbackErr);
                }
              }
            }, 500);
          }
        } catch (error) {
          console.error('服务器启动失败:', error);
          this.server = null; // 重置服务器状态
          throw error;
        }
      } else {
        // 如果服务器已经存在，只更新报告
        await this.server.updateReport(reportPath);
      }
    } catch (error) {
      console.error('启动错误报告服务失败:', error);
      throw error;
    }
  }

  // 按文件路径对错误进行分组
  groupByFile(items) {
    return items.reduce((acc, item) => {
      const filePath = item.module?.resource || item.filePath || '未知文件';
      if (!acc[filePath]) {
        acc[filePath] = [];
      }
      acc[filePath].push(item);
      return acc;
    }, {});
  }

  // 按配置的路径对错误进行分组
  /**
   * 检查路径是否匹配规则
   * @param {string} filePath 文件路径
   * @param {Array} includeRules 包含规则数组
   * @returns {boolean}
   */
  checkPathMatch(filePath, includeRules) {
    if (!filePath || !includeRules || !includeRules.length) {
      if (process.env.DEBUG) {
        console.debug('无效的参数:', { filePath, includeRules });
      }
      return false;
    }
    
    // 标准化文件路径，确保使用正斜杠
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    if (process.env.DEBUG) {
      console.debug('\n=== 路径匹配检查 ===');
      console.debug('检查的文件路径:', normalizedFilePath);
    }
    
    // 转换和验证规则
    const processedRules = includeRules.map(rule => {
      if (typeof rule === 'string') {
        return { type: 'string', value: rule, original: rule };
      } else if (rule instanceof RegExp) {
        return { 
          type: 'RegExp', 
          value: rule, 
          original: rule,
          pattern: rule.toString(),
          source: rule.source,
          flags: rule.flags
        };
      } else if (rule && typeof rule === 'object' && rule.pattern) {
        // 处理可能是字符串形式的正则表达式
        try {
          const regexp = new RegExp(rule.pattern, rule.flags || '');
          return { 
            type: 'RegExp', 
            value: regexp, 
            original: rule,
            pattern: regexp.toString(),
            source: regexp.source,
            flags: regexp.flags
          };
        } catch (e) {
          console.error('创建正则表达式失败:', e);
          return null;
        }
      }
      console.warn('无效的规则类型:', rule);
      return null;
    }).filter(Boolean);

    if (process.env.DEBUG) {
      console.debug('处理后的规则:', processedRules);
    }

    return processedRules.some(rule => {
      try {
        if (process.env.DEBUG) {
          console.debug('\n=== 尝试匹配规则 ===');
          console.debug('规则详情:', rule);
        }
        
        if (rule.type === 'RegExp') {
          const regex = rule.value;
          const result = regex.test(normalizedFilePath);
          return result;
        } 
        
        if (rule.type === 'string') {
          const normalizedRule = rule.value.replace(/\\/g, '/');
          const result = normalizedFilePath.includes(normalizedRule);
          return result;
        }
        
        console.warn('未支持的规则类型:', rule.type);
        return false;
      } catch (e) {
        console.error('规则匹配出错:', e);
        console.error('详细错误信息:', {
          规则: rule,
          路径: normalizedFilePath,
          错误: {
            名称: e.name,
            信息: e.message,
            堆栈: e.stack
          }
        });
        return false;
      }
    });
  }

  /**
   * 获取默认分组名称
   * @param {string} filePath 文件路径
   * @returns {string} 分组名称
   */
  getDefaultGroupName(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // 匹配 components 目录下的一级目录
    const componentsMatch = normalizedPath.match(/\/components\/([^\/]+)/);
    if (componentsMatch) {
      return `组件-${componentsMatch[1]}`;
    }
    
    // 匹配 pages 目录下的一级目录
    const pagesMatch = normalizedPath.match(/\/pages\/([^\/]+)/);
    if (pagesMatch) {
      return `页面-${pagesMatch[1]}`;
    }
    
    return '其他';
  }

  groupByConfiguredPaths(items) {
    const grouped = {
      '其他': [] // 默认分组
    };
    
    // 初始化配置中定义的所有分组
    if (this.options.errorConfig?.groups) {
      this.options.errorConfig.groups.forEach(group => {
        if (group.name) {
          grouped[group.name] = [];
        }
      });
    }

    items.forEach(item => {
      if (!item) return;

      const filePath = item.filePath || (item.module && item.module.resource) || '';
      if (!filePath) {
        grouped['其他'].push(item);
        return;
      }

      let matched = false;

      // 首先尝试匹配配置的分组规则
      if (this.options.errorConfig?.groups) {
        
        for (const group of this.options.errorConfig.groups) {
          if (!group.entryRules?.include) {
            continue;
          }

          // 确保规则是数组形式并进行规则验证
          const includeRules = Array.isArray(group.entryRules.include) 
            ? group.entryRules.include 
            : [group.entryRules.include];
          

          // 处理每个规则
          const isMatch = this.checkPathMatch(filePath, includeRules);

          if (isMatch) {
            // 检查是否需要跳过非入口文件
            if (group.ignoreSubEntry && item.module?.isSubEntry === false) {
              if (process.env.DEBUG) {
                console.debug('Skipping non-entry file:', filePath);
              }
              continue;
            }

            if (process.env.DEBUG) {
              console.debug('Adding to group:', group.name, filePath);
            }
            if (!grouped[group.name]) {
              grouped[group.name] = [];
            }
            grouped[group.name].push(item);
            matched = true;
            break;
          }
        }
      }

      // 如果没有匹配配置的规则，使用默认分组逻辑
      if (!matched) {
        const defaultGroupName = this.getDefaultGroupName(filePath);
        if (!grouped[defaultGroupName]) {
          grouped[defaultGroupName] = [];
        }
        grouped[defaultGroupName].push(item);
      }
    });

    // 移除空分组
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });

    return grouped;
  }

  // 根据错误信息和文件路径对错误进行分类
  categorizeError(error, filePath) {
    // 如果有filePath，优先使用filePath作为分组
    if (filePath) {
      return filePath;
    }

    // 如果没有filePath，从错误信息中尝试提取路径
    const moduleId = error.moduleIdentifier || (error.module && error.module.identifier());
    if (moduleId) {
      return moduleId;
    }

    // 如果还是没有找到路径，返回其他分类
    return '其他';
  }

  processError(error) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      name: error.name || 'WebpackError',
      severity: error.severity || 'error',
      timestamp: new Date().toISOString()
    };

    // 提取模块信息
    if (error.module) {
      errorInfo.module = {
        id: error.module.id,
        name: error.module.identifier(),
        resource: error.module.resource
      };
      errorInfo.filePath = error.module.resource || error.module.identifier();
    } else {
      // 如果没有 module 对象，尝试使用 moduleIdentifier
      errorInfo.filePath = error.moduleIdentifier || error.file || '未知文件';
    }

    // 解析位置信息
    const locationMatch = /\((\d+):(\d+)\)/.exec(error.message);
    if (locationMatch) {
      errorInfo.location = {
        line: parseInt(locationMatch[1]),
        column: parseInt(locationMatch[2])
      };
    }

    // 智能识别错误类型
    errorInfo.type = this.detectErrorType(error);
    
    // 设置错误分组，使用文件路径或模块标识符
    const moduleId = error.moduleIdentifier || (error.module && error.module.identifier());
    errorInfo.group = this.categorizeError(error, errorInfo.filePath || moduleId);

    return errorInfo;
  }

  // 智能识别错误类型
  detectErrorType(error) {
    const message = error.message.toLowerCase();
    const stack = error.stack || '';
    
    // MPX相关错误
    if (stack.includes('@mpxjs/webpack-plugin') || message.includes('@mpxjs')) {
      if (message.includes('[style compiler]') || message.includes('style')) {
        return 'mpx-style';
      }
      if (message.includes('[template compiler]') || message.includes('template')) {
        return 'mpx-template';
      }
      if (message.includes('[script compiler]') || message.includes('script')) {
        return 'mpx-script';
      }
      return 'mpx';
    }
    
    // 其他错误类型
    if (message.includes('module parse failed')) return 'syntax';
    if (message.includes('module not found')) return 'dependency';
    if (message.includes('validation')) return 'configuration';
    if (message.includes('typescript')) return 'typescript';
    if (message.includes('eslint')) return 'eslint';
    if (message.includes('cannot find module')) return 'import';
    if (message.includes('type error')) return 'type';
    if (message.includes('reference error')) return 'reference';
    if (message.includes('compilation')) return 'compilation';
    if (message.includes('runtime')) return 'runtime';
    
    return 'unknown';
  }

  filterByPath(items) {
    if (!this.options.compilePath || !this.options.compilePath.length) {
      return items; // 如果没有指定路径，返回所有错误
    }
    
    return items.filter(item => {
      const filePath = item.module?.resource || item.filePath;
      if (!filePath) return false;
      
      return this.options.compilePath.some(pattern => {
        // 支持通配符匹配
        const regexPattern = pattern
          .replace(/\*/g, '.*')
          .replace(/\\/g, '\\\\');
        const regex = new RegExp(regexPattern);
        return regex.test(filePath);
      });
    });
  }

  filterByType(items, options) {
    if (!items || !Array.isArray(items)) {
      return [];
    }

    let filteredItems = [...items];

    // 如果includes数组不为空，只保留指定类型的错误
    if (options.includes && options.includes.length > 0) {
      filteredItems = filteredItems.filter(item => 
        options.includes.includes(item.type)
      );
    }

    // 如果excludes数组不为空，排除指定类型的错误
    if (options.excludes && options.excludes.length > 0) {
      filteredItems = filteredItems.filter(item => 
        !options.excludes.includes(item.type)
      );
    }

    return filteredItems;
  }

  // 根据路径匹配错误分组
  matchErrorGroup(filePath) {
    if (!filePath || !this.errorGroups.length) {
      return null;
    }

    for (const group of this.errorGroups) {
      const { include } = group.entryRules || {};
      if (!include || !include.length) continue;

      const matches = include.some(rule => {
        if (rule instanceof RegExp) {
          const result = rule.test(filePath);
          // 使用 debug 级别的日志，避免被捕获为错误
          if (process.env.DEBUG) {
            console.debug(`正则匹配结果 - 规则: ${rule}, 路径: ${filePath}, 结果: ${result}`);
          }
          return result;
        }
        // 对于字符串规则，使用简单的包含匹配
        const result = typeof rule === 'string' && filePath.includes(rule);
        // console.log(`字符串匹配结果 - 规则: ${rule}, 路径: ${filePath}, 结果: ${result}`);
        return result;
      });
      if (matches) {
        console.log(group, '-------matches-------')
        return group;
      }
    }

    return null;
  }

  // 从错误消息中提取文件路径
  extractFilePath(error) {
    if (!error) return null;

    let filePath = null;

    // 尝试从 module 对象中获取路径
    if (error.module?.resource) {
      filePath = error.module.resource;
    }

    // 如果没有从 module 中找到，尝试从消息中提取
    if (!filePath && error.message) {
      const patterns = [
        /(?:\/|\\)src(?:\/|\\)([^:'")\n]+)/,
        /"([^"]+)"/,
        /'([^']+)'/,
        /at\s+(.+?)\s+\(/
      ];

      for (const pattern of patterns) {
        const match = error.message.match(pattern);
        if (match && match[1]) {
          filePath = match[1];
          break;
        }
      }
    }

    return filePath;
  }
}

module.exports = WebpackErrorCollector;
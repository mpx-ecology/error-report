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
        blocking: ['syntaxError', 'moduleNotFound'],
        blockingMessage: '[error report] 存在强阻断错误，编译已停止'
      },
      autoStartServer: false,
      // compilePath: [],
      errorConfig: {}, // 新增错误配置文件路径
      ...options
    };
    
    // 初始化错误分组配置
    this.errorGroups = [];
    if (process.env.DEBUG) {
      console.debug('\n=== 初始化错误分组配置 ===');
      console.debug('options:', {
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

    // this.errors = [];
    // this.warnings = [];
    this.server = null;
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

    // 使用一个标志位来追踪编译状态
    let isCompiling = false;
    
    compiler.hooks.done.tap('WebpackErrorCollector', async (stats) => {
      // 如果正在处理中，则跳过
      if (isCompiling) {
        return;
      }
      this.error = {
        '样式错误': 0,
        '模板错误': 0,
        '语法错误': 0,
        'JSON配置错误': 0,
        '资源加载错误': 0,
        'mpx编译错误': 0,
        'eslint错误': 0,
        'TS类型错误': 0,
        '缺少loader': 0,
        '未知错误': 0,
        number: 0
      }
      this.warning = {
        '样式错误': 0,
        '模板错误': 0,
        '语法错误': 0,
        'JSON配置错误': 0,
        '资源加载错误': 0,
        'mpx编译错误': 0,
        'eslint错误': 0,
        'TS类型错误': 0,
        '缺少loader': 0,
        '未知错误': 0,
        number: 0
      };
      
      isCompiling = true;
      try {
        const { errors, warnings } = stats.toJson();
        let processedErrors = errors.map(err => this.processError(err, this.error));
        let processedWarnings = warnings.map(warn => this.processError(warn, this.warning));
        if (!this.server && processedErrors.length === 0 && processedWarnings.length === 0) {
          console.log('没有错误或警告信息');
          return 
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
        if (blockingErrors.length > 0 && process.env.NODE_ENV === 'production') {
          console.error(`\n\x1b[31m${this.options.errors.blockingMessage}\x1b[0m`);
          blockingErrors.forEach(err => {
            console.error(`[${err.typeDesc}] ${err.filePath || '未知文件'}: ${err.message}`);
          });
          process.exit(1);
          return
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
    compiler.hooks.done.tap('DonePlugin', (stats) => {
      console.log('编译完成！');
      // 这里可以执行你想要的回调操作
    });
  }

  errorNumberPrint() {
    if (this.error.number > 0) {
      console.log(`\n\x1b[31m请注意一共有${this.error.number}条编译报错：\x1b[0m`);
      Object.keys(this.error).forEach(key => {
        if (key !== 'number' && this.error[key] > 0) {
          console.log(`\x1b[31m${key}：${this.error[key]}个\x1b[0m`);
        }
      })
    }
    if (this.warning.number > 0) {
      console.log(`\n\x1b[33m请注意一共有${this.warning.number}条编译警告：\x1b[0m`);
      Object.keys(this.warning).forEach(key => {
        if (key !== 'number' && this.warning[key] > 0) {
          console.log(`\x1b[33m${key}：${this.warning[key]}个\x1b[0m`);
        }
      })
    }
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
              this.errorNumberPrint();
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
        this.errorNumberPrint()
        // 如果服务器已经存在，只更新报告
        await this.server.updateReport(reportPath);
      }
    } catch (error) {
      console.error('启动错误报告服务失败:', error);
      throw error;
    }
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
      console.log('无效的参数:', { filePath, includeRules });
      return false;
    }
    
    // 标准化文件路径，确保使用正斜杠
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    
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

    // console.log('处理后的规则:', processedRules);

    return processedRules.some(rule => {
      try {
        
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
            // if (group.ignoreSubEntry && item.module?.isSubEntry === false) {
            //   if (process.env.DEBUG) {
            //     console.debug('Skipping non-entry file:', filePath);
            //   }
            //   continue;
            // }

            // if (process.env.DEBUG) {
            //   console.debug('Adding to group:', group.name, filePath);
            // }
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

  processError(error, processObj) {

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
    errorInfo.type = this.detectErrorType(error, processObj);
    
    return errorInfo;
  }

  // 智能识别错误类型
  detectErrorType(error, processObj) {
    const message = error.message.toLowerCase();
    processObj.number += 1;
    // 其他错误类型
    if (message.includes('Unable to find uri in') ||
        message.includes('[style compiler]') ||
        message.includes('elif without a preceding if') ||
        message.includes('rules are not allowed here and will not be processed') ||
        /(?:Module\s+(?:build\s+failed|Error)\s+\(from\s+.*?\b(?:stylus|sass|less|css)-loader\b.*?\):|Line\s+\d+:\s+[^]+?\.(?:styl|sass|scss|less|css).*?(?:error|warning))/i.test(error.message)) {
      processObj['样式错误'] += 1
      return 'styleError'
    }
    if (message.includes('[template compiler]') ||
        message.includes('[Mpx dynamic expression parser error]') ||
        message.includes('grammar is not supported in the template') ||
        message.includes('only support one expression in the template') ||
        message.includes('[optionChain] option')) {
      processObj['模板错误'] += 1
      return 'templateError'
    }
    if (message.includes('you may need an appropriate loader')) {
      processObj['缺少loader'] += 1
      return 'LackOfLoader'
    }
    if (message.includes('Expected opening parenthesis after function') ||
        message.includes('Expected closing parenthesis') ||
        message.includes('[script compiler]') ||
        /(?:Module\s+parse\s+failed|Module\s+build\s+failed|SyntaxError|Unexpected\s+token|Missing\s*[\]\}\)]|Unterminated\s+(?:string|regex)|(?:Expression|Statement)\s+expected|invalid\s+expression|HookWebpackError|ParseError|(?:\d+\|.*){3})/i.test(error.message)) {
      processObj['语法错误'] += 1
      return 'syntaxError'
    }
    if (message.includes('[json compiler]') ||
        message.includes('[json processor]')) {
      processObj['JSON配置错误'] += 1
      return 'jsonError'
    }
    if (message.includes('is not a page/component/static resource') ||
        message.includes('is not in current pages directory') ||
        /(?:Module\s+not\s+found|Can't\s+resolve|was\s+not\s+found)/i.test(error.message)) {
      processObj['资源加载错误'] += 1
      return 'moduleNotFound'
    }
    if (message.includes('[@mpxjs/webpack-plugin script-setup-compiler]') ||
        message.includes('Function arguments must be numbers') ||
        message.includes('Unknown function:') ||
        message.includes('Unknown operator:') ||
        message.includes('[plugin loader][') ||
        message.includes('loader options must be string or object') ||
        message.includes('] is registered with a conflict outputPath [') ||
        message.includes('[mpx-loader]') || message.includes('[native-loader][') ||
        message.includes('通过分包异步声明') ||
        message.includes('Get extracted file error: missing filename!') ||
        message.includes('会分别输出到两个分包中') ||
        message.includes('加入到subpackageModulesRules来解决这个问题！') ||
        message.includes('need to declare subpackage name by root') ||
        message.includes('] is filled with same index [') ||
        /registered\s+with\s+(conflicted\s+)?outputPath/i.test(error.message)) {
          processObj['mpx编译错误'] += 1
          return 'mpxCompileError'
        }
    if (/(?:ESLintError:)?\s*\[eslint\][\s\S]*/i.test(error.message)) {
      processObj['eslint错误'] += 1
      return 'eslintError'
    };
    if (/\bTS\d{4,5}\b/.test(error.message)) {
      processObj['TS类型错误'] += 1
      return 'TSError'
    };
    processObj['未知错误'] += 1
    return 'unknown';
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
}

module.exports = WebpackErrorCollector;
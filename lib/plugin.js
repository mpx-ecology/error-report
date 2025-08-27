const fs = require('fs');
const path = require('path');
const ErrorReportServer = require('./server');
const HtmlGenerator = require('./html-generator');
const { default: open } = require('open');
let errorId = 0
let warnId = 0
class WebpackErrorCollector {
  constructor(options = {}) {
    this.options = {
      outputPath: 'dist/errorLog',
      warnings: { 
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
      errorConfig: {},
      ...options
    };
    
    // 初始化错误分组配置
    this.errorGroups = [];
    if (this.options.errorConfig) {
      try {
        this.errorGroups = this.options.errorConfig.groups || [];
      } catch (error) {
        console.error('加载错误配置文件失败:', error);
      }
    } else {
      console.warn('未找到 errorConfig 配置');
    }

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
    let isCompiling = false;
    
    compiler.hooks.done.tap('WebpackErrorCollector', async (stats) => {
      if (isCompiling) {
        return;
      }
      this.error = {
        '样式错误': 0,
        '模板错误': 0,
        '语法错误': 0,
        '环境错误': 0,
        '解析错误': 0,
        'JSON配置错误': 0,
        '配置错误': 0,
        '构建错误': 0,
        '资源加载错误': 0,
        '编译错误': 0,
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
        '环境错误': 0,
        '解析错误': 0,
        'JSON配置错误': 0,
        '配置错误': 0,
        '构建错误': 0,
        '资源加载错误': 0,
        '编译错误': 0,
        'eslint错误': 0,
        'TS类型错误': 0,
        '缺少loader': 0,
        '未知错误': 0,
        number: 0
      };
      
      isCompiling = true;
      try {
        const { errors, warnings } = stats.toJson();
        let processedErrors = errors.map(err => this.processError(err, this.error, 'error'));
        let processedWarnings = warnings.map(warn => this.processError(warn, this.warning, 'warning'));
        if (!this.server && processedErrors.length === 0 && processedWarnings.length === 0) {
          return 
        }

        // 按错误类型过滤
        processedErrors = this.filterByType(processedErrors, this.options.errors);
        processedWarnings = this.filterByType(processedWarnings, this.options.warnings);

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
        const blockingErrors = processedErrors.filter(err => {
          const blocking = this.options.errors.blocking === undefined ? ['syntaxError', 'moduleNotFound'] : this.options.errors.blocking;
          return blocking.includes(err.type)
        }
          
        );
        if (blockingErrors.length > 0 && process.env.NODE_ENV === 'production') {
          console.error(`\n\x1b[31m${this.options.errors.blockingMessage || '[error report] 存在强阻断错误，编译已停止'}\x1b[0m`);
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
        isCompiling = false;
      }
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

  async handleServerStart(reportPath) {
    try {
      const outputDir = path.resolve(process.cwd(), this.options.outputPath);
      this.ensureDirectory(outputDir);

      const htmlGenerator = new HtmlGenerator(this.options.outputPath);
      await htmlGenerator.generateReportHtml();

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!this.server) {
        // 创建新的服务器实例
        this.server = new ErrorReportServer(reportPath, {
          outputDir: outputDir
        });

        try {
          const serverInfo = await this.server.start();
          
          if (serverInfo?.port) {
            setTimeout(async () => {
              const url = `http://localhost:${serverInfo.port}`;
              console.log(`\n正在打开错误报告页面: ${url}`);
              this.errorNumberPrint();
              try {
                await open(url, {
                  app: {
                    name: ['google chrome', 'chrome']
                  }
                });
              } catch (err) {
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
          this.server = null;
          throw error;
        }
      } else {
        this.errorNumberPrint()
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

  cleanWebpackPath(rawPath) {
    if (!rawPath) return
    // 示例: "C:/project/node_modules/css-loader!./src/style.css"
    // 1. 分割 loader 链，取最后一个有效部分
    const parts = rawPath.split('!');
    const lastPart = parts[parts.length - 1];

    // 2. 移除查询参数 (如 ?foo=bar)
    const [filePath] = lastPart.split('?');

    // 3. 可选：转换为相对路径（按需调整）
    // return path.relative(process.cwd(), filePath);
    
    return filePath;
  }
  
  extractErrorFilePath(errorMessage) {
    // 匹配 "resolved from" 后面的文件路径
    const regex = /resolved from (.+?)!/;
    const match = errorMessage.match(regex);
    
    if (match && match[1]) {
      // 返回匹配到的文件路径（已去除可能的标点符号）
      return match[1].replace(/[^\w\/.-]+$/, '');
    }
    
    return '未知文件';
  }

  parseCssError(errorMsg) {
    const regex = /Value\s+of\s+(\S+)\s+in\s+(\S+)[\s\S]*?received\s+\[([^\]]+)\]/i;
    const match = errorMsg.match(regex);
    
    if (match) {
      return {
        property: match[1],   // 属性名
        selector: match[2],   // 选择器
        receivedValue: match[3] // 接收到的值
      };
    }
    return null;
  }

  extractEnvErrorInfo(errorMsg) {
    const regex = /Property\s+\[([^\]]+)\]\s+on\s+([^\s]+)\s+is\s+not\s+supported\s+in\s+([a-zA-Z0-9_-]+)\s+environment!/;
    const match = errorMsg.match(regex);
    
    if (match) {
      return {
        property: match[1],   // CSS属性
        selector: match[2],   // 选择器
        environment: match[3] // 环境名
      };
    }
    return null;
  }

  processError(error, processObj, errorType) {

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
      errorInfo.filePath = this.cleanWebpackPath(error.moduleIdentifier) || this.cleanWebpackPath(error.file) || this.extractErrorFilePath(error.message);
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
    const { type, typeDesc } = this.detectErrorType(error, processObj);
    errorInfo.id = errorType === 'error' ? errorId++ : warnId++;
    errorInfo.type = type;
    errorInfo.typeDesc = typeDesc;
    if (errorInfo.type === 'styleError') {
      if (error.message.includes('Only single class selector is supported in react native mode temporarily')) {
        errorInfo.hint = 'react native模式暂时只支持单个类选择器';
      } else {
        const messageHint = this.parseCssError(error.message);
        const envErrorInfo = this.extractEnvErrorInfo(error.message);
        if (messageHint) {
          const { property, selector, receivedValue } = messageHint
          errorInfo.hint = `属性 "${property}" 在选择器 "${selector}" 中的值 "${receivedValue}" 是无效的。`;
          switch (property) {
            case 'color':
              errorInfo.document = 'https://mpxjs.cn/guide/platform/rn.html#%E8%89%B2%E5%80%BC-color-%E7%B1%BB%E5%9E%8B%E6%94%AF%E6%8C%81%E7%9A%84%E5%80%BC%E6%A0%BC%E5%BC%8F%E8%AF%B4%E6%98%8E'
              break;
            case 'font-size':
              errorInfo.document = 'https://mpxjs.cn/guide/platform/rn.html#%E7%89%B9%E6%AE%8A%E7%9A%84%E7%99%BE%E5%88%86%E6%AF%94%E8%AE%A1%E7%AE%97%E8%A7%84%E5%88%99'
              break;
            case 'line-height':
              errorInfo.document = 'https://mpxjs.cn/guide/platform/rn.html#line-height'
              break;
            case 'height':
              errorInfo.document = 'https://mpxjs.cn/guide/platform/rn.html#%E6%95%B0%E5%80%BC%E7%B1%BB%E5%9E%8B%E5%8D%95%E4%BD%8D%E8%AF%B4%E6%98%8E'
              break;
          }
        }
        if (envErrorInfo) {
          const { property, selector, environment } = envErrorInfo
          errorInfo.hint = `选择器 "${selector}"中的 "${property}" 属性不支持在 "${environment}" 环境中使用。`;
        }
      }
    }
    
    return errorInfo;
  }

  // 智能识别错误类型
  detectErrorType(error, processObj) {
    const message = error.message.toLowerCase();
    processObj.number += 1;
    // 其他错误类型
    if (message.includes('[mpx style error]') || /(?:Module\s+(?:build\s+failed|Error)\s+\(from\s+.*?\b(?:stylus|sass|less|css)-loader\b.*?\):|Line\s+\d+:\s+[^]+?\.(?:styl|sass|scss|less|css).*?(?:error|warning))/i.test(error.message)) {
      processObj['样式错误'] += 1
      return { type: 'styleError' }
    }
    if (message.includes('[mpx template error]')) {
      processObj['模板错误'] += 1
      return { type: 'templateError', typeDesc: '请检查当前文件的template中是否存在编写错误' }
    }
    if (message.includes('[mpx script error]')) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '请检查当前文件的script中是否存在语法错误' }
    }
    if (message.includes('[mpx json error]')) {
      processObj['JSON配置错误'] += 1
      return { type: 'jsonError', typeDesc: '请检查当前文件的json配置是否正确' }
    }

    if (/plugin.*initialization.*failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '插件初始化失败, 请检查插件构造函数参数、验证插件依赖是否正确安装、确认插件版本与webpack兼容' }
    }

    if (/configuration.*error/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置文件错误, 请检查webpack.config.js语法、验证配置对象结构、确认所有必需的配置项' }
    }

    if (/invalid.*configuration/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '无效的配置, 请参考webpack官方文档修正配置、检查配置项的数据类型、移除废弃的配置选项' }
    }

    if (/webpack.*options.*invalid/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: 'webpack选项无效, 请检查webpack版本与配置兼容性、验证选项值的格式、查看webpack升级指南' }
    }

    if (/schema.*validation.*failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置schema验证失败, 请检查配置项的类型和格式、移除不支持的配置属性、参考webpack schema文档' }
    }

    if (/option.*.*has.*an.*unknown.*property/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置包含未知属性, 请移除或修正未知的配置属性、检查属性名拼写、确认webpack版本支持该属性' }
    }

    if (/compilation.*preparation.*failed/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '编译准备失败, 请检查内存使用情况、清理node_modules重新安装、重启webpack进程' }
    }

    if (/resolver.*factory.*error/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '解析器工厂错误, 请检查resolve配置、验证文件系统权限、确认路径解析配置正确' }
    }

    if (/file.*system.*initialization.*error/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '文件系统初始化错误, 请检查文件系统权限、确认路径存在且可访问、检查磁盘空间' }
    }

    if (/context.*path.*invalid/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '上下文路径无效, 请检查context配置路径、确认路径为绝对路径、验证目录存在' }
    }

    if (/entry.*point.*not.*found/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口文件未找到, 请检查entry配置的文件路径、确认入口文件存在、验证文件扩展名' }
    }

    if (/Cannot resolve entry/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '无法解析入口文件, 请检查入口文件路径是否正确、确认文件存在且可读、检查文件权限设置' }
    }

    if (/module.*factory.*creation.*failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '模块工厂创建失败, 请检查module.rules配置、验证loader配置、确认模块类型定义' }
    }

    if (/normal.*module.*factory.*error/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '普通模块工厂错误, 请检查标准模块处理配置、验证loader链配置、确认模块解析规则' }
    }

    if (/Module not found.*Error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块未找到, 请检查模块导入路径、确认npm包已安装、验证模块名称拼写' }
    }

    if (/Can't resolve/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '无法解析模块, 请检查模块路径是否正确、确认相对路径和绝对路径、验证alias配置' }
    }

    if (/module.*build.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块构建失败, 请检查模块代码语法、验证loader配置、确认依赖版本兼容性' }
    }

    if (/loader.*.*error/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: 'Loader处理错误, 请检查loader配置参数、验证loader版本兼容性、确认文件类型匹配' }
    }

    if (/syntax.*error.*in.*module/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '模块语法错误, 请检查代码语法错误、验证ES6/TypeScript配置、确认babel配置正确' }
    }

    if (/You may need an appropriate loader/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '需要合适的loader, 请为文件类型配置相应的loader、检查module.rules配置、安装所需的loader包' }
    }

    if (/circular.*dependency.*detected/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '依赖分析错误, 请检查模块导入导出语法、验证依赖关系结构、确认模块加载顺序' }
    }

    if (/chunk.*creation.*failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: 'chunk创建失败, 请检查entry配置、验证代码分割配置、确认chunk命名规则' }
    }

    if (/chunk.*graph.*build.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: 'chunk图构建失败, 请检查模块依赖关系、验证分包策略、确认异步加载配置' }
    }

    if (/optimization.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '优化过程失败, 请检查optimization配置、验证压缩工具配置、确认优化插件设置' }
    }

    if (/minification.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '代码压缩失败, 请检查Terser配置、验证代码语法正确性、确认压缩工具版本' }
    }

    if (/tree.*shaking.*error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: 'Tree Shaking错误, 请确认模块使用ES6导入导出、检查sideEffects配置、验证模块标记' }
    }

    if (/code.*generation.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '代码生成失败, 请检查代码生成器配置、验证模板设置、确认运行时配置' }
    }

    if (/hash.*generation.*error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '哈希生成错误, 请检查hash算法配置、验证内容hash设置、确认文件内容稳定性' }
    }

    if (/source.*map.*generation.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: 'Source Map生成失败, 请检查devtool配置、验证source map设置、确认文件路径正确' }
    }

    if (/asset.*processing.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '资源处理失败, 请检查资源处理插件、验证资源文件格式、确认处理流程配置' }
    }

    if (/asset.*size.*limit.*exceeded/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '资源大小超限, 请优化资源文件大小、调整性能预算配置、启用资源压缩' }
    }

    if (/emit.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '文件输出失败, 请检查输出目录权限、确认磁盘空间充足、验证输出路径配置' }
    }

    if (/file.*write.*error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '文件写入错误, 请检查文件系统权限、确认目录存在、验证文件名合法性' }
    }

    if (/permission.*denied.*writing.*file/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '文件写入权限被拒绝, 请修改文件夹权限、以管理员身份运行、检查文件占用情况' }
    }

    if (/ENOSPC.*no.*space.*left|disk.*full/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '磁盘空间不足, 请清理磁盘空间、删除不必要的文件、更换输出目录' }
    }

    if (/compilation.*completed.*with.*errors/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '编译完成但包含错误, 请查看详细错误日志、逐个解决编译错误、检查整体配置' }
    }

    if (/build.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '构建失败, 请检查所有错误信息、验证配置文件、重新安装依赖' }
    }

    if (/watch.*compilation.*failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '监听模式编译失败, 请重启watch模式、检查文件监听配置、验证文件系统支持' }
    }

    if (/file.*watcher.*error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '文件监听器错误, 请检查文件系统事件支持、验证监听路径权限、调整监听器配置' }
    }

    if (/cache.*error/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '缓存系统错误, 请清理webpack缓存、检查缓存目录权限、验证缓存配置' }
    }

    if (/cache.*corruption/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '缓存数据损坏, 请删除缓存目录重建、禁用缓存重新构建、检查磁盘健康状态' }
    }
   
    if (/(?:ESLintError:)?\s*\[eslint\][\s\S]*/i.test(error.message)) {
      processObj['eslint错误'] += 1
      return { type: 'eslintError' }
    };
    if (/\bTS\d{4,5}\b/.test(error.message)) {
      processObj['TS类型错误'] += 1
      return { type: 'TSError' }
    };

    processObj['未知错误'] += 1
    return { type: 'unknown' };
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
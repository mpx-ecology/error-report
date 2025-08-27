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

    if (/Invalid configuration object\./i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置对象无效：webpack 配置文件格式不正确, 请检查 webpack配置文件 或者 mpx.config.js 的语法和结构' }
    }

    if (/WebpackOptionsValidationError/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置选项验证错误：配置参数不符合 webpack 规范, 请查看 webpack 文档，修正配置参数' }
    }

    if (/configuration has an unknown property/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置包含未知属性：使用了不存在的配置选项, 请移除或修正未知的配置属性' }
    }

    if (/Invalid value for configuration/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '配置值无效：配置参数的值类型或格式错误, 请检查配置值的类型和格式是否正确' }
    }

    if (/configuration\.entry should be/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口配置错误：entry 配置格式不正确, 请修正 entry 配置的格式和类型' }
    }

    if (/Plugin could not be registered/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '插件注册失败：插件无法正确注册到 webpack, 请检查插件的安装和配置' }
    }

    if (/Invalid plugin configuration/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '插件配置无效：插件的配置参数不正确, 请查看插件文档，修正配置参数' }
    }

    if (/Plugin is not a constructor/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '插件不是构造函数：插件导入方式错误, 请检查插件的导入语法，确保正确使用 new 关键字' }
    }

    if (/Cannot read property .* of undefined/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '读取未定义属性：插件访问了不存在的属性, 请检查插件配置和依赖关系' }
    }

    if (/Node\.js version not supported/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: 'Node.js 版本不支持：当前 Node.js 版本过低, 请升级 Node.js 到支持的版本' }
    }

    if (/Environment setup failed/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '环境设置失败：编译环境初始化出错, 请检查系统环境和依赖安装' }
    }

    if (/Compilation failed to start/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '编译启动失败：编译过程无法正常开始, 请检查内存和系统资源是否充足' }
    }

    if (/Cannot create compilation/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '无法创建编译实例：编译对象创建失败, 请重启 webpack 进程，清理缓存' }
    }

    if (/ModuleFactory initialization failed/i.test(error.message)) {
      processObj['环境错误'] += 1
      return { type: 'environmentError', typeDesc: '模块工厂初始化失败：模块创建器无法初始化, 请检查 webpack 版本兼容性' }
    }

    if (/Resolver setup failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '解析器设置失败：模块解析器配置错误, 请检查 resolve 配置项' }
    }

    if (/NormalModuleFactory creation failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '普通模块工厂创建失败：标准模块处理器创建出错, 请检查模块相关配置' }
    }

    if (/ContextModuleFactory creation failed/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '上下文模块工厂创建失败：动态模块处理器创建出错, 请检查动态导入相关配置' }
    }

    if (/Entry module not found/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口模块未找到：配置的入口文件不存在, 请检查 entry 配置的文件路径是否正确' }
    }

    if (/Cannot resolve entry/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '无法解析入口：入口文件路径解析失败, 请确认入口文件存在且路径正确' }
    }

    if (/Entry point does not exist/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口点不存在：指定的入口文件找不到, 请创建入口文件或修正路径配置' }
    }

    if (/Multiple entry chunks with same name/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '多个入口块使用相同名称：入口名称冲突, 请为不同的入口配置不同的名称' }
    }

    if (/Entry path is not a string/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口路径不是字符串：entry 配置类型错误, 请确保 entry 配置为字符串或数组格式' }
    }

    if (/Invalid entry configuration/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口配置无效：entry 配置格式不正确, 请参考文档修正 entry 配置格式' }
    }

    if (/Entry must be a string or array/i.test(error.message)) {
      processObj['配置错误'] += 1
      return { type: 'configError', typeDesc: '入口必须是字符串或数组：entry 类型限制, 请将 entry 配置改为字符串或数组格式' }
    }

    if (/Module build failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块构建失败：单个模块编译过程出错, 请检查模块代码语法和依赖' }
    }

    if (/Module not found/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块未找到：导入的模块文件不存在, 请检查模块路径和文件是否存在' }
    }

    if (/Module parse failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块解析失败：无法解析模块内容, 请检查文件格式和语法是否正确' }
    }

    if (/Failed to compile module/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '模块编译失败：模块转换过程出错, 请检查 loader 配置和模块语法' }
    }

    if (/Loader not found/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '加载器未找到：指定的 loader 不存在, 请安装所需的 loader 包' }
    }

    if (/You may need an appropriate loader to handle this file type/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '需要合适的加载器：文件类型缺少对应的 loader, 请为该文件类型配置相应的 loader' }
    }

    if (/Loader execution failed/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '加载器执行失败：loader 运行过程中出错, 请检查 loader 配置和版本兼容性' }
    }

    if (/Invalid loader configuration/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '加载器配置无效：loader 配置参数错误, 请参考 loader 文档修正配置' }
    }

    if (/Loader returned invalid result/i.test(error.message)) {
      processObj['构建错误'] += 1
      return { type: 'buildError', typeDesc: '加载器返回无效结果：loader 输出格式错误, 请检查 loader 版本和配置' }
    }

    if (/SyntaxError: Unexpected token/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '加载器返回无效结果：loader 输出格式错误, 请检查 loader 版本和配置' }
    }

    if (/Parse error/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '解析错误：代码无法被正确解析, 请检查代码格式和语法规范' }
    }

    if (/Invalid or unexpected token/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '无效或意外的标记：代码包含不合法字符, 请检查字符编码和特殊字符' }
    }

    if (/Unterminated string constant/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '未终止的字符串常量：字符串缺少结束引号, 请检查字符串的引号配对' }
    }

    if (/Unexpected end of input/i.test(error.message)) {
      processObj['语法错误'] += 1
      return { type: 'syntaxError', typeDesc: '意外的输入结束：代码结构不完整, 请检查代码块的括号和语句完整性' }
    }

    if (/Module not found: Error: Can't resolve/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '模块未找到：无法解析指定的模块路径, 请检查模块路径和文件是否存在' }
    }

    if (/Cannot resolve module/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '无法解析模块：模块路径解析失败, 请检查模块路径和 resolve 配置' }
    }

    if (/Failed to resolve/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '解析失败：依赖解析过程出错, 请检查文件路径和扩展名配置' }
    }

    if (/Module resolution failed/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '模块解析失败：找不到指定的依赖模块, 请检确认依赖已安装且路径正确' }
    }

    if (/Package not found/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '模块解析失败：找不到指定的依赖模块, 请检确认依赖已安装且路径正确' }
    }

    if (/Dependency not found/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '依赖未找到：项目依赖缺失, 请安装缺失的依赖包' }
    }

    if (/Circular dependency detected/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '检测到循环依赖：模块间存在循环引用, 请重构代码消除循环依赖' }
    }

    if (/Self dependency is not allowed/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '不允许自依赖：模块不能依赖自身, 请移除模块的自引用' }
    }

    if (/Invalid dependency/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '无效依赖：依赖声明格式错误, 请检查 import/require 语句格式' }
    }

    if (/Dependency cycle detected/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '检测到依赖循环：依赖关系形成环路, 请分析依赖关系，打破循环引用' }
    }

    if (/Alias resolution failed/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '别名解析失败：配置的路径别名无法解析, 请检查 resolve.alias 配置是否正确' }
    }

    if (/Cannot resolve alias/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '无法解析别名：别名指向的路径不存在, 请确认别名路径的准确性' }
    }

    if (/Invalid alias configuration/i.test(error.message)) {
      processObj['解析错误'] += 1
      return { type: 'resolutionError', typeDesc: '别名配置无效：alias 配置格式错误, 请修正 resolve.alias 的配置格式' }
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
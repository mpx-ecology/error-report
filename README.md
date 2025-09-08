# Error Report

webpack编译错误可视化工具，帮助开发者更好地管理和分析构建过程中的错误和警告信息。

## 特性

- 📊 可视化展示 - 直观展示Webpack编译过程中的错误和警告，支持SPA单页应用界面
- 🔍 智能分类 - 自动识别并分类14种错误类型（样式、模板、语法、环境、解析、JSON配置等）
- 📝 自定义分组 - 支持灵活的错误分组配置，基于路径规则进行分组管理
- 🚫 编译阻断 - 可配置特定错误阻断编译流程，支持生产环境强制阻断
- 🌐 实时预览 - 自动启动本地服务，实时查看错误报告，支持WebSocket实时更新
- 🎯 精准过滤 - 支持按类型、路径进行错误过滤，支持正则表达式和字符串匹配
- 🚀 自动服务器 - 内置HTTP服务器和静态文件服务，自动查找可用端口

## 安装

```bash
npm install @mpxjs/error-report --save-dev
# 或者
yarn add @mpxjs/error-report --dev
```

## 核心架构

Error Report 由以下核心模块组成：

### 主要文件结构

```
lib/
├── plugin.js          # Webpack插件主文件，负责错误收集和处理
├── server.js           # HTTP服务器，提供错误报告的Web界面
├── html-generator.js   # HTML报告生成器，生成SPA应用文件
└── templates/          # 前端模板文件
    ├── index.html      # 主页面模板
    ├── main-new.js     # SPA主逻辑和路由
    ├── error-detail.js # 错误详情组件
    ├── file-detail.js  # 文件详情组件
    └── styles.css      # 样式文件
```

### 工作原理

1. **错误收集**: plugin.js 监听webpack编译过程，收集errors和warnings
2. **智能分类**: 自动识别14种错误类型，进行统计和分组
3. **报告生成**: html-generator.js 生成SPA应用的静态文件
4. **服务启动**: server.js 启动HTTP服务器，提供Web界面查看
5. **实时更新**: 通过WebSocket实现错误报告的实时更新

## 快速开始

### 基础配置

```javascript
// webpack.config.js
const ErrorReport = require('error-report');

module.exports = {
  plugins: [
    new ErrorReport({
      outputPath: 'dist/errorLog',
      autoStartServer: true
    })
  ]
}
```

### 完整配置示例

```javascript
new ErrorReport({
  // 输出目录配置
  outputPath: 'dist/errorLog',
  
  // 服务器配置
  autoStartServer: true,
  
  // 路径监控配置
  compilePath: [
    'src/components',
    'src/pages'
  ],
  
  // 错误处理配置
  errors: {
    includes: ['typescript', 'eslint'],
    excludes: ['warning'],
    blocking: ['syntax'],
    blockingMessage: '存在语法错误，编译已终止'
  },
  
  // 错误分组配置
  errorConfig: {
    groups: [
      {
        name: '业务模块A',
        patterns: [
          '/components/moduleA/.*',
          '/pages/moduleA/.*'
        ],
        entryRules: {
          include: [
            '/src/moduleA',          // 绝对路径
            /^\/src\/components\/a/, // 正则匹配
            'pages/a',
            /node_modules\/@test\/mp-test/ // 相对路径
          ],
          exclude: [
            '/test/',
            /.*\.spec\.ts$/
          ]
        },
        ignoreSubEntry: true
      }
    ]
  }
})
```

## 配置项说明

### 核心配置

| 配置项 | 类型 | 默认值 | 描述 |
|-------|------|--------|------|
| outputPath | string | 'dist/errorLog' | 错误日志输出目录 |
| autoStartServer | boolean | false | 是否自动启动错误报告服务 |
| compilePath | string[] | [] | 需要监控的文件路径列表 |

### 错误处理配置

| 配置项 | 类型 | 默认值 | 描述 |
|-------|------|--------|------|
| errors.includes | string[] | [] | 需要处理的错误类型（使用错误标识） |
| errors.excludes | string[] | [] | 需要排除的错误类型（使用错误标识） |
| errors.blocking | string[] | [] | 触发编译阻断的错误类型（使用错误标识） |
| errors.blockingMessage | string | '存在强阻断错误' | 编译阻断提示信息 |

**错误类型配置示例：**
```javascript
errors: {
  includes: ['syntaxError', 'TSError', 'eslintError'],        // 只处理语法错误、TS类型错误和ESLint错误
  excludes: ['styleError', 'unknown'],                        // 排除样式错误和未知错误
  blocking: ['syntaxError', 'buildError'],                    // 语法错误和构建错误会阻断构建
  blockingMessage: '存在严重错误，构建已停止'
}

### 支持的错误类型

Error Report 能够自动识别和分类以下10种错误类型：

| 错误标识 | 错误类型 | 描述 | 触发条件 |
|----------|---------|------|----------|
| `styleError` | 样式错误 | CSS/SCSS/LESS相关错误 | 包含`[mpx style error]`或stylus/sass/less/css-loader构建失败 |
| `templateError` | 模板错误 | 模板语法和结构错误 | 包含`[mpx template error]`错误信息 |
| `syntaxError` | 语法错误 | JavaScript/TypeScript语法错误 | 包含`[mpx script error]`或模块语法错误 |
| `jsonError` | JSON配置错误 | JSON文件格式错误 | 包含`[mpx json error]`或JSON语法错误 |
| `configError` | 配置错误 | Webpack和工具配置错误 | 插件初始化失败、配置验证失败、loader配置错误、schema验证失败 |
| `environmentError` | 环境错误 | 环境配置和依赖问题 | 编译准备失败、文件系统错误、磁盘空间不足、权限问题 |
| `buildError` | 构建错误 | 构建过程中的错误 | 模块未找到、无法解析模块、构建失败、优化失败、缓存错误 |
| `eslintError` | ESLint错误 | 代码规范和质量问题 | 包含`ESLintError`或`[eslint]`标识的错误 |
| `TSError` | TS类型错误 | TypeScript类型相关错误 | 包含`TS`错误代码（如TS2304、TS2345等） |
| `unknown` | 未知错误 | 无法分类的其他错误 | 不匹配以上任何错误模式的其他错误 |

### 阻断错误配置

默认阻断错误类型：
- `syntaxError`: 语法错误
- `moduleNotFound`: 模块未找到

可通过 `errors.blocking` 配置自定义阻断规则。

### errorConfig 分组规则

分组配置支持以下规则：

1. 路径匹配规则(patterns)
- 支持字符串完全匹配
- 支持正则表达式匹配
- 支持相对路径和绝对路径

2. 入口规则(entryRules)
```javascript
{
  include: [
    '/src/pages',     // 绝对路径
    /components\/.*/,  // 正则表达式
    'utils'           // 相对路径
  ],
  exclude: [
    '/test/',
    /.*\.spec\.ts$/
  ]
}
```

## 错误报告服务

### 服务器特性

Error Report 内置了完整的HTTP服务器和前端SPA应用：

- **自动端口发现**: 从5000端口开始自动查找可用端口（最多尝试20个端口）
- **静态文件服务**: 自动生成和服务化HTML、JS、CSS文件
- **WebSocket支持**: 实时推送错误报告更新

### 前端界面功能

1. **主页面** (index.html + main-new.js)
   - 错误和警告统计概览
   - 按类型分组显示
   - 支持路由跳转到详情页

2. **错误详情页** (error-detail.js)
   - 单个错误的详细信息
   - 错误堆栈和位置信息
   - 相关文件路径展示

3. **文件详情页** (file-detail.js)
   - 文件级别的错误汇总
   - 文件内错误分布
   - 错误严重程度标识

### 使用方式

启动错误报告服务后，可以通过以下方式查看报告：

1. **自动打开**: 配置 `autoStartServer: true`，编译完成后自动打开浏览器
2. **手动访问**: 访问控制台显示的本地地址（如 http://localhost:5000）
3. **实时更新**: 无需刷新页面，错误报告会通过WebSocket自动更新


## 常见问题

### Q: 服务器启动失败怎么办？
A: Error Report 会自动查找可用端口（5000-5019），如果所有端口都被占用，请检查是否有其他服务占用端口，或手动释放端口。

### Q: 为什么错误分组没有生效？
A: 请检查 `errorConfig.groups` 配置中的路径规则是否正确。支持字符串匹配和正则表达式，确保路径格式使用正斜杠。

### Q: 如何自定义阻断错误类型？
A: 通过配置 `errors.blocking` 数组来指定需要阻断编译的错误类型，如 `['syntaxError', 'moduleNotFound']`。

### Q: SPA页面无法正常显示？
A: 确保 `templates` 目录下的所有文件都已正确生成，可以查看控制台是否有文件生成失败的提示。

### Q: WebSocket连接失败？
A: Error Report 使用动态获取的主机名建立WebSocket连接，如果连接失败，请检查防火墙设置和网络环境。

## API 文档

### WebpackErrorCollector 类

主要方法：

- `constructor(options)`: 初始化插件
- `apply(compiler)`: 应用到webpack编译器
- `processError(error, errorObj, type)`: 处理单个错误
- `filterByType(errors, config)`: 按类型过滤错误
- `groupByConfiguredPaths(errors)`: 按配置路径分组错误
- `checkPathMatch(filePath, includeRules)`: 检查路径匹配规则

### ErrorReportServer 类

主要方法：

- `constructor(reportPath, options)`: 初始化服务器
- `start()`: 启动HTTP服务器
- `findAvailablePort(startPort, maxAttempts)`: 查找可用端口
- `updateReport(reportPath)`: 更新错误报告
- `stop()`: 停止服务器

### HtmlGenerator 类

主要方法：

- `constructor(outputPath)`: 初始化HTML生成器
- `generateReportHtml()`: 生成SPA报告文件
- `copyTemplateFile(fileName)`: 复制模板文件
- `ensureDirectory(dirPath)`: 确保目录存在

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循现有的代码风格
- 为新功能添加相应的测试用例
- 更新相关文档

## 更新日志

### v1.0.0
- 初始版本发布
- 支持14种错误类型自动识别
- 内置SPA错误报告界面
- WebSocket实时更新支持
- 自动端口发现和服务器启动
- 支持错误分组和路径规则匹配
- 生产环境编译阻断功能


## 许可证

[MIT](LICENSE)
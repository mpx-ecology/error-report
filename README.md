# Error Report

webpack编译错误可视化工具，帮助开发者更好地管理和分析构建过程中的错误和警告信息。

## 特性

- 📊 可视化展示 - 直观展示Webpack编译过程中的错误和警告
- 🔍 智能分类 - 自动识别并分类多种错误类型
- 📝 自定义分组 - 支持灵活的错误分组配置
- 🚫 编译阻断 - 可配置特定错误阻断编译流程
- 🌐 实时预览 - 支持启动本地服务实时查看错误报告
- 🎯 精准过滤 - 支持按类型、路径进行错误过滤

## 安装

```bash
npm install @mpxjs/error-report --save-dev
# 或者
yarn add @mpxjs/error-report --dev
```

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
            'pages/a'                // 相对路径
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
| errors.includes | string[] | [] | 需要处理的错误类型 |
| errors.excludes | string[] | [] | 需要排除的错误类型 |
| errors.blocking | string[] | [] | 触发编译阻断的错误类型 |
| errors.blockingMessage | string | '存在强阻断错误' | 编译阻断提示信息 |

### 支持的错误类型

| 错误类型 | 描述 | 示例 |
|---------|------|------|
| syntax | 语法错误 | 缺少分号、括号不匹配等 |
| typescript | TS类型错误 | 类型不匹配、未定义类型等 |
| eslint | 代码规范错误 | 格式错误、命名规范等 |
| mpx | MPX框架错误 | 组件配置错误、模板语法等 |
| dependency | 依赖相关错误 | 模块缺失、版本冲突等 |
| import | 导入导出错误 | 路径错误、命名错误等 |
| runtime | 运行时错误 | 接口调用错误等 |

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

启动错误报告服务后，可以通过以下方式查看报告：

1. 自动打开：配置 `autoStartServer: true`
2. 手动访问：默认端口 8080
3. 支持功能：
   - 错误分类查看
   - 错误详情展示


## 常见问题


## 贡献指南


## 许可证

[MIT](LICENSE)
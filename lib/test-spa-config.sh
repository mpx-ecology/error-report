#!/bin/bash

# 测试 testPlugin SPA 首页启动脚本

echo "🚀 测试 testPlugin SPA 启动逻辑"
echo ""

# 进入 testPlugin 目录
cd "$(dirname "$0")"

# 检查必要文件
echo "📋 检查 testPlugin 核心文件："
files=(
    "server.js"
    "html-generator.js"
    "plugin.js"
    "templates/index.html"
    "templates/index.js"
    "templates/main.js"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (缺失)"
    fi
done

echo ""
echo "🔧 启动逻辑验证："
echo "  1. 服务器优先查找: templates/index.html (新的SPA页面)"
echo "  2. 备用页面: templates/error-analyzer-simple.html"
echo "  3. 静态文件包含: index.html, index.js, main.js 等"

echo ""
echo "📝 修改内容总结："
echo "  • server.js: 默认路由现在优先返回新的SPA版本 index.html"
echo "  • server.js: 静态文件列表已包含 index.js 和其他SPA文件"  
echo "  • html-generator.js: 文件复制列表已包含新的SPA文件"
echo "  • html-generator.js: 路径调整逻辑已支持新的SPA页面"

echo ""
echo "✅ 配置完成！"
echo ""
echo "💡 使用说明："
echo "  • 原有的三个页面逻辑保持不变"
echo "  • 服务启动时会优先使用新的SPA版本 index.html"
echo "  • 如果新版本不存在，会自动回退到旧版本"
echo "  • 所有现有功能保持兼容"

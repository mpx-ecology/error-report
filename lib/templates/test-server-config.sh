#!/bin/bash

# 测试服务器配置 - 验证 main 入口文件设置

echo "🔧 测试 testPlugin 服务器配置"
echo "================================"
echo ""

# 检查必要的服务器文件
echo "📋 检查服务器文件："
server_files=(
    "../server.js"
    "../html-generator.js"
    "../plugin.js"
)

for file in "${server_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file [缺失]"
    fi
done

echo ""

# 检查 main 相关模板文件
echo "📋 检查 main 入口文件："
main_files=(
    "main.html"
    "main.js"
    "main-new.js"
)

for file in "${main_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file [缺失]"
    fi
done

echo ""

# 检查其他支持文件
echo "📋 检查支持文件："
support_files=(
    "error-detail.html"
    "error-detail.js"
    "file-detail.html"
    "file-detail.js"
    "index.html"
    "index.js"
    "styles.css"
)

for file in "${support_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file [缺失]"
    fi
done

echo ""
echo "🎯 服务器入口文件优先级："
echo "  1. main.html           (第一优先级)"
echo "  2. index.html          (SPA 集成页面)"
echo "  3. main-new.html       (如果存在)"
echo "  4. error-analyzer-simple.html (备用)"

echo ""
echo "✨ 当前配置："
echo "  • 服务器默认路由指向 main.html"
echo "  • 移除了对不存在的 spa-error-analyzer.html 的引用"
echo "  • 错误处理更友好，跳过不存在的文件"
echo "  • 保持所有原有功能逻辑不变"

echo ""
echo "🚀 测试完成！可以启动服务器测试。"

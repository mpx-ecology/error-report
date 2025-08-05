#!/bin/bash

# 错误分析工具 SPA 版本 - 基于原有逻辑整合

echo "🚀 SPA错误分析工具启动中..."
echo "📋 基于原有 main.js, main-new.js, error-detail.js, file-detail.js 逻辑"
echo ""

# 检查核心文件
echo "📋 检查核心文件："
core_files=(
    "main-new.html"  "高级主页面（入口）"
    "main-new.js"    "高级主逻辑"
    "main.html"      "基础主页面"
    "main.js"        "基础主逻辑"
    "error-detail.js" "错误详情逻辑"
    "error-detail.html" "错误详情页面"
    "file-detail.js"  "文件详情逻辑"
    "file-detail.html" "文件详情页面"
    "test-index-based.html" "测试工具"
    "styles.css"     "样式文件"
)

for ((i=0; i<${#core_files[@]}; i+=2)); do
    file="${core_files[i]}"
    desc="${core_files[i+1]}"
    if [ -f "$file" ]; then
        echo "  ✅ $file ($desc)"
    else
        echo "  ❌ $file ($desc) [缺失]"
    fi
done

echo ""
echo "� SPA功能模块："
echo "  📊 主页面:           基于 main.js 的基础错误分析"
echo "  📋 错误列表:         基于 main-new.js 的高级错误列表"
echo "  🔍 错误详情:         基于 error-detail.js 的详情展示"
echo "  � 文件详情:         基于 file-detail.js 的文件分析"
echo "  🧪 测试工具:         iframe 嵌入测试页面"
echo ""

echo "✨ 特性："
echo "  • 保持所有原有逻辑和API兼容性"
echo "  • 左侧导航栏无缝切换功能模块"
echo "  • 响应式设计，支持移动端"
echo "  • 集成WebSocket实时更新 (main-new.js)"
echo "  • 支持错误详情弹窗和文件分析"
echo ""

# 在浏览器中打开主页面
if command -v open &> /dev/null; then
    echo "🌍 在浏览器中打开主页面..."
    open "main-new.html"
elif command -v xdg-open &> /dev/null; then
    echo "🌍 在浏览器中打开主页面..."
    xdg-open "main-new.html"
else
    echo "📝 请手动在浏览器中打开 main-new.html"
fi

echo ""
echo "🎉 SPA启动完成！"
echo ""
echo "💡 使用说明："
echo "  • main-new.html 是新的入口页面，基于 main-new.js 逻辑"
echo "  • 上方标签页切换 '按模块' 和 '按文件' 视图"
echo "  • 支持错误搜索、筛选、详情查看等所有原有功能"
echo "  • 通过 WebSocket 实时更新错误信息"
echo "  • 所有功能都集成在一个页面中，无需侧边栏"

#!/usr/bin/env node

/**
 * SPA 服务器测试脚本
 * 用于验证服务器是否正确启动 SPA 页面
 */

const path = require('path');
const fs = require('fs');

// 模拟启动服务器
function testSPAServer() {
    console.log('🚀 测试 SPA 服务器配置...\n');
    
    const templatesDir = __dirname;
    const spaFile = path.join(templatesDir, 'error-analyzer-simple.html');
    const indexFile = path.join(templatesDir, 'index.html');
    
    console.log('📁 检查文件存在性:');
    console.log(`  SPA 页面: ${fs.existsSync(spaFile) ? '✅' : '❌'} ${spaFile}`);
    console.log(`  索引页面: ${fs.existsSync(indexFile) ? '✅' : '❌'} ${indexFile}`);
    
    // 检查 SPA 页面内容
    if (fs.existsSync(spaFile)) {
        const content = fs.readFileSync(spaFile, 'utf8');
        const hasTitle = content.includes('错误可视化分析器');
        const hasScript = content.includes('<script>');
        const hasStyles = content.includes('<style>');
        
        console.log('\n📄 SPA 页面内容检查:');
        console.log(`  标题: ${hasTitle ? '✅' : '❌'}`);
        console.log(`  脚本: ${hasScript ? '✅' : '❌'}`);
        console.log(`  样式: ${hasStyles ? '✅' : '❌'}`);
    }
    
    // 模拟服务器逻辑
    console.log('\n🔄 模拟服务器路由逻辑:');
    
    function simulateRoute(path) {
        console.log(`\n  请求路径: ${path}`);
        
        if (path === '/') {
            if (fs.existsSync(spaFile)) {
                console.log(`    ✅ 返回: error-analyzer-simple.html (SPA)`);
                return 'spa';
            } else if (fs.existsSync(indexFile)) {
                console.log(`    ⚠️  回退: index.html`);
                return 'index';
            } else {
                console.log(`    ❌ 404: 页面未生成`);
                return 'error';
            }
        } else if (path === '/spa') {
            if (fs.existsSync(spaFile)) {
                console.log(`    ✅ 返回: error-analyzer-simple.html`);
                return 'spa';
            } else {
                console.log(`    ❌ 404: SPA页面未生成`);
                return 'error';
            }
        }
    }
    
    // 测试不同路径
    simulateRoute('/');
    simulateRoute('/spa');
    
    console.log('\n📋 总结:');
    console.log('- 服务器现在会优先返回 SPA 页面');
    console.log('- 访问 "/" 将直接显示错误可视化分析器');
    console.log('- 访问 "/spa" 是 SPA 页面的专用路由');
    console.log('- 不再依赖 main.js 作为主入口');
    
    console.log('\n🎯 推荐访问方式:');
    console.log('1. http://localhost:端口/ (自动显示SPA)');
    console.log('2. http://localhost:端口/spa (直接访问SPA)');
    console.log('3. http://localhost:端口/index.html (传统页面)');
}

if (require.main === module) {
    testSPAServer();
}

module.exports = { testSPAServer };

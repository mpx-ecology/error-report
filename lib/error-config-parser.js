const fs = require('fs');
const path = require('path');

class ErrorConfigParser {
    constructor(configPath) {
        this.configPath = configPath;
        this.config = null;
    }

    loadConfig() {
        try {
            if (!this.configPath) return null;
            const configContent = fs.readFileSync(this.configPath, 'utf-8');
            this.config = require(this.configPath);
            return this.config;
        } catch (error) {
            console.error('Error loading error config file:', error);
            return null;
        }
    }

    // 根据路径获取分组
    getGroupForPath(filePath) {
        if (!this.config || !this.config.groups) return null;
        
        // 规范化文件路径
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        // 遍历配置的分组
        for (const group of this.config.groups) {
            if (!group.patterns || !group.name) continue;
            
            // 检查路径是否匹配任何模式
            const matches = group.patterns.some(pattern => {
                const regex = new RegExp(pattern);
                return regex.test(normalizedPath);
            });
            
            if (matches) return group.name;
        }
        
        // 如果没有匹配的分组，按默认规则分类
        if (normalizedPath.includes('/components/')) {
            const match = normalizedPath.match(/\/components\/([^\/]+)/);
            return match ? `组件:${match[1]}` : '其他组件';
        }
        
        if (normalizedPath.includes('/pages/')) {
            const match = normalizedPath.match(/\/pages\/([^\/]+)/);
            return match ? `页面:${match[1]}` : '其他页面';
        }
        
        return '其他';
    }
}

module.exports = ErrorConfigParser;

const fs = require('fs');
const path = require('path');

class HtmlGenerator {
  constructor(outputPath = 'dist/errorLog') {
    this.outputPath = outputPath;
    this.templatePath = path.join(__dirname, 'templates');
  }

  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  copyTemplateFile(fileName) {
    const sourcePath = path.join(this.templatePath, fileName);
    const outputDir = path.resolve(process.cwd(), this.outputPath);
    const targetPath = path.join(outputDir, fileName);
    
    // 确保输出目录存在
    this.ensureDirectory(outputDir);
    
    console.log('Source path:', sourcePath);
    console.log('Target path:', targetPath);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`模板文件不存在: ${fileName}`);
    }

    // 读取模板文件内容
    let content = fs.readFileSync(sourcePath, 'utf8');

    // 对于HTML文件，调整资源引用路径为相对路径
    if (fileName.endsWith('.html')) {
      content = content.replace(/href="\/([^"]+)"/g, 'href="$1"')
                      .replace(/src="\/([^"]+)"/g, 'src="$1"');
    }

    // 不再需要调整 WebSocket 连接逻辑，因为现在使用动态获取的主机名

    try {
      // 写入文件到输出目录
      fs.writeFileSync(targetPath, content);
      console.log(`成功生成 ${fileName} 到 ${targetPath}`);
      return targetPath;
    } catch (error) {
      console.error(`写入文件失败: ${error.message}`);
      throw error;
    }
  }

  async generateReportHtml() {
    try {
      // 确保输出目录存在
      const outputDir = path.resolve(process.cwd(), this.outputPath);
      this.ensureDirectory(outputDir);
      
      // 复制所有必需的文件
      const files = [
        'index.html',      // 修改后的主页面（包含SPA功能）
        'main-new.js',     // 修改后的主JS（包含SPA路由）
        'error-detail.js', // SPA组件化的错误详情页
        'file-detail.js',  // SPA组件化的文件详情页
        'styles.css'       // 样式文件
      ];
      for (const file of files) {
        await this.copyTemplateFile(file);
      }
      
      // 确保port-info.json存在
      const portInfoPath = path.join(outputDir, 'port-info.json');
      if (!fs.existsSync(portInfoPath)) {
        fs.writeFileSync(portInfoPath, JSON.stringify({ port: null }));
      }
      
      console.log(`SPA报告文件已生成在: ${outputDir}`);
      return outputDir;
    } catch (error) {
      console.error('生成报告文件失败:', error);
      throw error;
    }
  }
}

module.exports = HtmlGenerator;
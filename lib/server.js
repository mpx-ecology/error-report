const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const net = require('net');
const path = require('path');
const fs = require('fs');

class ErrorReportServer {
  constructor(reportPath, options = {}) {
    this.reportPath = reportPath;
    this.options = options;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.port = null;
    this.clients = new Set();
    this.outputDir = path.dirname(reportPath);
    this.staticFiles = new Set(['index.html', 'main.js', 'styles.css']);
    this.isStarting = false; // 添加启动状态标志
  }

  async findAvailablePort(startPort = 3000, maxAttempts = 20) {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
      try {
        await new Promise((resolve, reject) => {
          const server = net.createServer();
          server.once('error', reject);
          server.once('listening', () => {
            server.close();
            resolve();
          });
          server.listen(port);
        });
        return port;
      } catch (err) {
        continue;
      }
    }
    throw new Error('无法找到可用端口');
  }

  async start() {
    // 防止重复启动
    if (this.isStarting) {
      console.log('服务器正在启动中，请稍候...');
      return;
    }

    this.isStarting = true;
    try {
      // 获取可用端口
      this.port = await this.findAvailablePort();
      
      // 确保输出目录存在
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // 配置CORS
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });

      // 提供输出目录的静态文件服务
      this.app.use(express.static(this.outputDir));
      
      // 默认路由返回index.html
      this.app.get('/', (req, res) => {
        const indexPath = path.join(this.outputDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send('报告页面未生成');
        }
      });

      // 提供错误报告JSON接口
      this.app.get('/error-report.json', (req, res) => {
        res.sendFile(this.reportPath);
      });

      // 提供服务器信息接口
      this.app.get('/server-info', (req, res) => {
        res.json({ port: this.port });
      });
      
      // WebSocket 连接处理
      this.wss.on('connection', (ws) => {
        console.log('新的WebSocket连接已建立');
        this.clients.add(ws);
        this.sendReport(ws);
        
        ws.on('close', () => {
          console.log('WebSocket连接已关闭');
          this.clients.delete(ws);
        });

        ws.on('error', (error) => {
          console.error('WebSocket错误:', error);
        });
      });
      
      // 监听错误报告文件变化，但排除静态资源文件
      const watcher = chokidar.watch(this.outputDir, {
        ignored: [(file) => {
          const basename = path.basename(file);
          return this.staticFiles.has(basename);
        }],
        persistent: true
      });

      watcher.on('change', (filePath) => {
        if (filePath === this.reportPath) {
          console.log('检测到错误报告文件变化，正在广播更新...');
          this.broadcastReport();
        }
      });

      // 保存端口信息
      const portInfoPath = path.join(this.outputDir, 'port-info.json');
      fs.writeFileSync(portInfoPath, JSON.stringify({ port: this.port }));

      // 启动服务器
      return new Promise((resolve) => {
        this.server.listen(this.port, '0.0.0.0', () => {
          // 获取本机IP地址
          const interfaces = require('os').networkInterfaces();
          let ipAddress = '';
          for (let devName in interfaces) {
            const iface = interfaces[devName];
            for (let i = 0; i < iface.length; i++) {
              const alias = iface[i];
              if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                ipAddress = alias.address;
                break;
              }
            }
            if (ipAddress) break;
          }
          
          console.log(`\n错误报告服务运行在:\nLocal: http://localhost:${this.port}\nNetwork: http://${ipAddress}:${this.port}`);
          console.log(`静态文件目录: ${this.outputDir}`);
          console.log(`WebSocket 服务运行在: ws://${ipAddress}:${this.port}`);
          resolve({ port: this.port });
        });
      });
    } catch (error) {
      console.error('启动错误报告服务失败:', error);
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  sendReport(ws) {
    try {
      const reportData = fs.readFileSync(this.reportPath, 'utf8');
      ws.send(JSON.stringify({
        type: 'report-update',
        data: JSON.parse(reportData),
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('发送报告失败:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: '无法加载错误报告'
      }));
    }
  }

  broadcastReport() {
    try {
      const reportData = fs.readFileSync(this.reportPath, 'utf8');
      const message = JSON.stringify({
        type: 'report-update',
        data: JSON.parse(reportData),
        timestamp: new Date().toISOString()
      });
      
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } catch (error) {
      console.error('广播错误报告失败:', error);
    }
  }

  async updateReport(reportOrPath) {
    try {
      if (typeof reportOrPath === 'string') {
        this.reportPath = reportOrPath;
        await this.broadcastReport();
      } else if (typeof reportOrPath === 'object') {
        fs.writeFileSync(this.reportPath, JSON.stringify(reportOrPath, null, 2));
        await this.broadcastReport();
      }
    } catch (error) {
      console.error('更新错误报告失败:', error);
    }
  }
}

module.exports = ErrorReportServer;
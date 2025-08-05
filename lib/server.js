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
    this.staticFiles = new Set([
      'index.html',
      'spa-main.html',
      'spa-main.js', 
      'main.js', 
      'main-new.js', 
      'styles.css', 
      'error-detail.html', 
      'error-detail.js', 
      'file-detail.html', 
      'file-detail.js'
    ]);
    this.isStarting = false; // 添加启动状态标志
  }

  async findAvailablePort(startPort = 5000, maxAttempts = 20) {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
      try {
        const isAvailable = await new Promise((resolve) => {
          const server = net.createServer();
          server.unref();
          
          server.once('error', (err) => {
            server.close();
            if (err.code === 'EADDRINUSE') {
              resolve(false);
            } else {
              resolve(false);
            }
          });

          server.once('listening', () => {
            server.close(() => resolve(true));
          });

          server.listen(port, '0.0.0.0');
        });

        if (isAvailable) {
          // 额外验证 WebSocket 端口
          const wsAvailable = await new Promise((resolve) => {
            const wsServer = new WebSocket.Server({ port }, () => {
              wsServer.close(() => resolve(true));
            });
            
            wsServer.on('error', () => {
              wsServer.close(() => resolve(false));
            });
          });

          if (wsAvailable) {
            return port;
          }
        }
      } catch (err) {
        console.warn(`检查端口 ${port} 时发生错误:`, err.message);
        continue;
      }
    }
    throw new Error(`在端口范围 ${startPort}-${startPort + maxAttempts - 1} 中未找到可用端口`);
  }

  async start(options = {}) {
    const { error = {}, warning = {} } = options;
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
          this.broadcastReport();
        }
      });

      // 保存端口信息
      const portInfoPath = path.join(this.outputDir, 'port-info.json');
      fs.writeFileSync(portInfoPath, JSON.stringify({ port: this.port }));

      // 启动服务器
      return new Promise((resolve, reject) => {
        // 设置错误处理
        this.server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            // 尝试关闭可能存在的僵尸进程
            const killCommand = process.platform === 'win32'
              ? `netstat -ano | findstr :${this.port}`
              : `lsof -i:${this.port}`;
              
            require('child_process').exec(killCommand, (err, stdout) => {
              if (err) {
                reject(new Error(`端口 ${this.port} 被占用，且无法自动释放`));
                return;
              }
              
              // 在 macOS/Linux 上尝试杀死占用端口的进程
              if (process.platform !== 'win32' && stdout) {
                const pid = stdout.toString().split('\n')[0].split(/\s+/)[1];
                try {
                  process.kill(pid, 'SIGTERM');
                } catch (killError) {
                  // 忽略杀死进程的错误
                }
              }
              
              reject(new Error(`端口 ${this.port} 被占用，请手动结束占用进程或使用其他端口`));
            });
          } else {
            reject(error);
          }
        });

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
          
          // 移除错误处理程序，避免内存泄漏
          this.server.removeAllListeners('error');
          
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
    console.log('更新错误报告:', reportOrPath);
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
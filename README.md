# 字幕脱敏审校台（Subtitle Redaction Workbench）

粘贴带时间码的 WebVTT，配置姓名、电话等正则规则后，系统按优先级合并重叠命中，保留原始时间轴并生成可逐条撤销的替换预览；确认后导出新的 VTT 与包含规则、原文区间、替换结果的 JSON 审计文件。所有处理在本机完成，刷新页面后任务自动恢复。

## 一键启动（Docker）

```bash
docker compose up --build
```

启动后访问：**http://localhost:8080**

> 也可不使用 Compose：`docker build -t srw . && docker run -p 8080:8080 srw`

### 配置项

| 环境变量 | 默认值 | 说明 |
| -------- | ------ | ---- |
| `PORT`   | `8080` | 服务监听端口（容器内）。修改后请同步调整 `docker-compose.yml` 的端口映射 |

依赖安装与构建（shared → server → client）全部在 Dockerfile 中自动完成，无需任何手动初始化。

## 功能说明

1. **粘贴 VTT**：左侧粘贴 WebVTT 原文（或点「载入示例」），支持 cue 标识符、行内设置、`NOTE`/`STYLE`/`REGION` 块，序列化时原样保留时间轴与注释块。
2. **配置规则**：每条规则包含名称、正则、标志、替换模板（支持 `$&`、`$1`–`$99` 捕获组引用）、优先级与启用开关；内置手机号、身份证、邮箱、姓名（带称谓）、IPv4 五条示例规则。
3. **优先级合并**：同一行内重叠的命中按「优先级降序 → 起始位置升序 → 区间更长者优先」贪心合并，被覆盖的命中灰显并计入审计。
4. **逐条撤销预览**：每条命中可单独勾选/撤销，也可全部应用/撤销；右侧实时显示应用当前决定后的输出 VTT。
5. **导出**：一键下载脱敏后的 `.vtt` 与审计 `.json`（含规则快照、每条命中的 cue 时间区间、行内字符区间、原文、替换结果与状态，以及输入 SHA-256 与统计）。
6. **任务恢复**：VTT、规则与每条撤销决定自动保存在浏览器 localStorage，刷新后自动恢复；「新任务」可一键清空。

## 本地开发

```bash
npm install
npm run dev
```

- 前端开发服务器：http://localhost:5173（`/api` 自动代理到 8080）
- 后端 API：http://localhost:8080

其他命令：

```bash
npm run build   # 构建全部工作区
npm start       # 以生产模式运行（服务 client/dist 静态文件 + API）
```

## API 简介

| 方法 | 路径           | 说明                                                                 |
| ---- | -------------- | -------------------------------------------------------------------- |
| GET  | `/api/health`  | 健康检查                                                             |
| POST | `/api/preview` | 入参 `{ vtt, rules }`，返回解析后的文档结构、命中列表与规则错误       |
| POST | `/api/export`  | 入参 `{ vtt, rules, decisions }`，返回脱敏 VTT 与审计 JSON（服务端权威重算） |

## 目录结构

```
├── shared/    # @app/shared：VTT 解析/序列化、规则命中、优先级合并、审计构建（纯函数，前后端共用）
├── server/    # @app/server：Express API + 生产静态托管
├── client/    # @app/client：React + Vite 前端
├── Dockerfile # 多阶段构建，一键产出运行镜像
└── docker-compose.yml
```

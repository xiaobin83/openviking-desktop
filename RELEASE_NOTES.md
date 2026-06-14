# OpenViking Desktop v0.1.0 — Pre-release (macOS aarch64)

OpenViking Desktop 是为 OpenViking AI 知识管理系统提供的本地桌面管理控制台。**目标是大幅降低 OpenViking 的使用门槛**——用户无需接触命令行，即可完成服务的安装、启动、配置与监控。

## 系统要求

- macOS 14.0 (Sonoma) 或更高版本
- Apple Silicon (M1/M2/M3/M4) 芯片
- 首次使用需联网（自动下载 Python 运行环境）

## 核心特性

- **零命令行上手**：首次运行向导引导完成全部设置——选择 OpenViking 工作目录、配置 AI 模型、设置 API Key，全程图形化操作
- **自动 Python 环境管理**：内置 `uv` 运行时会自动下载指定 Python 版本、创建虚拟环境并安装 `openviking[bot]`，进度实时显示
- **一键服务管理**：启动/停止/重启后端服务，支持系统托盘常驻运行，崩溃自动重试最多 3 次
- **实时仪表盘**：服务状态一目了然，自动刷新文件数、记忆数、Token 消耗、检索次数等关键指标
- **完整配置管理**：通过 5 个配置标签页（基础 / AI / 存储 / 高级 / 飞书）可视化调整全部参数，支持一键切换工作目录
- **内嵌 PlayGround**：在应用窗口内直接打开 OpenViking PlayGround，API Key 自动复制到剪贴板
- **中英文双语**：自动跟随系统语言，设置界面一键切换
- **深色主题**：精心设计的暗色 UI 风格，低视觉疲劳

## 安装

1. 下载 `OpenViking_0.1.0_aarch64.dmg`
2. 将 `OpenViking.app` 拖入 `Applications` 文件夹
3. 首次启动时会自动进入设置向导，按提示完成 Python 环境初始化（需联网）
4. 完成后即可启动服务并使用

## 注意事项

- 首次向导完成后，工作目录结构如下：
  ```
  <工作目录>/
  ├── ov.conf    # 配置文件（自动生成）
  └── data/      # 知识库数据、向量数据库等
  ```
- 如需重新运行向导，删除 `~/.openviking/.onboarded` 文件即可（保留已安装的 Python 环境和工作目录数据）

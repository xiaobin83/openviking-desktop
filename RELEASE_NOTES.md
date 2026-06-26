# OpenViking Desktop v0.1.2 — Pre-release (macOS + Windows)

OpenViking Desktop 是为 OpenViking AI 知识管理系统提供的本地桌面管理控制台。**目标是大幅降低 OpenViking 的使用门槛**——用户无需接触命令行，即可完成服务的安装、启动、配置与监控。

## 系统要求

- macOS 14.0 (Sonoma) 或更高版本，Apple Silicon (M1/M2/M3/M4)
- Windows 10 或更高版本，x86_64
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

1. 下载对应平台的安装包（macOS: `OpenViking_0.1.2_aarch64.dmg`，Windows: `OpenViking_0.1.2_x64.msi`）
2. 将 `OpenViking.app` 拖入 `Applications` 文件夹
3. 首次启动时会自动进入设置向导，按提示完成 Python 环境初始化（需联网）
4. 完成后即可启动服务并使用

### macOS 首次启动说明

当前版本使用临时签名（adhoc），未经过 Apple 公证。首次打开时 macOS Gatekeeper 会阻止启动，请选择以下任一方式放行：

**方式一：一键放行（推荐）**

在终端执行以下命令，自动清除 Gatekeeper 检疫标记：

```bash
curl -fsSL https://raw.githubusercontent.com/xiaobin83/openviking-desktop/main/scripts/allow-gatekeeper.sh | bash
```

执行后即可直接双击打开 OpenViking.app。

> 如需恢复 Gatekeeper 拦截状态（用于测试），运行：
> ```bash
> curl -fsSL https://raw.githubusercontent.com/xiaobin83/openviking-desktop/main/scripts/reset-gatekeeper.sh | bash
> ```

**方式二：手动右键放行**

1. 双击 `OpenViking.app` → 出现 "无法打开" 弹窗 → 点击 **"完成"**
2. 打开 **系统设置 → 隐私与安全性** → 滚动到底部 → 点击 **"仍要打开"**
3. 再次双击 `OpenViking.app` → 点击 **"打开"**

> 企业管理的 Mac 可能禁止运行未签名应用，这种情况需要联系 IT 管理员。

## 新增

- **端口冲突检测与解决**：启动时自动检测服务端口是否被占用。若被已有 OpenViking 进程占用，弹出清理对话框；若被其他应用占用，引导用户修改端口号后重新检测。
- **已有配置发现**：向导在工作目录步骤检测到已有 `ov.conf` 时，提示用户选择使用已有配置或重新开始，并智能合并向导可见字段，保留非向导字段（如飞书集成、熔断器等）不变。
- **动态 API 端口**：服务端口不再硬编码为 `1933`，现在从 `ov.conf` 的 `server.port` 读取，支持任意端口配置。
- **Gatekeeper 放行/重置脚本**：新增 `allow-gatekeeper.sh`（一键放行）和 `reset-gatekeeper.sh`（恢复拦截），方便 macOS 用户测试和日常使用。
- **调试辅助脚本**：新增 `occupy-port-1933.sh`，可模拟端口被其他应用占用，用于测试端口冲突处理流程。

## 修复

- **工作目录重复创建**：修复首次运行向导中"工作目录"步骤每输入一个字符就创建目录的问题。现改为点击"下一步"时检查路径不存在才创建，并校验路径合法性。
- **启动行为优化**：移除应用启动时的无条件自动启动，改为先进行端口冲突检测，确认无冲突后再启动服务，避免僵尸进程和端口孤儿问题。

## 已知问题

- **Windows 上"已有配置发现"功能失效**：向导中检测已有 `ov.conf` 的路径处理正则仅匹配正斜杠，Windows 反斜杠路径下无法正确检测。该功能将静默降级（始终走"重新开始"），不影响正常使用。计划在 v0.1.3 修复。

## 注意事项

- 首次向导完成后，工作目录结构如下：
  ```
  <工作目录>/
  ├── ov.conf    # 配置文件（自动生成）
  └── data/      # 知识库数据、向量数据库等
  ```
- 如需重新运行向导，删除首次运行标记文件即可（保留已安装的 Python 环境和工作目录数据）：
  - **macOS**：删除 `~/Library/Application Support/com.openviking.desktop/.onboarded`
  - **Linux**：删除 `~/.local/share/com.openviking.desktop/.onboarded`
  - **Windows**：删除 `%APPDATA%\com.openviking.desktop\.onboarded`
  - 提示：也可运行 `bash scripts/reset-first-run.sh` 自动重置

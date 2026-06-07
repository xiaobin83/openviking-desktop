# First-Run Onboarding Wizard — 设计文档

## 1. 概述

### 1.1 目标

为新用户提供首次运行引导流程，依次完成：安装 OpenViking → 配置 Embedding → 配置 VLM → 设置 Root API Key。完成后进入正常仪表盘模式。

### 1.2 非目标

- 不持久化向导进度（关闭 = 重新开始）
- 不改变现有 Dashboard / Config Page 的功能
- 不处理已有 ov.conf 但缺少 .onboarded 的迁移场景（仅全新安装）

---

## 2. 首次运行判定

### 2.1 判定机制

使用专用标志文件 `~/.openviking/.onboarded`：

| .onboarded | ov.conf | 行为 |
|---|---|---|
| 不存在 | 任意 | 显示向导 |
| 存在 | 存在 | 正常模式 |
| 存在 | 不存在 | 正常模式（Rust 自动生成默认配置） |

### 2.2 Rust 层变更

**新增 Tauri 命令：**

```rust
// lib.rs
#[tauri::command]
fn is_onboarded(state: tauri::State<'_, ServerState>) -> Result<bool, String> {
    let flag_path = get_onboarded_flag_path(&state);
    Ok(std::path::Path::new(&flag_path).exists())
}

#[tauri::command]
fn mark_onboarded(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let flag_path = get_onboarded_flag_path(&state);
    std::fs::write(&flag_path, "1").map_err(|e| e.to_string())
}
```

**启动流程调整（`lib.rs` `setup()` 函数）：**

1. 现有步骤不变（解析 uv path、检查 venv、加载 workspace、初始化 ServerState）
2. 在自动生成 ov.conf 和自动启动服务器**之前**，检查 `.onboarded` 标志
3. 若标志不存在 → 跳过自动生成配置和自动启动，通过事件通知前端
4. 若标志存在 → 保持现有逻辑

```rust
// 伪代码：setup() 调整点
let onboarded = check_onboarded_flag(&state);
if !onboarded {
    // 不自动生成 ov.conf，不自动启动服务器
    app_handle.emit("needs-onboarding", true)?;
} else {
    // 现有逻辑：auto-generate config + auto-start server
}
```

**新增事件：**

- `needs-onboarding` (bool) — 前端监听后决定是否渲染向导

---

## 3. 向导流程

### 3.1 总体结构

4 步线性向导，每步带进度指示器（4 个点）。支持 Back/Next 导航，当前步骤验证通过后才允许 Next。“Complete”按钮出现在最后一步。

关闭窗口 = 丢弃进度，下次启动重新开始。

### 3.2 Step 1 — 安装 Python + OpenViking

**自动跳过条件：** 调用 `check_openviking_state()` 返回 `installed: true`

**检测失败：** 若 `check_openviking_state()` 调用失败（如网络错误），视为未安装，显示安装界面（不自动跳过）

**未安装时的界面：**
- 显示 "Installing OpenViking..." 状态文字
- 复用 `PythonEnvCard` 的安装逻辑和 `python-task-progress` 进度事件
- 安装完成后自动进入下一步

**安装失败：** 显示错误信息 + "Retry" 按钮

### 3.3 Step 2 — 配置 Embedding 模型

**默认值：** `provider: "local"`，使用捆绑的 GGUF 模型

**表单字段（动态显示）：**

| 字段 | 类型 | 默认值 | 显示条件 |
|---|---|---|---|
| Provider | select | `local` | 始终显示 |
| Model Path | string | 捆绑模型路径 | 仅 local / vikingdb |
| Dimension | number | 1024 | 仅非 local |
| Batch Size | number | 32 | 仅非 local |
| API Base | string | — | 仅非 local |
| API Key | password | — | 仅非 local |
| Model | string | — | 仅非 local |

Provider 选项：local, volcengine, openai, jina, gemini, dashscope, vikingdb（与现有配置保持一致）

### 3.4 Step 3 — 配置 VLM 模型

**表单字段（动态显示）：**

| 字段 | 类型 | 默认值 | 显示条件 |
|---|---|---|---|
| Provider | select | — | 始终显示 |
| API Base URL | string | — | 选择 provider 后显示 |
| API Key | password | — | 选择 provider 后显示 |
| Model | string | — | 选择 provider 后显示 |
| Max Concurrent | number | 100 | 始终显示 |
| Timeout (s) | number | 60 | 始终显示 |
| Thinking Mode | toggle | off | 始终显示 |
| Stream Mode | toggle | off | 始终显示 |

Provider 选项：Volcengine, OpenAI, OpenAI-Codex, Kimi, GLM, Custom（输入自定义）

### 3.5 Step 4 — Root API Key

**界面元素：**
- 文本输入框（password 类型，可切换可见性）
- "Generate UUID" 按钮 — 生成 `uuid v4` 格式随机密钥并填入输入框
- 静态提示卡片：🔑 "You need this key to access Playground. Keep it safe."

**验证：** 不允许为空。Next 按钮（此步显示为 "Complete Setup"）在输入为空时禁用。

### 3.6 完成流程

1. 将所有步骤收集的表单数据合并为 `OvConfig` 对象
2. 调用 `invoke('write_config', { config: JSON.stringify(ovConfig) })` 写入 `ov.conf`
3. 调用 `invoke('mark_onboarded')` 写入 `.onboarded` 标志
4. 前端设置 `needsOnboarding = false`，渲染 Dashboard
5. 若 `write_config` 或 `mark_onboarded` 任一失败 → 显示错误 toast，允许重试

---

## 4. 组件架构

### 4.1 组件树

```
App.tsx
├─ [needsOnboarding === true]
│   └─ <OnboardingWizard />
│       ├─ <WizardProgress />         (4 个小圆点指示当前步骤)
│       ├─ <InstallStep />            (Step 1: 安装进度)
│       ├─ <EmbeddingStep />          (Step 2: Embedding 配置)
│       ├─ <VlmStep />                (Step 3: VLM 配置)
│       └─ <ApiKeyStep />             (Step 4: Root API Key)
│
├─ [needsOnboarding === false]
│   └─ <Dashboard />                  (现有组件，不变)
```

### 4.2 状态管理

```ts
// OnboardingWizard 内部状态
interface WizardState {
  stepIndex: number;          // 0-3
  formData: Partial<OvConfig>; // 累积的表单数据
  isInstalled: boolean;       // Python/OpenViking 是否已安装
}
```

- 每步的表单字段值存储在 `formData` 中，Back 时保留（Back 到前面步骤时已有数据不丢失）
- 步骤切换通过 `stepIndex` 控制，渲染对应的 Step 组件
- `isInstalled` 在 Step 1 挂载时通过 `check_openviking_state()` 查询

### 4.3 App.tsx 集成

```tsx
function App() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    // 监听 Rust 事件
    const unlisten = listen<boolean>('needs-onboarding', (event) => {
      setNeedsOnboarding(event.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={() => setNeedsOnboarding(false)} />;
  }

  // 现有 Dashboard 渲染逻辑...
}
```

向导渲染时完全替代 Dashboard，占据全屏，无顶部导航栏（Header 中的 tab 切换不可见）。

---

## 5. 错误处理

| 场景 | 处理方式 |
|---|---|
| `write_config` 失败 | Toast 错误提示 + "Retry" 按钮 |
| `mark_onboarded` 失败 | Toast 错误提示 + "Retry" 按钮 |
| Python 安装网络错误 | 显示错误消息（复用现有 PythonEnvCard 错误处理） |
| 步骤表单验证失败 | 输入框显示红色边框 + 错误提示文字，Next 按钮禁用 |
| 向导窗口被关闭 | 无状态保存，下次启动重新开始 |

---

## 6. 测试脚本

### `scripts/reset-first-run.sh`

```bash
#!/bin/bash
# 重置首次运行状态，用于测试向导流程

ONBOARDED_FLAG="$HOME/.openviking/.onboarded"
OV_CONF="$HOME/.openviking/ov.conf"
VENV_DIR="$HOME/Library/Application Support/com.openviking.desktop/python"  # macOS

echo "Resetting first-run state..."

if [ -f "$ONBOARDED_FLAG" ]; then
    rm "$ONBOARDED_FLAG"
    echo "  ✓ Removed $ONBOARDED_FLAG"
else
    echo "  - $ONBOARDED_FLAG not found"
fi

if [ -f "$OV_CONF" ]; then
    rm "$OV_CONF"
    echo "  ✓ Removed $OV_CONF"
else
    echo "  - $OV_CONF not found"
fi

if [ "${1:-}" = "--full" ]; then
    if [ -d "$VENV_DIR" ]; then
        rm -rf "$VENV_DIR"
        echo "  ✓ Removed Python venv: $VENV_DIR"
    else
        echo "  - Python venv not found: $VENV_DIR"
    fi
fi

echo "Done. Next app launch will show the onboarding wizard."
```

用法：
- `bash scripts/reset-first-run.sh` — 仅重置标志和配置
- `bash scripts/reset-first-run.sh --full` — 同时删除 Python 虚拟环境（模拟完全全新安装）

---

## 7. i18n 新增键

| Key | English | 中文 |
|---|---|---|
| `wizard.title` | Setup Wizard | 设置向导 |
| `wizard.step_install` | Install OpenViking | 安装 OpenViking |
| `wizard.step_embedding` | Configure Embedding | 配置 Embedding |
| `wizard.step_vlm` | Configure VLM | 配置 VLM |
| `wizard.step_apikey` | Root API Key | Root API Key |
| `wizard.generate_uuid` | Generate UUID | 生成 UUID |
| `wizard.apikey_required` | Root API Key is required | Root API Key 为必填项 |
| `wizard.apikey_playground_note` | You need this key to access Playground. Keep it safe. | 访问 Playground 需要此密钥，请妥善保管。 |
| `wizard.next` | Next | 下一步 |
| `wizard.back` | Back | 上一步 |
| `wizard.complete` | Complete Setup | 完成设置 |
| `wizard.skip` | Skip for now | 暂时跳过 |
| `wizard.install_progress` | Installing OpenViking... | 正在安装 OpenViking... |
| `wizard.already_installed` | OpenViking already installed, skipping... | OpenViking 已安装，跳过此步骤... |

---

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src/App.tsx` | 修改 | 添加 `needs-onboarding` 事件监听 + 条件渲染 |
| `src/components/wizard/OnboardingWizard.tsx` | 新增 | 向导主容器 |
| `src/components/wizard/WizardProgress.tsx` | 新增 | 步骤进度指示器 |
| `src/components/wizard/InstallStep.tsx` | 新增 | Step 1 |
| `src/components/wizard/EmbeddingStep.tsx` | 新增 | Step 2 |
| `src/components/wizard/VlmStep.tsx` | 新增 | Step 3 |
| `src/components/wizard/ApiKeyStep.tsx` | 新增 | Step 4 |
| `src-tauri/src/lib.rs` | 修改 | 新增 `is_onboarded`/`mark_onboarded` 命令、修改 `setup()` 逻辑、注册事件 |
| `src/locales/en.json` | 修改 | 新增 wizard 相关键 |
| `src/locales/zh.json` | 修改 | 新增 wizard 相关键 |
| `scripts/reset-first-run.sh` | 新增 | 测试脚本 |

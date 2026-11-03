# ensemble-story-extractor

用于从游戏 **KAMITSUBAKI CITY ENSEMBLE** 中提取剧情文本并导出为纯文本文件的工具集。

工作流分为两步：

1. **`decrypt-bundle.ps1`** — 解密游戏所有被加密的 Unity AssetBundle（`.bundle`）文件。
2. **`export-story.mjs`** — 从解密后的剧情 JSON 中提取多语言文本，按分类导出为 `.txt`。

> 本仓库中的两个脚本均由 **DeepSeek** 生成，仅用于个人学习与文本整理，请勿用于任何商业用途。

---

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [脚本说明](#脚本说明)
  - [decrypt-bundle.ps1](#decrypt-bundleps1)
  - [export-story.mjs](#export-storymjs)
- [附录：逆向笔记（如何提取 Password 与算法）](#附录逆向笔记如何提取-password-与算法)
- [目录结构](#目录结构)
- [常见问题](#常见问题)

---

## 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | ≥ 18（使用 ES Module 与 `node:fs/promises`） |
| PowerShell | Windows PowerShell 5.1 或 PowerShell 7+（需支持 `Add-Type -Language CSharp`） |
| 操作系统 | Windows（`decrypt-bundle.ps1` 依赖 .NET；`export-story.mjs` 跨平台） |
| 游戏 | KAMITSUBAKI CITY ENSEMBLE（Steam 版） |

---

## 快速开始

### 1. 解密 bundle 文件

打开 PowerShell，编辑 `decrypt-bundle.ps1` 顶部的两个变量，指向你自己的游戏路径和密码：

```powershell
$targetDir = "E:\Steam\steamapps\common\KAMITSUBAKI_CITY_ENSEMBLE\KAMITSUBAKI CITY ENSEMBLE_Data\StreamingAssets\aa\StandaloneWindows64"
$password  = "sRWnupn2CUEFvwRAMNhUjm8PYWkX2R7r"
```

然后运行：

```powershell
.\decrypt-bundle.ps1
```

脚本会遍历 `$targetDir` 下所有 `.bundle` 文件，输出解密后的 `*_dec.bundle`。

### 2. 提取剧情文本

把解密后得到的剧情 JSON 文件（形如 `StoryMain_xxxx_xxx_ENSEMBLE_Main.json`、`Mini_xxxx_xxx_ENSEMBLE_Mini.json`）**统一放到脚本同级的 `MonoBehaviour` 目录**：

```
ensemble-story-extractor/
├── decrypt-bundle.ps1
├── export-story.mjs
└── MonoBehaviour/          ← 放剧情 JSON
    ├── StoryMain_0010_001_ENSEMBLE_Main.json
    ├── Mini_0020_005_ENSEMBLE_Mini.json
    └── ...
```

然后运行：

```bash
node export-story.mjs
```

导出结果位于 `Exports/` 下：

```
Exports/
├── main-story/
│   ├── japanese/
│   ├── english/
│   ├── korean/
│   ├── chinese/simplified/
│   └── chinese/traditional/
└── mini-story/
    └── （同上结构）
```

---

## 脚本说明

### decrypt-bundle.ps1

用于**解密该游戏所有被加密的 Unity AssetBundle 文件**。

- **作用范围**：`$targetDir` 下所有 `.bundle` 文件，不限于剧情资源，任何被该加密方案保护的 bundle 都会被处理。
- **输出**：同目录下生成 `原文件名_dec.bundle`。
- **跳过规则**：
  - 已存在 `*_dec.bundle` 的文件会跳过；
  - 文件头已是 `UnityFS`（即明文未加密）会跳过。
- **加密算法**：AES-128-ECB 作为伪随机流，按 16 字节块计数（从 1 开始）生成 keystream，与文件字节逐位异或。
  - Key 由 `PasswordDeriveBytes(password, UTF8(fileName), "SHA1", 100).GetBytes(16)` 派生，其中 `fileName` 是**不带扩展名**的文件名。
- **依赖**：内嵌 C# 类 `BundleDecryptor`，通过 `Add-Type -Language CSharp` 编译，无需额外 DLL。

> ⚠️ **注意**
> - `$password` 是游戏内置的固定密钥，随游戏版本可能变化；若解密后文件头不是 `UnityFS`，请检查密码或文件名是否匹配。
> - 脚本会**原地**在 `$targetDir` 生成 `_dec.bundle`，请确保磁盘空间充足，或先备份原目录。

### export-story.mjs

用于从解密后的剧情 JSON 中提取文本，按语言、分类导出为 `.txt`。

#### 输入

- 目录：脚本同级的 `MonoBehaviour/`
- 文件：`.json`
- 同名副本（如 `xxx.json` 与 `xxx(1).json`）会**自动配对**，按「原文件 → `(1)` → `(2)`…」的优先级选取**第一个包含有效剧情文本**的文件。

#### 支持的剧情分类

根据文件名自动识别：

| 文件名包含 | 导出子目录 |
| --- | --- |
| `Main` | `main-story` |
| `Mini` | `mini-story` |

#### 支持的语言

| JSON 字段 | 导出子目录 |
| --- | --- |
| `Japanese` | `japanese` |
| `English` | `english` |
| `Korean` | `korean` |
| `ChineseSimplified` | `chinese/simplified` |
| `ChineseTraditional` | `chinese/traditional` |

#### 输出

- 目录：`Exports/<分类>/<语言>/`
- 文件名：从原文件名提取前两组数字，例如 `StoryMain_0010_001_ENSEMBLE_Main.json` → `0010_001.txt`
- 格式：每行一条对话，格式为 `说话人: 内容`，内容中的换行会被转义为 `\n`。

#### 文本匹配规则

只提取符合以下格式的行：

```
<キャラ表現:...><キャラフェイドイン:...><テキストキャラ:说话人>内容
```

匹配后输出为：

```
说话人: 内容
```

不符合该格式的行（如旁白、系统提示、无角色标签的文本）会被忽略。

---

## 附录：逆向笔记（如何提取 Password 与算法）

如果你对 `$password` 和加密算法的来源感兴趣，以下是完整的逆向分析记录：

### 1. 发现加密的 Bundle
游戏目录下的 `.bundle` 文件（如 `characters_assets_all_xxx.bundle`）没有标准的 `UnityFS` 文件头，且整体呈现高熵状态（大概率被加密）。

### 2. 定位解密入口
通过进程监控工具（如 Process Monitor）记录游戏读取文件时的调用栈，发现最终调用了 `ntoskrnl.exe` 和 `FLTMGR.SYS`（文件系统驱动）。同时结合 IL2CPP 游戏的特征，定位到 `GameAssembly.dll`。

### 3. 分析解密逻辑
使用 **IL2CppDumper** 导出 `DummyDll`，在 `dnSpyEx` 中全局搜索 `LoadFrom`、`Decrypt` 等关键字。发现游戏使用了自定义的 `SeekableAesStream`（位于命名空间 `UnityEngine.ResourceManagement.ResourceProviders`），该类继承了 Unity Addressables 的资源加载机制。

### 4. 提取密码与算法
将 `GameAssembly.dll` 载入 IDA Pro 9.2，结合 `Il2CppDumper` 生成的符号脚本，反编译 `SeekableAesStream` 的构造函数和相关方法。分析得出：
- **密码常量**：在 `SeekableAesStream` 类的私有常量字段中直接找到了明文字符串 `sRWnupn2CUEFvwRAMNhUjm8PYWkX2R7r`。
- **密钥派生**：游戏使用 `System.Security.Cryptography.PasswordDeriveBytes`，以**文件名（不带扩展名）的 UTF-8 字节**作为盐（Salt），通过 SHA1 迭代 100 次，生成 16 字节的 AES Key。
- **加密模式**：使用 `AesManaged` 的 **ECB 模式**（填充方式为 PKCS7），并以 16 字节为一个块，将块索引（从 1 开始的 int64，小端序，后面补 0 凑齐 16 字节）作为 Counter，进行类似 CTR 模式的异或操作。

### 5. 编写解密脚本
由于游戏为每个 bundle 都使用其文件名作为 Salt，因此**每个文件的 AES Key 都是动态生成的**。最终的 `decrypt-bundle.ps1` 通过内联 C# 代码直接调用 .NET 原生加密库，完美复现了游戏的解密逻辑。

> 有趣的是，该加密机制仅存在于 Windows (Steam) 版本，Android 版本似乎未作任何加密。

---

## 目录结构

```
ensemble-story-extractor/
├── decrypt-bundle.ps1          # Step 1：解密所有 .bundle
├── export-story.mjs            # Step 2：提取剧情文本
├── README.md
├── MonoBehaviour/              # 输入：剧情 JSON（手动放置）
└── Exports/                    # 输出：导出的 .txt（自动生成）
    ├── main-story/
    │   ├── japanese/
    │   ├── english/
    │   ├── korean/
    │   └── chinese/{simplified,traditional}/
    └── mini-story/
        └── ...
```

---

## 常见问题

**Q: 解密后的文件头不是 `UnityFS`？**
A: 检查 `$password` 是否与当前游戏版本匹配；确认 `fileName` 传入的是不带扩展名的文件名（脚本已自动处理）；确认源文件确实是加密的（明文会被自动跳过）。

**Q: `export-story.mjs` 报「所有候选文件均无有效数据」？**
A: 该剧情文件里没有任何一行能匹配 `TEXT_REGEX`。常见原因：文件本身是空壳（只有结构无文本）、文本格式与预期不符、或者该语言字段全部为空。可以手动打开 JSON 抽查 `m_sheet[0].row[*].Japanese` 的格式。

**Q: 警告「缺少语言 English 的文本」？**
A: 该 JSON 的 `English` 字段为空，或英文行的格式与日文不一致（例如缺少 `<キャラ表現:...>` 前缀）。属于数据问题，不是脚本 bug。

**Q: 为什么有些文件被跳过了？**
A: 三种情况：① 文件已解密（`*_dec.bundle` 存在）；② 文件本身就是明文（`UnityFS`）；③ 剧情 JSON 中无可解析文本。

**Q: 可以只解密某一个 bundle 吗？**
A: 可以把 `$targetDir` 指向单个文件所在目录，或临时把 `-Filter` 改为更精确的模式。脚本默认处理整个目录。

---

## 免责声明

本项目仅用于**个人学习、文本整理与本地化研究**。游戏素材版权归原作者及发行商所有，请勿将导出的文本用于二次分发或商业用途。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 获取当前脚本所在的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 所有剧情文件统一放在当前目录下的 MonoBehaviour
const SOURCE_DIR = path.join(__dirname, "MonoBehaviour");

// 语言映射表：[JSON中的字段 key, 相对导出路径]
const LANGUAGE_MAP = [
    { key: "Japanese", outPath: "japanese" },
    { key: "English", outPath: "english" },
    { key: "Korean", outPath: "korean" },
    { key: "ChineseSimplified", outPath: "chinese/simplified" },
    { key: "ChineseTraditional", outPath: "chinese/traditional" },
];

// 正则表达式
const TEXT_REGEX = new RegExp(
    "^<キャラ表現:(?<expression>[^>]+)><キャラフェイドイン:(?<fade_in>[^>]+)>" +
    "<テキストキャラ:(?<speaker>[^>]+)>(?<content>[^]*)$"
);

/**
 * 从文件名推断剧情分类
 * 例如 StoryMain_0010_001_ENSEMBLE.json -> main-story
 */
function getStoryType(filename) {
    if (/Main/i.test(filename)) return "main-story";
    if (/Mini/i.test(filename)) return "mini-story";
    return null;
}

/**
 * 去掉 (1)/(2) 之类的副本后缀，用于把同名副本聚到一起
 * StoryMain_0010_001_ENSEMBLE(1).json -> StoryMain_0010_001_ENSEMBLE.json
 */
function getBaseKey(filename) {
    return filename.replace(/\(\d+\)\.json$/i, ".json");
}

/**
 * 副本文件优先级：原文件 0，(1) 为 2，(2) 为 3 ……（数字越小越优先）
 */
function getPriority(file, baseKey) {
    if (file === baseKey) return 0;
    const m = file.match(/\((\d+)\)\.json$/i);
    return m ? Number(m[1]) + 1 : 999;
}

/**
 * 读取 JSON 并判断是否含有可解析的剧情文本
 * 有则返回 rows，无则返回 null
 */
async function loadJsonRowsWithData(filePath) {
    try {
        const rawData = await fs.readFile(filePath, "utf-8");
        const storyData = JSON.parse(rawData);
        const rows = storyData?.m_sheet?.[0]?.row;

        if (!Array.isArray(rows) || rows.length === 0) return null;

        // 只要任一语言字段中存在可解析的文本，就认为该文件有数据
        const hasText = rows.some((item) =>
            LANGUAGE_MAP.some(({ key }) => {
                const text = item?.[key];
                return typeof text === "string" && TEXT_REGEX.test(text);
            })
        );

        return hasText ? rows : null;
    } catch (err) {
        // 解析失败视为无效文件
        return null;
    }
}

/**
 * 解析并提取剧情文本
 */
function parseStoryText(rows, langKey) {
    if (!Array.isArray(rows)) return "";

    return rows
        .map((item) => {
            const text = item?.[langKey];
            if (typeof text !== "string") return null;
            return text.match(TEXT_REGEX);
        })
        .filter(Boolean)
        .map(({ groups }) => `${groups.speaker}: ${groups.content.replaceAll("\n", "\\n")}`)
        .join("\n");
}

/**
 * 提取文件名前两组数字，例如 StoryMain_0010_001_ENSEMBLE.json -> 0010_001.txt
 */
function getOutputFilename(originalFilename) {
    const match = originalFilename.match(/(\d+_\d+)/);
    if (match) {
        return `${match[1]}.txt`;
    }
    return `${path.basename(originalFilename, ".json")}.txt`;
}

async function processStories() {
    // 检查目录是否存在
    try {
        await fs.access(SOURCE_DIR);
    } catch {
        console.log(`[跳过] 目录不存在: ${SOURCE_DIR}`);
        return;
    }

    const files = (await fs.readdir(SOURCE_DIR)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
        console.log(`[跳过] 目录中没有 JSON 文件: ${SOURCE_DIR}`);
        return;
    }

    // 按 baseKey 分组，把 xxx.json 与 xxx(1).json 视为同一组
    const groups = new Map();
    for (const file of files) {
        const key = getBaseKey(file);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(file);
    }

    console.log(`共找到 ${files.length} 个 JSON 文件，合并后为 ${groups.size} 组剧情...`);

    for (const [baseKey, candidates] of groups) {
        const type = getStoryType(baseKey);
        if (!type) {
            console.warn(`[警告] 无法识别剧情分类，跳过: ${baseKey}`);
            continue;
        }

        // 组内按优先级排序：原文件优先，然后 (1)、(2) ...
        candidates.sort((a, b) => getPriority(a, baseKey) - getPriority(b, baseKey));

        // 依次尝试，选第一个真正有数据的文件
        let rows = null;
        let chosenFile = null;
        for (const file of candidates) {
            const result = await loadJsonRowsWithData(path.join(SOURCE_DIR, file));
            if (result) {
                rows = result;
                chosenFile = file;
                break;
            }
        }

        if (!rows) {
            console.warn(`[警告] 所有候选文件均无有效数据: ${baseKey}`);
            continue;
        }

        console.log(`[处理] ${baseKey} -> 使用文件 ${chosenFile}`);

        const outputFileName = getOutputFilename(chosenFile);

        // 针对每种语言生成对应的导出文件
        for (const { key: langKey, outPath } of LANGUAGE_MAP) {
            const parsedContent = parseStoryText(rows, langKey);

            if (!parsedContent) {
                console.warn(`[警告] ${chosenFile} 缺少语言 ${langKey} 的文本`);
                continue;
            }

            const targetDir = path.join(__dirname, "Exports", type, outPath);
            const targetFilePath = path.join(targetDir, outputFileName);

            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(targetFilePath, parsedContent, "utf-8");
        }
    }

    console.log("全量剧情导出完成！");
}

processStories().catch(console.error);